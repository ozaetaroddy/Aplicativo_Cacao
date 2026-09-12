// backend/routes/retenciones.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');
const { buscarRetencion } = require('../data/catalogosSRI');

router.get('/', requierePermiso('retenciones', 'ver'), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (req.query.search || '').trim();
    const { desde, hasta } = req.query;

    const matchStage = {};
    if (desde || hasta) {
      matchStage.fecha_emision = {};
      if (desde) { const d = new Date(desde); if (!isNaN(d)) matchStage.fecha_emision.$gte = d; }
      if (hasta) {
        const h = new Date(hasta);
        if (!isNaN(h)) { h.setHours(23, 59, 59, 999); matchStage.fecha_emision.$lte = h; }
      }
    }

    const pipeline = [
      { $match: matchStage },
      { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } }
    ];

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      pipeline.push({
        $match: {
          $or: [
            { numero_factura: regex },
            { 'proveedor.nombre': regex },
            { 'proveedor.ruc': regex }
          ]
        }
      });
    }

    const sort = parseSort(req.query, { fecha_emision: -1 });

    if (!paginar) {
      pipeline.push({ $sort: sort });
      const retenciones = await req.db.collection('retenciones').aggregate(pipeline).toArray();
      return res.json(retenciones);
    }

    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await req.db.collection('retenciones').aggregate(countPipeline).toArray();
    const total = countResult[0]?.total || 0;

    pipeline.push({ $sort: sort });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const retenciones = await req.db.collection('retenciones').aggregate(pipeline).toArray();

    res.json({ data: retenciones, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Error listando retenciones:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requierePermiso('retenciones', 'crear'), async (req, res) => {
  try {
    const {
      compraId, proveedorId, numero_factura, fecha_emision,
      valor_retenido, porcentaje, tipo, tipo_retencion,
      impuesto_retencion, base_imponible
    } = req.body;

    if (!ObjectId.isValid(proveedorId)) {
      return res.status(400).json({ error: 'ID de proveedor inválido' });
    }
    if (!fecha_emision) {
      return res.status(400).json({ error: 'La fecha de emisión es obligatoria' });
    }

    const fecha = new Date(fecha_emision);
    if (isNaN(fecha.getTime())) {
      return res.status(400).json({ error: 'Fecha de emisión inválida' });
    }

    if (valor_retenido === undefined || valor_retenido === null || parseFloat(valor_retenido) < 0) {
      return res.status(400).json({ error: 'El valor retenido debe ser un número >= 0' });
    }

    let retencionCatalogo = null;
    if (tipo_retencion) {
      retencionCatalogo = buscarRetencion(tipo_retencion, impuesto_retencion);
      if (!retencionCatalogo) {
        return res.status(400).json({
          error: `Código de retención "${tipo_retencion}" no existe en el catálogo del SRI` +
                 (impuesto_retencion ? ` para el impuesto "${impuesto_retencion}"` : '')
        });
      }
    }

    const retencion = {
      compraId: compraId && ObjectId.isValid(compraId) ? new ObjectId(compraId) : null,
      proveedorId: new ObjectId(proveedorId),
      numero_factura: (numero_factura || '').trim(),
      fecha_emision: fecha,
      base_imponible: parseFloat(base_imponible) || 0,
      valor_retenido: parseFloat(valor_retenido) || 0,
      porcentaje: parseFloat(porcentaje) || 0,
      tipo: tipo || 'manual',
      tipo_retencion: tipo_retencion || '',
      impuesto_retencion: impuesto_retencion || (retencionCatalogo?.impuesto || ''),
      createdAt: new Date()
    };

    const result = await req.db.collection('retenciones').insertOne(retencion);

    await logAudit(req.db, req, {
      accion: 'crear',
      coleccion: 'retenciones',
      documentoId: result.insertedId,
      documentoNumero: numero_factura || '',
      datosNuevos: { ...retencion, _id: result.insertedId },
      detalle: `Retención creada: ${numero_factura || ''} por $${(retencion.valor_retenido || 0).toFixed(2)}`
    });

    res.status(201).json({ ...retencion, _id: result.insertedId });
  } catch (err) {
    console.error('Error creando retención:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requierePermiso('retenciones', 'eliminar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const retencionAnterior = await req.db.collection('retenciones').findOne({ _id: new ObjectId(id) });
    if (!retencionAnterior) return res.status(404).json({ error: 'Retención no encontrada' });

    await req.db.collection('retenciones').deleteOne({ _id: new ObjectId(id) });

    await logAudit(req.db, req, {
      accion: 'eliminar',
      coleccion: 'retenciones',
      documentoId: id,
      documentoNumero: retencionAnterior.numero_factura || '',
      datosAnteriores: retencionAnterior,
      detalle: `Retención eliminada: ${retencionAnterior.numero_factura || ''}`
    });

    res.json({ message: 'Retención eliminada' });
  } catch (err) {
    console.error('Error eliminando retención:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;