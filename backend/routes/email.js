// backend/routes/email.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');
const { enviarComprobantePorEmail, verificarConexion } = require('../utils/emailService');

// Límites alineados con express.json({ limit: '20mb' }) en server.js
// Dejamos espacio para el resto del payload (asunto, mensaje, xml) → 12 MB base64 (~9 MB binarios)
const MAX_PDF_BASE64_LEN = 12 * 1024 * 1024;
const MAX_XML_BYTES = 5 * 1024 * 1024;
const MAX_EMAIL_LEN = 200;
const MAX_ASUNTO_LEN = 200;
const MAX_MENSAJE_LEN = 5000;

function esEmailBasico(email) {
  if (typeof email !== 'string' || email.length === 0 || email.length > MAX_EMAIL_LEN) return false;
  if (/[\r\n]/.test(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email);
}

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

router.post('/enviar/:ventaId', requierePermiso('ventas', 'ver'), async (req, res) => {
  try {
    const { ventaId } = req.params;
    const { email, asunto, mensaje, incluir_pdf = true, incluir_xml = true, pdf_base64 } = req.body;

    if (!ObjectId.isValid(ventaId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    if (email !== undefined && email !== null && email !== '') {
      if (typeof email !== 'string' || email.length > MAX_EMAIL_LEN) {
        return res.status(400).json({ error: 'email inválido' });
      }
      if (!esEmailBasico(email)) {
        return res.status(400).json({ error: 'Formato de email inválido' });
      }
    }

    if (asunto !== undefined && asunto !== null) {
      if (typeof asunto !== 'string' || asunto.length > MAX_ASUNTO_LEN) {
        return res.status(400).json({ error: `asunto inválido (máx ${MAX_ASUNTO_LEN} caracteres)` });
      }
    }

    if (mensaje !== undefined && mensaje !== null) {
      if (typeof mensaje !== 'string' || mensaje.length > MAX_MENSAJE_LEN) {
        return res.status(400).json({ error: `mensaje inválido (máx ${MAX_MENSAJE_LEN} caracteres)` });
      }
    }

    if (pdf_base64 !== undefined && pdf_base64 !== null) {
      if (typeof pdf_base64 !== 'string') {
        return res.status(400).json({ error: 'pdf_base64 debe ser string' });
      }
      if (pdf_base64.length > MAX_PDF_BASE64_LEN) {
        return res.status(413).json({
          error: `El PDF es demasiado grande. Máximo: ~${Math.round(MAX_PDF_BASE64_LEN / 1024 / 1024)} MB en base64.`
        });
      }
    }

    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(ventaId) });
    if (!venta) return res.status(404).json({ error: 'Documento no encontrado' });

    const cliente = await req.db.collection('clientes').findOne({ _id: venta.clienteId });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });

    const emailDestino = email || cliente.email;
    if (!emailDestino) {
      return res.status(400).json({ error: 'El cliente no tiene email. Especifique uno.' });
    }
    if (!esEmailBasico(emailDestino)) {
      return res.status(400).json({ error: 'El email destino tiene formato inválido' });
    }

    let pdfBuffer = null;
    let xmlBuffer = null;

    if (incluir_xml && venta.xml_firmado) {
      xmlBuffer = Buffer.from(venta.xml_firmado, 'utf-8');
    } else if (incluir_xml && venta.xml_generado) {
      xmlBuffer = Buffer.from(venta.xml_generado, 'utf-8');
    }
    if (xmlBuffer && xmlBuffer.length > MAX_XML_BYTES) {
      return res.status(413).json({ error: 'El XML adjunto excede el tamaño máximo permitido.' });
    }

    if (incluir_pdf && pdf_base64) {
      try {
        pdfBuffer = Buffer.from(pdf_base64, 'base64');
      } catch (e) {
        return res.status(400).json({ error: 'pdf_base64 inválido' });
      }
      if (pdfBuffer.length === 0) pdfBuffer = null;
    }

    const resultado = await enviarComprobantePorEmail({
      config, documento: venta, cliente,
      pdfBuffer, xmlBuffer, emailDestino, asunto, mensaje
    });

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
        $set: { ultimo_envio_email: new Date(), updatedAt: new Date() }
      }
    );

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