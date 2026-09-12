// backend/routes/sri.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { enviarRecepcion, consultarAutorizacion, enviarYAutorizar, probarConexion } = require('../utils/sriWebService');
const { validarEstructuraClave } = require('../utils/claveAcceso');

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

    // ⚠️  Construcción condicional para NO escribir `undefined` en Mongo
    const updateData = {
      estado_sri: nuevoEstado,
      intentos_envio_sri: (venta.intentos_envio_sri || 0) + 1,
      ultimo_envio_sri: new Date(),
      respuesta_sri: {
        fase: resultado.fase,
        recepcion: resultado.recepcion ? {
          estado: resultado.recepcion.estado,
          mensajes: resultado.recepcion.comprobantes?.[0]?.mensajes || []
        } : null,
        autorizacion: resultado.autorizacion ? {
          estado: resultado.autorizacion.estado,
          mensajes: resultado.autorizacion.autorizaciones?.[0]?.mensajes || []
        } : null
      },
      updatedAt: new Date()
    };

    if (numeroAutorizacion) {
      updateData.numero_autorizacion = numeroAutorizacion;
      updateData.fecha_autorizacion = new Date(fechaAutorizacion);
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
      detalle: `Enviado al SRI (${nuevoEstado}): ${venta.numero_factura}${numeroAutorizacion ? ' - Aut: ' + numeroAutorizacion : ''}`
    });

    if (req.io) {
      req.io.emit('sri-documento-actualizado', {
        id, estado: nuevoEstado, numeroAutorizacion, numero_factura: venta.numero_factura
      });
    }

    res.json({
      success: resultado.exito,
      estado: nuevoEstado,
      numero_autorizacion: numeroAutorizacion,
      fecha_autorizacion: fechaAutorizacion,
      mensajes: mensajesError,
      detalle: { fase: resultado.fase, recepcion: resultado.recepcion, autorizacion: resultado.autorizacion }
    });
  } catch (err) {
    console.error('Error enviando al SRI:', err);
    res.status(500).json({ error: err.message });
  }
});

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
    } else if (['RECHAZADA', 'NO AUTORIZADO'].includes(resultado.estado)) {
      updateData.estado_sri = 'RECHAZADA';
      updateData.mensajes_error_sri = resultado.autorizaciones?.[0]?.mensajes || [];
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
      mensajes: resultado.autorizaciones?.[0]?.mensajes || []
    });
  } catch (err) {
    console.error('Error consultando:', err);
    res.status(500).json({ error: err.message });
  }
});

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

    let nuevoEstado = 'PENDIENTE';
    let numeroAutorizacion = '';
    let mensajesError = [];

    if (resultado.exito) {
      nuevoEstado = 'AUTORIZADO';
      numeroAutorizacion = resultado.autorizacion.numeroAutorizacion;
    } else if (resultado.fase === 'recepcion') {
      nuevoEstado = resultado.recepcion.estado === 'DEVUELTA' ? 'DEVUELTA' : 'RECHAZADA';
      mensajesError = resultado.recepcion.comprobantes[0]?.mensajes || [];
    } else {
      nuevoEstado = resultado.autorizacion?.estado === 'RECHAZADA' ? 'RECHAZADA' : 'PENDIENTE';
      mensajesError = resultado.autorizacion?.autorizaciones[0]?.mensajes || [];
    }

    // Construcción condicional — sin `undefined`
    const updateData = {
      estado_sri: nuevoEstado,
      numero_autorizacion: numeroAutorizacion,
      intentos_envio_sri: (venta.intentos_envio_sri || 0) + 1,
      ultimo_envio_sri: new Date(),
      mensajes_error_sri: mensajesError,
      updatedAt: new Date()
    };
    if (numeroAutorizacion && resultado.autorizacion?.fechaAutorizacion) {
      updateData.fecha_autorizacion = new Date(resultado.autorizacion.fechaAutorizacion);
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
      detalle: `Reintento al SRI (${nuevoEstado}): ${venta.numero_factura}`
    });

    res.json({
      success: resultado.exito,
      estado: nuevoEstado,
      numero_autorizacion: numeroAutorizacion,
      mensajes: mensajesError
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/enviar-pendientes', requierePermiso('sri', 'enviar'), async (req, res) => {
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
    const resultados = [];
    let autorizados = 0;
    let rechazados = 0;
    let errores = 0;

    if (req.io) {
      req.io.emit('sri-progreso', {
        tipo: 'inicio', total, procesados: 0, autorizados: 0, rechazados: 0, errores: 0
      });
    }

    for (let i = 0; i < pendientes.length; i++) {
      const venta = pendientes[i];
      try {
        const r = await enviarYAutorizar(venta.xml_firmado, venta.clave_acceso, ambiente);

        let nuevoEstado = 'PENDIENTE';
        let numeroAutorizacion = '';

        if (r.exito) {
          nuevoEstado = 'AUTORIZADO';
          numeroAutorizacion = r.autorizacion.numeroAutorizacion;
          autorizados++;
        } else if (r.fase === 'recepcion') {
          nuevoEstado = r.recepcion.estado === 'DEVUELTA' ? 'DEVUELTA' : 'RECHAZADA';
          rechazados++;
        } else {
          nuevoEstado = r.autorizacion?.estado === 'RECHAZADA' ? 'RECHAZADA' : 'PENDIENTE';
          if (nuevoEstado === 'RECHAZADA') rechazados++;
        }

        const upd = {
          estado_sri: nuevoEstado,
          numero_autorizacion: numeroAutorizacion,
          intentos_envio_sri: (venta.intentos_envio_sri || 0) + 1,
          ultimo_envio_sri: new Date(),
          updatedAt: new Date()
        };
        if (numeroAutorizacion && r.autorizacion?.fechaAutorizacion) {
          upd.fecha_autorizacion = new Date(r.autorizacion.fechaAutorizacion);
        }

        await req.db.collection('ventas_v2').updateOne(
          { _id: venta._id },
          { $set: upd }
        );

        resultados.push({
          id: venta._id, numero: venta.numero_factura,
          estado: nuevoEstado, exito: r.exito, numeroAutorizacion
        });
      } catch (e) {
        errores++;
        resultados.push({
          id: venta._id, numero: venta.numero_factura,
          estado: 'ERROR', error: e.message
        });
      }

      if (req.io) {
        req.io.emit('sri-progreso', {
          tipo: 'item', procesados: i + 1, total,
          autorizados, rechazados, errores,
          item: resultados[resultados.length - 1]
        });
      }

      if (i < pendientes.length - 1) {
        await new Promise(r => setTimeout(r, 800));
      }
    }

    if (req.io) {
      req.io.emit('sri-completado', { total, autorizados, rechazados, errores });
    }

    await logAudit(req.db, req, {
      accion: 'enviar-sri-masivo',
      coleccion: 'ventas',
      documentoNumero: `${total} documentos`,
      detalle: `Envío masivo: ${autorizados} autorizados, ${rechazados} rechazados, ${errores} errores`
    });

    res.json({ total, autorizados, rechazados, errores, resultados });
  } catch (err) {
    console.error('Error en envío masivo:', err);
    if (req.io) req.io.emit('sri-error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

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