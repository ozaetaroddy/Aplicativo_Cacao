const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body, validationResult } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');
const { verificarPeriodoAbierto } = require('../utils/periodos');
const { generarClaveAcceso, formatearSerie, descomponerClave, validarClave } = require('../utils/claveAcceso');

const validarVenta = [
  body('clienteId').isMongoId().withMessage('ID de cliente inválido'),
  body('fecha_emision').isISO8601().withMessage('Fecha inválida'),
  body('detalles').isArray({ min: 1 }).withMessage('Debe incluir al menos un detalle'),
  body('subtotal').isNumeric().withMessage('Subtotal debe ser número'),
  body('iva').isNumeric().withMessage('IVA debe ser número'),
  body('total').isNumeric().withMessage('Total debe ser número'),
];

// Mapeo tipo_documento interno → código SRI
const TIPO_COMPROBANTE_SRI = {
  'factura': '01',
  'liquidacion': '03',
  'nota_credito': '04',
  'nota_debito': '05',
  'guia_remision': '06',
  'retencion': '07',
  'exportacion': '01',
  'reembolso': '01',
  'proforma': null // Proforma no se envía al SRI
};

// Documentos que generan clave de acceso
const DOCS_CON_CLAVE = ['factura', 'liquidacion', 'nota_credito', 'nota_debito', 'guia_remision', 'retencion', 'exportacion', 'reembolso'];

