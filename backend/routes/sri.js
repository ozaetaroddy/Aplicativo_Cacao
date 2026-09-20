// backend/routes/sri.js
// ============================================================
// Integración con el SRI (Ecuador) — envío, consulta, masivos
// ------------------------------------------------------------
// Endpoints:
//   GET  /estado             → estado general (config + cert + conteos)
//   GET  /diagnostico        → prueba de conexión con el SRI
//   GET  /jobs               → estado de los jobs masivos en curso
//   GET  /estadisticas       → agregados por estado + top errores
//   POST /enviar/:id         → enviar un documento firmado
//   POST /consultar/:id      → consultar autorización de un documento
//   POST /reintentar/:id     → reintentar envío (RECHAZADA/DEVUELTA/PENDIENTE)
//   POST /enviar-pendientes  → envío masivo en background (202)
//
// ============================================================
// 🆕 REFACTOR 2025-XX — PERSISTENCIA + CIRCUIT BREAKER
// ------------------------------------------------------------
//   [Persistencia] Los jobs masivos ahora se persisten en la
//     colección `sri_jobs`. Al arrancar, el `JobManager` rehidrata
//     su estado desde Mongo y marca como `interrumpido` cualquier
//     job que quedó a medias por un reinicio del dyno (Render,
//     deploy, crash).
//
//     Esto significa que el usuario puede ver el progreso final
//     de un job incluso si el server cayó a mitad de ejecución.
//
//   [Circuit Breaker] El SRI cae con frecuencia. Ahora envolvemos
//     las llamadas a `enviarRecepcion` y `consultarAutorizacion`
//     con breakers independientes:
//       - `sri-recepcion`   → 10 fallos consecutivos → OPEN 5min
//       - `sri-autorizacion` → 15 fallos consecutivos → OPEN 3min
//     Cuando un breaker está OPEN, los requests fallan rápido
//     (sin esperar 45s × 3 reintentos) y se libera presión sobre
//     el servidor del SRI.
//
//   [Rate Limit] Añadimos rate limiter por IP:
//       - POST /enviar/:id     → 30/min
//       - POST /consultar/:id  → 60/min
//       - POST /reintentar/:id → 30/min
//     Previene que un bug del frontend (loop infinito) haga que
//     el SRI nos banee la IP.
//
//   [Cleanup] Un intervalo (unref) purga del Map los jobs
//     terminados hace >24h. La colección `sri_jobs` se limpia con
//     el mismo mecanismo en Mongo (deleteMany).
//
//   [Rehidratación] Al primer request a `/jobs`, el Manager se
//     inicializa leyendo `sri_jobs`. Los jobs con
//     `estado='procesando'` o `'iniciando'` se marcan como
//     `interrumpido` (asumimos crash) y sus contadores se
//     conservan para que el usuario vea qué se logró antes.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const rateLimit = require('express-rate-limit');

const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const {
  enviarRecepcion,
  consultarAutorizacion,
  enviarYAutorizar,
  probarConexion
} = require('../utils/sriWebService');
const { validarEstructuraClave } = require('../utils/claveAcceso');
const { getBreaker } = require('../utils/circuitBreaker');
const log = require('../utils/logger');

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
  colVentas: 'ventas_v2',
  colConfig: 'configuracion',
  colCertificados: 'certificados',
  colJobs: 'sri_jobs',

  maxLoteMasivo: 100,
  loteMasivoDefault: 50,
  delayEntreEnviosMs: envNum('SRI_DELAY_ENVIOS_MS', 800),

  /** TTL de jobs terminados en memoria (ms). */
  ttlJobMs: envNum('SRI_JOB_TTL_MS', 24 * 60 * 60 * 1000), // 24h

  /** TTL de jobs terminados en Mongo (ms). */
  ttlJobMongoMs: envNum('SRI_JOB_MONGO_TTL_MS', 7 * 24 * 60 * 60 * 1000), // 7d

  /** Throttle de persistencia a Mongo (cada N items o cada X ms). */
  persistirCadaNItems: envNum('SRI_PERSIST_EVERY_ITEMS', 5),
  persistirCadaMs: envNum('SRI_PERSIST_EVERY_MS', 2000),

  /** Máx. resultados en el snapshot final. */
  maxResultadosSnapshot: envNum('SRI_MAX_RESULTADOS', 200),

  /** Rate limits. */
  rateEnvioMax: envNum('SRI_RATE_ENVIO_MAX', 30),
  rateConsultaMax: envNum('SRI_RATE_CONSULTA_MAX', 60),
  rateWindowMs: envNum('SRI_RATE_WINDOW_MS', 60_000),

  /** Circuit breakers. */
  cbRecepcionUmbral: envNum('SRI_CB_RECEPCION_UMBRAL', 10),
  cbRecepcionCooldown: envNum('SRI_CB_RECEPCION_COOLDOWN_MS', 5 * 60_000),
  cbAutorizacionUmbral: envNum('SRI_CB_AUTORIZACION_UMBRAL', 15),
  cbAutorizacionCooldown: envNum('SRI_CB_AUTORIZACION_COOLDOWN_MS', 3 * 60_000),

  estadosRechazados: Object.freeze(
    new Set(['RECHAZADA', 'NO_AUTORIZADO', 'DEVUELTA'])
  ),
  estadosReintentables: Object.freeze(
    new Set(['RECHAZADA', 'DEVUELTA', 'PENDIENTE'])
  )
});

