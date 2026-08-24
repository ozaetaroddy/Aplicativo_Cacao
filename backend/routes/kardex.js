const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Obtener kardex por producto y rango de fechas (ya existente)
router.get('/producto/:productoId', async (req, res) => {
  try {
    const { productoId } = req.params;
    const { desde, hasta } = req.query;
    const filter = { productoId: new ObjectId(productoId) };
    if (desde) filter.fecha = { $gte: new Date(desde) };
    if (hasta) filter.fecha = { ...filter.fecha, $lte: new Date(hasta) };

    const movimientos = await req.db.collection('kardex')
      .find(filter)
      .sort({ fecha: 1 })
      .toArray();
    res.json(movimientos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener kardex por CLIENTE
router.get('/cliente/:clienteId', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const { desde, hasta } = req.query;

    // 1. Obtener todas las ventas de ese cliente
    const ventas = await req.db.collection('ventas_v2')
      .find({ clienteId: new ObjectId(clienteId) })
      .project({ _id: 1 })
      .toArray();
    const ventaIds = ventas.map(v => v._id);

    if (ventaIds.length === 0) {
      return res.json([]);
    }

    // 2. Buscar movimientos de kardex que referencien esas ventas
    const filter = {
      referencia_id: { $in: ventaIds },
      referencia_tipo: 'venta'
    };
    if (desde) filter.fecha = { $gte: new Date(desde) };
    if (hasta) filter.fecha = { ...filter.fecha, $lte: new Date(hasta) };

    const movimientos = await req.db.collection('kardex')
      .find(filter)
      .sort({ fecha: 1 })
      .toArray();

    res.json(movimientos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener kardex por PROVEEDOR
router.get('/proveedor/:proveedorId', async (req, res) => {
  try {
    const { proveedorId } = req.params;
    const { desde, hasta } = req.query;

    // 1. Obtener todas las compras de ese proveedor
    const compras = await req.db.collection('compras_v2')
      .find({ proveedorId: new ObjectId(proveedorId) })
      .project({ _id: 1 })
      .toArray();
    const compraIds = compras.map(c => c._id);

    if (compraIds.length === 0) {
      return res.json([]);
    }

    // 2. Buscar movimientos de kardex que referencien esas compras
    const filter = {
      referencia_id: { $in: compraIds },
      referencia_tipo: 'compra'
    };
    if (desde) filter.fecha = { $gte: new Date(desde) };
    if (hasta) filter.fecha = { ...filter.fecha, $lte: new Date(hasta) };

    const movimientos = await req.db.collection('kardex')
      .find(filter)
      .sort({ fecha: 1 })
      .toArray();

    res.json(movimientos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener todo el kardex (limitado)
router.get('/', async (req, res) => {
  try {
    const kardex = await req.db.collection('kardex')
      .find({})
      .sort({ fecha: -1 })
      .limit(100)
      .toArray();
    res.json(kardex);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;