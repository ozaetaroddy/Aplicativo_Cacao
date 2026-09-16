// backend/utils/qrGenerator.js
// ============================================================
// Generador de códigos QR para comprobantes electrónicos del SRI
// ------------------------------------------------------------
// Formato oficial (desde 2020):
//   El QR contiene directamente la clave de acceso (49 dígitos).
//   Es lo más compatible con las apps de verificación del SRI.
//
// API pública:
//   generarQRComprobante(data)  → { dataUrl, buffer, error?, codigo? }
//   generarQRClaveAcceso(clave) → string (dataUrl) | ''
//
// Extensiones:
//   generarQRDataUrl(clave, opts?) → string
//   generarQRBuffer(clave, opts?)  → Buffer
//   validarClaveAcceso(clave)      → { valido, motivo? }
//   getEstadisticasQR()            → { cacheHits, cacheMisses, ... }
//   limpiarCacheQR()               → void
//
// Configuración (env):
//   QR_WIDTH=200           → ancho en px
//   QR_MARGIN=1            → margen (quiet zone)
//   QR_ECC=M               → L|M|Q|H (corrección de errores)
//   QR_COLOR_DARK=#1a3a5c
//   QR_COLOR_LIGHT=#ffffff
//   QR_CACHE_MAX=100       → entradas del cache LRU
//   QR_TIMEOUT_MS=5000     → timeout por generación
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

function envStr(nombre, fallback) {
  const raw = process.env[nombre];
  return raw === undefined || raw === '' ? fallback : String(raw);
}

/** Niveles válidos de corrección de errores de QR. */
const ECC_VALIDOS = Object.freeze(['L', 'M', 'Q', 'H']);

/** Regex de clave de acceso SRI (49 dígitos). */
const CLAVE_REGEX = /^\d{49}$/;

const CONFIG = Object.freeze({
  /** Ancho del QR en píxeles. */
  width: envNum('QR_WIDTH', 200),

  /** Quiet zone (margen blanco alrededor). */
  margin: envNum('QR_MARGIN', 1),

  /** Nivel de corrección de errores: L(7%) M(15%) Q(25%) H(30%). */
  errorCorrectionLevel: (() => {
    const raw = String(envStr('QR_ECC', 'M')).toUpperCase();
    return ECC_VALIDOS.includes(raw) ? raw : 'M';
  })(),

  /** Colores. */
  colorDark: envStr('QR_COLOR_DARK', '#1a3a5c'),
  colorLight: envStr('QR_COLOR_LIGHT', '#ffffff'),

  /** Máx. entradas del cache. 0 = cache desactivado. */
  cacheMax: envNum('QR_CACHE_MAX', 100),

  /** Timeout por generación (ms). */
  timeoutMs: envNum('QR_TIMEOUT_MS', 5000)
});

// ============================================================
// ERRORES TIPADOS
// ============================================================
function errorTipado(mensaje, codigo, status = 400) {
  const err = new Error(mensaje);
  err.codigo = codigo;
  err.status = status;
  return err;
}

// ============================================================
// CARGA LAZY DE QRCODE
// ============================================================
let _QRCode = null;
let _QRCodeError = null;

/** Carga `qrcode` bajo demanda. Devuelve el módulo o `null`. */
function cargarQRCode() {
  if (_QRCode) return _QRCode;
  if (_QRCodeError) return null;
  try {
    // eslint-disable-next-line global-require
    _QRCode = require('qrcode');
    return _QRCode;
  } catch (err) {
    _QRCodeError = err;
    log.error({ err: err.message }, 'qrcode no está instalado');
    return null;
  }
}

// ============================================================
// VALIDACIÓN
// ============================================================
/**
 * Valida una clave de acceso SRI.
 * @param {*} clave
 * @returns {{ valido: boolean, motivo?: string }}
 */
function validarClaveAcceso(clave) {
  if (clave === null || clave === undefined || clave === '') {
    return { valido: false, motivo: 'Clave ausente' };
  }
  if (typeof clave !== 'string') {
    return { valido: false, motivo: 'Clave debe ser un string' };
  }
  if (clave.length !== 49) {
    return { valido: false, motivo: `Longitud ${clave.length} (esperado 49)` };
  }
  if (!CLAVE_REGEX.test(clave)) {
    return { valido: false, motivo: 'La clave debe contener solo dígitos' };
  }
  return { valido: true };
}

// ============================================================
// CACHE LRU
// ============================================================
const _cache = new Map();
const _stats = { hits: 0, misses: 0, generados: 0, fallidos: 0 };

/** Serializa las opciones en una clave de cache estable. */
function _optsKey(opts) {
  return `${opts.width}|${opts.margin}|${opts.errorCorrectionLevel}|${opts.color.dark}|${opts.color.light}`;
}

/** ¿Se pueden cachear estas opciones? Solo si son las default. */
function _esCacheable(opts) {
  if (CONFIG.cacheMax <= 0) return false;
  return _optsKey(opts) === _optsKey(defaultOpts());
}

