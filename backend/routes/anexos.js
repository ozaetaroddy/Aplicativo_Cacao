// backend/routes/anexos.js
// ============================================================
// Anexos tributarios (ATS) — generación de reporte JSON y XML
// ------------------------------------------------------------
// Endpoints:
//   GET /api/anexos/ats/:anio/:mes           → resumen JSON
//   GET /api/anexos/ats/:anio/:mes/xml       → descarga XML del ATS
//
// Arquitectura:
//   cargarDatosPeriodo(db, inicio, fin)  →  {config, ventas, compras, retenciones}
//   construirVentasATS / construirComprasATS / construirRetencionesATS
//   construirAdvertencias / construirTotales
//   construirXmlATS(...)
// Los endpoints solo orquestan: validan → cargan → construyen → responden.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const { fechaSRI } = require('../utils/fechaEC');
const { MESES } = require('../utils/periodos');
const { TIPOS_VENTA_NO_ATS } = require('../utils/tiposDocumento');
const log = require('../utils/logger');

// ============================================================
// CONSTANTES
// ============================================================
const CODIGO_INTERNO_RE = /^[A-Z]{2,4}-?\d+$/i;
const RE_XML_INVALIDOS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

const ANIO_MIN = 2000;
const ANIO_MAX = new Date().getFullYear() + 1;
const RUC_CONSUMIDOR_FINAL = '9999999999999';

const MAPA_TIPO_COMPROBANTE = Object.freeze({
  factura: '01',
  liquidacion: '03',
  nota_credito: '04',
  nota_debito: '05',
  guia_remision: '06',
  retencion: '07',
  exportacion: '01',
  reembolso: '01'
});

const TIPOS_VENTA_NO_ATS_SET = new Set([...TIPOS_VENTA_NO_ATS]);

// ============================================================
// HELPERS DE FORMATO
// ============================================================

/** Escapa un valor para XML 1.0 (elimina chars inválidos y entidades). */
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(RE_XML_INVALIDOS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Formatea un número a 2 decimales como string; nunca devuelve NaN/Infinity. */
function num(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.00';
  return v.toFixed(2);
}

/** Rellena un secuencial SRI a 9 dígitos numéricos. */
function padSecuencial(n) {
  return String(n).replace(/\D/g, '').padStart(9, '0').slice(-9);
}

/** Construye un header Content-Disposition seguro (RFC 5987 + fallback). */
function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Devuelve una copia del objeto sin claves internas (prefijo `__`). */
function sinInternos(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (!k.startsWith('__')) out[k] = obj[k];
  }
  return out;
}

// ============================================================
// VALIDACIÓN
// ============================================================

/**
 * Valida y normaliza el período. Devuelve `{anio, mes, inicio, fin}` o `null`.
 */
function parsePeriodo(anioStr, mesStr) {
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  if (!Number.isInteger(anio) || anio < ANIO_MIN || anio > ANIO_MAX) return null;
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null;

  const inicio = new Date(anio, mes - 1, 1, 0, 0, 0, 0);
  const fin = new Date(anio, mes, 0, 23, 59, 59, 999); // último día del mes
  return { anio, mes, inicio, fin };
}

// ============================================================
// IDENTIFICACIÓN
// ============================================================
function tipoIdentificacion(ruc) {
  if (!ruc) return '07';
  const s = String(ruc).trim();
  if (!s) return '07';
  if (/^\d{13}$/.test(s)) return '04'; // RUC
  if (/^\d{10}$/.test(s)) return '05'; // Cédula
  if (/[A-Za-z]/.test(s)) return '08'; // identificación del exterior
  return '07';
}

function codigoComprobante(tipo) {
  return MAPA_TIPO_COMPROBANTE[tipo] || '01';
}

// ============================================================
// NÚMERO DE FACTURA / SECUENCIALES
// ============================================================
/**
 * Separa estab/ptoEmi/secuencial de una factura de compra.
 * Si `numero_factura` parece un código interno (p. ej. `FAC-123`) o está
 * vacío, se marca `_placeholder: true` para que el caller decida.
 */
