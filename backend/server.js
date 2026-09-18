// backend/server.js
// ============================================================
// Servidor HTTP + WebSocket del sistema
// ------------------------------------------------------------
// Orden de arranque:
//   1. Validar env → si falla, exit(1).
//   2. Setup de Express (helmet, cors, body, rate limit).
//   3. Conexión a Mongo.
//   4. Listen en `PORT`.
//   5. Post-arranque en background: asegurar índices, scheduler.
//   6. Montar rutas protegidas (ya con `req.db` disponible).
//
// Shutdown (SIGTERM/SIGINT):
//   1. Cerrar aceptación de nuevas conexiones HTTP.
//   2. Cerrar sockets WebSocket.
//   3. Cerrar scheduler.
//   4. Cerrar Mongo.
//   5. Si tarda >10 s, forzar exit(1).
//
// Health checks:
//   GET /api/health          → liveness (siempre 200)
//   GET /healthz             → alias liveness
//   GET /api/health/detailed → readiness (503 si Mongo no responde)
//   GET /readyz              → alias readiness
//
// 🔧 FIX 2025-XX:
//   1. El timer de "shutdown excedió 10 s" estaba a nivel de MÓDULO.
//      Se disparaba 10 s después del arranque, cuando `cerrando` era
//      siempre `false` → código muerto. Ahora vive dentro de
//      `shutdown()` y se reinicia en cada invocación.
//   2. El bootstrap se ejecutaba incondicionalmente al `require` el
//      módulo. Cualquier test que hiciera `require('./server')`
//      arrancaba Mongo y, si fallaba, `process.exit(1)` reventaba
//      toda la suite. Ahora solo se ejecuta si es el módulo principal
//      (`require.main === module`).
//   3. `intentosHandshake` (rate limit del handshake WebSocket) nunca
//      se limpiaba. Ahora hay un intervalo `unref()` que purga
//      entradas expiradas cada minuto.
// ============================================================
'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');

const log = require('./utils/logger');
const authMiddleware = require('./middleware/auth');
const csrfProtection = require('./middleware/csrf');
const errorHandler = require('./middleware/errorHandler');
const { iniciarScheduler, detenerScheduler } = require('./utils/backupScheduler');
const { asegurarIndices } = require('./utils/indices');
const { mountSwagger } = require('./utils/swagger');
const { version: VERSION } = require('./package.json');

// ============================================================
// CONFIGURACIÓN DE ENTORNO
// ============================================================
const PORT = Number(process.env.PORT) || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME;

// Placeholders que indican config incompleta.
const PLACEHOLDERS = [
  'cambia-esto', 'otra-clave-larga', 'tu-app-password', 'tu-correo@',
  'minimo-32-chars', 'aleatoria-para-cifrar'
];

/**
 * Valida las env vars críticas. NUNCA mata el proceso — devuelve la lista
 * de errores para que el bootstrap decida.
 * @returns {{ ok: boolean, errores: string[] }}
 */
function validarEnv() {
  const errores = [];

  if (!MONGODB_URI) errores.push('MONGODB_URI no está definida');

  for (const key of ['JWT_SECRET', 'CERT_ENCRYPTION_KEY']) {
    const val = process.env[key] || '';
    if (!val) {
      errores.push(`${key} no está definido`);
      continue;
    }
    if (PLACEHOLDERS.some(p => val.toLowerCase().includes(p))) {
      errores.push(`${key} todavía tiene un valor de ejemplo`);
    }
  }

  const jwt = process.env.JWT_SECRET || '';
  if (jwt && jwt.length < 32) {
    errores.push('JWT_SECRET debe tener al menos 32 caracteres');
  }

  return { ok: errores.length === 0, errores };
}

// ============================================================
// EXPRESS — SETUP
// ============================================================
const app = express();

// ---- Seguridad básica ----
app.disable('x-powered-by');

const TRUST_PROXY = process.env.TRUST_PROXY_HOPS !== undefined
  ? Number(process.env.TRUST_PROXY_HOPS)
  : (IS_PROD ? 1 : 0);
app.set('trust proxy', Number.isFinite(TRUST_PROXY) ? TRUST_PROXY : 0);
app.set('query parser', 'simple');

// ---- Helmet ----
// CSP deshabilitada porque la sirve el frontend (Vercel/Netlify).
// crossOriginResourcePolicy abierto para permitir carga de recursos.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

