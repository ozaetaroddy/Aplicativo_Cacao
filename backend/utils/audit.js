// backend/utils/audit.js
// ============================================================
// Auditoría — registro de acciones en la colección `auditoria`.
// ------------------------------------------------------------
// Contrato:
//   logAudit(db, req, options) → Promise<void>
//
// Garantías:
//   - NUNCA lanza. Cualquier error se loggea y se traga.
//   - Los datos sensibles se redactan (`***`).
//   - Los campos grandes se omiten (`[omitido por tamaño]`).
//   - Se protege contra referencias circulares y profundidad excesiva.
//   - Los strings/arrays se truncan con un sufijo claro.
//
// Uso:
//   await logAudit(req.db, req, {
//     accion: 'crear',
//     coleccion: 'clientes',
//     documentoId: result.insertedId,
//     documentoNumero: '1790012344001',
//     datosNuevos: { nombre, ruc },
//     detalle: 'Cliente creado: ACME S.A.'
//   });
// ============================================================
'use strict';

const { ObjectId } = require('mongodb');
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

const CONFIG = Object.freeze({
  col: 'auditoria',

  /** Desactivar la escritura (útil en tests o modo API puro). */
  enabled: String(process.env.AUDIT_ENABLED ?? 'true').toLowerCase() !== 'false',

  /** Límites de truncado. */
  maxString:           envNum('AUDIT_MAX_STRING',     2000),
  maxArray:            envNum('AUDIT_MAX_ARRAY',        50),
  maxDepth:            envNum('AUDIT_MAX_DEPTH',         5),
  maxDetalle:          envNum('AUDIT_MAX_DETALLE',    1000),
  maxDocumentoNumero:  envNum('AUDIT_MAX_DOC_NUM',     200),
  maxUserAgent:        envNum('AUDIT_MAX_UA',          300),
  maxUsuarioNombre:    envNum('AUDIT_MAX_NOMBRE',      100),
  maxUsuarioEmail:     envNum('AUDIT_MAX_EMAIL',       200),
  maxColeccion:        envNum('AUDIT_MAX_COLECCION',   100),
  maxAccion:           envNum('AUDIT_MAX_ACCION',      100),

  /** Sufijos de truncado. */
  sufijoTruncado:   '...[truncado]',
  sufijoArray:      '...',
  placeholderCircular: '[circular]',
  placeholderProfundo: '[demasiado profundo]',
  placeholderSensible: '***',
  placeholderOmitido:  '[omitido por tamaño]',
  placeholderBuffer:   (n) => `[Buffer ${n}B]`
});

// ============================================================
// CAMPOS SENSIBLES (nunca deben quedar en claro)
// ============================================================
// Todo se compara en minúsculas.
const CAMPOS_SENSIBLES = Object.freeze(new Set([
  'password',
  'passwordactual',
  'passwordnueva',
  'passwordcifrado',
  'password_cifrado',
  'token',
  'jwt',
  'secret',
  'apikey',
  'api_key',
  'privatekey',
  'privatekeypem',
  'archivo_base64',
  'p12',
  'authorization',
  'bearer',
  'refreshtoken',
  'refresh_token',
  'access_token',
  'csrf_token',
  'cookie'
]));

// ============================================================
// CAMPOS OMITIDOS (grandes o irrelevantes para forense)
// ============================================================
const CAMPOS_OMITIDOS = Object.freeze(new Set([
  'xml_generado',
  'xml_firmado',
  'xml_autorizado',
  'respuesta_sri',
  'comprobanteautorizado',
  'contenido',
  'buffer',
  'htmlbody',
  'textbody',
  'documentos', // en verificar-integridad puede ser enorme
  'detalles'    // si el caller quiere auditar detalles, que los reduzca antes
]));