function separarNumeroFactura(doc, config) {
  const cfg = config || {};
  const estab = String(doc?.establecimiento || cfg.establecimiento || '001').padStart(3, '0');
  const ptoEmi = String(doc?.punto_emision || cfg.punto_emision || '001').padStart(3, '0');

  let secuencial;
  let placeholder = false;

  if (doc?.secuencial_sri) {
    secuencial = padSecuencial(doc.secuencial_sri);
  } else {
    const numStr = String(doc?.numero_factura || '').trim();
    if (!numStr || CODIGO_INTERNO_RE.test(numStr)) {
      secuencial = '000000001';
      placeholder = true;
    } else {
      const soloDigitos = numStr.replace(/\D/g, '');
      secuencial = soloDigitos ? padSecuencial(soloDigitos) : '000000001';
      if (!soloDigitos) placeholder = true;
    }
  }
  return { estab, ptoEmi, secuencial, _placeholder: placeholder };
}

// ============================================================
// CÁLCULO DE BASES IMPONIBLES
// ============================================================
/**
 * Calcula bases 0% e IVA a partir de los detalles.
 * @param {Array} detalles
 * @param {string} campoPrecio  'precio_unitario' | 'costo_unitario'
 * @param {number} subtotalFallback  usado si no hay detalles
 */
function calcularBases(detalles, campoPrecio, subtotalFallback = 0) {
  let baseIVA = 0;
  let base0 = 0;
  if (Array.isArray(detalles) && detalles.length > 0) {
    for (const d of detalles) {
      const sub = (d.cantidad || 0) * (d[campoPrecio] || 0);
      if (d.aplica_iva !== false) baseIVA += sub;
      else base0 += sub;
    }
  } else {
    baseIVA = Number(subtotalFallback) || 0;
  }
  return { baseIVA, base0 };
}

// ============================================================
// CARGA DE DATOS (una sola vez para JSON y XML)
// ============================================================

async function cargarConfiguracion(db) {
  return db.collection('configuracion').findOne({ _id: 'empresa' });
}