// OBTENER TODAS (con paginación, búsqueda y filtros)
router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (req.query.search || '').trim();
    const { desde, hasta, tipo_documento, estado_pago } = req.query;

    const matchStage = {};
    if (desde || hasta) {
      matchStage.fecha_emision = {};
      if (desde) {
        const d = new Date(desde);
        if (!isNaN(d)) matchStage.fecha_emision.$gte = d;
      }
      if (hasta) {
        const h = new Date(hasta);
        if (!isNaN(h)) {
          h.setHours(23, 59, 59, 999);
          matchStage.fecha_emision.$lte = h;
        }
      }
    }
    if (tipo_documento) matchStage.tipo_documento = tipo_documento;
    if (estado_pago) matchStage.estado_pago = estado_pago;

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'clientes',
          localField: 'clienteId',
          foreignField: '_id',
          as: 'cliente'
        }
      },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } }
    ];

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      pipeline.push({
        $match: {
          $or: [
            { numero_factura: regex },
            { clave_acceso: regex },
            { 'cliente.nombre': regex },
            { 'cliente.ruc': regex }
          ]
        }
      });
    }

    const sort = parseSort(req.query);

    if (!paginar) {
      pipeline.push({ $sort: sort });
      const ventas = await req.db.collection('ventas_v2').aggregate(pipeline).toArray();
      return res.json(ventas);
    }

    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await req.db.collection('ventas_v2').aggregate(countPipeline).toArray();
    const total = countResult[0]?.total || 0;

    pipeline.push({ $sort: sort });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const ventas = await req.db.collection('ventas_v2').aggregate(pipeline).toArray();

    res.json({
      data: ventas,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Error listando ventas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== VALIDAR CLAVE DE ACCESO =====
router.post('/validar-clave', async (req, res) => {
  try {
    const { clave } = req.body;
    const valida = validarClave(clave);
    const partes = descomponerClave(clave);
    res.json({ valida, partes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
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
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } }
    ]).toArray();
    if (venta.length === 0) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json(venta[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verificarPeriodoAbierto(), validarVenta, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const {
      clienteId, numero_factura, fecha_emision, tipo_documento,
      detalles, subtotal, iva, total,
      numero_guia, transportista, placa,
      numero_exportacion, pais_destino,
      numero_retencion, porcentaje_retencion,
      establecimiento, nombre_comercial, punto_emision,
      transportista_identificacion, transportista_tipo,
      transportista_razon_social, transportista_correo,
      direccion_partida, inicio_transporte, fin_transporte, placa_transporte,
      destinatario_identificacion, destinatario_tipo, destinatario_razon_social,
      destinatario_direccion, ruta, motivo, documento_aduana,
      comprobante_tipo_emision, comprobante_documento, comprobante_clave_acceso,
      comprobante_numero_autorizacion, comprobante_numero, comprobante_fecha_emision,
      forma_pago, estado_pago, fecha_pago, observaciones
    } = req.body;

    const tipoDoc = tipo_documento || 'factura';

    // ===== CARGAR CONFIGURACIÓN DE LA EMPRESA =====
    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });

    const session = req.db.client.startSession();
    let result;

    await session.withTransaction(async () => {
      for (const detalle of detalles) {
        const producto = await req.db.collection('productos').findOne({ _id: new ObjectId(detalle.productoId) }, { session });
        if (!producto) throw new Error(`Producto ${detalle.productoId} no existe`);
        if (producto.stock < detalle.cantidad) {
          throw new Error(`Stock insuficiente para producto ${producto.nombre}. Disponible: ${producto.stock}, requerido: ${detalle.cantidad}`);
        }
      }

      // Generar secuencial desde el contador
      const contadorResult = await req.db.collection('contadores').findOneAndUpdate(
        { _id: tipoDoc },
        { $inc: { valor: 1 } },
        { upsert: true, returnDocument: 'after', session }
      );

      const prefijos = {
        'factura': 'FAC', 'guia_remision': 'GUI', 'exportacion': 'EXP', 'reembolso': 'REB',
        'retencion': 'RET', 'liquidacion': 'LIQ', 'nota_credito': 'NCR', 'proforma': 'PRO'
      };
      const prefijo = prefijos[tipoDoc] || 'DOC';
      const codigo = `${prefijo}-${String(contadorResult.valor).padStart(6, '0')}`;

      // ===== GENERAR CLAVE DE ACCESO =====
      let claveAcceso = null;
      let partesClave = null;
      let serieFormateada = null;
      let numeroSecuencial = null;

      const generaClave = DOCS_CON_CLAVE.includes(tipoDoc) && config?.ruc && config.ruc.length === 13;

      if (generaClave) {
        const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';

        // Serie: priorizar la que venga del formulario, si no, la de configuración
        const est = establecimiento || config.establecimiento || '001';
        const pe = punto_emision || config.punto_emision || '001';
        serieFormateada = formatearSerie(est, pe);

        // Secuencial de 9 dígitos (usamos el contador de valor)
        numeroSecuencial = contadorResult.valor;

        try {
          claveAcceso = generarClaveAcceso({
            fechaEmision: new Date(fecha_emision),
            tipoComprobante: codigoSRI,
            ruc: config.ruc,
            ambiente: config.ambiente || '1',
            serie: serieFormateada,
            secuencial: numeroSecuencial,
            tipoEmision: config.tipo_emision || '1'
          });
          partesClave = descomponerClave(claveAcceso);
        } catch (e) {
          console.error('Error generando clave de acceso:', e.message);
          // Continuar sin clave si falla (para no bloquear la venta)
        }
      }

      let exportacionCodigo = null;
      if (tipoDoc === 'exportacion') {
        const expContador = await req.db.collection('contadores').findOneAndUpdate(
          { _id: 'exportacion_numero' },
          { $inc: { valor: 1 } },
          { upsert: true, returnDocument: 'after', session }
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
        // ===== CAMPOS SRI =====
        clave_acceso: claveAcceso || '',
        numero_autorizacion: '', // Se llena cuando el SRI autoriza
        estado_sri: generaClave ? 'PENDIENTE' : 'NO_APLICA',
        ambiente_sri: config?.ambiente || '1',
        serie: serieFormateada || '',
        secuencial_sri: numeroSecuencial ? String(numeroSecuencial).padStart(9, '0') : '',
        ruc_emisor: config?.ruc || '',
        razon_social_emisor: config?.razon_social || '',
        // ===== CAMPOS EXISTENTES =====
        numero_guia: numero_guia || '',
        transportista: transportista || '',
        placa: placa || '',
        numero_exportacion: numero_exportacion || exportacionCodigo,
        pais_destino: pais_destino || '',
        numero_retencion: numero_retencion || '',
        porcentaje_retencion: porcentaje_retencion || 0,
        establecimiento: establecimiento || config?.establecimiento || '',
        nombre_comercial: nombre_comercial || config?.nombre_comercial || '',
        punto_emision: punto_emision || config?.punto_emision || '',
        transportista_identificacion: transportista_identificacion || '',
        transportista_tipo: transportista_tipo || '',
        transportista_razon_social: transportista_razon_social || '',
        transportista_correo: transportista_correo || '',
        direccion_partida: direccion_partida || '',
        inicio_transporte: inicio_transporte || '',
        fin_transporte: fin_transporte || '',
        placa_transporte: placa_transporte || '',
        destinatario_identificacion: destinatario_identificacion || '',
        destinatario_tipo: destinatario_tipo || '',
        destinatario_razon_social: destinatario_razon_social || '',
        destinatario_direccion: destinatario_direccion || '',
        ruta: ruta || '',
        motivo: motivo || '',
        documento_aduana: documento_aduana || '',
        comprobante_tipo_emision: comprobante_tipo_emision || '',
        comprobante_documento: comprobante_documento || '',
        comprobante_clave_acceso: comprobante_clave_acceso || '',
        comprobante_numero_autorizacion: comprobante_numero_autorizacion || '',
        comprobante_numero: comprobante_numero || '',
        comprobante_fecha_emision: comprobante_fecha_emision || '',
        forma_pago: forma_pago || '',
        estado_pago: estado_pago || 'pendiente',
        fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
        observaciones: observaciones || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const ventaResult = await req.db.collection('ventas_v2').insertOne(venta, { session });
      const ventaId = ventaResult.insertedId;

      if (tipoDoc !== 'nota_credito' && tipoDoc !== 'guia_remision') {
        for (const detalle of detalles) {
          const productoId = new ObjectId(detalle.productoId);
          const cantidad = detalle.cantidad;
          const precioUnitario = detalle.precio_unitario;

          await req.db.collection('productos').updateOne(
            { _id: productoId },
            { $inc: { stock: -cantidad }, $set: { updatedAt: new Date() } },
            { session }
          );

          const productoActualizado = await req.db.collection('productos').findOne({ _id: productoId }, { session });

          await req.db.collection('kardex').insertOne({
            productoId,
            fecha: new Date(fecha_emision),
            tipo_movimiento: 'venta',
            cantidad: -cantidad,
            costo_unitario: precioUnitario,
            saldo: productoActualizado.stock,
            referencia_id: ventaId,
            referencia_tipo: 'venta',
            createdAt: new Date()
          }, { session });
        }
      }

      result = { ventaResult, claveAcceso, partesClave };
    });

    const ventaCreada = await req.db.collection('ventas_v2').aggregate([
      { $match: { _id: result.ventaResult.insertedId } },
      {
        $lookup: {
          from: 'clientes',
          localField: 'clienteId',
          foreignField: '_id',
          as: 'cliente'
        }
      },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } }
    ]).toArray();

    await logAudit(req.db, req, {
      accion: 'crear',
      coleccion: 'ventas',
      documentoId: result.ventaResult.insertedId,
      documentoNumero: ventaCreada[0]?.numero_factura || '',
      datosNuevos: ventaCreada[0],
      detalle: `Venta creada: ${ventaCreada[0]?.numero_factura || ''} por $${(ventaCreada[0]?.total || 0).toFixed(2)}${result.claveAcceso ? ' (Clave: ' + result.claveAcceso.substring(0, 20) + '...)' : ''}`
    });

    if (req.io) req.io.emit('nueva-venta', ventaCreada[0]);

    res.status(201).json({
      ...ventaCreada[0],
      clave_acceso_partes: result.partesClave
    });
  } catch (err) {
    console.error('Error en venta:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verificarPeriodoAbierto(), validarVenta, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const ventaActual = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!ventaActual) return res.status(404).json({ error: 'Venta no encontrada' });

    // No permitir editar si ya fue autorizada por el SRI
    if (ventaActual.estado_sri === 'AUTORIZADO') {
      return res.status(400).json({
        error: 'Esta factura ya fue autorizada por el SRI. No se puede modificar. Genere una nota de crédito si es necesario.'
      });
    }

    const {
      clienteId, numero_factura, fecha_emision, tipo_documento,
      detalles, subtotal, iva, total,
      numero_guia, transportista, placa,
      numero_exportacion, pais_destino,
      numero_retencion, porcentaje_retencion,
      establecimiento, nombre_comercial, punto_emision,
      transportista_identificacion, transportista_tipo,
      transportista_razon_social, transportista_correo,
      direccion_partida, inicio_transporte, fin_transporte, placa_transporte,
      destinatario_identificacion, destinatario_tipo, destinatario_razon_social,
      destinatario_direccion, ruta, motivo, documento_aduana,
      comprobante_tipo_emision, comprobante_documento, comprobante_clave_acceso,
      comprobante_numero_autorizacion, comprobante_numero, comprobante_fecha_emision,
      forma_pago, estado_pago, fecha_pago, observaciones
    } = req.body;

    const session = req.db.client.startSession();
    await session.withTransaction(async () => {
      if (ventaActual.tipo_documento !== 'nota_credito' && ventaActual.tipo_documento !== 'guia_remision') {
        for (const detalle of ventaActual.detalles) {
          const productoId = new ObjectId(detalle.productoId);
          await req.db.collection('productos').updateOne(
            { _id: productoId },
            { $inc: { stock: detalle.cantidad } },
            { session }
          );
          await req.db.collection('kardex').deleteMany({
            referencia_id: new ObjectId(id),
            referencia_tipo: 'venta'
          }, { session });
        }
      }

      for (const detalle of detalles) {
        const producto = await req.db.collection('productos').findOne({ _id: new ObjectId(detalle.productoId) }, { session });
        if (!producto) throw new Error(`Producto ${detalle.productoId} no existe`);
        const stockDisponible = producto.stock;
        if (stockDisponible < detalle.cantidad) {
          throw new Error(`Stock insuficiente para producto ${producto.nombre}. Disponible: ${stockDisponible}, requerido: ${detalle.cantidad}`);
        }
      }

      // Si la fecha cambió, regenerar clave de acceso
      let nuevaClave = ventaActual.clave_acceso || '';
      let nuevoSecuencial = ventaActual.secuencial_sri || '';
      const fechaCambio = new Date(fecha_emision).getTime() !== new Date(ventaActual.fecha_emision).getTime();
      const tipoCambio = (tipo_documento || 'factura') !== ventaActual.tipo_documento;

      if (fechaCambio || tipoCambio) {
        const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
        const tipoDoc = tipo_documento || 'factura';
        const generaClave = DOCS_CON_CLAVE.includes(tipoDoc) && config?.ruc && config.ruc.length === 13;

        if (generaClave) {
          try {
            const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';
            const est = establecimiento || config.establecimiento || '001';
            const pe = punto_emision || config.punto_emision || '001';
            const serie = formatearSerie(est, pe);
            const secuencial = parseInt(nuevoSecuencial) || 1;

            nuevaClave = generarClaveAcceso({
              fechaEmision: new Date(fecha_emision),
              tipoComprobante: codigoSRI,
              ruc: config.ruc,
              ambiente: config.ambiente || '1',
              serie,
              secuencial,
              tipoEmision: config.tipo_emision || '1'
            });
          } catch (e) {
            console.error('Error regenerando clave:', e.message);
          }
        }
      }

      const updateData = {
        clienteId: new ObjectId(clienteId),
        numero_factura,
        fecha_emision: new Date(fecha_emision),
        tipo_documento: tipo_documento || 'factura',
        detalles,
        subtotal,
        iva,
        total,
        clave_acceso: nuevaClave,
        numero_guia,
        transportista,
        placa,
        numero_exportacion,
        pais_destino,
        numero_retencion,
        porcentaje_retencion,
        establecimiento,
        nombre_comercial,
        punto_emision,
        transportista_identificacion,
        transportista_tipo,
        transportista_razon_social,
        transportista_correo,
        direccion_partida,
        inicio_transporte,
        fin_transporte,
        placa_transporte,
        destinatario_identificacion,
        destinatario_tipo,
        destinatario_razon_social,
        destinatario_direccion,
        ruta,
        motivo,
        documento_aduana,
        comprobante_tipo_emision,
        comprobante_documento,
        comprobante_clave_acceso,
        comprobante_numero_autorizacion,
        comprobante_numero,
        comprobante_fecha_emision,
        forma_pago: forma_pago || '',
        estado_pago: estado_pago || 'pendiente',
        fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
        observaciones: observaciones || '',
        updatedAt: new Date()
      };

      await req.db.collection('ventas_v2').updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { session }
      );

      if (tipo_documento !== 'nota_credito' && tipo_documento !== 'guia_remision') {
        for (const detalle of detalles) {
          const productoId = new ObjectId(detalle.productoId);
          await req.db.collection('productos').updateOne(
            { _id: productoId },
            { $inc: { stock: -detalle.cantidad }, $set: { updatedAt: new Date() } },
            { session }
          );
          const productoActualizado = await req.db.collection('productos').findOne({ _id: productoId }, { session });
          await req.db.collection('kardex').insertOne({
            productoId,
            fecha: new Date(fecha_emision),
            tipo_movimiento: 'venta',
            cantidad: -detalle.cantidad,
            costo_unitario: detalle.precio_unitario,
            saldo: productoActualizado.stock,
            referencia_id: new ObjectId(id),
            referencia_tipo: 'venta',
            createdAt: new Date()
          }, { session });
        }
      }
    });

    const ventaActualizada = await req.db.collection('ventas_v2').aggregate([
      { $match: { _id: new ObjectId(id) } },
      {
        $lookup: {
          from: 'clientes',
          localField: 'clienteId',
          foreignField: '_id',
          as: 'cliente'
        }
      },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } }
    ]).toArray();

    await logAudit(req.db, req, {
      accion: 'actualizar',
      coleccion: 'ventas',
      documentoId: id,
      documentoNumero: ventaActualizada[0]?.numero_factura || ventaActual.numero_factura || '',
      datosAnteriores: ventaActual,
      datosNuevos: ventaActualizada[0],
      detalle: `Venta actualizada: ${ventaActualizada[0]?.numero_factura || ventaActual.numero_factura || ''}`
    });

    if (req.io) req.io.emit('venta-actualizada', ventaActualizada[0]);
    res.json(ventaActualizada[0]);
  } catch (err) {
    console.error('Error actualizando venta:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verificarPeriodoAbierto(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    // No permitir eliminar si ya fue autorizada por el SRI
    if (venta.estado_sri === 'AUTORIZADO') {
      return res.status(400).json({
        error: 'Esta factura ya fue autorizada por el SRI. No se puede eliminar. Genere una nota de crédito si es necesario.'
      });
    }

    const session = req.db.client.startSession();
    await session.withTransaction(async () => {
      if (venta.tipo_documento !== 'nota_credito' && venta.tipo_documento !== 'guia_remision') {
        for (const detalle of venta.detalles) {
          const productoId = new ObjectId(detalle.productoId);
          await req.db.collection('productos').updateOne(
            { _id: productoId },
            { $inc: { stock: detalle.cantidad } },
            { session }
          );
        }
        await req.db.collection('kardex').deleteMany({
          referencia_id: new ObjectId(id),
          referencia_tipo: 'venta'
        }, { session });
      }

      await req.db.collection('ventas_v2').deleteOne({ _id: new ObjectId(id) }, { session });
    });

    await logAudit(req.db, req, {
      accion: 'eliminar',
      coleccion: 'ventas',
      documentoId: id,
      documentoNumero: venta.numero_factura || '',
      datosAnteriores: venta,
      detalle: `Venta eliminada: ${venta.numero_factura || ''} por $${(venta.total || 0).toFixed(2)}`
    });

    if (req.io) req.io.emit('venta-eliminada', { id });
    res.json({ message: 'Venta eliminada correctamente' });
  } catch (err) {
    console.error('Error eliminando venta:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;