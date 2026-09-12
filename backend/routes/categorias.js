// backend/routes/categorias.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { escapeRegex } = require('../utils/pagination');
const { validar } = require('../utils/validacion');

router.get('/', requierePermiso('categorias', 'ver'), async (req, res) => {
  try {
    const categorias = await req.db.collection('categorias').find({}).sort({ nombre: 1 }).toArray();

    const conteos = await req.db.collection('productos').aggregate([
      { $group: { _id: '$categoriaId', cantidad: { $sum: 1 } } }
    ]).toArray();
    const mapa = {};
    conteos.forEach(c => { if (c._id) mapa[c._id.toString()] = c.cantidad; });

    res.json(categorias.map(c => ({ ...c, productosCount: mapa[c._id.toString()] || 0 })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requierePermiso('categorias', 'ver'), async (req, res) => {
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
  requierePermiso('categorias', 'crear'),
  body('nombre').trim().notEmpty().withMessage('Nombre obligatorio'),
  async (req, res) => {
    if (validar(req, res)) return;

    try {
      const { nombre, descripcion } = req.body;
      const nombreTrim = nombre.trim();

      const existente = await req.db.collection('categorias').findOne({
        nombre: { $regex: `^${escapeRegex(nombreTrim)}$`, $options: 'i' }
      });
      if (existente) return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });

      const nueva = { nombre: nombreTrim, descripcion: (descripcion || '').trim(), createdAt: new Date() };
      const result = await req.db.collection('categorias').insertOne(nueva);

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
  requierePermiso('categorias', 'editar'),
  body('nombre').trim().notEmpty().withMessage('Nombre obligatorio'),
  async (req, res) => {
    if (validar(req, res)) return;

    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
      const { nombre, descripcion } = req.body;
      const nombreTrim = nombre.trim();

      const existente = await req.db.collection('categorias').findOne({
        _id: { $ne: new ObjectId(id) },
        nombre: { $regex: `^${escapeRegex(nombreTrim)}$`, $options: 'i' }
      });
      if (existente) return res.status(400).json({ error: 'Ya existe otra categoría con ese nombre' });

      const categoriaAnterior = await req.db.collection('categorias').findOne({ _id: new ObjectId(id) });
      if (!categoriaAnterior) return res.status(404).json({ error: 'Categoría no encontrada' });

      await req.db.collection('categorias').updateOne(
        { _id: new ObjectId(id) },
        { $set: { nombre: nombreTrim, descripcion: (descripcion || '').trim(), updatedAt: new Date() } }
      );

      await logAudit(req.db, req, {
        accion: 'actualizar',
        coleccion: 'categorias',
        documentoId: id,
        documentoNumero: nombreTrim,
        datosAnteriores: categoriaAnterior,
        datosNuevos: { nombre: nombreTrim, descripcion },
        detalle: `Categoría actualizada: ${nombreTrim}`
      });

      res.json({ message: 'Categoría actualizada' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.delete('/:id', requierePermiso('categorias', 'eliminar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const categoriaAnterior = await req.db.collection('categorias').findOne({ _id: new ObjectId(id) });
    if (!categoriaAnterior) return res.status(404).json({ error: 'Categoría no encontrada' });

    const productosAsociados = await req.db.collection('productos').countDocuments({ categoriaId: new ObjectId(id) });
    if (productosAsociados > 0) {
      return res.status(409).json({
        error: `No se puede eliminar. Hay ${productosAsociados} productos en esta categoría.`,
        productosAsociados
      });
    }

    await req.db.collection('categorias').deleteOne({ _id: new ObjectId(id) });

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