const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

router.get('/', async (req, res) => {
  try {
    const clientes = await req.db.collection('clientes').find({}).toArray();
    res.json(clientes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, ruc, telefono, email, direccion, tipo } = req.body;
    const nuevo = { nombre, ruc, telefono, email, direccion, tipo, createdAt: new Date() };
    const result = await req.db.collection('clientes').insertOne(nuevo);
    res.status(201).json({ ...nuevo, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, ruc, telefono, email, direccion, tipo } = req.body;
    const result = await req.db.collection('clientes').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { nombre, ruc, telefono, email, direccion, tipo, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ message: 'Cliente actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await req.db.collection('clientes').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ message: 'Cliente eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;