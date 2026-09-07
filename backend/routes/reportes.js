const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

router.get('/ventas', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const filter = {};
    if (desde && hasta) {
      const fechaDesde = new Date(desde);
      const fechaHasta = new Date(hasta);
      fechaHasta.setHours(23, 59, 59, 999);
      filter.fecha_emision = { $gte: fechaDesde, $lte: fechaHasta };
    }
    const ventas = await req.db.collection('ventas_v2')
      .aggregate([
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
      ])
      .toArray();
    res.json(ventas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/compras', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const filter = {};
    if (desde && hasta) {
      const fechaDesde = new Date(desde);
      const fechaHasta = new Date(hasta);
      fechaHasta.setHours(23, 59, 59, 999);
      filter.fecha_emision = { $gte: fechaDesde, $lte: fechaHasta };
    }
    const compras = await req.db.collection('compras_v2')
      .aggregate([
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
      ])
      .toArray();
    res.json(compras);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;