const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body, validationResult } = require('express-validator');

const validarProveedor = [
  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre es obligatorio')
    .matches(/^[A-Za-zÁÉÍÓÚÑáéíóúñ\s.]+$/).withMessage('Solo letras, espacios y puntos'),
  body('ruc')
    .trim()
    .notEmpty().withMessage('El RUC/Cédula es obligatorio')
    .isLength({ min: 10, max: 13 }).withMessage('Debe tener entre 10 y 13 dígitos')
    .matches(/^\d+$/).withMessage('Solo dígitos numéricos')
    .custom((value) => {
      if (value.length === 13 && !value.endsWith('001')) {
        throw new Error('RUC debe terminar en 001');
      }
      return true;
    }),
  body('telefono')
    .trim()
    .notEmpty().withMessage('El teléfono es obligatorio')
    .matches(/^09\d{8}$/).withMessage('Debe comenzar con 09 y tener 10 dígitos'),
  body('email')
    .trim()
    .notEmpty().withMessage('El email es obligatorio')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail()
];

router.get('/', async (req, res) => {
  try {
    const proveedores = await req.db.collection('proveedores').find({}).toArray();
    res.json(proveedores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

router.post('/', validarProveedor, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { nombre, ruc, telefono, email, direccion } = req.body;
    const nuevo = { 
      nombre, 
      ruc, 
      telefono, 
      email, 
      direccion: direccion || '', 
      createdAt: new Date() 
    };
    const result = await req.db.collection('proveedores').insertOne(nuevo);
    res.status(201).json({ ...nuevo, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', validarProveedor, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

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