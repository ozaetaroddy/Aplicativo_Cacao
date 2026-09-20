// backend/server.js
// ============================================================
// Servidor HTTP + WebSocket del sistema
// ------------------------------------------------------------
// Orden de arranque:
//   1. Forzar IPv4 (DNS) — antes que cualquier require con red.
//   2. Validar env → si falla, exit(1) con mensaje accionable.
//   3. Setup de Express (helmet, cors, body, rate limit).
//   4. Conexión a Mongo.
//   5. Listen en `PORT`.
//   6. Post-arranque en background: índices + scheduler.
//   7. Rutas (ya con `req.db` disponible).
//
// Shutdown (SIGTERM/SIGINT):
//   1. Cerrar scheduler.
//   2. Cerrar sockets WebSocket.
//   3. Cerrar HTTP server.
//   4. Cerrar Mongo.
//   5. log.flush() (para no perder logs en Render).
//   6. Si tarda >10 s, forzar exit(1).
//
// Health checks:
//   GET  /                    → liveness simple (JSON)
//   HEAD /                    → 200 (monitores tipo Render)
//   GET  /api/health          → liveness (siempre 200)
//   GET  /healthz             → alias liveness
//   GET  /api/health/detailed → readiness (503 si Mongo no responde)
//   GET  /readyz              → alias readiness
//
// ============================================================
// 🔧 FIXES APLICADOS EN ESTA VERSIÓN
// ------------------------------------------------------------
//   [uncaughtException] Ya NO llama a `shutdown()` (puede colgarse).
//                       En su lugar: log.fatal → log.flush → exit(1).
//                       Render reinicia el container automáticamente.
//
//   [log.flush]        Se llama en shutdown() y en uncaughtException
//                      para no perder los últimos logs en Render.
//
//   [cron]             `/api/cron` montado ANTES del authMiddleware.
//
//   [warnings]         Detección de configs inconsistentes al arrancar:
//                        · COOKIE_CROSS_SITE vs CORS_ORIGINS
//                        · BACKUP_SCHEDULER_IN_WEB en prod
//                        · MONGO_POOL_MAX bajo con muchas conexiones
//
//   [métricas]         Tiempo total desde require hasta listen.
//                      Tiempo de conexión Mongo.
//
//   [validarEnv]       Mensajes accionables (qué hacer, no solo qué falta).
//
//   [shutdown]         `io.close()` con fallback timeout (Socket.IO no
//                      siempre llama el callback en v4.8).
//
// ============================================================
// 🆕 REFACTOR 2025-XX (UNIFICACIÓN DE RETENCIONES)
// ------------------------------------------------------------
//   Las retenciones emitidas a proveedores viven en `ventas_v2` con
//   `tipo_documento='retencion'` y se gestionan vía
//   `/api/ventas?tipo_documento=retencion`.
//
//   `/api/retenciones` responde 410 Gone con instrucciones.
// ============================================================
'use strict';

// ------------------------------------------------------------
// 🔧 FIX IPv6 — DEBE IR PRIMERO.
// ------------------------------------------------------------
const dns = require('node:dns');
const net = require('node:net');
const os = require('node:os');

