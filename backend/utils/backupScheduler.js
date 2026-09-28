// backend/utils/backupScheduler.js
// ============================================================
// Scheduler de backups automáticos con node-cron
// ------------------------------------------------------------
// Características:
//   - Lock distribuido (una sola instancia corre a la vez).
//   - Reintentos con backoff exponencial en fallos transitorios.
//   - Timeout global por ejecución (libera el lock si se cuelga).
//   - Alertas por email al Nth fallo consecutivo, con throttle.
//   - Rotación atómica por antigüedad (con cascada a GridFS).
//   - Relee la config de BD antes de cada ejecución.
//   - SIGTERM/SIGINT handler opcional.
//
// 🆕 REFACTOR 2025-XX — RENDER-FRIENDLY
// ------------------------------------------------------------
// El scheduler AHORA soporta dos modos de despliegue:
//
//   A) IN-PROCESS (default en dev, opt-in en prod)
//        BACKUP_SCHEDULER_IN_WEB=true
//      Corre con node-cron dentro del proceso web.
//      ⚠️  En Render free/starter el dyno se DUERME sin tráfico.
//          El cron NO se ejecuta mientras duerme.
//
//   B) CRON EXTERNO (default en prod)
//        BACKUP_SCHEDULER_IN_WEB=false (o no definido con NODE_ENV=production)
//      NO arranca el cron in-process. Debes configurar un Render
//      Cron Job que ejecute:
//        node backend/scripts/backup-manual.js
//      El scheduler loggea las instrucciones al arrancar.
//
// Adicionalmente, los backups que superan el límite inline
// (BACKUP_LIMITE_MB, 15 MB por default) ahora caen AUTOMÁTICAMENTE
// a GridFS, evitando el fallo silencioso por límite de 16 MB.
//
// Toda la metadata del backup (nombre, tipo, descripción, storage)
// es idéntica a la que genera `routes/backups.js`, así el listado
// y la descarga funcionan transparentemente.
//
// API pública (compat total):
//   iniciarScheduler(db)                → arranca/reinicia el cron
//   detenerScheduler()                  → detiene el cron
//   reiniciarScheduler()                → reinicia con la config actual
//   ejecutarBackupAutomatico(db)        → fuerza una ejecución manual
//   detenerSchedulerEnShutdown()        → registra handlers de cierre limpio
// ============================================================
'use strict';

const cron = require('node-cron');
const {
  generarBackup,
  comprimirBackupAsync,
  calcularTamano,
  generarBackupAGridFS,
  eliminarBackupDeGridFS,
  extraerBufferContenido
} = require('./backup');
const { crearTransporter } = require('./emailService');
const log = require('./logger');

// ============================================================
// CONFIGURACIÓN (env-driven)
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(nombre, fallback = false) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * ¿Debe correr el cron in-process?
 *
 * Reglas:
 *   - Si BACKUP_SCHEDULER_IN_WEB está definido → se respeta.
 *   - Si no está definido y NODE_ENV=production → false (usa cron externo).
 *   - Si no está definido y no es prod → true (dev local cómodo).
 */
function resolverSchedulerInWeb() {
  const raw = process.env.BACKUP_SCHEDULER_IN_WEB;
  if (raw !== undefined && raw !== '') {
    return String(raw).trim().toLowerCase() === 'true';
  }
  return !IS_PROD;
}

