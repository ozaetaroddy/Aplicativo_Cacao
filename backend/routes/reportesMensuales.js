// backend/routes/reportesMensuales.js
const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');

router.use(requierePermiso('reportes', 'ver'));

router.get('/declaracion/:mes/:anio', async (req, res) => {
  try {
    const { mes, anio } = req.params;
    const mesNum = parseInt(mes, 10);
    const anioNum = parseInt(anio, 10);

    if (mesNum < 1 || mesNum > 12) {
      return res.status(400).json({ error: 'Mes inválido (1-12)' });
    }
    if (isNaN(anioNum) || anioNum < 2000 || anioNum > 2100) {
      return res.status(400).json({ error: 'Año fuera de rango' });
    }

    const inicio = new Date(anioNum, mesNum - 1, 1);
    const fin = new Date(anioNum, mesNum, 0);
    fin.setHours(23, 59, 59, 999);

    const compras = await req.db.collection('compras_v2').aggregate([
      { $match: { fecha_emision: { $gte: inicio, $lte: fin } } },
      {
        $lookup: {
          from: 'proveedores',
          localField: 'proveedorId',
          foreignField: '_id',
          as: 'proveedor'
        }
      },
      { $unwind: '$proveedor' }
    ]).toArray();

    const retenciones = await req.db.collection('retenciones').find({
      fecha_emision: { $gte: inicio, $lte: fin }
    }).toArray();

    const totalComprasInventario = compras
      .filter(c => c.tipo_compra === 'inventario')
      .reduce((sum, c) => sum + (c.total || 0), 0);

    const totalComprasGasto = compras
      .filter(c => c.tipo_compra === 'gasto')
      .reduce((sum, c) => sum + (c.total || 0), 0);

    const baseImponibleIva = compras
      .filter(c => (c.iva || 0) > 0)
      .reduce((sum, c) => sum + (c.subtotal || 0), 0);

    const totalIva = compras.reduce((sum, c) => sum + (c.iva || 0), 0);
    // 🔒 Fallback a 0 para retenciones legadas sin el campo
    const totalRetenido = retenciones.reduce((sum, r) => sum + (r.valor_retenido || 0), 0);

    const reporte = {
      mes: mesNum,
      anio: anioNum,
      totalComprasInventario,
      totalComprasGasto,
      baseImponibleIva,
      totalIva,
      totalRetenido,
      compras,
      retenciones
    };

    res.json(reporte);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;