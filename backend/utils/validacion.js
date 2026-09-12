// backend/utils/validacion.js
// Helper centralizado de respuestas de validación para express-validator.

const { validationResult } = require('express-validator');

function respuestaValidacion(res, errors) {
  const arr = errors.array();
  return res.status(400).json({
    error: arr.map(e => e.msg).join(', '),
    codigo: 'VALIDACION',
    detalles: arr.map(e => ({ campo: e.path, mensaje: e.msg }))
  });
}

/**
 * Valida la request. Si hay errores, responde y devuelve `true`.
 * Uso:
 *   if (validar(req, res)) return;
 */
function validar(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  respuestaValidacion(res, errors);
  return true;
}

module.exports = { respuestaValidacion, validar };