app.use(compression());

// ---- CORS ----
function parseOrigins(raw) {
  if (!raw) return null;
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

const corsOriginsList = parseOrigins(process.env.CORS_ORIGINS);
const corsOrigins = corsOriginsList !== null ? corsOriginsList : (IS_PROD ? false : true);

const socketOriginsList = parseOrigins(process.env.SOCKET_CORS_ORIGINS);
const socketCorsOrigins = socketOriginsList !== null ? socketOriginsList : corsOrigins;

app.use(cors({
  origin: corsOrigins === true ? true : corsOrigins,
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'Content-Length', 'X-Request-Id']
}));

// ---- Body parsers ----
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '20mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

// ============================================================
// MIDDLEWARE — Request ID + Latencia
// ============================================================
app.use((req, res, next) => {
  const inicio = Date.now();
  const rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  req.reqId = rid;
  if (!res.headersSent) res.setHeader('X-Request-Id', rid);

  res.on('finish', () => {
    const status = res.statusCode;
    if (status < 400) return; // Solo loggear errores.
    const payload = {
      reqId: rid,
      metodo: req.method,
      ruta: req.originalUrl || req.url,
      status,
      ms: Date.now() - inicio,
      userId: req.user?.userId ? String(req.user.userId) : undefined
    };
    if (status >= 500) log.error(payload, 'request');
    else log.warn(payload, 'request');
  });

  next();
});

// ============================================================
// MIDDLEWARE — Rate limit global
// ============================================================
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX) || 200;
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.isFinite(rateLimitMax) && rateLimitMax > 0 ? rateLimitMax : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiadas peticiones, intente más tarde',
    codigo: 'RATE_LIMIT'
  }
}));

// ============================================================
// MONGODB — Conexión + estado
// ============================================================
let db = null;
let mongoClient = null;
let schedulerActivo = false;
let mongoConectado = false;

async function inicializarMongo() {
  mongoClient = new MongoClient(MONGODB_URI, {
    maxPoolSize: Number(process.env.MONGO_POOL_MAX) || 20,
    minPoolSize: Number(process.env.MONGO_POOL_MIN) || 2,
    serverSelectionTimeoutMS: Number(process.env.MONGO_SELECTION_TIMEOUT_MS) || 8000,
    socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000
  });

  await mongoClient.connect();
  db = DB_NAME ? mongoClient.db(DB_NAME) : mongoClient.db();
  mongoConectado = true;
  log.info({ db: db.databaseName }, '✅ Conectado a MongoDB');
}

/**
 * Trabajo post-arranque que NO debe bloquear el `listen`:
 * crear índices, arrancar scheduler. Best-effort.
 */
async function trabajoPostArranque() {
  // 1. Índices.
  try {
    const r = await asegurarIndices(db);
    if (r.salteado) log.info({ version: r.version }, '⏭️  Índices sin cambios');
    else log.info(
      { total: r.total, creados: r.creados, fallidos: r.fallidos?.length || 0 },
      '✅ Índices verificados'
    );
  } catch (e) {
    log.warn({ err: e.message }, '⚠️  Error creando índices (el server sigue activo)');
  }

  // 2. Scheduler.
  try {
    await iniciarScheduler(db);
    schedulerActivo = true;
    log.info('⏰ Scheduler de backups iniciado');
  } catch (e) {
    log.error({ err: e.message }, 'Error iniciando scheduler de backups');
  }
}

// ============================================================
// MIDDLEWARE — Inyección de DB
// ============================================================
app.use((req, res, next) => {
  if (!db) {
    return res.status(503).json({
      error: 'Base de datos no disponible. Reintente en unos segundos.',
      codigo: 'DB_NO_DISPONIBLE'
    });
  }
  req.db = db;
  next();
});

// ============================================================
// SWAGGER (opcional — controlado por env)
// ============================================================
mountSwagger(app);

// ============================================================
// HTTP + SOCKET.IO
// ============================================================
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: socketCorsOrigins === true ? true : socketCorsOrigins,
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 25000,
  pingInterval: 20000,
  maxHttpBufferSize: 1e6 // 1 MB — evita payloads abusivos por WebSocket.
});

