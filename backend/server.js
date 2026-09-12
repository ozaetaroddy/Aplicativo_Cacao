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

const { iniciarScheduler } = require('./utils/backupScheduler');

const app = express();
const port = process.env.PORT || 5000;

// ===== SEGURIDAD =====
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());

// CORS configurable por env (mejor que '*' en producción)
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : true; // en dev permite todo
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'Content-Length']
}));

app.use(express.json({ limit: '20mb' }));

// Rate limit global (más generoso para uso normal)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones, intente más tarde' }
}));

// Rate limit específico para auth (anti brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Espere 15 minutos.' }
});

// ===== CONEXIÓN A MONGODB =====
const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;
let db;

if (!uri) {
  console.error('❌ MONGODB_URI no está definida en .env');
  process.exit(1);
}

MongoClient.connect(uri)
  .then(async client => {
    db = dbName ? client.db(dbName) : client.db();
    console.log('✅ Conectado a MongoDB:', db.databaseName);

    // ===== ÍNDICES (creación idempotente) =====
    try {
      await Promise.all([
        db.collection('clientes').createIndex({ ruc: 1 }, { unique: true }),
        db.collection('clientes').createIndex({ nombre: 1 }),
        db.collection('proveedores').createIndex({ ruc: 1 }, { unique: true }),
        db.collection('productos').createIndex({ codigo: 1 }, { unique: true }),
        db.collection('productos').createIndex({ nombre: 1 }),
        db.collection('productos').createIndex({ categoriaId: 1 }),
        db.collection('usuarios').createIndex({ email: 1 }, { unique: true }),
        db.collection('auditoria').createIndex({ fecha: -1 }),
        db.collection('auditoria').createIndex({ usuarioId: 1, fecha: -1 }),
        db.collection('auditoria').createIndex({ coleccion: 1, accion: 1, fecha: -1 }),
        db.collection('ventas_v2').createIndex({ fecha_emision: -1 }),
        db.collection('ventas_v2').createIndex({ clienteId: 1, fecha_emision: -1 }),
        db.collection('ventas_v2').createIndex({ estado_sri: 1 }),
        db.collection('ventas_v2').createIndex({ clave_acceso: 1 }, { sparse: true }),
        db.collection('compras_v2').createIndex({ fecha_emision: -1 }),
        db.collection('compras_v2').createIndex({ proveedorId: 1, fecha_emision: -1 }),
        db.collection('periodos_cerrados').createIndex({ anio: 1, mes: 1 }, { unique: true }),
        db.collection('backups').createIndex({ fecha: -1 }),
        db.collection('backups').createIndex({ tipo: 1, fecha: -1 }),
        db.collection('kardex').createIndex({ productoId: 1, fecha: -1 }),
        db.collection('retenciones').createIndex({ fecha_emision: -1 }),
      ]);
      console.log('✅ Índices verificados');
    } catch (e) {
      console.warn('⚠️  Índices:', e.message);
    }

    try {
      await iniciarScheduler(db);
    } catch (e) {
      console.error('Error iniciando scheduler de backups:', e.message);
    }
  })
  .catch(err => {
    console.error('❌ Error conectando a MongoDB:', err);
    process.exit(1);
  });

// ===== MIDDLEWARE: inyectar db en req =====
app.use((req, res, next) => {
  if (!db) {
    return res.status(503).json({ error: 'Base de datos no disponible. Reintente en unos segundos.' });
  }
  req.db = db;
  next();
});

// ===== SOCKET.IO (se crea antes de las rutas para inyectar req.io) =====
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: corsOrigins, credentials: true },
  transports: ['websocket', 'polling']
});

// Autenticación opcional del socket con JWT
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(); // permitir anónimos (solo recibirán broadcasts)
  try {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'mi-secreto-super-seguro-2026';
    socket.user = jwt.verify(token, secret);
  } catch (e) { /* token inválido, seguir como anónimo */ }
  next();
});

io.on('connection', (socket) => {
  console.log('🟢 Cliente conectado:', socket.id, socket.user?.email || 'anónimo');
  socket.on('disconnect', () => {
    console.log('🔴 Cliente desconectado:', socket.id);
  });
});

// ⚠️ IMPORTANTE: este middleware DEBE ir ANTES de las rutas
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ===== RUTAS PÚBLICAS =====
app.use('/api/auth', authLimiter, authRoutes);
app.get('/api/health', (req, res) => res.json({
  status: 'OK',
  timestamp: new Date(),
  uptime: process.uptime(),
  version: '2.0.0'
}));

// ===== RUTAS PROTEGIDAS (desde aquí, todas requieren JWT) =====
const authMiddleware = require('./middleware/auth');
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

app.get('/api/auth/permisos', (req, res) => {
  const { PERMISOS } = require('./utils/permisos');
  const rol = req.user?.rol || 'vendedor';
  res.json({ rol, permisos: PERMISOS[rol] || {} });
});

// ===== MANEJO DE ERRORES =====
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// ===== ARRANQUE =====
server.listen(port, () => {
  console.log(`🚀 Servidor backend corriendo en http://localhost:${port}`);
  console.log(`📡 Entorno: ${process.env.NODE_ENV || 'desarrollo'}`);
  console.log(`🔒 CORS origins: ${corsOrigins === true ? 'todos (dev)' : corsOrigins.join(', ')}`);
});

// ===== GRACEFUL SHUTDOWN =====
const shutdown = async (signal) => {
  console.log(`\n${signal} recibido. Cerrando servidor...`);
  server.close(() => {
    console.log('✅ Servidor HTTP cerrado');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));