const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

router.get('/', async (req, res) => {
  try {
    const ventas = await req.db.collection('ventas_v2').aggregate([
      {
        $lookup: {
          from: 'clientes',
          localField: 'clienteId',
          foreignField: '_id',
          as: 'cliente'
        }
      },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
      { $sort: { fecha: -1 } }
    ]).toArray();
    res.json(ventas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { clienteId, numero_factura, fecha_emision, tipo_documento, detalles, subtotal, iva, total } = req.body;

    if (!ObjectId.isValid(clienteId)) {
      return res.status(400).json({ error: 'ID de cliente inválido' });
    }

    const session = req.db.client.startSession();
    let result;

    await session.withTransaction(async () => {
      // 1. Insertar venta
      const venta = {
        clienteId: new ObjectId(clienteId),
        numero_factura,
        fecha_emision: new Date(fecha_emision),
        tipo_documento: tipo_documento || 'factura',
        detalles,
        subtotal,
        iva,
        total,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const ventaResult = await req.db.collection('ventas_v2').insertOne(venta, { session });
      const ventaId = ventaResult.insertedId;

      // 2. Si es factura o nota de venta, restar stock y registrar kardex
      if (tipo_documento !== 'nota_credito') {
        for (const detalle of detalles) {
          const productoId = new ObjectId(detalle.productoId);
          const cantidad = detalle.cantidad;
          const precioUnitario = detalle.precio_unitario;

          // Restar stock
          await req.db.collection('productos').updateOne(
            { _id: productoId },
            { 
              $inc: { stock: -cantidad },
              $set: { updatedAt: new Date() }
            },
            { session }
          );

          // Obtener stock actualizado
          const productoActualizado = await req.db.collection('productos').findOne({ _id: productoId }, { session });
          const saldoActual = productoActualizado.stock;

          // Insertar kardex (cantidad negativa)
          await req.db.collection('kardex').insertOne({
            productoId,
            fecha: new Date(fecha_emision),
            tipo_movimiento: 'venta',
            cantidad: -cantidad,
            costo_unitario: precioUnitario, // Usamos precio de venta como referencia
            saldo: saldoActual,
            referencia_id: ventaId,
            referencia_tipo: 'venta',
            createdAt: new Date()
          }, { session });
        }
      } else {
        // Nota de crédito: no afecta stock (o ajuste según lógica)
        // Aquí podrías sumar stock si devuelven productos
      }

      result = ventaResult;
    });

    const ventaCreada = await req.db.collection('ventas_v2').aggregate([
      { $match: { _id: result.insertedId } },
      {
        $lookup: {
          from: 'clientes',
          localField: 'clienteId',
          foreignField: '_id',
          as: 'cliente'
        }
      },
      { $unwind: '$cliente' }
    ]).toArray();

    res.status(201).json(ventaCreada[0]);
  } catch (err) {
    console.error('Error en venta:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;