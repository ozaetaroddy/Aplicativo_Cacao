// backend/routes/reportes.js
const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const { parsePagination, wantsPagination } = require('../utils/pagination');

router.use(requierePermiso('reportes', 'ver'));

const MAX_EXPORT = 5000;

router.get('/ventas', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);

    const filter = {};
    if (desde && hasta) {
      const fechaDesde = new Date(desde);
      const fechaHasta = new Date(hasta);
      fechaHasta.setHours(23, 59, 59, 999);
      filter.fecha_emision = { $gte: fechaDesde, $lte: fechaHasta };
    }

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'clientes',
          localField: 'clienteId',
          foreignField: '_id',
          as: 'cliente'
        }
      },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
      { $sort: { fecha_emision: -1 } }
    ];

    if (!paginar) {
      pipeline.push({ $limit: MAX_EXPORT });
      const ventas = await req.db.collection('ventas_v2').aggregate(pipeline).toArray();
      return res.json(ventas);
    }

    const countRes = await req.db.collection('ventas_v2')
      .aggregate([...pipeline, { $count: 'total' }]).toArray();
    const total = countRes[0]?.total || 0;

    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const ventas = await req.db.collection('ventas_v2').aggregate(pipeline).toArray();
    res.json({ data: ventas, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/compras', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);

    const filter = {};
    if (desde && hasta) {
      const fechaDesde = new Date(desde);
      const fechaHasta = new Date(hasta);
      fechaHasta.setHours(23, 59, 59, 999);
      filter.fecha_emision = { $gte: fechaDesde, $lte: fechaHasta };
    }

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'proveedores',
          localField: 'proveedorId',
          foreignField: '_id',
          as: 'proveedor'
        }
      },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
      { $sort: { fecha_emision: -1 } }
    ];

    if (!paginar) {
      pipeline.push({ $limit: MAX_EXPORT });
      const compras = await req.db.collection('compras_v2').aggregate(pipeline).toArray();
      return res.json(compras);
    }

    const countRes = await req.db.collection('compras_v2')
      .aggregate([...pipeline, { $count: 'total' }]).toArray();
    const total = countRes[0]?.total || 0;

    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const compras = await req.db.collection('compras_v2').aggregate(pipeline).toArray();
    res.json({ data: compras, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;