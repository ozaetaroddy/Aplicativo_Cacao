require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

let db;

async function connectDB() {
  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db(process.env.DB_NAME);
    console.log('✅ Conectado a MongoDB Atlas');
  } catch (error) {
    console.error('❌ Error al conectar a MongoDB:', error);
    process.exit(1);
  }
}

// ========== ENDPOINTS ==========

// Obtener todos los documentos de una colección
app.get('/api/:coleccion', async (req, res) => {
  try {
    const coleccion = req.params.coleccion;
    if (!['compras', 'ventas'].includes(coleccion)) {
      return res.status(400).json({ error: 'Colección no válida' });
    }
    const data = await db.collection(coleccion).find({}).toArray();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Insertar un documento en una colección
app.post('/api/:coleccion', async (req, res) => {
  try {
    const coleccion = req.params.coleccion;
    if (!['compras', 'ventas'].includes(coleccion)) {
      return res.status(400).json({ error: 'Colección no válida' });
    }
    const documento = req.body;
    if (!documento.fecha || !documento.peso_kg || !documento.total) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    const result = await db.collection(coleccion).insertOne(documento);
    res.status(201).json({ insertedId: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reportes diarios: GET /api/reportes/:fecha (formato YYYY-MM-DD)
app.get('/api/reportes/:fecha', async (req, res) => {
  try {
    const fecha = req.params.fecha;
    const inicio = new Date(fecha);
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(fecha);
    fin.setHours(23, 59, 59, 999);

    const [compras, ventas] = await Promise.all([
      db.collection('compras').find({ fecha: { $gte: inicio.toISOString(), $lte: fin.toISOString() } }).toArray(),
      db.collection('ventas').find({ fecha: { $gte: inicio.toISOString(), $lte: fin.toISOString() } }).toArray()
    ]);

    res.json({ compras, ventas });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

connectDB();