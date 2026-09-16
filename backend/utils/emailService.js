// backend/utils/emailService.js
// ============================================================
// Envío de comprobantes por email
// ------------------------------------------------------------
// API pública:
//   enviarComprobantePorEmail(opts)  → { success, messageId, ... }
//   verificarConexion(opts)          → { ok, error?, cached? }
//   crearTransporter()               → Transporter | null
//   escHtml(str)                     → string seguro para HTML
//
// Extensiones:
//   limpiarTransporter()             → libera el pool SMTP
//   getMetricas()                    → snapshot de contadores
//   validarEmail(str)                → bool
//
// Configuración por variables de entorno:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   SMTP_TLS_REJECT_UNAUTHORIZED=false   → acepta cert autofirmado
//   EMAIL_MAX_ATTACHMENT_MB              → límite por adjunto
//   EMAIL_MAX_TOTAL_ATTACHMENT_MB        → límite total
//   EMAIL_TIMEOUT_MS                     → timeout global del send
//   EMAIL_RETRY_MAX                      → reintentos (default 3)
//   EMAIL_VERIFY_TTL_MS                  → caché de verificarConexion
// ============================================================
'use strict';

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

function envBool(nombre, fallback = false) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

const CONFIG = Object.freeze({
  /** Puerto SMTP por defecto. */
  puertoDefault: 587,

  /** Timeouts de red (ms). */
  connectionTimeoutMs: envNum('EMAIL_CONN_TIMEOUT_MS', 10_000),
  greetingTimeoutMs: envNum('EMAIL_GREET_TIMEOUT_MS', 10_000),
  socketTimeoutMs: envNum('EMAIL_SOCKET_TIMEOUT_MS', 20_000),

  /** Timeout del `sendMail` completo (promesa). */
  sendTimeoutMs: envNum('EMAIL_TIMEOUT_MS', 30_000),

  /** Pool SMTP. */
  maxConnections: envNum('EMAIL_POOL_MAX', 3),
  maxMessages: envNum('EMAIL_POOL_MAX_MSG', 50),

  /** Reintentos con backoff exponencial. */
  reintentosMax: envNum('EMAIL_RETRY_MAX', 3),
  retryBaseMs: envNum('EMAIL_RETRY_BASE_MS', 1500),

  /** Límite de adjuntos. */
  maxAttachmentBytes: envNum('EMAIL_MAX_ATTACHMENT_MB', 15) * 1024 * 1024,
  maxTotalAttachmentBytes: envNum('EMAIL_MAX_TOTAL_ATTACHMENT_MB', 20) * 1024 * 1024,

  /** Largo máximo del nombre del remitente. */
  maxNombreRemitente: 100,
  maxAsunto: 200,
  maxEmail: 254,

  /** TTL del cache de verificarConexion. */
  verifyTtlMs: envNum('EMAIL_VERIFY_TTL_MS', 30_000),

  /** Prefijos de archivo temporales (multipart). */
  tempPrefix: 'tmp-'
});

// ============================================================
// ERRORES TIPADOS
// ============================================================
function errorTipado(mensaje, codigo, status = 500) {
  const err = new Error(mensaje);
  err.codigo = codigo;
  err.status = status;
  return err;
}

// ============================================================
// CARGA LAZY DE NODEMAILER
// ============================================================
let _nodemailer = null;
function cargarNodemailer() {
  if (_nodemailer) return _nodemailer;
  try {
    // eslint-disable-next-line global-require
    _nodemailer = require('nodemailer');
    return _nodemailer;
  } catch (err) {
    log.error({ err: err.message }, 'nodemailer no está instalado');
    return null;
  }
}

// ============================================================
// HELPERS DE SANEO
// ============================================================
/**
 * Elimina caracteres de control y trunca a `max`.
 * Útil para asuntos, nombres y cualquier valor que vaya a headers.
 *
 * @param {*} s
 * @param {number} [max=200]
 * @returns {string}
 */
function sanitizarTexto(s, max = CONFIG.maxAsunto) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/[\r\n\0\u2028\u2029]/g, ' ')  // CRLF + line separators Unicode
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Escapa caracteres peligrosos para HTML.
 * Mantiene la firma original (`escHtml(str)`).
 *
 * @param {*} s
 * @returns {string}
 */
function escHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"'`]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;'
  }[c]));
}

/**
 * Sanitiza un nombre de remitente para el header `From:`.
 * - Quita comillas, angle brackets, backslashes y CRLF.
 * - Trunca a `maxNombreRemitente`.
 * @param {*} s
 * @returns {string}
 */
function sanitizarNombreRemitente(s) {
  return String(s || '')
    // Primero: CRLF y controles → espacio.
    .replace(/[\r\n\0\t]+/g, ' ')
    // Luego: quitar chars prohibidos en header.
    .replace(/["<>\\,;:]/g, '')
    // Colapsar espacios múltiples.
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CONFIG.maxNombreRemitente)
    || 'Sistema Contable';
}

/**
 * Sanitiza un nombre de archivo para adjuntos.
 * Conserva puntos, guiones, guiones bajos y alfanuméricos.
 * @param {*} s
 * @param {string} [fallback='archivo']
 * @returns {string}
 */
function sanitizarNombreArchivo(s, fallback = 'archivo') {
  const limpio = String(s || '')
    .replace(/[\r\n\0/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120)
    .replace(/^[._-]+/, '');
  return limpio || fallback;
}

/**
 * Formatea un monto como string con 2 decimales.
 * NUNCA devuelve `"NaN"`; si es inválido, devuelve `"0.00"`.
 * @param {*} n
 * @returns {string}
 */
function formatearMonto(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.00';
  return v.toFixed(2);
}

/**
 * Valida un email con regex simple.
 * @param {*} email
 * @returns {boolean}
 */
function validarEmail(email) {
  if (typeof email !== 'string' || email.length === 0) return false;
  if (email.length > CONFIG.maxEmail) return false;
  if (/[\r\n\0]/.test(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email);
}

// ============================================================
// TRANSPORTER (singleton con reset)
// ============================================================
let transporterGlobal = null;
let transporterCreadoEn = 0;

/** Convierte un puerto a número válido, con fallback. */
function validarPuerto(raw) {
  const n = parseInt(String(raw ?? CONFIG.puertoDefault), 10);
  if (!Number.isInteger(n) || n < 1 || n > 65_535) {
    log.warn({ raw }, 'SMTP_PORT inválido, usando default');
    return CONFIG.puertoDefault;
  }
  return n;
}

/**
 * Crea un transporter SMTP nuevo.
 * Devuelve `null` si falta configuración o nodemailer.
 * @returns {object|null}
 */
function crearTransporter() {
  const nodemailer = cargarNodemailer();
  if (!nodemailer) return null;

  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = process.env.SMTP_PASS || '';

  if (!host || !user || !pass) return null;

  const port = validarPuerto(process.env.SMTP_PORT);
  const secure = port === 465;
  const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false';

  if (!rejectUnauthorized && process.env.NODE_ENV === 'production') {
    log.warn(
      'SMTP_TLS_REJECT_UNAUTHORIZED=false en producción: acepta certificados no confiables'
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: CONFIG.maxConnections,
    maxMessages: CONFIG.maxMessages,
    tls: { rejectUnauthorized },
    connectionTimeout: CONFIG.connectionTimeoutMs,
    greetingTimeout: CONFIG.greetingTimeoutMs,
    socketTimeout: CONFIG.socketTimeoutMs
  });
}

/**
 * Devuelve el transporter global (o lo crea).
 * @returns {object|null}
 */
function obtenerTransporter() {
  if (!transporterGlobal) {
    transporterGlobal = crearTransporter();
    transporterCreadoEn = Date.now();
  }
  return transporterGlobal;
}

/**
 * Libera el pool del transporter global.
 * Útil en shutdown y tras cambios de config.
 */
function limpiarTransporter() {
  if (transporterGlobal && typeof transporterGlobal.close === 'function') {
    try { transporterGlobal.close(); } catch { /* noop */ }
  }
  transporterGlobal = null;
  transporterCreadoEn = 0;
}

// ============================================================
// MÉTRICAS
// ============================================================
const METRICAS = {
  enviados: 0,
  fallidos: 0,
  reintentos: 0,
  verificaciones: 0,
  verificacionesOk: 0
};

/** Snapshot de contadores. */
function getMetricas() {
  return { ...METRICAS };
}

// ============================================================
// GENERACIÓN DE HTML
// ============================================================
/**
 * Genera el HTML del correo con todos los valores escapados.
 * @param {object} options
 * @returns {string}
 */
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

// ============================================================
// ENVÍO CON REINTENTOS
// ============================================================
/** Sleep con `.unref()` para no retener el proceso. */
function dormir(ms) {
  return new Promise(resolve => {
    const t = setTimeout(resolve, ms);
    if (t.unref) t.unref();
  });
}

/** Envuelve una promesa con timeout. */
function conTimeout(promesa, ms, mensaje) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(errorTipado(mensaje || `Timeout después de ${ms}ms`, 'EMAIL_TIMEOUT', 504));
    }, ms);
    if (timer.unref) timer.unref();

    Promise.resolve(promesa).then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

/**
 * Determina si un error de SMTP es transitorio (vale reintentar).
 * Los códigos 4xx son transitorios; 5xx son permanentes.
 * @param {Error} err
 * @returns {boolean}
 */
function esErrorTransitorioSMTP(err) {
  if (!err) return false;

  // Códigos de respuesta SMTP: 4xx = transitorio, 5xx = permanente.
  if (typeof err.responseCode === 'number') {
    return err.responseCode >= 400 && err.responseCode < 500;
  }

  // Códigos de nodemailer para errores de red.
  const codigosTransitorios = new Set([
    'ECONNECTION', 'ECONNRESET', 'ETIMEDOUT',
    'ESOCKET', 'EDNS', 'EPROTOCOL', 'EAUTH'
  ]);
  if (err.code && codigosTransitorios.has(err.code)) return true;

  // Otros errores (validación, etc.) → no reintentar.
  return false;
}

/**
 * Ejecuta `sendMail` con reintentos exponenciales + jitter.
 * @param {object} transporter
 * @param {object} mailOptions
 * @returns {Promise<object>}
 */
async function enviarConReintentos(transporter, mailOptions) {
  const max = CONFIG.reintentosMax;
  let ultimoError = null;

  for (let intento = 1; intento <= max; intento++) {
    try {
      // Timeout global del sendMail (defensa contra SMTP lento).
      const info = await conTimeout(
        transporter.sendMail(mailOptions),
        CONFIG.sendTimeoutMs,
        `sendMail excedió ${CONFIG.sendTimeoutMs}ms`
      );
      return info;
    } catch (err) {
      ultimoError = err;

      const transitorio = esErrorTransitorioSMTP(err);
      const esUltimo = intento >= max;

      log.warn(
        { intento, max, transitorio, err: err.message },
        `Intento ${intento}/${max} de envío falló`
      );

      if (esUltimo || !transitorio) break;

      METRICAS.reintentos++;

      // Backoff exponencial con jitter (0.5 - 1.5 del valor esperado).
      const base = CONFIG.retryBaseMs * Math.pow(2, intento - 1);
      const delay = Math.round(base * (0.5 + Math.random()));
      await dormir(delay);
    }
  }

  throw errorTipado(
    `No se pudo enviar el email: ${ultimoError?.message || 'error desconocido'}`,
    'EMAIL_SEND_FAILED',
    502
  );
}

// ============================================================
// ENVÍO PRINCIPAL
// ============================================================
/**
 * Envía un comprobante por email con PDF y/o XML adjuntos.
 *
 * @param {object} options
 * @param {object} [options.config]      Configuración de empresa
 * @param {object} options.documento    Documento (venta, guía, etc.)
 * @param {object} options.cliente      Cliente (puede ser null)
 * @param {Buffer} [options.pdfBuffer]  PDF del RIDE
 * @param {Buffer} [options.xmlBuffer]  XML firmado
 * @param {string} options.emailDestino
 * @param {string} [options.asunto]
 * @param {string} [options.mensaje]
 * @param {string|string[]} [options.cc]
 * @param {string|string[]} [options.bcc]
 * @param {string} [options.replyTo]
 * @param {'high'|'normal'|'low'} [options.priority]
 * @param {object} [options.headers]
 * @returns {Promise<{success: true, messageId: string, destinatario: string, adjuntos: number}>}
 */
async function enviarComprobantePorEmail(options = {}) {
  const {
    config, documento, cliente, pdfBuffer, xmlBuffer,
    emailDestino, asunto, mensaje,
    cc, bcc, replyTo, priority, headers
  } = options;

  // ---- Validaciones ----
  const transporter = obtenerTransporter();
  if (!transporter) {
    throw errorTipado(
      'Servicio de email no configurado. Contacte al administrador.',
      'EMAIL_NO_CONFIGURADO',
      503
    );
  }
  if (!validarEmail(emailDestino)) {
    throw errorTipado(
      `Email de destino inválido: "${emailDestino}"`,
      'EMAIL_DESTINO_INVALIDO',
      400
    );
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!validarEmail(fromAddress)) {
    throw errorTipado(
      'SMTP_FROM / SMTP_USER no configurado o inválido',
      'EMAIL_FROM_INVALIDO',
      500
    );
  }

  // ---- Preparar datos para el template ----
  const razonSocialEmisor = config?.razon_social || 'Sistema Contable';
  const rucEmisor = config?.ruc || '';
  const nombreCliente = cliente?.nombre || 'Estimado cliente';
  const numeroDoc = documento?.numero_factura || documento?.numero_guia || 'N/A';
  const tipoDoc = String(documento?.tipo_documento || 'factura').toUpperCase();
  const total = formatearMonto(documento?.total);
  const fecha = documento?.fecha_emision
    ? new Date(documento.fecha_emision).toLocaleDateString('es-EC')
    : '';
  const numeroAutorizacion = documento?.numero_autorizacion || '';
  const claveAcceso = documento?.clave_acceso || '';

  // ---- Sanitizar subject y texto plano ----
  const asuntoFinal = sanitizarTexto(
    asunto || `Comprobante Electrónico ${tipoDoc} Nº ${numeroDoc} - ${razonSocialEmisor}`,
    CONFIG.maxAsunto
  );
  const mensajeFinal = typeof mensaje === 'string' && mensaje.trim()
    ? mensaje.trim().slice(0, 10_000)
    : `Estimado(a) ${nombreCliente},\n\nAdjuntamos su comprobante electrónico ${tipoDoc} Nº ${numeroDoc}, emitido el ${fecha} por un valor total de $${total}.\n\n${razonSocialEmisor}`;

  // ---- HTML ----
  const htmlBody = generarHTML({
    razonSocialEmisor, rucEmisor, nombreCliente,
    tipoDoc, numeroDoc, fecha, total,
    numeroAutorizacion, claveAcceso, xmlBuffer
  });

  // ---- Adjuntos (con validación de tamaño) ----
  const attachments = [];
  let totalBytes = 0;

  if (pdfBuffer) {
    if (!Buffer.isBuffer(pdfBuffer)) {
      throw errorTipado('pdfBuffer debe ser un Buffer', 'ADJUNTO_INVALIDO', 400);
    }
    if (pdfBuffer.length > CONFIG.maxAttachmentBytes) {
      throw errorTipado(
        `El PDF excede el límite permitido (${(CONFIG.maxAttachmentBytes / 1024 / 1024).toFixed(0)} MB)`,
        'ADJUNTO_DEMASIADO_GRANDE',
        413
      );
    }
    totalBytes += pdfBuffer.length;
    attachments.push({
      filename: `RIDE_${sanitizarNombreArchivo(numeroDoc, 'comprobante')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    });
  }

  if (xmlBuffer) {
    if (!Buffer.isBuffer(xmlBuffer)) {
      throw errorTipado('xmlBuffer debe ser un Buffer', 'ADJUNTO_INVALIDO', 400);
    }
    if (xmlBuffer.length > CONFIG.maxAttachmentBytes) {
      throw errorTipado(
        `El XML excede el límite permitido (${(CONFIG.maxAttachmentBytes / 1024 / 1024).toFixed(0)} MB)`,
        'ADJUNTO_DEMASIADO_GRANDE',
        413
      );
    }
    totalBytes += xmlBuffer.length;
    attachments.push({
      filename: `${sanitizarNombreArchivo(claveAcceso || numeroDoc, 'comprobante')}.xml`,
      content: xmlBuffer,
      contentType: 'application/xml'
    });
  }

  if (totalBytes > CONFIG.maxTotalAttachmentBytes) {
    throw errorTipado(
      `Los adjuntos superan el límite total (${(CONFIG.maxTotalAttachmentBytes / 1024 / 1024).toFixed(0)} MB)`,
      'ADJUNTOS_DEMASIADO_GRANDES',
      413
    );
  }

  // ---- Opciones finales ----
  const safeFrom = sanitizarNombreRemitente(razonSocialEmisor);

  const mailOptions = {
    from: `"${safeFrom}" <${fromAddress}>`,
    to: emailDestino,
    subject: asuntoFinal,
    text: mensajeFinal,
    html: htmlBody,
    attachments
  };

  // Opcionales.
  if (cc) mailOptions.cc = Array.isArray(cc) ? cc.join(', ') : cc;
  if (bcc) mailOptions.bcc = Array.isArray(bcc) ? bcc.join(', ') : bcc;
  if (replyTo && validarEmail(replyTo)) mailOptions.replyTo = replyTo;
  if (priority && ['high', 'normal', 'low'].includes(priority)) {
    mailOptions.priority = priority;
  }
  if (headers && typeof headers === 'object') {
    mailOptions.headers = headers;
  }

  // ---- Envío con reintentos ----
  try {
    const info = await enviarConReintentos(transporter, mailOptions);
    METRICAS.enviados++;

    return {
      success: true,
      messageId: info.messageId,
      destinatario: emailDestino,
      adjuntos: attachments.length
    };
  } catch (err) {
    METRICAS.fallidos++;
    throw err;
  }
}

// ============================================================
// VERIFICACIÓN DE CONEXIÓN (con caché)
// ============================================================
let _verifyCache = null; // { ok, error, expiresAt }

/**
 * Verifica la conexión SMTP.
 * Cachea el resultado durante `EMAIL_VERIFY_TTL_MS`.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.forzar=false]  Ignora la caché.
 * @returns {Promise<{ok: boolean, error?: string, cached?: boolean}>}
 */
async function verificarConexion(opts = {}) {
  const { forzar = false } = opts;

  if (!forzar && _verifyCache && _verifyCache.expiresAt > Date.now()) {
    return { ..._verifyCache.result, cached: true };
  }

  const transporter = obtenerTransporter();
  if (!transporter) {
    const result = { ok: false, error: 'SMTP no configurado (faltan variables de entorno)' };
    _verifyCache = { result, expiresAt: Date.now() + CONFIG.verifyTtlMs };
    return result;
  }

  METRICAS.verificaciones++;
  try {
    await transporter.verify();
    METRICAS.verificacionesOk++;
    const result = { ok: true };
    _verifyCache = { result, expiresAt: Date.now() + CONFIG.verifyTtlMs };
    return result;
  } catch (err) {
    const result = { ok: false, error: err.message };
    _verifyCache = { result, expiresAt: Date.now() + CONFIG.verifyTtlMs };
    return result;
  }
}

/** Invalida la caché de `verificarConexion`. */
function invalidarCacheVerify() {
  _verifyCache = null;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  enviarComprobantePorEmail,
  verificarConexion,
  crearTransporter,
  escHtml,

  // ---- Extensiones ----
  limpiarTransporter,
  getMetricas,
  validarEmail,
  invalidarCacheVerify,
  sanitizarNombreRemitente,
  sanitizarNombreArchivo,
  sanitizarTexto,
  formatearMonto,

  // ---- Constantes ----
  CONFIG
};

// ---- Solo para tests ----
module.exports._generarHTML = generarHTML;
module.exports._esErrorTransitorioSMTP = esErrorTransitorioSMTP;
module.exports._conTimeout = conTimeout;
module.exports._enviarConReintentos = enviarConReintentos;
module.exports._validarPuerto = validarPuerto;
module.exports._errorTipado = errorTipado;
module.exports._resetMetricas = () => {
  METRICAS.enviados = 0;
  METRICAS.fallidos = 0;
  METRICAS.reintentos = 0;
  METRICAS.verificaciones = 0;
  METRICAS.verificacionesOk = 0;
};
module.exports._setTransporter = (t) => { transporterGlobal = t; transporterCreadoEn = Date.now(); };