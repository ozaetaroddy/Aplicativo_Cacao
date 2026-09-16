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
// Convenciones:
//   - Los envíos individuales son síncronos.
//   - El envío masivo corre en BACKGROUND y responde 202 con `jobId`;
//     el progreso se emite por WebSocket (`sri-progreso`,
//     `sri-completado`, `sri-error`).
//   - Solo un job masivo a la vez (protección contra saturación).
//   - El estado del SRI se normaliza con `normalizarEstadoSRI`.
//   - Errores delegados al `errorHandler` central.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const {
  enviarRecepcion,
  consultarAutorizacion,
  enviarYAutorizar,
  probarConexion
} = require('../utils/sriWebService');
const { validarEstructuraClave } = require('../utils/claveAcceso');
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

  /** Máx. documentos por envío masivo (por request). */
  maxLoteMasivo: 100,

  /** Lote por defecto si no se especifica. */
  loteMasivoDefault: 50,

  /** Delay entre envíos del lote (evita rate-limit del SRI). */
  delayEntreEnviosMs: envNum('SRI_DELAY_ENVIOS_MS', 800),

  /** Tiempo que un job terminado permanece en memoria (ms). */
  ttlJobMs: envNum('SRI_JOB_TTL_MS', 5 * 60 * 1000),

  /** Estados finales que indican rechazo. */
  estadosRechazados: Object.freeze(
    new Set(['RECHAZADA', 'NO_AUTORIZADO', 'DEVUELTA'])
  ),

  /** Estados desde los cuales se puede reintentar. */
  estadosReintentables: Object.freeze(
    new Set(['RECHAZADA', 'DEVUELTA', 'PENDIENTE'])
  )
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

/** Valida ObjectId o lanza error tipado (400). */
function requireObjectId(id, mensaje = 'ID inválido') {
  if (!ObjectId.isValid(id)) {
    const err = new Error(mensaje);
    err.status = 400;
    err.codigo = 'ID_INVALIDO';
    throw err;
  }
  return new ObjectId(id);
}

/** Auditoría que NUNCA rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar SRI');
  }
}

/** Normaliza el estado devuelto por el SRI. */
function normalizarEstadoSRI(estado) {
  if (!estado || typeof estado !== 'string') return '';
  return estado.trim().toUpperCase().replace(/\s+/g, '_');
}

/** Parsea entero acotado. Devuelve `fallback` si inválido. */
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
/**
 * Traduce la respuesta cruda del SRI a un estado interno.
 * @returns {{ nuevoEstado, numeroAutorizacion, fechaAutorizacion, mensajesError }}
 */
