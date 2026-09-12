// backend/middleware/errorHandler.js
// Middleware global de manejo de errores.
// Formato unificado: { error, codigo, detalles?, stack? }
// - No expone stack traces en producción.

const IS_PROD = process.env.NODE_ENV === 'production';

const MONGO_NETWORK_ERRORS = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoTopologyClosedError',
  'MongoNotConnectedError',
  'MongoExpiredSessionError'
]);

const MONGO_TIMEOUT_ERRORS = new Set([
  'MongoTimeoutError',
  'MongoServerSelectionError'
]);

module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = err.status || err.statusCode || 500;
  let codigo = err.codigo || err.code || 'ERROR_INTERNO';
  let mensaje = err.message || 'Error interno del servidor';
  let detalles = err.detalles || null;

  // ==== Mongo: duplicados y validación ====
  if (err.name === 'MongoServerError' || err.name === 'MongoBulkWriteError') {
    if (err.code === 11000) {
      status = 400;
      codigo = 'DUPLICADO';
      const campo = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'campo';
      mensaje = `El valor del campo "${campo}" ya está registrado`;
      detalles = { campo };
    } else if (err.code === 121) {
      status = 400;
      codigo = 'VALIDACION_MONGO';
      mensaje = 'Error de validación en la base de datos';
    }
  }

  if (MONGO_NETWORK_ERRORS.has(err.name)) {
    status = 503;
    codigo = 'DB_NO_DISPONIBLE';
    mensaje = 'Base de datos no disponible. Reintente en unos segundos.';
  }

  if (MONGO_TIMEOUT_ERRORS.has(err.name)) {
    status = 504;
    codigo = 'DB_TIMEOUT';
    mensaje = 'La base de datos tardó demasiado en responder.';
  }

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

  // ==== Errores de express-validator ====
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

  // ==== Log ====
  const logCtx = {
    status, codigo, mensaje,
    metodo: req.method,
    ruta: req.originalUrl,
    user: req.user?.email || 'anónimo',
    ip: req.ip
  };

  if (status >= 500) {
    console.error('❌ Error servidor:', logCtx);
    if (!IS_PROD) console.error(err.stack);
  } else if (status >= 400) {
    console.warn('⚠️  Error cliente:', logCtx);
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