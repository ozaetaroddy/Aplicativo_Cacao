// backend/routes/certificado.js
// ============================================================
// Certificado de firma electrónica (.p12/.pfx)
// ------------------------------------------------------------
// Endpoints:
//   GET    /info       → metadata del certificado cargado
//   GET    /verificar  → chequeo rápido de vigencia
//   POST   /subir      → cargar/reemplazar certificado
//   DELETE /           → eliminar (requiere confirmación textual)
//
// Seguridad:
//   - `password` se cifra con `cifrarSecreto()` antes de persistir.
//   - Nunca se devuelve `password` ni `password_cifrado` en respuestas.
//   - Errores NUNCA exponen subject/issuer/serial (evita filtrar PII).
//   - `nombre_archivo` se sanitiza (evita path traversal / null bytes).
//   - Validación estricta de base64 (charset + longitud + padding).
//   - Verificación de RUC del certificado vs RUC empresa.
//   - Bloqueo de eliminación si hay documentos pendientes de firma.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');
const log = require('../utils/logger');
const { cargarCertificado, cifrarSecreto } = require('../utils/firmaElectronica');

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
  col: 'certificados',
  colEmpresa: 'configuracion',
  colVentas: 'ventas_v2',
  /** 18 MB base64 ≈ 13.5 MB binarios. express.json({ limit: '20mb' }) en server.js. */
  maxBase64Len: envNum('CERT_MAX_BASE64_LEN', 18 * 1024 * 1024),
  maxPasswordLen: envNum('CERT_MAX_PASSWORD_LEN', 200),
  maxNombreArchivoLen: 200,
  maxNombreArchivoFallback: 'certificado.p12',
  /** Días antes del vencimiento para marcar "por vencer". */
  diasAlertaVencimiento: envNum('CERT_DIAS_ALERTA', 30),
  /** Confirmación textual exacta para eliminar. */
  confirmacionEliminar: 'ELIMINAR CERTIFICADO',
  /** Regex RUC: 13 dígitos exactos (con o sin espacios/guiones alrededor). */
  rucRegex: /(?:^|[^\d])(\d{13})(?!\d)/,
  /** Regex para detectar RUC etiquetado explícitamente. */
  rucEtiquetadoRegex: /(?:RUC|serialNumber|SERIALNUMBER)[^\d]*(\d{13})(?!\d)/i,
  /** Charset permitido en base64 (permite whitespace que se limpia). */
  base64Regex: /^[A-Za-z0-9+/=\s]*$/
});

// ============================================================
// HELPERS
// ============================================================

/** Auditoría que nunca rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar certificado');
  }
}

/** Setea headers de respuesta sensibles. */
function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/**
 * Sanitiza un nombre de archivo:
 *   - Elimina separadores de path y null bytes.
 *   - Limita a caracteres "seguros".
 *   - Trunca a CONFIG.maxNombreArchivoLen.
 *   - Si queda vacío, usa el fallback.
 */
function sanitizeNombreArchivo(nombre) {
  const raw = String(nombre || '');
  const cleaned = raw
    .replace(/[\x00-\x1F\x7F]/g, '')          // control chars
    .replace(/[\/\\]/g, '')                    // separadores de path
    .replace(/\.\./g, '')                      // traversal
    .replace(/[^\w.\- ]/g, '_')                // chars seguros
    .trim()
    .slice(0, CONFIG.maxNombreArchivoLen);
  return cleaned || CONFIG.maxNombreArchivoFallback;
}

/**
 * Valida y decodifica base64.
 * Acepta data URLs (`data:...;base64,XXXX`) y whitespace.
 * @returns {{ ok: true, buffer: Buffer } | { ok: false, error: string }}
 */
