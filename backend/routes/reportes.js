const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Reporte de ventas por período
router.get('/ventas', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    console.log('📊 Reporte Ventas - Desde:', desde, 'Hasta:', hasta);

    const filter = {};
    if (desde && hasta) {
      const fechaDesde = new Date(desde);
      const fechaHasta = new Date(hasta);
      fechaHasta.setHours(23, 59, 59, 999);
      filter.fecha_emision = {
        $gte: fechaDesde,
        $lte: fechaHasta
      };
    }

    console.log('🔍 Filtro ventas:', JSON.stringify(filter));

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

    console.log(`✅ Ventas encontradas: ${ventas.length}`);
    res.json(ventas);
  } catch (err) {
    console.error('❌ Error en reporte ventas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reporte de compras por período
router.get('/compras', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    console.log('📊 Reporte Compras - Desde:', desde, 'Hasta:', hasta);

    const filter = {};
    if (desde && hasta) {
      const fechaDesde = new Date(desde);
      const fechaHasta = new Date(hasta);
      fechaHasta.setHours(23, 59, 59, 999);
      filter.fecha_emision = {
        $gte: fechaDesde,
        $lte: fechaHasta
      };
    }

    console.log('🔍 Filtro compras:', JSON.stringify(filter));

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

    console.log(`✅ Compras encontradas: ${compras.length}`);
    res.json(compras);
  } catch (err) {
    console.error('❌ Error en reporte compras:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;