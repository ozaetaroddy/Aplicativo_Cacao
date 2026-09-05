const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Obtener todas las retenciones
router.get('/', async (req, res) => {
  try {
    const retenciones = await req.db.collection('retenciones').aggregate([
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
    ]).toArray();
    res.json(retenciones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear retención (manual o desde compra)
router.post('/', async (req, res) => {
  try {
    const {
      compraId,
      proveedorId,
      numero_factura,
      fecha_emision,
      valor_retenido,
      porcentaje,
      tipo // 'compra' o 'manual'
    } = req.body;

    if (!ObjectId.isValid(proveedorId)) {
      return res.status(400).json({ error: 'ID de proveedor inválido' });
    }

    const retencion = {
      compraId: compraId ? new ObjectId(compraId) : null,
      proveedorId: new ObjectId(proveedorId),
      numero_factura,
      fecha_emision: new Date(fecha_emision),
      valor_retenido,
      porcentaje: porcentaje || 0,
      tipo: tipo || 'manual',
      createdAt: new Date()
    };
    const result = await req.db.collection('retenciones').insertOne(retencion);
    res.status(201).json({ ...retencion, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar retención
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const result = await req.db.collection('retenciones').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Retención no encontrada' });
    }
    res.json({ message: 'Retención eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;