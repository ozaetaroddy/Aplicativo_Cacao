// backend/utils/pagination.js
// ============================================================
// Helpers para paginación, ordenamiento, filtros y búsqueda
// ------------------------------------------------------------
// Todos los helpers son PUROS: no mutan el `query` de Express.
// Los valores inválidos se descartan silenciosamente (o se
// sustituyen por defaults seguros). Ninguno lanza por defecto.
//
// API pública:
//   parsePagination(query, opts?)      → { page, limit, skip }
//   wantsPagination(query)             → boolean
//   buildDateRange(query, field?, opts?) → { [field]: { $gte, $lte } } | null
//   parseSort(query, default?, opts?)  → { campo: 1|-1 } | [{...}]
//   escapeRegex(texto)                 → string
//   CAMPOS_ORDENABLES                  → Set<string>
//
// Extensiones:
//   parseIdsList(valor, opts?)         → string[] | ObjectId[]
//   parseFields(valor, permitidos?)    → { campo: 1 } | null
//   getPaginationMeta(query, total)    → objeto listo para res.json()
//   parseBool(valor, default?)         → boolean
//   buildSort(query, default?)         → alias de parseSort
//   escapeRegexCached(texto)           → versión con cache
// ============================================================
'use strict';

const { ObjectId } = require('mongodb');

// ============================================================
// CONFIGURACIÓN (env-driven)
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  /** Límite por defecto si no se especifica `limit`. */
  defaultLimit: envNum('PAGINATION_DEFAULT_LIMIT', 20),

  /** Tope superior para `limit` (evita payloads enormes). */
  maxLimit: envNum('PAGINATION_MAX_LIMIT', 200),

  /** Tope superior para `page` (evita `skip` gigantes que cuelgan Mongo). */
  maxPage: envNum('PAGINATION_MAX_PAGE', 100_000),

  /** Máx. días de rango en `buildDateRange` (0 = sin tope). */
  maxDiasRango: envNum('PAGINATION_MAX_DIAS_RANGO', 366 * 3),

  /** Máx. entradas del cache LRU de `escapeRegexCached`. */
  cacheMaxSize: envNum('PAGINATION_CACHE_MAX', 500)
});

// ============================================================
// HELPERS INTERNOS
// ============================================================
/** Solo acepta strings no vacíos; el resto se descarta. */
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Parsea un entero estricto desde un valor de query.
 * Rechaza:
 *   - no-numéricos (`'abc'`, `'1e5'`, `'12abc'`)
 *   - negativos, cero
 *   - notación científica
 *   - leading zeros (`'012'` → rechazado por ambigüedad histórica)
 *
 * @param {*} valor
 * @param {object} [opts]
 * @param {number} [opts.min=1]
 * @param {number} [opts.max=Number.MAX_SAFE_INTEGER]
 * @returns {number|null}
 */
function parseEnteroEstricto(valor, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') {
    return Number.isInteger(valor) && valor >= min && valor <= max ? valor : null;
  }
  if (typeof valor !== 'string') return null;

  const s = valor.trim();
  if (!s) return null;
  // Solo dígitos, sin signos ni decimales ni notación científica.
  if (!/^[1-9]\d*$/.test(s)) {
    // Aceptamos un único '0' explícito para casos especiales.
    if (s === '0' && min <= 0) return 0;
    return null;
  }

  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/** `true` si el valor es un string con contenido. */
