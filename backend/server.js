require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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

const { iniciarScheduler } = require('./utils/backupScheduler');

const app = express();
const port = process.env.PORT || 5000;

app.use(helmet());

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Demasiadas peticiones, intente más tarde' }
}));

app.use(cors());
app.use(express.json({ limit: '20mb' }));

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;
let db;

MongoClient.connect(uri)
  .then(async client => {
    db = client.db(dbName);
    console.log('✅ Conectado a MongoDB');

    db.collection('clientes').createIndex({ ruc: 1 }, { unique: true });
    db.collection('proveedores').createIndex({ ruc: 1 }, { unique: true });
    db.collection('productos').createIndex({ codigo: 1 }, { unique: true });
    db.collection('productos').createIndex({ nombre: 1 }, { unique: true });
    db.collection('usuarios').createIndex({ email: 1 }, { unique: true });
    db.collection('auditoria').createIndex({ fecha: -1 });
    db.collection('auditoria').createIndex({ usuarioId: 1, fecha: -1 });
    db.collection('auditoria').createIndex({ coleccion: 1, accion: 1, fecha: -1 });
    db.collection('ventas_v2').createIndex({ fecha_emision: -1 });
    db.collection('compras_v2').createIndex({ fecha_emision: -1 });
    db.collection('periodos_cerrados').createIndex({ anio: 1, mes: 1 }, { unique: true });
    db.collection('backups').createIndex({ fecha: -1 });
    db.collection('backups').createIndex({ tipo: 1, fecha: -1 });

    // Iniciar scheduler de backups
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

app.use((req, res, next) => {
  req.db = db;
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

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

app.get('/api/auth/permisos', (req, res) => {
  const { PERMISOS } = require('./utils/permisos');
  const rol = req.user?.rol || 'vendedor';
  res.json({
    rol,
    permisos: PERMISOS[rol] || {}
  });
});

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('🟢 Cliente conectado:', socket.id);
  socket.on('disconnect', () => {
    console.log('🔴 Cliente desconectado:', socket.id);
  });
});

app.use((req, res, next) => {
  req.io = io;
  next();
});

server.listen(port, () => {
  console.log(`🚀 Servidor backend corriendo en http://localhost:${port}`);
  console.log(`📡 Entorno: ${process.env.NODE_ENV || 'desarrollo'}`);
});