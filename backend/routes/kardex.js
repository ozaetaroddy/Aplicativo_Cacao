// backend/routes/kardex.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { requierePermiso } = require('../utils/permisos');
const { parsePagination, wantsPagination } = require('../utils/pagination');

router.get('/producto/:productoId', requierePermiso('kardex', 'ver'), async (req, res) => {
  try {
    const { productoId } = req.params;
    if (!ObjectId.isValid(productoId)) return res.status(400).json({ error: 'ID inválido' });

    const { desde, hasta } = req.query;
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);

    const filter = { productoId: new ObjectId(productoId) };
    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = new Date(desde);
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        filter.fecha.$lte = h;
      }
    }

    const col = req.db.collection('kardex');
    if (!paginar) {
      const movimientos = await col.find(filter).sort({ fecha: 1, _id: 1 }).toArray();
      return res.json(movimientos);
    }

    const total = await col.countDocuments(filter);
    const data = await col.find(filter).sort({ fecha: -1, _id: -1 }).skip(skip).limit(limit).toArray();

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cliente/:clienteId', requierePermiso('kardex', 'ver'), async (req, res) => {
  try {
    const { clienteId } = req.params;
    if (!ObjectId.isValid(clienteId)) return res.status(400).json({ error: 'ID inválido' });

    const { desde, hasta } = req.query;
    const ventas = await req.db.collection('ventas_v2')
      .find({ clienteId: new ObjectId(clienteId) }, { projection: { _id: 1 } })
      .toArray();
    const ventaIds = ventas.map(v => v._id);
    if (ventaIds.length === 0) return res.json([]);

    const filter = { referencia_id: { $in: ventaIds }, referencia_tipo: 'venta' };
    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = new Date(desde);
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        filter.fecha.$lte = h;
      }
    }

    const movimientos = await req.db.collection('kardex').find(filter).sort({ fecha: 1 }).toArray();
    res.json(movimientos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/proveedor/:proveedorId', requierePermiso('kardex', 'ver'), async (req, res) => {
  try {
    const { proveedorId } = req.params;
    if (!ObjectId.isValid(proveedorId)) return res.status(400).json({ error: 'ID inválido' });

    const { desde, hasta } = req.query;
    const compras = await req.db.collection('compras_v2')
      .find({ proveedorId: new ObjectId(proveedorId) }, { projection: { _id: 1 } })
      .toArray();
    const compraIds = compras.map(c => c._id);
    if (compraIds.length === 0) return res.json([]);

    const filter = { referencia_id: { $in: compraIds }, referencia_tipo: 'compra' };
    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = new Date(desde);
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        filter.fecha.$lte = h;
      }
    }

    const movimientos = await req.db.collection('kardex').find(filter).sort({ fecha: 1 }).toArray();
    res.json(movimientos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', requierePermiso('kardex', 'ver'), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { productoId, tipo_movimiento, desde, hasta } = req.query;

    const filter = {};
    if (productoId && ObjectId.isValid(productoId)) filter.productoId = new ObjectId(productoId);
    if (tipo_movimiento) filter.tipo_movimiento = tipo_movimiento;
    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = new Date(desde);
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        filter.fecha.$lte = h;
      }
    }

    const col = req.db.collection('kardex');
    const total = await col.countDocuments(filter);
    const data = await col.find(filter).sort({ fecha: -1, _id: -1 }).skip(skip).limit(limit).toArray();

    const productoIds = [...new Set(data.map(d => d.productoId?.toString()).filter(Boolean))];
    const productos = productoIds.length
      ? await req.db.collection('productos')
          .find({ _id: { $in: productoIds.map(id => new ObjectId(id)) } },
                { projection: { nombre: 1, codigo: 1 } }).toArray()
      : [];
    const prodMap = {};
    productos.forEach(p => { prodMap[p._id.toString()] = p; });

    res.json({
      data: data.map(d => ({
        ...d,
        productoNombre: prodMap[d.productoId?.toString()]?.nombre || 'Producto eliminado',
        productoCodigo: prodMap[d.productoId?.toString()]?.codigo || ''
      })),
      total, page, limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;