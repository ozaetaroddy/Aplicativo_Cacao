// backend/routes/productos.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');
const { validar } = require('../utils/validacion');

const validarProducto = [
  body('nombre').trim().notEmpty().withMessage('Nombre obligatorio'),
  body('codigo').trim().notEmpty().withMessage('Código obligatorio'),
  body('precio_venta').isFloat({ min: 0 }).withMessage('Precio de venta debe ser número >= 0'),
  body('precio_compra').optional().isFloat({ min: 0 }).withMessage('Precio de compra debe ser número >= 0'),
  body('stock_minimo').optional().isFloat({ min: 0 }).withMessage('Stock mínimo debe ser número >= 0')
];

router.get('/stock/bajo', requierePermiso('productos', 'ver'), async (req, res) => {
  try {
    const productos = await req.db.collection('productos').find({
      estado: { $ne: 'inactivo' },
      stock_minimo: { $gt: 0 },
      $expr: { $lte: ['$stock', '$stock_minimo'] }
    }).sort({ stock: 1 }).toArray();
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/barras/:codigo', requierePermiso('productos', 'ver'), async (req, res) => {
  try {
    const { codigo } = req.params;
    if (!codigo) return res.status(400).json({ error: 'Código requerido' });
    const producto = await req.db.collection('productos').findOne({ codigo_barras: codigo });
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(producto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', requierePermiso('productos', 'ver'), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (req.query.search || '').trim();
    const { categoriaId, estado } = req.query;

    const matchStage = {};
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      matchStage.$or = [{ nombre: regex }, { codigo: regex }, { codigo_barras: regex }];
    }
    if (categoriaId && typeof categoriaId === 'string' && ObjectId.isValid(categoriaId)) {
      matchStage.categoriaId = new ObjectId(categoriaId);
    }
    if (estado && typeof estado === 'string') matchStage.estado = estado;

    const sort = parseSort(req.query, { nombre: 1 });

    if (!paginar) {
      const productos = await req.db.collection('productos').find(matchStage).sort(sort).toArray();
      return res.json(productos);
    }

    const total = await req.db.collection('productos').countDocuments(matchStage);
    const data = await req.db.collection('productos')
      .find(matchStage).sort(sort).skip(skip).limit(limit).toArray();

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requierePermiso('productos', 'ver'), async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const producto = await req.db.collection('productos').findOne({ _id: new ObjectId(req.params.id) });
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(producto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requierePermiso('productos', 'crear'), validarProducto, async (req, res) => {
  if (validar(req, res)) return;

  try {
    const {
      nombre, codigo, categoriaId, descripcion,
      precio_compra, precio_venta, stock_minimo,
      unidad_medida, codigo_barras, foto, observaciones,
      aplica_iva, tipo_medida
    } = req.body;

    const nombreTrim = nombre.trim();
    const codigoTrim = codigo.trim();

    const existente = await req.db.collection('productos').findOne({
      $or: [{ codigo: codigoTrim }, { nombre: nombreTrim }]
    });
    if (existente) {
      return res.status(400).json({ error: 'Ya existe un producto con ese código o nombre' });
    }

    if (codigo_barras) {
      const cbDup = await req.db.collection('productos').findOne({ codigo_barras });
      if (cbDup) return res.status(400).json({ error: 'Ya existe un producto con ese código de barras' });
    }

    const nuevoProducto = {
      nombre: nombreTrim,
      codigo: codigoTrim,
      categoriaId: categoriaId ? new ObjectId(categoriaId) : null,
      descripcion: descripcion || '',
      precio_compra: parseFloat(precio_compra) || 0,
      precio_venta: parseFloat(precio_venta) || 0,
      stock_minimo: parseFloat(stock_minimo) || 0,
      unidad_medida: unidad_medida || 'unidad',
      codigo_barras: codigo_barras || '',
      foto: foto || '',
      observaciones: observaciones || '',
      stock: 0,
      estado: 'activo',
      aplica_iva: aplica_iva !== undefined ? !!aplica_iva : true,
      tipo_medida: tipo_medida || 'unidad',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await req.db.collection('productos').insertOne(nuevoProducto);

    await logAudit(req.db, req, {
      accion: 'crear',
      coleccion: 'productos',
      documentoId: result.insertedId,
      documentoNumero: nuevoProducto.codigo,
      datosNuevos: { ...nuevoProducto, _id: result.insertedId },
      detalle: `Producto creado: ${nuevoProducto.nombre}`
    });

    res.status(201).json({ ...nuevoProducto, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requierePermiso('productos', 'editar'), validarProducto, async (req, res) => {
  if (validar(req, res)) return;

  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const {
      nombre, codigo, categoriaId, descripcion,
      precio_compra, precio_venta, stock_minimo,
      unidad_medida, codigo_barras, foto, observaciones,
      aplica_iva, tipo_medida
    } = req.body;

    const nombreTrim = nombre.trim();
    const codigoTrim = codigo.trim();

    const existente = await req.db.collection('productos').findOne({
      _id: { $ne: new ObjectId(id) },
      $or: [{ codigo: codigoTrim }, { nombre: nombreTrim }]
    });
    if (existente) {
      return res.status(400).json({ error: 'Ya existe otro producto con ese código o nombre' });
    }

    if (codigo_barras) {
      const cbDup = await req.db.collection('productos').findOne({
        _id: { $ne: new ObjectId(id) }, codigo_barras
      });
      if (cbDup) return res.status(400).json({ error: 'Ya existe otro producto con ese código de barras' });
    }

    const productoAnterior = await req.db.collection('productos').findOne({ _id: new ObjectId(id) });
    if (!productoAnterior) return res.status(404).json({ error: 'Producto no encontrado' });

    const updateData = {
      nombre: nombreTrim,
      codigo: codigoTrim,
      categoriaId: categoriaId ? new ObjectId(categoriaId) : null,
      descripcion: descripcion || '',
      precio_compra: parseFloat(precio_compra) || 0,
      precio_venta: parseFloat(precio_venta) || 0,
      stock_minimo: parseFloat(stock_minimo) || 0,
      unidad_medida: unidad_medida || 'unidad',
      codigo_barras: codigo_barras || '',
      foto: foto || '',
      observaciones: observaciones || '',
      aplica_iva: aplica_iva !== undefined ? !!aplica_iva : true,
      tipo_medida: tipo_medida || 'unidad',
      updatedAt: new Date()
    };

    await req.db.collection('productos').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    await logAudit(req.db, req, {
      accion: 'actualizar',
      coleccion: 'productos',
      documentoId: id,
      documentoNumero: codigoTrim,
      datosAnteriores: productoAnterior,
      datosNuevos: updateData,
      detalle: `Producto actualizado: ${nombreTrim}`
    });

    res.json({ message: 'Producto actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requierePermiso('productos', 'eliminar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const productoAnterior = await req.db.collection('productos').findOne({ _id: new ObjectId(id) });
    if (!productoAnterior) return res.status(404).json({ error: 'Producto no encontrado' });

    const movimientos = await req.db.collection('kardex').countDocuments({ productoId: new ObjectId(id) });

    if (movimientos > 0) {
      await req.db.collection('productos').updateOne(
        { _id: new ObjectId(id) },
        { $set: { estado: 'inactivo', updatedAt: new Date() } }
      );

      await logAudit(req.db, req, {
        accion: 'desactivar',
        coleccion: 'productos',
        documentoId: id,
        documentoNumero: productoAnterior.codigo || '',
        datosAnteriores: productoAnterior,
        datosNuevos: { estado: 'inactivo' },
        detalle: `Producto desactivado (tenía ${movimientos} movimientos): ${productoAnterior.nombre}`
      });

      return res.json({
        message: 'Producto desactivado (conserva historial)',
        softDeleted: true
      });
    }

    await req.db.collection('productos').deleteOne({ _id: new ObjectId(id) });

    await logAudit(req.db, req, {
      accion: 'eliminar',
      coleccion: 'productos',
      documentoId: id,
      documentoNumero: productoAnterior.codigo || '',
      datosAnteriores: productoAnterior,
      detalle: `Producto eliminado: ${productoAnterior.nombre || ''}`
    });

    res.json({ message: 'Producto eliminado', softDeleted: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;