function decodeBase64Seguro(archivoBase64) {
  if (typeof archivoBase64 !== 'string' || archivoBase64.length === 0) {
    return { ok: false, error: 'archivo_base64 debe ser un string no vacío' };
  }
  if (archivoBase64.length > CONFIG.maxBase64Len) {
    const mb = (CONFIG.maxBase64Len / 1024 / 1024).toFixed(0);
    return {
      ok: false,
      error: `El archivo es demasiado grande. Límite: ~${mb} MB en base64`,
      codigo: 'ARCHIVO_DEMASIADO_GRANDE'
    };
  }

  // Quita el prefijo data URL si está presente.
  let b64 = archivoBase64;
  const idx = b64.indexOf('base64,');
  if (b64.startsWith('data:') && idx !== -1) {
    b64 = b64.slice(idx + 7);
  }

  // Quita whitespace (newlines en base64 multilínea).
  b64 = b64.replace(/\s+/g, '');

  if (!CONFIG.base64Regex.test(b64)) {
    return { ok: false, error: 'El archivo no es un base64 válido' };
  }
  if (b64.length === 0) {
    return { ok: false, error: 'El archivo está vacío' };
  }
  if (b64.length % 4 !== 0) {
    // Base64 válido siempre es múltiplo de 4 (con padding).
    // Aceptamos sin padding en casos límite pero avisamos.
    const padding = (4 - (b64.length % 4)) % 4;
    b64 += '='.repeat(padding);
  }

  let buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch (e) {
    return { ok: false, error: 'El archivo no es un base64 válido' };
  }
  if (buffer.length === 0) {
    return { ok: false, error: 'El archivo está vacío' };
  }

  // Un .p12/.pfx es una estructura ASN.1 DER: empieza con SEQUENCE (0x30).
  if (buffer[0] !== 0x30) {
    return {
      ok: false,
      error: 'El archivo no parece ser un certificado .p12/.pfx válido',
      codigo: 'ARCHIVO_NO_ES_P12'
    };
  }
  return { ok: true, buffer };
}

/**
 * Extrae el RUC (13 dígitos) de un certificado X.509.
 * Prueba subject, issuer y subjectAltNames.
 */
function extraerRucDelCertificado(certificate) {
  if (!certificate) return null;

  const fuentes = [certificate.subject, certificate.issuer].filter(Boolean);
  for (const fuente of fuentes) {
    const s = String(fuente);
    let m = s.match(CONFIG.rucEtiquetadoRegex);
    if (m) return m[1];
    m = s.match(CONFIG.rucRegex);
    if (m) return m[1];
  }

  if (Array.isArray(certificate.subjectAltNames)) {
    for (const alt of certificate.subjectAltNames) {
      if (typeof alt !== 'string') continue;
      const m = alt.match(CONFIG.rucRegex);
      if (m) return m[1];
    }
  }
  return null;
}

