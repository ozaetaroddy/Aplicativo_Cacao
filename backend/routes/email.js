// backend/routes/email.js
// ============================================================
// Envío de comprobantes por email
// ------------------------------------------------------------
// Endpoints:
//   GET  /verificar        → estado del SMTP
//   POST /enviar/:ventaId  → enviar comprobante (PDF/XML adjuntos)
//   GET  /historial/:ventaId → historial de envíos del documento
//
// Seguridad:
//   - Validación estricta de email destino (anti header injection).
//   - Límites de tamaño para PDF (base64) y XML (bytes).
//   - Sanitización de base64 (data URL prefix + charset + padding).
//   - `Cache-Control: no-store` en todas las respuestas.
//   - `/verificar` no expone credenciales (SMTP_USER, SMTP_PASS).
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');
const { enviarComprobantePorEmail, verificarConexion } = require('../utils/emailService');
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
  colClientes: 'clientes',
  colConfig: 'configuracion',

  // Alineados con express.json({ limit: '20mb' }) en server.js.
  maxPdfBase64Len: envNum('EMAIL_MAX_PDF_B64', 12 * 1024 * 1024),
  maxXmlBytes: envNum('EMAIL_MAX_XML_BYTES', 5 * 1024 * 1024),
  maxEmailLen: envNum('EMAIL_MAX_LEN', 200),
  maxAsuntoLen: envNum('EMAIL_MAX_ASUNTO', 200),
  maxMensajeLen: envNum('EMAIL_MAX_MENSAJE', 5000),

  /** Charset permitido en base64 (permite whitespace que se limpia). */
  base64Regex: /^[A-Za-z0-9+/=\s]*$/
});

// Regex de email simple pero estricto (RFC 5322 simplified).
// Rechaza CRLF para evitar header injection.
const EMAIL_REGEX = /^[^\s@\r\n]+@[^\s@\r\n]+\.[a-zA-Z]{2,}$/;

// ============================================================
// HELPERS
// ============================================================
function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

/** Convierte a booleano con parsing correcto ('false' → false). */
function toBool(v, fallback = false) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1' || v === 1) return true;
  if (v === 'false' || v === '0' || v === 0) return false;
  return Boolean(v);
}

/** Valida un email (formato + longitud + sin CRLF). */
function esEmailBasico(email) {
  if (typeof email !== 'string') return false;
  if (email.length === 0 || email.length > CONFIG.maxEmailLen) return false;
  if (/[\r\n]/.test(email)) return false;
  return EMAIL_REGEX.test(email);
}

/** Valida que un id sea ObjectId. Lanza error tipado si no. */
function requireObjectId(id, codigo = 'ID_INVALIDO') {
  if (!ObjectId.isValid(id)) {
    const err = new Error('ID inválido');
    err.status = 400;
    err.codigo = codigo;
    throw err;
  }
  return new ObjectId(id);
}

/** Auditoría que nunca rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar email');
  }
}

/**
 * Decodifica base64 con validación.
 * Acepta data URLs (`data:...;base64,XXXX`) y whitespace.
 * @returns {{ ok: true, buffer } | { ok: false, error, codigo }}
 */
function decodeBase64Seguro(input, maxLen, { etiqueta = 'archivo' } = {}) {
  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, error: `${etiqueta} debe ser un string no vacío`, codigo: 'BASE64_VACIO' };
  }
  if (input.length > maxLen) {
    const mb = (maxLen / 1024 / 1024).toFixed(0);
    return {
      ok: false,
      error: `${etiqueta} demasiado grande. Máximo: ~${mb} MB en base64.`,
      codigo: 'BASE64_DEMASIADO_GRANDE'
    };
  }

  // Quita prefijo data URL si está presente.
  let b64 = input;
  const idx = b64.indexOf('base64,');
  if (b64.startsWith('data:') && idx !== -1) {
    b64 = b64.slice(idx + 7);
  }
  // Quita whitespace.
  b64 = b64.replace(/\s+/g, '');

  if (!CONFIG.base64Regex.test(b64)) {
    return { ok: false, error: `${etiqueta} no es un base64 válido`, codigo: 'BASE64_INVALIDO' };
  }
  if (b64.length === 0) {
    return { ok: false, error: `${etiqueta} está vacío`, codigo: 'BASE64_VACIO' };
  }
  // Añade padding si falta.
  if (b64.length % 4 !== 0) {
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
  }

  let buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch {
    return { ok: false, error: `${etiqueta} no es un base64 válido`, codigo: 'BASE64_INVALIDO' };
  }
  if (buffer.length === 0) {
    return { ok: false, error: `${etiqueta} está vacío`, codigo: 'BASE64_VACIO' };
  }
  return { ok: true, buffer };
}

