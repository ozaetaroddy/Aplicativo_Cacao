const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Obtener todas las compras
router.get('/', async (req, res) => {
  try {
    const compras = await req.db.collection('compras_v2').aggregate([
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
    res.json(compras);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener compra por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const compra = await req.db.collection('compras_v2').aggregate([
      { $match: { _id: new ObjectId(id) } },
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
    if (compra.length === 0) {
      return res.status(404).json({ error: 'Compra no encontrada' });
    }
    res.json(compra[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear compra con actualización de stock y kardex
router.post('/', async (req, res) => {
  try {
    const { proveedorId, numero_factura, fecha_emision, detalles, subtotal, iva, total } = req.body;

    if (!ObjectId.isValid(proveedorId)) {
      return res.status(400).json({ error: 'ID de proveedor inválido' });
    }

    const session = req.db.client.startSession();
    let result;

    await session.withTransaction(async () => {
      // ===== OBTENER CONTADOR (sin top-level await) =====
      const contadorResult = await req.db.collection('contadores').findOneAndUpdate(
        { _id: 'compra' },
        { $inc: { valor: 1 } },
        { upsert: true, returnDocument: 'after' }
      );
      const codigo = `COM-${String(contadorResult.valor).padStart(6, '0')}`;

      const compra = {
        proveedorId: new ObjectId(proveedorId),
        numero_factura: numero_factura || codigo,
        fecha_emision: new Date(fecha_emision),
        detalles,
        subtotal,
        iva,
        total,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const compraResult = await req.db.collection('compras_v2').insertOne(compra, { session });
      const compraId = compraResult.insertedId;

      // Actualizar stock y kardex
      for (const detalle of detalles) {
        const productoId = new ObjectId(detalle.productoId);
        const cantidad = detalle.cantidad;
        const costoUnitario = detalle.costo_unitario;

        await req.db.collection('productos').updateOne(
          { _id: productoId },
          { 
            $inc: { stock: cantidad },
            $set: { precio_compra: costoUnitario, updatedAt: new Date() }
          },
          { session }
        );

        const productoActualizado = await req.db.collection('productos').findOne({ _id: productoId }, { session });
        const saldoActual = productoActualizado.stock;

        await req.db.collection('kardex').insertOne({
          productoId,
          fecha: new Date(fecha_emision),
          tipo_movimiento: 'compra',
          cantidad,
          costo_unitario: costoUnitario,
          saldo: saldoActual,
          referencia_id: compraId,
          referencia_tipo: 'compra',
          createdAt: new Date()
        }, { session });
      }

      result = compraResult;
    });

    const compraCreada = await req.db.collection('compras_v2').aggregate([
      { $match: { _id: result.insertedId } },
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

    res.status(201).json(compraCreada[0]);
  } catch (err) {
    console.error('Error en compra:', err);
    res.status(500).json({ error: err.message });
  }
});

// Actualizar compra
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const { proveedorId, numero_factura, fecha_emision, detalles, subtotal, iva, total } = req.body;
    const updateData = {
      proveedorId: new ObjectId(proveedorId),
      numero_factura,
      fecha_emision: new Date(fecha_emision),
      detalles,
      subtotal,
      iva,
      total,
      updatedAt: new Date()
    };
    const result = await req.db.collection('compras_v2').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Compra no encontrada' });
    }
    res.json({ message: 'Compra actualizada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar compra
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const result = await req.db.collection('compras_v2').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Compra no encontrada' });
    }
    res.json({ message: 'Compra eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;