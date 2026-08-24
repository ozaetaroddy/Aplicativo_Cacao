const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

router.get('/', async (req, res) => {
  try {
    const categorias = await req.db.collection('categorias').find({}).toArray();
    res.json(categorias);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    const nueva = { nombre, descripcion, createdAt: new Date() };
    const result = await req.db.collection('categorias').insertOne(nueva);
    res.status(201).json({ ...nueva, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    const result = await req.db.collection('categorias').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { nombre, descripcion, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json({ message: 'Categoría actualizada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await req.db.collection('categorias').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json({ message: 'Categoría eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;