try {
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch { /* Node <18 */ }

try {
  if (typeof net.setDefaultAutoSelectFamily === 'function') {
    net.setDefaultAutoSelectFamily(false);
  }
} catch { /* Node <18.13 */ }

require('dotenv').config();

// Marca de tiempo del arranque (para métricas).
const _T0_ARRANQUE = Date.now();

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

const PLACEHOLDERS = [
  'cambia-esto', 'otra-clave-larga', 'tu-app-password', 'tu-correo@',
  'minimo-32-chars', 'aleatoria-para-cifrar'
];

/**
 * Valida las env vars críticas. NUNCA mata el proceso — devuelve la
 * lista de errores con mensajes accionables para que el bootstrap
 * decida.
 *
 * @returns {{ ok: boolean, errores: string[], sugerencias: string[] }}
 */
function validarEnv() {
  const errores = [];
  const sugerencias = [];

  // ---- Mongo ----
  if (!MONGODB_URI) {
    errores.push('MONGODB_URI no está definida');
    sugerencias.push(
      'Configura MONGODB_URI en Render → Environment. ' +
      'Ejemplo: mongodb+srv://user:pass@cluster.mongodb.net'
    );
  }

  // ---- JWT + CERT ----
  for (const key of ['JWT_SECRET', 'CERT_ENCRYPTION_KEY']) {
    const val = process.env[key] || '';
    if (!val) {
      errores.push(`${key} no está definido`);
      sugerencias.push(
        `Genera uno con: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
      );
      continue;
    }
    if (PLACEHOLDERS.some(p => val.toLowerCase().includes(p))) {
      errores.push(`${key} todavía tiene un valor de ejemplo`);
      sugerencias.push(
        `Reemplaza ${key} por un valor aleatorio de 32+ caracteres. ` +
        `Si lo cambias en prod, las sesiones/certificados existentes se invalidan.`
      );
    }
  }

  // ---- JWT longitud mínima ----
  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret && jwtSecret.length < 32) {
    errores.push('JWT_SECRET debe tener al menos 32 caracteres');
    sugerencias.push(
      `Tu JWT_SECRET tiene ${jwtSecret.length} chars. Genera uno nuevo: ` +
      `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
    );
  }

  return { ok: errores.length === 0, errores, sugerencias };
}

/**
 * Emite warnings de config potencialmente problemática en producción.
 * NO bloquea el arranque. Se llama después de `listen()`.
 */
function verificarConfigAvanzada() {
  const warnings = [];

  // ---- CORS vs COOKIE_CROSS_SITE ----
  const corsRaw = (process.env.CORS_ORIGINS || '').trim();
  const crossSite = String(process.env.COOKIE_CROSS_SITE || '').toLowerCase() === 'true';
  const hasCors = corsRaw.length > 0;

  if (IS_PROD) {
    if (!hasCors) {
      warnings.push(
        '⚠️  CORS_ORIGINS no está definido en producción. ' +
        'CORS se cerrará por completo — el frontend no podrá llamar a la API. ' +
        'Define CORS_ORIGINS=https://tu-frontend.com'
      );
    }

    if (hasCors && !crossSite) {
      // Si el frontend está en otro dominio, las cookies NO viajan.
      const originsList = corsRaw.split(',').map(s => s.trim()).filter(Boolean);
      const mismoHostname = originsList.every(o => {
        try {
          const u = new URL(o);
          return u.hostname === 'localhost';
        } catch { return false; }
      });
      if (!mismoHostname) {
        warnings.push(
          '⚠️  CORS_ORIGINS apunta a otro dominio pero COOKIE_CROSS_SITE no es "true". ' +
          'Las cookies de sesión NO viajarán entre dominios. ' +
          'Si el frontend está en Vercel/Netlify y el backend en Render, ' +
          'define COOKIE_CROSS_SITE=true (requiere HTTPS).'
        );
      }
    }

    if (crossSite && !hasCors) {
      warnings.push(
        '⚠️  COOKIE_CROSS_SITE=true pero CORS_ORIGINS está vacío. ' +
        'Esto causará problemas. Define CORS_ORIGINS explícitamente.'
      );
    }
  }

  // ---- Scheduler in-process en prod ----
  const schedRaw = process.env.BACKUP_SCHEDULER_IN_WEB;
  const schedInWeb = schedRaw !== undefined && schedRaw !== ''
    ? String(schedRaw).toLowerCase() === 'true'
    : false;
  if (IS_PROD && schedInWeb) {
    warnings.push(
      '⚠️  BACKUP_SCHEDULER_IN_WEB=true en producción. ' +
      'Si el dyno se duerme (Render free/starter), el cron NO correrá. ' +
      'Recomendado: BACKUP_SCHEDULER_IN_WEB=false + Render Cron Job o cron-job.org.'
    );
  }

  // ---- Mongo pool bajo ----
  const poolMax = Number(process.env.MONGO_POOL_MAX) || 20;
  if (IS_PROD && poolMax < 10) {
    warnings.push(
      `⚠️  MONGO_POOL_MAX=${poolMax} es muy bajo para producción. ` +
      'Considera 20-30 si atiendes varios usuarios concurrentes.'
    );
  }

  // ---- TRUST_PROXY en prod ----
  const trustProxy = process.env.TRUST_PROXY_HOPS;
  if (IS_PROD && (trustProxy === undefined || trustProxy === '0')) {
    warnings.push(
      '⚠️  TRUST_PROXY_HOPS no está definido. Detrás de un proxy (Render, Nginx) ' +
      'debe ser 1 para que `req.ip` y `req.protocol` sean correctos.'
    );
  }

  for (const w of warnings) {
    log.warn(w);
  }
}

// ============================================================
// EXPRESS — SETUP
// ============================================================
const app = express();

app.disable('x-powered-by');

const TRUST_PROXY = process.env.TRUST_PROXY_HOPS !== undefined
  ? Number(process.env.TRUST_PROXY_HOPS)
  : (IS_PROD ? 1 : 0);
app.set('trust proxy', Number.isFinite(TRUST_PROXY) ? TRUST_PROXY : 0);
app.set('query parser', 'simple');

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
const corsOrigins = corsOriginsList !== null
  ? corsOriginsList
  : (IS_PROD ? false : true);

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
    if (status < 400) return;
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
let mongoConnectMs = null;

async function inicializarMongo() {
  const t0 = Date.now();
  const poolMax = Number(process.env.MONGO_POOL_MAX) || 20;
  const poolMin = Number(process.env.MONGO_POOL_MIN) || 2;

  mongoClient = new MongoClient(MONGODB_URI, {
    maxPoolSize: poolMax,
    minPoolSize: poolMin,
    maxIdleTimeMS: Number(process.env.MONGO_MAX_IDLE_MS) || 30_000,
    serverSelectionTimeoutMS: Number(process.env.MONGO_SELECTION_TIMEOUT_MS) || 8_000,
    socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45_000,
    connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS) || 10_000
  });

  await mongoClient.connect();
  db = DB_NAME ? mongoClient.db(DB_NAME) : mongoClient.db();
  mongoConectado = true;
  mongoConnectMs = Date.now() - t0;

  log.info(
    { db: db.databaseName, ms: mongoConnectMs, poolMax, poolMin },
    '✅ Conectado a MongoDB'
  );
}

/**
 * Trabajo post-arranque que NO debe bloquear el `listen`.
 */
async function trabajoPostArranque() {
  // 1. Índices.
  try {
    const r = await asegurarIndices(db);
    if (r.salteado) {
      log.info({ version: r.version }, '⏭️  Índices sin cambios');
    } else {
      log.info(
        {
          total: r.total,
          creados: r.creados,
          existentes: r.existentes,
          fallidos: r.fallidos?.length || 0,
          ms: r.tiempoMs
        },
        '✅ Índices verificados'
      );
    }
  } catch (e) {
    log.warn({ err: e.message }, '⚠️  Error creando índices (el server sigue activo)');
  }

  // 2. Scheduler.
  try {
    await iniciarScheduler(db);
    schedulerActivo = true;
    log.info('⏰ Scheduler de backups inicializado');
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
  maxHttpBufferSize: 1e6
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
      out[k] = rawV;
    }
  }
  return out;
}

