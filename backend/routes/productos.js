const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body, validationResult } = require('express-validator');

const validarProducto = [
  body('nombre').trim().notEmpty().withMessage('Nombre obligatorio'),
  body('codigo').trim().notEmpty().withMessage('Código obligatorio'),
  body('precio_venta').isNumeric().withMessage('Precio de venta debe ser número'),
  body('precio_compra').optional().isNumeric().withMessage('Precio de compra debe ser número'),
  body('stock_minimo').optional().isNumeric().withMessage('Stock mínimo debe ser número'),
];

router.get('/', async (req, res) => {
  try {
    const productos = await req.db.collection('productos').find({}).toArray();
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const producto = await req.db.collection('productos').findOne({ _id: new ObjectId(req.params.id) });
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(producto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', validarProducto, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const {
      nombre, codigo, categoriaId, descripcion,
      precio_compra, precio_venta, stock_minimo,
      unidad_medida, codigo_barras, foto, observaciones,
      aplica_iva, tipo_medida
    } = req.body;

    // Verificar unicidad de código y nombre
    const existente = await req.db.collection('productos').findOne({
      $or: [{ codigo }, { nombre }]
    });
    if (existente) {
      return res.status(400).json({ error: 'Ya existe un producto con ese código o nombre' });
    }

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

router.put('/:id', validarProducto, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const {
      nombre, codigo, categoriaId, descripcion,
      precio_compra, precio_venta, stock_minimo,
      unidad_medida, codigo_barras, foto, observaciones,
      aplica_iva, tipo_medida
    } = req.body;

    // Verificar unicidad excluyendo el propio producto
    const existente = await req.db.collection('productos').findOne({
      _id: { $ne: new ObjectId(id) },
      $or: [{ codigo }, { nombre }]
    });
    if (existente) {
      return res.status(400).json({ error: 'Ya existe otro producto con ese código o nombre' });
    }

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
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ message: 'Producto actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
    const result = await req.db.collection('productos').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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