function _cacheGet(clave, opts) {
  if (!_esCacheable(opts)) return null;
  const hit = _cache.get(clave);
  if (hit) _stats.hits++;
  else _stats.misses++;
  return hit || null;
}

function _cacheSet(clave, valor, opts) {
  if (!_esCacheable(opts)) return;
  if (_cache.size >= CONFIG.cacheMax) {
    // FIFO simple: elimina la primera entrada.
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) _cache.delete(firstKey);
  }
  _cache.set(clave, valor);
}

/** Vacía el cache (útil en tests o rotaciones). */
function limpiarCacheQR() {
  _cache.clear();
  _stats.hits = 0;
  _stats.misses = 0;
}

/** Snapshot de estadísticas (útil para /health). */
function getEstadisticasQR() {
  return {
    cacheSize: _cache.size,
    cacheMax: CONFIG.cacheMax,
    ...(_stats)
  };
}

// ============================================================
// OPTIONS
// ============================================================
/** Opciones por defecto (desde CONFIG). */
function defaultOpts() {
  return {
    width: CONFIG.width,
    margin: CONFIG.margin,
    errorCorrectionLevel: CONFIG.errorCorrectionLevel,
    color: {
      dark: CONFIG.colorDark,
      light: CONFIG.colorLight
    }
  };
}

/**
 * Mezcla las opciones del caller con las defaults, validando cada campo.
 * @param {object} [overrides]
 * @returns {object} Opciones finales.
 */
function mergeOpts(overrides = {}) {
  const base = defaultOpts();
  if (!overrides || typeof overrides !== 'object') return base;

  const out = { ...base };

  if (Number.isInteger(overrides.width) && overrides.width > 0) {
    out.width = overrides.width;
  }
  if (Number.isInteger(overrides.margin) && overrides.margin >= 0) {
    out.margin = overrides.margin;
  }
  if (typeof overrides.errorCorrectionLevel === 'string') {
    const ecc = overrides.errorCorrectionLevel.toUpperCase();
    if (ECC_VALIDOS.includes(ecc)) out.errorCorrectionLevel = ecc;
  }
  if (overrides.color && typeof overrides.color === 'object') {
    if (typeof overrides.color.dark === 'string' && overrides.color.dark) {
      out.color = { ...out.color, dark: overrides.color.dark };
    }
    if (typeof overrides.color.light === 'string' && overrides.color.light) {
      out.color = { ...out.color, light: overrides.color.light };
    }
  }

  return out;
}

// ============================================================
// GENERACIÓN (con timeout)
// ============================================================
/** Envuelve una promesa con timeout. */
function conTimeout(promesa, ms, mensaje) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(errorTipado(mensaje || `Timeout después de ${ms}ms`, 'QR_TIMEOUT', 504));
    }, ms);
    if (timer.unref) timer.unref();

    Promise.resolve(promesa).then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

/** Verifica que la lib esté cargada; lanza si no. */
function asegurarLibreria() {
  const QRCode = cargarQRCode();
  if (!QRCode) {
    throw errorTipado(
      'La librería qrcode no está instalada. Ejecuta: npm install qrcode',
      'QRCODE_NO_INSTALADO',
      500
    );
  }
  return QRCode;
}

// ============================================================
// API PRINCIPAL
// ============================================================
/**
 * Genera un QR con la clave de acceso del SRI.
 *
 * @param {object} data
 * @param {string} data.claveAcceso   Clave de 49 dígitos (obligatoria).
 * @param {string} [data.ruc]         (Informativo)
 * @param {string} [data.tipoComprobante]  (Informativo)
 * @param {string} [data.numeroComprobante] (Informativo)
 * @param {Date|string} [data.fechaEmision] (Informativo)
 * @param {number|string} [data.montoTotal] (Informativo)
 * @param {object} [data.opts]        Opciones de renderizado.
 * @param {boolean} [data.soloDataUrl]  Si `true`, omite el buffer.
 * @param {boolean} [data.soloBuffer]   Si `true`, omite el dataUrl.
 * @returns {Promise<{
 *   dataUrl: string,
 *   buffer: Buffer|null,
 *   error?: string,
 *   codigo?: string
 * }>}
 */
