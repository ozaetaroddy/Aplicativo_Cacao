// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { MongoClient, ObjectId } = require('mongodb');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

const log = require('./utils/logger');

// ============================================================
// VALIDACIÓN DE VARIABLES DE ENTORNO
// ============================================================
const PLACEHOLDERS = ['cambia-esto', 'otra-clave-larga', 'tu-app-password', 'tu-correo@'];
for (const key of ['JWT_SECRET', 'CERT_ENCRYPTION_KEY']) {
  const val = process.env[key] || '';
  if (!val) {
    log.error(`❌ FATAL: ${key} no está definido en el entorno`);
    process.exit(1);
  }
  if (PLACEHOLDERS.some(p => val.toLowerCase().includes(p))) {
    log.error(`❌ FATAL: ${key} sigue con valor de ejemplo`);
    process.exit(1);
  }
}
if ((process.env.JWT_SECRET || '').length < 32) {
  log.error('❌ FATAL: JWT_SECRET debe tener al menos 32 caracteres');
  process.exit(1);
}

// ============================================================
// IMPORTS DE ROUTERS
// ============================================================
const authRoutes = require('./routes/auth');
const productosRoutes = require('./routes/productos');
const categoriasRoutes = require('./routes/categorias');
const clientesRoutes = require('./routes/clientes');
const proveedoresRoutes = require('./routes/proveedores');
const comprasRoutes = require('./routes/compras');
const ventasRoutes = require('./routes/ventas');
const kardexRoutes = require('./routes/kardex');
const reportesRoutes = require('./routes/reportes');
const reportesMensualesRoutes = require('./routes/reportesMensuales');
const consultasRoutes = require('./routes/consultas');
const secuenciasRoutes = require('./routes/secuencias');
const contadoresRoutes = require('./routes/contadores');
const retencionesRoutes = require('./routes/retenciones');
const catalogosRoutes = require('./routes/catalogos');
const auditoriaRoutes = require('./routes/auditoria');
const usuariosRoutes = require('./routes/usuarios');
const periodosRoutes = require('./routes/periodos');
const backupsRoutes = require('./routes/backups');
const estadoCuentaRoutes = require('./routes/estadoCuenta');
const estadosFinancierosRoutes = require('./routes/estadosFinancieros');
const anexosRoutes = require('./routes/anexos');
const configuracionRoutes = require('./routes/configuracion');
const certificadoRoutes = require('./routes/certificado');
const sriRoutes = require('./routes/sri');
const emailRoutes = require('./routes/email');
const diagnosticoRoutes = require('./routes/diagnostico');
const estadisticasRoutes = require('./routes/estadisticas');
const pagosRoutes = require('./routes/pagos');
const cookieParser = require('cookie-parser');
const csrfProtection = require('./middleware/csrf');

const { iniciarScheduler, detenerScheduler } = require('./utils/backupScheduler');
const { asegurarIndices } = require('./utils/indices');
const { mountSwagger } = require('./utils/swagger');
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const { version: VERSION } = require('./package.json');

const app = express();
const port = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ===== SEGURIDAD =====
app.disable('x-powered-by');

// trust proxy configurable; por defecto 1 hop en producción, 0 en dev
const TRUST_PROXY = process.env.TRUST_PROXY_HOPS !== undefined
  ? parseInt(process.env.TRUST_PROXY_HOPS, 10)
  : (IS_PROD ? 1 : 0);
app.set('trust proxy', TRUST_PROXY);
app.set('query parser', 'simple');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
app.use(compression());

// ===== CORS =====
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : (IS_PROD ? false : true);

app.use(cors({
  origin: corsOrigins === true ? true : corsOrigins,
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'Content-Length']
}));

app.use(express.json({ limit: '20mb' }));

app.use(cookieParser());
// ===== REQUEST ID + LATENCIA (para logs correlacionados) =====
app.use((req, res, next) => {
  const start = Date.now();
  req.reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  res.setHeader('X-Request-Id', req.reqId);

  res.on('finish', () => {
    if (res.statusCode >= 500) {
      log.error({
        reqId: req.reqId,
        metodo: req.method,
        ruta: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start
      }, 'request');
    } else if (res.statusCode >= 400) {
      log.warn({
        reqId: req.reqId,
        metodo: req.method,
        ruta: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start
      }, 'request');
    }
  });
  next();
});

