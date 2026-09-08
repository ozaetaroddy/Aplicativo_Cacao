const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body, validationResult } = require('express-validator');

// Validaciones para crear/actualizar compra
const validarCompra = [
  body('proveedorId').isMongoId().withMessage('ID de proveedor inválido'),
  body('fecha_emision').isISO8601().withMessage('Fecha inválida'),
  body('detalles').isArray({ min: 1 }).withMessage('Debe incluir al menos un detalle'),
  body('subtotal').isNumeric().withMessage('Subtotal debe ser número'),
  body('iva').isNumeric().withMessage('IVA debe ser número'),
  body('total').isNumeric().withMessage('Total debe ser número'),
];

// OBTENER TODAS
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

// OBTENER POR ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
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
    if (compra.length === 0) return res.status(404).json({ error: 'Compra no encontrada' });
    res.json(compra[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREAR
router.post('/', validarCompra, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const {
      proveedorId, numero_factura, fecha_emision,
      detalles, subtotal, iva, total,
      tipo_compra, estado_pago, forma_pago,
      fecha_pago, retencion_valor, retencion_porcentaje,
      observaciones
    } = req.body;

    const session = req.db.client.startSession();
    let result;

    await session.withTransaction(async () => {
      // Generar código
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

      // Actualizar inventario si es inventario
      if (tipo_compra === 'inventario') {
        for (const detalle of detalles) {
          const productoId = new ObjectId(detalle.productoId);
          const producto = await req.db.collection('productos').findOne({ _id: productoId }, { session });
          if (!producto) throw new Error(`Producto ${detalle.productoId} no encontrado`);

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
          await req.db.collection('kardex').insertOne({
            productoId,
            fecha: new Date(fecha_emision),
            tipo_movimiento: 'compra',
            cantidad,
            costo_unitario: costoUnitario,
            saldo: productoActualizado.stock,
            referencia_id: compraId,
            referencia_tipo: 'compra',
            createdAt: new Date()
          }, { session });
        }
      }

      // Registrar retención si aplica
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

    // Emitir evento socket
    if (req.io) req.io.emit('nueva-compra', compraCreada[0]);

    res.status(201).json(compraCreada[0]);
  } catch (err) {
    console.error('Error en compra:', err);
    res.status(500).json({ error: err.message });
  }
});

// ACTUALIZAR (con ajuste de inventario)
router.put('/:id', validarCompra, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const compraActual = await req.db.collection('compras_v2').findOne({ _id: new ObjectId(id) });
    if (!compraActual) return res.status(404).json({ error: 'Compra no encontrada' });

    const {
      proveedorId, numero_factura, fecha_emision,
      detalles, subtotal, iva, total,
      tipo_compra, estado_pago, forma_pago,
      fecha_pago, retencion_valor, retencion_porcentaje,
      observaciones
    } = req.body;

    const session = req.db.client.startSession();
    await session.withTransaction(async () => {
      // Si la compra anterior era de inventario, revertir su efecto
      if (compraActual.tipo_compra === 'inventario') {
        for (const detalle of compraActual.detalles) {
          const productoId = new ObjectId(detalle.productoId);
          await req.db.collection('productos').updateOne(
            { _id: productoId },
            { $inc: { stock: -detalle.cantidad } },
            { session }
          );
          // Eliminar movimientos de kardex asociados a esta compra
          await req.db.collection('kardex').deleteMany({
            referencia_id: new ObjectId(id),
            referencia_tipo: 'compra'
          }, { session });
        }
      }

      // Actualizar la compra
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
      await req.db.collection('compras_v2').updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { session }
      );

      // Aplicar nuevo efecto si es inventario
      if (tipo_compra === 'inventario') {
        for (const detalle of detalles) {
          const productoId = new ObjectId(detalle.productoId);
          const producto = await req.db.collection('productos').findOne({ _id: productoId }, { session });
          if (!producto) throw new Error(`Producto ${detalle.productoId} no encontrado`);

          await req.db.collection('productos').updateOne(
            { _id: productoId },
            {
              $inc: { stock: detalle.cantidad },
              $set: { precio_compra: detalle.costo_unitario, updatedAt: new Date() }
            },
            { session }
          );

          const productoActualizado = await req.db.collection('productos').findOne({ _id: productoId }, { session });
          await req.db.collection('kardex').insertOne({
            productoId,
            fecha: new Date(fecha_emision),
            tipo_movimiento: 'compra',
            cantidad: detalle.cantidad,
            costo_unitario: detalle.costo_unitario,
            saldo: productoActualizado.stock,
            referencia_id: new ObjectId(id),
            referencia_tipo: 'compra',
            createdAt: new Date()
          }, { session });
        }
      }

      // Actualizar retención (eliminar y recrear)
      await req.db.collection('retenciones').deleteMany({ compraId: new ObjectId(id) }, { session });
      if (retencion_valor > 0) {
        await req.db.collection('retenciones').insertOne({
          compraId: new ObjectId(id),
          proveedorId: new ObjectId(proveedorId),
          numero_factura,
          fecha_emision: new Date(fecha_emision),
          valor_retenido: retencion_valor,
          porcentaje: retencion_porcentaje || 0,
          tipo: 'compra',
          createdAt: new Date()
        }, { session });
      }
    });

    // Obtener compra actualizada
    const compraActualizada = await req.db.collection('compras_v2').aggregate([
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

    if (req.io) req.io.emit('compra-actualizada', compraActualizada[0]);
    res.json(compraActualizada[0]);
  } catch (err) {
    console.error('Error actualizando compra:', err);
    res.status(500).json({ error: err.message });
  }
});

// ELIMINAR (revertir inventario)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const compra = await req.db.collection('compras_v2').findOne({ _id: new ObjectId(id) });
    if (!compra) return res.status(404).json({ error: 'Compra no encontrada' });

    const session = req.db.client.startSession();
    await session.withTransaction(async () => {
      // Revertir inventario si era inventario
      if (compra.tipo_compra === 'inventario') {
        for (const detalle of compra.detalles) {
          const productoId = new ObjectId(detalle.productoId);
          await req.db.collection('productos').updateOne(
            { _id: productoId },
            { $inc: { stock: -detalle.cantidad } },
            { session }
          );
        }
        // Eliminar movimientos de kardex
        await req.db.collection('kardex').deleteMany({
          referencia_id: new ObjectId(id),
          referencia_tipo: 'compra'
        }, { session });
      }

      // Eliminar retenciones asociadas
      await req.db.collection('retenciones').deleteMany({ compraId: new ObjectId(id) }, { session });

      // Eliminar la compra
      await req.db.collection('compras_v2').deleteOne({ _id: new ObjectId(id) }, { session });
    });

    if (req.io) req.io.emit('compra-eliminada', { id });
    res.json({ message: 'Compra eliminada correctamente' });
  } catch (err) {
    console.error('Error eliminando compra:', err);
    res.status(500).json({ error: err.message });
  }
});

