// backend/routes/ventas.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');
const { verificarPeriodoAbierto } = require('../utils/periodos');
const { generarClaveAcceso, formatearSerie, descomponerClave, validarClave } = require('../utils/claveAcceso');
const { generarXMLComprobante } = require('../utils/xmlComprobante');
const { cargarCertificado, firmarXML, validarFirma, descifrarSecreto } = require('../utils/firmaElectronica');
const { conTransaccion } = require('../utils/transacciones');
const { validar } = require('../utils/validacion');

const TIPOS_DOCUMENTO_VALIDOS = [
  'factura', 'nota_credito', 'nota_debito', 'guia_remision',
  'retencion', 'liquidacion', 'exportacion', 'reembolso', 'proforma'
];

const validarVenta = [
  body('clienteId').isMongoId().withMessage('ID de cliente inválido'),
  body('fecha_emision').isISO8601().withMessage('Fecha inválida'),
  body('detalles').isArray({ min: 1 }).withMessage('Debe incluir al menos un detalle'),
  body('subtotal').isNumeric().withMessage('Subtotal debe ser número'),
  body('iva').isNumeric().withMessage('IVA debe ser número'),
  body('total').isNumeric().withMessage('Total debe ser número'),
  body('tipo_documento').optional().isIn(TIPOS_DOCUMENTO_VALIDOS)
    .withMessage(`Tipo de documento inválido. Válidos: ${TIPOS_DOCUMENTO_VALIDOS.join(', ')}`),
  body('impuestos_retencion').if(body('tipo_documento').equals('retencion'))
    .optional().isArray().withMessage('impuestos_retencion debe ser un array')
    .custom((arr) => {
      if (!arr) return true;
      for (const imp of arr) {
        if (!imp || typeof imp !== 'object') throw new Error('Cada impuesto debe ser un objeto');
        if (imp.codDocSustento === undefined || imp.numDocSustento === undefined) {
          throw new Error('Cada impuesto de retención requiere codDocSustento y numDocSustento');
        }
      }
      return true;
    })
];

const TIPO_COMPROBANTE_SRI = {
  'factura': '01', 'liquidacion': '03', 'nota_credito': '04', 'nota_debito': '05',
  'guia_remision': '06', 'retencion': '07', 'exportacion': '01', 'reembolso': '01', 'proforma': null
};

const DOCS_CON_CLAVE = ['factura', 'liquidacion', 'nota_credito', 'nota_debito', 'guia_remision', 'retencion', 'exportacion', 'reembolso'];

const ESTADOS_SRI_BLOQUEADOS_PARA_DELETE = new Set(['FIRMADO', 'AUTORIZADO', 'RECHAZADA', 'DEVUELTA']);

function validarTotales(body) {
  const subtotal = parseFloat(body.subtotal) || 0;
  const iva = parseFloat(body.iva) || 0;
  const total = parseFloat(body.total) || 0;
  const esperado = +(subtotal + iva).toFixed(2);
  if (Math.abs(esperado - total) > 0.01) {
    return `Total inconsistente: subtotal(${subtotal}) + iva(${iva}) = ${esperado}, pero se envió total=${total}`;
  }
  return null;
}

function validarFechaNoFutura(fecha) {
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return 'Fecha inválida';
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  hoy.setDate(hoy.getDate() + 1);
  if (d > hoy) return 'La fecha de emisión no puede ser futura';
  return null;
}

async function cargarCertificadoSeguro(db) {
  try {
    const cert = await db.collection('certificados').findOne({ _id: 'empresa' });
    if (!cert) return null;
    const password = cert.password_cifrado ? descifrarSecreto(cert.password_cifrado) : cert.password;
    const p12Buffer = Buffer.from(cert.archivo_base64, 'base64');
    const { privateKeyPem, certificatePem } = cargarCertificado(p12Buffer, password);
    return { privateKeyPem, certificatePem };
  } catch (e) {
    console.warn('⚠️  No se pudo cargar el certificado:', e.message);
    return null;
  }
}