// ===== RATE LIMIT GLOBAL (endurecido) =====
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones, intente más tarde' }
}));

// ===== MONGODB =====
const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;
let db;
let mongoClient = null;
let schedulerActivo = false;

if (!uri) {
  log.error('❌ MONGODB_URI no está definida en .env');
  process.exit(1);
}

mongoClient = new MongoClient(uri, {
  maxPoolSize: parseInt(process.env.MONGO_POOL_MAX || '20', 10),
  minPoolSize: parseInt(process.env.MONGO_POOL_MIN || '2', 10),
  serverSelectionTimeoutMS: 8000,
  socketTimeoutMS: 45000
});

async function inicializarMongo() {
  try {
    await mongoClient.connect();
    db = dbName ? mongoClient.db(dbName) : mongoClient.db();
    log.info({ db: db.databaseName }, '✅ Conectado a MongoDB');

    try {
      const r = await asegurarIndices(db);
      if (r.salteado) log.info({ version: r.version }, '⏭️  Índices sin cambios');
      else log.info({ total: r.total, fallidos: r.fallidos?.length || 0 }, '✅ Índices verificados');
    } catch (e) {
      log.warn({ err: e.message }, '⚠️  Error creando índices');
    }

    try {
      await iniciarScheduler(db);
      schedulerActivo = true;
    } catch (e) {
      log.error({ err: e.message }, 'Error iniciando scheduler');
    }

    return true;
  } catch (err) {
    log.error({ err: err.message }, '❌ Error conectando a MongoDB');
    return false;
  }
}

// ===== MIDDLEWARE: inyectar db =====
app.use((req, res, next) => {
  if (!db) {
    return res.status(503).json({ error: 'Base de datos no disponible. Reintente en unos segundos.' });
  }
  req.db = db;
  next();
});

// ===== SWAGGER =====
mountSwagger(app);

// ===== HTTP + SOCKET.IO =====
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: corsOrigins === true ? true : corsOrigins, credentials: true },
  transports: ['websocket', 'polling'],
  pingTimeout: 25000,
  pingInterval: 20000
});

// Parser de cookies para handshake de Socket.IO
function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
}

io.use(async (socket, next) => {
  try {
    // 1. Preferir cookie httpOnly
    const cookies = parseCookies(socket.handshake.headers.cookie);
    let token = cookies['sc_at'];

    // 2. Fallback a socket.handshake.auth.token (apps móviles)
    if (!token && socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    }

    if (!token) return next(new Error('Autenticación requerida'));

    const secret = process.env.JWT_SECRET;
    if (!secret) return next(new Error('Servidor mal configurado'));

    let decoded;
    try {
      decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch (_err) {
      return next(new Error('Token inválido'));
    }

    if (!decoded.userId || !db) return next(new Error('Token malformado o DB no disponible'));
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
      if (iat < changed) return next(new Error('Sesión invalidada por cambio de contraseña'));
    }

    socket.user = {
      userId: usuario._id,
      email: usuario.email,
      rol: usuario.rol,
      nombre: usuario.nombre || usuario.email
    };
    next();
  } catch (err) {
    log.error({ err: err.message }, 'Error en auth de socket');
    next(new Error('Error de autenticación'));
  }
});

io.on('connection', (socket) => {
  log.info({ socketId: socket.id, email: socket.user?.email }, '🟢 Cliente conectado');
  if (socket.user?.rol) socket.join(`rol:${socket.user.rol}`);
  if (socket.user?.userId) socket.join(`user:${socket.user.userId}`);
  socket.on('disconnect', () => {
    log.info({ socketId: socket.id }, '🔴 Cliente desconectado');
  });
});

app.use((req, res, next) => {
  req.io = io;
  req.emitir = (evento, data) => io.emit(evento, data);
  next();
});

// ===== RUTAS PÚBLICAS =====
app.use('/api/auth', authRoutes);

// Liveness: siempre 200 si el proceso responde.
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), version: VERSION });
});
// Alias para orquestadores
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

