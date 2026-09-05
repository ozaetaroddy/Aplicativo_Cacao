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

// Crear compra (con tipo_compra y estado_pago)
router.post('/', async (req, res) => {
  try {
    const {
      proveedorId, numero_factura, fecha_emision,
      detalles, subtotal, iva, total,
      tipo_compra, // 'inventario' | 'gasto'
      estado_pago, // 'pagado' | 'pendiente'
      forma_pago,
      fecha_pago,
      retencion_valor,
      retencion_porcentaje,
      observaciones
    } = req.body;

    if (!ObjectId.isValid(proveedorId)) {
      return res.status(400).json({ error: 'ID de proveedor inválido' });
    }

    const session = req.db.client.startSession();
    let result;

    await session.withTransaction(async () => {
      // Generar código secuencial
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
        // Nuevos campos
        tipo_compra: tipo_compra || 'inventario',
        estado_pago: estado_pago || 'pendiente',
        forma_pago: forma_pago || '',
        fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
        retencion_valor: retencion_valor || 0,
        retencion_porcentaje: retencion_porcentaje || 0,
        observaciones: observaciones || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const compraResult = await req.db.collection('compras_v2').insertOne(compra, { session });
      const compraId = compraResult.insertedId;

      // ===== ACTUALIZAR INVENTARIO SOLO SI ES INVENTARIO =====
      if (tipo_compra === 'inventario') {
        for (const detalle of detalles) {
          const productoId = new ObjectId(detalle.productoId);
          const cantidad = detalle.cantidad;
          const costoUnitario = detalle.costo_unitario;

          // Actualizar stock del producto
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

          // Registrar en kardex
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
      }

      // ===== REGISTRAR RETENCIÓN SI APLICA =====
      if (retencion_valor > 0) {
        await req.db.collection('retenciones').insertOne({
          compraId: compraId,
          proveedorId: new ObjectId(proveedorId),
          numero_factura: compra.numero_factura,
          fecha_emision: new Date(fecha_emision),
          valor_retenido: retencion_valor,
          porcentaje: retencion_porcentaje || 0,
          tipo: 'compra',
          createdAt: new Date()
        }, { session });
      }

      result = compraResult;
    });

    // Obtener compra creada con datos completos
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

// Actualizar compra (incluyendo estado de pago)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const {
      proveedorId, numero_factura, fecha_emision,
      detalles, subtotal, iva, total,
      tipo_compra, estado_pago, forma_pago,
      fecha_pago, retencion_valor, retencion_porcentaje,
      observaciones
    } = req.body;
    const updateData = {
      proveedorId: new ObjectId(proveedorId),
      numero_factura,
      fecha_emision: new Date(fecha_emision),
      detalles,
      subtotal,
      iva,
      total,
      tipo_compra,
      estado_pago,
      forma_pago,
      fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
      retencion_valor: retencion_valor || 0,
      retencion_porcentaje: retencion_porcentaje || 0,
      observaciones: observaciones || '',
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

// ===== NUEVO: Reporte mensual de compras para declaración =====
router.get('/reporte-mensual/:mes/:anio', async (req, res) => {
  try {
    const { mes, anio } = req.params;
    const inicio = new Date(anio, mes - 1, 1);
    const fin = new Date(anio, mes, 0);
    fin.setHours(23, 59, 59, 999);

    const compras = await req.db.collection('compras_v2').aggregate([
      {
        $match: {
          fecha_emision: { $gte: inicio, $lte: fin }
        }
      },
      {
        $lookup: {
          from: 'proveedores',
          localField: 'proveedorId',
          foreignField: '_id',
          as: 'proveedor'
        }
      },
      { $unwind: '$proveedor' },
      {
        $group: {
          _id: null,
          totalComprasInventario: { $sum: { $cond: [{ $eq: ['$tipo_compra', 'inventario'] }, '$total', 0] } },
          totalComprasGasto: { $sum: { $cond: [{ $eq: ['$tipo_compra', 'gasto'] }, '$total', 0] } },
          totalIva: { $sum: '$iva' },
          totalRetenido: { $sum: '$retencion_valor' },
          compras: { $push: '$$ROOT' }
        }
      }
    ]).toArray();

    const reporte = compras.length > 0 ? compras[0] : {
      totalComprasInventario: 0,
      totalComprasGasto: 0,
      totalIva: 0,
      totalRetenido: 0,
      compras: []
    };
    res.json(reporte);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;