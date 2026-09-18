// backend/utils/emailService.js
// ============================================================
// Envío de comprobantes por email
// ------------------------------------------------------------
// API pública:
//   enviarComprobantePorEmail(opts)  → { success, messageId, ... }
//   verificarConexion(opts)          → { ok, error?, cached? }
//   crearTransporter()               → Promise<Transporter|null>
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
//
// ============================================================
// 🔧 FIX 2025-XX — IPv6 en PaaS (Render, Heroku, Railway, etc.)
// ------------------------------------------------------------
// En Node 20+ se activa `autoSelectFamily` (Happy Eyeballs) por
// default. Cuando está activo, la opción `family` se IGNORA y
// Node intenta primero la dirección del resolver DNS — que para
// smtp.gmail.com es IPv6 (2607:f8b0:...). Como estos PaaS no
// tienen salida IPv6, la conexión falla con:
//
//     connect ENETUNREACH 2607:f8b0:...  - Local (:::0)
//
// El fix en `server.js` (`net.setDefaultAutoSelectFamily(false)` +
// `dns.setDefaultResultOrder('ipv4first')`) NO es suficiente
// porque `smtp-connection` (nodemailer) crea sockets propios que
// pueden pisar el default.
//
// Solución definitiva implementada acá:
//   1. Pre-resolver el SMTP host a una IPv4 concreta (`dns.lookup`).
//   2. Pasar esa IP como `host` a nodemailer → cero DNS lookup.
//   3. Pasar el nombre real en `tls.servername` para que el
//      handshake TLS siga validando contra el certificado correcto.
//   4. Cachear la IP por 5 min (los IPs de Gmail rotan esporádicamente).
//   5. Fallback seguro: si el host no resuelve a IPv4, usar el
//      nombre original (no rompe otros proveedores SMTP).
//
// Otros fixes menores:
//   - `SMTP_FROM` ahora acepta el formato "Nombre <email@x.com>".
//     Antes se envolvía en `<...>` produciendo `"Nombre" <<email>>`.
//   - `obtenerTransporter()` deduplica creaciones concurrentes con
//     un guard de promesa en vuelo (evita N conexiones si llegan
//     N requests al arrancar).
//   - `limpiarTransporter()` cancela también la creación en vuelo.
// ============================================================
'use strict';

const log = require('./logger');
const dnsPromises = require('node:dns').promises;
const net = require('node:net');

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

  /** TTL del cache de resolución IPv4 del host SMTP. */
  ipv4CacheTtlMs: envNum('EMAIL_IPV4_CACHE_MS', 5 * 60 * 1000)
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
 */