// Readiness: chequea DB y devuelve 503 si no está lista.
app.get('/api/health/detailed', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    version: VERSION,
    db: 'unknown',
    scheduler: schedulerActivo
  };
  try {
    if (!db) throw new Error('DB no inicializada');
    const t0 = Date.now();
    await db.command({ ping: 1 });
    health.db = 'ok';
    health.db_latency_ms = Date.now() - t0;
    try { health.auth_cache = authMiddleware.stats(); } catch (_) { /* opcional */ }
    res.json(health);
  } catch (e) {
    health.status = 'DEGRADED';
    health.db = 'error';
    health.db_error = e.message;
    res.status(503).json(health);
  }
});
app.get('/readyz', async (req, res) => {
  try {
    if (!db) throw new Error('sin DB');
    await db.command({ ping: 1 });
    res.json({ status: 'ready' });
  } catch (e) {
    res.status(503).json({ status: 'not-ready', error: e.message });
  }
});

// ===== RUTAS PROTEGIDAS =====
app.use('/api', csrfProtection);
app.use('/api', authMiddleware);

app.use('/api/productos', productosRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/kardex', kardexRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/reportes', reportesMensualesRoutes);
app.use('/api/consultas', consultasRoutes);
app.use('/api/secuencias', secuenciasRoutes);
app.use('/api/contadores', contadoresRoutes);
app.use('/api/retenciones', retencionesRoutes);
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/periodos', periodosRoutes);
app.use('/api/backups', backupsRoutes);
app.use('/api/estado-cuenta', estadoCuentaRoutes);
app.use('/api/estados-financieros', estadosFinancierosRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/anexos', anexosRoutes);
app.use('/api/certificado', certificadoRoutes);
app.use('/api/sri', sriRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/diagnostico', diagnosticoRoutes);
app.use('/api/estadisticas', estadisticasRoutes);
app.use('/api/pagos', pagosRoutes);

app.get('/api/auth/permisos', (req, res) => {
  const { PERMISOS } = require('./utils/permisos');
  const rol = req.user?.rol || 'vendedor';
  res.json({ rol, permisos: PERMISOS[rol] || {} });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada', ruta: req.originalUrl });
});

app.use(errorHandler);

// ===== ARRANQUE =====
(async () => {
  const mongoOk = await inicializarMongo();
  if (!mongoOk) {
    log.error('❌ No se pudo inicializar MongoDB. Cerrando.');
    process.exit(1);
  }

  server.listen(port, () => {
    log.info({
      port, env: process.env.NODE_ENV || 'desarrollo', version: VERSION,
      cors: corsOrigins === true ? 'todos (dev)' : corsOrigins,
      db: db.databaseName,
      scheduler: schedulerActivo,
      trustProxy: TRUST_PROXY
    }, '🚀 Servidor backend listo');

    if (!process.env.SMTP_FROM) {
      log.warn('⚠️  SMTP_FROM no definido. Se usará SMTP_USER como remitente.');
    }
    if (!process.env.CORS_ORIGINS && IS_PROD) {
      log.warn('⚠️  CORS_ORIGINS no definido en producción — CORS cerrado por defecto.');
    }
  });
})();

// ===== GRACEFUL SHUTDOWN =====
let cerrando = false;
const shutdown = async (signal) => {
  if (cerrando) return;
  cerrando = true;
  log.info({ signal }, `\n${signal} recibido. Cerrando servidor...`);

  try { detenerScheduler(); } catch (_) { /* noop */ }
  try { await new Promise(resolve => io.close(resolve)); } catch (_) { /* noop */ }

  server.close(async () => {
    try {
      if (mongoClient) {
        await mongoClient.close();
        log.info('✅ MongoDB cerrado');
      }
    } catch (e) {
      log.error({ err: e.message }, 'Error cerrando Mongo');
    }
    log.info('✅ Servidor HTTP cerrado');
    process.exit(0);
  });

  setTimeout(() => {
    log.error('⚠️  Forzando salida por timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ✅ unhandledRejection ahora SÍ cierra el proceso (estado indefinido).
process.on('unhandledRejection', (reason) => {
  log.error({ reason: reason?.stack || reason }, '❌ unhandledRejection');
  shutdown('unhandledRejection');
});
process.on('uncaughtException', (err) => {
  log.error({ err: err.stack || err.message }, '❌ uncaughtException');
  shutdown('uncaughtException');
});