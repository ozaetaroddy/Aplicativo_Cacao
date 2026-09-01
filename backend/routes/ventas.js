const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Obtener todas las ventas
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
      { $sort: { fecha_emision: -1 } }
    ]).toArray();
    res.json(ventas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener venta por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const venta = await req.db.collection('ventas_v2').aggregate([
      { $match: { _id: new ObjectId(id) } },
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
    if (venta.length === 0) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    res.json(venta[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear venta
router.post('/', async (req, res) => {
  try {
    const { clienteId, numero_factura, fecha_emision, tipo_documento, detalles, subtotal, iva, total, numero_exportacion, pais_destino, numero_guia, transportista, placa, numero_retencion, porcentaje_retencion } = req.body;

    if (!ObjectId.isValid(clienteId)) {
      return res.status(400).json({ error: 'ID de cliente inválido' });
    }

    const session = req.db.client.startSession();
    let result;

    await session.withTransaction(async () => {
      // ===== GENERAR CÓDIGO SECUENCIAL =====
      const tipoDoc = tipo_documento || 'factura';
      
      // Obtener contador para el número de documento principal
      const contadorResult = await req.db.collection('contadores').findOneAndUpdate(
        { _id: tipoDoc },
        { $inc: { valor: 1 } },
        { upsert: true, returnDocument: 'after' }
      );
      const prefijos = {
        'factura': 'FAC',
        'guia_remision': 'GUI',
        'exportacion': 'EXP',
        'reembolso': 'REB',
        'retencion': 'RET',
        'liquidacion': 'LIQ',
        'nota_credito': 'NCR',
        'proforma': 'PRO'
      };
      const prefijo = prefijos[tipoDoc] || 'DOC';
      const codigo = `${prefijo}-${String(contadorResult.valor).padStart(6, '0')}`;

      // ===== GENERAR NÚMERO DE EXPORTACIÓN (si aplica) =====
      let exportacionCodigo = null;
      if (tipoDoc === 'exportacion') {
        const expContador = await req.db.collection('contadores').findOneAndUpdate(
          { _id: 'exportacion_numero' },
          { $inc: { valor: 1 } },
          { upsert: true, returnDocument: 'after' }
        );
        exportacionCodigo = `EXP-${String(expContador.valor).padStart(6, '0')}`;
      }

      const venta = {
        clienteId: new ObjectId(clienteId),
        numero_factura: numero_factura || codigo,
        fecha_emision: new Date(fecha_emision),
        tipo_documento: tipoDoc,
        detalles,
        subtotal,
        iva,
        total,
        // Campos especiales
        numero_exportacion: numero_exportacion || exportacionCodigo,
        pais_destino: pais_destino || '',
        numero_guia: numero_guia || '',
        transportista: transportista || '',
        placa: placa || '',
        numero_retencion: numero_retencion || '',
        porcentaje_retencion: porcentaje_retencion || 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const ventaResult = await req.db.collection('ventas_v2').insertOne(venta, { session });
      const ventaId = ventaResult.insertedId;

      // Actualizar stock y kardex (solo si no es nota de crédito)
      if (tipoDoc !== 'nota_credito') {
        for (const detalle of detalles) {
          const productoId = new ObjectId(detalle.productoId);
          const cantidad = detalle.cantidad;
          const precioUnitario = detalle.precio_unitario;

          await req.db.collection('productos').updateOne(
            { _id: productoId },
            { 
              $inc: { stock: -cantidad },
              $set: { updatedAt: new Date() }
            },
            { session }
          );

          const productoActualizado = await req.db.collection('productos').findOne({ _id: productoId }, { session });
          const saldoActual = productoActualizado.stock;

          await req.db.collection('kardex').insertOne({
            productoId,
            fecha: new Date(fecha_emision),
            tipo_movimiento: 'venta',
            cantidad: -cantidad,
            costo_unitario: precioUnitario,
            saldo: saldoActual,
            referencia_id: ventaId,
            referencia_tipo: 'venta',
            createdAt: new Date()
          }, { session });
        }
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

// Actualizar venta
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const { clienteId, numero_factura, fecha_emision, tipo_documento, detalles, subtotal, iva, total, numero_exportacion, pais_destino, numero_guia, transportista, placa, numero_retencion, porcentaje_retencion } = req.body;
    const updateData = {
      clienteId: new ObjectId(clienteId),
      numero_factura,
      fecha_emision: new Date(fecha_emision),
      tipo_documento: tipo_documento || 'factura',
      detalles,
      subtotal,
      iva,
      total,
      numero_exportacion,
      pais_destino,
      numero_guia,
      transportista,
      placa,
      numero_retencion,
      porcentaje_retencion,
      updatedAt: new Date()
    };
    const result = await req.db.collection('ventas_v2').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    res.json({ message: 'Venta actualizada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar venta
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const result = await req.db.collection('ventas_v2').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    res.json({ message: 'Venta eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;