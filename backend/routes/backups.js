// backend/routes/backups.js
// ============================================================
// Backups — generación, descarga, restauración, configuración
// ------------------------------------------------------------
// Endpoints:
//   GET    /                        → listar backups (metadata)
//   GET    /download-now            → generar y descargar YA
//   POST   /                        → crear y guardar backup
//   GET    /:id/download            → descargar backup existente
//   POST   /:id/restore             → restaurar backup existente
//   DELETE /:id                     → eliminar backup
//   GET    /config                  → leer config de backups
//   PUT    /config                  → actualizar config
//
// Seguridad:
//   - Snapshot automático pre-restauración (rollback ante error).
//   - Confirmación textual obligatoria antes de restaurar.
//   - Límite de tamaño en backups guardados en BD (protege el doc 16 MB de Mongo).
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
  comprimirBackup,
  descomprimirBackup,
  restaurarBackup,
  calcularTamano,
  extraerBufferContenido
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
  /** Retención de snapshots pre-restauración (los más recientes se conservan). */
  retencionPreRestore: envNum('BACKUP_RETENCION_PRE_RESTORE', 10),
  /** Límite del buffer comprimido que se guarda EN la BD (Mongo doc ≤ 16 MB). */
  limiteBackupBytes: envNum('BACKUP_LIMITE_BYTES', 15 * 1024 * 1024),
  /** Máx. backups devueltos en el listado. */
  maxListado: envNum('BACKUP_MAX_LISTADO', 100),
  /** Cron por defecto. */
  cronDefault: process.env.BACKUP_CRON_DEFAULT || '0 3 * * *',
  /** Cron: 5 campos separados por espacios (validación superficial). */
  cronRegex: /^(\S+\s+){4}\S+$/,
  /** Confirmación textual exacta para restaurar. */
  confirmacionRestore: 'CONFIRMAR RESTAURACION'
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

