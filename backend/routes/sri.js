// backend/routes/sri.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { enviarRecepcion, consultarAutorizacion, enviarYAutorizar, probarConexion } = require('../utils/sriWebService');
const { validarEstructuraClave } = require('../utils/claveAcceso');

/**
 * Normaliza el estado devuelto por el SRI:
 *   - trim
 *   - mayúsculas
 *   - espacios internos → "_"
 *   - "NO AUTORIZADO" → "NO_AUTORIZADO"
 */
function normalizarEstadoSRI(estado) {
  if (!estado || typeof estado !== 'string') return '';
  return estado.trim().toUpperCase().replace(/\s+/g, '_');
}

const ESTADOS_RECHAZADOS = new Set(['RECHAZADA', 'NO_AUTORIZADO', 'DEVUELTA']);

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
    const nuevoEstado = estadoRecep === 'DEVUELTA' ? 'DEVUELTA' : 'RECHAZADA';
    return {
      nuevoEstado,
      numeroAutorizacion: '',
      fechaAutorizacion: '',
      mensajesError: resultado.recepcion?.comprobantes?.[0]?.mensajes || []
    };
  }

  const estadoAut = normalizarEstadoSRI(resultado.autorizacion?.estado);
  const nuevoEstado = ESTADOS_RECHAZADOS.has(estadoAut)
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
// Jobs en background para envíos masivos
// ============================================================
const jobsSriEnCurso = new Map(); // jobId → { iniciado, estado, ... }
let jobSriSecuencial = 0;

function hayJobEnCurso() {
  // Solo bloquea si hay algún job que aún NO ha terminado.
  for (const [, j] of jobsSriEnCurso) {
    if (j.estado === 'iniciando' || j.estado === 'procesando') return true;
  }
  return false;
}