// REPORTE MENSUAL
router.get('/reporte-mensual/:mes/:anio', async (req, res) => {
  try {
    const { mes, anio } = req.params;
    const inicio = new Date(anio, mes - 1, 1);
    const fin = new Date(anio, mes, 0);
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

// IMPORTAR TXT (mejorado con transacción por lote)
router.post('/importar-txt', async (req, res) => {
  try {
    const { lineas } = req.body;
    if (!lineas || !Array.isArray(lineas) || lineas.length === 0) {
      return res.status(400).json({ error: 'No se enviaron líneas para importar' });
    }

    const session = req.db.client.startSession();
    const resultados = [];
    const errores = [];
    let importados = 0;

    await session.withTransaction(async () => {
      for (const linea of lineas) {
        try {
          const {
            ruc,
            razonSocial,
            fechaEmision,
            total,
            valorSinImpuestos,
            iva,
            tipo_compra,
            codigoProducto
          } = linea;

          if (!ruc || !total || total === 0) {
            errores.push(`Línea sin RUC o total: ${JSON.stringify(linea)}`);
            continue;
          }

          // Buscar proveedor (o crearlo)
          let proveedor = await req.db.collection('proveedores').findOne({ ruc }, { session });
          if (!proveedor) {
            const nuevoProveedor = {
              nombre: razonSocial || `Proveedor ${ruc}`,
              ruc: ruc,
              telefono: '',
              email: '',
              direccion: '',
              createdAt: new Date()
            };
            const resultProv = await req.db.collection('proveedores').insertOne(nuevoProveedor, { session });
            proveedor = { ...nuevoProveedor, _id: resultProv.insertedId };
          }

          // Determinar producto
          let productoId = null;
          if (codigoProducto) {
            const prod = await req.db.collection('productos').findOne({ codigo: codigoProducto }, { session });
            if (prod) productoId = prod._id;
          }
          if (!productoId) {
            const prod = await req.db.collection('productos').findOne({ nombre: { $regex: 'CACAO', $options: 'i' } }, { session });
            if (prod) productoId = prod._id;
          }
          if (!productoId) {
            errores.push(`No se encontró producto para la compra (RUC: ${ruc})`);
            continue;
          }

          // Generar código de compra
          const contadorResult = await req.db.collection('contadores').findOneAndUpdate(
            { _id: 'compra' },
            { $inc: { valor: 1 } },
            { upsert: true, returnDocument: 'after', session }
          );
          const codigo = `COM-${String(contadorResult.valor).padStart(6, '0')}`;

          const compraData = {
            proveedorId: proveedor._id,
            numero_factura: codigo,
            fecha_emision: new Date(fechaEmision || new Date()),
            detalles: [
              {
                productoId: productoId,
                cantidad: 1,
                costo_unitario: parseFloat(total) || 0,
                aplica_iva: parseFloat(iva) > 0
              }
            ],
            subtotal: parseFloat(valorSinImpuestos) || 0,
            iva: parseFloat(iva) || 0,
            total: parseFloat(total) || 0,
            tipo_compra: tipo_compra || 'inventario',
            estado_pago: 'pendiente',
            forma_pago: '',
            fecha_pago: null,
            retencion_valor: 0,
            retencion_porcentaje: 0,
            observaciones: `Importado desde TXT. Emisor: ${razonSocial}`,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          const compraResult = await req.db.collection('compras_v2').insertOne(compraData, { session });
          const compraId = compraResult.insertedId;

          if (tipo_compra === 'inventario') {
            await req.db.collection('productos').updateOne(
              { _id: productoId },
              {
                $inc: { stock: 1 },
                $set: { precio_compra: parseFloat(total), updatedAt: new Date() }
              },
              { session }
            );
            const productoActualizado = await req.db.collection('productos').findOne({ _id: productoId }, { session });
            await req.db.collection('kardex').insertOne({
              productoId,
              fecha: compraData.fecha_emision,
              tipo_movimiento: 'compra',
              cantidad: 1,
              costo_unitario: parseFloat(total),
              saldo: productoActualizado.stock,
              referencia_id: compraId,
              referencia_tipo: 'compra',
              createdAt: new Date()
            }, { session });
          }

          resultados.push({ compraId, numero: compraData.numero_factura });
          importados++;
        } catch (lineaError) {
          // Si una línea falla, lanzamos error para revertir toda la transacción
          throw new Error(`Error en línea: ${lineaError.message}`);
        }
      }
    });

    res.json({
      success: true,
      importados,
      errores,
      resultados
    });
  } catch (err) {
    console.error('Error en importación:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;