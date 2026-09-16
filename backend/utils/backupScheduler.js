// backend/utils/backupScheduler.js
// ============================================================
// Scheduler de backups automáticos con node-cron.
// ------------------------------------------------------------
// Características:
//   - Lock distribuido (una sola instancia corre a la vez).
//   - Reintentos con backoff exponencial en fallos transitorios.
//   - Timeout global por ejecución (libera el lock si se cuelga).
//   - Alertas por email al Nth fallo consecutivo, con throttle.
//   - Rotación atómica por antigüedad.
//   - Relee la config de BD antes de cada ejecución.
//   - SIGTERM/SIGINT handler opcional.
//
// API pública:
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
  comprimirBackup,
  calcularTamano
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

function envBool(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).toLowerCase() !== 'false';
}

const CONFIG = Object.freeze({
  colBackups: 'backups',
  colConfig: 'backup_config',
  colLock: 'backup_lock',

  /** Retención por defecto si la config no la especifica. */
  maxAutomaticos: envNum('BACKUP_MAX_AUTOMATICOS', 30),

  /** Retención máxima permitida (protege contra configs absurdas). */
  maxAutomaticosMax: envNum('BACKUP_MAX_AUTOMATICOS_MAX', 365),

  /** Límite del buffer comprimido (protege el doc Mongo de 16 MB). */
  limiteSeguroBytes:
    envNum('BACKUP_LIMITE_MB', 15) * 1024 * 1024,

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
  shutdownHandlers: envBool('BACKUP_SHUTDOWN_HANDLERS', true)
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
  // Algunos drivers no setean name pero sí code.
  if (typeof err.code === 'number' && [6, 7, 89, 91, 189, 9001].includes(err.code)) return true;
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

// ============================================================
// LOCK MANAGER
// ------------------------------------------------------------
// Estrategia:
//   1. Intentar insertOne con `_id` fijo. Si ya existe → otro tiene el lock.
//      Pero también puede estar expirado → intentar renovar con
//      findOneAndUpdate filtrando por expiración o por owner.
//   2. Renovar periódicamente (heartbeat) para locks largos.
//   3. Liberar con unset.
// ============================================================
const LockManager = Object.freeze({
  async adquirir(db, owner) {
    const ahora = new Date();
    const expira = new Date(ahora.getTime() + CONFIG.lockMinutos * 60 * 1000);

    // 1. Intento atómico: crear el lock si no existe o si expiró.
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
      // E11000: dos workers intentaron upsert a la vez → alguien más lo tomó.
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
/** Obtiene emails de admins (env o BD). */
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

/** Construye el cuerpo del email de alerta. */
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

Sistema: ${razonSocial}
`.trim();
}

/** Envía la alerta por email. NUNCA lanza. */
async function enviarAlertaFallo(db, err, fallosConsecutivos) {
  const destinatarios = await obtenerEmailsAdmin(db);
  if (destinatarios.length === 0) {
    log.warn('No hay destinatarios para alerta de backup (ADMIN_EMAILS o admins activos)');
    return;
  }

  try {
    const transporter = crearTransporter();
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

/**
 * Decide si corresponde alertar según la cantidad de fallos y el throttle.
 * @param {object} config  Documento de backup_config
 * @param {number} fallos  Fallos consecutivos actuales
 * @returns {boolean}
 */
function debeAlertar(config, fallos) {
  if (fallos < CONFIG.fallosAntesDeAlerta) return false;

  // ¿Es un fallo "de alerta"? (2, 7, 12, ...)
  const esPuntoDeAlerta =
    fallos === CONFIG.fallosAntesDeAlerta ||
    (fallos > CONFIG.fallosAntesDeAlerta &&
      (fallos - CONFIG.fallosAntesDeAlerta) % CONFIG.alertaCadaFallos === 0);

  if (!esPuntoDeAlerta) return false;

  // Throttle: no alertar si la última alerta fue hace menos de X.
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

    // Incremento atómico de fallos + set de estado.
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

async function registrarExito(db, tamanoBuffer) {
  try {
    await db.collection(CONFIG.colConfig).updateOne(
      { _id: 'global' },
      {
        $set: {
          ultima_ejecucion: new Date(),
          ultimo_estado: 'ok',
          ultimo_tamano: tamanoBuffer,
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

async function registrarOmision(db, motivo, tamanoBuffer) {
  try {
    await db.collection(CONFIG.colConfig).updateOne(
      { _id: 'global' },
      {
        $set: {
          ultima_ejecucion: new Date(),
          ultimo_estado: motivo,
          ultimo_tamano: tamanoBuffer,
          fallos_consecutivos: 0
        }
      },
      { upsert: true }
    );
  } catch { /* noop */ }
}

// ============================================================
// ROTACIÓN
// ============================================================
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
      .project({ _id: 1 })
      .toArray();

    if (sobrantes.length === 0) return 0;

    const r = await db.collection(CONFIG.colBackups).deleteMany({
      _id: { $in: sobrantes.map(s => s._id) }
    });

    return r.deletedCount || 0;
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
      generarBackup(db),
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
      // 1. Generar snapshot (con reintentos).
      const snapshot = await generarConReintentos(db);

      // 2. Calcular tamaños.
      const json = JSON.stringify(snapshot);
      const tamanoSinComprimir = calcularTamano(snapshot, { yaSerializado: json });
      const buffer = comprimirBackup(snapshot, { yaSerializado: json });

      // 3. Guard contra tamaño excesivo.
      if (buffer.length > CONFIG.limiteSeguroBytes) {
        const mb = (buffer.length / 1024 / 1024).toFixed(2);
        const limiteMb = (CONFIG.limiteSeguroBytes / 1024 / 1024).toFixed(0);
        log.warn({ mb, limiteMb }, `⚠️  Backup demasiado grande (${mb} MB > ${limiteMb} MB), se omite`);
        await registrarOmision(db, 'omitido_por_tamano', buffer.length);
        return;
      }

      // 4. Resumen de colecciones (filtra errores internos).
      const colecciones = Object.keys(snapshot.colecciones || {})
        .filter(k => !k.startsWith('__'))
        .map(k => {
          const arr = snapshot.colecciones[k];
          return { nombre: k, cantidad: Array.isArray(arr) ? arr.length : 0 };
        });

      // 5. Persistir.
      const backup = {
        nombre: `Backup automático del ${ahoraLegible()}`,
        tipo: 'automatico',
        descripcion: 'Generado por el scheduler',
        fecha: new Date(),
        usuario_id: null,
        usuario_email: 'sistema',
        tamano_sin_comprimir: tamanoSinComprimir,
        tamano_comprimido: buffer.length,
        contenido: buffer,
        duracion_ms: Date.now() - inicio,
        colecciones
      };

      await db.collection(CONFIG.colBackups).insertOne(backup);

      // 6. Rotación.
      const retencion = Math.min(
        Number(config?.retencion) || CONFIG.maxAutomaticos,
        CONFIG.maxAutomaticosMax
      );
      const eliminados = await rotarBackups(db, retencion);
      if (eliminados > 0) {
        log.info({ eliminados }, `🗑️  ${eliminados} backups antiguos eliminados`);
      }

      // 7. Registrar éxito.
      await registrarExito(db, buffer.length);

      log.info(
        { kb: (buffer.length / 1024).toFixed(1), ms: Date.now() - inicio },
        '✅ Backup automático completado'
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
    ultimo_error: null,
    fallos_consecutivos: 0,
    createdAt: new Date()
  };

  try {
    await db.collection(CONFIG.colConfig).insertOne(config);
    return config;
  } catch (err) {
    // E11000: otro worker lo creó primero.
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
    { cron: config.cron, timezone: CONFIG.timezone },
    '⏰ Backups automáticos programados'
  );
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

/**
 * Registra handlers de SIGTERM/SIGINT para cerrar limpio.
 * Idempotente: se puede llamar múltiples veces sin duplicar.
 */
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
module.exports._debeAlertar = debeAlertar;
module.exports._esErrorTransitorio = esErrorTransitorio;
module.exports._conTimeout = conTimeout;
module.exports._construirCuerpoAlerta = construirCuerpoAlerta;
module.exports._setDbGlobal = (db) => { dbGlobal = db; };
module.exports._resetEstado = () => {
  if (tareaActiva) tareaActiva.stop();
  tareaActiva = null;
  dbGlobal = null;
  enEjecucionLocal = false;
};
module.exports._hayTareaActiva = () => Boolean(tareaActiva);
module.exports._enEjecucion = () => enEjecucionLocal;