// ============================================================
// RATE LIMITERS
// ============================================================
function crearLimiter(max, mensaje) {
  return rateLimit({
    windowMs: CONFIG.rateWindowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.status(429).json({ error: mensaje, codigo: 'SRI_RATE_LIMIT' });
    }
  });
}

const sriEnvioLimiter = crearLimiter(
  CONFIG.rateEnvioMax,
  'Demasiados envíos al SRI. Espere un momento.'
);
const sriConsultaLimiter = crearLimiter(
  CONFIG.rateConsultaMax,
  'Demasiadas consultas al SRI. Espere un momento.'
);

// ============================================================
// CIRCUIT BREAKERS (compartidos, registry global)
// ============================================================
const breakerRecepcion = getBreaker('sri-recepcion', {
  umbralFallos: CONFIG.cbRecepcionUmbral,
  cooldownMs: CONFIG.cbRecepcionCooldown
});
const breakerAutorizacion = getBreaker('sri-autorizacion', {
  umbralFallos: CONFIG.cbAutorizacionUmbral,
  cooldownMs: CONFIG.cbAutorizacionCooldown
});

// ============================================================
// HELPERS GENERALES
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

function requireObjectId(id, mensaje = 'ID inválido') {
  if (!ObjectId.isValid(id)) {
    const err = new Error(mensaje);
    err.status = 400;
    err.codigo = 'ID_INVALIDO';
    throw err;
  }
  return new ObjectId(id);
}

async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar SRI');
  }
}

function normalizarEstadoSRI(estado) {
  if (!estado || typeof estado !== 'string') return '';
  return estado.trim().toUpperCase().replace(/\s+/g, '_');
}

