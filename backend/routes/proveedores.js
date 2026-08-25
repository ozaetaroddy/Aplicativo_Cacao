const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Obtener todos los proveedores
router.get('/', async (req, res) => {
  try {
    const proveedores = await req.db.collection('proveedores').find({}).toArray();
    res.json(proveedores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== NUEVA RUTA: Obtener proveedor por ID =====
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const proveedor = await req.db.collection('proveedores').findOne({ _id: new ObjectId(id) });
    if (!proveedor) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    res.json(proveedor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear proveedor
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

// Actualizar proveedor
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const { nombre, ruc, telefono, email, direccion } = req.body;
    const result = await req.db.collection('proveedores').updateOne(
      { _id: new ObjectId(id) },
      { $set: { nombre, ruc, telefono, email, direccion, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    res.json({ message: 'Proveedor actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar proveedor
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const result = await req.db.collection('proveedores').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    res.json({ message: 'Proveedor eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;