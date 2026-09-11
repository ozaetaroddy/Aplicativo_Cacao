// backend/utils/emailService.js
const nodemailer = require('nodemailer');

/**
 * Crea un transporter de Nodemailer usando las variables de entorno.
 * Variables necesarias:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
function crearTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true para 465, false para 587/25
    auth: { user, pass },
    tls: {
      // No fallar por certificados autofirmados
      rejectUnauthorized: false
    }
  });
}

/**
 * Envía el comprobante electrónico al cliente.
 * @param {object} options
 * @param {object} options.config - Configuración de la empresa
 * @param {object} options.documento - Documento (venta)
 * @param {object} options.cliente - Cliente
 * @param {Buffer} options.pdfBuffer - PDF del RIDE
 * @param {Buffer} options.xmlBuffer - XML firmado
 * @param {string} options.emailDestino - Email del cliente
 * @param {string} options.asunto - Asunto personalizado (opcional)
 * @param {string} options.mensaje - Mensaje personalizado (opcional)
 */
async function enviarComprobantePorEmail(options) {
  const {
    config,
    documento,
    cliente,
    pdfBuffer,
    xmlBuffer,
    emailDestino,
    asunto,
    mensaje
  } = options;

  const transporter = crearTransporter();
  if (!transporter) {
    throw new Error('Servicio de email no configurado. Contacte al administrador.');
  }

  if (!emailDestino) {
    throw new Error('No se especificó un email de destino');
  }

  const razonSocialEmisor = config?.razon_social || "System Ozaet's Electronics";
  const rucEmisor = config?.ruc || '';
  const nombreCliente = cliente?.nombre || 'Estimado cliente';
  const numeroDoc = documento?.numero_factura || documento?.numero_guia || 'N/A';
  const tipoDoc = (documento?.tipo_documento || 'factura').toUpperCase();
  const total = parseFloat(documento?.total || 0).toFixed(2);
  const fecha = documento?.fecha_emision
    ? new Date(documento.fecha_emision).toLocaleDateString('es-EC')
    : '';
  const numeroAutorizacion = documento?.numero_autorizacion || '';
  const claveAcceso = documento?.clave_acceso || '';

  const asuntoFinal = asunto || `Comprobante Electrónico ${tipoDoc} Nº ${numeroDoc} - ${razonSocialEmisor}`;
  const mensajeFinal = mensaje || `Estimado(a) ${nombreCliente},\n\nAdjuntamos su comprobante electrónico ${tipoDoc} Nº ${numeroDoc}, emitido el ${fecha} por un valor total de $${total}.\n\nEl comprobante ha sido autorizado por el SRI y tiene plena validez legal.\n\nGracias por su preferencia.\n\n${razonSocialEmisor}`;

  // HTML del email
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a3a5c, #2c3e50); padding: 24px 30px; color: #fff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .content { padding: 30px; color: #333; line-height: 1.6; font-size: 14px; }
    .greeting { font-size: 16px; font-weight: 600; color: #1a3a5c; margin-bottom: 12px; }
    .info-box { background: #f8f9fa; border-left: 4px solid #3498db; padding: 16px; border-radius: 6px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e9ecef; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #666; font-weight: 600; }
    .info-value { color: #1a1a1a; font-weight: 500; }
    .total-box { background: linear-gradient(135deg, #1a3a5c, #2c3e50); color: #fff; padding: 18px 24px; border-radius: 8px; text-align: center; margin: 20px 0; }
    .total-box .label { font-size: 12px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; }
    .total-box .amount { font-size: 32px; font-weight: 800; margin-top: 4px; }
    .adjuntos { background: #ecf9f0; border-left: 4px solid #27ae60; padding: 14px 16px; border-radius: 6px; margin: 20px 0; font-size: 13px; }
    .adjuntos ul { margin: 8px 0 0 0; padding-left: 20px; }
    .footer { background: #f8f9fa; padding: 20px 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e9ecef; }
    .clave { font-family: monospace; font-size: 11px; word-break: break-all; color: #666; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${razonSocialEmisor}</h1>
      <p>RUC: ${rucEmisor}</p>
    </div>

    <div class="content">
      <div class="greeting">Hola, ${nombreCliente}</div>
      <p>Adjuntamos su comprobante electrónico <strong>${tipoDoc} Nº ${numeroDoc}</strong> autorizado por el SRI.</p>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Documento:</span>
          <span class="info-value">${tipoDoc} ${numeroDoc}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Fecha:</span>
          <span class="info-value">${fecha}</span>
        </div>
        ${numeroAutorizacion ? `
        <div class="info-row">
          <span class="info-label">Nº Autorización:</span>
          <span class="info-value">${numeroAutorizacion}</span>
        </div>
        ` : ''}
      </div>

      <div class="total-box">
        <div class="label">Total a pagar</div>
        <div class="amount">$${total}</div>
      </div>

      <div class="adjuntos">
        <strong>📎 Archivos adjuntos:</strong>
        <ul>
          <li><strong>RIDE.pdf</strong> — Representación impresa del comprobante</li>
          ${xmlBuffer ? '<li><strong>Comprobante.xml</strong> — Archivo XML firmado electrónicamente</li>' : ''}
        </ul>
      </div>

      ${claveAcceso ? `
      <p style="font-size: 12px; color: #666;">
        <strong>Clave de acceso:</strong>
        <div class="clave">${claveAcceso}</div>
      </p>
      ` : ''}

      ${mensaje && mensaje !== mensajeFinal ? `<p>${mensaje}</p>` : ''}
    </div>

    <div class="footer">
      <p>Este correo fue generado automáticamente por Sistema Contable.</p>
      <p>${razonSocialEmisor} — RUC: ${rucEmisor}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  // Adjuntos
  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename: `${numeroDoc}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    });
  }
  if (xmlBuffer) {
    attachments.push({
      filename: `${claveAcceso || numeroDoc}.xml`,
      content: xmlBuffer,
      contentType: 'application/xml'
    });
  }

  const info = await transporter.sendMail({
    from: `"${razonSocialEmisor}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: emailDestino,
    subject: asuntoFinal,
    text: mensajeFinal,
    html: htmlBody,
    attachments
  });

  return {
    success: true,
    messageId: info.messageId,
    destinatario: emailDestino,
    adjuntos: attachments.length
  };
}

/**
 * Verifica la conexión con el servidor SMTP.
 */
async function verificarConexion() {
  const transporter = crearTransporter();
  if (!transporter) {
    return { ok: false, error: 'SMTP no configurado (faltan variables de entorno)' };
  }
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { enviarComprobantePorEmail, verificarConexion, crearTransporter };