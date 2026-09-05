const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// ===== OBTENER TODAS LAS COMPRAS =====
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

// ===== OBTENER COMPRA POR ID =====
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

// ===== CREAR COMPRA =====
router.post('/', async (req, res) => {
  try {
    const {
      proveedorId, numero_factura, fecha_emision,
      detalles, subtotal, iva, total,
      tipo_compra, estado_pago, forma_pago,
      fecha_pago, retencion_valor, retencion_porcentaje,
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

// ===== ACTUALIZAR COMPRA =====
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

// ===== ELIMINAR COMPRA =====
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

// ===== REPORTE MENSUAL PARA DECLARACIÓN =====
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

// ===== IMPORTAR FACTURAS DESDE TXT (CON TIPO INDIVIDUAL) =====
router.post('/importar-txt', async (req, res) => {
  try {
    const { lineas } = req.body;
    if (!lineas || !Array.isArray(lineas) || lineas.length === 0) {
      return res.status(400).json({ error: 'No se enviaron líneas para importar' });
    }

    let importados = 0;
    const errores = [];
    const resultados = [];

    // Procesar cada línea
    for (const linea of lineas) {
      try {
        const {
          ruc,
          razonSocial,
          fechaEmision,
          total,
          valorSinImpuestos,
          iva,
          tipo_compra // <--- TIPO INDIVIDUAL (inventario | gasto)
        } = linea;

        if (!ruc || !total || total === 0) {
          errores.push(`Línea sin RUC o total: ${JSON.stringify(linea)}`);
          continue;
        }

        // Buscar proveedor por RUC (si no existe, crearlo)
        let proveedor = await req.db.collection('proveedores').findOne({ ruc });
        if (!proveedor) {
          // Crear proveedor automáticamente
          const nuevoProveedor = {
            nombre: razonSocial || `Proveedor ${ruc}`,
            ruc: ruc,
            telefono: '',
            email: '',
            direccion: '',
            createdAt: new Date()
          };
          const resultProv = await req.db.collection('proveedores').insertOne(nuevoProveedor);
          proveedor = { ...nuevoProveedor, _id: resultProv.insertedId };
          console.log(`✅ Proveedor creado: ${razonSocial} (RUC: ${ruc})`);
        }

        // Crear compra
        const session = req.db.client.startSession();
        await session.withTransaction(async () => {
          // Generar código secuencial
          const contadorResult = await req.db.collection('contadores').findOneAndUpdate(
            { _id: 'compra' },
            { $inc: { valor: 1 } },
            { upsert: true, returnDocument: 'after' }
          );
          const codigo = `COM-${String(contadorResult.valor).padStart(6, '0')}`;

          const compraData = {
            proveedorId: proveedor._id,
            numero_factura: codigo,
            fecha_emision: new Date(fechaEmision || new Date()),
            detalles: [
              {
                productoId: null, // Se asignará manualmente
                cantidad: 1,
                costo_unitario: parseFloat(total) || 0,
                aplica_iva: parseFloat(iva) > 0
              }
            ],
            subtotal: parseFloat(valorSinImpuestos) || 0,
            iva: parseFloat(iva) || 0,
            total: parseFloat(total) || 0,
            tipo_compra: tipo_compra || 'inventario', // <--- TIPO INDIVIDUAL
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

          // Si es inventario, actualizar stock (buscar producto por nombre o usar genérico)
          if (tipo_compra === 'inventario') {
            // Buscar un producto de inventario (ej: "CACAO")
            const producto = await req.db.collection('productos').findOne({ nombre: { $regex: 'CACAO', $options: 'i' } });
            if (producto) {
              await req.db.collection('productos').updateOne(
                { _id: producto._id },
                {
                  $inc: { stock: 1 },
                  $set: { precio_compra: parseFloat(total), updatedAt: new Date() }
                },
                { session }
              );
              const productoActualizado = await req.db.collection('productos').findOne({ _id: producto._id }, { session });
              await req.db.collection('kardex').insertOne({
                productoId: producto._id,
                fecha: compraData.fecha_emision,
                tipo_movimiento: 'compra',
                cantidad: 1,
                costo_unitario: parseFloat(total),
                saldo: productoActualizado.stock,
                referencia_id: compraId,
                referencia_tipo: 'compra',
                createdAt: new Date()
              }, { session });
            } else {
              errores.push(`No se encontró producto para inventario (RUC: ${ruc})`);
            }
          }

          resultados.push({ compraId, numero: compraData.numero_factura });
          importados++;
        });
      } catch (e) {
        errores.push(`Error en línea: ${e.message}`);
      }
    }

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