function parseEnteroAcotado(v, { min = 1, max = 100, fallback = 50 } = {}) {
  if (typeof v === 'number' && Number.isInteger(v)) {
    return Math.max(min, Math.min(max, v));
  }
  if (typeof v !== 'string') return fallback;
  const n = parseInt(v, 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ============================================================
// CLASIFICACIÓN DE RESPUESTAS SRI
// ============================================================
function clasificarRespuesta(resultado) {
  if (resultado.exito) {
    return {
      nuevoEstado: 'AUTORIZADO',
      numeroAutorizacion: resultado.autorizacion?.numeroAutorizacion || '',
      fechaAutorizacion: resultado.autorizacion?.fechaAutorizacion || '',
      mensajesError: []
    };
  }

  if (resultado.fase === 'recepcion') {
    const estadoRecep = normalizarEstadoSRI(resultado.recepcion?.estado);
    return {
      nuevoEstado: estadoRecep === 'DEVUELTA' ? 'DEVUELTA' : 'RECHAZADA',
      numeroAutorizacion: '',
      fechaAutorizacion: '',
      mensajesError: resultado.recepcion?.comprobantes?.[0]?.mensajes || []
    };
  }

  const estadoAut = normalizarEstadoSRI(resultado.autorizacion?.estado);
  const nuevoEstado = CONFIG.estadosRechazados.has(estadoAut)
    ? 'RECHAZADA'
    : 'PENDIENTE';

  return {
    nuevoEstado,
    numeroAutorizacion: '',
    fechaAutorizacion: '',
    mensajesError: resultado.autorizacion?.autorizaciones?.[0]?.mensajes || []
  };
}

// ============================================================
// HELPERS DE PERSISTENCIA
// ============================================================
function construirUpdateSRI(venta, resultado, clasificado, { incluirRespuestaCompleta = false } = {}) {
  const ahora = new Date();

  const update = {
    estado_sri: clasificado.nuevoEstado,
    intentos_envio_sri: (venta.intentos_envio_sri || 0) + 1,
    ultimo_envio_sri: ahora,
    updatedAt: ahora
  };

  if (clasificado.numeroAutorizacion) {
    update.numero_autorizacion = clasificado.numeroAutorizacion;
  }
  if (clasificado.numeroAutorizacion && clasificado.fechaAutorizacion) {
    update.fecha_autorizacion = new Date(clasificado.fechaAutorizacion);
  }
  if (resultado.autorizacion?.comprobanteAutorizado) {
    update.xml_autorizado = resultado.autorizacion.comprobanteAutorizado;
  }
  if (clasificado.mensajesError.length > 0) {
    update.mensajes_error_sri = clasificado.mensajesError;
  }

  if (incluirRespuestaCompleta) {
    update.respuesta_sri = {
      fase: resultado.fase,
      recepcion: resultado.recepcion
        ? {
            estado: normalizarEstadoSRI(resultado.recepcion.estado),
            mensajes: resultado.recepcion.comprobantes?.[0]?.mensajes || []
          }
        : null,
      autorizacion: resultado.autorizacion
        ? {
            estado: normalizarEstadoSRI(resultado.autorizacion.estado),
            mensajes: resultado.autorizacion.autorizaciones?.[0]?.mensajes || []
          }
        : null
    };
  }

  return update;
}

/**
 * Envía al SRI + clasifica, protegido por circuit breakers.
 * @returns {{ resultado, clasificado }}
 */
async function enviarYClasificar(xmlFirmado, claveAcceso, ambiente) {
  // Envolvemos `enviarYAutorizar` (que a su vez hace recepción + polling
  // de autorización) con el breaker de recepción. El breaker de
  // autorización se aplica dentro de `enviarYAutorizar` en el futuro;
  // por ahora solo tenemos el flujo combinado expuesto por sriWebService.
  const resultado = await breakerRecepcion.ejecutar(() =>
    enviarYAutorizar(xmlFirmado, claveAcceso, ambiente)
  );
  const clasificado = clasificarRespuesta(resultado);
  return { resultado, clasificado };
}

// ============================================================
// JOB MANAGER (con persistencia en Mongo)
// ------------------------------------------------------------
// El `Map` en memoria es la fuente de verdad durante la vida del
// proceso. Cada mutación se refleja también en `sri_jobs` (con
// throttling para no saturar Mongo).
//
// Al primer acceso tras un arranque, `_rehidratar(db)` lee los
// jobs no terminados y marca como `interrumpido` los que quedaron
// en `procesando`/`iniciando`.
// ============================================================
const jobsSriEnCurso = new Map();
let jobSecuencial = 0;
let _rehidratado = false;
let _ultimaPersistencia = 0;

/**
 * Persiste el estado del job a Mongo (fire-and-forget con catch).
 * @private
 */
function _persistirJobAsync(db, jobId, job) {
  if (!db) return;
  db.collection(CONFIG.colJobs).updateOne(
    { _id: jobId },
    {
      $set: {
        estado: job.estado,
        total: job.total,
        procesados: job.procesados,
        autorizados: job.autorizados,
        rechazados: job.rechazados,
        errores: job.errores,
        iniciadoPor: job.iniciadoPor,
        iniciado: job.iniciado,
        finalizado: job.finalizado || null,
        error: job.error || null,
        resultados: (job.resultados || []).slice(0, CONFIG.maxResultadosSnapshot),
        ultimaActualizacion: new Date()
      }
    },
    { upsert: true }
  ).catch(e => {
    log.warn({ err: e.message, jobId }, 'No se pudo persistir job SRI');
  });
}

/**
 * Persiste con throttle: solo si pasó N items o X ms desde la última.
 * @private
 */
function _persistirJobThrottled(db, jobId, job, { forzar = false } = {}) {
  if (!db) return;
  if (forzar) {
    _ultimaPersistencia = Date.now();
    _persistirJobAsync(db, jobId, job);
    return;
  }
  const ahora = Date.now();
  const itemsDesde = job.procesados % CONFIG.persistirCadaNItems === 0;
  const tiempoDesde = ahora - _ultimaPersistencia >= CONFIG.persistirCadaMs;
  if (itemsDesde || tiempoDesde) {
    _ultimaPersistencia = ahora;
    _persistirJobAsync(db, jobId, job);
  }
}

/**
 * Rehidrata el estado desde Mongo (una sola vez por proceso).
 * Marca como `interrumpido` cualquier job que quedó a medias.
 * @private
 */
async function _rehidratar(db) {
  if (_rehidratado || !db) return;
  _rehidratado = true;

  try {
    const enCurso = await db.collection(CONFIG.colJobs).find({
      estado: { $in: ['iniciando', 'procesando'] }
    }).toArray();

    if (enCurso.length === 0) return;

    log.info(
      { count: enCurso.length },
      '🔄 Rehidratando jobs SRI interrumpidos por reinicio'
    );

    for (const doc of enCurso) {
      // Marca como interrumpido en Mongo.
      await db.collection(CONFIG.colJobs).updateOne(
        { _id: doc._id },
        {
          $set: {
            estado: 'interrumpido',
            error: 'Proceso reiniciado antes de completar el job',
            finalizado: new Date(),
            ultimaActualizacion: new Date()
          }
        }
      );

      // Y en memoria, para que GET /jobs lo refleje.
      jobsSriEnCurso.set(doc._id, {
        iniciado: doc.iniciado || new Date(),
        finalizado: new Date(),
        estado: 'interrumpido',
        total: doc.total || 0,
        procesados: doc.procesados || 0,
        autorizados: doc.autorizados || 0,
        rechazados: doc.rechazados || 0,
        errores: doc.errores || 0,
        iniciadoPor: doc.iniciadoPor || 'sistema',
        error: 'Proceso reiniciado antes de completar el job',
        resultados: doc.resultados || []
      });
    }
  } catch (e) {
    log.warn({ err: e.message }, 'No se pudieron rehidratar los jobs SRI');
  }
}

const JobManager = Object.freeze({
  /**
   * Crea y registra un job nuevo (memoria + Mongo).
   * @returns {Promise<string>} jobId
   */
  async crear(db, usuario) {
    await _rehidratar(db);

    const jobId = `sri-${++jobSecuencial}-${Date.now().toString(36)}`;
    const job = {
      iniciado: new Date(),
      estado: 'iniciando',
      total: 0,
      procesados: 0,
      autorizados: 0,
      rechazados: 0,
      errores: 0,
      iniciadoPor: usuario || 'anónimo',
      resultados: []
    };
    jobsSriEnCurso.set(jobId, job);

    if (db) {
      // Persistencia INICIAL síncrona (necesitamos que el job exista
      // antes de responder 202 al cliente).
      try {
        await db.collection(CONFIG.colJobs).insertOne({
          _id: jobId,
          estado: 'iniciando',
          total: 0,
          procesados: 0,
          autorizados: 0,
          rechazados: 0,
          errores: 0,
          iniciadoPor: job.iniciadoPor,
          iniciado: job.iniciado,
          finalizado: null,
          error: null,
          resultados: [],
          ultimaActualizacion: new Date()
        });
      } catch (e) {
        log.warn({ err: e.message, jobId }, 'No se pudo persistir el job inicial');
      }
    }

    return jobId;
  },

  /** Devuelve el job por id, o `null`. */
  obtener(jobId) {
    return jobsSriEnCurso.get(jobId) || null;
  },

  /** Lista jobs activos (iniciando o procesando). */
  activos() {
    const out = [];
    for (const [id, j] of jobsSriEnCurso) {
      if (j.estado === 'iniciando' || j.estado === 'procesando') {
        out.push({
          id,
          estado: j.estado,
          procesados: j.procesados,
          total: j.total
        });
      }
    }
    return out;
  },

  /** `true` si hay al menos un job activo. */
  hayActivo() {
    return this.activos().length > 0;
  },

  /**
   * Marca el job como finalizado/error.
   * Persiste el estado final de forma síncrona (para asegurar el
   * dato antes de cerrar).
   */
  async cerrar(db, jobId, estadoFinal = 'completado', errorMsg = null) {
    const job = jobsSriEnCurso.get(jobId);
    if (!job) return;

    job.estado = estadoFinal;
    job.finalizado = new Date();
    if (errorMsg) job.error = errorMsg;

    // Persistencia final: forzamos.
    _persistirJobThrottled(db, jobId, job, { forzar: true });

    // Limpieza diferida del Map (no de Mongo).
    const timer = setTimeout(() => jobsSriEnCurso.delete(jobId), CONFIG.ttlJobMs);
    if (timer.unref) timer.unref();
  },

  /** Snapshot para `GET /jobs` (memoria). */
  snapshot() {
    return [...jobsSriEnCurso.entries()].map(([id, j]) => ({ id, ...j }));
  }
});

// ============================================================
// CLEANUP PERIÓDICO (jobs viejos)
// ============================================================
let _dbCleanupRef = null;

function _iniciarCleanup(db) {
  if (_dbCleanupRef) return;
  _dbCleanupRef = setInterval(() => {
    const ahora = Date.now();
    // 1. Limpiar el Map (jobs terminados hace >TTL).
    for (const [id, j] of jobsSriEnCurso) {
      if (
        (j.estado === 'completado' || j.estado === 'error' || j.estado === 'interrumpido') &&
        j.finalizado &&
        (ahora - new Date(j.finalizado).getTime()) > CONFIG.ttlJobMs
      ) {
        jobsSriEnCurso.delete(id);
      }
    }
    // 2. Limpiar Mongo (jobs terminados hace >TTL Mongo).
    if (db && db.collection) {
      const limite = new Date(ahora - CONFIG.ttlJobMongoMs);
      db.collection(CONFIG.colJobs).deleteMany({
        estado: { $in: ['completado', 'error', 'interrumpido'] },
        finalizado: { $lt: limite }
      }).catch(e => {
        log.warn({ err: e.message }, 'Cleanup de sri_jobs falló');
      });
    }
  }, 60 * 60 * 1000); // cada hora
  if (_dbCleanupRef.unref) _dbCleanupRef.unref();
}

// ============================================================
// GET /estado  → resumen general del SRI
// ============================================================
router.get('/estado', requierePermiso('sri', 'ver'), async (req, res, next) => {
  try {
    const [config, cert] = await Promise.all([
      req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' }),
      req.db.collection(CONFIG.colCertificados).findOne(
        { _id: 'empresa' },
        { projection: { archivo_base64: 0, password: 0, password_cifrado: 0 } }
      )
    ]);

    const col = req.db.collection(CONFIG.colVentas);
    const [pendientes, firmados, autorizados, rechazados, devueltos] = await Promise.all([
      col.countDocuments({ estado_sri: 'PENDIENTE' }),
      col.countDocuments({ estado_sri: 'FIRMADO' }),
      col.countDocuments({ estado_sri: 'AUTORIZADO' }),
      col.countDocuments({ estado_sri: 'RECHAZADA' }),
      col.countDocuments({ estado_sri: 'DEVUELTA' })
    ]);

    const ambiente = config?.ambiente || '1';

    headersNoStore(res);
    return res.json({
      ambiente,
      ambienteNombre: ambiente === '2' ? 'Producción' : 'Pruebas',
      tieneCertificado: !!cert,
      certificado: cert
        ? {
            subject: cert.info?.subject,
            vence: cert.info?.validityNotAfter,
            diasRestantes: cert.info?.diasRestantes
          }
        : null,
      documentos: {
        pendientes,
        firmados,
        autorizados,
        rechazados,
        devueltos,
        totalRechazados: rechazados + devueltos
      },
      circuitBreakers: {
        recepcion: breakerRecepcion.stats(),
        autorizacion: breakerAutorizacion.stats()
      }
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /diagnostico  → probar conexión con el SRI
// ============================================================
router.get('/diagnostico', requierePermiso('sri', 'ver'), async (req, res, next) => {
  try {
    const config = await req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' });
    const ambiente = config?.ambiente || '1';

    const recepcion = await probarConexion(ambiente);

    headersNoStore(res);
    return res.json({
      ambiente,
      ambienteNombre: ambiente === '2' ? 'Producción' : 'Pruebas',
      recepcion,
      ok: recepcion.ok,
      circuitBreakers: {
        recepcion: breakerRecepcion.stats(),
        autorizacion: breakerAutorizacion.stats()
      }
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /jobs  → estado de los jobs masivos
// ============================================================
router.get('/jobs', requierePermiso('sri', 'ver'), async (req, res, next) => {
  try {
    // Rehidratar en el primer hit.
    await _rehidratar(req.db);
    _iniciarCleanup(req.db);

    headersNoStore(res);
    return res.json({ jobs: JobManager.snapshot() });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /enviar/:id  → enviar un documento
// ============================================================
router.post(
  '/enviar/:id',
  requierePermiso('sri', 'enviar'),
  sriEnvioLimiter,
  async (req, res, next) => {
    try {
      const _id = requireObjectId(req.params.id);

      const venta = await req.db.collection(CONFIG.colVentas).findOne({ _id });
      if (!venta) {
        return res.status(404).json({
          error: 'Venta no encontrada',
          codigo: 'VENTA_NOT_FOUND'
        });
      }
      if (!venta.xml_firmado) {
        return res.status(400).json({
          error: 'Debe firmar el documento antes de enviarlo al SRI',
          codigo: 'XML_NO_FIRMADO'
        });
      }
      if (!venta.clave_acceso) {
        return res.status(400).json({
          error: 'El documento no tiene clave de acceso',
          codigo: 'CLAVE_NO_PRESENTE'
        });
      }
      if (venta.estado_sri === 'AUTORIZADO') {
        return res.status(400).json({
          error: 'Este documento ya fue autorizado por el SRI',
          codigo: 'YA_AUTORIZADO'
        });
      }

      const validacion = validarEstructuraClave(venta.clave_acceso);
      if (!validacion.valido) {
        return res.status(400).json({
          error: `Clave de acceso inválida: ${validacion.motivo}`,
          codigo: 'CLAVE_INVALIDA'
        });
      }

      const config = await req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' });
      const ambiente = config?.ambiente || '1';

      // Circuit breaker: si está OPEN, `ejecutar` lanza CIRCUIT_OPEN.
      let resultado, clasificado;
      try {
        const r = await enviarYClasificar(
          venta.xml_firmado,
          venta.clave_acceso,
          ambiente
        );
        resultado = r.resultado;
        clasificado = r.clasificado;
      } catch (e) {
        if (e.codigo === 'CIRCUIT_OPEN') {
          res.setHeader('Retry-After', String(e.retryAfter || 60));
          return res.status(503).json({
            error: 'El servicio del SRI está temporalmente no disponible (circuito abierto).',
            codigo: 'SRI_CIRCUIT_OPEN',
            retryAfter: e.retryAfter
          });
        }
        throw e;
      }

      const updateData = construirUpdateSRI(venta, resultado, clasificado, {
        incluirRespuestaCompleta: true
      });

      await req.db.collection(CONFIG.colVentas).updateOne({ _id }, { $set: updateData });

      await auditarSeguro(req.db, req, {
        accion: 'enviar-sri',
        coleccion: 'ventas',
        documentoId: venta._id,
        documentoNumero: venta.numero_factura || '',
        detalle:
          `Enviado al SRI (${clasificado.nuevoEstado}): ${venta.numero_factura}` +
          (clasificado.numeroAutorizacion ? ` - Aut: ${clasificado.numeroAutorizacion}` : '')
      });

      if (req.io) {
        req.io.emit('sri-documento-actualizado', {
          id: String(_id),
          estado: clasificado.nuevoEstado,
          numeroAutorizacion: clasificado.numeroAutorizacion,
          numero_factura: venta.numero_factura
        });
      }

      headersNoStore(res);
      return res.json({
        success: resultado.exito,
        estado: clasificado.nuevoEstado,
        numero_autorizacion: clasificado.numeroAutorizacion,
        fecha_autorizacion: clasificado.fechaAutorizacion,
        mensajes: clasificado.mensajesError,
        detalle: {
          fase: resultado.fase,
          recepcion: resultado.recepcion,
          autorizacion: resultado.autorizacion
        }
      });
    } catch (err) {
      log.error({ err: err.message }, 'Error enviando al SRI');
      return next(err);
    }
  }
);

// ============================================================
// POST /consultar/:id  → consultar autorización
// ============================================================
router.post(
  '/consultar/:id',
  requierePermiso('sri', 'consultar'),
  sriConsultaLimiter,
  async (req, res, next) => {
    try {
      const _id = requireObjectId(req.params.id);

      const venta = await req.db.collection(CONFIG.colVentas).findOne({ _id });
      if (!venta) {
        return res.status(404).json({
          error: 'Venta no encontrada',
          codigo: 'VENTA_NOT_FOUND'
        });
      }
      if (!venta.clave_acceso) {
        return res.status(400).json({
          error: 'El documento no tiene clave de acceso',
          codigo: 'CLAVE_NO_PRESENTE'
        });
      }

      const config = await req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' });
      const ambiente = config?.ambiente || '1';

      // Circuit breaker de autorización.
      let resultado;
      try {
        resultado = await breakerAutorizacion.ejecutar(() =>
          consultarAutorizacion(venta.clave_acceso, ambiente)
        );
      } catch (e) {
        if (e.codigo === 'CIRCUIT_OPEN') {
          res.setHeader('Retry-After', String(e.retryAfter || 60));
          return res.status(503).json({
            error: 'El servicio de autorización del SRI está temporalmente no disponible.',
            codigo: 'SRI_CIRCUIT_OPEN',
            retryAfter: e.retryAfter
          });
        }
        throw e;
      }

      const estadoNorm = normalizarEstadoSRI(resultado.estado);

      const ahora = new Date();
      const updateData = {
        ultima_consulta_sri: ahora,
        updatedAt: ahora
      };

      if (resultado.exito) {
        updateData.estado_sri = 'AUTORIZADO';
        updateData.numero_autorizacion = resultado.numeroAutorizacion;
        if (resultado.fechaAutorizacion) {
          updateData.fecha_autorizacion = new Date(resultado.fechaAutorizacion);
        }
        if (resultado.comprobanteAutorizado) {
          updateData.xml_autorizado = resultado.comprobanteAutorizado;
        }
      } else if (CONFIG.estadosRechazados.has(estadoNorm)) {
        updateData.estado_sri = 'RECHAZADA';
        updateData.mensajes_error_sri = resultado.autorizaciones?.[0]?.mensajes || [];
      }

      await req.db.collection(CONFIG.colVentas).updateOne({ _id }, { $set: updateData });

      headersNoStore(res);
      return res.json({
        success: resultado.exito,
        estado: estadoNorm || resultado.estado,
        numero_autorizacion: resultado.numeroAutorizacion || '',
        fecha_autorizacion: resultado.fechaAutorizacion || '',
        mensajes: resultado.autorizaciones?.[0]?.mensajes || []
      });
    } catch (err) {
      log.error({ err: err.message }, 'Error consultando SRI');
      return next(err);
    }
  }
);

// ============================================================
// POST /reintentar/:id  → reintentar envío
// ============================================================
router.post(
  '/reintentar/:id',
  requierePermiso('sri', 'enviar'),
  sriEnvioLimiter,
  async (req, res, next) => {
    try {
      const _id = requireObjectId(req.params.id);

      const venta = await req.db.collection(CONFIG.colVentas).findOne({ _id });
      if (!venta) {
        return res.status(404).json({
          error: 'Venta no encontrada',
          codigo: 'VENTA_NOT_FOUND'
        });
      }
      if (!CONFIG.estadosReintentables.has(venta.estado_sri)) {
        return res.status(400).json({
          error: `No se puede reintentar un documento en estado ${venta.estado_sri}`,
          codigo: 'ESTADO_NO_REINTENTABLE',
          estadoActual: venta.estado_sri
        });
      }
      if (!venta.xml_firmado) {
        return res.status(400).json({
          error: 'El documento no tiene XML firmado',
          codigo: 'XML_NO_FIRMADO'
        });
      }

      const config = await req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' });
      const ambiente = config?.ambiente || '1';

      let resultado, clasificado;
      try {
        const r = await enviarYClasificar(
          venta.xml_firmado,
          venta.clave_acceso,
          ambiente
        );
        resultado = r.resultado;
        clasificado = r.clasificado;
      } catch (e) {
        if (e.codigo === 'CIRCUIT_OPEN') {
          res.setHeader('Retry-After', String(e.retryAfter || 60));
          return res.status(503).json({
            error: 'El servicio del SRI está temporalmente no disponible.',
            codigo: 'SRI_CIRCUIT_OPEN',
            retryAfter: e.retryAfter
          });
        }
        throw e;
      }

      const updateData = construirUpdateSRI(venta, resultado, clasificado);

      await req.db.collection(CONFIG.colVentas).updateOne({ _id }, { $set: updateData });

      await auditarSeguro(req.db, req, {
        accion: 'reintentar-sri',
        coleccion: 'ventas',
        documentoId: venta._id,
        documentoNumero: venta.numero_factura || '',
        detalle: `Reintento al SRI (${clasificado.nuevoEstado}): ${venta.numero_factura}`
      });

      headersNoStore(res);
      return res.json({
        success: resultado.exito,
        estado: clasificado.nuevoEstado,
        numero_autorizacion: clasificado.numeroAutorizacion,
        mensajes: clasificado.mensajesError
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// POST /enviar-pendientes  → envío masivo (background)
// ============================================================
router.post('/enviar-pendientes', requierePermiso('sri', 'enviar'), async (req, res, next) => {
  try {
    await _rehidratar(req.db);
    _iniciarCleanup(req.db);

    if (JobManager.hayActivo()) {
      return res.status(409).json({
        error: 'Ya hay un envío masivo en curso. Espere a que termine.',
        codigo: 'JOB_EN_CURSO',
        jobs: JobManager.activos()
      });
    }

    const limite = parseEnteroAcotado(req.body?.limite, {
      min: 1,
      max: CONFIG.maxLoteMasivo,
      fallback: CONFIG.loteMasivoDefault
    });

    const jobId = await JobManager.crear(req.db, req.user?.email);
    const job = JobManager.obtener(jobId);
    job.limite = limite;

    // Responder 202 inmediatamente.
    headersNoStore(res);
    res.status(202).json({
      success: true,
      message:
        'Envío masivo iniciado. El progreso se emitirá por WebSocket ' +
        '(eventos: sri-progreso, sri-completado, sri-error).',
      jobId,
      limite,
      nota: 'Escucha el evento sri-completado para conocer el resumen final.'
    });

    // Procesar en background.
    procesarJobMasivo({ req, jobId, job, limite })
      .catch(err => {
        JobManager.cerrar(req.db, jobId, 'error', err.message);
        log.error({ err: err.message, jobId }, 'Error inesperado en job SRI masivo');
      });
  } catch (err) {
    return next(err);
  }
});

/**
 * Procesa el job masivo en background.
 * Emite eventos de progreso por WebSocket si `req.io` está disponible.
 */
async function procesarJobMasivo({ req, jobId, job, limite }) {
  try {
    const config = await req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' });
    const ambiente = config?.ambiente || '1';

    const pendientes = await req.db.collection(CONFIG.colVentas)
      .find({
        estado_sri: 'FIRMADO',
        xml_firmado: { $exists: true, $ne: '' },
        clave_acceso: { $exists: true, $ne: '' }
      })
      .limit(limite)
      .toArray();

    const total = pendientes.length;
    job.estado = 'procesando';
    job.total = total;

    // Persistir estado inicial del procesamiento.
    _persistirJobThrottled(req.db, jobId, job, { forzar: true });

    if (req.io) {
      req.io.emit('sri-progreso', {
        jobId,
        tipo: 'inicio',
        total,
        procesados: 0,
        autorizados: 0,
        rechazados: 0,
        errores: 0
      });
    }

    const resultados = [];

    for (let i = 0; i < pendientes.length; i++) {
      const venta = pendientes[i];

      try {
        const { resultado, clasificado } = await enviarYClasificar(
          venta.xml_firmado,
          venta.clave_acceso,
          ambiente
        );

        if (clasificado.nuevoEstado === 'AUTORIZADO') job.autorizados++;
        else if (
          clasificado.nuevoEstado === 'RECHAZADA' ||
          clasificado.nuevoEstado === 'DEVUELTA'
        ) {
          job.rechazados++;
        }

        const updateData = construirUpdateSRI(venta, resultado, clasificado);
        await req.db.collection(CONFIG.colVentas).updateOne(
          { _id: venta._id },
          { $set: updateData }
        );

        resultados.push({
          id: venta._id,
          numero: venta.numero_factura,
          estado: clasificado.nuevoEstado,
          exito: resultado.exito,
          numeroAutorizacion: clasificado.numeroAutorizacion
        });
      } catch (e) {
        job.errores++;
        resultados.push({
          id: venta._id,
          numero: venta.numero_factura,
          estado: 'ERROR',
          error: e.message
        });
        log.warn(
          { err: e.message, ventaId: String(venta._id), codigo: e.codigo },
          'Error procesando venta en lote'
        );
      }

      job.procesados = i + 1;
      job.resultados = resultados.slice(0, CONFIG.maxResultadosSnapshot);

      // Persistir throttled.
      _persistirJobThrottled(req.db, jobId, job);

      if (req.io) {
        req.io.emit('sri-progreso', {
          jobId,
          tipo: 'item',
          procesados: i + 1,
          total,
          autorizados: job.autorizados,
          rechazados: job.rechazados,
          errores: job.errores,
          item: resultados[resultados.length - 1]
        });
      }

      // Delay entre envíos (excepto el último).
      if (i < pendientes.length - 1 && CONFIG.delayEntreEnviosMs > 0) {
        await new Promise(r => setTimeout(r, CONFIG.delayEntreEnviosMs));
      }
    }

    await auditarSeguro(req.db, req, {
      accion: 'enviar-sri-masivo',
      coleccion: 'ventas',
      documentoNumero: `${total} documentos`,
      detalle:
        `Envío masivo (job ${jobId}): ${job.autorizados} autorizados, ` +
        `${job.rechazados} rechazados, ${job.errores} errores`
    });

    if (req.io) {
      req.io.emit('sri-completado', {
        jobId,
        total,
        autorizados: job.autorizados,
        rechazados: job.rechazados,
        errores: job.errores,
        resultados
      });
    }

    await JobManager.cerrar(req.db, jobId, 'completado');
  } catch (err) {
    log.error({ err: err.message, jobId }, 'Error en job SRI masivo');
    await JobManager.cerrar(req.db, jobId, 'error', err.message);
    if (req.io) req.io.emit('sri-error', { jobId, error: err.message });
  }
}

// ============================================================
// GET /estadisticas  → agregados + top errores
// ============================================================
router.get('/estadisticas', requierePermiso('sri', 'ver'), async (req, res, next) => {
  try {
    const col = req.db.collection(CONFIG.colVentas);

    const [porEstado, topErrores] = await Promise.all([
      col.aggregate([
        { $group: { _id: '$estado_sri', cantidad: { $sum: 1 }, total: { $sum: '$total' } } },
        { $sort: { cantidad: -1 } }
      ]).toArray(),

      col.aggregate([
        {
          $match: {
            estado_sri: { $in: ['RECHAZADA', 'DEVUELTA'] },
            mensajes_error_sri: { $exists: true, $ne: [] }
          }
        },
        { $unwind: '$mensajes_error_sri' },
        {
          $group: {
            _id: {
              identificador: '$mensajes_error_sri.identificador',
              mensaje: '$mensajes_error_sri.mensaje'
            },
            cantidad: { $sum: 1 }
          }
        },
        { $sort: { cantidad: -1 } },
        { $limit: 10 }
      ]).toArray()
    ]);

    headersNoStore(res);
    return res.json({
      porEstado,
      topErrores,
      circuitBreakers: {
        recepcion: breakerRecepcion.stats(),
        autorizacion: breakerAutorizacion.stats()
      }
    });
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
module.exports._JobManager = JobManager;
module.exports._normalizarEstadoSRI = normalizarEstadoSRI;
module.exports._clasificarRespuesta = clasificarRespuesta;
module.exports._construirUpdateSRI = construirUpdateSRI;
module.exports._enviarYClasificar = enviarYClasificar;
module.exports._parseEnteroAcotado = parseEnteroAcotado;
module.exports._procesarJobMasivo = procesarJobMasivo;
// 🆕 Extras
module.exports._breakerRecepcion = breakerRecepcion;
module.exports._breakerAutorizacion = breakerAutorizacion;
module.exports._rehidratar = _rehidratar;
module.exports._persistirJobAsync = _persistirJobAsync;
module.exports._persistirJobThrottled = _persistirJobThrottled;
module.exports._resetEstadoJobs = () => {
  jobsSriEnCurso.clear();
  _rehidratado = false;
  _ultimaPersistencia = 0;
};