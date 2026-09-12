// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { MongoClient } = require('mongodb');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

// ============================================================
// VALIDACIÓN DE VARIABLES DE ENTORNO
// ============================================================
const PLACEHOLDERS = ['cambia-esto', 'otra-clave-larga', 'tu-app-password', 'tu-correo@'];
for (const key of ['JWT_SECRET', 'CERT_ENCRYPTION_KEY']) {
  const val = process.env[key] || '';
  if (!val) {
    console.error(`❌ FATAL: ${key} no está definido en el entorno`);
    process.exit(1);
  }
  if (PLACEHOLDERS.some(p => val.toLowerCase().includes(p))) {
    console.error(`❌ FATAL: ${key} sigue con valor de ejemplo. Cámbialo antes de arrancar.`);
    process.exit(1);
  }
}
if ((process.env.JWT_SECRET || '').length < 32) {
  console.error('❌ FATAL: JWT_SECRET debe tener al menos 32 caracteres');
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

const { iniciarScheduler, detenerScheduler } = require('./utils/backupScheduler');
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// ✅ FIX: versión única fuente de verdad
const { version: VERSION } = require('./package.json');

const app = express();
const port = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ===== SEGURIDAD =====
app.disable('x-powered-by');
app.set('trust proxy', 1);
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

// ===== RATE LIMIT GLOBAL =====
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
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
  console.error('❌ MONGODB_URI no está definida en .env');
  process.exit(1);
}

mongoClient = new MongoClient(uri, {
  maxPoolSize: parseInt(process.env.MONGO_POOL_MAX || '20', 10),
  minPoolSize: parseInt(process.env.MONGO_POOL_MIN || '2', 10),
  serverSelectionTimeoutMS: 8000,
  socketTimeoutMS: 45000
});

async function crearIndices(db) {
  await Promise.all([
    db.collection('clientes').createIndex({ ruc: 1 }, { unique: true }),
    db.collection('clientes').createIndex({ nombre: 1 }),
    db.collection('proveedores').createIndex({ ruc: 1 }, { unique: true }),
    db.collection('proveedores').createIndex({ nombre: 1 }),
    db.collection('productos').createIndex({ codigo: 1 }, { unique: true }),
    db.collection('productos').createIndex({ nombre: 1 }),
    db.collection('productos').createIndex({ categoriaId: 1 }),
    db.collection('productos').createIndex({ codigo_barras: 1 }, { sparse: true }),
    db.collection('usuarios').createIndex({ email: 1 }, { unique: true }),

    db.collection('auditoria').createIndex({ fecha: -1 }),
    db.collection('auditoria').createIndex({ usuarioId: 1, fecha: -1 }),
    db.collection('auditoria').createIndex({ coleccion: 1, accion: 1, fecha: -1 }),

    db.collection('ventas_v2').createIndex({ fecha_emision: -1 }),
    db.collection('ventas_v2').createIndex({ clienteId: 1, fecha_emision: -1 }),
    db.collection('ventas_v2').createIndex({ estado_sri: 1 }),
    db.collection('ventas_v2').createIndex({ clave_acceso: 1 }, { sparse: true }),
    db.collection('ventas_v2').createIndex({ tipo_documento: 1, fecha_emision: -1 }),

    db.collection('compras_v2').createIndex({ fecha_emision: -1 }),
    db.collection('compras_v2').createIndex({ proveedorId: 1, fecha_emision: -1 }),
    db.collection('compras_v2').createIndex({ estado_pago: 1 }),
    db.collection('compras_v2').createIndex({ tipo_compra: 1, fecha_emision: -1 }),

    db.collection('periodos_cerrados').createIndex({ anio: 1, mes: 1 }, { unique: true }),
    db.collection('backups').createIndex({ fecha: -1 }),
    db.collection('backups').createIndex({ tipo: 1, fecha: -1 }),
    db.collection('backup_lock').createIndex({ expira: 1 }),

    db.collection('kardex').createIndex({ productoId: 1, fecha: -1 }),
    db.collection('kardex').createIndex({ referencia_id: 1, referencia_tipo: 1 }),
    db.collection('retenciones').createIndex({ fecha_emision: -1 }),
    db.collection('retenciones').createIndex({ compraId: 1 }),

    db.collection('pagos').createIndex({ fecha: -1 }),
    db.collection('pagos').createIndex({ tipo: 1, fecha: -1 }),
    db.collection('pagos').createIndex({ clienteId: 1, fecha: -1 }),
    db.collection('pagos').createIndex({ proveedorId: 1, fecha: -1 }),
    db.collection('pagos').createIndex({ ventaId: 1 }),
    db.collection('pagos').createIndex({ compraId: 1 }),
    db.collection('pagos').createIndex({ anulado: 1, fecha: -1 }),

    db.collection('cache_consultas').createIndex({ expira: 1 }, { expireAfterSeconds: 0 })
  ]);
}

