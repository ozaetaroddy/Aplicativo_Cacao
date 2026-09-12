const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');
const { validar } = require('../utils/validacion');
const { validarIdentificacion, validarTelefono } = require('../utils/validators');

const NOMBRE_REGEX = /^[\p{L}\p{N}\s.,'&()#°/+-]{2,150}$/u;

// Acepta celular (09XXXXXXXX) o fijo (0XXXXXXXXX) — validación compartida
const TELEFONO_MSG = 'Teléfono inválido (09XXXXXXXX celular, 0XXXXXXXXX fijo)';

const validarCliente = [
  body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio')
    .matches(NOMBRE_REGEX).withMessage('El nombre contiene caracteres no permitidos'),
  body('ruc').trim().notEmpty().withMessage('El RUC/Cédula es obligatorio')
    .custom((value) => {
      const resultado = validarIdentificacion(value);
      if (!resultado.valido) throw new Error(resultado.mensaje);
      return true;
    }),
  body('telefono').trim().notEmpty().withMessage('El teléfono es obligatorio')
    .custom((value) => {
      const r = validarTelefono(value);
      if (!r.valido) throw new Error(TELEFONO_MSG);
      return true;
    }),
  body('email').trim().notEmpty().withMessage('El email es obligatorio')
    .isEmail().withMessage('Email inválido').normalizeEmail(),
  body('tipo').optional().isIn(['persona', 'empresa']).withMessage('Tipo debe ser "persona" o "empresa"')
];

router.get('/', requierePermiso('clientes', 'ver'), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (req.query.search || '').trim();

    const matchStage = {};
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      matchStage.$or = [
        { nombre: regex }, { ruc: regex }, { telefono: regex }, { email: regex }
      ];
    }

    const sort = parseSort(req.query, { nombre: 1 });

    if (!paginar) {
      const clientes = await req.db.collection('clientes').find(matchStage).sort(sort).toArray();
      return res.json(clientes);
    }

    const total = await req.db.collection('clientes').countDocuments(matchStage);
    const data = await req.db.collection('clientes')
      .find(matchStage).sort(sort).skip(skip).limit(limit).toArray();

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requierePermiso('clientes', 'ver'), async (req, res) => {
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

router.post('/', requierePermiso('clientes', 'crear'), validarCliente, async (req, res) => {
  if (validar(req, res)) return;

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

router.put('/:id', requierePermiso('clientes', 'editar'), validarCliente, async (req, res) => {
  if (validar(req, res)) return;

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

router.delete('/:id', requierePermiso('clientes', 'eliminar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const clienteAnterior = await req.db.collection('clientes').findOne({ _id: new ObjectId(id) });
    if (!clienteAnterior) return res.status(404).json({ error: 'Cliente no encontrado' });

    const [ventasAsociadas, pagosAsociados] = await Promise.all([
      req.db.collection('ventas_v2').countDocuments({ clienteId: new ObjectId(id) }),
      req.db.collection('pagos').countDocuments({ clienteId: new ObjectId(id), anulado: { $ne: true } })
    ]);

    if (ventasAsociadas > 0 || pagosAsociados > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: el cliente tiene ${ventasAsociadas} documentos y ${pagosAsociados} pagos asociados.`,
        ventasAsociadas,
        pagosAsociados
      });
    }

    const result = await req.db.collection('clientes').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

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