function tieneValor(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// ============================================================
// PAGINACIÓN
// ============================================================
/**
 * Parsea `page` y `limit` desde el query.
 * Acota `page` a `maxPage` y `limit` a `maxLimit`.
 *
 * @param {object} query            `req.query`
 * @param {object} [opts]
 * @param {number} [opts.defaultLimit]
 * @param {number} [opts.maxLimit]
 * @param {number} [opts.maxPage]
 * @returns {{ page: number, limit: number, skip: number }}
 */
function parsePagination(query = {}, opts = {}) {
  const {
    defaultLimit = CONFIG.defaultLimit,
    maxLimit = CONFIG.maxLimit,
    maxPage = CONFIG.maxPage
  } = opts;

  const pageRaw = parseEnteroEstricto(query?.page, { min: 1, max: maxPage });
  const limitRaw = parseEnteroEstricto(query?.limit, { min: 1, max: maxLimit });

  const page = pageRaw ?? 1;
  const limit = limitRaw ?? defaultLimit;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Indica si el cliente pidió paginación explícitamente.
 * Un `?page=` vacío NO cuenta como pedido de paginación.
 *
 * @param {object} query
 * @returns {boolean}
 */
function wantsPagination(query = {}) {
  if (!query || typeof query !== 'object') return false;
  return tieneValor(query.page) || tieneValor(query.limit);
}

/**
 * Devuelve los metadatos de paginación listos para enviar en la respuesta.
 *
 * @param {object} query
 * @param {number} total
 * @param {object} [opts]
 * @returns {{
 *   total: number,
 *   page: number,
 *   limit: number,
 *   totalPages: number,
 *   hasNext: boolean,
 *   hasPrev: boolean
 * }}
 */
function getPaginationMeta(query = {}, total = 0, opts = {}) {
  const { page, limit } = parsePagination(query, opts);
  const totalSafe = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const totalPages = limit > 0 ? Math.ceil(totalSafe / limit) : 0;

  return {
    total: totalSafe,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

// ============================================================
// FECHAS
// ============================================================
/**
 * Parsea una fecha `YYYY-MM-DD` o ISO.
 * Rechaza fechas imposibles (`2024-02-30`).
 *
 * ⚠️  Los strings `YYYY-MM-DD` se interpretan como fecha **local**,
 *     no UTC — de lo contrario `.getDate()` da off-by-one en TZ -05:00.
 *
 * @param {*} valor
 * @param {object} [opts]
 * @param {boolean} [opts.finDelDia=false]
 * @returns {Date|null}
 */
function parseFecha(valor, { finDelDia = false } = {}) {
  if (!tieneValor(valor)) return null;
  const s = String(valor).trim();

  // ---- String YYYY-MM-DD → fecha local ----
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let d;
  if (m) {
    const [, y, mo, dd] = m.map(Number);
    const check = new Date(Date.UTC(y, mo - 1, dd));
    if (
      check.getUTCFullYear() !== y ||
      check.getUTCMonth() !== mo - 1 ||
      check.getUTCDate() !== dd
    ) {
      return null;
    }
    d = new Date(y, mo - 1, dd); // local
  } else {
    d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
  }

  if (finDelDia) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Construye un filtro de rango de fechas para Mongo.
 *
 * @param {object} query                `req.query`
 * @param {string} [field='fecha_emision']
 * @param {object} [opts]
 * @param {boolean} [opts.strict=false]  Si `true`, lanza en rango inválido.
 * @param {number}  [opts.maxDias=CONFIG.maxDiasRango]  0 = sin tope.
 * @returns {object|null} `{ [field]: { $gte, $lte } }` o `null`.
 */
function buildDateRange(query = {}, field = 'fecha_emision', opts = {}) {
  const { strict = false, maxDias = CONFIG.maxDiasRango } = opts;

  const desdeRaw = query?.desde;
  const hastaRaw = query?.hasta;

  const desde = parseFecha(desdeRaw, { finDelDia: false });
  const hasta = parseFecha(hastaRaw, { finDelDia: true });

  // Si el usuario pasó algo y no se pudo parsear → error (o null).
  if (tieneValor(desdeRaw) && !desde) {
    if (strict) {
      const err = new Error(`Fecha "desde" inválida: ${desdeRaw}`);
      err.codigo = 'DESDE_INVALIDO';
      err.status = 400;
      throw err;
    }
    return null;
  }
  if (tieneValor(hastaRaw) && !hasta) {
    if (strict) {
      const err = new Error(`Fecha "hasta" inválida: ${hastaRaw}`);
      err.codigo = 'HASTA_INVALIDO';
      err.status = 400;
      throw err;
    }
    return null;
  }

  if (!desde && !hasta) return null;

  if (desde && hasta && desde > hasta) {
    if (strict) {
      const err = new Error('"desde" no puede ser posterior a "hasta"');
      err.codigo = 'RANGO_INVALIDO';
      err.status = 400;
      throw err;
    }
    return null;
  }

  // Tope de días (evita escanear años accidentalmente).
  if (desde && hasta && maxDias > 0) {
    const dias = Math.ceil((hasta - desde) / 86_400_000);
    if (dias > maxDias) {
      if (strict) {
        const err = new Error(`El rango no puede exceder ${maxDias} días (se pidieron ${dias})`);
        err.codigo = 'RANGO_DEMASIADO_LARGO';
        err.status = 400;
        throw err;
      }
      return null;
    }
  }

  const range = {};
  if (desde) range.$gte = desde;
  if (hasta) range.$lte = hasta;

  return { [field]: range };
}

// ============================================================
// ORDENAMIENTO
// ============================================================
/**
 * Whitelist global de campos ordenables.
 * Si `sortBy` no está aquí, se ignora silenciosamente.
 */
const CAMPOS_ORDENABLES = new Set([
  // Fechas
  'fecha', 'fecha_emision', 'fecha_pago', 'fecha_firma', 'fecha_autorizacion',
  'fecha_vencimiento', 'ultimo_envio_sri', 'ultima_consulta_sri',
  'createdAt', 'updatedAt', 'fecha_cierre', 'anio', 'mes',

  // Documentos
  'numero_factura', 'numero_recibo', 'numero_guia', 'numero_retencion',
  'numero_comprobante', 'numero_autorizacion', 'numero_exportacion',
  'clave_acceso', 'referencia',

  // Montos
  'total', 'subtotal', 'iva', 'monto', 'monto_pagado',
  'precio_unitario', 'precio_venta', 'precio_compra',
  'cantidad', 'saldo', 'saldoPendiente', 'retencion_valor', 'porcentaje',

  // Entidades
  'nombre', 'nombreNorm', 'razon_social', 'nombre_comercial',
  'ruc', 'codigo', 'codigoNorm', 'codigo_barras', 'email',

  // Inventario
  'stock', 'stock_minimo', 'saldo_stock',

  // Estados
  'estado_sri', 'estado_pago', 'tipo_documento', 'tipo_compra', 'tipo',
  'anulado', 'activo', 'rol',

  // Auditoría
  'accion', 'coleccion', 'usuarioEmail', 'documentoNumero', 'ip',

  // Otros
  'dias', 'diasUltimaFactura'
]);

/**
 * Parsea `sortBy`/`sortDir` desde el query.
 *
 * @param {object} query
 * @param {object} [defaultSort={fecha_emision: -1}]
 * @param {object} [opts]
 * @param {Iterable<string>} [opts.permitidos]     Whitelist custom.
 * @param {boolean} [opts.array=false]             Devuelve array de `{campo: dir}`.
 * @param {string} [opts.defaultDir='desc']
 * @returns {object|Array<object>}
 */
function parseSort(query = {}, defaultSort = { fecha_emision: -1 }, opts = {}) {
  const {
    permitidos = CAMPOS_ORDENABLES,
    array = false,
    defaultDir = 'desc'
  } = opts;

  const sortBy = tieneValor(query?.sortBy) ? String(query.sortBy).trim() : null;
  if (!sortBy) return defaultSort;

  // Soporta whitelist como Set o array.
  const permitidosSet = permitidos instanceof Set
    ? permitidos
    : new Set(permitidos);

  // Puede venir como `?sortBy=a,b,c` para múltiples campos.
  const campos = sortBy.split(',').map(c => c.trim()).filter(Boolean);
  const direccionBase = tieneValor(query?.sortDir)
    ? String(query.sortDir).trim().toLowerCase()
    : defaultDir;

  const validos = [];
  for (const campo of campos) {
    if (!permitidosSet.has(campo)) continue;
    validos.push(campo);
  }

  if (validos.length === 0) return defaultSort;

  // Un solo campo → mismo formato de siempre.
  if (validos.length === 1 && !array) {
    const dir = direccionBase === 'asc' ? 1 : -1;
    return { [validos[0]]: dir };
  }

  // Múltiples → array (o merge de objetos).
  const dir = direccionBase === 'asc' ? 1 : -1;
  if (array) {
    return validos.map(c => ({ [c]: dir }));
  }
  const merged = {};
  for (const c of validos) merged[c] = dir;
  return merged;
}

/** Alias semántico de `parseSort`. */
function buildSort(query, defaultSort, opts) {
  return parseSort(query, defaultSort, opts);
}

// ============================================================
// BÚSQUEDA
// ============================================================
/**
 * Escapa caracteres especiales de regex (evita ReDoS).
 * @param {*} texto
 * @returns {string}
 */
function escapeRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Cache LRU de regex escapados.
const _cacheEscape = new Map();

/**
 * Igual que `escapeRegex` pero cachea el resultado (útil cuando el
 * mismo `search` se usa en varias queries de una request).
 * @param {*} texto
 * @returns {string}
 */
function escapeRegexCached(texto) {
  const s = String(texto);
  if (_cacheEscape.has(s)) return _cacheEscape.get(s);

  const out = escapeRegex(s);
  if (_cacheEscape.size >= CONFIG.cacheMaxSize) {
    // FIFO simple: elimina la primera entrada.
    const firstKey = _cacheEscape.keys().next().value;
    if (firstKey !== undefined) _cacheEscape.delete(firstKey);
  }
  _cacheEscape.set(s, out);
  return out;
}

// ============================================================
// PROYECCIONES Y FILTROS
// ============================================================
/**
 * Convierte `?fields=a,b,c` en un objeto de proyección Mongo.
 * Solo incluye los campos si están en la whitelist (evita
 * exponer campos sensibles).
 *
 * @param {*} valor
 * @param {Set<string>|string[]|null} permitidos   `null` = cualquier campo.
 * @returns {object|null}
 */
function parseFields(valor, permitidos = null) {
  if (!tieneValor(valor)) return null;

  const campos = String(valor).split(',').map(s => s.trim()).filter(Boolean);
  if (campos.length === 0) return null;

  const permitidosSet = permitidos
    ? (permitidos instanceof Set ? permitidos : new Set(permitidos))
    : null;

  const proyeccion = {};
  for (const c of campos) {
    if (!/^[a-zA-Z_][\w.]*$/.test(c)) continue;    // solo nombres válidos
    if (permitidosSet && !permitidosSet.has(c)) continue;
    proyeccion[c] = 1;
  }
  return Object.keys(proyeccion).length > 0 ? proyeccion : null;
}

/**
 * Convierte `?ids=a,b,c` en un array de ObjectId (o strings si
 * `comoObjectId=false`).
 *
 * @param {*} valor
 * @param {object} [opts]
 * @param {boolean} [opts.comoObjectId=true]
 * @param {number}  [opts.max=100]
 * @returns {Array<ObjectId|string>|null}
 */
function parseIdsList(valor, opts = {}) {
  const { comoObjectId = true, max = 100 } = opts;

  if (!tieneValor(valor)) return null;
  const partes = String(valor).split(',').map(s => s.trim()).filter(Boolean);
  if (partes.length === 0) return null;
  if (partes.length > max) return null;

  const out = [];
  for (const p of partes) {
    if (comoObjectId) {
      if (ObjectId.isValid(p)) out.push(new ObjectId(p));
    } else {
      out.push(p);
    }
  }
  return out.length > 0 ? out : null;
}

/**
 * Parsea un booleano de query.
 * Acepta: `'true'|'1'|true` → true; `'false'|'0'|false` → false.
 *
 * @param {*} valor
 * @param {boolean} [fallback=false]
 * @returns {boolean}
 */
function parseBool(valor, fallback = false) {
  if (valor === undefined || valor === null || valor === '') return fallback;
  if (typeof valor === 'boolean') return valor;
  if (valor === 1 || valor === '1') return true;
  if (valor === 0 || valor === '0') return false;
  const s = String(valor).trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return fallback;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  parsePagination,
  wantsPagination,
  buildDateRange,
  parseSort,
  escapeRegex,
  CAMPOS_ORDENABLES,

  // ---- Extensiones ----
  getPaginationMeta,
  parseFecha,
  buildSort,
  escapeRegexCached,
  parseFields,
  parseIdsList,
  parseBool,

  // ---- Constantes ----
  CONFIG
};

// ---- Solo para tests ----
module.exports._parseEnteroEstricto = parseEnteroEstricto;
module.exports._tieneValor = tieneValor;
module.exports._cacheEscape = _cacheEscape;
module.exports._resetCacheEscape = () => _cacheEscape.clear();