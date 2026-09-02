const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Obtener todos los productos
router.get('/', async (req, res) => {
  try {
    const productos = await req.db.collection('productos').find({}).toArray();
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener un producto por ID
router.get('/:id', async (req, res) => {
  try {
    const producto = await req.db.collection('productos').findOne({ _id: new ObjectId(req.params.id) });
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(producto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear producto
router.post('/', async (req, res) => {
  try {
    const {
      nombre, codigo, categoriaId, descripcion,
      precio_compra, precio_venta, stock_minimo,
      unidad_medida, codigo_barras, foto, observaciones,
      aplica_iva, tipo_medida
    } = req.body;

    const nuevoProducto = {
      nombre,
      codigo,
      categoriaId: categoriaId ? new ObjectId(categoriaId) : null,
      descripcion,
      precio_compra: precio_compra || 0,
      precio_venta: precio_venta || 0,
      stock_minimo: stock_minimo || 0,
      unidad_medida: unidad_medida || 'unidad',
      codigo_barras: codigo_barras || '',
      foto: foto || '',
      observaciones: observaciones || '',
      stock: 0,
      estado: 'activo',
      aplica_iva: aplica_iva !== undefined ? aplica_iva : true,
      tipo_medida: tipo_medida || 'unidad',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await req.db.collection('productos').insertOne(nuevoProducto);
    res.status(201).json({ ...nuevoProducto, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar producto
router.put('/:id', async (req, res) => {
  try {
    const {
      nombre, codigo, categoriaId, descripcion,
      precio_compra, precio_venta, stock_minimo,
      unidad_medida, codigo_barras, foto, observaciones,
      aplica_iva, tipo_medida
    } = req.body;

    const updateData = {
      nombre,
      codigo,
      categoriaId: categoriaId ? new ObjectId(categoriaId) : null,
      descripcion,
      precio_compra,
      precio_venta,
      stock_minimo,
      unidad_medida,
      codigo_barras,
      foto,
      observaciones,
      aplica_iva,
      tipo_medida,
      updatedAt: new Date()
    };
    const result = await req.db.collection('productos').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ message: 'Producto actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar producto
router.delete('/:id', async (req, res) => {
  try {
    const result = await req.db.collection('productos').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener productos con stock bajo
router.get('/stock/bajo', async (req, res) => {
  try {
    const productos = await req.db.collection('productos').find({
      $expr: { $lte: ['$stock', '$stock_minimo'] }
    }).toArray();
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;