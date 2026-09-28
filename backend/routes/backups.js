// backend/routes/backups.js
// ============================================================
// Backups — generación, descarga, restauración, configuración
// ------------------------------------------------------------
// Endpoints:
//   GET    /                        → listar backups (metadata)
//   GET    /storage-stats           → diagnóstico del storage (inline vs GridFS)
//   GET    /download-now            → generar y descargar YA (sin persistir)
//   POST   /                        → crear y guardar backup
//   GET    /:id/download            → descargar backup existente
//   POST   /:id/restore             → restaurar backup existente
//   DELETE /:id                     → eliminar backup (y su archivo GridFS)
//   GET    /config                  → leer config de backups
//   PUT    /config                  → actualizar config
//
// 🆕 REFACTOR 2025-XX — STREAMING + GRIDFS
// ------------------------------------------------------------
// Los backups que superan `limiteBackupBytes` (15 MB por default)
// ya NO se rechazan con 413. Ahora caen automáticamente a GridFS:
//
//   - Backups pequeños  → `{ contenido: Binary(Buffer) }` (inline)
//   - Backups grandes   → `{ gridfs_id: ObjectId }` + metadata
//
// Ventajas:
//   - Memoria del server constante (streaming).
//   - Sin límite de 16 MB por documento Mongo.
//   - Descarga HTTP sin buffer intermedio.
//   - Transparente para el usuario (mismo endpoint, mismo JSON).
//
// El campo discriminante es `storage` en el doc de `backups`:
//   - `inline`  → backup viejo o pequeño
//   - `gridfs`  → backup nuevo grande
//
// Seguridad (sin cambios):
//   - Snapshot automático pre-restauración (rollback ante error).
//   - Confirmación textual obligatoria antes de restaurar.
//   - Headers `Cache-Control: no-store` + `X-Content-Type-Options: nosniff`.
//   - `Content-Disposition` RFC 5987 (nombres con acentos/espacios).
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');
const log = require('../utils/logger');
const {
  generarBackup,
  comprimirBackupAsync,
  descomprimirBackup,
  restaurarBackup,
  calcularTamano,
  extraerBufferContenido,
  generarBackupAGridFS,
  eliminarBackupDeGridFS,
  obtenerBufferBackup,
  streamearBackupAResponse
} = require('../utils/backup');

// ============================================================
// CONFIGURACIÓN
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  col: 'backups',
  colConfig: 'backup_config',

  /** Retención por defecto de backups automáticos. */
  retencionAutomaticosDefault: envNum('BACKUP_RETENCION_DEFAULT', 30),
  /** Retención máxima permitida (protege la BD de un valor absurdo). */
  retencionAutomaticosMax: envNum('BACKUP_RETENCION_MAX', 365),
  /** Retención de snapshots pre-restauración. */
  retencionPreRestore: envNum('BACKUP_RETENCION_PRE_RESTORE', 10),

  /**
   * Límite de tamaño para guardar el backup INLINE en Mongo.
   * Si el backup comprimido supera este valor, cae a GridFS.
   * (16 MB es el límite duro de Mongo por documento; dejamos margen.)
   */
  limiteBackupBytes: envNum('BACKUP_LIMITE_BYTES', 15 * 1024 * 1024),

  /**
   * Umbral a partir del cual SIEMPRE usamos GridFS, incluso si
   * cabría inline. Esto evita docs gigantes que ralentizan las
   * queries sobre `backups`.
   */
  umbralPreferirGridFS: envNum('BACKUP_UMBRAL_GRIDFS', 5 * 1024 * 1024),

  /** Máx. backups devueltos en el listado. */
  maxListado: envNum('BACKUP_MAX_LISTADO', 100),

  /** Cron por defecto. */
  cronDefault: process.env.BACKUP_CRON_DEFAULT || '0 3 * * *',
  /** Cron: 5 campos separados por espacios (validación superficial). */
  cronRegex: /^(\S+\s+){4}\S+$/,

  /** Confirmación textual exacta para restaurar. */
  confirmacionRestore: 'CONFIRMAR RESTAURACION',

  /** Nombre del bucket de GridFS (debe coincidir con utils/backup.js). */
  gridfsBucket: process.env.BACKUP_GRIDFS_BUCKET || 'backups_fs'
});

const TIPOS_VALIDOS = Object.freeze(new Set(['manual', 'automatico', 'pre-restore']));