function sanitizarTexto(s, max = CONFIG.maxAsunto) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/[\r\n\0\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Escapa caracteres peligrosos para HTML.
 * Mantiene la firma original (`escHtml(str)`).
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
 */
function sanitizarNombreRemitente(s) {
  return String(s || '')
    .replace(/[\r\n\0\t]+/g, ' ')
    .replace(/["<>\\,;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CONFIG.maxNombreRemitente)
    || 'Sistema Contable';
}

/**
 * Sanitiza un nombre de archivo para adjuntos.
 * Conserva puntos, guiones, guiones bajos y alfanuméricos.
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
 */
function formatearMonto(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.00';
  return v.toFixed(2);
}

/**
 * Valida un email con regex simple.
 */
function validarEmail(email) {
  if (typeof email !== 'string' || email.length === 0) return false;
  if (email.length > CONFIG.maxEmail) return false;
  if (/[\r\n\0]/.test(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email);
}

/**
 * Extrae el email puro desde un valor que puede venir como:
 *   - "user@dominio.com"
 *   - "Nombre Apellido <user@dominio.com>"
 *   - "\"Nombre\" <user@dominio.com>"
 *
 * 🔧 FIX: antes `validarEmail(SMTP_FROM)` fallaba si el usuario
 *    configuraba `SMTP_FROM="Acme S.A. <acme@x.com>"`, y además el
 *    `From:` resultante quedaba como `"Acme" <<acme@x.com>>`.
 *
 * @param {*} valor
 * @returns {{ email: string, nombre: string|null }}
 */
function extraerEmailYNombre(valor) {
  if (!valor || typeof valor !== 'string') {
    return { email: '', nombre: null };
  }
  const s = valor.trim();

  // Formato "Nombre <email>"
  const m = s.match(/^(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) {
    const nombre = m[1].trim().replace(/^["']|["']$/g, '').trim();
    return { email: m[2].trim(), nombre: nombre || null };
  }

  // Solo email (o basura)
  return { email: s, nombre: null };
}

// ============================================================
// RESOLUCIÓN IPv4 DEL HOST SMTP
// ------------------------------------------------------------
// Cachea la IP resuelta por `ipv4CacheTtlMs` (5 min).
// Si el host ya es una IP, no resuelve.
// Si no se puede resolver IPv4, devuelve el host original para
// no romper proveedores que solo escuchan en IPv6 (raro, pero
// posible en despliegues on-prem).
// ============================================================
let _smtpHostIPv4Cache = null; // { host, ip, expiresAt }

async function resolverHostIPv4(host) {
  // Si ya es IPv4, no toca DNS.
  if (net.isIPv4(host)) return host;

  // IPv6 literal: lo dejamos pasar sin tocar (escenario raro).
  if (net.isIPv6(host)) return host;

  const ahora = Date.now();
  if (
    _smtpHostIPv4Cache &&
    _smtpHostIPv4Cache.host === host &&
    _smtpHostIPv4Cache.expiresAt > ahora
  ) {
    return _smtpHostIPv4Cache.ip;
  }

  try {
    const records = await dnsPromises.lookup(host, { family: 4, all: true });
    if (Array.isArray(records) && records.length > 0) {
      const ip = records[0].address;
      _smtpHostIPv4Cache = {
        host,
        ip,
        expiresAt: ahora + CONFIG.ipv4CacheTtlMs
      };
      log.info({ host, ip }, 'SMTP host resuelto a IPv4');
      return ip;
    }
    log.warn({ host }, 'DNS no devolvió registros IPv4 para el host SMTP');
  } catch (e) {
    log.warn(
      { err: e.message, host },
      'No se pudo resolver SMTP host a IPv4, usando nombre original'
    );
  }

  return host;
}

// ============================================================
// TRANSPORTER (singleton con reset + anti-race)
// ============================================================
let transporterGlobal = null;
let transporterCreadoEn = 0;
let _creandoTransporter = null; // promesa en vuelo (dedupe)

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
 *
 * 🔧 FIX IPv6: pre-resolvemos el host a IPv4 y pasamos la IP como
 *    `host`. El nombre real va en `tls.servername` para validar el
 *    certificado. Con esto, nodemailer NUNCA intenta IPv6.
 *
 * @returns {Promise<object|null>} Transporter o null si falta config.
 */
async function crearTransporter() {
  const nodemailer = cargarNodemailer();
  if (!nodemailer) return null;

  const hostOriginal = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = process.env.SMTP_PASS || '';

  if (!hostOriginal || !user || !pass) return null;

  const port = validarPuerto(process.env.SMTP_PORT);
  const secure = port === 465;
  const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false';

  if (!rejectUnauthorized && process.env.NODE_ENV === 'production') {
    log.warn(
      'SMTP_TLS_REJECT_UNAUTHORIZED=false en producción: acepta certificados no confiables'
    );
  }

  // 🔧 FIX: pre-resolver a IPv4.
  const hostIPv4 = await resolverHostIPv4(hostOriginal);

  return nodemailer.createTransport({
    host: hostIPv4,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: CONFIG.maxConnections,
    maxMessages: CONFIG.maxMessages,
    tls: {
      rejectUnauthorized,
      // 🔧 Si estamos conectando por IP, el SNI debe ser el nombre real
      //    para que el handshake TLS valide el certificado correcto.
      servername: hostOriginal
    },
    connectionTimeout: CONFIG.connectionTimeoutMs,
    greetingTimeout: CONFIG.greetingTimeoutMs,
    socketTimeout: CONFIG.socketTimeoutMs,
    // Defensa en profundidad: aunque ya pasamos IP, forzamos family=4.
    family: 4
  });
}

/**
 * Devuelve el transporter global (o lo crea).
 * Deduplica creaciones concurrentes: si 10 requests llegan al mismo
 * tiempo antes de que exista el transporter, solo se crea UNO.
 *
 * @returns {Promise<object|null>}
 */
async function obtenerTransporter() {
  if (transporterGlobal) return transporterGlobal;
  if (_creandoTransporter) return _creandoTransporter;

  _creandoTransporter = (async () => {
    try {
      const t = await crearTransporter();
      transporterGlobal = t;
      transporterCreadoEn = Date.now();
      return t;
    } finally {
      _creandoTransporter = null;
    }
  })();

  return _creandoTransporter;
}

/**
 * Libera el pool del transporter global.
 * Cancela también una creación en vuelo si la hubiera.
 */
function limpiarTransporter() {
  if (transporterGlobal && typeof transporterGlobal.close === 'function') {
    try { transporterGlobal.close(); } catch { /* noop */ }
  }
  transporterGlobal = null;
  transporterCreadoEn = 0;
  _creandoTransporter = null;
  _smtpHostIPv4Cache = null;
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
 */
function esErrorTransitorioSMTP(err) {
  if (!err) return false;

  if (typeof err.responseCode === 'number') {
    return err.responseCode >= 400 && err.responseCode < 500;
  }

  const codigosTransitorios = new Set([
    'ECONNECTION', 'ECONNRESET', 'ETIMEDOUT',
    'ESOCKET', 'EDNS', 'EPROTOCOL', 'EAUTH'
  ]);
  if (err.code && codigosTransitorios.has(err.code)) return true;

  return false;
}

/**
 * Ejecuta `sendMail` con reintentos exponenciales + jitter.
 */
async function enviarConReintentos(transporter, mailOptions) {
  const max = CONFIG.reintentosMax;
  let ultimoError = null;

  for (let intento = 1; intento <= max; intento++) {
    try {
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
 */
async function enviarComprobantePorEmail(options = {}) {
  const {
    config, documento, cliente, pdfBuffer, xmlBuffer,
    emailDestino, asunto, mensaje,
    cc, bcc, replyTo, priority, headers
  } = options;

  // ---- Transporter (async por el fix IPv4) ----
  const transporter = await obtenerTransporter();
  if (!transporter) {
    throw errorTipado(
      'Servicio de email no configurado. Contacte al administrador.',
      'EMAIL_NO_CONFIGURADO',
      503
    );
  }

  // ---- Validaciones ----
  if (!validarEmail(emailDestino)) {
    throw errorTipado(
      `Email de destino inválido: "${emailDestino}"`,
      'EMAIL_DESTINO_INVALIDO',
      400
    );
  }

  // 🔧 FIX: extraer email puro desde SMTP_FROM (acepta "Nombre <email>").
  const fromRaw = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { email: fromAddress } = extraerEmailYNombre(fromRaw);
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
let _verifyCache = null; // { result, expiresAt }

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

  // 🔧 async: ahora esperamos a la creación del transporter.
  const transporter = await obtenerTransporter();
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
  extraerEmailYNombre,

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
module.exports._resolverHostIPv4 = resolverHostIPv4;
module.exports._obtenerTransporter = obtenerTransporter;
module.exports._resetMetricas = () => {
  METRICAS.enviados = 0;
  METRICAS.fallidos = 0;
  METRICAS.reintentos = 0;
  METRICAS.verificaciones = 0;
  METRICAS.verificacionesOk = 0;
};
module.exports._setTransporter = (t) => {
  transporterGlobal = t;
  transporterCreadoEn = Date.now();
  _creandoTransporter = null;
};
module.exports._resetIpv4Cache = () => { _smtpHostIPv4Cache = null; };