/** Parsea cookies de forma defensiva. NUNCA lanza. */
function parseCookies(header) {
  if (!header || typeof header !== 'string') return {};
  const out = {};
  for (const parte of header.split(';')) {
    const trimmed = parte.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const rawV = trimmed.slice(eq + 1);
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(rawV);
    } catch {
      out[k] = rawV; // Cookie con encoding inválido: guardamos raw.
    }
  }
  return out;
}

// ---- Rate limit simple por IP para handshake Socket.IO ----
const intentosHandshake = new Map(); // ip → { count, resetAt }
const HANDSHAKE_LIMIT = 30;
const HANDSHAKE_WINDOW_MS = 60_000;

// 🔧 FIX: limpieza periódica de entradas expiradas.
//    Sin esto, el Map crecía indefinidamente con cada IP nueva.
const _limpiezaHandshake = setInterval(() => {
  const ahora = Date.now();
  for (const [ip, entry] of intentosHandshake) {
    if (entry.resetAt < ahora) intentosHandshake.delete(ip);
  }
}, HANDSHAKE_WINDOW_MS);
if (_limpiezaHandshake.unref) _limpiezaHandshake.unref();

io.use(async (socket, next) => {
  // ---- Rate limit de handshake ----
  const ip = socket.handshake.address || 'desconocido';
  const ahora = Date.now();
  const entry = intentosHandshake.get(ip);
  if (!entry || entry.resetAt < ahora) {
    intentosHandshake.set(ip, { count: 1, resetAt: ahora + HANDSHAKE_WINDOW_MS });
  } else {
    entry.count++;
    if (entry.count > HANDSHAKE_LIMIT) {
      return next(new Error('Demasiados intentos de conexión'));
    }
  }

  try {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    let token = cookies.sc_at;

    if (!token && socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    }
    if (!token || typeof token !== 'string') {
      return next(new Error('Autenticación requerida'));
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) return next(new Error('Servidor mal configurado'));

    let decoded;
    try {
      decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch {
      return next(new Error('Token inválido'));
    }

    if (!decoded.userId || !db) return next(new Error('Token malformado'));
    if (!ObjectId.isValid(decoded.userId)) return next(new Error('ID de usuario inválido'));

    const usuario = await db.collection('usuarios').findOne(
      { _id: new ObjectId(decoded.userId) },
      { projection: { password: 0 } }
    );
    if (!usuario) return next(new Error('Usuario no existe'));
    if (!usuario.activo) return next(new Error('Usuario desactivado'));

    if (usuario.password_changed_at) {
      const changed = Math.floor(new Date(usuario.password_changed_at).getTime() / 1000);
      const iat = Number(decoded.iat) || 0;
      if (iat < changed) return next(new Error('Sesión invalidada'));
    }

    socket.user = {
      userId: usuario._id,
      email: usuario.email,
      rol: usuario.rol,
      nombre: usuario.nombre || usuario.email
    };
    return next();
  } catch (err) {
    log.error({ err: err.message }, 'Error en auth de socket');
    return next(new Error('Error de autenticación'));
  }
});

io.on('connection', (socket) => {
  log.info({ socketId: socket.id, email: socket.user?.email }, '🟢 Cliente conectado');
  if (socket.user?.rol) socket.join(`rol:${socket.user.rol}`);
  if (socket.user?.userId) socket.join(`user:${String(socket.user.userId)}`);

  socket.on('disconnect', (reason) => {
    log.debug({ socketId: socket.id, reason }, '🔴 Cliente desconectado');
  });

  socket.on('error', (err) => {
    log.warn({ socketId: socket.id, err: err?.message }, 'Error de socket');
  });
});

// ---- Exponer `io` y `emitir` a las rutas ----
app.use((req, res, next) => {
  req.io = io;
  req.emitir = (evento, data) => io.emit(evento, data);
  next();
});

// ============================================================
// RUTAS PÚBLICAS
// ============================================================
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// ---- Liveness (siempre 200 si el proceso responde) ----
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: VERSION
  });
});
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

// ---- Readiness (depende de la DB) ----
app.get('/api/health/detailed', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    version: VERSION,
    env: process.env.NODE_ENV || 'development',
    db: 'unknown',
    dbLatencyMs: null,
    scheduler: schedulerActivo,
    socketConnections: io.engine?.clientsCount ?? null
  };

  try {
    if (!db || !mongoConectado) throw new Error('DB no inicializada');
    const t0 = Date.now();
    await db.command({ ping: 1 });
    health.db = 'ok';
    health.dbLatencyMs = Date.now() - t0;

    try { health.authCache = authMiddleware.stats(); } catch { /* opcional */ }

    res.json(health);
  } catch (e) {
    health.status = 'DEGRADED';
    health.db = 'error';
    health.dbError = e.message;
    res.status(503).json(health);
  }
});