function clasificarRespuesta(resultado) {
  if (resultado.exito) {
    return {
      nuevoEstado: 'AUTORIZADO',
      numeroAutorizacion: resultado.autorizacion?.numeroAutorizacion || '',
      fechaAutorizacion: resultado.autorizacion?.fechaAutorizacion || '',
      mensajesError: []
    };
  }

  // Falla en fase de recepción
  if (resultado.fase === 'recepcion') {
    const estadoRecep = normalizarEstadoSRI(resultado.recepcion?.estado);
    return {
      nuevoEstado: estadoRecep === 'DEVUELTA' ? 'DEVUELTA' : 'RECHAZADA',
      numeroAutorizacion: '',
      fechaAutorizacion: '',
      mensajesError: resultado.recepcion?.comprobantes?.[0]?.mensajes || []
    };
  }

  // Falla en fase de autorización (con o sin rechazo explícito)
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
/**
 * Construye el `$set` para actualizar una venta con el resultado del SRI.
 * NO incluye `_id` ni claves derivadas; es puro sobre `venta` + `clasificado`.
 *
 * @param {object} venta          documento original
 * @param {object} resultado      respuesta del SRI
 * @param {object} clasificado    salida de clasificarRespuesta
 * @param {object} [opts]
 * @param {boolean} [opts.incluirRespuestaCompleta=false]
 * @returns {object}
 */
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
 * Llama al SRI y clasifica la respuesta en una sola operación.
 * @returns {{ resultado, clasificado }}
 */
async function enviarYClasificar(xmlFirmado, claveAcceso, ambiente) {
  const resultado = await enviarYAutorizar(xmlFirmado, claveAcceso, ambiente);
  const clasificado = clasificarRespuesta(resultado);
  return { resultado, clasificado };
}

// ============================================================
// JOB MANAGER (envíos masivos)
// ------------------------------------------------------------
// ⚠️  Los jobs viven EN MEMORIA. Si el proceso se reinicia, se
//     pierden. Para producción multi-instancia se debe migrar a
//     Redis / BullMQ o a una colección Mongo con TTL.
// ============================================================
const jobsSriEnCurso = new Map();
let jobSecuencial = 0;

const JobManager = Object.freeze({
  /**
   * Crea y registra un job nuevo.
   * @returns {string} jobId
   */
  crear(usuario) {
    const jobId = `sri-${++jobSecuencial}-${Date.now().toString(36)}`;
    jobsSriEnCurso.set(jobId, {
      iniciado: new Date(),
      estado: 'iniciando',
      total: 0,
      procesados: 0,
      autorizados: 0,
      rechazados: 0,
      errores: 0,
      iniciadoPor: usuario || 'anónimo'
    });
    return jobId;
  },

  /** Devuelve el job por id, o `null`. */
  obtener(jobId) {
    return jobsSriEnCurso.get(jobId) || null;
  },

  /** Lista jobs que aún no terminaron (iniciando o procesando). */
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

  /** Marca el job como finalizado/error y programa su limpieza. */
  cerrar(jobId, estadoFinal = 'completado', errorMsg = null) {
    const job = jobsSriEnCurso.get(jobId);
    if (!job) return;
    job.estado = estadoFinal;
    job.finalizado = new Date();
    if (errorMsg) job.error = errorMsg;

    // Limpieza diferida sin mantener el proceso vivo.
    const timer = setTimeout(() => jobsSriEnCurso.delete(jobId), CONFIG.ttlJobMs);
    if (timer.unref) timer.unref();
  },

  /** Snapshot para tests / debug. */
  snapshot() {
    return [...jobsSriEnCurso.entries()].map(([id, j]) => ({ id, ...j }));
  }
});

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
      ok: recepcion.ok
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
    headersNoStore(res);
    return res.json({ jobs: JobManager.snapshot() });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /enviar/:id  → enviar un documento
// ============================================================
router.post('/enviar/:id', requierePermiso('sri', 'enviar'), async (req, res, next) => {
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

    const { resultado, clasificado } = await enviarYClasificar(
      venta.xml_firmado,
      venta.clave_acceso,
      ambiente
    );

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
});

// ============================================================
// POST /consultar/:id  → consultar autorización
// ============================================================
router.post('/consultar/:id', requierePermiso('sri', 'consultar'), async (req, res, next) => {
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

    const resultado = await consultarAutorizacion(venta.clave_acceso, ambiente);
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
});

// ============================================================
// POST /reintentar/:id  → reintentar envío
// ============================================================
router.post('/reintentar/:id', requierePermiso('sri', 'enviar'), async (req, res, next) => {
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

    const { resultado, clasificado } = await enviarYClasificar(
      venta.xml_firmado,
      venta.clave_acceso,
      ambiente
    );

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
});

// ============================================================
// POST /enviar-pendientes  → envío masivo (background)
// ------------------------------------------------------------
// Responde 202 inmediatamente con `jobId`. El cliente escucha
// los eventos de WebSocket para conocer el progreso.
// ============================================================
router.post('/enviar-pendientes', requierePermiso('sri', 'enviar'), async (req, res, next) => {
  try {
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

    const jobId = JobManager.crear(req.user?.email);
    const job = JobManager.obtener(jobId);

    // ---- Responder 202 inmediatamente ----
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

    // ---- Procesar en background (no bloquea la respuesta) ----
    procesarJobMasivo({ req, jobId, job, limite })
      .catch(err => {
        // Fallback defensivo: el `procesarJobMasivo` ya maneja errores
        // internamente, pero si algo inesperado pasa, cerramos el job.
        JobManager.cerrar(jobId, 'error', err.message);
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
        log.warn({ err: e.message, ventaId: String(venta._id) }, 'Error procesando venta en lote');
      }

      job.procesados = i + 1;

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

    JobManager.cerrar(jobId, 'completado');
  } catch (err) {
    log.error({ err: err.message, jobId }, 'Error en job SRI masivo');
    JobManager.cerrar(jobId, 'error', err.message);
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
    return res.json({ porEstado, topErrores });
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