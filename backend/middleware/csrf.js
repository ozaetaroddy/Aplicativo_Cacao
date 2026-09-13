// backend/middleware/csrf.js
// Protección CSRF simple pero efectiva:
//  - Los métodos seguros (GET, HEAD, OPTIONS) pasan sin chequeo.
//  - Las requests con `Authorization: Bearer` (apps móviles, scripts) pasan.
//  - Las requests con cookies DEBEN incluir `X-Requested-With: XMLHttpRequest`.
//
// ¿Por qué funciona?
// El navegador NO permite que una web externa envíe un header custom sin
// un preflight CORS que el atacante no puede aprobar. Los formularios HTML
// tradicionales tampoco pueden enviar headers custom. Así que cualquier
// request con este header es legítima.

module.exports = function csrfProtection(req, res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'];
  if (safe.includes(req.method)) return next();

  // Permitir autenticación por Bearer (compatibilidad con apps/scripts)
  if ((req.headers.authorization || '').startsWith('Bearer ')) return next();

  // Para requests basadas en cookie, exigir el header custom
  const requestedWith = req.headers['x-requested-with'];
  if (requestedWith !== 'XMLHttpRequest') {
    return res.status(403).json({
      error: 'Solicitud bloqueada por protección CSRF',
      codigo: 'CSRF_BLOCKED'
    });
  }

  next();
};