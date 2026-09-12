// backend/utils/emailService.js
const nodemailer = require('nodemailer');

let transporterGlobal = null;

// 🔒 Escape HTML: previene inyección en el correo
function escHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function crearTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  // 🔒 TLS estricto por defecto. Activar solo si hay cert autofirmado en el SMTP.
  const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false';

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    tls: { rejectUnauthorized },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });
}

function obtenerTransporter() {
  if (!transporterGlobal) transporterGlobal = crearTransporter();
  return transporterGlobal;
}

// ============================================================
// HTML del email (todos los valores escapados)
// ============================================================
function generarHTML(options) {
  const {
    razonSocialEmisor, rucEmisor, nombreCliente,
    tipoDoc, numeroDoc, fecha, total,
    numeroAutorizacion, claveAcceso, xmlBuffer
  } = options;

  const razonSocialEsc = escHtml(razonSocialEmisor);
  const rucEsc = escHtml(rucEmisor);
  const nombreClienteEsc = escHtml(nombreCliente);
  const tipoDocEsc = escHtml(tipoDoc);
  const numeroDocEsc = escHtml(numeroDoc);
  const fechaEsc = escHtml(fecha);
  const totalEsc = escHtml(total);
  const numeroAutorizacionEsc = escHtml(numeroAutorizacion);
  const claveAccesoEsc = escHtml(claveAcceso);

  return `<!DOCTYPE html>
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
    .footer { background: #f8f9fa; padding: 20px 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e9ecef; }
    .clave { font-family: monospace; font-size: 11px; word-break: break-all; color: #666; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${razonSocialEsc}</h1>
      <p>RUC: ${rucEsc}</p>
    </div>
    <div class="content">
      <div class="greeting">Hola, ${nombreClienteEsc}</div>
      <p>Adjuntamos su comprobante electrónico <strong>${tipoDocEsc} Nº ${numeroDocEsc}</strong> autorizado por el SRI.</p>

      <div class="info-box">
        <div class="info-row"><span class="info-label">Documento:</span><span class="info-value">${tipoDocEsc} ${numeroDocEsc}</span></div>
        <div class="info-row"><span class="info-label">Fecha:</span><span class="info-value">${fechaEsc}</span></div>
        ${numeroAutorizacion ? `<div class="info-row"><span class="info-label">Nº Autorización:</span><span class="info-value">${numeroAutorizacionEsc}</span></div>` : ''}
      </div>

      <div class="total-box">
        <div class="label">Total a pagar</div>
        <div class="amount">$${totalEsc}</div>
      </div>

      <div class="adjuntos">
        <strong>📎 Archivos adjuntos:</strong>
        <ul style="margin: 8px 0 0 0; padding-left: 20px;">
          <li><strong>RIDE.pdf</strong> — Representación impresa del comprobante</li>
          ${xmlBuffer ? '<li><strong>Comprobante.xml</strong> — Archivo XML firmado electrónicamente</li>' : ''}
        </ul>
      </div>

      ${claveAcceso ? `<p style="font-size: 12px; color: #666;"><strong>Clave de acceso:</strong><div class="clave">${claveAccesoEsc}</div></p>` : ''}
    </div>
    <div class="footer">
      <p>Este correo fue generado automáticamente por Sistema Contable.</p>
      <p>${razonSocialEsc} — RUC: ${rucEsc}</p>
    </div>
  </div>
</body>
</html>`.trim();
}

async function enviarComprobantePorEmail(options) {
  const {
    config, documento, cliente, pdfBuffer, xmlBuffer,
    emailDestino, asunto, mensaje
  } = options;

  const transporter = obtenerTransporter();
  if (!transporter) throw new Error('Servicio de email no configurado. Contacte al administrador.');
  if (!emailDestino) throw new Error('No se especificó un email de destino');

  const razonSocialEmisor = config?.razon_social || 'Sistema Contable';
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
  const mensajeFinal = mensaje || `Estimado(a) ${nombreCliente},\n\nAdjuntamos su comprobante electrónico ${tipoDoc} Nº ${numeroDoc}, emitido el ${fecha} por un valor total de $${total}.\n\n${razonSocialEmisor}`;

  const htmlBody = generarHTML({
    razonSocialEmisor, rucEmisor, nombreCliente,
    tipoDoc, numeroDoc, fecha, total,
    numeroAutorizacion, claveAcceso, xmlBuffer
  });

  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename: `RIDE_${numeroDoc}.pdf`,
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

  const mailOptions = {
    from: `"${razonSocialEmisor}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: emailDestino,
    subject: asuntoFinal,
    text: mensajeFinal,
    html: htmlBody,
    attachments
  };

  let ultimoError = null;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      return {
        success: true,
        messageId: info.messageId,
        destinatario: emailDestino,
        adjuntos: attachments.length
      };
    } catch (err) {
      ultimoError = err;
      console.warn(`Intento ${intento}/3 de envío falló: ${err.message}`);
      if (intento < 3) await new Promise(r => setTimeout(r, 1500 * intento));
    }
  }

  throw new Error('No se pudo enviar el email: ' + ultimoError.message);
}

async function verificarConexion() {
  const transporter = obtenerTransporter();
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

module.exports = { enviarComprobantePorEmail, verificarConexion, crearTransporter, escHtml };