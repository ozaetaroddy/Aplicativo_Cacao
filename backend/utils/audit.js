// backend/utils/audit.js
// Helper para registrar acciones en la colección "auditoria".
// Nunca lanza error (para no romper la operación principal).

const { ObjectId } = require('mongodb');

const CAMPOS_SENSIBLES = new Set([
  'password', 'passwordactual', 'passwordnueva', 'passwordcifrado',
  'password_cifrado', 'token', 'jwt', 'secret', 'apikey', 'api_key',
  'privatekey', 'privatekeypem', 'archivo_base64', 'p12',
  'authorization', 'bearer', 'refreshtoken', 'password_cifrado'
]);

// Campos que NUNCA se guardan en auditoría por tamaño/irrelevancia forense
const CAMPOS_OMITIDOS = new Set([
  'xml_generado', 'xml_firmado', 'xml_autorizado',
  'respuesta_sri', 'comprobanteautorizado',
  'contenido', 'archivo_base64', 'buffer',
  'htmlbody', 'textbody'
]);

const MAX_STRING = 2000;
const MAX_ARRAY = 50;
const MAX_DEPTH = 5;

function limpiar(obj, profundidad = 0) {
  if (obj === null || obj === undefined) return obj;
  if (profundidad > MAX_DEPTH) return '[demasiado profundo]';

  if (obj instanceof ObjectId) return obj.toString();
  if (obj instanceof Date) return obj.toISOString();
  if (obj instanceof Buffer) return `[Buffer ${obj.length}B]`;

  if (typeof obj === 'string') {
    return obj.length > MAX_STRING ? obj.slice(0, MAX_STRING) + '...[truncado]' : obj;
  }
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    const arr = obj.slice(0, MAX_ARRAY).map(x => limpiar(x, profundidad + 1));
    if (obj.length > MAX_ARRAY) arr.push(`...(${obj.length - MAX_ARRAY} más)`);
    return arr;
  }

  const copia = {};
  for (const [k, v] of Object.entries(obj)) {
    const kLower = k.toLowerCase();
    if (CAMPOS_SENSIBLES.has(kLower)) {
      copia[k] = '***';
    } else if (CAMPOS_OMITIDOS.has(kLower)) {
      copia[k] = '[omitido por tamaño]';
    } else {
      copia[k] = limpiar(v, profundidad + 1);
    }
  }
  return copia;
}

function extraerIP(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return cf;

  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();

  const xri = req.headers['x-real-ip'];
  if (xri) return xri;

  return req.socket?.remoteAddress || req.ip || '';
}

async function logAudit(db, req, options = {}) {
  try {
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

    const usuarioId = req.user?.userId || null;
    const usuarioEmail = req.user?.email || 'anónimo';
    const usuarioRol = req.user?.rol || '';
    const usuarioNombre = req.user?.nombre || usuarioEmail;

    let docId = null;
    if (documentoId) {
      if (documentoId instanceof ObjectId) {
        docId = documentoId;
      } else if (typeof documentoId === 'string' && ObjectId.isValid(documentoId)) {
        docId = new ObjectId(documentoId);
      } else {
        docId = String(documentoId);
      }
    }

    let userObjId = null;
    if (usuarioId) {
      if (usuarioId instanceof ObjectId) {
        userObjId = usuarioId;
      } else if (typeof usuarioId === 'string' && ObjectId.isValid(usuarioId)) {
        userObjId = new ObjectId(usuarioId);
      }
    }

    const registro = {
      accion,
      coleccion,
      documentoId: docId,
      documentoNumero: String(documentoNumero || '').slice(0, 200),
      detalle: String(detalle || '').slice(0, 1000),
      usuarioId: userObjId,
      usuarioEmail,
      usuarioNombre: String(usuarioNombre).slice(0, 100),
      usuarioRol,
      ip: extraerIP(req),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
      datosAnteriores: limpiar(datosAnteriores),
      datosNuevos: limpiar(datosNuevos),
      meta: meta ? limpiar(meta) : null,
      fecha: new Date()
    };

    await db.collection('auditoria').insertOne(registro);
  } catch (err) {
    console.error('⚠️  Error guardando auditoría:', err.message);
  }
}

module.exports = { logAudit, limpiar, extraerIP };