// ============================================================
// HELPERS
// ============================================================

/** Fuerza string (evita `?campo[$ne]=x`). */
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

/** Escapa un nombre para usarlo como filename ASCII. */
function sanitizeFilename(name, fallback = 'backup') {
  const base = String(name || '').trim().replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 150);
  return base || fallback;
}

/** Construye un `Content-Disposition` seguro (RFC 5987 + fallback ASCII). */
function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Setea headers de descarga binaria segura (para descargas directas). */
function headersDescarga(res, filename, length) {
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', contentDisposition(filename));
  if (Number.isFinite(length)) {
    res.setHeader('Content-Length', String(length));
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

/** Auditoría que nunca rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar backup');
  }
}

/**
 * Proyecta un backup SIN el contenido inline ni el gridfs_id.
 * Añade metadata `storage` y `bytes_storage` para que el frontend
 * sepa dónde vive el binario.
 */
function sinContenido(backup) {
  if (!backup) return backup;
  const { contenido, gridfs_id, ...rest } = backup;

  const tieneInline = Boolean(contenido);
  const tieneGridFs = Boolean(gridfs_id);

  rest.storage = tieneGridFs ? 'gridfs' : (tieneInline ? 'inline' : 'vacio');
  rest.bytes_storage = Number(rest.tamano_comprimido) || null;

  return rest;
}

/** Resumen de colecciones del snapshot (nombre + cantidad). */
function resumenColecciones(snapshot) {
  return Object.keys(snapshot.colecciones || {})
    .filter(k => !k.startsWith('__'))
    .map(k => ({
      nombre: k,
      cantidad: (snapshot.colecciones[k] || []).length
    }));
}

/** Valida ObjectId o lanza error 400. */
function requireObjectId(id) {
  if (!ObjectId.isValid(id)) {
    const err = new Error('ID inválido');
    err.status = 400;
    err.codigo = 'ID_INVALIDO';
    throw err;
  }
  return new ObjectId(id);
}

/**
 * Decide el modo de storage óptimo según el tamaño del buffer.
 * @param {number} bytes
 * @returns {'inline' | 'gridfs'}
 */
function elegirStorage(bytes) {
  if (bytes > CONFIG.limiteBackupBytes) return 'gridfs';
  if (bytes > CONFIG.umbralPreferirGridFS) return 'gridfs';
  return 'inline';
}

// ============================================================
// RETENCIÓN
// ============================================================
async function obtenerRetencion(db) {
  const cfg = await db.collection(CONFIG.colConfig).findOne({ _id: 'global' });
  const ret = parseInt(cfg?.retencion, 10);
  if (Number.isFinite(ret) && ret > 0 && ret <= CONFIG.retencionAutomaticosMax) return ret;
  return CONFIG.retencionAutomaticosDefault;
}

/**
 * Aplica rotación sobre los backups de un tipo dado.
 * Mantiene los `retencion` más recientes y elimina el resto.
 * También limpia los archivos de GridFS asociados.
 */
async function aplicarRotacion(db, tipo, retencion) {
  if (!retencion || retencion <= 0) return 0;

  try {
    const sobrantes = await db.collection(CONFIG.col)
      .find({ tipo })
      .sort({ fecha: -1 })
      .skip(retencion)
      .project({ _id: 1, gridfs_id: 1 })
      .toArray();

    if (sobrantes.length === 0) return 0;

    // Borrar cada backup (helper hace cascada a GridFS)
    let eliminados = 0;
    for (const s of sobrantes) {
      try {
        await eliminarBackupCompleto(db, s);
        eliminados++;
      } catch (e) {
        log.warn(
          { err: e.message, backupId: String(s._id) },
          'Error borrando backup en rotación'
        );
      }
    }

    return eliminados;
  } catch (err) {
    log.warn({ err: err.message, tipo }, 'Rotación de backups falló');
    return 0;
  }
}

/**
 * Elimina un backup + su archivo GridFS asociado.
 * @param {object} db
 * @param {{ _id: ObjectId, gridfs_id?: ObjectId }} backupRef
 * @returns {Promise<boolean>}
 */
async function eliminarBackupCompleto(db, backupRef) {
  if (!backupRef || !backupRef._id) return false;

  // 1. Si tiene gridfs_id, borrar el archivo binario PRIMERO.
  //    Si falla, no borramos el doc → quedan "huérfanos" detectables.
  if (backupRef.gridfs_id) {
    const ok = await eliminarBackupDeGridFS(db, backupRef.gridfs_id);
    if (!ok) {
      log.warn(
        { backupId: String(backupRef._id), gridfsId: String(backupRef.gridfs_id) },
        'No se pudo borrar el archivo GridFS (puede que ya no exista)'
      );
    }
  }

  // 2. Borrar el documento de metadata.
  const r = await db.collection(CONFIG.col).deleteOne({ _id: backupRef._id });
  return r.deletedCount > 0;
}

// ============================================================
// LISTAR BACKUPS (metadata)
// ============================================================
router.get('/', requierePermiso('backups', 'ver'), async (req, res, next) => {
  try {
    const tipo = soloString(req.query.tipo);
    const match = {};
    if (tipo && TIPOS_VALIDOS.has(tipo)) match.tipo = tipo;

    // Proyectamos fuera `contenido` y `gridfs_id` (grandes).
    const backups = await req.db.collection(CONFIG.col)
      .find(match, { projection: { contenido: 0 } })
      .sort({ fecha: -1 })
      .limit(CONFIG.maxListado)
      .toArray();

    res.set('Cache-Control', 'no-store');
    return res.json(backups.map(sinContenido));
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// STORAGE STATS  → diagnóstico inline vs GridFS
// ============================================================
router.get('/storage-stats', requierePermiso('backups', 'ver'), async (req, res, next) => {
  try {
    const col = req.db.collection(CONFIG.col);

    const [total, inlineCount, gridfsCount, agg] = await Promise.all([
      col.countDocuments({}),
      col.countDocuments({ contenido: { $exists: true, $ne: null } }),
      col.countDocuments({ gridfs_id: { $exists: true, $ne: null } }),
      col.aggregate([
        {
          $group: {
            _id: null,
            bytesTotal: { $sum: '$tamano_comprimido' },
            bytesInline: {
              $sum: {
                $cond: [
                  { $ne: [{ $type: '$contenido' }, 'missing'] },
                  '$tamano_comprimido',
                  0
                ]
              }
            },
            bytesGridFS: {
              $sum: {
                $cond: [
                  { $ne: [{ $type: '$gridfs_id' }, 'missing'] },
                  '$tamano_comprimido',
                  0
                ]
              }
            },
            porTipo: {
              $push: {
                tipo: '$tipo',
                bytes: '$tamano_comprimido'
              }
            }
          }
        }
      ]).toArray()
    ]);

    const a = agg[0] || {};
    const mb = (b) => Number(((Number(b) || 0) / 1024 / 1024).toFixed(2));

    // Contar chunks / files de GridFS para diagnóstico
    let gridfsFilesCount = 0;
    let gridfsFilesBytes = 0;
    try {
      const bucketFiles = req.db.collection(`${CONFIG.gridfsBucket}.files`);
      const [cnt, sizeAgg] = await Promise.all([
        bucketFiles.countDocuments({}),
        bucketFiles.aggregate([
          { $group: { _id: null, total: { $sum: '$length' } } }
        ]).toArray()
      ]);
      gridfsFilesCount = cnt || 0;
      gridfsFilesBytes = sizeAgg[0]?.total || 0;
    } catch (e) {
      log.warn({ err: e.message }, 'No se pudo leer stats de GridFS');
    }

    res.set('Cache-Control', 'no-store');
    return res.json({
      totalBackups: total,
      inline: {
        count: inlineCount,
        bytes: Number(a.bytesInline) || 0,
        mb: mb(a.bytesInline)
      },
      gridfs: {
        count: gridfsCount,
        bytes: Number(a.bytesGridFS) || 0,
        mb: mb(a.bytesGridFS),
        filesCount: gridfsFilesCount,
        filesBytes: gridfsFilesBytes,
        filesMB: mb(gridfsFilesBytes)
      },
      total: {
        bytes: Number(a.bytesTotal) || 0,
        mb: mb(a.bytesTotal)
      },
      limites: {
        limiteBackupBytes: CONFIG.limiteBackupBytes,
        limiteBackupMB: mb(CONFIG.limiteBackupBytes),
        umbralPreferirGridFS: CONFIG.umbralPreferirGridFS,
        umbralPreferirGridFSMB: mb(CONFIG.umbralPreferirGridFS)
      },
      bucket: CONFIG.gridfsBucket
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GENERAR Y DESCARGAR YA (sin persistir) — STREAMING
// ============================================================
router.get('/download-now', requierePermiso('backups', 'ver'), async (req, res, next) => {
  try {
    // Para no cargar TODO en memoria, generamos a un stream temporal en GridFS,
    // lo streameamos al cliente y luego lo borramos.
    //
    // Alternativa más liviana: streaming directo a `res`. Pero entonces no
    // podemos setear Content-Length ni auditar el tamaño exacto. Usamos
    // GridFS como "buffer en disco" temporal.
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const tempFilename = `__download_now_${stamp}_${Date.now()}.json.gz`;

    const { gridfs_id, bytes } = await generarBackupAGridFS(req.db, {
      filename: tempFilename,
      metadata: { tipo: 'download-now', temp: true }
    });

    await auditarSeguro(req.db, req, {
      accion: 'descargar',
      coleccion: CONFIG.col,
      documentoNumero: 'backup-manual',
      detalle: `Backup manual descargado (${(bytes / 1024).toFixed(1)} KB, gridfs)`
    });

    // Enviar streaming al cliente.
    const bucket = new (require('mongodb').GridFSBucket)(req.db, {
      bucketName: CONFIG.gridfsBucket
    });

    const filename = `backup_${stamp}.json.gz`;
    headersDescarga(res, filename, bytes);

    try {
      await new Promise((resolve, reject) => {
        const stream = bucket.openDownloadStream(gridfs_id);
        stream.on('error', reject);
        stream.on('end', resolve);
        stream.pipe(res);
      });
    } finally {
      // Limpieza: borrar el archivo temporal apenas termine la descarga.
      // No bloqueamos la respuesta por esto.
      eliminarBackupDeGridFS(req.db, gridfs_id).catch(e => {
        log.warn({ err: e.message }, 'No se pudo borrar backup temporal de GridFS');
      });
    }
    return undefined;
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// CREAR Y GUARDAR BACKUP EN BD (inline o GridFS según tamaño)
// ============================================================
router.post('/', requierePermiso('backups', 'crear'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const nombreIn = soloString(body.nombre);
    const tipo = soloString(body.tipo) || 'manual';
    const descripcion = soloString(body.descripcion) || '';

    if (!TIPOS_VALIDOS.has(tipo)) {
      return res.status(400).json({
        error: `Tipo inválido. Valores permitidos: ${[...TIPOS_VALIDOS].join(', ')}`,
        codigo: 'TIPO_INVALIDO'
      });
    }
    if (nombreIn && nombreIn.length > 200) {
      return res.status(400).json({
        error: 'El nombre no puede superar 200 caracteres',
        codigo: 'NOMBRE_DEMASIADO_LARGO'
      });
    }
    if (descripcion.length > 500) {
      return res.status(400).json({
        error: 'La descripción no puede superar 500 caracteres',
        codigo: 'DESCRIPCION_DEMASIADO_LARGA'
      });
    }

    const nombreFinal = nombreIn || `Backup ${tipo} del ${new Date().toLocaleString('es-EC')}`;
    const ahora = new Date();

    // ---- 1. Snapshot in-memory (para tener metadata y contar colecciones) ----
    //      Si el resultado es muy grande, el snapshot se descarta y
    //      generamos una segunda vez con streaming a GridFS.
    //      Es un doble cómputo, pero solo ocurre en backups grandes
    //      que de todos modos se mueven a GridFS.
    const snapshot = await generarBackup(req.db, { silenciarWarningGrande: true });
    const tamanoSinComprimir = calcularTamano(snapshot);
    const colecciones = resumenColecciones(snapshot);

    // Serializamos UNA sola vez y reutilizamos para comprimir y medir.
    const json = JSON.stringify(snapshot);
    const buffer = await comprimirBackupAsync(snapshot, { yaSerializado: json });

    // Ayuda al GC: el snapshot ya no se necesita.
    // (No lo forzamos, solo quitamos la referencia.)
    // eslint-disable-next-line no-unused-vars
    const _snapshotRef = null;

    const modoStorage = elegirStorage(buffer.length);

    // ---- 2a. Guardar INLINE ----
    if (modoStorage === 'inline') {
      const backup = {
        nombre: nombreFinal,
        tipo,
        descripcion,
        fecha: ahora,
        usuario_id: new ObjectId(req.user.userId),
        usuario_email: req.user.email,
        tamano_sin_comprimir: tamanoSinComprimir,
        tamano_comprimido: buffer.length,
        contenido: buffer,
        storage: 'inline',
        colecciones
      };

      const result = await req.db.collection(CONFIG.col).insertOne(backup);

      if (tipo === 'automatico') {
        const retencion = await obtenerRetencion(req.db);
        aplicarRotacion(req.db, 'automatico', retencion).catch(() => {});
      } else if (tipo === 'pre-restore') {
        aplicarRotacion(req.db, 'pre-restore', CONFIG.retencionPreRestore).catch(() => {});
      }

      await auditarSeguro(req.db, req, {
        accion: 'crear',
        coleccion: CONFIG.col,
        documentoId: result.insertedId,
        documentoNumero: backup.nombre,
        detalle: `Backup creado (inline): ${backup.nombre} (${(buffer.length / 1024).toFixed(1)} KB)`
      });

      return res.status(201).json({ _id: result.insertedId, ...sinContenido(backup) });
    }

    // ---- 2b. Guardar en GRIDFS (backup grande) ----
    //
    // Volvemos a generar para NO retener el snapshot in-memory durante
    // todo el pipeline de subida a GridFS. Es un doble cómputo pero
    // libera RAM crítico cuando más se necesita.
    //
    // Optimización futura: podríamos reutilizar `json` como fuente y
    // gzipear el string a GridFS. Por ahora priorizamos memoria.
    const { gridfs_id, filename: gfsFilename, bytes: bytesGridFs } =
      await generarBackupAGridFS(req.db, {
        filename: `${sanitizeFilename(nombreFinal, 'backup')}_${Date.now()}.json.gz`,
        metadata: {
          tipo,
          nombre: nombreFinal,
          usuario_email: req.user.email,
          usuario_id: String(req.user.userId)
        }
      });

    const backup = {
      nombre: nombreFinal,
      tipo,
      descripcion,
      fecha: ahora,
      usuario_id: new ObjectId(req.user.userId),
      usuario_email: req.user.email,
      tamano_sin_comprimir: tamanoSinComprimir,
      tamano_comprimido: bytesGridFs,
      gridfs_id,
      gridfs_filename: gfsFilename,
      storage: 'gridfs',
      colecciones
    };

    const result = await req.db.collection(CONFIG.col).insertOne(backup);

    if (tipo === 'automatico') {
      const retencion = await obtenerRetencion(req.db);
      aplicarRotacion(req.db, 'automatico', retencion).catch(() => {});
    } else if (tipo === 'pre-restore') {
      aplicarRotacion(req.db, 'pre-restore', CONFIG.retencionPreRestore).catch(() => {});
    }

    await auditarSeguro(req.db, req, {
      accion: 'crear',
      coleccion: CONFIG.col,
      documentoId: result.insertedId,
      documentoNumero: backup.nombre,
      detalle:
        `Backup creado (gridfs): ${backup.nombre} ` +
        `(${(bytesGridFs / 1024 / 1024).toFixed(2)} MB, id=${gridfs_id})`
    });

    return res.status(201).json({ _id: result.insertedId, ...sinContenido(backup) });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// CONFIG (declarado ANTES de /:id/* para evitar ambigüedades)
// ============================================================
router.get('/config', requierePermiso('backups', 'ver'), async (req, res, next) => {
  try {
    let cfg = await req.db.collection(CONFIG.colConfig).findOne({ _id: 'global' });
    if (!cfg) {
      cfg = {
        _id: 'global',
        automatico_habilitado: true,
        cron: CONFIG.cronDefault,
        retencion: CONFIG.retencionAutomaticosDefault,
        ultima_ejecucion: null
      };
      await req.db.collection(CONFIG.colConfig).insertOne(cfg);
    }
    return res.json(cfg);
  } catch (err) {
    return next(err);
  }
});

router.put('/config', requierePermiso('backups', 'crear'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const update = { updatedAt: new Date() };

    if (body.automatico_habilitado !== undefined) {
      if (typeof body.automatico_habilitado !== 'boolean') {
        return res.status(400).json({
          error: 'automatico_habilitado debe ser booleano',
          codigo: 'TIPO_INVALIDO'
        });
      }
      update.automatico_habilitado = body.automatico_habilitado;
    }

    if (body.cron !== undefined) {
      const cron = soloString(body.cron);
      if (!cron || !CONFIG.cronRegex.test(cron.trim())) {
        return res.status(400).json({
          error: 'Expresión cron inválida (se esperan 5 campos separados por espacios)',
          codigo: 'CRON_INVALIDO'
        });
      }
      update.cron = cron.trim();
    }

    if (body.retencion !== undefined) {
      const ret = Number(body.retencion);
      if (!Number.isInteger(ret) || ret < 1 || ret > CONFIG.retencionAutomaticosMax) {
        return res.status(400).json({
          error: `retencion debe ser un entero entre 1 y ${CONFIG.retencionAutomaticosMax}`,
          codigo: 'RETENCION_INVALIDA'
        });
      }
      update.retencion = ret;
    }

    if (Object.keys(update).length === 1) {
      return res.status(400).json({
        error: 'No se envió ningún campo actualizable',
        codigo: 'SIN_CAMBIOS'
      });
    }

    await req.db.collection(CONFIG.colConfig).updateOne(
      { _id: 'global' },
      { $set: update },
      { upsert: true }
    );

    const cfg = await req.db.collection(CONFIG.colConfig).findOne({ _id: 'global' });

    await auditarSeguro(req.db, req, {
      accion: 'actualizar',
      coleccion: CONFIG.colConfig,
      documentoNumero: 'global',
      datosNuevos: update,
      detalle: 'Configuración de backups actualizada'
    });

    try {
      const { reiniciarScheduler } = require('../utils/backupScheduler');
      await reiniciarScheduler();
    } catch (e) {
      log.warn({ err: e.message }, 'No se pudo reiniciar scheduler de backups');
    }

    return res.json(cfg);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// DESCARGAR UN BACKUP EXISTENTE (streaming inline o GridFS)
// ============================================================
router.get('/:id/download', requierePermiso('backups', 'ver'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id);

    const backup = await req.db.collection(CONFIG.col).findOne({ _id });
    if (!backup) {
      return res.status(404).json({ error: 'Backup no encontrado', codigo: 'BACKUP_NOT_FOUND' });
    }

    // Detectar storage y preparar filename
    const filename = `${sanitizeFilename(backup.nombre, `backup_${backup._id}`)}.json.gz`;

    await auditarSeguro(req.db, req, {
      accion: 'descargar',
      coleccion: CONFIG.col,
      documentoId: backup._id,
      documentoNumero: backup.nombre,
      detalle: `Backup descargado (${backup.storage || 'inline'}): ${backup.nombre}`
    });

        // Usar el helper de streaming que maneja ambos casos.
    // ⚠️  DEBE ir con `await`: si no, los errores async del stream
    //     escapan al try/catch y quedan como unhandledRejection.
    await streamearBackupAResponse(req.db, backup, res, { filename });
    return;
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// RESTAURAR UN BACKUP EXISTENTE
// ============================================================
router.post('/:id/restore', requierePermiso('backups', 'restaurar'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const { confirmacion, crearSnapshot = true } = body;

    if (confirmacion !== CONFIG.confirmacionRestore) {
      return res.status(400).json({
        error: `Debe enviar la confirmación exacta: "${CONFIG.confirmacionRestore}"`,
        codigo: 'CONFIRMACION_INVALIDA'
      });
    }

    const _id = requireObjectId(req.params.id);

    const backup = await req.db.collection(CONFIG.col).findOne({ _id });
    if (!backup) {
      return res.status(404).json({ error: 'Backup no encontrado', codigo: 'BACKUP_NOT_FOUND' });
    }

    // ---- 1. Obtener buffer (funciona con inline y GridFS) ----
    let buffer;
    try {
      buffer = await obtenerBufferBackup(req.db, backup);
    } catch (e) {
      log.warn(
        { err: e.message, backupId: String(backup._id), storage: backup.storage },
        'Error leyendo contenido del backup para restaurar'
      );
      return res.status(500).json({
        error: 'El contenido del backup no se pudo leer',
        codigo: 'BACKUP_CORRUPTO'
      });
    }

    if (!buffer) {
      return res.status(500).json({
        error: 'El contenido del backup está corrupto o en un formato no soportado',
        codigo: 'BACKUP_CORRUPTO'
      });
    }

    // ---- 2. Snapshot de seguridad ANTES de restaurar ----
    let snapshotPreId = null;
    let snapshotAviso = null;
    if (crearSnapshot) {
      try {
        const snapActual = await generarBackup(req.db, { silenciarWarningGrande: true });
        const bufSnap = await comprimirBackupAsync(snapActual);

        const modoSnap = elegirStorage(bufSnap.length);

        // Aviso si el snapshot NO se guardará inline ni en GridFS por tamaño.
        // (Solo bloqueamos si la combinación excede mucho.)

        const baseDoc = {
          nombre: `Pre-restauración ${new Date().toISOString()}`,
          tipo: 'pre-restore',
          descripcion: `Snapshot automático antes de restaurar "${backup.nombre}"`,
          fecha: new Date(),
          usuario_id: new ObjectId(req.user.userId),
          usuario_email: req.user.email,
          tamano_sin_comprimir: calcularTamano(snapActual),
          tamano_comprimido: bufSnap.length,
          parent_backup_id: backup._id,
          colecciones: resumenColecciones(snapActual)
        };

        if (modoSnap === 'inline') {
          const doc = { ...baseDoc, contenido: bufSnap, storage: 'inline' };
          const r = await req.db.collection(CONFIG.col).insertOne(doc);
          snapshotPreId = r.insertedId;
        } else {
          // Guardar el snapshot pre-restore en GridFS
          const { gridfs_id, filename: gfsFilename } = await generarBackupAGridFS(req.db, {
            filename: `pre-restore_${Date.now()}.json.gz`,
            metadata: {
              tipo: 'pre-restore',
              parent_backup_id: String(backup._id)
            },
            silenciarWarningGrande: true
          });

          const doc = {
            ...baseDoc,
            gridfs_id,
            gridfs_filename: gfsFilename,
            storage: 'gridfs'
          };
          const r = await req.db.collection(CONFIG.col).insertOne(doc);
          snapshotPreId = r.insertedId;
        }

        // Retención de snapshots pre-restore (no bloqueante).
        aplicarRotacion(req.db, 'pre-restore', CONFIG.retencionPreRestore).catch(() => {});
      } catch (e) {
        log.warn({ err: e.message }, 'No se pudo crear snapshot pre-restauración');
        snapshotAviso = 'No se pudo crear snapshot pre-restauración.';
      }
    }

    // ---- 3. Restaurar ----
    const snapshot = descomprimirBackup(buffer);
    const resultados = await restaurarBackup(req.db, snapshot);

    // ---- 4. Auditoría ----
    await auditarSeguro(req.db, req, {
      accion: 'restaurar',
      coleccion: CONFIG.col,
      documentoId: backup._id,
      documentoNumero: backup.nombre,
      detalle:
        `Backup restaurado (${backup.storage || 'inline'}): ${backup.nombre}. ` +
        `Colecciones afectadas: ${resultados.length}. ` +
        `Snapshot pre-restore: ${snapshotPreId || 'ninguno'}`
    });

    return res.json({
      message: 'Backup restaurado correctamente',
      resultados,
      snapshot_pre_restauracion: snapshotPreId,
      aviso: snapshotAviso
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// ELIMINAR UN BACKUP (con cascada a GridFS)
// ============================================================
router.delete('/:id', requierePermiso('backups', 'eliminar'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id);

    const backup = await req.db.collection(CONFIG.col).findOne(
      { _id },
      { projection: { contenido: 0 } }
    );
    if (!backup) {
      return res.status(404).json({ error: 'Backup no encontrado', codigo: 'BACKUP_NOT_FOUND' });
    }

    // Eliminar backup + su archivo GridFS (si aplica).
    const ok = await eliminarBackupCompleto(req.db, backup);
    if (!ok) {
      return res.status(404).json({ error: 'Backup no encontrado', codigo: 'BACKUP_NOT_FOUND' });
    }

    await auditarSeguro(req.db, req, {
      accion: 'eliminar',
      coleccion: CONFIG.col,
      documentoId: backup._id,
      documentoNumero: backup.nombre,
      detalle:
        `Backup eliminado (${backup.storage || 'inline'}): ${backup.nombre}` +
        (backup.gridfs_id ? ` — gridfs_id=${backup.gridfs_id}` : '')
    });

    return res.json({ message: 'Backup eliminado' });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._sanitizeFilename = sanitizeFilename;
module.exports._contentDisposition = contentDisposition;
module.exports._aplicarRotacion = aplicarRotacion;
module.exports._elegirStorage = elegirStorage;
module.exports._eliminarBackupCompleto = eliminarBackupCompleto;
module.exports._sinContenido = sinContenido;