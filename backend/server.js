require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const http = require('http');
const socketIo = require('socket.io');

// Importar rutas
const productosRoutes = require('./routes/productos');
const categoriasRoutes = require('./routes/categorias');
const clientesRoutes = require('./routes/clientes');
const proveedoresRoutes = require('./routes/proveedores');
const comprasRoutes = require('./routes/compras');
const ventasRoutes = require('./routes/ventas');
const kardexRoutes = require('./routes/kardex');
const reportesRoutes = require('./routes/reportes');
const consultasRoutes = require('./routes/consultas');
const secuenciasRoutes = require('./routes/secuencias');
const contadoresRoutes = require('./routes/contadores');
const retencionesRoutes = require('./routes/retenciones');
const reportesMensualesRoutes = require('./routes/reportesMensuales');
const authRoutes = require('./routes/auth');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
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

// Rutas
app.use('/api/productos', productosRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/kardex', kardexRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/consultas', consultasRoutes);
app.use('/api/secuencias', secuenciasRoutes);
app.use('/api/contadores', contadoresRoutes);
app.use('/api/retenciones', retencionesRoutes);
app.use('/api/reportes', reportesMensualesRoutes);
app.use('/api/auth', authRoutes);

// Ruta de salud
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

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

// Emitir eventos desde las rutas (se inyecta io en req)
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Modificar rutas para emitir eventos (opcional, se puede hacer en cada endpoint)
// Ejemplo: en compras.js, después de insertar, hacer req.io.emit('nueva-compra', data);

server.listen(port, () => {
  console.log(`🚀 Servidor backend corriendo en http://localhost:${port}`);
});