// ============================================================
// ESTADO
// ============================================================
router.get('/estado', requierePermiso('sri', 'ver'), async (req, res) => {
  try {
    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    const cert = await req.db.collection('certificados').findOne(
      { _id: 'empresa' },
      { projection: { archivo_base64: 0, password: 0, password_cifrado: 0, info: 1 } }
    );

    const [pendientes, firmados, autorizados, rechazados, devueltos] = await Promise.all([
      req.db.collection('ventas_v2').countDocuments({ estado_sri: 'PENDIENTE' }),
      req.db.collection('ventas_v2').countDocuments({ estado_sri: 'FIRMADO' }),
      req.db.collection('ventas_v2').countDocuments({ estado_sri: 'AUTORIZADO' }),
      req.db.collection('ventas_v2').countDocuments({ estado_sri: 'RECHAZADA' }),
      req.db.collection('ventas_v2').countDocuments({ estado_sri: 'DEVUELTA' })
    ]);

    res.json({
      ambiente: config?.ambiente || '1',
      ambienteNombre: config?.ambiente === '2' ? 'Producción' : 'Pruebas',
      tieneCertificado: !!cert,
      certificado: cert ? {
        subject: cert.info?.subject,
        vence: cert.info?.validityNotAfter,
        diasRestantes: cert.info?.diasRestantes
      } : null,
      documentos: {
        pendientes, firmados, autorizados, rechazados, devueltos,
        totalRechazados: rechazados + devueltos
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DIAGNÓSTICO
// ============================================================
router.get('/diagnostico', requierePermiso('sri', 'ver'), async (req, res) => {
  try {
    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    const ambiente = config?.ambiente || '1';
    const recepcion = await probarConexion(ambiente);

    res.json({
      ambiente,
      ambienteNombre: ambiente === '2' ? 'Producción' : 'Pruebas',
      recepcion,
      ok: recepcion.ok
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENVIAR UNO
// ============================================================
router.post('/enviar/:id', requierePermiso('sri', 'enviar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    if (!venta.xml_firmado) {
      return res.status(400).json({ error: 'Debe firmar el documento antes de enviarlo al SRI' });
    }
    if (!venta.clave_acceso) {
      return res.status(400).json({ error: 'El documento no tiene clave de acceso' });
    }
    if (venta.estado_sri === 'AUTORIZADO') {
      return res.status(400).json({ error: 'Este documento ya fue autorizado por el SRI' });
    }

    const validacion = validarEstructuraClave(venta.clave_acceso);
    if (!validacion.valido) {
      return res.status(400).json({
        error: `Clave de acceso inválida: ${validacion.motivo}`,
        codigo: 'CLAVE_INVALIDA'
      });
    }

    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    const ambiente = config?.ambiente || '1';

    const resultado = await enviarYAutorizar(venta.xml_firmado, venta.clave_acceso, ambiente);
    const clasificado = clasificarRespuesta(resultado);

    const updateData = {
      estado_sri: clasificado.nuevoEstado,
      intentos_envio_sri: (venta.intentos_envio_sri || 0) + 1,
      ultimo_envio_sri: new Date(),
      respuesta_sri: {
        fase: resultado.fase,
        recepcion: resultado.recepcion ? {
          estado: normalizarEstadoSRI(resultado.recepcion.estado),
          mensajes: resultado.recepcion.comprobantes?.[0]?.mensajes || []
        } : null,
        autorizacion: resultado.autorizacion ? {
          estado: normalizarEstadoSRI(resultado.autorizacion.estado),
          mensajes: resultado.autorizacion.autorizaciones?.[0]?.mensajes || []
        } : null
      },
      updatedAt: new Date()
    };

    if (clasificado.numeroAutorizacion) {
      updateData.numero_autorizacion = clasificado.numeroAutorizacion;
    }
    if (clasificado.fechaAutorizacion) {
      updateData.fecha_autorizacion = new Date(clasificado.fechaAutorizacion);
    }
    if (resultado.autorizacion?.comprobanteAutorizado) {
      updateData.xml_autorizado = resultado.autorizacion.comprobanteAutorizado;
    }
    if (clasificado.mensajesError.length > 0) {
      updateData.mensajes_error_sri = clasificado.mensajesError;
    }

    await req.db.collection('ventas_v2').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    await logAudit(req.db, req, {
      accion: 'enviar-sri',
      coleccion: 'ventas',
      documentoId: id,
      documentoNumero: venta.numero_factura || '',
      detalle: `Enviado al SRI (${clasificado.nuevoEstado}): ${venta.numero_factura}${clasificado.numeroAutorizacion ? ' - Aut: ' + clasificado.numeroAutorizacion : ''}`
    });

    if (req.io) {
      req.io.emit('sri-documento-actualizado', {
        id,
        estado: clasificado.nuevoEstado,
        numeroAutorizacion: clasificado.numeroAutorizacion,
        numero_factura: venta.numero_factura
      });
    }

    res.json({
      success: resultado.exito,
      estado: clasificado.nuevoEstado,
      numero_autorizacion: clasificado.numeroAutorizacion,
      fecha_autorizacion: clasificado.fechaAutorizacion,
      mensajes: clasificado.mensajesError,
      detalle: { fase: resultado.fase, recepcion: resultado.recepcion, autorizacion: resultado.autorizacion }
    });
  } catch (err) {
    console.error('Error enviando al SRI:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CONSULTAR UNO
// ============================================================
router.post('/consultar/:id', requierePermiso('sri', 'consultar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
    if (!venta.clave_acceso) return res.status(400).json({ error: 'El documento no tiene clave de acceso' });

    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    const ambiente = config?.ambiente || '1';

    const resultado = await consultarAutorizacion(venta.clave_acceso, ambiente);
    const estadoNorm = normalizarEstadoSRI(resultado.estado);

    const updateData = { ultima_consulta_sri: new Date(), updatedAt: new Date() };

    if (resultado.exito) {
      updateData.estado_sri = 'AUTORIZADO';
      updateData.numero_autorizacion = resultado.numeroAutorizacion;
      if (resultado.fechaAutorizacion) {
        updateData.fecha_autorizacion = new Date(resultado.fechaAutorizacion);
      }
      if (resultado.comprobanteAutorizado) {
        updateData.xml_autorizado = resultado.comprobanteAutorizado;
      }
    } else if (ESTADOS_RECHAZADOS.has(estadoNorm) || estadoNorm === 'NO_AUTORIZADO') {
      updateData.estado_sri = 'RECHAZADA';
      updateData.mensajes_error_sri = resultado.autorizaciones?.[0]?.mensajes || [];
    }

    await req.db.collection('ventas_v2').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    res.json({
      success: resultado.exito,
      estado: estadoNorm || resultado.estado,
      numero_autorizacion: resultado.numeroAutorizacion || '',
      fecha_autorizacion: resultado.fechaAutorizacion || '',
      mensajes: resultado.autorizaciones?.[0]?.mensajes || []
    });
  } catch (err) {
    console.error('Error consultando:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// REINTENTAR UNO
// ============================================================
router.post('/reintentar/:id', requierePermiso('sri', 'enviar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    if (!['RECHAZADA', 'DEVUELTA', 'PENDIENTE'].includes(venta.estado_sri)) {
      return res.status(400).json({
        error: `No se puede reintentar un documento en estado ${venta.estado_sri}`
      });
    }
    if (!venta.xml_firmado) {
      return res.status(400).json({ error: 'El documento no tiene XML firmado' });
    }

    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    const ambiente = config?.ambiente || '1';

    const resultado = await enviarYAutorizar(venta.xml_firmado, venta.clave_acceso, ambiente);
    const clasificado = clasificarRespuesta(resultado);

    const updateData = {
      estado_sri: clasificado.nuevoEstado,
      intentos_envio_sri: (venta.intentos_envio_sri || 0) + 1,
      ultimo_envio_sri: new Date(),
      mensajes_error_sri: clasificado.mensajesError,
      updatedAt: new Date()
    };
    if (clasificado.numeroAutorizacion) {
      updateData.numero_autorizacion = clasificado.numeroAutorizacion;
    }
    if (clasificado.numeroAutorizacion && clasificado.fechaAutorizacion) {
      updateData.fecha_autorizacion = new Date(clasificado.fechaAutorizacion);
    }

    await req.db.collection('ventas_v2').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    await logAudit(req.db, req, {
      accion: 'reintentar-sri',
      coleccion: 'ventas',
      documentoId: id,
      documentoNumero: venta.numero_factura || '',
      detalle: `Reintento al SRI (${clasificado.nuevoEstado}): ${venta.numero_factura}`
    });

    res.json({
      success: resultado.exito,
      estado: clasificado.nuevoEstado,
      numero_autorizacion: clasificado.numeroAutorizacion,
      mensajes: clasificado.mensajesError
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENVIAR PENDIENTES (MASIVO) — ✅ FIX: en background con 202
// ============================================================
router.post('/enviar-pendientes', requierePermiso('sri', 'enviar'), async (req, res) => {
  if (hayJobEnCurso()) {
    const activos = [...jobsSriEnCurso.entries()]
      .filter(([, j]) => j.estado === 'iniciando' || j.estado === 'procesando')
      .map(([id, j]) => ({ id, estado: j.estado, procesados: j.procesados, total: j.total }));
    return res.status(409).json({
      error: 'Ya hay un envío masivo en curso. Espere a que termine.',
      codigo: 'JOB_EN_CURSO',
      jobs: activos
    });
  }

  const jobId = `sri-${++jobSriSecuencial}-${Date.now().toString(36)}`;
  const job = {
    iniciado: new Date(),
    estado: 'iniciando',
    total: 0,
    procesados: 0,
    autorizados: 0,
    rechazados: 0,
    errores: 0,
    iniciadoPor: req.user?.email || 'anónimo'
  };
  jobsSriEnCurso.set(jobId, job);

  // Responder 202 de inmediato
  res.status(202).json({
    success: true,
    message: 'Envío masivo iniciado. El progreso se emitirá por WebSocket (eventos: sri-progreso, sri-completado, sri-error).',
    jobId,
    nota: 'Escucha el evento sri-completado para conocer el resumen final.'
  });

  // Procesar en background
  (async () => {
    const jobActual = jobsSriEnCurso.get(jobId);
    try {
      const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
      const ambiente = config?.ambiente || '1';
      const limite = Math.min(parseInt(req.body?.limite || 50, 10), 100);

      const pendientes = await req.db.collection('ventas_v2')
        .find({
          estado_sri: 'FIRMADO',
          xml_firmado: { $exists: true, $ne: '' },
          clave_acceso: { $exists: true, $ne: '' }
        })
        .limit(limite)
        .toArray();

      const total = pendientes.length;
      jobActual.estado = 'procesando';
      jobActual.total = total;

      const resultados = [];

      if (req.io) {
        req.io.emit('sri-progreso', {
          jobId, tipo: 'inicio', total, procesados: 0,
          autorizados: 0, rechazados: 0, errores: 0
        });
      }

      for (let i = 0; i < pendientes.length; i++) {
        const venta = pendientes[i];
        try {
          const r = await enviarYAutorizar(venta.xml_firmado, venta.clave_acceso, ambiente);
          const clasificado = clasificarRespuesta(r);

          if (clasificado.nuevoEstado === 'AUTORIZADO') jobActual.autorizados++;
          else if (['RECHAZADA', 'DEVUELTA'].includes(clasificado.nuevoEstado)) jobActual.rechazados++;

          const upd = {
            estado_sri: clasificado.nuevoEstado,
            intentos_envio_sri: (venta.intentos_envio_sri || 0) + 1,
            ultimo_envio_sri: new Date(),
            updatedAt: new Date()
          };
          if (clasificado.numeroAutorizacion) upd.numero_autorizacion = clasificado.numeroAutorizacion;
          if (clasificado.numeroAutorizacion && clasificado.fechaAutorizacion) {
            upd.fecha_autorizacion = new Date(clasificado.fechaAutorizacion);
          }
          if (clasificado.mensajesError.length > 0) {
            upd.mensajes_error_sri = clasificado.mensajesError;
          }

          await req.db.collection('ventas_v2').updateOne(
            { _id: venta._id }, { $set: upd }
          );

          resultados.push({
            id: venta._id, numero: venta.numero_factura,
            estado: clasificado.nuevoEstado, exito: r.exito,
            numeroAutorizacion: clasificado.numeroAutorizacion
          });
        } catch (e) {
          jobActual.errores++;
          resultados.push({
            id: venta._id, numero: venta.numero_factura,
            estado: 'ERROR', error: e.message
          });
        }

        jobActual.procesados = i + 1;

        if (req.io) {
          req.io.emit('sri-progreso', {
            jobId, tipo: 'item', procesados: i + 1, total,
            autorizados: jobActual.autorizados,
            rechazados: jobActual.rechazados,
            errores: jobActual.errores,
            item: resultados[resultados.length - 1]
          });
        }

        if (i < pendientes.length - 1) {
          await new Promise(r => setTimeout(r, 800));
        }
      }

      await logAudit(req.db, req, {
        accion: 'enviar-sri-masivo',
        coleccion: 'ventas',
        documentoNumero: `${total} documentos`,
        detalle: `Envío masivo (job ${jobId}): ${jobActual.autorizados} autorizados, ${jobActual.rechazados} rechazados, ${jobActual.errores} errores`
      });

      if (req.io) {
        req.io.emit('sri-completado', {
          jobId, total,
          autorizados: jobActual.autorizados,
          rechazados: jobActual.rechazados,
          errores: jobActual.errores,
          resultados
        });
      }

      jobActual.estado = 'completado';
      jobActual.finalizado = new Date();
    } catch (err) {
      jobActual.estado = 'error';
      jobActual.error = err.message;
      jobActual.finalizado = new Date();
      console.error('Error en job SRI masivo:', err);
      if (req.io) req.io.emit('sri-error', { jobId, error: err.message });
    } finally {
      // Limpiar el job tras 5 minutos (permite consultarlo por un rato).
      setTimeout(() => jobsSriEnCurso.delete(jobId), 5 * 60 * 1000);
    }
  })();
});

// Endpoint para consultar jobs (activos o recientes)
router.get('/jobs', requierePermiso('sri', 'ver'), async (req, res) => {
  const jobs = [...jobsSriEnCurso.entries()].map(([id, j]) => ({ id, ...j }));
  res.json({ jobs });
});

// ============================================================
// ESTADÍSTICAS
// ============================================================
router.get('/estadisticas', requierePermiso('sri', 'ver'), async (req, res) => {
  try {
    const stats = await req.db.collection('ventas_v2').aggregate([
      { $group: { _id: '$estado_sri', cantidad: { $sum: 1 }, total: { $sum: '$total' } } },
      { $sort: { cantidad: -1 } }
    ]).toArray();

    const topErrores = await req.db.collection('ventas_v2').aggregate([
      { $match: { estado_sri: { $in: ['RECHAZADA', 'DEVUELTA'] }, mensajes_error_sri: { $exists: true, $ne: [] } } },
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
    ]).toArray();

    res.json({ porEstado: stats, topErrores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;