async function generarQRComprobante(data = {}) {
  const {
    claveAcceso,
    opts: optsOverride,
    soloDataUrl = false,
    soloBuffer = false
  } = data;

  // ---- Validación ----
  const check = validarClaveAcceso(claveAcceso);
  if (!check.valido) {
    log.warn({ motivo: check.motivo }, 'QR: clave de acceso inválida');
    return {
      dataUrl: '',
      buffer: null,
      error: check.motivo,
      codigo: 'CLAVE_INVALIDA'
    };
  }

  // ---- Cache hit ----
  const opts = mergeOpts(optsOverride);
  const cacheHit = _cacheGet(claveAcceso, opts);
  if (cacheHit) {
    // Reusamos el valor cacheado adaptando la respuesta al request.
    return {
      dataUrl: soloBuffer ? '' : cacheHit.dataUrl,
      buffer: soloDataUrl ? null : cacheHit.buffer
    };
  }

  // ---- Generar ----
  try {
    const QRCode = asegurarLibreria();

    const necesitaDataUrl = !soloBuffer;
    const necesitaBuffer = !soloDataUrl;

    const promesas = [];
    const tareas = {};

    if (necesitaDataUrl) {
      tareas.dataUrl = conTimeout(
        QRCode.toDataURL(claveAcceso, { ...opts, type: 'image/png' }),
        CONFIG.timeoutMs,
        'Timeout generando QR (dataUrl)'
      );
    }
    if (necesitaBuffer) {
      tareas.buffer = conTimeout(
        QRCode.toBuffer(claveAcceso, { ...opts, type: 'png' }),
        CONFIG.timeoutMs,
        'Timeout generando QR (buffer)'
      );
    }

    // Ejecutamos en paralelo lo que se necesite.
    const [dataUrl, buffer] = await Promise.all([
      tareas.dataUrl || Promise.resolve(''),
      tareas.buffer || Promise.resolve(null)
    ]);

    _stats.generados++;

    // Cache (solo si el caller pidió ambos o podemos regenerar el faltante).
    _cacheSet(claveAcceso, { dataUrl, buffer }, opts);

    return { dataUrl, buffer };
  } catch (err) {
    _stats.fallidos++;
    log.error({ err: err.message, codigo: err.codigo }, 'Error generando QR');
    return {
      dataUrl: '',
      buffer: null,
      error: err.message,
      codigo: err.codigo || 'QR_GENERACION_FALLO'
    };
  }
}

/**
 * Genera un QR (dataUrl) a partir de una clave de acceso.
 * Compatible con la firma original.
 *
 * @param {string} claveAcceso
 * @param {object} [opts]
 * @returns {Promise<string>} dataUrl o '' si falla.
 */
async function generarQRClaveAcceso(claveAcceso, opts = {}) {
  const check = validarClaveAcceso(claveAcceso);
  if (!check.valido) {
    log.warn({ motivo: check.motivo }, 'QR: clave inválida');
    return '';
  }
  try {
    const QRCode = asegurarLibreria();
    const finalOpts = mergeOpts(opts);
    return await conTimeout(
      QRCode.toDataURL(claveAcceso, { ...finalOpts, type: 'image/png' }),
      CONFIG.timeoutMs,
      'Timeout generando QR'
    );
  } catch (err) {
    log.error({ err: err.message }, 'Error generando QR (dataUrl)');
    return '';
  }
}

// ============================================================
// HELPERS ATÓMICOS (para casos específicos)
// ============================================================
/**
 * Genera SOLO el dataUrl (base64 PNG).
 * Lanza error tipado si la clave es inválida.
 */
async function generarQRDataUrl(claveAcceso, opts = {}) {
  const check = validarClaveAcceso(claveAcceso);
  if (!check.valido) {
    throw errorTipado(check.motivo, 'CLAVE_INVALIDA');
  }
  const QRCode = asegurarLibreria();
  const finalOpts = mergeOpts(opts);
  return conTimeout(
    QRCode.toDataURL(claveAcceso, { ...finalOpts, type: 'image/png' }),
    CONFIG.timeoutMs,
    'Timeout generando QR'
  );
}

/**
 * Genera SOLO el buffer PNG.
 * Lanza error tipado si la clave es inválida.
 */
async function generarQRBuffer(claveAcceso, opts = {}) {
  const check = validarClaveAcceso(claveAcceso);
  if (!check.valido) {
    throw errorTipado(check.motivo, 'CLAVE_INVALIDA');
  }
  const QRCode = asegurarLibreria();
  const finalOpts = mergeOpts(opts);
  return conTimeout(
    QRCode.toBuffer(claveAcceso, { ...finalOpts, type: 'png' }),
    CONFIG.timeoutMs,
    'Timeout generando QR'
  );
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  generarQRComprobante,
  generarQRClaveAcceso,

  // ---- Extensiones ----
  generarQRDataUrl,
  generarQRBuffer,
  validarClaveAcceso,
  limpiarCacheQR,
  getEstadisticasQR,

  // ---- Constantes ----
  CONFIG,
  ECC_VALIDOS
};

// ---- Solo para tests ----
module.exports._cargarQRCode = cargarQRCode;
module.exports._mergeOpts = mergeOpts;
module.exports._defaultOpts = defaultOpts;
module.exports._cache = _cache;
module.exports._stats = _stats;
module.exports._optsKey = _optsKey;
module.exports._esCacheable = _esCacheable;
module.exports._errorTipado = errorTipado;
module.exports._CLAVE_REGEX = CLAVE_REGEX;
module.exports._resetLibreria = () => { _QRCode = null; _QRCodeError = null; };