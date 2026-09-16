// backend/routes/catalogos.js
// ============================================================
// Catálogos oficiales del SRI (solo lectura, datos estáticos)
// ------------------------------------------------------------
// Endpoints:
//   GET /                          → todos los catálogos
//   GET /:nombre                   → un catálogo
//   GET /retencion/:codigo         → resuelve tipo de retención
//                                    (con impuesto=RENTA|IVA para el 725)
//   GET /buscar?q=...              → busca en todos los catálogos
//
// Query params:
//   ?formato=json|csv|tsv          → formato de respuesta (default json)
//   ?search=...                    → filtra por codigo o nombre (case-insensitive)
//   ?retenciones=RENTA|IVA         → solo para TIPO_RETENCION
//   ?pretty=1                      → JSON indentado
//
// Los catálogos son inmutables, por lo que se cachean fuerte:
//   - ETag calculado del contenido (304 Not Modified)
//   - Cache-Control: public, max-age=86400, immutable
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const catalogos = require('../data/catalogosSRI');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  /** Max-Age en segundos para Cache-Control (24 h). */
  cacheMaxAge: 24 * 60 * 60,
  /** Máx. resultados devueltos por /buscar. */
  maxBusquedaResultados: 50,
  /** Formato por defecto. */
  formatoDefault: 'json',
  /** Formatos soportados. */
  formatosValidos: Object.freeze(new Set(['json', 'csv', 'tsv']))
});

// ============================================================
// WHITELIST DE CATÁLOGOS PÚBLICOS
// Solo se exponen los arrays; los helpers quedan internos.
// ============================================================
const CATALOGOS_PUBLICOS = Object.freeze({
  TIPO_IDENTIFICACION: catalogos.TIPO_IDENTIFICACION,
  TIPO_COMPROBANTE: catalogos.TIPO_COMPROBANTE,
  FORMA_PAGO: catalogos.FORMA_PAGO,
  TARIFA_IVA: catalogos.TARIFA_IVA,
  TIPO_RETENCION: catalogos.TIPO_RETENCION,
  DOCUMENTO_SUSTENTO: catalogos.DOCUMENTO_SUSTENTO,
  ESTADO_PAGO: catalogos.ESTADO_PAGO,
  TIPO_MEDIDA: catalogos.TIPO_MEDIDA
});

/**
 * Aliases cortos → clave canónica.
 * Permiten `/api/catalogos/iva` en lugar de `/tipo_tarifa_iva`.
 */
const ALIASES = Object.freeze({
  IVA: 'TARIFA_IVA',
  TARIFA_IVA: 'TARIFA_IVA',
  IDENTIFICACION: 'TIPO_IDENTIFICACION',
  TIPO_ID: 'TIPO_IDENTIFICACION',
  COMPROBANTE: 'TIPO_COMPROBANTE',
  DOCUMENTOS: 'TIPO_COMPROBANTE',
  PAGO: 'FORMA_PAGO',
  FORMAS_PAGO: 'FORMA_PAGO',
  RETENCION: 'TIPO_RETENCION',
  RETENCIONES: 'TIPO_RETENCION',
  SUSTENTO: 'DOCUMENTO_SUSTENTO',
  ESTADOS: 'ESTADO_PAGO',
  ESTADO: 'ESTADO_PAGO',
  MEDIDA: 'TIPO_MEDIDA',
  MEDIDAS: 'TIPO_MEDIDA'
});

// ============================================================
// ERRORES TIPADOS
// ============================================================
const ERRORES = Object.freeze({
  CATALOGO_NO_ENCONTRADO: 'CATALOGO_NO_ENCONTRADO',
  FORMATO_INVALIDO: 'FORMATO_INVALIDO',
  RETENCION_NO_ENCONTRADA: 'RETENCION_NO_ENCONTRADA',
  RETENCION_AMBIGUA: 'RETENCION_AMBIGUA',
  IMPUESTO_INVALIDO: 'IMPUESTO_INVALIDO',
  QUERY_INVALIDA: 'QUERY_INVALIDA'
});

function errorCatalogo(res, status, codigo, mensaje, extra = {}) {
  return res.status(status).json({ error: mensaje, codigo, ...extra });
}

// ============================================================
// HELPERS
// ============================================================

/** Normaliza un nombre de catálogo: mayúsculas, guiones → underscore. */
function normalizarNombre(nombre) {
  return String(nombre || '').trim().toUpperCase().replace(/-/g, '_');
}

