const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body, validationResult } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');

const validarCliente = [
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
    .isEmail().withMessage('Email inválido').normalizeEmail(),
  body('tipo').optional().isIn(['persona', 'empresa']).withMessage('Tipo debe ser "persona" o "empresa"')
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
      const clientes = await req.db.collection('clientes').find(matchStage).sort(sort).toArray();
      return res.json(clientes);
    }

    const total = await req.db.collection('clientes').countDocuments(matchStage);
    const data = await req.db.collection('clientes')
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
    const cliente = await req.db.collection('clientes').findOne({ _id: new ObjectId(id) });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(cliente);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', validarCliente, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { nombre, ruc, telefono, email, direccion, tipo } = req.body;
    const existente = await req.db.collection('clientes').findOne({ ruc });
    if (existente) return res.status(400).json({ error: 'Ya existe un cliente con ese RUC' });

    const nuevo = {
      nombre, ruc, telefono, email,
      direccion: direccion || '',
      tipo: tipo || 'persona',
      createdAt: new Date()
    };
    const result = await req.db.collection('clientes').insertOne(nuevo);

    // ===== AUDITORÍA =====
    await logAudit(req.db, req, {
      accion: 'crear',
      coleccion: 'clientes',
      documentoId: result.insertedId,
      documentoNumero: nuevo.ruc,
      datosNuevos: { ...nuevo, _id: result.insertedId },
      detalle: `Cliente creado: ${nuevo.nombre}`
    });

    res.status(201).json({ ...nuevo, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', validarCliente, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
    const { nombre, ruc, telefono, email, direccion, tipo } = req.body;

    const existente = await req.db.collection('clientes').findOne({
      _id: { $ne: new ObjectId(id) },
      ruc
    });
    if (existente) return res.status(400).json({ error: 'Ya existe otro cliente con ese RUC' });

    const clienteAnterior = await req.db.collection('clientes').findOne({ _id: new ObjectId(id) });
    if (!clienteAnterior) return res.status(404).json({ error: 'Cliente no encontrado' });

    const result = await req.db.collection('clientes').updateOne(
      { _id: new ObjectId(id) },
      { $set: { nombre, ruc, telefono, email, direccion, tipo, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    // ===== AUDITORÍA =====
    await logAudit(req.db, req, {
      accion: 'actualizar',
      coleccion: 'clientes',
      documentoId: id,
      documentoNumero: ruc,
      datosAnteriores: clienteAnterior,
      datosNuevos: { nombre, ruc, telefono, email, direccion, tipo },
      detalle: `Cliente actualizado: ${nombre}`
    });

    res.json({ message: 'Cliente actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const clienteAnterior = await req.db.collection('clientes').findOne({ _id: new ObjectId(id) });
    if (!clienteAnterior) return res.status(404).json({ error: 'Cliente no encontrado' });

    const result = await req.db.collection('clientes').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    // ===== AUDITORÍA =====
    await logAudit(req.db, req, {
      accion: 'eliminar',
      coleccion: 'clientes',
      documentoId: id,
      documentoNumero: clienteAnterior.ruc || '',
      datosAnteriores: clienteAnterior,
      detalle: `Cliente eliminado: ${clienteAnterior.nombre || ''}`
    });

    res.json({ message: 'Cliente eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;