/** Setea headers de descarga binaria segura. */
function headersDescarga(res, filename, length) {
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.setHeader('Content-Length', String(length));
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

/** Devuelve un backup sin el campo `contenido` (metadata). */
function sinContenido(backup) {
  if (!backup) return backup;
  const { contenido, ...rest } = backup;
  return rest;
}

/** Valida un backup tiene contenido utilizable. */
function bufferDeBackup(backup) {
  return extraerBufferContenido(backup?.contenido);
}

/** Resumen de colecciones del snapshot (nombre + cantidad). */
function resumenColecciones(snapshot) {
  return Object.keys(snapshot.colecciones || {}).map(k => ({
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
 * No bloquea: se puede llamar sin await.
 */
function aplicarRotacion(db, tipo, retencion) {
  if (!retencion || retencion <= 0) return Promise.resolve(0);
  return db.collection(CONFIG.col)
    .find({ tipo })
    .sort({ fecha: -1 })
    .skip(retencion)
    .project({ _id: 1 })
    .toArray()
    .then(sobrantes => {
      if (sobrantes.length === 0) return 0;
      return db.collection(CONFIG.col)
        .deleteMany({ _id: { $in: sobrantes.map(s => s._id) } })
        .then(r => r.deletedCount || 0);
    })
    .catch(err => {
      log.warn({ err: err.message, tipo }, 'Rotación de backups falló');
      return 0;
    });
}

// ============================================================
// LISTAR BACKUPS (metadata)
// ============================================================
router.get('/', requierePermiso('backups', 'ver'), async (req, res, next) => {
  try {
    const tipo = soloString(req.query.tipo);
    const match = {};
    if (tipo && TIPOS_VALIDOS.has(tipo)) match.tipo = tipo;

    const backups = await req.db.collection(CONFIG.col)
      .find(match, { projection: { contenido: 0 } })
      .sort({ fecha: -1 })
      .limit(CONFIG.maxListado)
      .toArray();

    res.set('Cache-Control', 'no-store');
    return res.json(backups);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GENERAR Y DESCARGAR YA (sin persistir)
// ============================================================
router.get('/download-now', requierePermiso('backups', 'ver'), async (req, res, next) => {
  try {
    const snapshot = await generarBackup(req.db);
    const buffer = comprimirBackup(snapshot);

    await auditarSeguro(req.db, req, {
      accion: 'descargar',
      coleccion: CONFIG.col,
      documentoNumero: 'backup-manual',
      detalle: `Backup manual descargado (${(buffer.length / 1024).toFixed(1)} KB)`
    });

    const filename = `backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json.gz`;
    headersDescarga(res, filename, buffer.length);
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// CREAR Y GUARDAR BACKUP EN BD
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

    const snapshot = await generarBackup(req.db);
    const tamanoSinComprimir = calcularTamano(snapshot);
    const buffer = comprimirBackup(snapshot);

    if (buffer.length > CONFIG.limiteBackupBytes) {
      const mb = (buffer.length / 1024 / 1024).toFixed(2);
      const limiteMb = (CONFIG.limiteBackupBytes / 1024 / 1024).toFixed(0);
      return res.status(413).json({
        error: `El backup es demasiado grande (${mb} MB). El límite es ${limiteMb} MB. ` +
               `Use la descarga directa (/download-now) en su lugar.`,
        codigo: 'BACKUP_DEMASIADO_GRANDE'
      });
    }

    const backup = {
      nombre: nombreIn || `Backup ${tipo} del ${new Date().toLocaleString('es-EC')}`,
      tipo,
      descripcion,
      fecha: new Date(),
      usuario_id: new ObjectId(req.user.userId),
      usuario_email: req.user.email,
      tamano_sin_comprimir: tamanoSinComprimir,
      tamano_comprimido: buffer.length,
      contenido: buffer,
      colecciones: resumenColecciones(snapshot)
    };

    const result = await req.db.collection(CONFIG.col).insertOne(backup);

    // Rotación (solo automáticos; snapshots pre-restore tienen su propia retención).
    if (tipo === 'automatico') {
      const retencion = await obtenerRetencion(req.db);
      // No bloqueante: aplicamos rotación en background.
      aplicarRotacion(req.db, 'automatico', retencion).catch(() => {});
    } else if (tipo === 'pre-restore') {
      aplicarRotacion(req.db, 'pre-restore', CONFIG.retencionPreRestore).catch(() => {});
    }

    await auditarSeguro(req.db, req, {
      accion: 'crear',
      coleccion: CONFIG.col,
      documentoId: result.insertedId,
      documentoNumero: backup.nombre,
      detalle: `Backup creado: ${backup.nombre} (${(buffer.length / 1024).toFixed(1)} KB)`
    });

    return res.status(201).json({ _id: result.insertedId, ...sinContenido(backup) });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// CONFIG (definido ANTES de /:id/* para evitar ambigüedades futuras)
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

    // Reiniciar scheduler (no bloqueante).
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
// DESCARGAR UN BACKUP EXISTENTE
// ============================================================
router.get('/:id/download', requierePermiso('backups', 'ver'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id);

    const backup = await req.db.collection(CONFIG.col).findOne({ _id });
    if (!backup) {
      return res.status(404).json({ error: 'Backup no encontrado', codigo: 'BACKUP_NOT_FOUND' });
    }

    const buffer = bufferDeBackup(backup);
    if (!buffer) {
      return res.status(500).json({
        error: 'El contenido del backup está corrupto o en un formato no soportado',
        codigo: 'BACKUP_CORRUPTO'
      });
    }

    await auditarSeguro(req.db, req, {
      accion: 'descargar',
      coleccion: CONFIG.col,
      documentoId: backup._id,
      documentoNumero: backup.nombre,
      detalle: `Backup descargado: ${backup.nombre}`
    });

    const filename = `${sanitizeFilename(backup.nombre, `backup_${backup._id}`)}.json.gz`;
    headersDescarga(res, filename, buffer.length);
    return res.send(buffer);
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

    const buffer = bufferDeBackup(backup);
    if (!buffer) {
      return res.status(500).json({
        error: 'El contenido del backup está corrupto o en un formato no soportado',
        codigo: 'BACKUP_CORRUPTO'
      });
    }

    // ---- 1. Snapshot de seguridad ANTES de restaurar ----
    let snapshotPreId = null;
    let snapshotAviso = null;
    if (crearSnapshot) {
      try {
        const snapActual = await generarBackup(req.db);
        const bufSnap = comprimirBackup(snapActual);

        if (bufSnap.length > CONFIG.limiteBackupBytes) {
          const mb = (bufSnap.length / 1024 / 1024).toFixed(2);
          const limiteMb = (CONFIG.limiteBackupBytes / 1024 / 1024).toFixed(0);
          snapshotAviso = `Snapshot pre-restauración omitido: el estado actual (${mb} MB) supera el límite de ${limiteMb} MB.`;
        } else {
          const doc = {
            nombre: `Pre-restauración ${new Date().toISOString()}`,
            tipo: 'pre-restore',
            descripcion: `Snapshot automático antes de restaurar "${backup.nombre}"`,
            fecha: new Date(),
            usuario_id: new ObjectId(req.user.userId),
            usuario_email: req.user.email,
            tamano_sin_comprimir: calcularTamano(snapActual),
            tamano_comprimido: bufSnap.length,
            contenido: bufSnap,
            parent_backup_id: backup._id,
            colecciones: resumenColecciones(snapActual)
          };
          const r = await req.db.collection(CONFIG.col).insertOne(doc);
          snapshotPreId = r.insertedId;

          // Retención de snapshots pre-restore (no bloqueante).
          aplicarRotacion(req.db, 'pre-restore', CONFIG.retencionPreRestore).catch(() => {});
        }
      } catch (e) {
        log.warn({ err: e.message }, 'No se pudo crear snapshot pre-restauración');
        snapshotAviso = 'No se pudo crear snapshot pre-restauración.';
      }
    }

    // ---- 2. Restaurar ----
    const snapshot = descomprimirBackup(buffer);
    const resultados = await restaurarBackup(req.db, snapshot);

    // ---- 3. Auditoría ----
    await auditarSeguro(req.db, req, {
      accion: 'restaurar',
      coleccion: CONFIG.col,
      documentoId: backup._id,
      documentoNumero: backup.nombre,
      detalle:
        `Backup restaurado: ${backup.nombre}. ` +
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
// ELIMINAR UN BACKUP
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

    const r = await req.db.collection(CONFIG.col).deleteOne({ _id });
    if (r.deletedCount === 0) {
      return res.status(404).json({ error: 'Backup no encontrado', codigo: 'BACKUP_NOT_FOUND' });
    }

    await auditarSeguro(req.db, req, {
      accion: 'eliminar',
      coleccion: CONFIG.col,
      documentoId: backup._id,
      documentoNumero: backup.nombre,
      detalle: `Backup eliminado: ${backup.nombre}`
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