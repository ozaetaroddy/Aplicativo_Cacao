// backend/routes/anexos.js
const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const { fechaSRI } = require('../utils/fechaEC');
const { MESES } = require('../utils/periodos');
const { TIPOS_VENTA_NO_ATS } = require('../utils/tiposDocumento');

function tipoIdentificacion(ruc) {
  if (!ruc) return '07';
  if (ruc.length === 13) return '04';
  if (ruc.length === 10) return '05';
  return '07';
}

function codigoComprobante(tipo) {
  const map = {
    factura: '01', liquidacion: '03', nota_credito: '04', nota_debito: '05',
    guia_remision: '06', retencion: '07', exportacion: '01', reembolso: '01'
  };
  return map[tipo] || '01';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function num(n) { return (parseFloat(n) || 0).toFixed(2); }

const CODIGO_INTERNO_RE = /^[A-Z]{2,4}-?\d+$/i;

function separarNumeroFactura(doc, config) {
  const estab = String(doc?.establecimiento || config?.establecimiento || '001').padStart(3, '0');
  const ptoEmi = String(doc?.punto_emision || config?.punto_emision || '001').padStart(3, '0');

  let secuencial;
  let placeholder = false;

  if (doc?.secuencial_sri) {
    secuencial = String(doc.secuencial_sri).replace(/\D/g, '').padStart(9, '0').slice(-9);
  } else {
    const numStr = String(doc?.numero_factura || '').trim();
    if (!numStr || CODIGO_INTERNO_RE.test(numStr)) {
      secuencial = '000000001';
      placeholder = true;
    } else {
      const soloDigitos = numStr.replace(/\D/g, '');
      secuencial = (soloDigitos.slice(-9) || '1').padStart(9, '0');
    }
  }

  return { estab, ptoEmi, secuencial, _placeholder: placeholder };
}

router.get('/ats/:anio/:mes', requierePermiso('reportes', 'ver'), async (req, res) => {
  try {
    const { anio, mes } = req.params;
    const anioNum = parseInt(anio);
    const mesNum = parseInt(mes);

    if (mesNum < 1 || mesNum > 12) return res.status(400).json({ error: 'Mes inválido (1-12)' });

    const inicio = new Date(anioNum, mesNum - 1, 1);
    const fin = new Date(anioNum, mesNum, 0);
    fin.setHours(23, 59, 59, 999);

    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });

    const ventas = await req.db.collection('ventas_v2').aggregate([
      {
        $match: {
          fecha_emision: { $gte: inicio, $lte: fin },
          tipo_documento: { $nin: [...TIPOS_VENTA_NO_ATS] }
        }
      },
      { $lookup: { from: 'clientes', localField: 'clienteId', foreignField: '_id', as: 'cliente' } },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
      { $sort: { fecha_emision: 1 } }
    ]).toArray();

    const ventasATS = ventas.map(v => {
      const esNC = v.tipo_documento === 'nota_credito';
      const total = v.total || 0;
      const subtotal = v.subtotal || 0;
      const iva = v.iva || 0;
      const detalles = v.detalles || [];
      let baseIVA = 0;
      let base0 = 0;
      for (const d of detalles) {
        const sub = (d.cantidad || 0) * (d.precio_unitario || 0);
        if (d.aplica_iva !== false) baseIVA += sub; else base0 += sub;
      }
      if (detalles.length === 0) { baseIVA = subtotal; base0 = 0; }

      return {
        tipo_id: tipoIdentificacion(v.cliente?.ruc),
        identificacion: v.cliente?.ruc || '9999999999999',
        razon_social: v.cliente?.nombre || 'CONSUMIDOR FINAL',
        tipo_comprobante: codigoComprobante(v.tipo_documento),
        numero_comprobante: v.numero_factura || '',
        fecha_emision: v.fecha_emision,
        base_no_grava: 0, base_0: base0, base_iva: baseIVA,
        iva, total,
        forma_pago: v.forma_pago || '01',
        estado: esNC ? 'ANULADO' : 'AUTORIZADO'
      };
    });

    const compras = await req.db.collection('compras_v2').aggregate([
      { $match: { fecha_emision: { $gte: inicio, $lte: fin } } },
      { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
      { $sort: { fecha_emision: 1 } }
    ]).toArray();

    const comprasSinNumeroSRI = [];
    const comprasSinAutorizacion = [];

    const comprasATS = compras.map(c => {
      const subtotal = c.subtotal || 0;
      const iva = c.iva || 0;
      const detalles = c.detalles || [];
      let baseIVA = 0;
      let base0 = 0;
      for (const d of detalles) {
        const sub = (d.cantidad || 0) * (d.costo_unitario || 0);
        if (d.aplica_iva !== false) baseIVA += sub; else base0 += sub;
      }
      if (detalles.length === 0) { baseIVA = subtotal; base0 = 0; }

      const { _placeholder } = separarNumeroFactura(c, config || {});
      if (_placeholder) {
        comprasSinNumeroSRI.push({
          id: c._id,
          numero_factura: c.numero_factura || '(vacío)',
          proveedor: c.proveedor?.nombre || '(sin proveedor)',
          total: c.total || 0
        });
      }

      const tieneAutorizacion = Boolean(c.numero_autorizacion || c.clave_acceso);
      if (!tieneAutorizacion) {
        comprasSinAutorizacion.push({
          id: c._id,
          numero_factura: c.numero_factura || '(vacío)',
          proveedor: c.proveedor?.nombre || '(sin proveedor)',
          total: c.total || 0
        });
      }

      return {
        tipo_id: tipoIdentificacion(c.proveedor?.ruc),
        identificacion: c.proveedor?.ruc || '',
        razon_social: c.proveedor?.nombre || '',
        tipo_comprobante: '01',
        numero_comprobante: c.numero_factura || '',
        fecha_emision: c.fecha_emision,
        fecha_autorizacion: c.fecha_emision,
        base_no_grava: 0, base_0: base0, base_iva: baseIVA,
        iva, total: c.total || 0,
        retencion_valor: c.retencion_valor || 0,
        tipo_compra: c.tipo_compra || 'inventario',
        forma_pago: c.forma_pago || '01',
        _requiere_revision: _placeholder || !tieneAutorizacion
      };
    });

    const retenciones = await req.db.collection('retenciones').aggregate([
      { $match: { fecha_emision: { $gte: inicio, $lte: fin } } },
      { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
      { $sort: { fecha_emision: 1 } }
    ]).toArray();

    const retencionesATS = retenciones.map(r => ({
      tipo_id: tipoIdentificacion(r.proveedor?.ruc),
      identificacion: r.proveedor?.ruc || '',
      razon_social: r.proveedor?.nombre || '',
      numero_factura: r.numero_factura || '',
      fecha_emision_factura: r.fecha_emision,
      numero_retencion: r.numero_retencion || '',
      fecha_retencion: r.fecha_emision,
      tipo_retencion: r.tipo_retencion || '',
      base_imponible: r.base_imponible || 0,
      porcentaje: r.porcentaje || 0,
      valor_retenido: r.valor_retenido || 0
    }));

    const advertencias = [];
    if (comprasSinNumeroSRI.length > 0) {
      advertencias.push({
        tipo: 'COMPRAS_SIN_NUMERO_SRI',
        severidad: 'alta',
        cantidad: comprasSinNumeroSRI.length,
        mensaje: `${comprasSinNumeroSRI.length} compras no tienen un número de factura del SRI (parecen códigos internos). En el XML se usará el secuencial "000000001" como placeholder. Corrígelas antes de subir el ATS.`,
        documentos: comprasSinNumeroSRI
      });
    }
    if (comprasSinAutorizacion.length > 0) {
      advertencias.push({
        tipo: 'COMPRAS_SIN_AUTORIZACION',
        severidad: 'media',
        cantidad: comprasSinAutorizacion.length,
        mensaje: `${comprasSinAutorizacion.length} compras no tienen número de autorización ni clave de acceso del SRI. El ATS puede ser rechazado.`,
        documentos: comprasSinAutorizacion
      });
    }

    const totales = {
      ventas: {
        cantidad: ventasATS.length,
        base0: ventasATS.reduce((s, v) => s + v.base_0, 0),
        baseIVA: ventasATS.reduce((s, v) => s + v.base_iva, 0),
        iva: ventasATS.reduce((s, v) => s + v.iva, 0),
        total: ventasATS.reduce((s, v) => s + v.total, 0)
      },
      compras: {
        cantidad: comprasATS.length,
        base0: comprasATS.reduce((s, c) => s + c.base_0, 0),
        baseIVA: comprasATS.reduce((s, c) => s + c.base_iva, 0),
        iva: comprasATS.reduce((s, c) => s + c.iva, 0),
        total: comprasATS.reduce((s, c) => s + c.total, 0),
        retenciones: comprasATS.reduce((s, c) => s + (c.retencion_valor || 0), 0)
      },
      retenciones: {
        cantidad: retencionesATS.length,
        base: retencionesATS.reduce((s, r) => s + r.base_imponible, 0),
        valor: retencionesATS.reduce((s, r) => s + r.valor_retenido, 0)
      },
      ivaPorPagar: 0
    };
    totales.ivaPorPagar = totales.ventas.iva - totales.compras.iva;

    const requiereConfirmacion = comprasSinNumeroSRI.length > 0;

    res.json({
      periodo: { anio: anioNum, mes: mesNum, nombre: `${MESES[mesNum - 1]} ${anioNum}`, desde: inicio, hasta: fin },
      ventas: ventasATS,
      compras: comprasATS,
      retenciones: retencionesATS,
      totales,
      advertencias,
      requiere_confirmacion_ats: requiereConfirmacion,
      generado: new Date()
    });
  } catch (err) {
    console.error('Error generando ATS:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/ats/:anio/:mes/xml', requierePermiso('reportes', 'ver'), async (req, res) => {
  try {
    const { anio, mes } = req.params;
    const anioNum = parseInt(anio);
    const mesNum = parseInt(mes);

    if (mesNum < 1 || mesNum > 12) return res.status(400).json({ error: 'Mes inválido' });

    const inicio = new Date(anioNum, mesNum - 1, 1);
    const fin = new Date(anioNum, mesNum, 0);
    fin.setHours(23, 59, 59, 999);

    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    if (!config) return res.status(400).json({ error: 'No hay configuración de empresa' });

    const [ventas, compras] = await Promise.all([
      req.db.collection('ventas_v2').aggregate([
        {
          $match: {
            fecha_emision: { $gte: inicio, $lte: fin },
            tipo_documento: { $nin: [...TIPOS_VENTA_NO_ATS] }
          }
        },
        { $lookup: { from: 'clientes', localField: 'clienteId', foreignField: '_id', as: 'cliente' } },
        { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
        { $sort: { fecha_emision: 1 } }
      ]).toArray(),
      req.db.collection('compras_v2').aggregate([
        { $match: { fecha_emision: { $gte: inicio, $lte: fin } } },
        { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
        { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
        { $sort: { fecha_emision: 1 } }
      ]).toArray()
    ]);

    const comprasConPlaceholder = compras.filter(c => separarNumeroFactura(c, config)._placeholder);
    const forzar = req.query.forzar === 'true';

    if (comprasConPlaceholder.length > 0 && !forzar) {
      return res.status(409).json({
        error: `Hay ${comprasConPlaceholder.length} compras sin número de factura SRI real (parecen códigos internos). Corrígelas o agrega ?forzar=true para exportar con placeholders.`,
        codigo: 'ATS_CON_PLACEHOLDERS',
        cantidad: comprasConPlaceholder.length,
        documentos: comprasConPlaceholder.map(c => ({
          id: c._id,
          numero_factura: c.numero_factura || '(vacío)',
          proveedor: c.proveedor?.nombre || '(sin proveedor)',
          total: c.total || 0
        }))
      });
    }

    const ruc = config.ruc || '';
    const razonSocial = config.razon_social || '';
    const establecimiento = (config.establecimiento || '001').padStart(3, '0');

    let totalVentasGlobal = 0;
    const porEstablecimiento = {};

    const ventasXml = ventas.map(v => {
      const esNC = v.tipo_documento === 'nota_credito';
      const detalles = v.detalles || [];
      let baseIVA = 0, base0 = 0;
      for (const d of detalles) {
        const sub = (d.cantidad || 0) * (d.precio_unitario || 0);
        if (d.aplica_iva !== false) baseIVA += sub; else base0 += sub;
      }
      if (detalles.length === 0) { baseIVA = v.subtotal || 0; }
      const signo = esNC ? -1 : 1;
      const total = signo * (v.total || 0);
      const iva = signo * (v.iva || 0);
      totalVentasGlobal += total;

      const estabDoc = String(v.establecimiento || config.establecimiento || '001').padStart(3, '0');
      if (!porEstablecimiento[estabDoc]) porEstablecimiento[estabDoc] = { ventas: 0, iva: 0 };
      porEstablecimiento[estabDoc].ventas += total;
      porEstablecimiento[estabDoc].iva += iva;

      return `      <detalleVentas>
        <tpIdCliente>${tipoIdentificacion(v.cliente?.ruc)}</tpIdCliente>
        <idCliente>${esc(v.cliente?.ruc || '9999999999999')}</idCliente>
        <parteRelVtas>NO</parteRelVtas>
        <tipoComprobante>${codigoComprobante(v.tipo_documento)}</tipoComprobante>
        <tipoEmision>F</tipoEmision>
        <numeroComprobantes>1</numeroComprobantes>
        <baseNoGraIva>0.00</baseNoGraIva>
        <baseImponible>${num(base0)}</baseImponible>
        <baseImpGrav>${num(baseIVA)}</baseImpGrav>
        <montoIva>${num(v.iva || 0)}</montoIva>
        <montoIce>0.00</montoIce>
        <valorRetIva>0.00</valorRetIva>
        <valorRetRenta>0.00</valorRetRenta>
      </detalleVentas>`;
    }).join('\n');

    const comprasXml = compras.map(c => {
      const detalles = c.detalles || [];
      let baseIVA = 0, base0 = 0;
      for (const d of detalles) {
        const sub = (d.cantidad || 0) * (d.costo_unitario || 0);
        if (d.aplica_iva !== false) baseIVA += sub; else base0 += sub;
      }
      if (detalles.length === 0) baseIVA = c.subtotal || 0;

      const { estab, ptoEmi, secuencial } = separarNumeroFactura(c, config);
      const tipoProv = tipoIdentificacion(c.proveedor?.ruc);

      return `      <detalleCompras>
        <codSustento>01</codSustento>
        <tpIdProv>${tipoProv}</tpIdProv>
        <idProv>${esc(c.proveedor?.ruc || '')}</idProv>
        <tipoComprobante>01</tipoComprobante>
        <parteRel>NO</parteRel>
        <fechaRegistro>${fechaSRI(c.fecha_emision)}</fechaRegistro>
        <establecimiento>${estab}</establecimiento>
        <puntoEmision>${ptoEmi}</puntoEmision>
        <secuencial>${secuencial}</secuencial>
        <fechaEmision>${fechaSRI(c.fecha_emision)}</fechaEmision>
        <autorizacion>${esc(c.numero_autorizacion || c.clave_acceso || '')}</autorizacion>
        <baseNoGraIva>0.00</baseNoGraIva>
        <baseImponible>${num(base0)}</baseImponible>
        <baseImpGrav>${num(baseIVA)}</baseImpGrav>
        <montoIce>0.00</montoIce>
        <montoIva>${num(c.iva || 0)}</montoIva>
        <valorRetBienes>${num(c.tipo_compra === 'inventario' ? (c.retencion_valor || 0) : 0)}</valorRetBienes>
        <valorRetServicios>${num(c.tipo_compra === 'gasto' ? (c.retencion_valor || 0) : 0)}</valorRetServicios>
        <valRetServ100>0.00</valRetServ100>
        <pagoLocExt>01</pagoLocExt>
        <tipoRegi>01</tipoRegi>
        <paisEfecPago>NA</paisEfecPago>
        <aplicConvDobTrib>NA</aplicConvDobTrib>
        <pagExtSujRetNorLeg>NA</pagExtSujRetNorLeg>
        <pagoRegFis>NA</pagoRegFis>
        <formaPago>${esc(c.forma_pago || '01')}</formaPago>
      </detalleCompras>`;
    }).join('\n');

    const establecimientos = Object.keys(porEstablecimiento).sort();
    if (establecimientos.length === 0) {
      establecimientos.push(establecimiento);
      porEstablecimiento[establecimiento] = { ventas: 0, iva: 0 };
    }

    const ventasEstab = establecimientos.map(cod => {
      const acum = porEstablecimiento[cod];
      return `      <ventaEst>
        <codEstab>${esc(cod)}</codEstab>
        <ventasEstab>${num(Math.max(0, acum.ventas))}</ventasEstab>
        <ivaEstab>${num(Math.max(0, acum.iva))}</ivaEstab>
      </ventaEst>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<iva>
  <TipoIDInformante>R</TipoIDInformante>
  <IdInformante>${esc(ruc)}</IdInformante>
  <razonSocial>${esc(razonSocial)}</razonSocial>
  <Anio>${anioNum}</Anio>
  <Mes>${String(mesNum).padStart(2, '0')}</Mes>
  <numEstabRuc>${establecimiento}</numEstabRuc>
  <totalVentas>${num(Math.max(0, totalVentasGlobal))}</totalVentas>
  <codigoOperativo>IVA</codigoOperativo>
  <compras>
${comprasXml || ''}
  </compras>
  <ventas>
${ventasXml || ''}
  </ventas>
  <ventasEstablecimiento>
${ventasEstab}
  </ventasEstablecimiento>
</iva>`;

    const sufijo = comprasConPlaceholder.length > 0 ? '_REVISAR' : '';

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition',
      `attachment; filename="ATS_${ruc}_${anioNum}_${String(mesNum).padStart(2, '0')}${sufijo}.xml"`);
    res.send(xml);
  } catch (err) {
    console.error('Error generando ATS XML:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;