// ============================================================
// HELPERS DE TRUNCACIÓN
// ============================================================
/**
 * Trunca un string a `max` caracteres agregando el sufijo.
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
function truncarString(s, max) {
  if (typeof s !== 'string') return '';
  if (s.length <= max) return s;
  // Reservamos espacio para el sufijo para no pasarnos del límite.
  const sufijo = CONFIG.sufijoTruncado;
  const corte = Math.max(0, max - sufijo.length);
  return s.slice(0, corte) + sufijo;
}

// ============================================================
// LIMPIADOR RECURSIVO
// ============================================================
/**
 * Devuelve una copia segura para auditoría:
 *   - Redacta campos sensibles.
 *   - Omite campos voluminosos.
 *   - Trunca strings largos.
 *   - Limita profundidad y cantidad de elementos por array.
 *   - Convierte ObjectId / Date / Buffer / BigInt a representaciones seguras.
 *   - Detecta referencias circulares.
 *
 * @param {*} obj
 * @param {object} [opts]
 * @param {number} [opts.profundidad=0]
 * @param {WeakSet<object>} [opts.vistos]
 * @returns {*}
 */
function limpiar(obj, opts = {}) {
  const profundidad = opts.profundidad || 0;
  const vistos = opts.vistos || new WeakSet();

  if (obj === null || obj === undefined) return obj;
  if (profundidad > CONFIG.maxDepth) return CONFIG.placeholderProfundo;

  // ---- Tipos primitivos especiales ----
  if (typeof obj === 'string') return truncarString(obj, CONFIG.maxString);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (typeof obj === 'bigint') return `${obj}n`;
  if (typeof obj === 'function') return '[función]';
  if (typeof obj === 'symbol') return `[símbolo ${String(obj.description || '')}]`;

  // ---- BSON / nativos ----
  if (obj instanceof ObjectId) return obj.toString();
  // Cross-realm: chequeo por marca BSON (funciona con múltiples copias de mongodb).
  if (obj && obj._bsontype === 'ObjectID') return String(obj);

  if (obj instanceof Date) {
    return Number.isNaN(obj.getTime()) ? '[fecha inválida]' : obj.toISOString();
  }

  if (obj instanceof Buffer || (typeof Buffer !== 'undefined' && Buffer.isBuffer(obj))) {
    return CONFIG.placeholderBuffer(obj.length);
  }

  if (obj instanceof Error) {
    return { name: obj.name, message: obj.message };
  }

  // ---- Objetos y arrays ----
  if (typeof obj === 'object') {
    if (vistos.has(obj)) return CONFIG.placeholderCircular;
    vistos.add(obj);
  }

  if (Array.isArray(obj)) {
    const slice = obj.slice(0, CONFIG.maxArray);
    const arr = slice.map(x =>
      limpiar(x, { profundidad: profundidad + 1, vistos })
    );
    if (obj.length > CONFIG.maxArray) {
      arr.push(`${CONFIG.sufijoArray}(${obj.length - CONFIG.maxArray} más)`);
    }
    return arr;
  }

  const copia = {};
  for (const [k, v] of Object.entries(obj)) {
    const kLower = k.toLowerCase();
    if (CAMPOS_SENSIBLES.has(kLower)) {
      copia[k] = CONFIG.placeholderSensible;
    } else if (CAMPOS_OMITIDOS.has(kLower)) {
      copia[k] = CONFIG.placeholderOmitido;
    } else {
      copia[k] = limpiar(v, { profundidad: profundidad + 1, vistos });
    }
  }
  return copia;
}

// ============================================================
// EXTRACCIÓN DE IP
// ============================================================
/**
 * Extrae la IP del cliente priorizando cabeceras de proxy.
 * Sanitiza espacios y el prefijo `::ffff:` de IPv4-mapped IPv6.
 *
 * @param {object} req
 * @returns {string}
 */
function extraerIP(req) {
  if (!req || !req.headers) {
    return String(req?.socket?.remoteAddress || req?.ip || '').slice(0, 64);
  }

  // Prioridad: Cloudflare → X-Forwarded-For → X-Real-IP → socket.
  let ip =
    req.headers['cf-connecting-ip'] ||
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]
      : null) ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    req.ip ||
    '';

  ip = String(ip).trim();

  // Normaliza IPv4-mapped IPv6 → IPv4.
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);

  // Longitud razonable (IPv6 máximo ≈ 45 chars; 64 por margen).
  return ip.slice(0, 64);
}

