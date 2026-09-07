require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');
const http = require('http');
const socketIo = require('socket.io');

// Importar rutas
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

const app = express();
const port = process.env.PORT || 5000;

// Middlewares de seguridad
app.use(helmet());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 peticiones por IP
  message: { error: 'Demasiadas peticiones, intente más tarde' }
}));
app.use(cors());
app.use(express.json());

// Conexión a MongoDB
const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;
let db;

MongoClient.connect(uri)
  .then(client => {
    db = client.db(dbName);
    console.log('✅ Conectado a MongoDB');
    // Crear índices únicos
    db.collection('clientes').createIndex({ ruc: 1 }, { unique: true });
    db.collection('proveedores').createIndex({ ruc: 1 }, { unique: true });
    db.collection('productos').createIndex({ codigo: 1 }, { unique: true });
    db.collection('productos').createIndex({ nombre: 1 }, { unique: true });
  })
  .catch(err => {
    console.error('❌ Error conectando a MongoDB:', err);
    process.exit(1);
  });

// Middleware para inyectar db en las rutas
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Middleware de autenticación (protege todas las rutas excepto auth y health)
const authMiddleware = require('./middleware/auth');
app.use('/api/auth', authRoutes);
app.use('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));
app.use('/api', authMiddleware); // a partir de aquí, todo requiere token

// Rutas protegidas
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

// Middleware de manejo de errores (debe ir al final)
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// ===== SOCKET.IO =====
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

// Inyectar io en req para emitir eventos desde las rutas
app.use((req, res, next) => {
  req.io = io;
  next();
});

server.listen(port, () => {
  console.log(`🚀 Servidor backend corriendo en http://localhost:${port}`);
});