// backend/routes/configuracion.js
// ============================================================
// Configuración de empresa (singleton `_id: 'empresa'`)
// ------------------------------------------------------------
// Endpoints:
//   GET  /empresa       → configuración completa
//   PUT  /empresa       → actualizar (con validaciones fiscales SRI)
//   GET  /ambiente      → info resumida de ambiente + RUC
//
// Reglas de negocio:
//   - Cambiar a Producción (ambiente='2') exige certificado vigente.
//   - Cambiar el RUC con documentos existentes emite advertencia.
//   - `establecimiento` y `punto_emision` deben ser 3 dígitos.
//   - `tipo_emision`: '1' (Normal) o '2' (Contingencia).
//   - Códigos SRI (`contribuyente_especial`, `agente_retencion`) vacío
//     o 3-4 dígitos.
//
// Seguridad:
//   - Lecturas protegidas por `configuracion:ver`.
//   - Escrituras protegidas por `configuracion:editar`.
//   - `logo_url` limitado (evita guardar base64 gigantes).
//   - `Cache-Control: no-store` (config cambia esporádicamente).
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');
const { validarRUC, validarEmail, validarLogoUrl } = require('../utils/validators');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  col: 'configuracion',
  colCertificados: 'certificados',
  colVentas: 'ventas_v2',

  regimenes: Object.freeze(['RIMPE', 'RIMPE_NEGOCIO', 'GENERAL', 'ESPECIAL']),
  ambientes: Object.freeze(['1', '2']),
  tiposEmision: Object.freeze(['1', '2']),

  razonSocialMax: 300,
  razonSocialMin: 2,
  nombreComercialMax: 300,
  direccionMax: 300,
  telefonoMax: 20,
  emailMax: 200,
  contribuyenteEspecialMax: 10,
  agenteRetencionMax: 10,
  logoUrlMax: 500 * 1024, // 500 KB — suficiente para un data URL o URL remota

  /** Códigos SRI: vacío o 3-4 dígitos. */
  codigoSRIPatron: /^\d{3,4}$/,
  /** 3 dígitos exactos. */
  tresDigitos: /^\d{3}$/,

  confirmacionCambioRUC: 'CONFIRMAR CAMBIO DE RUC'
});

// Config por defecto (un único lugar de verdad).
function configPorDefecto() {
  const ahora = new Date();
  return {
    _id: 'empresa',
    ruc: '0000000000001',
    razon_social: 'MI EMPRESA',
    nombre_comercial: 'MI EMPRESA',
    direccion_matriz: '',
    direccion_establecimiento: '',
    telefono: '',
    email: '',
    contribuyente_especial: '',
    obligado_contabilidad: false,
    regimen: 'RIMPE',
    agente_retencion: '',
    ambiente: '1',
    tipo_emision: '1',
    establecimiento: '001',
    punto_emision: '001',
    logo_url: '',
    createdAt: ahora,
    updatedAt: ahora
  };
}

// ============================================================
// HELPERS
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

function normalizarTexto(v) {
  return String(v == null ? '' : v).trim();
}

function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1' || v === 1) return true;
  if (v === 'false' || v === '0' || v === 0 || v === null || v === undefined) return false;
  return Boolean(v);
}

function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar configuración');
  }
}

/**
 * Valida longitud de un campo string.
 * @returns {string|null} mensaje de error o null
 */
function validarLongitud(valor, nombre, max, min = 0) {
  if (valor === undefined || valor === null) return null;
  const s = String(valor);
  if (s.length < min) return `${nombre} debe tener al menos ${min} caracteres`;
  if (s.length > max) return `${nombre} no puede superar ${max} caracteres`;
  return null;
}

/**
 * Valida un código SRI que puede estar vacío o tener 3-4 dígitos.
 * @returns {string|null} mensaje o null
 */
function validarCodigoSRI(valor, nombre) {
  if (valor === undefined || valor === null || valor === '') return null;
  const s = String(valor).trim();
  if (s === '') return null;
  if (!CONFIG.codigoSRIPatron.test(s)) {
    return `${nombre} debe estar vacío o tener 3-4 dígitos`;
  }
  return null;
}

