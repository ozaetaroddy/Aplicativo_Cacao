// backend/routes/email.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');
const { enviarComprobantePorEmail, verificarConexion } = require('../utils/emailService');

// ============================================================
// VERIFICAR CONFIGURACIÓN SMTP
// ============================================================
router.get('/verificar', requierePermiso('usuarios', 'ver'), async (req, res) => {
  try {
    const resultado = await verificarConexion();
    res.json({
      configurado: !!process.env.SMTP_HOST,
      host: process.env.SMTP_HOST || null,
      from: process.env.SMTP_FROM || process.env.SMTP_USER || null,
      conexion: resultado
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENVIAR COMPROBANTE POR EMAIL
// ============================================================
router.post('/enviar/:ventaId', requierePermiso('ventas', 'ver'), async (req, res) => {
  try {
    const { ventaId } = req.params;
    const { email, asunto, mensaje, incluir_pdf = true, incluir_xml = true } = req.body;

    if (!ObjectId.isValid(ventaId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Cargar venta
    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(ventaId) });
    if (!venta) return res.status(404).json({ error: 'Documento no encontrado' });

    // Cargar cliente
    const cliente = await req.db.collection('clientes').findOne({ _id: venta.clienteId });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Cargar configuración de la empresa
    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });

    // Email destino (puede venir del body o del cliente)
    const emailDestino = email || cliente.email;
    if (!emailDestino) {
      return res.status(400).json({ error: 'El cliente no tiene email. Especifique uno.' });
    }

    // Generar PDF del RIDE (llamando al servicio de generación - se hace en el frontend, aquí aceptamos el buffer)
    // Por simplicidad, generamos aquí un PDF mínimo si se solicita
    let pdfBuffer = null;
    let xmlBuffer = null;

    // Adjuntar XML si está firmado
    if (incluir_xml && venta.xml_firmado) {
      xmlBuffer = Buffer.from(venta.xml_firmado, 'utf-8');
    } else if (incluir_xml && venta.xml_generado) {
      xmlBuffer = Buffer.from(venta.xml_generado, 'utf-8');
    }

    // Si en el body viene un PDF en base64 (generado en el frontend), usarlo
    if (incluir_pdf && req.body.pdf_base64) {
      pdfBuffer = Buffer.from(req.body.pdf_base64, 'base64');
    }

    // Enviar el correo
    const resultado = await enviarComprobantePorEmail({
      config,
      documento: venta,
      cliente,
      pdfBuffer,
      xmlBuffer,
      emailDestino,
      asunto,
      mensaje
    });

    // Guardar historial de envío
    await req.db.collection('ventas_v2').updateOne(
      { _id: new ObjectId(ventaId) },
      {
        $push: {
          envios_email: {
            email: emailDestino,
            fecha: new Date(),
            messageId: resultado.messageId,
            adjuntos: resultado.adjuntos,
            enviado_por: req.user.email
          }
        },
        $set: {
          ultimo_envio_email: new Date(),
          updatedAt: new Date()
        }
      }
    );

    // Auditoría
    await logAudit(req.db, req, {
      accion: 'enviar-email',
      coleccion: 'ventas',
      documentoId: ventaId,
      documentoNumero: venta.numero_factura || '',
      detalle: `Comprobante enviado por email a ${emailDestino}`
    });

    res.json({
      success: true,
      message: 'Comprobante enviado por email',
      messageId: resultado.messageId,
      destinatario: emailDestino,
      adjuntos: resultado.adjuntos
    });
  } catch (err) {
    console.error('Error enviando email:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// HISTORIAL DE ENVÍOS DE UN DOCUMENTO
// ============================================================
router.get('/historial/:ventaId', requierePermiso('ventas', 'ver'), async (req, res) => {
  try {
    const { ventaId } = req.params;
    if (!ObjectId.isValid(ventaId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const venta = await req.db.collection('ventas_v2').findOne(
      { _id: new ObjectId(ventaId) },
      { projection: { envios_email: 1, ultimo_envio_email: 1 } }
    );

    if (!venta) return res.status(404).json({ error: 'Documento no encontrado' });

    res.json({
      envios: venta.envios_email || [],
      ultimo_envio: venta.ultimo_envio_email || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;