// ============================================================
// GET /verificar  → estado del SMTP
// ============================================================
router.get('/verificar', requierePermiso('usuarios', 'ver'), async (req, res, next) => {
  try {
    const resultado = await verificarConexion();

    // No exponemos el usuario SMTP (puede ser una cuenta de correo).
    // Sí el host y el "from" (útil para diagnóstico sin ser secreto).
    headersNoStore(res);
    return res.json({
      configurado: !!process.env.SMTP_HOST,
      host: process.env.SMTP_HOST || null,
      puerto: process.env.SMTP_PORT || null,
      from: process.env.SMTP_FROM || process.env.SMTP_USER || null,
      conexion: resultado
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /enviar/:ventaId
// ============================================================
router.post('/enviar/:ventaId', requierePermiso('ventas', 'ver'), async (req, res, next) => {
  try {
    const { ventaId } = req.params;
    const body = req.body || {};

    const email = body.email;
    const asunto = body.asunto;
    const mensaje = body.mensaje;
    const incluir_pdf = toBool(body.incluir_pdf, true);
    const incluir_xml = toBool(body.incluir_xml, true);
    const pdf_base64 = body.pdf_base64;

    // ---- Validación de ventaId ----
    const ventaObjectId = requireObjectId(ventaId);

    // ---- Validaciones de campos opcionales ----
    if (email !== undefined && email !== null && email !== '') {
      if (typeof email !== 'string' || email.length > CONFIG.maxEmailLen) {
        return res.status(400).json({ error: 'email inválido', codigo: 'EMAIL_INVALIDO' });
      }
      if (!esEmailBasico(email)) {
        return res.status(400).json({ error: 'Formato de email inválido', codigo: 'EMAIL_FORMATO' });
      }
    }

    if (asunto !== undefined && asunto !== null) {
      if (typeof asunto !== 'string' || asunto.length > CONFIG.maxAsuntoLen) {
        return res.status(400).json({
          error: `asunto inválido (máx ${CONFIG.maxAsuntoLen} caracteres)`,
          codigo: 'ASUNTO_INVALIDO'
        });
      }
      // Anti header injection: los asuntos no pueden contener CRLF.
      if (/[\r\n]/.test(asunto)) {
        return res.status(400).json({
          error: 'asunto contiene caracteres no permitidos',
          codigo: 'ASUNTO_INYECCION'
        });
      }
    }

    if (mensaje !== undefined && mensaje !== null) {
      if (typeof mensaje !== 'string' || mensaje.length > CONFIG.maxMensajeLen) {
        return res.status(400).json({
          error: `mensaje inválido (máx ${CONFIG.maxMensajeLen} caracteres)`,
          codigo: 'MENSAJE_INVALIDO'
        });
      }
    }

    // ---- Validación temprana de base64 (antes de tocar la BD) ----
    let pdfBuffer = null;
    if (incluir_pdf && pdf_base64 !== undefined && pdf_base64 !== null) {
      const dec = decodeBase64Seguro(pdf_base64, CONFIG.maxPdfBase64Len, { etiqueta: 'PDF' });
      if (!dec.ok) {
        const status = dec.codigo === 'BASE64_DEMASIADO_GRANDE' ? 413 : 400;
        return res.status(status).json({ error: dec.error, codigo: dec.codigo });
      }
      pdfBuffer = dec.buffer;
    }

    // ---- Cargar venta + cliente + config en paralelo ----
    const venta = await req.db.collection(CONFIG.colVentas).findOne({ _id: ventaObjectId });
    if (!venta) {
      return res.status(404).json({ error: 'Documento no encontrado', codigo: 'VENTA_NOT_FOUND' });
    }

    const [cliente, config] = await Promise.all([
      venta.clienteId && ObjectId.isValid(venta.clienteId)
        ? req.db.collection(CONFIG.colClientes).findOne({ _id: new ObjectId(venta.clienteId) })
        : Promise.resolve(null),
      req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' })
    ]);

    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado', codigo: 'CLIENTE_NOT_FOUND' });
    }

    // ---- Determinar email destino ----
    const emailDestino = (soloString(email) || '').trim() || (soloString(cliente.email) || '').trim();
    if (!emailDestino) {
      return res.status(400).json({
        error: 'El cliente no tiene email. Especifique uno.',
        codigo: 'EMAIL_DESTINO_REQUERIDO'
      });
    }
    if (!esEmailBasico(emailDestino)) {
      return res.status(400).json({
        error: 'El email destino tiene formato inválido',
        codigo: 'EMAIL_DESTINO_INVALIDO'
      });
    }

    // ---- Preparar XML adjunto ----
    let xmlBuffer = null;
    if (incluir_xml) {
      const fuente = venta.xml_firmado || venta.xml_generado;
      if (fuente) {
        // Calculamos el tamaño en bytes ANTES de convertir.
        const byteLen = Buffer.byteLength(fuente, 'utf-8');
        if (byteLen > CONFIG.maxXmlBytes) {
          return res.status(413).json({
            error: `El XML adjunto excede el tamaño máximo permitido (${(CONFIG.maxXmlBytes / 1024 / 1024).toFixed(0)} MB).`,
            codigo: 'XML_DEMASIADO_GRANDE'
          });
        }
        xmlBuffer = Buffer.from(fuente, 'utf-8');
      }
    }

    // ---- Enviar ----
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

    // ---- Registrar el envío en el documento ----
    const ahora = new Date();
    await req.db.collection(CONFIG.colVentas).updateOne(
      { _id: ventaObjectId },
      {
        $push: {
          envios_email: {
            email: emailDestino,
            fecha: ahora,
            messageId: resultado.messageId,
            adjuntos: resultado.adjuntos,
            enviado_por: req.user?.email || null
          }
        },
        $set: { ultimo_envio_email: ahora, updatedAt: ahora }
      }
    );

    await auditarSeguro(req.db, req, {
      accion: 'enviar-email',
      coleccion: 'ventas',
      documentoId: ventaObjectId,
      documentoNumero: venta.numero_factura || '',
      datosNuevos: {
        email: emailDestino,
        messageId: resultado.messageId,
        adjuntos: resultado.adjuntos
      },
      detalle: `Comprobante enviado por email a ${emailDestino}`
    });

    headersNoStore(res);
    return res.json({
      success: true,
      message: 'Comprobante enviado por email',
      messageId: resultado.messageId,
      destinatario: emailDestino,
      adjuntos: resultado.adjuntos
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /historial/:ventaId
// ============================================================
router.get('/historial/:ventaId', requierePermiso('ventas', 'ver'), async (req, res, next) => {
  try {
    const ventaObjectId = requireObjectId(req.params.ventaId);

    const venta = await req.db.collection(CONFIG.colVentas).findOne(
      { _id: ventaObjectId },
      { projection: { envios_email: 1, ultimo_envio_email: 1 } }
    );

    if (!venta) {
      return res.status(404).json({ error: 'Documento no encontrado', codigo: 'VENTA_NOT_FOUND' });
    }

    headersNoStore(res);
    return res.json({
      envios: venta.envios_email || [],
      ultimo_envio: venta.ultimo_envio_email || null
    });
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
module.exports._esEmailBasico = esEmailBasico;
module.exports._decodeBase64Seguro = decodeBase64Seguro;
module.exports._toBool = toBool;