app.get('/readyz', async (req, res) => {
  try {
    if (!db || !mongoConectado) throw new Error('sin DB');
    await db.command({ ping: 1 });
    res.json({ status: 'ready' });
  } catch (e) {
    res.status(503).json({ status: 'not-ready', error: e.message });
  }
});

// ============================================================
// RUTAS PROTEGIDAS (requieren auth + CSRF)
// ============================================================
app.use('/api', csrfProtection);
app.use('/api', authMiddleware);

// ---- Dominio contable ----
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/ventas', require('./routes/ventas'));
app.use('/api/compras', require('./routes/compras'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/retenciones', require('./routes/retenciones'));
app.use('/api/kardex', require('./routes/kardex'));
app.use('/api/contadores', require('./routes/contadores'));
app.use('/api/secuencias', require('./routes/secuencias'));
app.use('/api/inventario', require('./routes/inventario'));

// ---- Dominio fiscal / SRI ----
app.use('/api/sri', require('./routes/sri'));
app.use('/api/anexos', require('./routes/anexos'));
app.use('/api/certificado', require('./routes/certificado'));
app.use('/api/catalogos', require('./routes/catalogos'));

// ---- Reportes y análisis ----
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/reportes', require('./routes/reportesMensuales'));
app.use('/api/estadisticas', require('./routes/estadisticas'));
app.use('/api/estado-cuenta', require('./routes/estadoCuenta'));
app.use('/api/estados-financieros', require('./routes/estadosFinancieros'));

// ---- Administración ----
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/periodos', require('./routes/periodos'));
app.use('/api/auditoria', require('./routes/auditoria'));
app.use('/api/backups', require('./routes/backups'));
app.use('/api/diagnostico', require('./routes/diagnostico'));

// ---- Integraciones ----
app.use('/api/email', require('./routes/email'));
app.use('/api/consultas', require('./routes/consultas'));

// ---- Endpoint puntual de permisos del usuario actual ----
app.get('/api/auth/permisos', (req, res) => {
  const { getPermisosDeRol } = require('./utils/permisos');
  const rol = req.user?.rol || 'vendedor';
  res.json({ rol, permisos: getPermisosDeRol(rol) || {} });
});

// ---- 404 dentro de /api (deja pasar /api/docs*) ----
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    codigo: 'RUTA_NO_ENCONTRADA',
    ruta: req.originalUrl
  });
});

// ---- Error handler central ----
app.use(errorHandler);

// ============================================================
// BOOTSTRAP (solo se ejecuta si es el módulo principal)
// ============================================================
let serverInstancia = null;
let cerrando = false;

async function bootstrap() {
  // ---- 1. Validar env ----
  const check = validarEnv();
  if (!check.ok) {
    for (const e of check.errores) log.error(`❌ FATAL: ${e}`);
    process.exit(1);
  }

  // ---- 2. Mongo (crítico: si falla, no arranca) ----
  try {
    await inicializarMongo();
  } catch (err) {
    log.error({ err: err.message }, '❌ No se pudo conectar a MongoDB');
    process.exit(1);
  }

  // ---- 3. Listen ----
  serverInstancia = server.listen(PORT, () => {
    log.info({
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      version: VERSION,
      cors: corsOrigins === true ? 'todos (dev)' : corsOrigins,
      db: db.databaseName,
      trustProxy: TRUST_PROXY
    }, '🚀 Servidor backend listo');

    // ---- 4. Trabajo post-arranque (background, best-effort) ----
    trabajoPostArranque().catch(err => {
      log.error({ err: err.message }, 'Error en trabajo post-arranque');
    });

    // ---- 5. Warnings útiles ----
    if (!process.env.SMTP_FROM) {
      log.warn('⚠️  SMTP_FROM no definido. Se usará SMTP_USER como remitente.');
    }
    if (!process.env.CORS_ORIGINS && IS_PROD) {
      log.warn('⚠️  CORS_ORIGINS no definido en producción — CORS cerrado por defecto.');
    }
  });

  serverInstancia.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log.error({ port: PORT }, '❌ Puerto ya en uso');
    } else {
      log.error({ err: err.message }, '❌ Error en el servidor HTTP');
    }
    process.exit(1);
  });
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
function conTimeout(promesa, ms, mensaje) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(mensaje || 'timeout')), ms);
    if (timer.unref) timer.unref();
    Promise.resolve(promesa).then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