async function reservarContador(db, tipoDoc) {
  const r = await db.collection('contadores').findOneAndUpdate(
    { _id: tipoDoc },
    { $inc: { valor: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return r?.valor || 1;
}

async function actualizarStockAtomico(db, productoId, cantidad, signoStock, session) {
  const filtro = signoStock < 0
    ? { _id: productoId, stock: { $gte: cantidad } }
    : { _id: productoId };

  const r = await db.collection('productos').updateOne(
    filtro,
    { $inc: { stock: signoStock * cantidad }, $set: { updatedAt: new Date() } },
    { session }
  );

  if (r.matchedCount === 0) {
    throw new Error(`Stock insuficiente para el producto ${productoId} (otro usuario acaba de consumir el stock disponible)`);
  }

  return await db.collection('productos').findOne({ _id: productoId }, { session });
}

async function asegurarClaveYXml(db, venta) {
  const tipoDoc = venta.tipo_documento || 'factura';
  if (!DOCS_CON_CLAVE.includes(tipoDoc)) {
    return { claveAcceso: null, xml: null, motivo: 'Este tipo de documento no requiere clave' };
  }

  const config = await db.collection('configuracion').findOne({ _id: 'empresa' });
  if (!config || !config.ruc || config.ruc.length !== 13) {
    return { claveAcceso: null, xml: null, motivo: 'Debe configurar el RUC (13 dígitos) en Administración → Configuración Empresa' };
  }

  let claveAcceso = venta.clave_acceso;
  let serieFormateada = venta.serie;
  let numeroSecuencial = venta.secuencial_sri;

  if (!claveAcceso) {
    const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';
    const est = venta.establecimiento || config.establecimiento || '001';
    const pe = venta.punto_emision || config.punto_emision || '001';
    serieFormateada = formatearSerie(est, pe);

    let sec = 1;
    if (venta.secuencial_sri) {
      sec = parseInt(venta.secuencial_sri, 10) || 1;
    } else if (venta.numero_factura) {
      const match = String(venta.numero_factura).match(/(\d+)/g);
      if (match) sec = parseInt(match[match.length - 1], 10) || 1;
    }

    try {
      claveAcceso = generarClaveAcceso({
        fechaEmision: new Date(venta.fecha_emision),
        tipoComprobante: codigoSRI,
        ruc: config.ruc,
        ambiente: config.ambiente || '1',
        serie: serieFormateada,
        secuencial: sec,
        tipoEmision: config.tipo_emision || '1'
      });
      numeroSecuencial = String(sec).padStart(9, '0');
    } catch (e) {
      return { claveAcceso: null, xml: null, motivo: 'Error generando clave: ' + e.message };
    }
  }

  let xml = venta.xml_generado;
  if (!xml) {
    try {
      const cliente = await db.collection('clientes').findOne({ _id: venta.clienteId });
      const ventaParaXml = {
        ...venta,
        clave_acceso: claveAcceso,
        serie: serieFormateada || venta.serie,
        secuencial_sri: numeroSecuencial || venta.secuencial_sri
      };
      xml = generarXMLComprobante(ventaParaXml, cliente, config);
    } catch (e) {
      return { claveAcceso, xml: null, motivo: 'Error generando XML: ' + e.message };
    }
  }

  if (!venta.clave_acceso || !venta.xml_generado) {
    try {
      await db.collection('ventas_v2').updateOne(
        { _id: venta._id },
        {
          $set: {
            clave_acceso: claveAcceso,
            serie: serieFormateada || venta.serie,
            secuencial_sri: numeroSecuencial || venta.secuencial_sri,
            xml_generado: xml,
            estado_sri: venta.estado_sri === 'NO_APLICA' ? 'PENDIENTE' : venta.estado_sri,
            updatedAt: new Date()
          }
        }
      );
    } catch (e) {
      console.warn('No se pudo persistir:', e.message);
    }
  }

  return { claveAcceso, xml, motivo: null };
}

async function firmarXMLConCertificado(db, xmlSinFirma) {
  const pems = await cargarCertificadoSeguro(db);
  if (!pems) throw new Error('No hay certificado de firma electrónica cargado o es inválido');
  return firmarXML(xmlSinFirma, pems.privateKeyPem, pems.certificatePem);
}

// ============================================================
// LISTAR
// ============================================================
router.get('/', requierePermiso('ventas', 'ver'), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (typeof req.query.search === 'string' ? req.query.search : '').trim();
    const { desde, hasta, tipo_documento, estado_pago, estado_sri, clienteId } = req.query;

    const matchStage = {};
    if (desde || hasta) {
      matchStage.fecha_emision = {};
      if (desde) { const d = new Date(desde); if (!isNaN(d)) matchStage.fecha_emision.$gte = d; }
      if (hasta) { const h = new Date(hasta); if (!isNaN(h)) { h.setHours(23, 59, 59, 999); matchStage.fecha_emision.$lte = h; } }
    }
    if (typeof tipo_documento === 'string' && tipo_documento) matchStage.tipo_documento = tipo_documento;
    if (typeof estado_pago === 'string' && estado_pago) matchStage.estado_pago = estado_pago;
    if (typeof estado_sri === 'string' && estado_sri) matchStage.estado_sri = estado_sri;
    if (typeof clienteId === 'string' && ObjectId.isValid(clienteId)) matchStage.clienteId = new ObjectId(clienteId);

    const pipeline = [
      { $match: matchStage },
      { $project: { xml_generado: 0, xml_firmado: 0, xml_autorizado: 0, respuesta_sri: 0 } },
      { $lookup: { from: 'clientes', localField: 'clienteId', foreignField: '_id', as: 'cliente' } },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } }
    ];

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      pipeline.push({
        $match: {
          $or: [
            { numero_factura: regex },
            { clave_acceso: regex },
            { numero_autorizacion: regex },
            { 'cliente.nombre': regex },
            { 'cliente.ruc': regex }
          ]
        }
      });
    }

    const sort = parseSort(req.query, { fecha_emision: -1 });

    if (!paginar) {
      pipeline.push({ $sort: sort });
      const ventas = await req.db.collection('ventas_v2').aggregate(pipeline).toArray();
      return res.json(ventas);
    }

    const countResult = await req.db.collection('ventas_v2').aggregate([...pipeline, { $count: 'total' }]).toArray();
    const total = countResult[0]?.total || 0;

    pipeline.push({ $sort: sort });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const ventas = await req.db.collection('ventas_v2').aggregate(pipeline).toArray();
    res.json({ data: ventas, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Error listando ventas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// VALIDAR CLAVE
// ============================================================
router.post('/validar-clave', requierePermiso('ventas', 'ver'), async (req, res) => {
  try {
    const { clave } = req.body;
    const valida = validarClave(clave);
    const partes = descomponerClave(clave);
    res.json({ valida, partes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// BUSCAR POR CLAVE
// ============================================================
router.get('/buscar-clave/:clave', requierePermiso('ventas', 'ver'), async (req, res) => {
  try {
    const { clave } = req.params;
    if (!clave || clave.length !== 49) {
      return res.status(400).json({ error: 'Clave debe tener 49 dígitos' });
    }
    const venta = await req.db.collection('ventas_v2').findOne(
      { clave_acceso: clave },
      { projection: { xml_generado: 0, xml_firmado: 0, xml_autorizado: 0 } }
    );
    if (!venta) return res.status(404).json({ error: 'No se encontró documento con esa clave' });

    const cliente = await req.db.collection('clientes').findOne({ _id: venta.clienteId });
    res.json({ ...venta, cliente });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// MIGRACIÓN MASIVA — SOLO ADMIN
// ============================================================
router.post('/migrar-claves', (req, res, next) => {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({
      error: 'Solo un administrador puede ejecutar migraciones masivas de claves',
      codigo: 'SOLO_ADMIN'
    });
  }
  next();
}, async (req, res) => {
  try {
    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    if (!config || !config.ruc || config.ruc.length !== 13) {
      return res.status(400).json({
        error: 'La empresa no tiene un RUC válido configurado',
        codigo: 'RUC_INVALIDO'
      });
    }

    const facturasSinClave = await req.db.collection('ventas_v2').find({
      tipo_documento: { $in: DOCS_CON_CLAVE },
      estado_sri: { $ne: 'AUTORIZADO' },
      $or: [
        { clave_acceso: '' },
        { clave_acceso: { $exists: false } },
        { clave_acceso: null }
      ]
    }).toArray();

    const resultados = [];
    let exitosas = 0;
    let errores = 0;
    let maxSecuencialUsado = 0;

    const pems = await cargarCertificadoSeguro(req.db);

    for (const venta of facturasSinClave) {
      try {
        const tipoDoc = venta.tipo_documento || 'factura';
        const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';
        const est = venta.establecimiento || config.establecimiento || '001';
        const pe = venta.punto_emision || config.punto_emision || '001';
        const serie = formatearSerie(est, pe);

        let sec = 1;
        if (venta.numero_factura) {
          const match = String(venta.numero_factura).match(/(\d+)/g);
          if (match) sec = parseInt(match[match.length - 1], 10) || 1;
        }
        if (sec > maxSecuencialUsado) maxSecuencialUsado = sec;

        const claveAcceso = generarClaveAcceso({
          fechaEmision: new Date(venta.fecha_emision),
          tipoComprobante: codigoSRI,
          ruc: config.ruc,
          ambiente: config.ambiente || '1',
          serie,
          secuencial: sec,
          tipoEmision: config.tipo_emision || '1'
        });

        const cliente = await req.db.collection('clientes').findOne({ _id: venta.clienteId });
        const ventaParaXml = {
          ...venta,
          clave_acceso: claveAcceso,
          serie,
          secuencial_sri: String(sec).padStart(9, '0'),
          ruc_emisor: config.ruc,
          razon_social_emisor: config.razon_social || ''
        };
        const xml = generarXMLComprobante(ventaParaXml, cliente, config);

        let xmlFirmado = '';
        let estadoSri = 'PENDIENTE';
        if (pems) {
          try {
            xmlFirmado = firmarXML(xml, pems.privateKeyPem, pems.certificatePem);
            estadoSri = 'FIRMADO';
          } catch (e) {
            console.warn('Error firmando:', e.message);
          }
        }

        await req.db.collection('ventas_v2').updateOne(
          { _id: venta._id },
          {
            $set: {
              clave_acceso: claveAcceso,
              serie,
              secuencial_sri: String(sec).padStart(9, '0'),
              ruc_emisor: config.ruc,
              razon_social_emisor: config.razon_social || '',
              ambiente_sri: config.ambiente || '1',
              xml_generado: xml,
              xml_firmado: xmlFirmado,
              estado_sri: estadoSri,
              updatedAt: new Date()
            }
          }
        );

        resultados.push({ id: venta._id, numero: venta.numero_factura, clave: claveAcceso, exito: true });
        exitosas++;
      } catch (e) {
        resultados.push({ id: venta._id, numero: venta.numero_factura, error: e.message, exito: false });
        errores++;
      }
    }

    if (maxSecuencialUsado > 0) {
      await req.db.collection('contadores').updateOne(
        { _id: 'factura' },
        { $max: { valor: maxSecuencialUsado } },
        { upsert: true }
      );
    }

    await logAudit(req.db, req, {
      accion: 'migrar-claves',
      coleccion: 'ventas',
      documentoNumero: 'migracion',
      detalle: `Migración de claves: ${exitosas} exitosas, ${errores} errores. Contador factura en ${maxSecuencialUsado}`
    });

    res.json({ total: facturasSinClave.length, exitosas, errores, resultados });
  } catch (err) {
    console.error('Error migrando:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DESCARGAR XML
// ============================================================
router.get('/:id/xml', requierePermiso('ventas', 'ver'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    const { claveAcceso, xml, motivo } = await asegurarClaveYXml(req.db, venta);
    if (!claveAcceso || !xml) return res.status(400).json({ error: motivo || 'No se pudo generar la clave' });

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${claveAcceso}.xml"`);
    res.send(venta.xml_firmado || xml);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// VER XML (preview)
// ============================================================
router.get('/:id/xml-preview', requierePermiso('ventas', 'ver'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    const { claveAcceso, xml, motivo } = await asegurarClaveYXml(req.db, venta);
    if (!claveAcceso || !xml) return res.status(400).json({ error: motivo || 'No se pudo generar la clave' });

    res.json({ xml, xml_firmado: venta.xml_firmado || null, clave_acceso: claveAcceso, firmado: !!venta.xml_firmado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DESCARGAR XML FIRMADO
// ============================================================
router.get('/:id/xml-firmado', requierePermiso('ventas', 'ver'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
    if (!venta.xml_firmado) return res.status(404).json({ error: 'Este documento no está firmado' });

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${venta.clave_acceso}_firmado.xml"`);
    res.send(venta.xml_firmado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// OBTENER QR
// ============================================================
router.get('/:id/qr', requierePermiso('ventas', 'ver'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    const { claveAcceso } = await asegurarClaveYXml(req.db, venta);
    if (!claveAcceso) return res.status(400).json({ error: 'No se pudo generar la clave' });

    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    const { generarQRComprobante } = require('../utils/qrGenerator');
    const qr = await generarQRComprobante({
      ruc: config?.ruc || venta.ruc_emisor || '',
      tipoComprobante: '01',
      numeroComprobante: venta.numero_factura || '',
      fechaEmision: venta.fecha_emision,
      montoTotal: venta.total,
      claveAcceso
    });

    res.json({ qr: qr.dataUrl, clave_acceso: claveAcceso });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// OBTENER POR ID
// ============================================================
router.get('/:id', requierePermiso('ventas', 'ver'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
    const venta = await req.db.collection('ventas_v2').aggregate([
      { $match: { _id: new ObjectId(id) } },
      { $project: { xml_generado: 0, xml_firmado: 0, xml_autorizado: 0 } },
      { $lookup: { from: 'clientes', localField: 'clienteId', foreignField: '_id', as: 'cliente' } },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } }
    ]).toArray();
    if (venta.length === 0) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json(venta[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// FIRMAR MANUALMENTE
// ============================================================
router.post('/:id/firmar', requierePermiso('ventas', 'editar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
    if (venta.xml_firmado) return res.status(400).json({ error: 'Este documento ya está firmado' });

    const { claveAcceso, xml, motivo } = await asegurarClaveYXml(req.db, venta);
    if (!claveAcceso || !xml) return res.status(400).json({ error: motivo || 'No se puede firmar' });

    let xmlFirmado;
    try {
      xmlFirmado = await firmarXMLConCertificado(req.db, xml);
    } catch (e) {
      return res.status(400).json({ error: 'Error al firmar: ' + e.message });
    }

    const validacion = validarFirma(xmlFirmado);
    if (!validacion.valido) {
      return res.status(400).json({ error: 'La firma generada es inválida: ' + validacion.motivo });
    }

    await req.db.collection('ventas_v2').updateOne(
      { _id: new ObjectId(id) },
      { $set: { xml_firmado: xmlFirmado, estado_sri: 'FIRMADO', fecha_firma: new Date(), updatedAt: new Date() } }
    );

    await logAudit(req.db, req, {
      accion: 'firmar', coleccion: 'ventas', documentoId: id,
      documentoNumero: venta.numero_factura || '',
      detalle: `Documento firmado electrónicamente: ${venta.numero_factura || ''}`
    });

    res.json({ message: 'Documento firmado correctamente', xml_firmado: xmlFirmado, clave_acceso: claveAcceso });
  } catch (err) {
    console.error('Error firmando:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GENERAR CLAVE PARA UNA VENTA EXISTENTE
// ============================================================
router.post('/:id/generar-clave', requierePermiso('ventas', 'editar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const venta = await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    if (venta.estado_sri === 'AUTORIZADO') {
      return res.status(400).json({ error: 'Este documento ya fue autorizado. No se puede regenerar la clave.' });
    }

    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    if (!config || !config.ruc || config.ruc.length !== 13) {
      return res.status(400).json({ error: 'La empresa no tiene un RUC válido (13 dígitos) configurado', codigo: 'RUC_INVALIDO' });
    }

    const tipoDoc = venta.tipo_documento || 'factura';
    if (!DOCS_CON_CLAVE.includes(tipoDoc)) {
      return res.status(400).json({ error: `El tipo "${tipoDoc}" no requiere clave de acceso`, codigo: 'NO_REQUIERE' });
    }

    const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';
    const est = venta.establecimiento || config.establecimiento || '001';
    const pe = venta.punto_emision || config.punto_emision || '001';
    const serie = formatearSerie(est, pe);

    let sec = 1;
    if (venta.secuencial_sri) {
      sec = parseInt(venta.secuencial_sri, 10) || 1;
    } else if (venta.numero_factura) {
      const match = String(venta.numero_factura).match(/(\d+)/g);
      if (match) sec = parseInt(match[match.length - 1], 10) || 1;
    }

    const claveAcceso = generarClaveAcceso({
      fechaEmision: new Date(venta.fecha_emision),
      tipoComprobante: codigoSRI,
      ruc: config.ruc,
      ambiente: config.ambiente || '1',
      serie,
      secuencial: sec,
      tipoEmision: config.tipo_emision || '1'
    });

    const secuencialFormateado = String(sec).padStart(9, '0');
    const cliente = await req.db.collection('clientes').findOne({ _id: venta.clienteId });
    const ventaParaXml = {
      ...venta,
      clave_acceso: claveAcceso,
      serie,
      secuencial_sri: secuencialFormateado,
      ruc_emisor: config.ruc,
      razon_social_emisor: config.razon_social || ''
    };
    const xml = generarXMLComprobante(ventaParaXml, cliente, config);

    let xmlFirmado = '';
    let estadoSri = 'PENDIENTE';
    let fechaFirma = null;

    const pems = await cargarCertificadoSeguro(req.db);
    if (pems) {
      try {
        xmlFirmado = firmarXML(xml, pems.privateKeyPem, pems.certificatePem);
        estadoSri = 'FIRMADO';
        fechaFirma = new Date();
      } catch (e) {
        console.warn('Error firmando:', e.message);
      }
    }

    await req.db.collection('ventas_v2').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          clave_acceso: claveAcceso, serie, secuencial_sri: secuencialFormateado,
          ruc_emisor: config.ruc, razon_social_emisor: config.razon_social || '',
          ambiente_sri: config.ambiente || '1',
          xml_generado: xml, xml_firmado: xmlFirmado, estado_sri: estadoSri,
          fecha_firma: fechaFirma, updatedAt: new Date()
        }
      }
    );

    await logAudit(req.db, req, {
      accion: 'generar-clave', coleccion: 'ventas', documentoId: id,
      documentoNumero: venta.numero_factura || '',
      detalle: `Clave de acceso generada: ${claveAcceso}`
    });

    res.json({
      success: true, message: 'Clave de acceso generada correctamente',
      clave_acceso: claveAcceso, serie, secuencial: secuencialFormateado,
      firmado: !!xmlFirmado, estado_sri: estadoSri
    });
  } catch (err) {
    console.error('Error generando clave:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CREAR
// ============================================================
router.post('/',
  requierePermiso('ventas', 'crear'),
  verificarPeriodoAbierto(),
  validarVenta,
  async (req, res) => {
    if (validar(req, res)) return;

    const errorTotales = validarTotales(req.body);
    if (errorTotales) return res.status(400).json({ error: errorTotales });

    const errorFecha = validarFechaNoFutura(req.body.fecha_emision);
    if (errorFecha) return res.status(400).json({ error: errorFecha });

    try {
      const {
        clienteId, numero_factura, fecha_emision, tipo_documento,
        detalles, subtotal, iva, total,
        numero_guia, transportista, placa, numero_exportacion, pais_destino,
        numero_retencion, porcentaje_retencion,
        tipo_retencion, tipo_impuesto, impuestos_retencion,
        establecimiento, nombre_comercial, punto_emision,
        transportista_identificacion, transportista_tipo, transportista_razon_social, transportista_correo,
        direccion_partida, inicio_transporte, fin_transporte, placa_transporte,
        destinatario_identificacion, destinatario_tipo, destinatario_razon_social,
        destinatario_direccion, ruta, motivo, documento_aduana,
        comprobante_tipo_emision, comprobante_documento, comprobante_clave_acceso,
        comprobante_numero_autorizacion, comprobante_numero, comprobante_fecha_emision,
        numero_factura_modificada,
        forma_pago, estado_pago, fecha_pago, observaciones
      } = req.body;

      const tipoDoc = tipo_documento || 'factura';

      if (!TIPOS_DOCUMENTO_VALIDOS.includes(tipoDoc)) {
        return res.status(400).json({
          error: `Tipo de documento "${tipoDoc}" no es válido`,
          tipos_validos: TIPOS_DOCUMENTO_VALIDOS
        });
      }

      const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });

      if (tipoDoc === 'nota_credito') {
        if (!comprobante_clave_acceso && !numero_factura_modificada) {
          return res.status(400).json({
            error: 'Las notas de crédito requieren el número o clave de acceso del documento que modifican'
          });
        }
      }

      if (tipoDoc === 'retencion') {
        if (!Array.isArray(impuestos_retencion) && !tipo_retencion) {
          return res.status(400).json({
            error: 'Los comprobantes de retención requieren al menos un impuesto (impuestos_retencion[] o tipo_retencion)'
          });
        }
      }

      if (tipoDoc !== 'nota_credito' && tipoDoc !== 'guia_remision') {
        for (const detalle of detalles) {
          if (!ObjectId.isValid(detalle.productoId)) {
            throw new Error(`ID de producto inválido: ${detalle.productoId}`);
          }
          const producto = await req.db.collection('productos').findOne({ _id: new ObjectId(detalle.productoId) });
          if (!producto) throw new Error(`Producto ${detalle.productoId} no existe`);
        }
      }

      const generaClave = DOCS_CON_CLAVE.includes(tipoDoc) && config?.ruc && config.ruc.length === 13;

      const contadorValor = await reservarContador(req.db, tipoDoc);

      const prefijos = {
        'factura': 'FAC', 'guia_remision': 'GUI', 'exportacion': 'EXP', 'reembolso': 'REB',
        'retencion': 'RET', 'liquidacion': 'LIQ', 'nota_credito': 'NCR', 'proforma': 'PRO'
      };
      const prefijo = prefijos[tipoDoc] || 'DOC';
      const codigo = `${prefijo}-${String(contadorValor).padStart(6, '0')}`;

      let claveAcceso = null;
      let partesClave = null;
      let serieFormateada = null;
      let numeroSecuencial = null;

      if (generaClave) {
        const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';
        const est = establecimiento || config.establecimiento || '001';
        const pe = punto_emision || config.punto_emision || '001';
        serieFormateada = formatearSerie(est, pe);
        numeroSecuencial = contadorValor;

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
          console.error('Error generando clave:', e.message);
        }
      }

      const exportacionCodigo = tipoDoc === 'exportacion' ? codigo : null;

      const cliente = await req.db.collection('clientes').findOne({ _id: new ObjectId(clienteId) });

      let xmlGenerado = '';
      let xmlFirmado = '';
      let estadoSri = generaClave ? 'PENDIENTE' : 'NO_APLICA';
      let fechaFirma = null;

      if (claveAcceso && config) {
        try {
          const ventaParaXml = {
            clienteId: new ObjectId(clienteId),
            numero_factura: numero_factura || codigo,
            fecha_emision: new Date(fecha_emision),
            tipo_documento: tipoDoc,
            detalles, subtotal, iva, total,
            clave_acceso: claveAcceso,
            serie: serieFormateada,
            secuencial_sri: numeroSecuencial ? String(numeroSecuencial).padStart(9, '0') : '',
            ruc_emisor: config.ruc,
            razon_social_emisor: config.razon_social || '',
            establecimiento: establecimiento || config.establecimiento || '001',
            punto_emision: punto_emision || config.punto_emision || '001',
            tipo_retencion, tipo_impuesto, impuestos_retencion,
            numero_retencion, porcentaje_retencion,
            comprobante_documento, comprobante_numero, comprobante_fecha_emision,
            numero_factura_modificada
          };
          xmlGenerado = generarXMLComprobante(ventaParaXml, cliente, config);
        } catch (e) {
          console.error('Error generando XML:', e.message);
        }
      }

      if (xmlGenerado) {
        const pems = await cargarCertificadoSeguro(req.db);
        if (pems) {
          try {
            xmlFirmado = firmarXML(xmlGenerado, pems.privateKeyPem, pems.certificatePem);
            estadoSri = 'FIRMADO';
            fechaFirma = new Date();
          } catch (e) {
            console.error('Error firmando:', e.message);
          }
        }
      }

      const result = await conTransaccion(req.db, async (session) => {
        const venta = {
          clienteId: new ObjectId(clienteId),
          numero_factura: numero_factura || codigo,
          fecha_emision: new Date(fecha_emision),
          tipo_documento: tipoDoc,
          detalles, subtotal, iva, total,
          clave_acceso: claveAcceso || '',
          numero_autorizacion: '',
          estado_sri: estadoSri,
          ambiente_sri: config?.ambiente || '1',
          serie: serieFormateada || '',
          secuencial_sri: numeroSecuencial ? String(numeroSecuencial).padStart(9, '0') : '',
          ruc_emisor: config?.ruc || '',
          razon_social_emisor: config?.razon_social || '',
          numero_guia: numero_guia || '',
          transportista: transportista || '',
          placa: placa || '',
          numero_exportacion: numero_exportacion || exportacionCodigo || '',
          pais_destino: pais_destino || '',
          numero_retencion: numero_retencion || '',
          porcentaje_retencion: porcentaje_retencion || 0,
          tipo_retencion: tipo_retencion || '',
          tipo_impuesto: tipo_impuesto || '1',
          impuestos_retencion: Array.isArray(impuestos_retencion) ? impuestos_retencion : undefined,
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
          numero_factura_modificada: numero_factura_modificada || '',
          forma_pago: forma_pago || '',
          estado_pago: estado_pago || 'pendiente',
          monto_pagado: 0,
          fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
          observaciones: observaciones || '',
          xml_generado: xmlGenerado,
          xml_firmado: xmlFirmado,
          fecha_firma: fechaFirma,
          intentos_envio_sri: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const ventaResult = await req.db.collection('ventas_v2').insertOne(venta, { session });
        const ventaId = ventaResult.insertedId;

        const afectaStock = !['guia_remision', 'proforma', 'retencion'].includes(tipoDoc);
        const signoStock = tipoDoc === 'nota_credito' ? +1 : -1;

        if (afectaStock) {
          for (const detalle of detalles) {
            const productoId = new ObjectId(detalle.productoId);
            const productoActualizado = await actualizarStockAtomico(
              req.db, productoId, detalle.cantidad, signoStock, session
            );

            const costoUnitario = parseFloat(productoActualizado.precio_compra) || 0;
            const precioVentaUnitario = parseFloat(detalle.precio_unitario) || 0;

            await req.db.collection('kardex').insertOne({
              productoId,
              fecha: new Date(fecha_emision),
              tipo_movimiento: tipoDoc === 'nota_credito' ? 'devolucion' : 'venta',
              cantidad: signoStock * detalle.cantidad,
              costo_unitario: costoUnitario,
              precio_unitario_venta: precioVentaUnitario,
              saldo: productoActualizado.stock,
              referencia_id: ventaId,
              referencia_tipo: 'venta',
              createdAt: new Date()
            }, { session });
          }
        }

        return { ventaResult, claveAcceso, partesClave };
      });

      const ventaCreada = await req.db.collection('ventas_v2').aggregate([
        { $match: { _id: result.ventaResult.insertedId } },
        { $project: { xml_generado: 0, xml_firmado: 0 } },
        { $lookup: { from: 'clientes', localField: 'clienteId', foreignField: '_id', as: 'cliente' } },
        { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } }
      ]).toArray();

      let advertencia = null;
      const doc = ventaCreada[0];
      if (generaClave && doc?.estado_sri === 'PENDIENTE') {
        advertencia = 'El comprobante se guardó sin firma electrónica. Cargue un certificado válido y fírmelo manualmente (POST /api/ventas/{id}/firmar).';
      } else if (!generaClave && DOCS_CON_CLAVE.includes(tipoDoc)) {
        advertencia = 'La empresa no tiene un RUC de 13 dígitos configurado. El comprobante se guardó sin clave de acceso.';
      }

      await logAudit(req.db, req, {
        accion: 'crear', coleccion: 'ventas',
        documentoId: result.ventaResult.insertedId,
        documentoNumero: doc?.numero_factura || '',
        datosNuevos: doc,
        detalle: `Venta creada: ${doc?.numero_factura || ''} por $${(doc?.total || 0).toFixed(2)}${advertencia ? ' — ' + advertencia : ''}`
      });

      if (req.io) req.io.emit('nueva-venta', doc);

      res.status(201).json({
        ...doc,
        clave_acceso_partes: result.partesClave,
        _advertencia: advertencia
      });
    } catch (err) {
      console.error('Error en venta:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ============================================================
// ACTUALIZAR
// ============================================================
router.put('/:id',
  requierePermiso('ventas', 'editar'),
  verificarPeriodoAbierto(),
  validarVenta,
  async (req, res) => {
    if (validar(req, res)) return;

    const errorTotales = validarTotales(req.body);
    if (errorTotales) return res.status(400).json({ error: errorTotales });

    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

      // ✅ Reutiliza el documento que ya leyó verificarPeriodoAbierto()
      const ventaActual = req._documentoOriginal
        || await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
      if (!ventaActual) return res.status(404).json({ error: 'Venta no encontrada' });
      if (ventaActual.estado_sri === 'AUTORIZADO') {
        return res.status(400).json({ error: 'Esta factura ya fue autorizada por el SRI. Genere una nota de crédito.' });
      }
      if ((ventaActual.intentos_envio_sri || 0) > 0) {
        return res.status(409).json({
          error: 'No se puede editar: el documento ya fue enviado al SRI. Genere una nota de crédito o anúlelo con el SRI.',
          codigo: 'YA_ENVIADO_SRI',
          intentos: ventaActual.intentos_envio_sri
        });
      }

      const {
        clienteId, numero_factura, fecha_emision, tipo_documento,
        detalles, subtotal, iva, total,
        numero_guia, transportista, placa, numero_exportacion, pais_destino,
        numero_retencion, porcentaje_retencion,
        tipo_retencion, tipo_impuesto, impuestos_retencion,
        establecimiento, nombre_comercial, punto_emision,
        transportista_identificacion, transportista_tipo, transportista_razon_social, transportista_correo,
        direccion_partida, inicio_transporte, fin_transporte, placa_transporte,
        destinatario_identificacion, destinatario_tipo, destinatario_razon_social,
        destinatario_direccion, ruta, motivo, documento_aduana,
        comprobante_tipo_emision, comprobante_documento, comprobante_clave_acceso,
        comprobante_numero_autorizacion, comprobante_numero, comprobante_fecha_emision,
        numero_factura_modificada,
        forma_pago, estado_pago, fecha_pago, observaciones
      } = req.body;

      const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
      const tipoDoc = tipo_documento || 'factura';

      let nuevaClave = ventaActual.clave_acceso || '';
      const fechaCambio = new Date(fecha_emision).getTime() !== new Date(ventaActual.fecha_emision).getTime();
      const tipoCambio = tipoDoc !== ventaActual.tipo_documento;

      if ((fechaCambio || tipoCambio || !ventaActual.clave_acceso) && DOCS_CON_CLAVE.includes(tipoDoc)) {
        const generaClave = config?.ruc && config.ruc.length === 13;
        if (generaClave) {
          try {
            const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';
            const est = establecimiento || config.establecimiento || '001';
            const pe = punto_emision || config.punto_emision || '001';
            const serie = formatearSerie(est, pe);
            const secuencial = parseInt(ventaActual.secuencial_sri, 10) || 1;
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

      const cliente = await req.db.collection('clientes').findOne({ _id: new ObjectId(clienteId) });

      const updateData = {
        clienteId: new ObjectId(clienteId),
        numero_factura,
        fecha_emision: new Date(fecha_emision),
        tipo_documento: tipoDoc,
        detalles, subtotal, iva, total,
        clave_acceso: nuevaClave,
        numero_guia, transportista, placa,
        numero_exportacion, pais_destino,
        numero_retencion, porcentaje_retencion,
        tipo_retencion: tipo_retencion || ventaActual.tipo_retencion || '',
        tipo_impuesto: tipo_impuesto || ventaActual.tipo_impuesto || '1',
        impuestos_retencion: Array.isArray(impuestos_retencion) ? impuestos_retencion : ventaActual.impuestos_retencion,
        establecimiento, nombre_comercial, punto_emision,
        transportista_identificacion, transportista_tipo,
        transportista_razon_social, transportista_correo,
        direccion_partida, inicio_transporte, fin_transporte, placa_transporte,
        destinatario_identificacion, destinatario_tipo,
        destinatario_razon_social, destinatario_direccion,
        ruta, motivo, documento_aduana,
        comprobante_tipo_emision, comprobante_documento, comprobante_clave_acceso,
        comprobante_numero_autorizacion, comprobante_numero, comprobante_fecha_emision,
        numero_factura_modificada: numero_factura_modificada || '',
        forma_pago: forma_pago || '',
        estado_pago: estado_pago || 'pendiente',
        fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
        observaciones: observaciones || '',
        updatedAt: new Date()
      };

      if (nuevaClave && config) {
        try {
          const ventaParaXML = { ...ventaActual, ...updateData };
          updateData.xml_generado = generarXMLComprobante(ventaParaXML, cliente, config);

          const pems = await cargarCertificadoSeguro(req.db);
          if (pems) {
            updateData.xml_firmado = firmarXML(updateData.xml_generado, pems.privateKeyPem, pems.certificatePem);
            updateData.estado_sri = 'FIRMADO';
            updateData.fecha_firma = new Date();
          }
        } catch (e) {
          console.error('Error regenerando XML/firma:', e.message);
        }
      }

      await conTransaccion(req.db, async (session) => {
        const afectaStockAntes = !['guia_remision', 'proforma', 'retencion'].includes(ventaActual.tipo_documento);
        if (afectaStockAntes) {
          const signoReversion = ventaActual.tipo_documento === 'nota_credito' ? -1 : +1;
          for (const detalle of ventaActual.detalles) {
            const productoId = new ObjectId(detalle.productoId);
            await actualizarStockAtomico(req.db, productoId, detalle.cantidad, signoReversion, session);
          }
          await req.db.collection('kardex').deleteMany(
            { referencia_id: new ObjectId(id), referencia_tipo: 'venta' },
            { session }
          );
        }

        await req.db.collection('ventas_v2').updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
          { session }
        );

        const afectaStock = !['guia_remision', 'proforma', 'retencion'].includes(tipoDoc);
        if (afectaStock) {
          const signoStock = tipoDoc === 'nota_credito' ? +1 : -1;
          for (const detalle of detalles) {
            const productoId = new ObjectId(detalle.productoId);
            const productoActualizado = await actualizarStockAtomico(
              req.db, productoId, detalle.cantidad, signoStock, session
            );
            const costoUnitario = parseFloat(productoActualizado.precio_compra) || 0;
            const precioVentaUnitario = parseFloat(detalle.precio_unitario) || 0;

            await req.db.collection('kardex').insertOne({
              productoId,
              fecha: new Date(fecha_emision),
              tipo_movimiento: tipoDoc === 'nota_credito' ? 'devolucion' : 'venta',
              cantidad: signoStock * detalle.cantidad,
              costo_unitario: costoUnitario,
              precio_unitario_venta: precioVentaUnitario,
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
        { $project: { xml_generado: 0, xml_firmado: 0 } },
        { $lookup: { from: 'clientes', localField: 'clienteId', foreignField: '_id', as: 'cliente' } },
        { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } }
      ]).toArray();

      await logAudit(req.db, req, {
        accion: 'actualizar', coleccion: 'ventas', documentoId: id,
        documentoNumero: ventaActualizada[0]?.numero_factura || '',
        datosAnteriores: { ...ventaActual, xml_generado: undefined, xml_firmado: undefined },
        datosNuevos: ventaActualizada[0],
        detalle: `Venta actualizada: ${ventaActualizada[0]?.numero_factura || ''}`
      });

      if (req.io) req.io.emit('venta-actualizada', ventaActualizada[0]);
      res.json(ventaActualizada[0]);
    } catch (err) {
      console.error('Error actualizando venta:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ============================================================
// ELIMINAR
// ============================================================
router.delete('/:id', requierePermiso('ventas', 'eliminar'), verificarPeriodoAbierto(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    // ✅ Reutiliza el documento que ya leyó verificarPeriodoAbierto()
    const venta = req._documentoOriginal
      || await req.db.collection('ventas_v2').findOne({ _id: new ObjectId(id) });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    if (venta.estado_sri === 'AUTORIZADO') {
      return res.status(400).json({ error: 'Esta factura ya fue autorizada por el SRI. Genere una nota de crédito.' });
    }
    if (ESTADOS_SRI_BLOQUEADOS_PARA_DELETE.has(venta.estado_sri)) {
      return res.status(409).json({
        error: `No se puede eliminar: el documento está en estado "${venta.estado_sri}". Genere una nota de crédito.`,
        codigo: 'ESTADO_SRI_NO_ELIMINABLE',
        estado_sri: venta.estado_sri
      });
    }
    if ((venta.intentos_envio_sri || 0) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: el documento ya fue enviado al SRI. Genere una nota de crédito.',
        codigo: 'YA_ENVIADO_SRI',
        intentos: venta.intentos_envio_sri
      });
    }

    const pagosAsociados = await req.db.collection('pagos').countDocuments({
      ventaId: new ObjectId(id), anulado: { $ne: true }
    });
    if (pagosAsociados > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: hay ${pagosAsociados} pagos registrados. Anule los pagos primero.`,
        pagosAsociados
      });
    }

    await conTransaccion(req.db, async (session) => {
      const afectaStock = !['guia_remision', 'proforma', 'retencion'].includes(venta.tipo_documento);
      if (afectaStock) {
        const signoReversion = venta.tipo_documento === 'nota_credito' ? -1 : +1;
        for (const detalle of venta.detalles) {
          const productoId = new ObjectId(detalle.productoId);
          await actualizarStockAtomico(req.db, productoId, detalle.cantidad, signoReversion, session);
        }
        await req.db.collection('kardex').deleteMany(
          { referencia_id: new ObjectId(id), referencia_tipo: 'venta' },
          { session }
        );
      }
      await req.db.collection('ventas_v2').deleteOne({ _id: new ObjectId(id) }, { session });
    });

    await logAudit(req.db, req, {
      accion: 'eliminar', coleccion: 'ventas', documentoId: id,
      documentoNumero: venta.numero_factura || '',
      datosAnteriores: venta,
      detalle: `Venta eliminada: ${venta.numero_factura || ''}`
    });

    if (req.io) req.io.emit('venta-eliminada', { id });
    res.json({ message: 'Venta eliminada correctamente' });
  } catch (err) {
    console.error('Error eliminando venta:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;