// ============================================================
// CONVERSIÓN DE IDs
// ============================================================
/**
 * Convierte un valor a ObjectId si es válido, a string si no lo es,
 * o a un array de ambos si recibe un array.
 *
 * @param {*} valor
 * @returns {ObjectId|string|Array|null}
 */
function convertirId(valor) {
  if (valor === null || valor === undefined) return null;

  // Array (batch operations) → array de ids.
  if (Array.isArray(valor)) {
    return valor
      .slice(0, CONFIG.maxArray)
      .map(v => convertirId(v))
      .filter(v => v !== null);
  }

  if (valor instanceof ObjectId) return valor;
  if (valor && valor._bsontype === 'ObjectID') return valor;

  const s = String(valor).trim();
  if (!s) return null;
  if (ObjectId.isValid(s) && s.length === 24) {
    try { return new ObjectId(s); } catch { /* fallback a string */ }
  }
  return s.slice(0, 100);
}

// ============================================================
// NORMALIZACIÓN DE USUARIO
// ============================================================
/**
 * Extrae y trunca los datos del usuario autenticado.
 * @param {object} req
 */
function normalizarUsuario(req) {
  const u = req?.user || {};
  return {
    usuarioId: convertirId(u.userId || null),
    usuarioEmail: truncarString(String(u.email || 'anónimo'), CONFIG.maxUsuarioEmail),
    usuarioNombre: truncarString(String(u.nombre || u.email || ''), CONFIG.maxUsuarioNombre),
    usuarioRol: truncarString(String(u.rol || ''), 30)
  };
}

// ============================================================
// LOG PRINCIPAL
// ============================================================
/**
 * Registra una acción en `auditoria`. NUNCA lanza.
 *
 * @param {Db}     db
 * @param {object} req           Request de Express (puede ser parcial)
 * @param {object} [options]
 * @param {string} [options.accion='desconocida']
 * @param {string} [options.coleccion='']
 * @param {ObjectId|string|Array} [options.documentoId=null]
 * @param {string} [options.documentoNumero='']
 * @param {object} [options.datosAnteriores=null]
 * @param {object} [options.datosNuevos=null]
 * @param {string} [options.detalle='']
 * @param {object} [options.meta=null]
 * @returns {Promise<void>}
 */
async function logAudit(db, req, options = {}) {
  try {
    if (!CONFIG.enabled) return;
    if (!db) return;

    const {
      accion = 'desconocida',
      coleccion = '',
      documentoId = null,
      documentoNumero = '',
      datosAnteriores = null,
      datosNuevos = null,
      detalle = '',
      meta = null
    } = options;

    const usuario = normalizarUsuario(req);

    const registro = {
      accion: truncarString(String(accion), CONFIG.maxAccion),
      coleccion: truncarString(String(coleccion), CONFIG.maxColeccion),
      documentoId: convertirId(documentoId),
      documentoNumero: truncarString(String(documentoNumero || ''), CONFIG.maxDocumentoNumero),
      detalle: truncarString(String(detalle || ''), CONFIG.maxDetalle),

      ...usuario,

      ip: extraerIP(req),
      userAgent: truncarString(
        String(req?.headers?.['user-agent'] || ''),
        CONFIG.maxUserAgent
      ),

      datosAnteriores: datosAnteriores === null ? null : limpiar(datosAnteriores),
      datosNuevos:     datosNuevos     === null ? null : limpiar(datosNuevos),
      meta:            meta            === null ? null : limpiar(meta),

      fecha: new Date()
    };

    await db.collection(CONFIG.col).insertOne(registro);
  } catch (err) {
    // La auditoría NUNCA debe romper la request principal.
    try {
      log.warn(
        { err: err.message, accion: options?.accion, coleccion: options?.coleccion },
        'Fallo guardando auditoría'
      );
    } catch {
      // Si hasta el logger falla, silencio absoluto.
    }
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  logAudit,
  limpiar,
  extraerIP
};

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._CAMPOS_SENSIBLES = CAMPOS_SENSIBLES;
module.exports._CAMPOS_OMITIDOS = CAMPOS_OMITIDOS;
module.exports._truncarString = truncarString;
module.exports._convertirId = convertirId;
module.exports._normalizarUsuario = normalizarUsuario;