const CONFIG = Object.freeze({
  colBackups: 'backups',
  colConfig: 'backup_config',
  colLock: 'backup_lock',

  /** Retención por defecto si la config no la especifica. */
  maxAutomaticos: envNum('BACKUP_MAX_AUTOMATICOS', 30),

  /** Retención máxima permitida (protege contra configs absurdas). */
  maxAutomaticosMax: envNum('BACKUP_MAX_AUTOMATICOS_MAX', 365),

  /** Límite del buffer comprimido inline (protege el doc Mongo de 16 MB). */
  limiteSeguroBytes: envNum('BACKUP_LIMITE_MB', 15) * 1024 * 1024,

  /**
   * Umbral a partir del cual SIEMPRE usamos GridFS.
   * Debe coincidir con `routes/backups.js` para consistencia.
   */
  umbralPreferirGridFS: envNum('BACKUP_UMBRAL_GRIDFS', 5 * 1024 * 1024),

  /** Minutos que el lock permanece vigente antes de expirar. */
  lockMinutos: envNum('BACKUP_LOCK_MINUTOS', 30),

  /** Fallos consecutivos antes de enviar la primera alerta. */
  fallosAntesDeAlerta: envNum('BACKUP_ALERTA_DESDE_FALLO', 2),

  /** Re-alertar cada N fallos después del primero. */
  alertaCadaFallos: envNum('BACKUP_ALERTA_CADA_FALLOS', 5),

  /** Throttle anti-spam (ms) — no re-alertar el mismo error antes de esto. */
  alertaThrottleMs: envNum('BACKUP_ALERTA_THROTTLE_MS', 60 * 60 * 1000),

  /** Timeout global de una ejecución (ms). */
  timeoutMs: envNum('BACKUP_TIMEOUT_MS', 5 * 60 * 1000),

  /** Reintentos con backoff para errores transitorios. */
  reintentosMax: envNum('BACKUP_REINTENTOS', 2),

  /** Delay base del backoff (ms) → delay = base * 2^intento. */
  backoffBaseMs: envNum('BACKUP_BACKOFF_BASE_MS', 2000),

  /** Cron por defecto (5 campos). */
  cronDefault: process.env.BACKUP_CRON_DEFAULT || '0 3 * * *',

  /** Zona horaria del scheduler. */
  timezone: process.env.BACKUP_TIMEZONE || 'America/Guayaquil',

  /** Registrar handlers de SIGTERM/SIGINT. */
  shutdownHandlers: envBool('BACKUP_SHUTDOWN_HANDLERS', true),

  /** Bucket de GridFS (debe coincidir con utils/backup.js). */
  gridFsBucket: process.env.BACKUP_GRIDFS_BUCKET || 'backups_fs',

  /** ¿Correr el cron in-process? (ver reglas en resolverSchedulerInWeb). */
  schedulerInWeb: resolverSchedulerInWeb(),

  /** Flag de entorno, para logs. */
  isProd: IS_PROD
});

// Errores transitorios que sí merecen retry.
const ERRORES_TRANSITORIOS = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoTimeoutError'
]);

// ============================================================
// ESTADO GLOBAL (módulo)
// ============================================================
let tareaActiva = null;
let dbGlobal = null;
let enEjecucionLocal = false;
let handlersShutdownRegistrados = false;

// ============================================================
// HELPERS
// ============================================================
/** `true` si el error es transitorio y merece retry. */
function esErrorTransitorio(err) {
  if (!err) return false;
  if (ERRORES_TRANSITORIOS.has(err.name)) return true;
  if (typeof err.code === 'number' && [6, 7, 89, 91, 189, 9001].includes(err.code)) {
    return true;
  }
  return false;
}

/** Timestamp legible para nombres de backup. */
function ahoraLegible() {
  return new Date().toLocaleString('es-EC');
}

/** Sleep con `unref()` para no retener el proceso. */
function dormir(ms) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    if (timer.unref) timer.unref();
  });
}

/** Envuelve una promesa con timeout. */
function conTimeout(promesa, ms, mensaje) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(mensaje || `Timeout después de ${ms}ms`);
      err.codigo = 'BACKUP_TIMEOUT';
      reject(err);
    }, ms);
    if (timer.unref) timer.unref();

    promesa.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

/**
 * Decide el modo de storage óptimo según el tamaño del buffer.
 * Misma lógica que `routes/backups.js` (elegirStorage).
 * @param {number} bytes
 * @returns {'inline' | 'gridfs'}
 */
function decidirModoStorage(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'inline';
  if (bytes > CONFIG.limiteSeguroBytes) return 'gridfs';
  if (bytes > CONFIG.umbralPreferirGridFS) return 'gridfs';
  return 'inline';
}

