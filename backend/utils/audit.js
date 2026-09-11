// backend/utils/audit.js
// Helper para registrar acciones en la colección "auditoria"

const { ObjectId } = require('mongodb');

/**
 * Registra una acción en la colección de auditoría.
 * No bloquea la respuesta: si falla, solo loguea en consola.
 *
 * @param {object} db - conexión a MongoDB (req.db)
 * @param {object} req - request de Express
 * @param {object} options - { accion, coleccion, documentoId, documentoNumero, datosAnteriores, datosNuevos, detalle }
 */
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
      detalle = ''
    } = options;

    // Datos del usuario desde JWT
    const usuarioId = req.user?.userId || null;
    const usuarioEmail = req.user?.email || 'anónimo';
    const usuarioRol = req.user?.rol || '';

    // Nombre del usuario (si existe en la request, mejor)
    const usuarioNombre = req.user?.nombre || req.user?.nombreCompleto || usuarioEmail;

    // IP real (considerando proxies)
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      '';

    const userAgent = req.headers['user-agent'] || '';

    // Sanitizar datos para no guardar passwords
    const limpiar = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      const copia = Array.isArray(obj) ? [...obj] : { ...obj };
      const camposSensibles = ['password', 'passwordActual', 'passwordNueva', 'token'];
      camposSensibles.forEach(c => {
        if (c in copia) copia[c] = '***';
      });
      return copia;
    };

    const registro = {
      accion,
      coleccion,
      documentoId: documentoId ? (documentoId instanceof ObjectId ? documentoId : new ObjectId(documentoId)) : null,
      documentoNumero: String(documentoNumero || ''),
      detalle: String(detalle || ''),
      usuarioId: usuarioId ? new ObjectId(usuarioId) : null,
      usuarioEmail,
      usuarioNombre,
      usuarioRol,
      ip,
      userAgent,
      datosAnteriores: limpiar(datosAnteriores),
      datosNuevos: limpiar(datosNuevos),
      fecha: new Date()
    };

    await db.collection('auditoria').insertOne(registro);
  } catch (err) {
    // Nunca lanzar error: no queremos que falle la operación principal
    console.error('⚠️ Error guardando auditoría:', err.message);
  }
}

module.exports = { logAudit };