async function shutdown(signal) {
  if (cerrando) return;
  cerrando = true;

  log.info({ signal }, `Señal ${signal} recibida. Cerrando servidor...`);

  // 🔧 FIX: timer duro para forzar salida si algo se cuelga.
  //    Antes vivía a NIVEL DE MÓDULO y se disparaba 10 s después del
  //    arranque (cuando `cerrando` era siempre false). Ahora vive acá
  //    y solo se activa durante el shutdown real.
  const timeoutDuro = setTimeout(() => {
    log.error('⚠️  Shutdown excedió 10 s, forzando salida');
    process.exit(1);
  }, 10_000);
  if (timeoutDuro.unref) timeoutDuro.unref();

  // ---- 1. Scheduler ----
  try { detenerScheduler(); } catch { /* noop */ }

  // ---- 2. WebSocket server ----
  try {
    await conTimeout(
      new Promise(resolve => io.close(resolve)),
      3000,
      'io.close timeout'
    );
  } catch (e) {
    log.warn({ err: e.message }, 'No se pudo cerrar Socket.IO limpiamente');
  }

  // ---- 3. HTTP server ----
  try {
    if (serverInstancia) {
      await conTimeout(
        new Promise(resolve => serverInstancia.close(resolve)),
        5000,
        'server.close timeout'
      );
    }
  } catch (e) {
    log.warn({ err: e.message }, 'No se pudo cerrar el servidor HTTP limpiamente');
  }

  // ---- 4. Mongo ----
  try {
    if (mongoClient) {
      await conTimeout(mongoClient.close(), 3000, 'mongo.close timeout');
      log.info('✅ MongoDB cerrado');
    }
  } catch (e) {
    log.warn({ err: e.message }, 'Error cerrando Mongo');
  }

  clearTimeout(timeoutDuro);
  log.info('✅ Servidor cerrado limpiamente');
  process.exit(0);
}

// ============================================================
// ARRANQUE + HANDLERS DE PROCESO
// ------------------------------------------------------------
// 🔧 FIX: todo este bloque se ejecuta SOLO cuando se corre
//    `node server.js`. Si alguien hace `require('./server')` desde
//    un test (p. ej. con supertest), no arranca Mongo ni el listener.
// ============================================================
if (require.main === module) {
  /**
   * Racha de rechazos: si llegan más de N en T ms, consideramos
   * el proceso en estado inconsistente y cerramos.
   */
  const RACHA_MAX = 20;
  const RACHA_VENTANA_MS = 60_000;
  let rachaRechazos = [];

  process.on('unhandledRejection', (reason) => {
    const ahora = Date.now();
    rachaRechazos = rachaRechazos.filter(t => ahora - t < RACHA_VENTANA_MS);
    rachaRechazos.push(ahora);

    log.error(
      { reason: reason?.stack || String(reason), racha: rachaRechazos.length },
      '❌ unhandledRejection'
    );

    if (rachaRechazos.length >= RACHA_MAX) {
      log.error(
        { racha: rachaRechazos.length, ventanaMs: RACHA_VENTANA_MS },
        'Demasiados rechazos no capturados en poco tiempo. Cerrando...'
      );
      shutdown('unhandledRejection');
    }
  });

  process.on('uncaughtException', (err) => {
    log.error({ err: err.stack || err.message }, '❌ uncaughtException');
    // Estado del proceso indefinido → cerrar siempre.
    shutdown('uncaughtException');
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  bootstrap().catch(err => {
    log.error({ err: err.message }, '❌ Error en bootstrap');
    process.exit(1);
  });
}

// ============================================================
// EXPORTS (siempre disponibles, para tests y para reuso)
// ============================================================
module.exports = app;
module.exports._io = io;
module.exports._server = server;
module.exports.bootstrap = bootstrap;
module.exports.shutdown = shutdown;
module.exports.validarEnv = validarEnv;