/** Resuelve el nombre a la clave canónica aplicando aliases. */
function resolverClave(nombre) {
  const norm = normalizarNombre(nombre);
  if (!norm) return null;
  if (Object.prototype.hasOwnProperty.call(CATALOGOS_PUBLICOS, norm)) return norm;
  return ALIASES[norm] || null;
}

/** Fuerza string seguro para query params. */
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

/** Escapa un valor para CSV/TSV. */
function escapeCsv(value, sep) {
  const s = value === null || value === undefined ? '' : String(value);
  if (s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Convierte un array de objetos a CSV/TSV. */
function aDelimitado(items, sep) {
  if (!Array.isArray(items) || items.length === 0) return '';
  // Unión de claves (respeta el orden de aparición).
  const columnas = [];
  const vistas = new Set();
  for (const it of items) {
    for (const k of Object.keys(it)) {
      if (!vistas.has(k)) {
        vistas.add(k);
        columnas.push(k);
      }
    }
  }
  const header = columnas.map(c => escapeCsv(c, sep)).join(sep);
  const filas = items.map(it =>
    columnas.map(c => escapeCsv(it[c], sep)).join(sep)
  );
  return [header, ...filas].join('\n');
}

/** Calcula un ETag estable a partir del contenido serializado. */
function calcularETag(payload) {
  const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hash = crypto.createHash('sha1').update(json).digest('base64');
  return `"${hash.slice(0, 27)}"`; // 27 chars base64 ≈ 160 bits
}

/**
 * Envía una respuesta con caché fuerte + ETag.
 * Si el cliente ya tiene la misma versión, responde 304 sin body.
 */
function enviarConCache(req, res, payload) {
  const etag = calcularETag(payload);
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', `public, max-age=${CONFIG.cacheMaxAge}, immutable`);
  res.setHeader('Vary', 'Accept');

  // If-None-Match: puede traer varios ETags separados por coma.
  const inm = req.headers['if-none-match'];
  if (inm) {
    const etags = inm.split(',').map(s => s.trim());
    if (etags.includes(etag) || etags.includes('*')) {
      return res.status(304).end();
    }
  }
  return res.json(payload);
}

/** Filtra items por coincidencia parcial en código/nombre (case-insensitive). */
function filtrar(items, termino) {
  if (!termino) return items;
  const q = String(termino).trim().toLowerCase();
  if (!q) return items;
  return items.filter(it => {
    const codigo = it.codigo != null ? String(it.codigo).toLowerCase() : '';
    const nombre = it.nombre != null ? String(it.nombre).toLowerCase() : '';
    return codigo.includes(q) || nombre.includes(q);
  });
}

// ============================================================
// ENDPOINTS
// ============================================================

// ---- GET /api/catalogos → todos los catálogos ----
router.get('/', (req, res) => {
  const formato = (soloString(req.query.formato) || CONFIG.formatoDefault).toLowerCase();
  const search = soloString(req.query.search);

  if (!CONFIG.formatosValidos.has(formato)) {
    return errorCatalogo(res, 400, ERRORES.FORMATO_INVALIDO,
      `Formato '${formato}' no soportado. Usa: ${[...CONFIG.formatosValidos].join(', ')}`);
  }

  const payload = {};
  for (const [k, v] of Object.entries(CATALOGOS_PUBLICOS)) {
    payload[k] = filtrar(v, search);
  }

  // CSV no tiene sentido para "todos los catálogos" → avisamos.
  if (formato !== 'json') {
    return errorCatalogo(res, 400, ERRORES.FORMATO_INVALIDO,
      `Formato '${formato}' no aplica a "todos los catálogos". Pide uno específico: /api/catalogos/<nombre>?formato=${formato}`);
  }

  return enviarConCache(req, res, payload);
});

// ---- GET /api/catalogos/buscar → busca en todos los catálogos ----
router.get('/buscar', (req, res) => {
  const q = (soloString(req.query.q) || '').trim();
  if (q.length < 2) {
    return errorCatalogo(res, 400, ERRORES.QUERY_INVALIDA,
      'Se requiere `q` con al menos 2 caracteres');
  }

  const resultados = [];
  for (const [catalogo, items] of Object.entries(CATALOGOS_PUBLICOS)) {
    for (const item of filtrar(items, q)) {
      resultados.push({ catalogo, ...item });
      if (resultados.length >= CONFIG.maxBusquedaResultados) break;
    }
    if (resultados.length >= CONFIG.maxBusquedaResultados) break;
  }

  return res.json({ query: q, total: resultados.length, resultados });
});

// ---- GET /api/catalogos/retencion/:codigo → resolver retención ----
// ⚠️  Declarado ANTES de `/:nombre` para evitar colisiones de routing.
router.get('/retencion/:codigo', (req, res) => {
  const codigo = String(req.params.codigo || '').trim();
  const impuesto = soloString(req.query.impuesto);

  if (!codigo) {
    return errorCatalogo(res, 400, ERRORES.QUERY_INVALIDA, 'Código requerido');
  }

  if (impuesto && !['RENTA', 'IVA'].includes(impuesto.toUpperCase())) {
    return errorCatalogo(res, 400, ERRORES.IMPUESTO_INVALIDO,
      "impuesto debe ser 'RENTA' o 'IVA'");
  }

  const imp = impuesto ? impuesto.toUpperCase() : null;
  const coincidencias = catalogos.TIPO_RETENCION.filter(t =>
    t.codigo === codigo && (!imp || t.impuesto === imp)
  );

  if (coincidencias.length === 0) {
    return errorCatalogo(res, 404, ERRORES.RETENCION_NO_ENCONTRADA,
      `No existe retención con código '${codigo}'${imp ? ` para ${imp}` : ''}`);
  }

  // Código ambiguo (existe en RENTA e IVA) sin filtrar → pedimos el impuesto.
  if (coincidencias.length > 1) {
    return errorCatalogo(res, 409, ERRORES.RETENCION_AMBIGUA,
      `El código '${codigo}' existe en múltiples impuestos. Agrega ?impuesto=RENTA o ?impuesto=IVA`,
      { opciones: coincidencias.map(c => ({ impuesto: c.impuesto, nombre: c.nombre })) });
  }

  return res.json(coincidencias[0]);
});

// ---- GET /api/catalogos/:nombre → un catálogo ----
router.get('/:nombre', (req, res) => {
  const { nombre } = req.params;
  const clave = resolverClave(nombre);

  if (!clave) {
    return errorCatalogo(res, 404, ERRORES.CATALOGO_NO_ENCONTRADO,
      `Catálogo '${nombre}' no encontrado`,
      { disponibles: Object.keys(CATALOGOS_PUBLICOS), aliases: Object.keys(ALIASES) });
  }

  const search = soloString(req.query.search);
  let items = filtrar(CATALOGOS_PUBLICOS[clave], search);

  // Filtro especial: TIPO_RETENCION puede filtrarse por impuesto.
  if (clave === 'TIPO_RETENCION') {
    const retFiltro = soloString(req.query.retenciones) || soloString(req.query.impuesto);
    if (retFiltro) {
      const imp = retFiltro.toUpperCase();
      if (!['RENTA', 'IVA'].includes(imp)) {
        return errorCatalogo(res, 400, ERRORES.IMPUESTO_INVALIDO,
          "retenciones/impuesto debe ser 'RENTA' o 'IVA'");
      }
      items = items.filter(t => t.impuesto === imp);
    }
  }

  const formato = (soloString(req.query.formato) || CONFIG.formatoDefault).toLowerCase();
  if (!CONFIG.formatosValidos.has(formato)) {
    return errorCatalogo(res, 400, ERRORES.FORMATO_INVALIDO,
      `Formato '${formato}' no soportado. Usa: ${[...CONFIG.formatosValidos].join(', ')}`);
  }

  // ---- CSV / TSV ----
  if (formato === 'csv' || formato === 'tsv') {
    const sep = formato === 'csv' ? ',' : '\t';
    const body = aDelimitado(items, sep);
    const filename = `${clave.toLowerCase()}.${formato}`;
    res.setHeader('Content-Type',
      formato === 'csv' ? 'text/csv; charset=utf-8' : 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', `public, max-age=${CONFIG.cacheMaxAge}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // BOM UTF-8 para que Excel abra bien los acentos.
    return res.send('\uFEFF' + body);
  }

  // ---- JSON (con caché fuerte) ----
  return enviarConCache(req, res, items);
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._CATALOGOS_PUBLICOS = CATALOGOS_PUBLICOS;
module.exports._ALIASES = ALIASES;
module.exports._resolverClave = resolverClave;
module.exports._filtrar = filtrar;
module.exports._aDelimitado = aDelimitado;
module.exports._escapeCsv = escapeCsv;
module.exports._calcularETag = calcularETag;