// ============================================================
// LOCK MANAGER
// ============================================================
const LockManager = Object.freeze({
  async adquirir(db, owner) {
    const ahora = new Date();
    const expira = new Date(ahora.getTime() + CONFIG.lockMinutos * 60 * 1000);

    try {
      const res = await db.collection(CONFIG.colLock).findOneAndUpdate(
        {
          _id: 'backup_lock',
          $or: [
            { expira: { $lt: ahora } },
            { expira: { $exists: false } },
            { owner }
          ]
        },
        {
          $set: { owner, expira, tomado_en: ahora },
          $setOnInsert: { createdAt: ahora }
        },
        { upsert: true, returnDocument: 'after' }
      );

      const doc = res && res.value !== undefined ? res.value : res;
      return doc?.owner === owner;
    } catch (err) {
      if (err.code === 11000) return false;
      throw err;
    }
  },

  async liberar(db, owner) {
    try {
      await db.collection(CONFIG.colLock).updateOne(
        { _id: 'backup_lock', owner },
        { $unset: { owner: '', expira: '' }, $set: { liberado_en: new Date() } }
      );
    } catch (err) {
      log.warn({ err: err.message }, 'No se pudo liberar el lock de backup');
    }
  },

  async renovar(db, owner) {
    try {
      const expira = new Date(Date.now() + CONFIG.lockMinutos * 60 * 1000);
      await db.collection(CONFIG.colLock).updateOne(
        { _id: 'backup_lock', owner },
        { $set: { expira } }
      );
    } catch { /* noop */ }
  }
});

// ============================================================
// EMAILS / ALERTAS
// ============================================================
async function obtenerEmailsAdmin(db) {
  const envList = (process.env.ADMIN_EMAILS || '').trim();
  if (envList) {
    return envList.split(',').map(e => e.trim()).filter(Boolean);
  }
  try {
    const admins = await db.collection('usuarios').find(
      { rol: 'admin', activo: true },
      { projection: { email: 1 } }
    ).limit(5).toArray();
    return admins.map(a => a.email).filter(Boolean);
  } catch (err) {
    log.warn({ err: err.message }, 'No se pudieron obtener admins para alerta');
    return [];
  }
}

function construirCuerpoAlerta(err, fallos, razonSocial) {
  const fecha = new Date().toLocaleString('es-EC');
  return `Se han detectado ${fallos} fallos consecutivos del backup automático.

Detalles:
  · Fecha del último fallo: ${fecha}
  · Error: ${err.message}

Acción recomendada:
  1. Revisar los logs del servidor.
  2. Verificar espacio en disco.
  3. Verificar tamaño de la base de datos.
  4. Revisar el panel de Administración → Backups.
  5. Si el cron corre in-process y el dyno se duerme, migrar
     a un Render Cron Job externo (BACKUP_SCHEDULER_IN_WEB=false).

Sistema: ${razonSocial}
`.trim();
}