async function cargarVentas(db, inicio, fin) {
  return db.collection('ventas_v2').aggregate([
    {
      $match: {
        fecha_emision: { $gte: inicio, $lte: fin },
        tipo_documento: { $nin: [...TIPOS_VENTA_NO_ATS_SET] }
      }
    },
    { $lookup: { from: 'clientes', localField: 'clienteId', foreignField: '_id', as: 'cliente' } },
    { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
    { $sort: { fecha_emision: 1 } }
  ]).toArray();
}

async function cargarCompras(db, inicio, fin) {
  return db.collection('compras_v2').aggregate([
    { $match: { fecha_emision: { $gte: inicio, $lte: fin } } },
    { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
    { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
    { $sort: { fecha_emision: 1 } }
  ]).toArray();
}

async function cargarRetenciones(db, inicio, fin) {
  return db.collection('retenciones').aggregate([
    { $match: { fecha_emision: { $gte: inicio, $lte: fin } } },
    { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
    { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
    { $sort: { fecha_emision: 1 } }
  ]).toArray();
}

/** Carga todo lo necesario en paralelo. */
async function cargarDatosPeriodo(db, inicio, fin) {
  const [config, ventas, compras, retenciones] = await Promise.all([
    cargarConfiguracion(db),
    cargarVentas(db, inicio, fin),
    cargarCompras(db, inicio, fin),
    cargarRetenciones(db, inicio, fin)
  ]);
  return { config, ventas, compras, retenciones };
}

// ============================================================
// CONSTRUCCIÓN DE BLOQUES ATS
// ============================================================

/** Resumen mínimo de un documento para las advertencias. */
function resumenDoc(doc) {
  return {
    id: doc._id,
    numero_factura: doc.numero_factura || '(vacío)',
    proveedor: doc.proveedor?.nombre || '(sin proveedor)',
    total: doc.total || 0
  };
}

function construirVentasATS(ventas) {
  return ventas.map(v => {
    const esNC = v.tipo_documento === 'nota_credito';
    const { baseIVA, base0 } = calcularBases(v.detalles, 'precio_unitario', v.subtotal);
    const signo = esNC ? -1 : 1;

    return {
      tipo_id: tipoIdentificacion(v.cliente?.ruc),
      identificacion: v.cliente?.ruc || RUC_CONSUMIDOR_FINAL,
      razon_social: v.cliente?.nombre || 'CONSUMIDOR FINAL',
      tipo_comprobante: codigoComprobante(v.tipo_documento),
      numero_comprobante: v.numero_factura || '',
      fecha_emision: v.fecha_emision,
      base_no_grava: 0,
      base_0: base0,
      base_iva: baseIVA,
      iva: v.iva || 0,
      total: v.total || 0,
      forma_pago: v.forma_pago || '01',
      estado: esNC ? 'ANULADO' : 'AUTORIZADO',
      // Internos para XML (stripped en respuesta JSON):
      __estabDoc: String(v.establecimiento || '').padStart(3, '0') || '001',
      __signo: signo,
      __totalConSigno: signo * (v.total || 0),
      __ivaConSigno: signo * (v.iva || 0),
      __esNC: esNC
    };
  });
}

function construirComprasATS(compras, config) {
  const comprasSinNumeroSRI = [];
  const comprasSinAutorizacion = [];

  const items = compras.map(c => {
    const { baseIVA, base0 } = calcularBases(c.detalles, 'costo_unitario', c.subtotal);
    const { estab, ptoEmi, secuencial, _placeholder } = separarNumeroFactura(c, config);
    const tieneAutorizacion = Boolean(c.numero_autorizacion || c.clave_acceso);

    if (_placeholder) comprasSinNumeroSRI.push(resumenDoc(c));
    if (!tieneAutorizacion) comprasSinAutorizacion.push(resumenDoc(c));

    return {
      tipo_id: tipoIdentificacion(c.proveedor?.ruc),
      identificacion: c.proveedor?.ruc || '',
      razon_social: c.proveedor?.nombre || '',
      tipo_comprobante: '01',
      numero_comprobante: c.numero_factura || '',
      fecha_emision: c.fecha_emision,
      fecha_autorizacion: c.fecha_emision,
      base_no_grava: 0,
      base_0: base0,
      base_iva: baseIVA,
      iva: c.iva || 0,
      total: c.total || 0,
      retencion_valor: c.retencion_valor || 0,
      tipo_compra: c.tipo_compra || 'inventario',
      forma_pago: c.forma_pago || '01',
      _requiere_revision: _placeholder || !tieneAutorizacion,
      // Internos para XML:
      __estab: estab,
      __ptoEmi: ptoEmi,
      __secuencial: secuencial,
      __placeholder: _placeholder,
      __tieneAutorizacion: tieneAutorizacion,
      __numeroAutorizacion: c.numero_autorizacion || c.clave_acceso || ''
    };
  });

  return { items, comprasSinNumeroSRI, comprasSinAutorizacion };
}

function construirRetencionesATS(retenciones) {
  return retenciones.map(r => ({
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
}

// ============================================================
// ADVERTENCIAS Y TOTALES
// ============================================================
function construirAdvertencias({ comprasSinNumeroSRI, comprasSinAutorizacion }) {
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

  return advertencias;
}

function sumar(arr, campo) {
  return arr.reduce((s, x) => s + (Number(x[campo]) || 0), 0);
}

function construirTotales(ventasATS, comprasATS, retencionesATS) {
  const ventas = {
    cantidad: ventasATS.length,
    base0: sumar(ventasATS, 'base_0'),
    baseIVA: sumar(ventasATS, 'base_iva'),
    iva: sumar(ventasATS, 'iva'),
    total: sumar(ventasATS, 'total')
  };
  const compras = {
    cantidad: comprasATS.length,
    base0: sumar(comprasATS, 'base_0'),
    baseIVA: sumar(comprasATS, 'base_iva'),
    iva: sumar(comprasATS, 'iva'),
    total: sumar(comprasATS, 'total'),
    retenciones: sumar(comprasATS, 'retencion_valor')
  };
  const retenciones = {
    cantidad: retencionesATS.length,
    base: sumar(retencionesATS, 'base_imponible'),
    valor: sumar(retencionesATS, 'valor_retenido')
  };
  return { ventas, compras, retenciones, ivaPorPagar: ventas.iva - compras.iva };
}

// ============================================================
// BUILDER XML (funciones puras)
// ============================================================
function xmlDetalleVenta(v) {
  return `      <detalleVentas>
        <tpIdCliente>${esc(v.tipo_id)}</tpIdCliente>
        <idCliente>${esc(v.identificacion)}</idCliente>
        <parteRelVtas>NO</parteRelVtas>
        <tipoComprobante>${esc(v.tipo_comprobante)}</tipoComprobante>
        <tipoEmision>F</tipoEmision>
        <numeroComprobantes>1</numeroComprobantes>
        <baseNoGraIva>0.00</baseNoGraIva>
        <baseImponible>${num(v.base_0)}</baseImponible>
        <baseImpGrav>${num(v.base_iva)}</baseImpGrav>
        <montoIva>${num(v.iva)}</montoIva>
        <montoIce>0.00</montoIce>
        <valorRetIva>0.00</valorRetIva>
        <valorRetRenta>0.00</valorRetRenta>
      </detalleVentas>`;
}

function xmlDetalleCompra(c) {
  const retBienes = c.tipo_compra === 'inventario' ? c.retencion_valor : 0;
  const retServicios = c.tipo_compra === 'gasto' ? c.retencion_valor : 0;
  return `      <detalleCompras>
        <codSustento>01</codSustento>
        <tpIdProv>${esc(c.tipo_id)}</tpIdProv>
        <idProv>${esc(c.identificacion)}</idProv>
        <tipoComprobante>01</tipoComprobante>
        <parteRel>NO</parteRel>
        <fechaRegistro>${esc(fechaSRI(c.fecha_emision))}</fechaRegistro>
        <establecimiento>${esc(c.__estab)}</establecimiento>
        <puntoEmision>${esc(c.__ptoEmi)}</puntoEmision>
        <secuencial>${esc(c.__secuencial)}</secuencial>
        <fechaEmision>${esc(fechaSRI(c.fecha_emision))}</fechaEmision>
        <autorizacion>${esc(c.__numeroAutorizacion)}</autorizacion>
        <baseNoGraIva>0.00</baseNoGraIva>
        <baseImponible>${num(c.base_0)}</baseImponible>
        <baseImpGrav>${num(c.base_iva)}</baseImpGrav>
        <montoIce>0.00</montoIce>
        <montoIva>${num(c.iva)}</montoIva>
        <valorRetBienes>${num(retBienes)}</valorRetBienes>
        <valorRetServicios>${num(retServicios)}</valorRetServicios>
        <valRetServ100>0.00</valRetServ100>
        <pagoLocExt>01</pagoLocExt>
        <tipoRegi>01</tipoRegi>
        <paisEfecPago>NA</paisEfecPago>
        <aplicConvDobTrib>NA</aplicConvDobTrib>
        <pagExtSujRetNorLeg>NA</pagExtSujRetNorLeg>
        <pagoRegFis>NA</pagoRegFis>
        <formaPago>${esc(c.forma_pago)}</formaPago>
      </detalleCompras>`;
}

/**
 * Construye el XML completo del ATS.
 * @param {object} p
 * @param {object} p.periodo      {anio, mes}
 * @param {object} p.config       configuración de la empresa
 * @param {Array}  p.ventasATS    salida de construirVentasATS
 * @param {Array}  p.comprasATS   salida de construirComprasATS.items
 */
function construirXmlATS({ periodo, config, ventasATS, comprasATS }) {
  const ruc = config.ruc || '';
  const razonSocial = config.razon_social || '';
  const establecimiento = String(config.establecimiento || '001').padStart(3, '0');

  // Agregados por establecimiento
  let totalVentasGlobal = 0;
  const porEstablecimiento = {};
  for (const v of ventasATS) {
    totalVentasGlobal += v.__totalConSigno;
    const cod = v.__estabDoc || establecimiento;
    if (!porEstablecimiento[cod]) porEstablecimiento[cod] = { ventas: 0, iva: 0 };
    porEstablecimiento[cod].ventas += v.__totalConSigno;
    porEstablecimiento[cod].iva += v.__ivaConSigno;
  }
  let establecimientos = Object.keys(porEstablecimiento).sort();
  if (establecimientos.length === 0) {
    establecimientos = [establecimiento];
    porEstablecimiento[establecimiento] = { ventas: 0, iva: 0 };
  }

  const ventasXml = ventasATS.map(xmlDetalleVenta).join('\n');
  const comprasXml = comprasATS.map(xmlDetalleCompra).join('\n');
  const ventasEstab = establecimientos.map(cod => {
    const a = porEstablecimiento[cod];
    return `      <ventaEst>
        <codEstab>${esc(cod)}</codEstab>
        <ventasEstab>${num(Math.max(0, a.ventas))}</ventasEstab>
        <ivaEstab>${num(Math.max(0, a.iva))}</ivaEstab>
      </ventaEst>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<iva>
  <TipoIDInformante>R</TipoIDInformante>
  <IdInformante>${esc(ruc)}</IdInformante>
  <razonSocial>${esc(razonSocial)}</razonSocial>
  <Anio>${periodo.anio}</Anio>
  <Mes>${String(periodo.mes).padStart(2, '0')}</Mes>
  <numEstabRuc>${esc(establecimiento)}</numEstabRuc>
  <totalVentas>${num(Math.max(0, totalVentasGlobal))}</totalVentas>
  <codigoOperativo>IVA</codigoOperativo>
  <compras>
${comprasXml}
  </compras>
  <ventas>
${ventasXml}
  </ventas>
  <ventasEstablecimiento>
${ventasEstab}
  </ventasEstablecimiento>
</iva>`;
}

// ============================================================
// ENDPOINTS
// ============================================================

// GET /api/anexos/ats/:anio/:mes  →  resumen JSON
router.get('/ats/:anio/:mes', requierePermiso('reportes', 'ver'), async (req, res, next) => {
  try {
    const periodo = parsePeriodo(req.params.anio, req.params.mes);
    if (!periodo) {
      return res.status(400).json({
        error: `Período inválido. Mes 1-12, año ${ANIO_MIN}-${ANIO_MAX}.`,
        codigo: 'PERIODO_INVALIDO'
      });
    }

    const { config, ventas, compras, retenciones } = await cargarDatosPeriodo(
      req.db, periodo.inicio, periodo.fin
    );

    const ventasATS = construirVentasATS(ventas);
    const { items: comprasATS, comprasSinNumeroSRI, comprasSinAutorizacion } =
      construirComprasATS(compras, config);
    const retencionesATS = construirRetencionesATS(retenciones);

    const advertencias = construirAdvertencias({ comprasSinNumeroSRI, comprasSinAutorizacion });
    const totales = construirTotales(ventasATS, comprasATS, retencionesATS);
    const requiereConfirmacion = comprasSinNumeroSRI.length > 0;

    return res.json({
      periodo: {
        anio: periodo.anio,
        mes: periodo.mes,
        nombre: `${MESES[periodo.mes - 1]} ${periodo.anio}`,
        desde: periodo.inicio,
        hasta: periodo.fin
      },
      ventas: ventasATS.map(sinInternos),
      compras: comprasATS.map(sinInternos),
      retenciones: retencionesATS,
      totales,
      advertencias,
      requiere_confirmacion_ats: requiereConfirmacion,
      generado: new Date()
    });
  } catch (err) {
    // Delegamos al errorHandler central (mensajes sanitizados, reqId, etc.)
    return next(err);
  }
});

// GET /api/anexos/ats/:anio/:mes/xml  →  descarga XML del ATS
router.get('/ats/:anio/:mes/xml', requierePermiso('reportes', 'ver'), async (req, res, next) => {
  try {
    const periodo = parsePeriodo(req.params.anio, req.params.mes);
    if (!periodo) {
      return res.status(400).json({
        error: `Período inválido. Mes 1-12, año ${ANIO_MIN}-${ANIO_MAX}.`,
        codigo: 'PERIODO_INVALIDO'
      });
    }

    const { config, ventas, compras } = await cargarDatosPeriodo(
      req.db, periodo.inicio, periodo.fin
    );

    if (!config) {
      return res.status(400).json({
        error: 'No hay configuración de empresa registrada',
        codigo: 'SIN_CONFIG_EMPRESA'
      });
    }

    const ventasATS = construirVentasATS(ventas);
    const { items: comprasATS } = construirComprasATS(compras, config);

    // Gate: si hay compras con placeholder y no se fuerza → 409
    const conPlaceholder = comprasATS.filter(c => c.__placeholder);
    const forzar = req.query.forzar === 'true';
    if (conPlaceholder.length > 0 && !forzar) {
      return res.status(409).json({
        error: `Hay ${conPlaceholder.length} compras sin número de factura SRI real (parecen códigos internos). Corrígelas o agrega ?forzar=true para exportar con placeholders.`,
        codigo: 'ATS_CON_PLACEHOLDERS',
        cantidad: conPlaceholder.length,
        documentos: conPlaceholder.map(sinInternos).map(c => ({
          id: c._id,
          numero_factura: c.numero_comprobante || '(vacío)',
          proveedor: c.razon_social || '(sin proveedor)',
          total: c.total
        }))
      });
    }

    const xml = construirXmlATS({ periodo, config, ventasATS, comprasATS });

    const ruc = config.ruc || 'SIN_RUC';
    const mm = String(periodo.mes).padStart(2, '0');
    const sufijo = conPlaceholder.length > 0 ? '_REVISAR' : '';
    const filename = `ATS_${ruc}_${periodo.anio}_${mm}${sufijo}.xml`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', contentDisposition(filename));
    res.setHeader('Cache-Control', 'no-store');
    if (conPlaceholder.length > 0) {
      res.setHeader('X-ATS-Placeholders', String(conPlaceholder.length));
    }
    return res.send(xml);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;