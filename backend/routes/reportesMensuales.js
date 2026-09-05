const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Reporte mensual para declaración (IVA, retenciones, base imponible)
router.get('/declaracion/:mes/:anio', async (req, res) => {
  try {
    const { mes, anio } = req.params;
    const inicio = new Date(anio, mes - 1, 1);
    const fin = new Date(anio, mes, 0);
    fin.setHours(23, 59, 59, 999);

    // Obtener compras del mes
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

    // Obtener retenciones del mes
    const retenciones = await req.db.collection('retenciones').find({
      fecha_emision: { $gte: inicio, $lte: fin }
    }).toArray();

    // Totales
    const totalComprasInventario = compras
      .filter(c => c.tipo_compra === 'inventario')
      .reduce((sum, c) => sum + c.total, 0);

    const totalComprasGasto = compras
      .filter(c => c.tipo_compra === 'gasto')
      .reduce((sum, c) => sum + c.total, 0);

    const baseImponibleIva = compras
      .filter(c => c.iva > 0)
      .reduce((sum, c) => sum + c.subtotal, 0);

    const totalIva = compras.reduce((sum, c) => sum + (c.iva || 0), 0);
    const totalRetenido = retenciones.reduce((sum, r) => sum + r.valor_retenido, 0);

    const reporte = {
      mes,
      anio,
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