// ============================================================
// GET /empresa  → configuración completa (auto-crea si no existe)
// ============================================================
router.get('/empresa', requierePermiso('configuracion', 'ver'), async (req, res, next) => {
  try {
    // Upsert atómico: elimina la race condition del original
    // (dos GET simultáneos ya no crean dos documentos).
    const r = await req.db.collection(CONFIG.col).findOneAndUpdate(
      { _id: 'empresa' },
      { $setOnInsert: configPorDefecto() },
      { upsert: true, returnDocument: 'after' }
    );
    const config = r && r.value !== undefined ? r.value : r;

    headersNoStore(res);
    return res.json(config);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// PUT /empresa  → actualizar
// ============================================================
router.put('/empresa', requierePermiso('configuracion', 'editar'), async (req, res, next) => {
  try {
    const anteriores = await req.db.collection(CONFIG.col).findOne({ _id: 'empresa' });
    const body = req.body || {};

    const errores = [];

    // ---------- Normalización previa ----------
    const ruc = soloString(body.ruc) !== undefined ? normalizarTexto(body.ruc) : undefined;
    const razon_social = soloString(body.razon_social) !== undefined
      ? normalizarTexto(body.razon_social) : undefined;
    const nombre_comercial = soloString(body.nombre_comercial) !== undefined
      ? normalizarTexto(body.nombre_comercial) : undefined;
    const direccion_matriz = soloString(body.direccion_matriz) !== undefined
      ? normalizarTexto(body.direccion_matriz) : undefined;
    const direccion_establecimiento = soloString(body.direccion_establecimiento) !== undefined
      ? normalizarTexto(body.direccion_establecimiento) : undefined;
    const telefono = soloString(body.telefono) !== undefined
      ? normalizarTexto(body.telefono) : undefined;
    const email = soloString(body.email) !== undefined
      ? normalizarTexto(body.email).toLowerCase() : undefined;
    const contribuyente_especial = soloString(body.contribuyente_especial) !== undefined
      ? normalizarTexto(body.contribuyente_especial) : undefined;
    const regimen = soloString(body.regimen);
    const agente_retencion = soloString(body.agente_retencion) !== undefined
      ? normalizarTexto(body.agente_retencion) : undefined;
    const ambiente = body.ambiente !== undefined ? String(body.ambiente).trim() : undefined;
    const tipo_emision = body.tipo_emision !== undefined ? String(body.tipo_emision).trim() : undefined;
    const establecimiento = soloString(body.establecimiento) !== undefined
      ? normalizarTexto(body.establecimiento) : undefined;
    const punto_emision = soloString(body.punto_emision) !== undefined
      ? normalizarTexto(body.punto_emision) : undefined;
    const logo_url = body.logo_url !== undefined ? body.logo_url : undefined;

    // ---------- Validaciones ----------

    // RUC
    if (ruc !== undefined && ruc !== '') {
      if (!validarRUC(ruc)) {
        errores.push('RUC inválido (verifique el dígito verificador y que termine en 001)');
      }
    }

    // Razón social
    {
      const e = validarLongitud(razon_social, 'Razón social', CONFIG.razonSocialMax, CONFIG.razonSocialMin);
      if (e) errores.push(e);
    }

    // Nombre comercial
    {
      const e = validarLongitud(nombre_comercial, 'Nombre comercial', CONFIG.nombreComercialMax);
      if (e) errores.push(e);
    }

    // Direcciones
    {
      const e1 = validarLongitud(direccion_matriz, 'Dirección matriz', CONFIG.direccionMax);
      if (e1) errores.push(e1);
      const e2 = validarLongitud(direccion_establecimiento, 'Dirección establecimiento', CONFIG.direccionMax);
      if (e2) errores.push(e2);
    }

    // Teléfono (longitud)
    {
      const e = validarLongitud(telefono, 'Teléfono', CONFIG.telefonoMax);
      if (e) errores.push(e);
    }

    // Email
    if (email !== undefined && email !== '') {
      const check = validarEmail(email);
      if (!check.valido) errores.push(check.mensaje || 'Email inválido');
    }
    {
      const e = validarLongitud(email, 'Email', CONFIG.emailMax);
      if (e) errores.push(e);
    }

    // Contribuyente especial (SRI)
    {
      const e = validarCodigoSRI(contribuyente_especial, 'Contribuyente especial');
      if (e) errores.push(e);
      const e2 = validarLongitud(contribuyente_especial, 'Contribuyente especial', CONFIG.contribuyenteEspecialMax);
      if (e2) errores.push(e2);
    }

    // Agente de retención (SRI)
    {
      const e = validarCodigoSRI(agente_retencion, 'Agente de retención');
      if (e) errores.push(e);
      const e2 = validarLongitud(agente_retencion, 'Agente de retención', CONFIG.agenteRetencionMax);
      if (e2) errores.push(e2);
    }

    // Régimen
    if (regimen !== undefined && regimen !== '' && !CONFIG.regimenes.includes(regimen)) {
      errores.push(`Régimen inválido. Válidos: ${CONFIG.regimenes.join(', ')}`);
    }

    // Ambiente
    if (ambiente !== undefined && ambiente !== '' && !CONFIG.ambientes.includes(ambiente)) {
      errores.push('Ambiente debe ser "1" (Pruebas) o "2" (Producción)');
    }

    // Tipo emisión
    if (tipo_emision !== undefined && tipo_emision !== '' && !CONFIG.tiposEmision.includes(tipo_emision)) {
      errores.push('Tipo de emisión debe ser "1" (Normal) o "2" (Contingencia)');
    }

    // Establecimiento
    if (establecimiento !== undefined && establecimiento !== '' && !CONFIG.tresDigitos.test(establecimiento)) {
      errores.push('Establecimiento debe tener exactamente 3 dígitos (ej: 001)');
    }

    // Punto de emisión
    if (punto_emision !== undefined && punto_emision !== '' && !CONFIG.tresDigitos.test(punto_emision)) {
      errores.push('Punto de emisión debe tener exactamente 3 dígitos (ej: 001)');
    }

    // Logo URL
    if (logo_url !== undefined) {
      const check = validarLogoUrl(logo_url);
      if (!check.valido) errores.push(check.mensaje || 'Logo URL inválido');
      if (typeof logo_url === 'string' && logo_url.length > CONFIG.logoUrlMax) {
        errores.push(`Logo excede el tamaño máximo permitido (${Math.floor(CONFIG.logoUrlMax / 1024)} KB)`);
      }
    }

    // ---------- Reglas de negocio con efectos secundarios ----------

    const ambienteNuevo = ambiente || anteriores?.ambiente || '1';
    const cambioAProduccion = ambienteNuevo === '2' && anteriores?.ambiente !== '2';

    if (cambioAProduccion) {
      const cert = await req.db.collection(CONFIG.colCertificados).findOne(
        { _id: 'empresa' },
        { projection: { info: 1 } }
      );
      if (!cert || !cert.info) {
        errores.push('No puede activar Producción sin un certificado de firma electrónica cargado');
      } else {
        const vence = new Date(cert.info.validityNotAfter);
        if (Number.isNaN(vence.getTime())) {
          errores.push('El certificado tiene una fecha de vencimiento inválida');
        } else if (vence < new Date()) {
          errores.push(`No puede activar Producción con un certificado vencido (venció el ${vence.toLocaleDateString('es-EC')})`);
        }
      }
    }

    // Si hay errores, no seguimos.
    if (errores.length > 0) {
      return res.status(400).json({
        error: errores.join('. '),
        codigo: 'CONFIG_INVALIDA',
        errores
      });
    }

    // ---------- Advertencia por cambio de RUC ----------
    let advertencia = null;
    const cambioRUC = ruc && anteriores?.ruc && ruc !== anteriores.ruc;
    if (cambioRUC) {
      const docsCount = await req.db.collection(CONFIG.colVentas).countDocuments({}, { limit: 1 });
      const hayDocumentos = docsCount > 0;
      // Re-contamos si hay al menos 1 para dar un número real (costoso pero informativo).
      let totalDocs = 0;
      if (hayDocumentos) {
        totalDocs = await req.db.collection(CONFIG.colVentas).countDocuments({});
      }
      if (totalDocs > 0) {
        advertencia =
          `Cambió el RUC con ${totalDocs} documento${totalDocs === 1 ? '' : 's'} existente${totalDocs === 1 ? '' : 's'}. ` +
          `Los documentos anteriores conservan su RUC original.`;
      }
    }

    // ---------- Construir update ----------
    const updateData = {
      // Fallback al valor anterior si no se envió.
      ruc: ruc || anteriores?.ruc,
      razon_social: razon_social || anteriores?.razon_social,
      nombre_comercial: nombre_comercial || anteriores?.nombre_comercial,
      direccion_matriz: direccion_matriz !== undefined ? direccion_matriz : (anteriores?.direccion_matriz || ''),
      direccion_establecimiento: direccion_establecimiento !== undefined
        ? direccion_establecimiento : (anteriores?.direccion_establecimiento || ''),
      telefono: telefono !== undefined ? telefono : (anteriores?.telefono || ''),
      email: email !== undefined ? email : (anteriores?.email || ''),
      contribuyente_especial: contribuyente_especial !== undefined
        ? contribuyente_especial : (anteriores?.contribuyente_especial || ''),
      obligado_contabilidad: body.obligado_contabilidad !== undefined
        ? toBool(body.obligado_contabilidad) : Boolean(anteriores?.obligado_contabilidad),
      regimen: regimen || anteriores?.regimen || 'RIMPE',
      agente_retencion: agente_retencion !== undefined
        ? agente_retencion : (anteriores?.agente_retencion || ''),
      ambiente: ambienteNuevo,
      tipo_emision: tipo_emision || anteriores?.tipo_emision || '1',
      establecimiento: establecimiento || anteriores?.establecimiento || '001',
      punto_emision: punto_emision || anteriores?.punto_emision || '001',
      logo_url: logo_url !== undefined ? (logo_url || '') : (anteriores?.logo_url || ''),
      updatedAt: new Date()
    };

    // Upsert por si no existía config previa.
    await req.db.collection(CONFIG.col).updateOne(
      { _id: 'empresa' },
      {
        $set: updateData,
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );

    const actualizada = await req.db.collection(CONFIG.col).findOne({ _id: 'empresa' });

    // ---------- Auditoría ----------
    // Nunca loguear el logo entero (puede ser un data URL de cientos de KB).
    const sanitizarLogo = (obj) => obj ? { ...obj, logo_url: obj.logo_url ? '[logo]' : '' } : null;

    await auditarSeguro(req.db, req, {
      accion: 'actualizar',
      coleccion: CONFIG.col,
      documentoId: 'empresa',
      documentoNumero: actualizada?.ruc || '',
      datosAnteriores: sanitizarLogo(anteriores),
      datosNuevos: sanitizarLogo(updateData),
      detalle: `Configuración actualizada (${actualizada?.razon_social || ''})${advertencia ? '. ' + advertencia : ''}`
    });

    headersNoStore(res);
    return res.json({ ...actualizada, _advertencia: advertencia });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /ambiente  → info resumida
// ============================================================
router.get('/ambiente', requierePermiso('configuracion', 'ver'), async (req, res, next) => {
  try {
    const config = await req.db.collection(CONFIG.col).findOne(
      { _id: 'empresa' },
      { projection: { ambiente: 1, ruc: 1, razon_social: 1, nombre_comercial: 1 } }
    );

    headersNoStore(res);
    const ambiente = config?.ambiente || '1';
    return res.json({
      ambiente,
      ambienteNombre: ambiente === '2' ? 'Producción' : 'Pruebas',
      ruc: config?.ruc || '',
      razon_social: config?.razon_social || ''
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
module.exports._configPorDefecto = configPorDefecto;
module.exports._validarLongitud = validarLongitud;
module.exports._validarCodigoSRI = validarCodigoSRI;
module.exports._toBool = toBool;