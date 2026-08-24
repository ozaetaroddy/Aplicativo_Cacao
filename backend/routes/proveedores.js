const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

router.get('/', async (req, res) => {
  try {
    const proveedores = await req.db.collection('proveedores').find({}).toArray();
    res.json(proveedores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, ruc, telefono, email, direccion } = req.body;
    const nuevo = { nombre, ruc, telefono, email, direccion, createdAt: new Date() };
    const result = await req.db.collection('proveedores').insertOne(nuevo);
    res.status(201).json({ ...nuevo, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, ruc, telefono, email, direccion } = req.body;
    const result = await req.db.collection('proveedores').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { nombre, ruc, telefono, email, direccion, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json({ message: 'Proveedor actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await req.db.collection('proveedores').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json({ message: 'Proveedor eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;