async function enviarAlertaFallo(db, err, fallosConsecutivos) {
  const destinatarios = await obtenerEmailsAdmin(db);
  if (destinatarios.length === 0) {
    log.warn('No hay destinatarios para alerta de backup (ADMIN_EMAILS o admins activos)');
    return;
  }

  try {
    const transporter = await crearTransporter();  // ✅
    if (!transporter) {
      log.warn('SMTP no configurado, no se envía alerta de backup');
      return;
    }

    const razonSocial =
      (await db.collection('configuracion').findOne({ _id: 'empresa' }))?.razon_social
      || 'Sistema Contable';

    const asunto = `[ALERTA] Backup automático fallando — ${fallosConsecutivos} fallo(s) consecutivo(s)`;

    await transporter.sendMail({
      from: `"${razonSocial}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: destinatarios.join(', '),
      subject: asunto,
      text: construirCuerpoAlerta(err, fallosConsecutivos, razonSocial)
    });

    log.info({ destinatarios: destinatarios.length }, '📧 Alerta de backup enviada');
  } catch (e) {
    log.warn({ err: e.message }, 'No se pudo enviar la alerta de backup');
  }
}

function debeAlertar(config, fallos) {
  if (fallos < CONFIG.fallosAntesDeAlerta) return false;

  const esPuntoDeAlerta =
    fallos === CONFIG.fallosAntesDeAlerta ||
    (fallos > CONFIG.fallosAntesDeAlerta &&
      (fallos - CONFIG.fallosAntesDeAlerta) % CONFIG.alertaCadaFallos === 0);

  if (!esPuntoDeAlerta) return false;

  if (config?.ultima_alerta) {
    const delta = Date.now() - new Date(config.ultima_alerta).getTime();
    if (delta < CONFIG.alertaThrottleMs) return false;
  }

  return true;
}

// ============================================================
// REGISTRO EN `backup_config`
// ============================================================
async function registrarFallo(db, err) {
  try {
    const ahora = new Date();

    const res = await db.collection(CONFIG.colConfig).findOneAndUpdate(
      { _id: 'global' },
      {
        $set: {
          ultima_ejecucion: ahora,
          ultimo_estado: 'error',
          ultimo_error: String(err.message).slice(0, 500)
        },
        $inc: { fallos_consecutivos: 1 }
      },
      { upsert: true, returnDocument: 'after' }
    );

    const config = res && res.value !== undefined ? res.value : res;
    const fallos = Number(config?.fallos_consecutivos) || 1;

    if (debeAlertar(config, fallos)) {
      await enviarAlertaFallo(db, err, fallos);
      await db.collection(CONFIG.colConfig).updateOne(
        { _id: 'global' },
        { $set: { ultima_alerta: new Date() } }
      );
    }
  } catch (e) {
    log.warn({ err: e.message }, 'No se pudo registrar el fallo de backup');
  }
}

async function registrarExito(db, tamanoBuffer, extra = {}) {
  try {
    await db.collection(CONFIG.colConfig).updateOne(
      { _id: 'global' },
      {
        $set: {
          ultima_ejecucion: new Date(),
          ultimo_estado: 'ok',
          ultimo_tamano: tamanoBuffer,
          ultimo_storage: extra.storage || 'inline',
          fallos_consecutivos: 0,
          ultimo_error: null
        }
      },
      { upsert: true }
    );
  } catch (e) {
    log.warn({ err: e.message }, 'No se pudo registrar el éxito de backup');
  }
}


// ============================================================
// ROTACIÓN (con cascada a GridFS)
// ============================================================
/**
 * Elimina un backup + su archivo GridFS asociado.
 * @param {object} db
 * @param {{ _id: object, gridfs_id?: object }} ref
 * @returns {Promise<boolean>}
 */
async function eliminarBackupCompleto(db, ref) {
  if (!ref || !ref._id) return false;

  if (ref.gridfs_id) {
    const ok = await eliminarBackupDeGridFS(db, ref.gridfs_id);
    if (!ok) {
      log.warn(
        { backupId: String(ref._id), gridfsId: String(ref.gridfs_id) },
        'No se pudo borrar el archivo GridFS (puede que ya no exista)'
      );
    }
  }

  const r = await db.collection(CONFIG.colBackups).deleteOne({ _id: ref._id });
  return r.deletedCount > 0;
}

/**
 * Elimina los backups automáticos más antiguos manteniendo `retencion`.
 * @returns {Promise<number>} cantidad eliminada
 */
async function rotarBackups(db, retencion) {
  if (!retencion || retencion <= 0) return 0;

  try {
    const total = await db.collection(CONFIG.colBackups)
      .countDocuments({ tipo: 'automatico' });

    if (total <= retencion) return 0;

    const sobrantes = await db.collection(CONFIG.colBackups)
      .find({ tipo: 'automatico' })
      .sort({ fecha: 1 })                       // los MÁS VIEJOS primero
      .limit(total - retencion)
      .project({ _id: 1, gridfs_id: 1 })
      .toArray();

    if (sobrantes.length === 0) return 0;

    let eliminados = 0;
    for (const s of sobrantes) {
      try {
        const ok = await eliminarBackupCompleto(db, s);
        if (ok) eliminados++;
      } catch (e) {
        log.warn(
          { err: e.message, backupId: String(s._id) },
          'Error borrando backup en rotación'
        );
      }
    }

    return eliminados;
  } catch (err) {
    log.warn({ err: err.message }, 'Rotación de backups falló');
    return 0;
  }
}

// ============================================================
// EJECUCIÓN DEL BACKUP
// ============================================================
/**
 * Ejecuta el backup con reintentos exponenciales en errores transitorios.
 * @param {Db} db
 * @param {number} intento
 * @returns {Promise<object>} snapshot
 */
async function generarConReintentos(db, intento = 1) {
  try {
    return await conTimeout(
      generarBackup(db, { silenciarWarningGrande: true }),
      CONFIG.timeoutMs,
      `generarBackup excedió ${CONFIG.timeoutMs}ms`
    );
  } catch (err) {
    if (intento < CONFIG.reintentosMax && esErrorTransitorio(err)) {
      const delay = CONFIG.backoffBaseMs * Math.pow(2, intento - 1);
      log.warn(
        { intento, delay, err: err.message },
        `Error transitorio en backup, reintentando (${intento}/${CONFIG.reintentosMax - 1})`
      );
      await dormir(delay);
      return generarConReintentos(db, intento + 1);
    }
    throw err;
  }
}

/**
 * Persiste un backup en `backups`, eligiendo inline o GridFS
 * según el tamaño comprimido.
 *
 * @param {object} db
 * @param {object} args
 * @returns {Promise<{ insertedId, storage, bytes }>}
 */
async function persistirBackup(db, args) {
  const {
    snapshot,
    tipo,
    nombre,
    descripcion
  } = args;

  const tamanoSinComprimir = calcularTamano(snapshot);
  const colecciones = Object.keys(snapshot.colecciones || {})
    .filter(k => !k.startsWith('__'))
    .map(k => ({
      nombre: k,
      cantidad: Array.isArray(snapshot.colecciones[k])
        ? snapshot.colecciones[k].length
        : 0
    }));

  // Serializamos UNA vez y comprimimos async.
  const json = JSON.stringify(snapshot);
  const buffer = await comprimirBackupAsync(snapshot, { yaSerializado: json });
  const bytes = buffer.length;

  const modo = decidirModoStorage(bytes);

  // ---- Caso INLINE ----
  if (modo === 'inline') {
    const backup = {
      nombre,
      tipo,
      descripcion,
      fecha: new Date(),
      usuario_id: null,
      usuario_email: 'sistema',
      tamano_sin_comprimir: tamanoSinComprimir,
      tamano_comprimido: bytes,
      contenido: buffer,
      storage: 'inline',
      colecciones
    };

    const r = await db.collection(CONFIG.colBackups).insertOne(backup);
    return { insertedId: r.insertedId, storage: 'inline', bytes };
  }

  // ---- Caso GRIDFS ----
  // Volvemos a generar para liberar la referencia del snapshot grande
  // ANTES de subirlo a GridFS (evita 2× en RAM en el peor momento).
  const { gridfs_id, filename: gfsFilename, bytes: bytesGridFs } =
    await generarBackupAGridFS(db, {
      filename: `auto_${Date.now()}.json.gz`,
      metadata: {
        tipo,
        nombre,
        generado_por: 'scheduler'
      },
      silenciarWarningGrande: true
    });

  const backup = {
    nombre,
    tipo,
    descripcion,
    fecha: new Date(),
    usuario_id: null,
    usuario_email: 'sistema',
    tamano_sin_comprimir: tamanoSinComprimir,
    tamano_comprimido: bytesGridFs,
    gridfs_id,
    gridfs_filename: gfsFilename,
    storage: 'gridfs',
    colecciones
  };

  const r = await db.collection(CONFIG.colBackups).insertOne(backup);
  return { insertedId: r.insertedId, storage: 'gridfs', bytes: bytesGridFs };
}

/**
 * Ejecuta un backup automático completo.
 * Es seguro llamarla concurrentemente: el lock evita duplicados.
 */
async function ejecutarBackupAutomatico(db) {
  if (!db) {
    log.warn('ejecutarBackupAutomatico sin `db`, se omite');
    return;
  }

  if (enEjecucionLocal) {
    log.info('⏭️  Backup ya en ejecución en este proceso, se omite');
    return;
  }

  // Releer config: permite desactivar sin reiniciar el scheduler.
  let config = await db.collection(CONFIG.colConfig).findOne({ _id: 'global' });
  if (config && config.automatico_habilitado === false) {
    log.info('⏭️  Backups automáticos deshabilitados en BD, se omite');
    return;
  }

  const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let lockTomado = false;

  try {
    lockTomado = await LockManager.adquirir(db, owner);
    if (!lockTomado) {
      log.info('⏭️  Otro worker tiene el lock de backup, se omite');
      return;
    }

    enEjecucionLocal = true;
    const inicio = Date.now();
    log.info('🔄 Ejecutando backup automático...');

    // Heartbeat para evitar expiración del lock en backups largos.
    const heartbeat = setInterval(
      () => LockManager.renovar(db, owner).catch(() => {}),
      Math.max(60_000, CONFIG.lockMinutos * 30_000)
    );
    if (heartbeat.unref) heartbeat.unref();

    try {
      // 1. Snapshot (con reintentos y timeout).
      const snapshot = await generarConReintentos(db);

      // 2. Persistir (inline o GridFS según tamaño).
      const { storage, bytes } = await persistirBackup(db, {
        snapshot,
        tipo: 'automatico',
        nombre: `Backup automático del ${ahoraLegible()}`,
        descripcion: 'Generado por el scheduler'
      });

      // 3. Rotación.
      const retencion = Math.min(
        Number(config?.retencion) || CONFIG.maxAutomaticos,
        CONFIG.maxAutomaticosMax
      );
      const eliminados = await rotarBackups(db, retencion);
      if (eliminados > 0) {
        log.info({ eliminados }, `🗑️  ${eliminados} backups antiguos eliminados`);
      }

      // 4. Registrar éxito.
      await registrarExito(db, bytes, { storage });

      log.info(
        {
          storage,
          kb: (bytes / 1024).toFixed(1),
          ms: Date.now() - inicio
        },
        `✅ Backup automático completado (${storage})`
      );
    } finally {
      clearInterval(heartbeat);
    }
  } catch (err) {
    log.error({ err: err.message }, '❌ Error en backup automático');
    await registrarFallo(db, err);
  } finally {
    if (lockTomado) {
      await LockManager.liberar(db, owner);
    }
    enEjecucionLocal = false;
  }
}

// ============================================================
// SCHEDULER (node-cron)
// ============================================================
/**
 * Crea el documento `backup_config` con defaults si no existe.
 * @returns {Promise<object>} config actual
 */
async function asegurarConfig(db) {
  const existente = await db.collection(CONFIG.colConfig).findOne({ _id: 'global' });
  if (existente) return existente;

  const config = {
    _id: 'global',
    automatico_habilitado: true,
    cron: CONFIG.cronDefault,
    retencion: CONFIG.maxAutomaticos,
    ultima_ejecucion: null,
    ultimo_estado: null,
    ultimo_tamano: null,
    ultimo_storage: null,
    ultimo_error: null,
    fallos_consecutivos: 0,
    createdAt: new Date()
  };

  try {
    await db.collection(CONFIG.colConfig).insertOne(config);
    return config;
  } catch (err) {
    if (err.code === 11000) {
      return db.collection(CONFIG.colConfig).findOne({ _id: 'global' });
    }
    throw err;
  }
}

/** Valida la expresión cron. Devuelve `true`/`false`. */
function validarCron(expr) {
  if (typeof expr !== 'string') return false;
  const partes = expr.trim().split(/\s+/);
  if (partes.length !== 5) return false;
  try {
    return cron.validate(expr);
  } catch {
    return false;
  }
}

/**
 * Arranca o reinicia el scheduler.
 *
 * Si `CONFIG.schedulerInWeb` es `false`, NO arranca el cron y en su
 * lugar loggea las instrucciones para configurar un Render Cron Job.
 *
 * @param {Db} db
 */
async function iniciarScheduler(db) {
  if (!db || typeof db.collection !== 'function') {
    log.error('iniciarScheduler requiere una instancia válida de Db');
    return;
  }

  dbGlobal = db;
  const config = await asegurarConfig(db);

  // Detener tarea previa si existe (reinicio limpio).
  if (tareaActiva) {
    tareaActiva.stop();
    tareaActiva = null;
  }

  // ---- Modo cron externo (recomendado en Render) ----
  if (!CONFIG.schedulerInWeb) {
    log.info(
      {
        isProd: CONFIG.isProd,
        cronConfig: config.cron
      },
      '⏸️  Scheduler in-process DESHABILITADO. ' +
      'Programa un Render Cron Job con: "node backend/scripts/backup-manual.js"'
    );
    return;
  }

  if (!config.automatico_habilitado) {
    log.info('ℹ️  Backups automáticos deshabilitados (config)');
    return;
  }
  if (!validarCron(config.cron)) {
    log.error({ cron: config.cron }, '❌ Expresión cron inválida, scheduler no iniciado');
    return;
  }

  tareaActiva = cron.schedule(
    config.cron,
    () => {
      ejecutarBackupAutomatico(dbGlobal).catch(err => {
        log.error({ err: err.message }, 'Fallo no capturado en scheduler de backup');
      });
    },
    { timezone: CONFIG.timezone }
  );

  log.info(
    {
      cron: config.cron,
      timezone: CONFIG.timezone,
      isProd: CONFIG.isProd
    },
    '⏰ Backups automáticos programados (in-process)'
  );

  // ⚠️  Aviso crítico para Render
  if (CONFIG.isProd) {
    log.warn(
      '⚠️  Scheduler corriendo IN-PROCESS en producción. ' +
      'En Render free/starter el dyno se DUERME sin tráfico y el cron NO se ejecuta. ' +
      'Recomendación: define BACKUP_SCHEDULER_IN_WEB=false y usa un Render Cron Job.'
    );
  }
}

/** Detiene el scheduler. */
function detenerScheduler() {
  if (tareaActiva) {
    tareaActiva.stop();
    tareaActiva = null;
    log.info('🛑 Scheduler de backups detenido');
  }
}

/** Reinicia el scheduler con la config actual de BD. */
async function reiniciarScheduler() {
  if (!dbGlobal) {
    log.warn('reiniciarScheduler: no hay conexión previa, se ignora');
    return false;
  }
  await iniciarScheduler(dbGlobal);
  return true;
}

function detenerSchedulerEnShutdown() {
  if (handlersShutdownRegistrados) return;
  handlersShutdownRegistrados = true;

  const handler = (signal) => {
    log.info({ signal }, 'Cerrando scheduler de backups…');
    detenerScheduler();
  };

  process.once('SIGTERM', () => handler('SIGTERM'));
  process.once('SIGINT', () => handler('SIGINT'));
}

if (CONFIG.shutdownHandlers) {
  detenerSchedulerEnShutdown();
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  iniciarScheduler,
  detenerScheduler,
  reiniciarScheduler,
  ejecutarBackupAutomatico,
  detenerSchedulerEnShutdown
};

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._LockManager = LockManager;
module.exports._validarCron = validarCron;
module.exports._asegurarConfig = asegurarConfig;
module.exports._rotarBackups = rotarBackups;
module.exports._eliminarBackupCompleto = eliminarBackupCompleto;
module.exports._debeAlertar = debeAlertar;
module.exports._esErrorTransitorio = esErrorTransitorio;
module.exports._conTimeout = conTimeout;
module.exports._construirCuerpoAlerta = construirCuerpoAlerta;
module.exports._decidirModoStorage = decidirModoStorage;
module.exports._persistirBackup = persistirBackup;
module.exports._resolverSchedulerInWeb = resolverSchedulerInWeb;
module.exports._setDbGlobal = (db) => { dbGlobal = db; };
module.exports._resetEstado = () => {
  if (tareaActiva) tareaActiva.stop();
  tareaActiva = null;
  dbGlobal = null;
  enEjecucionLocal = false;
};
module.exports._hayTareaActiva = () => Boolean(tareaActiva);
module.exports._enEjecucion = () => enEjecucionLocal;