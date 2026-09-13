// backend/utils/logger.js
// Logger estructurado con pino. Fallback a console si no está instalado.
// Uso: const log = require('../utils/logger');  log.info({ ctx }, 'msg');

let logger;

try {
  const pino = require('pino');
  const IS_PROD = process.env.NODE_ENV === 'production';

  logger = pino({
    level: process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug'),
    base: { servicio: 'cacao-backend', pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'passwordActual',
        'password_cifrado',
        'token',
        'CERT_ENCRYPTION_KEY',
        'JWT_SECRET',
        'SMTP_PASS'
      ],
      censor: '***'
    },
    formatters: {
      level: (label) => ({ nivel: label })
    },
    transport: IS_PROD
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
  });
} catch (_err) {
  // Fallback minimalista: mismo API, salida por consola.
  const fmt = (nivel, args) => {
    const ts = new Date().toISOString();
    const parts = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a));
    console[nivel === 'error' ? 'error' : nivel === 'warn' ? 'warn' : 'log'](
      `[${ts}] [${nivel.toUpperCase()}]`, ...parts
    );
  };
  logger = {
    debug: (...a) => fmt('debug', a),
    info: (...a) => fmt('info', a),
    warn: (...a) => fmt('warn', a),
    error: (...a) => fmt('error', a),
    child: () => logger
  };
}

module.exports = logger;