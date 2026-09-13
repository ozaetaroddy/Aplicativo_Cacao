// backend/routes/kardex.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { requierePermiso } = require('../utils/permisos');
const { parsePagination, wantsPagination } = require('../utils/pagination');

function buildFechaFilter(query) {
  const { desde, hasta } = query;
  if (!desde && !hasta) return null;
  const r = {};
  if (desde) r.$gte = new Date(desde);
  if (hasta) { const h = new Date(hasta); h.setHours(23, 59, 59, 999); r.$lte = h; }
  return Object.keys(r).length ? r : null;
}

// ✅ FIX: paginación opcional. Si viene ?page o ?limit, devuelve { data, total, page, limit, totalPages }.
// Sin paginación, respeta el comportamiento legacy (array plano) pero limitado a MAX_SIN_PAGINAR.
const MAX_SIN_PAGINAR = 5000;

router.get('/cliente/:clienteId', requierePermiso('kardex', 'ver'), async (req, res) => {
  try {
    const { clienteId } = req.params;
    if (!ObjectId.isValid(clienteId)) return res.status(400).json({ error: 'ID inválido' });

    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);

    const matchKardex = { referencia_tipo: 'venta' };
    const fechaFilter = buildFechaFilter(req.query);
    if (fechaFilter) matchKardex.fecha = fechaFilter;

    const basePipeline = [
      { $match: matchKardex },
      {
        $lookup: {
          from: 'ventas_v2',
          let: { rid: '$referencia_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$rid'] },
                clienteId: new ObjectId(clienteId)
              }
            },
            { $project: { _id: 1 } }
          ],
          as: 'venta'
        }
      },
      { $match: { 'venta.0': { $exists: true } } },
      { $project: { venta: 0 } }
    ];

    if (!paginar) {
      const movimientos = await req.db.collection('kardex').aggregate([
        ...basePipeline,
        { $sort: { fecha: 1, _id: 1 } },
        { $limit: MAX_SIN_PAGINAR }
      ]).toArray();
      return res.json(movimientos);
    }

    const countResult = await req.db.collection('kardex').aggregate([
      ...basePipeline,
      { $count: 'total' }
    ]).toArray();
    const total = countResult[0]?.total || 0;

    const data = await req.db.collection('kardex').aggregate([
      ...basePipeline,
      { $sort: { fecha: 1, _id: 1 } },
      { $skip: skip },
      { $limit: limit }
    ]).toArray();

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/proveedor/:proveedorId', requierePermiso('kardex', 'ver'), async (req, res) => {
  try {
    const { proveedorId } = req.params;
    if (!ObjectId.isValid(proveedorId)) return res.status(400).json({ error: 'ID inválido' });

    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);

    const matchKardex = { referencia_tipo: 'compra' };
    const fechaFilter = buildFechaFilter(req.query);
    if (fechaFilter) matchKardex.fecha = fechaFilter;

    const basePipeline = [
      { $match: matchKardex },
      {
        $lookup: {
          from: 'compras_v2',
          let: { rid: '$referencia_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$rid'] },
                proveedorId: new ObjectId(proveedorId)
              }
            },
            { $project: { _id: 1 } }
          ],
          as: 'compra'
        }
      },
      { $match: { 'compra.0': { $exists: true } } },
      { $project: { compra: 0 } }
    ];

    if (!paginar) {
      const movimientos = await req.db.collection('kardex').aggregate([
        ...basePipeline,
        { $sort: { fecha: 1, _id: 1 } },
        { $limit: MAX_SIN_PAGINAR }
      ]).toArray();
      return res.json(movimientos);
    }

    const countResult = await req.db.collection('kardex').aggregate([
      ...basePipeline,
      { $count: 'total' }
    ]).toArray();
    const total = countResult[0]?.total || 0;

    const data = await req.db.collection('kardex').aggregate([
      ...basePipeline,
      { $sort: { fecha: 1, _id: 1 } },
      { $skip: skip },
      { $limit: limit }
    ]).toArray();

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/producto/:productoId', requierePermiso('kardex', 'ver'), async (req, res) => {
  try {
    const { productoId } = req.params;
    if (!ObjectId.isValid(productoId)) return res.status(400).json({ error: 'ID inválido' });

    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);

    const filter = { productoId: new ObjectId(productoId) };
    const fechaFilter = buildFechaFilter(req.query);
    if (fechaFilter) filter.fecha = fechaFilter;

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

router.get('/', requierePermiso('kardex', 'ver'), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { productoId, tipo_movimiento } = req.query;

    const filter = {};
    if (productoId && ObjectId.isValid(productoId)) filter.productoId = new ObjectId(productoId);
    if (tipo_movimiento) filter.tipo_movimiento = tipo_movimiento;
    const fechaFilter = buildFechaFilter(req.query);
    if (fechaFilter) filter.fecha = fechaFilter;

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