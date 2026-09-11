const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body, validationResult } = require('express-validator');
const { logAudit } = require('../utils/audit');

router.get('/', async (req, res) => {
  try {
    const categorias = await req.db.collection('categorias').find({}).toArray();
    res.json(categorias);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
    const categoria = await req.db.collection('categorias').findOne({ _id: new ObjectId(id) });
    if (!categoria) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json(categoria);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/',
  body('nombre').trim().notEmpty().withMessage('Nombre obligatorio'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { nombre, descripcion } = req.body;
      const existente = await req.db.collection('categorias').findOne({ nombre });
      if (existente) return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });

      const nueva = { nombre, descripcion: descripcion || '', createdAt: new Date() };
      const result = await req.db.collection('categorias').insertOne(nueva);

      // ===== AUDITORÍA =====
      await logAudit(req.db, req, {
        accion: 'crear',
        coleccion: 'categorias',
        documentoId: result.insertedId,
        documentoNumero: nueva.nombre,
        datosNuevos: { ...nueva, _id: result.insertedId },
        detalle: `Categoría creada: ${nueva.nombre}`
      });

      res.status(201).json({ ...nueva, _id: result.insertedId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.put('/:id',
  body('nombre').trim().notEmpty().withMessage('Nombre obligatorio'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
      const { nombre, descripcion } = req.body;

      const existente = await req.db.collection('categorias').findOne({
        _id: { $ne: new ObjectId(id) },
        nombre
      });
      if (existente) return res.status(400).json({ error: 'Ya existe otra categoría con ese nombre' });

      const categoriaAnterior = await req.db.collection('categorias').findOne({ _id: new ObjectId(id) });
      if (!categoriaAnterior) return res.status(404).json({ error: 'Categoría no encontrada' });

      const result = await req.db.collection('categorias').updateOne(
        { _id: new ObjectId(id) },
        { $set: { nombre, descripcion, updatedAt: new Date() } }
      );
      if (result.matchedCount === 0) return res.status(404).json({ error: 'Categoría no encontrada' });

      // ===== AUDITORÍA =====
      await logAudit(req.db, req, {
        accion: 'actualizar',
        coleccion: 'categorias',
        documentoId: id,
        documentoNumero: nombre,
        datosAnteriores: categoriaAnterior,
        datosNuevos: { nombre, descripcion },
        detalle: `Categoría actualizada: ${nombre}`
      });

      res.json({ message: 'Categoría actualizada' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const categoriaAnterior = await req.db.collection('categorias').findOne({ _id: new ObjectId(id) });
    if (!categoriaAnterior) return res.status(404).json({ error: 'Categoría no encontrada' });

    const result = await req.db.collection('categorias').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Categoría no encontrada' });

    // ===== AUDITORÍA =====
    await logAudit(req.db, req, {
      accion: 'eliminar',
      coleccion: 'categorias',
      documentoId: id,
      documentoNumero: categoriaAnterior.nombre || '',
      datosAnteriores: categoriaAnterior,
      detalle: `Categoría eliminada: ${categoriaAnterior.nombre || ''}`
    });

    res.json({ message: 'Categoría eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;