// ---- Rate limit simple por IP para handshake Socket.IO ----
const intentosHandshake = new Map();
const HANDSHAKE_LIMIT = 30;
const HANDSHAKE_WINDOW_MS = 60_000;

const _limpiezaHandshake = setInterval(() => {
  const ahora = Date.now();
  for (const [ip, entry] of intentosHandshake) {
    if (entry.resetAt < ahora) intentosHandshake.delete(ip);
  }
}, HANDSHAKE_WINDOW_MS);
if (_limpiezaHandshake.unref) _limpiezaHandshake.unref();

io.use(async (socket, next) => {
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

// ---- Liveness raíz ----
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'cacao-backend', version: VERSION });
});
app.head('/', (req, res) => {
  res.status(200).end();
});

// ---- Liveness ----
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: VERSION
  });
});
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

// ---- Readiness ----
app.get('/api/health/detailed', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    version: VERSION,
    env: process.env.NODE_ENV || 'development',
    node: process.version,
    hostname: os.hostname(),
    db: 'unknown',
    dbLatencyMs: null,
    dbConnectMs: mongoConnectMs,
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
// RUTAS CRON (público, autenticado con CRON_TOKEN)
// ------------------------------------------------------------
// ⚠️  DEBE ir ANTES del authMiddleware. Si se monta después,
//     cron-job.org recibirá 401 y los backups nunca correrán.
// ============================================================
app.use('/api/cron', require('./routes/cron'));

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

// 🆕 REFACTOR 2025-XX: se eliminó `/api/retenciones`.
//    Las retenciones emitidas ahora viven en `ventas_v2` y se
//    gestionan vía `/api/ventas?tipo_documento=retencion`.
//    Se auto-emiten desde `POST /api/compras`.
//
//    Respuesta 410 Gone para clientes legacy.
app.use('/api/retenciones', (req, res) => {
  res.status(410).json({
    error:
      'El endpoint /api/retenciones fue eliminado. Las retenciones ' +
      'ahora se emiten automáticamente desde /api/compras y se ' +
      'consultan vía /api/ventas?tipo_documento=retencion.',
    codigo: 'ENDPOINT_DEPRECADO',
    migracion: {
      listar: 'GET /api/ventas?tipo_documento=retencion',
      detalle: 'GET /api/ventas/:id',
      crear: 'POST /api/compras (con retención)',
      eliminar: 'Se elimina en cascada al eliminar la compra origen'
    }
  });
});

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

// ---- 404 dentro de /api ----
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
// BOOTSTRAP
// ============================================================
let serverInstancia = null;
let cerrando = false;

async function bootstrap() {
  // ---- 1. Validar env ----
  const check = validarEnv();
  if (!check.ok) {
    for (const e of check.errores) log.error(`❌ FATAL: ${e}`);
    for (const s of check.sugerencias) log.error(`   💡 ${s}`);
    process.exit(1);
  }

  // ---- 2. Conectar a Mongo ----
  try {
    await inicializarMongo();
  } catch (err) {
    log.error({ err: err.message }, '❌ No se pudo conectar a MongoDB');
    log.error('   💡 Verifica MONGODB_URI y la allowlist de IPs en Atlas.');
    process.exit(1);
  }

  // ---- 3. Listen ----
  serverInstancia = server.listen(PORT, () => {
    const tTotal = Date.now() - _T0_ARRANQUE;

    log.info(
      {
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        version: VERSION,
        node: process.version,
        hostname: os.hostname(),
        cors: corsOrigins === true ? 'todos (dev)' : corsOrigins,
        db: db.databaseName,
        trustProxy: TRUST_PROXY,
        connectMs: mongoConnectMs,
        bootstrapMs: tTotal
      },
      `🚀 Servidor listo en :${PORT} (${tTotal} ms)`
    );

    // ---- 4. Post-arranque (no bloquea el listen) ----
    trabajoPostArranque().catch(err => {
      log.error({ err: err.message }, 'Error en trabajo post-arranque');
    });

    // ---- 5. Warnings de config avanzada ----
    verificarConfigAvanzada();

    // ---- 6. Recordatorios si faltan configs opcionales ----
    if (!process.env.SMTP_FROM) {
      log.warn('⚠️  SMTP_FROM no definido. Se usará SMTP_USER como remitente.');
    }
    if (!process.env.CRON_TOKEN) {
      log.warn('⚠️  CRON_TOKEN no definido. El endpoint /api/cron/* responderá 503.');
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

/**
 * Cierra el servidor de forma limpia.
 *
 * Se llama en:
 *   - SIGTERM / SIGINT (Render envía SIGTERM antes de matar)
 *   - unhandledRejection cuando se supera la racha
 *
 * NO se llama en uncaughtException (el estado del proceso es
 * impredecible, mejor dejar que Node muera y Render reinicie).
 */
async function shutdown(signal) {
  if (cerrando) {
    log.warn({ signal }, 'Shutdown ya en curso, ignorando señal duplicada');
    return;
  }
  cerrando = true;

  log.info({ signal }, `Señal ${signal} recibida. Cerrando servidor...`);

  const timeoutDuro = setTimeout(() => {
    log.error('⚠️  Shutdown excedió 10 s, forzando salida');
    // Flush best-effort y salir
    Promise.resolve()
      .then(() => typeof log.flush === 'function' ? log.flush() : undefined)
      .catch(() => {})
      .finally(() => process.exit(1));
  }, 10_000);
  if (timeoutDuro.unref) timeoutDuro.unref();

  // ---- 1. Detener scheduler ----
  try { detenerScheduler(); } catch { /* noop */ }

  // ---- 2. Cerrar Socket.IO ----
  // En Socket.IO v4, `io.close()` no siempre llama el callback.
  // Usamos un wrapper que resuelve cuando se cierra o tras 3s.
  try {
    await conTimeout(
      new Promise(resolve => {
        try {
          io.close(() => resolve());
        } catch {
          resolve();
        }
        // Fallback: si a los 2s no llamó el callback, resolver igual.
        setTimeout(resolve, 2000).unref?.();
      }),
      3000,
      'io.close timeout'
    );
  } catch (e) {
    log.warn({ err: e.message }, 'No se pudo cerrar Socket.IO limpiamente');
  }

  // ---- 3. Cerrar HTTP server ----
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

  // ---- 4. Cerrar Mongo ----
  try {
    if (mongoClient) {
      await conTimeout(mongoClient.close(), 3000, 'mongo.close timeout');
      log.info('✅ MongoDB cerrado');
    }
  } catch (e) {
    log.warn({ err: e.message }, 'Error cerrando Mongo');
  }

  // ---- 5. Flush del logger (crítico en Render) ----
  try {
    if (typeof log.flush === 'function') {
      await log.flush();
    }
  } catch { /* noop */ }

  clearTimeout(timeoutDuro);
  log.info('✅ Servidor cerrado limpiamente');
  process.exit(0);
}

// ============================================================
// ARRANQUE + HANDLERS DE PROCESO
// ============================================================
if (require.main === module) {
  // ---- Rechazos no capturados: racha con ventana ----
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

  // ---- Excepciones no capturadas: log + exit(1) controlado ----
  //
  // ⚠️  NO llamamos a `shutdown()` aquí:
  //     - El estado del proceso es impredecible.
  //     - `shutdown()` intenta cerrar sockets/Mongo que pueden estar
  //       en estado inválido y colgarse.
  //     - Render reinicia el container automáticamente si el proceso
  //       sale con código != 0.
  //
  // Aseguramos que `log.flush()` se llame antes de morir para no
  // perder los últimos logs.
  process.on('uncaughtException', (err) => {
    log.fatal(
      {
        err: err?.stack || err?.message || String(err),
        nombre: err?.name,
        codigo: err?.code
      },
      '❌ uncaughtException — proceso irrecuperable'
    );

    Promise.resolve()
      .then(() => typeof log.flush === 'function' ? log.flush() : undefined)
      .catch(() => { /* noop */ })
      .finally(() => process.exit(1));
  });

  // ---- Señales de cierre ----
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ---- Arranque ----
  bootstrap().catch(err => {
    log.error({ err: err.message }, '❌ Error en bootstrap');
    process.exit(1);
  });
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = app;
module.exports._io = io;
module.exports._server = server;
module.exports.bootstrap = bootstrap;
module.exports.shutdown = shutdown;
module.exports.validarEnv = validarEnv;
module.exports.verificarConfigAvanzada = verificarConfigAvanzada;