async function inicializarMongo() {
  try {
    await mongoClient.connect();
    db = dbName ? mongoClient.db(dbName) : mongoClient.db();
    console.log('✅ Conectado a MongoDB:', db.databaseName);

    try {
      await crearIndices(db);
      console.log('✅ Índices verificados');
    } catch (e) {
      console.warn('⚠️  Índices:', e.message);
    }

    try {
      await iniciarScheduler(db);
      schedulerActivo = true;
    } catch (e) {
      console.error('Error iniciando scheduler de backups:', e.message);
    }

    return true;
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err);
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

// ===== HTTP + SOCKET.IO =====
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: corsOrigins === true ? true : corsOrigins, credentials: true },
  transports: ['websocket', 'polling'],
  pingTimeout: 25000,
  pingInterval: 20000
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Autenticación requerida'));
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return next(new Error('Servidor mal configurado'));
    socket.user = jwt.verify(token, secret, { algorithms: ['HS256'] });
    next();
  } catch (_err) {
    next(new Error('Token inválido'));
  }
});

io.on('connection', (socket) => {
  console.log('🟢 Cliente conectado:', socket.id, socket.user?.email || 'anónimo');
  if (socket.user?.rol) socket.join(`rol:${socket.user.rol}`);
  if (socket.user?.userId) socket.join(`user:${socket.user.userId}`);
  socket.on('disconnect', () => {
    console.log('🔴 Cliente desconectado:', socket.id);
  });
});

app.use((req, res, next) => {
  req.io = io;
  req.emitir = (evento, data) => io.emit(evento, data);
  next();
});

// ===== RUTAS PÚBLICAS =====
app.use('/api/auth', authRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), version: VERSION });
});

// ===== RUTAS PROTEGIDAS =====
app.use('/api', authMiddleware);

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
    console.error('❌ No se pudo inicializar MongoDB. Cerrando.');
    process.exit(1);
  }

  server.listen(port, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${port}`);
    console.log(`📡 Entorno: ${process.env.NODE_ENV || 'desarrollo'}`);
    console.log(`🏷️  Versión: ${VERSION}`);
    console.log(`🔒 CORS: ${corsOrigins === true ? 'todos (dev)' : (corsOrigins || []).join(', ') || 'ninguno'}`);
    console.log(`💾 DB: ${db.databaseName}`);
    console.log(`⏰ Scheduler: ${schedulerActivo ? 'activo' : 'inactivo'}`);
    if (process.env.SRI_DEBUG === 'true') console.log(`🐞 SRI_DEBUG activo`);
  });
})();

// ===== GRACEFUL SHUTDOWN =====
let cerrando = false;
const shutdown = async (signal) => {
  if (cerrando) return;
  cerrando = true;
  console.log(`\n${signal} recibido. Cerrando servidor...`);

  try { detenerScheduler(); } catch (_) { /* noop */ }
  try { await new Promise(resolve => io.close(resolve)); } catch (_) { /* noop */ }

  server.close(async () => {
    try {
      if (mongoClient) {
        await mongoClient.close();
        console.log('✅ MongoDB cerrado');
      }
    } catch (e) {
      console.error('Error cerrando Mongo:', e.message);
    }
    console.log('✅ Servidor HTTP cerrado');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⚠️  Forzando salida por timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('❌ unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ uncaughtException:', err);
  shutdown('uncaughtException');
});