const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Obtener contador para 'compra'
const contadorResult = await req.db.collection('contadores').findOneAndUpdate(
  { _id: 'compra' },
  { $inc: { valor: 1 } },
  { upsert: true, returnDocument: 'after' }
);
const codigo = `COM-${String(contadorResult.valor).padStart(6, '0')}`;
compra.numero_factura = compra.numero_factura || codigo;

// Obtener todas las compras (con populate de proveedor)
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
      { $sort: { fecha: -1 } }
    ]).toArray();
    res.json(compras);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear compra con actualización de stock y kardex
router.post('/', async (req, res) => {
  try {
    const { proveedorId, numero_factura, fecha_emision, detalles, subtotal, iva, total } = req.body;

    // Validar que proveedorId sea válido
    if (!ObjectId.isValid(proveedorId)) {
      return res.status(400).json({ error: 'ID de proveedor inválido' });
    }

    // Iniciar sesión de MongoDB para transacción
    const session = req.db.client.startSession();
    let result;

    await session.withTransaction(async () => {
      // 1. Insertar la compra
      const compra = {
        proveedorId: new ObjectId(proveedorId),
        numero_factura,
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

      // 2. Actualizar stock de cada producto y registrar kardex
      for (const detalle of detalles) {
        const productoId = new ObjectId(detalle.productoId);
        const cantidad = detalle.cantidad;
        const costoUnitario = detalle.costo_unitario;

        // Actualizar stock del producto (sumar)
        await req.db.collection('productos').updateOne(
          { _id: productoId },
          { 
            $inc: { stock: cantidad },
            $set: { precio_compra: costoUnitario, updatedAt: new Date() }
          },
          { session }
        );

        // Obtener el stock actualizado para el kardex
        const productoActualizado = await req.db.collection('productos').findOne({ _id: productoId }, { session });
        const saldoActual = productoActualizado.stock;

        // Insertar en kardex
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

    // Obtener la compra con populate para devolver
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

module.exports = router;