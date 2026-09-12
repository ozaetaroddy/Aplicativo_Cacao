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
const TELEFONO_MSG = 'Teléfono inválido (09XXXXXXXX celular, 0XXXXXXXXX fijo)';

const validarProveedor = [
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
    .isEmail().withMessage('Email inválido').normalizeEmail()
];

router.get('/', requierePermiso('proveedores', 'ver'), async (req, res) => {
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
      const proveedores = await req.db.collection('proveedores').find(matchStage).sort(sort).toArray();
      return res.json(proveedores);
    }

    const total = await req.db.collection('proveedores').countDocuments(matchStage);
    const data = await req.db.collection('proveedores')
      .find(matchStage).sort(sort).skip(skip).limit(limit).toArray();

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requierePermiso('proveedores', 'ver'), async (req, res) => {
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

router.post('/', requierePermiso('proveedores', 'crear'), validarProveedor, async (req, res) => {
  if (validar(req, res)) return;

  try {
    const { nombre, ruc, telefono, email, direccion } = req.body;
    const existente = await req.db.collection('proveedores').findOne({ ruc });
    if (existente) return res.status(400).json({ error: 'Ya existe un proveedor con ese RUC' });

    const nuevo = { nombre, ruc, telefono, email, direccion: direccion || '', createdAt: new Date() };
    const result = await req.db.collection('proveedores').insertOne(nuevo);

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

router.put('/:id', requierePermiso('proveedores', 'editar'), validarProveedor, async (req, res) => {
  if (validar(req, res)) return;

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

router.delete('/:id', requierePermiso('proveedores', 'eliminar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const proveedorAnterior = await req.db.collection('proveedores').findOne({ _id: new ObjectId(id) });
    if (!proveedorAnterior) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const [comprasAsociadas, pagosAsociados] = await Promise.all([
      req.db.collection('compras_v2').countDocuments({ proveedorId: new ObjectId(id) }),
      req.db.collection('pagos').countDocuments({ proveedorId: new ObjectId(id), anulado: { $ne: true } })
    ]);

    if (comprasAsociadas > 0 || pagosAsociados > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: el proveedor tiene ${comprasAsociadas} compras y ${pagosAsociados} pagos asociados.`,
        comprasAsociadas,
        pagosAsociados
      });
    }

    const result = await req.db.collection('proveedores').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });

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