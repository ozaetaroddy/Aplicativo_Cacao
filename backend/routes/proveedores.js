const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body, validationResult } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');

const validarProveedor = [
  body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio')
    .matches(/^[A-Za-zÁÉÍÓÚÑáéíóúñ\s.]+$/).withMessage('Solo letras, espacios y puntos'),
  body('ruc').trim().notEmpty().withMessage('El RUC/Cédula es obligatorio')
    .custom((value) => {
      const { validarIdentificacion } = require('../utils/validators');
      const resultado = validarIdentificacion(value);
      if (!resultado.valido) {
        throw new Error(resultado.mensaje);
      }
      return true;
    }),
  body('telefono').trim().notEmpty().withMessage('El teléfono es obligatorio')
    .matches(/^09\d{8}$/).withMessage('Debe comenzar con 09 y tener 10 dígitos'),
  body('email').trim().notEmpty().withMessage('El email es obligatorio')
    .isEmail().withMessage('Email inválido').normalizeEmail()
];

router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (req.query.search || '').trim();

    const matchStage = {};
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      matchStage.$or = [
        { nombre: regex },
        { ruc: regex },
        { telefono: regex },
        { email: regex }
      ];
    }

    const sort = parseSort(req.query, { nombre: 1 });

    if (!paginar) {
      const proveedores = await req.db.collection('proveedores').find(matchStage).sort(sort).toArray();
      return res.json(proveedores);
    }

    const total = await req.db.collection('proveedores').countDocuments(matchStage);
    const data = await req.db.collection('proveedores')
      .find(matchStage)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
    const proveedor = await req.db.collection('proveedores').findOne({ _id: new ObjectId(id) });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(proveedor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', validarProveedor, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { nombre, ruc, telefono, email, direccion } = req.body;
    const existente = await req.db.collection('proveedores').findOne({ ruc });
    if (existente) return res.status(400).json({ error: 'Ya existe un proveedor con ese RUC' });

    const nuevo = { nombre, ruc, telefono, email, direccion: direccion || '', createdAt: new Date() };
    const result = await req.db.collection('proveedores').insertOne(nuevo);

    // ===== AUDITORÍA =====
    await logAudit(req.db, req, {
      accion: 'crear',
      coleccion: 'proveedores',
      documentoId: result.insertedId,
      documentoNumero: nuevo.ruc,
      datosNuevos: { ...nuevo, _id: result.insertedId },
      detalle: `Proveedor creado: ${nuevo.nombre}`
    });

    res.status(201).json({ ...nuevo, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', validarProveedor, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
    const { nombre, ruc, telefono, email, direccion } = req.body;

    const existente = await req.db.collection('proveedores').findOne({
      _id: { $ne: new ObjectId(id) },
      ruc
    });
    if (existente) return res.status(400).json({ error: 'Ya existe otro proveedor con ese RUC' });

    const proveedorAnterior = await req.db.collection('proveedores').findOne({ _id: new ObjectId(id) });
    if (!proveedorAnterior) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const result = await req.db.collection('proveedores').updateOne(
      { _id: new ObjectId(id) },
      { $set: { nombre, ruc, telefono, email, direccion, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });

    // ===== AUDITORÍA =====
    await logAudit(req.db, req, {
      accion: 'actualizar',
      coleccion: 'proveedores',
      documentoId: id,
      documentoNumero: ruc,
      datosAnteriores: proveedorAnterior,
      datosNuevos: { nombre, ruc, telefono, email, direccion },
      detalle: `Proveedor actualizado: ${nombre}`
    });

    res.json({ message: 'Proveedor actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const proveedorAnterior = await req.db.collection('proveedores').findOne({ _id: new ObjectId(id) });
    if (!proveedorAnterior) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const result = await req.db.collection('proveedores').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });

    // ===== AUDITORÍA =====
    await logAudit(req.db, req, {
      accion: 'eliminar',
      coleccion: 'proveedores',
      documentoId: id,
      documentoNumero: proveedorAnterior.ruc || '',
      datosAnteriores: proveedorAnterior,
      detalle: `Proveedor eliminado: ${proveedorAnterior.nombre || ''}`
    });

    res.json({ message: 'Proveedor eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;