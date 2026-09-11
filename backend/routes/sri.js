// backend/routes/sri.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { logAudit } = require('../utils/audit');
const { enviarRecepcion, consultarAutorizacion, enviarYAutorizar } = require('../utils/sriWebService');

// ============================================================
// ESTADO GENERAL DEL SRI
// ============================================================
router.get('/estado', async (req, res) => {
  try {
    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    const cert = await req.db.collection('certificados').findOne(
      { _id: 'empresa' },
      { projection: { archivo_base64: 0, password: 0 } }
    );

    // Contar documentos por estado
    const [pendientes, firmados, autorizados, rechazados] = await Promise.all([
      req.db.collection('ventas_v2').countDocuments({ estado_sri: 'PENDIENTE' }),
      req.db.collection('ventas_v2').countDocuments({ estado_sri: 'FIRMADO' }),
      req.db.collection('ventas_v2').countDocuments({ estado_sri: 'AUTORIZADO' }),
      req.db.collection('ventas_v2').countDocuments({ estado_sri: { $in: ['RECHAZADA', 'DEVUELTA'] } })
    ]);

    res.json({
      ambiente: config?.ambiente || '1',
      ambienteNombre: (config?.ambiente === '2') ? 'Producción' : 'Pruebas',
      tieneCertificado: !!cert,
      certificadoVence: cert?.info?.validityNotAfter || null,
      documentos: {
        pendientes,
        firmados,
        autorizados,
        rechazados
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENVIAR UN COMPROBANTE AL SRI
// ============================================================
router.post('/enviar/:id', async (req, res) => {
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

    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    const ambiente = config?.ambiente || '1';

    // Enviar y esperar autorización
    const resultado = await enviarYAutorizar(venta.xml_firmado, venta.clave_acceso, ambiente);

    // Determinar nuevo estado
    let nuevoEstado = 'PENDIENTE';
    let numeroAutorizacion = '';
    let fechaAutorizacion = '';
    let mensajesError = [];

    if (resultado.exito) {
      nuevoEstado = 'AUTORIZADO';
      numeroAutorizacion = resultado.autorizacion.numeroAutorizacion;
      fechaAutorizacion = resultado.autorizacion.fechaAutorizacion;
    } else if (resultado.fase === 'recepcion') {
      nuevoEstado = resultado.recepcion.estado === 'DEVUELTA' ? 'DEVUELTA' : 'RECHAZADA';
      mensajesError = resultado.recepcion.comprobantes[0]?.mensajes || [];
    } else {
      nuevoEstado = resultado.autorizacion?.estado === 'RECHAZADA' ? 'RECHAZADA' : 'PENDIENTE';
      mensajesError = resultado.autorizacion?.autorizaciones[0]?.mensajes || [];
    }

    // Actualizar en BD
    const updateData = {
      estado_sri: nuevoEstado,
      intentos_envio_sri: (venta.intentos_envio_sri || 0) + 1,
      ultimo_envio_sri: new Date(),
      respuesta_sri: {
        fase: resultado.fase,
        recepcion: {
          estado: resultado.recepcion?.estado,
          mensajes: resultado.recepcion?.comprobantes[0]?.mensajes || []
        },
        autorizacion: resultado.autorizacion ? {
          estado: resultado.autorizacion.estado,
          mensajes: resultado.autorizacion.autorizaciones[0]?.mensajes || []
        } : null
      },
      updatedAt: new Date()
    };

    if (numeroAutorizacion) {
      updateData.numero_autorizacion = numeroAutorizacion;
      updateData.fecha_autorizacion = new Date(fechaAutorizacion);
      updateData.estado_sri = 'AUTORIZADO';
    }

    if (resultado.autorizacion?.comprobanteAutorizado) {
      updateData.xml_autorizado = resultado.autorizacion.comprobanteAutorizado;
    }

    if (mensajesError.length > 0) {
      updateData.mensajes_error_sri = mensajesError;
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
      detalle: `Enviado al SRI (${nuevoEstado}): ${venta.numero_factura || ''}${numeroAutorizacion ? ' - Aut: ' + numeroAutorizacion : ''}`
    });

    res.json({
      success: resultado.exito,
      estado: nuevoEstado,
      numero_autorizacion: numeroAutorizacion,
      fecha_autorizacion: fechaAutorizacion,
      mensajes: mensajesError,
      detalle: {
        fase: resultado.fase,
        recepcion: resultado.recepcion,
        autorizacion: resultado.autorizacion
      }
    });
  } catch (err) {
    console.error('Error enviando al SRI:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CONSULTAR AUTORIZACIÓN (para documentos pendientes)
// ============================================================
router.post('/consultar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    if (!venta.clave_acceso) {
      return res.status(400).json({ error: 'El documento no tiene clave de acceso' });
    }

    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    const ambiente = config?.ambiente || '1';

    const resultado = await consultarAutorizacion(venta.clave_acceso, ambiente);

    // Actualizar estado
    const updateData = {
      ultima_consulta_sri: new Date(),
      updatedAt: new Date()
    };

    if (resultado.exito) {
      updateData.estado_sri = 'AUTORIZADO';
      updateData.numero_autorizacion = resultado.numeroAutorizacion;
      updateData.fecha_autorizacion = new Date(resultado.fechaAutorizacion);
      if (resultado.comprobanteAutorizado) {
        updateData.xml_autorizado = resultado.comprobanteAutorizado;
      }
    } else if (resultado.estado === 'RECHAZADA' || resultado.estado === 'NO AUTORIZADO') {
      updateData.estado_sri = 'RECHAZADA';
      updateData.mensajes_error_sri = resultado.autorizaciones[0]?.mensajes || [];
    }

    await req.db.collection('ventas_v2').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    res.json({
      success: resultado.exito,
      estado: resultado.estado,
      numero_autorizacion: resultado.numeroAutorizacion || '',
      fecha_autorizacion: resultado.fechaAutorizacion || '',
      mensajes: resultado.autorizaciones[0]?.mensajes || []
    });
  } catch (err) {
    console.error('Error consultando:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENVÍO MASIVO (todos los firmados pendientes)
// ============================================================
router.post('/enviar-pendientes', async (req, res) => {
  try {
    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    const ambiente = config?.ambiente || '1';

    const pendientes = await req.db.collection('ventas_v2')
      .find({
        estado_sri: 'FIRMADO',
        xml_firmado: { $exists: true, $ne: '' },
        clave_acceso: { $exists: true, $ne: '' }
      })
      .limit(50)
      .toArray();

    const resultados = [];

    for (const venta of pendientes) {
      try {
        const r = await enviarYAutorizar(venta.xml_firmado, venta.clave_acceso, ambiente);

        let nuevoEstado = 'PENDIENTE';
        let numeroAutorizacion = '';

        if (r.exito) {
          nuevoEstado = 'AUTORIZADO';
          numeroAutorizacion = r.autorizacion.numeroAutorizacion;
        } else if (r.fase === 'recepcion') {
          nuevoEstado = r.recepcion.estado === 'DEVUELTA' ? 'DEVUELTA' : 'RECHAZADA';
        }

        await req.db.collection('ventas_v2').updateOne(
          { _id: venta._id },
          {
            $set: {
              estado_sri: nuevoEstado,
              numero_autorizacion: numeroAutorizacion,
              intentos_envio_sri: (venta.intentos_envio_sri || 0) + 1,
              ultimo_envio_sri: new Date(),
              updatedAt: new Date()
            }
          }
        );

        resultados.push({
          id: venta._id,
          numero: venta.numero_factura,
          estado: nuevoEstado,
          exito: r.exito
        });

        // Esperar 1 segundo entre cada envío (para no sobrecargar el SRI)
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        resultados.push({
          id: venta._id,
          numero: venta.numero_factura,
          estado: 'ERROR',
          error: e.message
        });
      }
    }

    res.json({
      total: pendientes.length,
      resultados
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;