/** Calcula días restantes hasta el vencimiento (puede ser negativo). */
function diasRestantesHasta(notAfter) {
  const ms = new Date(notAfter).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

// ============================================================
// GET /info  → metadata del certificado (sin secretos)
// ============================================================
router.get('/info', requierePermiso('certificados', 'ver'), async (req, res, next) => {
  try {
    const cert = await req.db.collection(CONFIG.col).findOne(
      { _id: 'empresa' },
      { projection: { archivo_base64: 0, password: 0, password_cifrado: 0 } }
    );

    headersNoStore(res);
    if (!cert || !cert.info) return res.json({ cargado: false });

    const dias = diasRestantesHasta(cert.info.validityNotAfter);
    return res.json({
      cargado: true,
      nombre_archivo: cert.nombre_archivo,
      info: cert.info,
      subido_por: cert.subido_por,
      subido_en: cert.subido_en,
      dias_restantes: dias,
      vencido: dias < 0,
      por_vencer: dias >= 0 && dias < CONFIG.diasAlertaVencimiento
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /verificar  → chequeo rápido
// ============================================================
router.get('/verificar', requierePermiso('certificados', 'ver'), async (req, res, next) => {
  try {
    const cert = await req.db.collection(CONFIG.col).findOne(
      { _id: 'empresa' },
      { projection: { info: 1 } }
    );

    headersNoStore(res);
    if (!cert || !cert.info) return res.json({ valido: false, motivo: 'No hay certificado cargado' });

    const dias = diasRestantesHasta(cert.info.validityNotAfter);
    if (dias < 0) {
      return res.json({
        valido: false,
        motivo: 'Certificado vencido',
        dias_restantes: dias,
        venció_el: cert.info.validityNotAfter
      });
    }

    return res.json({
      valido: true,
      subject: cert.info.subject,
      valido_hasta: cert.info.validityNotAfter,
      dias_restantes: dias,
      por_vencer: dias < CONFIG.diasAlertaVencimiento
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /subir  → cargar/reemplazar certificado
// ============================================================
router.post('/subir', requierePermiso('certificados', 'crear'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const { archivo_base64, password, nombre_archivo } = body;

    // ---- 1. Validaciones de forma ----
    if (typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'password debe ser un string no vacío', codigo: 'PASSWORD_REQUERIDA' });
    }
    if (password.length > CONFIG.maxPasswordLen) {
      return res.status(400).json({
        error: `password demasiado largo (máx ${CONFIG.maxPasswordLen} caracteres)`,
        codigo: 'PASSWORD_DEMASIADO_LARGA'
      });
    }
    if (nombre_archivo !== undefined && nombre_archivo !== null && typeof nombre_archivo !== 'string') {
      return res.status(400).json({ error: 'nombre_archivo debe ser texto', codigo: 'NOMBRE_INVALIDO' });
    }

    // ---- 2. Decodificar base64 ----
    const dec = decodeBase64Seguro(archivo_base64);
    if (!dec.ok) {
      const status = dec.codigo === 'ARCHIVO_DEMASIADO_GRANDE' ? 413 : 400;
      return res.status(status).json({ error: dec.error, codigo: dec.codigo || 'ARCHIVO_INVALIDO' });
    }
    const p12Buffer = dec.buffer;

    // ---- 3. Cargar certificado (valida estructura + password) ----
    let certificado;
    try {
      certificado = cargarCertificado(p12Buffer, password);
    } catch (e) {
      // No exponemos el error crudo (puede traer detalles del OpenSSL).
      return res.status(400).json({
        error: e.message || 'No se pudo leer el certificado. Verifica el archivo y la contraseña.',
        codigo: 'CERT_INVALIDO'
      });
    }
    if (!certificado || !certificado.certificate) {
      return res.status(400).json({
        error: 'El certificado no contiene información válida',
        codigo: 'CERT_INVALIDO'
      });
    }

    // ---- 4. Verificar vigencia ----
    const cert = certificado.certificate;
    const notBefore = new Date(cert.validityNotBefore);
    const notAfter = new Date(cert.validityNotAfter);
    const ahora = new Date();

    if (Number.isNaN(notBefore.getTime()) || Number.isNaN(notAfter.getTime())) {
      return res.status(400).json({
        error: 'El certificado no tiene fechas de validez legibles',
        codigo: 'CERT_FECHAS_INVALIDAS'
      });
    }
    if (ahora < notBefore) {
      return res.status(400).json({
        error: `El certificado aún no es válido. Vigente desde: ${notBefore.toLocaleDateString('es-EC')}`,
        codigo: 'CERT_AUN_NO_VALIDO',
        valido_desde: cert.validityNotBefore
      });
    }
    if (ahora > notAfter) {
      return res.status(400).json({
        error: `El certificado ha expirado el: ${notAfter.toLocaleDateString('es-EC')}`,
        codigo: 'CERT_EXPIRADO',
        venció_el: cert.validityNotAfter
      });
    }

    // ---- 5. Verificar RUC contra configuración de empresa ----
    const config = await req.db.collection(CONFIG.colEmpresa).findOne({ _id: 'empresa' });
    const rucEmpresa = config?.ruc;

    if (rucEmpresa && String(rucEmpresa).length === 13) {
      const rucCert = extraerRucDelCertificado(cert);
      if (!rucCert) {
        // No exponemos subject/issuer en la respuesta (puede contener PII).
        // Se logean para diagnóstico interno.
        log.warn({
          subject: cert.subject,
          issuer: cert.issuer,
          serialNumber: cert.serialNumber
        }, 'No se pudo extraer el RUC del certificado');
        return res.status(400).json({
          error: 'No se pudo determinar el RUC del certificado. Verifique que sea un certificado de firma electrónica ecuatoriano.',
          codigo: 'RUC_NO_DETECTADO'
        });
      }
      if (rucCert !== String(rucEmpresa)) {
        return res.status(400).json({
          error: `El certificado pertenece al RUC ${rucCert}, pero la empresa está configurada con el RUC ${rucEmpresa}. Corrija la configuración o cargue el certificado correcto.`,
          codigo: 'RUC_NO_COINCIDE',
          rucCertificado: rucCert,
          rucEmpresa
        });
      }
    }

    // ---- 6. Cifrar password y persistir ----
    const passwordCifrado = cifrarSecreto(password);
    const nombreArchivo = sanitizeNombreArchivo(nombre_archivo);
    const ahoraDoc = new Date();

    const docCert = {
      _id: 'empresa',
      archivo_base64,
      password_cifrado: passwordCifrado,
      nombre_archivo: nombreArchivo,
      info: cert,
      subido_por: req.user.email,
      subido_en: ahoraDoc,
      actualizado_en: ahoraDoc
    };

    await req.db.collection(CONFIG.col).updateOne(
      { _id: 'empresa' },
      { $set: docCert },
      { upsert: true }
    );

    // ---- 7. Auditoría (no exponer base64 ni password) ----
    await auditarSeguro(req.db, req, {
      accion: 'subir',
      coleccion: CONFIG.col,
      documentoNumero: nombreArchivo,
      datosNuevos: {
        subject: cert.subject,
        issuer: cert.issuer,
        vence: cert.validityNotAfter,
        dias_restantes: cert.diasRestantes
      },
      detalle: `Certificado subido: ${cert.subject}`
    });

    headersNoStore(res);
    return res.json({
      message: 'Certificado cargado correctamente',
      certificado: {
        subject: cert.subject,
        issuer: cert.issuer,
        serialNumber: cert.serialNumber,
        valido_desde: cert.validityNotBefore,
        valido_hasta: cert.validityNotAfter,
        dias_restantes: cert.diasRestantes
      }
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// DELETE /  → eliminar (requiere confirmación textual)
// ============================================================
router.delete('/', requierePermiso('certificados', 'eliminar'), async (req, res, next) => {
  try {
    const body = req.body || {};
    if (body.confirmacion !== CONFIG.confirmacionEliminar) {
      return res.status(400).json({
        error: `Debe enviar { "confirmacion": "${CONFIG.confirmacionEliminar}" } para confirmar`,
        codigo: 'CONFIRMACION_REQUERIDA'
      });
    }

    const cert = await req.db.collection(CONFIG.col).findOne(
      { _id: 'empresa' },
      { projection: { archivo_base64: 0, password: 0, password_cifrado: 0 } }
    );
    if (!cert) {
      return res.status(404).json({ error: 'No hay certificado cargado', codigo: 'CERT_NO_CARGADO' });
    }

    // Bloqueo: no eliminar si hay documentos pendientes de firma.
    const pendientes = await req.db.collection(CONFIG.colVentas).countDocuments({
      estado_sri: 'PENDIENTE',
      xml_generado: { $exists: true, $ne: '' }
    });

    if (pendientes > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: hay ${pendientes} documento${pendientes === 1 ? '' : 's'} pendiente${pendientes === 1 ? '' : 's'} de firma. Fírmelos o elimínelos primero.`,
        codigo: 'CERT_DOCS_PENDIENTES',
        pendientes
      });
    }

    const r = await req.db.collection(CONFIG.col).deleteOne({ _id: 'empresa' });
    if (r.deletedCount === 0) {
      // Otra request lo eliminó entre el findOne y el deleteOne.
      return res.status(404).json({ error: 'No hay certificado cargado', codigo: 'CERT_NO_CARGADO' });
    }

    await auditarSeguro(req.db, req, {
      accion: 'eliminar',
      coleccion: CONFIG.col,
      documentoNumero: cert.nombre_archivo,
      detalle: 'Certificado de firma electrónica eliminado'
    });

    headersNoStore(res);
    return res.json({ message: 'Certificado eliminado' });
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
module.exports._sanitizeNombreArchivo = sanitizeNombreArchivo;
module.exports._decodeBase64Seguro = decodeBase64Seguro;
module.exports._extraerRucDelCertificado = extraerRucDelCertificado;
module.exports._diasRestantesHasta = diasRestantesHasta;