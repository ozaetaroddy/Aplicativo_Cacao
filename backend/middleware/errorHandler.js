// backend/middleware/errorHandler.js
// Manejo unificado de errores: { error, codigo, detalles?, stack? }
// No expone stack traces en producción.

const log = require('../utils/logger');

const IS_PROD = process.env.NODE_ENV === 'production';

const MONGO_NETWORK_ERRORS = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoTopologyClosedError',
  'MongoNotConnectedError',
  'MongoExpiredSessionError'
]);
const MONGO_TIMEOUT_ERRORS = new Set(['MongoTimeoutError']);

module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = err.status || err.statusCode || 500;
  let codigo = err.codigo || err.code || 'ERROR_INTERNO';
  let mensaje = err.message || 'Error interno del servidor';
  let detalles = err.detalles || null;

  // ==== Mongo: duplicados y validación ====
  if (err.name === 'MongoServerError' || err.name === 'MongoBulkWriteError') {
    const errBase = (err.writeErrors && err.writeErrors[0]?.err) || err;

    if (errBase.code === 11000) {
      status = 400;
      codigo = 'DUPLICADO';
      const keyPattern = errBase.keyPattern || errBase.keyValue || {};
      const campo = Object.keys(keyPattern)[0] || 'campo';
      mensaje = `El valor del campo "${campo}" ya está registrado`;
      detalles = { campo, keyValue: errBase.keyValue };
    } else if (errBase.code === 121) {
      status = 400;
      codigo = 'VALIDACION_MONGO';
      mensaje = 'Error de validación en la base de datos';
    }
  }

  // ==== Mongo: red ====
  if (MONGO_NETWORK_ERRORS.has(err.name)) {
    status = 503;
    codigo = 'DB_NO_DISPONIBLE';
    mensaje = 'Base de datos no disponible. Reintente en unos segundos.';
  } else if (MONGO_TIMEOUT_ERRORS.has(err.name)) {
    status = 504;
    codigo = 'DB_TIMEOUT';
    mensaje = 'La base de datos tardó demasiado en responder.';
  }

  // ==== BSON inválido ====
  if (err.name === 'BSONTypeError' || err.name === 'BSONError' || err.name === 'BSONOffsetError') {
    status = 400;
    codigo = 'BSON_INVALIDO';
    mensaje = 'Datos con formato inválido';
  }

  // ==== JWT ====
  if (err.name === 'JsonWebTokenError') {
    status = 401; codigo = 'TOKEN_INVALIDO'; mensaje = 'Token inválido';
  }
  if (err.name === 'TokenExpiredError') {
    status = 401; codigo = 'TOKEN_EXPIRADO'; mensaje = 'Sesión expirada';
  }

  // ==== express-validator ====
  if (Array.isArray(err.errors) && err.errors.length > 0 && err.errors[0].msg) {
    status = 400;
    codigo = 'VALIDACION';
    mensaje = err.errors.map(e => e.msg).join(', ');
    detalles = err.errors.map(e => ({ campo: e.path || e.param, mensaje: e.msg }));
  }

  // ==== Axios ====
  if (err.isAxiosError) {
    status = 502;
    codigo = 'SERVICIO_EXTERNO';
    mensaje = err.code === 'ECONNABORTED'
      ? 'Timeout al conectar con servicio externo'
      : 'Error al conectar con servicio externo';
  }

  // ==== Circuit breaker ====
  if (err.codigo === 'CIRCUIT_OPEN') {
    status = 503;
    detalles = { retryAfter: err.retryAfter };
    res.setHeader('Retry-After', String(err.retryAfter || 60));
  }

  // ==== Log estructurado ====
  const logCtx = {
    reqId: req.reqId,
    status, codigo, mensaje,
    metodo: req.method,
    ruta: req.originalUrl,
    user: req.user?.email || 'anónimo',
    ip: req.ip
  };

  if (status >= 500) {
    log.error({ ...logCtx, stack: IS_PROD ? undefined : err.stack }, '❌ Error servidor');
  } else if (status >= 400) {
    log.warn(logCtx, '⚠️  Error cliente');
  }

  // ==== Respuesta ====
  const respuesta = { error: mensaje, codigo };
  if (detalles) respuesta.detalles = detalles;
  if (!IS_PROD && status >= 500) {
    respuesta.stack = err.stack?.split('\n').slice(0, 10).join('\n');
  }
  if (err.periodo) respuesta.periodo = err.periodo;

  res.status(status).json(respuesta);
};