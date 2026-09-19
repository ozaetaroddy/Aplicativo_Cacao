// backend/routes/compras.js
// ============================================================
// Compras — CRUD + reportes + importación TXT + AUTO-RETENCIÓN
// ------------------------------------------------------------
// Endpoints:
//   GET    /                                     → listado
//   GET    /cuentas-por-pagar                    → aging de CxP
//   GET    /por-proveedor                        → totales por proveedor
//   GET    /reporte-mensual/:mes/:anio           → reporte del mes
//   GET    /:id                                  → detalle
//   POST   /                                     → crear
//   PUT    /:id                                  → actualizar
//   DELETE /:id                                  → eliminar
//   POST   /importar-txt                         → importar lote
//
// Convenciones:
//   - Todas las rutas requieren permisos (`compras:*`).
//   - Escrituras pasan por `verificarPeriodoAbierto()`.
//   - Cambios de stock se hacen dentro de transacción con guard de cantidad.
//   - Errores se delegan al `errorHandler` central.
//
// 🔧 FIXES HISTÓRICOS:
//   1. Los contadores de compra se reservan FUERA de la transacción.
//   2. `importar-txt`: reserva N contadores del lote en UNA sola
//      operación atómica.
//   3. `importar-txt`: ya no exige producto para compras de tipo
//      'gasto'.
//
// 🆕 FIX 2025-XX (AUTO-RETENCIÓN):
//   4. Al crear/editar una compra con `retencion_valor > 0`, se
//      emite AUTOMÁTICAMENTE el comprobante de retención en
//      `ventas_v2` (tipo_documento='retencion'), con clave de
//      acceso SRI, XML y firma electrónica.
//   5. Si falla, la compra NO se revierte: queda marcada con
//      `retencion_pendiente_emision: true` para reintento manual.
//   6. Al editar/eliminar la compra, la retención se re-sincroniza
//      (solo si NO fue enviada al SRI).
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');
const {
  verificarPeriodoAbierto,
  obtenerPeriodosCerradosEnFechas,
  MESES
} = require('../utils/periodos');
const { conTransaccion } = require('../utils/transacciones');
const { validar } = require('../utils/validacion');
const log = require('../utils/logger');

// ---- Auto-retención ----
const {
  generarClaveAcceso,
  formatearSerie
} = require('../utils/claveAcceso');
const { generarXMLComprobante } = require('../utils/xmlComprobante');
const {
  cargarCertificado,
  firmarXML,
  descifrarSecreto
} = require('../utils/firmaElectronica');
const { TIPO_COMPROBANTE_SRI } = require('../utils/tiposDocumento');
const { buscarRetencion } = require('../data/catalogosSRI');
const { fechaSRI } = require('../utils/fechaEC');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  colCompras: 'compras_v2',
  colProveedores: 'proveedores',
  colProductos: 'productos',
  colKardex: 'kardex',
  colPagos: 'pagos',
  colRetenciones: 'retenciones',
  colContadores: 'contadores',
  colVentas: 'ventas_v2',            // ← retenciones emitidas
  colConfig: 'configuracion',        // ← RUC / ambiente empresa
  colCertificados: 'certificados',   // ← certificado .p12

  tiposCompra: Object.freeze(['inventario', 'gasto']),
  estadosPago: Object.freeze(['pendiente', 'pagado', 'parcial', 'anulado']),
  maxDetallesPorDocumento: 500,
  importBatchSize: 50,
  importMaxLineas: 500,
  anioMin: 2000,
  anioMax: 2100
});

const TIPOS_COMPRA_VALIDOS = CONFIG.tiposCompra;
const ESTADOS_PAGO_VALIDOS = CONFIG.estadosPago;
const MAX_DETALLES_POR_DOCUMENTO = CONFIG.maxDetallesPorDocumento;
const IMPORT_BATCH_SIZE = CONFIG.importBatchSize;
const IMPORT_MAX_LINEAS = CONFIG.importMaxLineas;

/** Mapa impuesto declarado → código SRI ('1' RENTA | '2' IVA). */
const CODIGO_IMPUESTO_RETENCION = Object.freeze({ RENTA: '1', IVA: '2' });

// ============================================================
// HELPERS GENERALES
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

function requireObjectId(id, codigo = 'ID_INVALIDO') {
  if (!ObjectId.isValid(id)) {
    const err = new Error('ID inválido');
    err.status = 400;
    err.codigo = codigo;
    throw err;
  }
  return new ObjectId(id);
}

function parseFecha(v) {
  const s = soloString(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar compra');
  }
}

// ============================================================
// VALIDACIONES DE NEGOCIO
// ============================================================
const validarCompra = [
  body('proveedorId').isMongoId().withMessage('ID de proveedor inválido'),
  body('fecha_emision').isISO8601().withMessage('Fecha inválida'),
  body('detalles').isArray({ min: 1 }).withMessage('Debe incluir al menos un detalle')
    .custom(arr => Array.isArray(arr) && arr.length <= MAX_DETALLES_POR_DOCUMENTO)
    .withMessage(`Máximo ${MAX_DETALLES_POR_DOCUMENTO} detalles por documento`),
  body('subtotal').isNumeric().withMessage('Subtotal debe ser número'),
  body('iva').isNumeric().withMessage('IVA debe ser número'),
  body('total').isNumeric().withMessage('Total debe ser número'),
  body('tipo_compra').optional().isIn(TIPOS_COMPRA_VALIDOS)
    .withMessage(`Tipo de compra debe ser: ${TIPOS_COMPRA_VALIDOS.join(' o ')}`),
  body('estado_pago').optional().isIn(ESTADOS_PAGO_VALIDOS)
    .withMessage(`Estado de pago inválido. Válidos: ${ESTADOS_PAGO_VALIDOS.join(', ')}`),
  body('numero_factura').optional({ nullable: true }).isString().trim()
    .isLength({ max: 50 }).withMessage('Número de factura demasiado largo'),
  body('observaciones').optional({ nullable: true }).isString().trim()
    .isLength({ max: 1000 }).withMessage('Observaciones demasiado largas'),
  body('impuestos_retencion').optional().isArray()
    .withMessage('impuestos_retencion debe ser un array')
];

function validarTotales(body) {
  const subtotal = toNumber(body.subtotal);
  const iva = toNumber(body.iva);
  const total = toNumber(body.total);
  const esperado = round2(subtotal + iva);
  if (Math.abs(esperado - total) > 0.01) {
    return `Total inconsistente: subtotal(${subtotal}) + iva(${iva}) = ${esperado}, pero se envió total=${total}`;
  }
  return null;
}

function validarFechaNoFutura(fecha) {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return 'Fecha inválida';
  const limite = new Date();
  limite.setHours(23, 59, 59, 999);
  limite.setDate(limite.getDate() + 1);
  if (d > limite) return 'La fecha de emisión no puede ser futura';
  return null;
}

function validarDetalle(detalle) {
  const cantidad = Number(detalle?.cantidad);
  const costo = Number(detalle?.costo_unitario);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return `Cantidad inválida en detalle (debe ser > 0): ${detalle?.cantidad}`;
  }
  if (!Number.isFinite(costo) || costo < 0) {
    return `Costo unitario inválido (debe ser >= 0): ${detalle?.costo_unitario}`;
  }
  return null;
}

// ============================================================
// HELPERS DE CONTADORES
// ============================================================
async function reservarContadorCompra(db) {
  const r = await db.collection(CONFIG.colContadores).findOneAndUpdate(
    { _id: 'compra' },
    { $inc: { valor: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const doc = r && r.value !== undefined ? r.value : r;
  return toNumber(doc?.valor, 1);
}

async function reservarContadoresCompraLote(db, cantidad) {
  const n = Number(cantidad);
  if (!Number.isInteger(n) || n <= 0) return [];

  const r = await db.collection(CONFIG.colContadores).findOneAndUpdate(
    { _id: 'compra' },
    { $inc: { valor: n } },
    { upsert: true, returnDocument: 'after' }
  );

  const doc = r && r.value !== undefined ? r.value : r;
  const valorFinal = toNumber(doc?.valor, 0);

  if (valorFinal < n) {
    log.warn(
      { valorFinal, cantidad: n },
      'Contador de compras no devolvió el valor esperado; reservando uno por uno'
    );
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(await reservarContadorCompra(db));
    }
    return out;
  }

  const valorInicial = valorFinal - n + 1;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = valorInicial + i;
  return out;
}

// ============================================================
// HELPERS DE STOCK
// ============================================================
async function actualizarStockAtomico(db, productoId, cantidad, signoStock, session, extras = {}) {
  const cant = Math.abs(Number(cantidad));
  const filtro = signoStock < 0
    ? { _id: productoId, stock: { $gte: cant } }
    : { _id: productoId };

  const r = await db.collection(CONFIG.colProductos).updateOne(
    filtro,
    { $inc: { stock: signoStock * cant }, $set: { updatedAt: new Date(), ...extras } },
    { session }
  );

  if (r.matchedCount === 0) {
    const err = new Error(
      `No se puede aplicar el cambio de stock: el producto ${productoId} no existe o no hay stock suficiente ` +
      `(se intentó ${signoStock < 0 ? 'restar' : 'sumar'} ${cant} unidades)`
    );
    err.status = 409;
    err.codigo = 'STOCK_INSUFICIENTE';
    throw err;
  }

  return await db.collection(CONFIG.colProductos).findOne({ _id: productoId }, { session });
}

async function revertirStockDeCompra(db, compra, session) {
  if (compra.tipo_compra !== 'inventario') return;
  for (const detalle of compra.detalles || []) {
    const productoId = new ObjectId(detalle.productoId);
    await actualizarStockAtomico(db, productoId, detalle.cantidad, -1, session);
  }
  await db.collection(CONFIG.colKardex).deleteMany(
    { referencia_id: compra._id, referencia_tipo: 'compra' },
    { session }
  );
}

async function aplicarStockDeCompra(db, compraId, detalles, fechaEmision, session) {
  for (const detalle of detalles) {
    const productoId = new ObjectId(detalle.productoId);
    const productoActualizado = await actualizarStockAtomico(
      db, productoId, detalle.cantidad, +1, session,
      { precio_compra: toNumber(detalle.costo_unitario) }
    );

    await db.collection(CONFIG.colKardex).insertOne({
      productoId,
      fecha: new Date(fechaEmision),
      tipo_movimiento: 'compra',
      cantidad: toNumber(detalle.cantidad),
      costo_unitario: toNumber(detalle.costo_unitario),
      saldo: productoActualizado.stock,
      referencia_id: compraId,
      referencia_tipo: 'compra',
      createdAt: new Date()
    }, { session });
  }
}

async function traerCompraPopulada(db, compraId) {
  const r = await db.collection(CONFIG.colCompras).aggregate([
    { $match: { _id: compraId } },
    { $lookup: { from: CONFIG.colProveedores, localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
    { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } }
  ]).toArray();
  return r[0] || null;
}

// ============================================================
// AUTO-RETENCIÓN — Helpers
// ============================================================

/** Carga el certificado de firma de la empresa (silencioso). */
async function cargarCertificadoSeguro(db) {
  try {
    const cert = await db.collection(CONFIG.colCertificados).findOne({ _id: 'empresa' });
    if (!cert) return null;
    const password = cert.password_cifrado
      ? descifrarSecreto(cert.password_cifrado)
      : cert.password;
    const p12Buffer = Buffer.from(cert.archivo_base64, 'base64');
    const { privateKeyPem, certificatePem } = cargarCertificado(p12Buffer, password);
    return { privateKeyPem, certificatePem };
  } catch (e) {
    log.warn({ err: e.message }, 'No se pudo cargar el certificado (auto-retención)');
    return null;
  }
}

/**
 * Normaliza el array de impuestos de retención.
 *
 * Prioridad:
 *   1. Si el frontend envía `impuestos_retencion[]` bien formado → se usa.
 *   2. Si no, se construye un fallback razonable según `tipo_compra`:
 *      - inventario → RENTA 1% (303) + IVA 30% (721) [si IVA > 0]
 *      - gasto      → RENTA 2% (312) + IVA 70% (723) [si IVA > 0]
 *   3. Si nada funciona, se devuelve [] y se emite advertencia.
 */
function normalizarImpuestosRetencion(impuestosRaw, ctx) {
  const {
    subtotal = 0,
    iva = 0,
    retencionPorcentaje = 0,
    retencionValor = 0,
    tipoCompra = 'inventario',
    numeroFactura = '',
    fechaEmision = ''
  } = ctx || {};

  // ---- Caso 1: frontend envió array válido ----
  if (Array.isArray(impuestosRaw) && impuestosRaw.length > 0) {
    const out = [];
    for (const imp of impuestosRaw) {
      if (!imp) continue;
      const codigoRet = String(imp.codigoRetencion || imp.tipo_retencion || '').trim();
      if (!codigoRet) continue;

      const impuestoDecl = String(imp.impuesto || imp.impuesto_retencion || '')
        .trim().toUpperCase();
      const cat = buscarRetencion(codigoRet, impuestoDecl || undefined);
      const impuestoFinal = impuestoDecl
        || cat?.impuesto
        || 'RENTA';

      const codigoSRI = CODIGO_IMPUESTO_RETENCION[impuestoFinal] || '1';
      const base = round2(Number(imp.baseImponible) || 0);
      const pct = Number(imp.porcentajeRetener) > 0
        ? Number(imp.porcentajeRetener)
        : (cat?.porcentaje || 0);
      const valorCalc = round2(base * pct / 100);
      const valor = Number.isFinite(Number(imp.valorRetenido))
        ? round2(Number(imp.valorRetenido))
        : valorCalc;

      out.push({
        codigo: codigoSRI,
        codigoRetencion: codigoRet,
        impuesto: impuestoFinal,
        concepto: String(imp.concepto || cat?.nombre || '').trim(),
        baseImponible: base,
        porcentajeRetener: round2(pct),
        valorRetenido: valor,
        codigoDocumento: String(imp.codigoDocumento || imp.codDocSustento || '01').trim(),
        numeroDocumento: String(imp.numeroDocumento || imp.numDocSustento || numeroFactura).trim(),
        fechaEmisionDocSustento: String(
          imp.fechaEmisionDocSustento || fechaEmision || ''
        ).trim()
      });
    }
    if (out.length > 0) {
      return {
        impuestos: out,
        advertencias: [],
        origen: 'frontend'
      };
    }
  }

  // ---- Caso 2: fallback heurístico según tipo_compra ----
  if (retencionValor <= 0 && !retencionPorcentaje) {
    return { impuestos: [], advertencias: [], origen: 'vacio' };
  }

  const subtotalNum = round2(subtotal);
  const ivaNum = round2(iva);
  const totalRet = round2(retencionValor);

  const advertencias = [
    'La retención se generó con impuestos por defecto. ' +
    'Verifica el comprobante y ajústalo si es necesario.'
  ];

  const impuestos = [];

  if (tipoCompra === 'inventario') {
    // RENTA 1% sobre subtotal (código 303 — Bienes muebles corporales)
    const valorRenta = round2(subtotalNum * 0.01);
    if (valorRenta > 0) {
      impuestos.push({
        codigo: CODIGO_IMPUESTO_RETENCION.RENTA,
        codigoRetencion: '303',
        impuesto: 'RENTA',
        concepto: '1% Bienes muebles corporales (auto)',
        baseImponible: subtotalNum,
        porcentajeRetener: 1,
        valorRetenido: valorRenta,
        codigoDocumento: '01',
        numeroDocumento: numeroFactura,
        fechaEmisionDocSustento: fechaEmision
      });
    }
    // IVA 30% sobre IVA (código 721)
    if (ivaNum > 0) {
      const valorIva = round2(ivaNum * 0.30);
      if (valorIva > 0) {
        impuestos.push({
          codigo: CODIGO_IMPUESTO_RETENCION.IVA,
          codigoRetencion: '721',
          impuesto: 'IVA',
          concepto: '30% IVA bienes (auto)',
          baseImponible: ivaNum,
          porcentajeRetener: 30,
          valorRetenido: valorIva,
          codigoDocumento: '01',
          numeroDocumento: numeroFactura,
          fechaEmisionDocSustento: fechaEmision
        });
      }
    }
  } else {
    // gasto → RENTA 2% (código 312 — Servicios)
    const valorRenta = round2(subtotalNum * 0.02);
    if (valorRenta > 0) {
      impuestos.push({
        codigo: CODIGO_IMPUESTO_RETENCION.RENTA,
        codigoRetencion: '312',
        impuesto: 'RENTA',
        concepto: '2% Servicios (auto)',
        baseImponible: subtotalNum,
        porcentajeRetener: 2,
        valorRetenido: valorRenta,
        codigoDocumento: '01',
        numeroDocumento: numeroFactura,
        fechaEmisionDocSustento: fechaEmision
      });
    }
    // IVA 70% sobre IVA (código 723)
    if (ivaNum > 0) {
      const valorIva = round2(ivaNum * 0.70);
      if (valorIva > 0) {
        impuestos.push({
          codigo: CODIGO_IMPUESTO_RETENCION.IVA,
          codigoRetencion: '723',
          impuesto: 'IVA',
          concepto: '70% IVA servicios (auto)',
          baseImponible: ivaNum,
          porcentajeRetener: 70,
          valorRetenido: valorIva,
          codigoDocumento: '01',
          numeroDocumento: numeroFactura,
          fechaEmisionDocSustento: fechaEmision
        });
      }
    }
  }

  // Ajuste final: si el total calculado no coincide con `retencion_valor`
  // y solo hay 1 impuesto, se corrige directamente para mantener consistencia.
  if (impuestos.length === 1 && totalRet > 0) {
    const diff = Math.abs(impuestos[0].valorRetenido - totalRet);
    if (diff > 0.01) {
      impuestos[0].valorRetenido = totalRet;
      // Recalcular % en función del valor enviado para no dejar inconsistencia
      if (impuestos[0].baseImponible > 0) {
        impuestos[0].porcentajeRetener = round2(
          (totalRet / impuestos[0].baseImponible) * 100
        );
      }
      advertencias.push(
        `Se ajustó el valor retenido al monto enviado ($${totalRet.toFixed(2)})`
      );
    }
  }

  return {
    impuestos,
    advertencias,
    origen: 'fallback'
  };
}

/**
 * Crea el comprobante de retención a partir de una compra.
 * @returns {Promise<{_id, numero_factura, clave_acceso, estado_sri, total_retenido, advertencias}>}
 */
async function crearRetencionDesdeCompra(db, {
  compra,
  compraId,
  config,
  proveedor,
  impuestosRaw,
  retencionValor,
  retencionPorcentaje,
  subtotal,
  iva,
  tipoCompra,
  numeroFacturaCompra,
  fechaEmisionCompra,
  claveAccesoCompra
}) {
  if (!config?.ruc || String(config.ruc).length !== 13) {
    const err = new Error('La empresa no tiene un RUC válido (13 dígitos) configurado');
    err.status = 400;
    err.codigo = 'RUC_INVALIDO';
    throw err;
  }

  const norm = normalizarImpuestosRetencion(impuestosRaw, {
    subtotal,
    iva,
    retencionPorcentaje,
    retencionValor,
    tipoCompra,
    numeroFactura: numeroFacturaCompra,
    fechaEmision: fechaSRI(fechaEmisionCompra)
  });

  if (norm.impuestos.length === 0) {
    const err = new Error('No se pudieron determinar los impuestos de la retención');
    err.status = 400;
    err.codigo = 'RETENCION_SIN_IMPUESTOS';
    throw err;
  }

  const totalRetenido = round2(
    norm.impuestos.reduce((s, x) => s + Number(x.valorRetenido || 0), 0)
  );

  // ---- 1. Reservar contador propio de retenciones ----
  const rCont = await db.collection(CONFIG.colContadores).findOneAndUpdate(
    { _id: 'retencion' },
    { $inc: { valor: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const docCont = rCont && rCont.value !== undefined ? rCont.value : rCont;
  const contadorValor = toNumber(docCont?.valor, 1);
  const numeroRetencion = `RET-${String(contadorValor).padStart(6, '0')}`;

  // ---- 2. Generar clave de acceso ----
  const codigoSRI = TIPO_COMPROBANTE_SRI.retencion || '07';
  const est = String(config.establecimiento || '001').padStart(3, '0').slice(-3);
  const pe = String(config.punto_emision || '001').padStart(3, '0').slice(-3);
  const serie = formatearSerie(est, pe);

  const claveAcceso = generarClaveAcceso({
    fechaEmision: new Date(fechaEmisionCompra),
    tipoComprobante: codigoSRI,
    ruc: config.ruc,
    ambiente: config.ambiente || '1',
    serie,
    secuencial: contadorValor,
    tipoEmision: config.tipo_emision || '1'
  });

  const secuencialSRI = String(contadorValor).padStart(9, '0');

  // ---- 3. Generar XML ----
  const ventaParaXml = {
    clienteId: proveedor?._id || null,
    numero_factura: numeroRetencion,
    fecha_emision: new Date(fechaEmisionCompra),
    tipo_documento: 'retencion',
    detalles: [],
    subtotal: 0,
    iva: 0,
    total: 0,
    clave_acceso: claveAcceso,
    serie,
    secuencial_sri: secuencialSRI,
    ruc_emisor: config.ruc,
    razon_social_emisor: config.razon_social || '',
    establecimiento: est,
    punto_emision: pe,
    impuestos_retencion: norm.impuestos,
    comprobante_tipo_emision: 'Electrónica',
    comprobante_documento: '01',
    comprobante_numero: numeroFacturaCompra || '',
    comprobante_fecha_emision: fechaSRI(fechaEmisionCompra),
    comprobante_clave_acceso: claveAccesoCompra || '',
    numero_factura_modificada: numeroFacturaCompra || '',
    motivo: 'Retención aplicada en compra',
    observaciones: 'Generada automáticamente desde la compra'
  };

  let xmlGenerado = '';
  try {
    xmlGenerado = generarXMLComprobante(ventaParaXml, proveedor, config);
  } catch (e) {
    log.warn(
      { err: e.message, compraId: String(compraId) },
      'Error generando XML de retención auto'
    );
  }

  // ---- 4. Firmar (si hay certificado) ----
  let xmlFirmado = '';
  let estadoSri = 'PENDIENTE';
  let fechaFirma = null;

  if (xmlGenerado) {
    const pems = await cargarCertificadoSeguro(db);
    if (pems) {
      try {
        xmlFirmado = firmarXML(xmlGenerado, pems.privateKeyPem, pems.certificatePem);
        estadoSri = 'FIRMADO';
        fechaFirma = new Date();
      } catch (e) {
        log.warn({ err: e.message }, 'Error firmando retención auto');
      }
    }
  }

  // ---- 5. Persistir ----
  const ahora = new Date();
  const doc = {
    // Compat: ventas usan `clienteId`; retenciones desde compras usan
    // `proveedorId` (mismo ObjectId, distinto nombre semántico).
    clienteId: proveedor?._id || null,
    proveedorId: proveedor?._id || null,

    numero_factura: numeroRetencion,
    fecha_emision: new Date(fechaEmisionCompra),
    tipo_documento: 'retencion',
    detalles: [],
    subtotal: 0,
    iva: 0,
    total: 0,

    clave_acceso: claveAcceso,
    numero_autorizacion: '',
    estado_sri: estadoSri,
    ambiente_sri: config.ambiente || '1',
    serie,
    secuencial_sri: secuencialSRI,
    ruc_emisor: config.ruc,
    razon_social_emisor: config.razon_social || '',

    // Referencia a la compra origen
    compra_origen_id: compraId,

    // Retención
    impuestos_retencion: norm.impuestos,
    total_retenido: totalRetenido,
    numero_retencion: numeroRetencion,

    // Documento de sustento (la factura del proveedor)
    comprobante_tipo_emision: 'Electrónica',
    comprobante_documento: '01',
    comprobante_numero: numeroFacturaCompra || '',
    comprobante_fecha_emision: fechaSRI(fechaEmisionCompra),
    comprobante_clave_acceso: claveAccesoCompra || '',

    // XML / firma
    xml_generado: xmlGenerado,
    xml_firmado: xmlFirmado,
    fecha_firma: fechaFirma,
    intentos_envio_sri: 0,

    // Metadata
    observaciones: 'Generada automáticamente desde la compra',
    createdAt: ahora,
    updatedAt: ahora
  };

  const res = await db.collection(CONFIG.colVentas).insertOne(doc);

  return {
    _id: res.insertedId,
    numero_factura: numeroRetencion,
    clave_acceso: claveAcceso,
    estado_sri: estadoSri,
    total_retenido: totalRetenido,
    advertencias: norm.advertencias,
    origen: norm.origen
  };
}

// ============================================================
// LISTAR
// ============================================================
router.get('/', requierePermiso('compras', 'ver'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = String(req.query.search || '').trim();
    const { tipo_compra, estado_pago, proveedorId } = req.query;

    const desde = parseFecha(req.query.desde);
    const hasta = parseFecha(req.query.hasta);

    const matchStage = {};
    if (desde || hasta) {
      matchStage.fecha_emision = {};
      if (desde) matchStage.fecha_emision.$gte = desde;
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        matchStage.fecha_emision.$lte = h;
      }
    }
    if (soloString(tipo_compra) && TIPOS_COMPRA_VALIDOS.includes(tipo_compra)) {
      matchStage.tipo_compra = tipo_compra;
    }
    if (soloString(estado_pago) && ESTADOS_PAGO_VALIDOS.includes(estado_pago)) {
      matchStage.estado_pago = estado_pago;
    }
    if (soloString(proveedorId) && ObjectId.isValid(proveedorId)) {
      matchStage.proveedorId = new ObjectId(proveedorId);
    }

    const pipeline = [
      { $match: matchStage },
      { $lookup: { from: CONFIG.colProveedores, localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
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
      const compras = await req.db.collection(CONFIG.colCompras).aggregate(pipeline).toArray();
      res.set('Cache-Control', 'no-store');
      return res.json(compras);
    }

    const [countResult, data] = await Promise.all([
      req.db.collection(CONFIG.colCompras).aggregate([...pipeline, { $count: 'total' }]).toArray(),
      req.db.collection(CONFIG.colCompras).aggregate([
        ...pipeline,
        { $sort: sort },
        { $skip: skip },
        { $limit: limit }
      ]).toArray()
    ]);

    const total = countResult[0]?.total || 0;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    res.set('Cache-Control', 'no-store');
    return res.json({
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: skip + data.length < total,
      hasPrev: page > 1
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// CUENTAS POR PAGAR
// ============================================================
router.get('/cuentas-por-pagar', requierePermiso('compras', 'ver'), async (req, res, next) => {
  try {
    const pipeline = [
      { $match: { estado_pago: { $ne: 'pagado' } } },
      { $lookup: { from: CONFIG.colProveedores, localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: CONFIG.colPagos,
          let: { compraId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$compraId', '$$compraId'] }, anulado: { $ne: true } } },
            { $group: { _id: null, total: { $sum: '$monto' } } }
          ],
          as: 'pagos'
        }
      },
      { $addFields: { montoPagado: { $ifNull: [{ $arrayElemAt: ['$pagos.total', 0] }, 0] } } },
      { $addFields: { saldoPendiente: { $subtract: ['$total', '$montoPagado'] } } },
      { $match: { saldoPendiente: { $gt: 0.01 } } },
      {
        $project: {
          proveedorId: 1,
          proveedorNombre: '$proveedor.nombre',
          proveedorRuc: '$proveedor.ruc',
          numero_factura: 1,
          fecha_emision: 1,
          total: 1,
          montoPagado: 1,
          saldoPendiente: 1,
          estado_pago: 1,
          dias: {
            $floor: {
              $divide: [{ $subtract: [new Date(), '$fecha_emision'] }, 86400000]
            }
          }
        }
      },
      { $sort: { fecha_emision: 1 } }
    ];

    const compras = await req.db.collection(CONFIG.colCompras).aggregate(pipeline).toArray();

    const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 };
    let totalPagar = 0;
    for (const c of compras) {
      const saldo = toNumber(c.saldoPendiente);
      totalPagar += saldo;
      const d = Math.floor(toNumber(c.dias));
      if (d <= 30) aging['0-30'] += saldo;
      else if (d <= 60) aging['31-60'] += saldo;
      else if (d <= 90) aging['61-90'] += saldo;
      else aging['+90'] += saldo;
    }
    for (const k of Object.keys(aging)) aging[k] = round2(aging[k]);

    res.set('Cache-Control', 'no-store');
    return res.json({
      totalPagar: round2(totalPagar),
      cantidadFacturas: compras.length,
      aging,
      facturas: compras
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// TOTALES POR PROVEEDOR
// ============================================================
router.get('/por-proveedor', requierePermiso('compras', 'ver'), async (req, res, next) => {
  try {
    const desde = parseFecha(req.query.desde);
    const hasta = parseFecha(req.query.hasta);

    const match = {};
    if (desde || hasta) {
      match.fecha_emision = {};
      if (desde) match.fecha_emision.$gte = desde;
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        match.fecha_emision.$lte = h;
      }
    }

    const resultado = await req.db.collection(CONFIG.colCompras).aggregate([
      { $match: match },
      {
        $group: {
          _id: '$proveedorId',
          totalCompras: { $sum: '$total' },
          subtotal: { $sum: '$subtotal' },
          iva: { $sum: '$iva' },
          retencion: { $sum: '$retencion_valor' },
          cantidad: { $sum: 1 }
        }
      },
      { $sort: { totalCompras: -1 } },
      { $lookup: { from: CONFIG.colProveedores, localField: '_id', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          proveedorId: '$_id',
          proveedorNombre: '$proveedor.nombre',
          proveedorRuc: '$proveedor.ruc',
          totalCompras: 1, subtotal: 1, iva: 1, retencion: 1, cantidad: 1
        }
      }
    ]).toArray();

    res.set('Cache-Control', 'no-store');
    return res.json(resultado);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// REPORTE MENSUAL
// ============================================================
router.get('/reporte-mensual/:mes/:anio', requierePermiso('compras', 'ver'), async (req, res, next) => {
  try {
    const { mes, anio } = req.params;
    const mesNum = Number(mes);
    const anioNum = Number(anio);

    if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) {
      return res.status(400).json({ error: 'Mes inválido (1-12)', codigo: 'MES_INVALIDO' });
    }
    if (!Number.isInteger(anioNum) || anioNum < CONFIG.anioMin || anioNum > CONFIG.anioMax) {
      return res.status(400).json({
        error: `Año fuera de rango (${CONFIG.anioMin}-${CONFIG.anioMax})`,
        codigo: 'ANIO_INVALIDO'
      });
    }

    const inicio = new Date(anioNum, mesNum - 1, 1);
    const fin = new Date(anioNum, mesNum, 0, 23, 59, 59, 999);

    const resultado = await req.db.collection(CONFIG.colCompras).aggregate([
      { $match: { fecha_emision: { $gte: inicio, $lte: fin } } },
      { $lookup: { from: CONFIG.colProveedores, localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
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

    const reporte = resultado[0] || {
      totalComprasInventario: 0, totalComprasGasto: 0,
      totalIva: 0, totalRetenido: 0, compras: []
    };
    reporte.mes = mesNum;
    reporte.anio = anioNum;
    reporte.nombre = `${MESES[mesNum - 1]} ${anioNum}`;
    reporte.desde = inicio;
    reporte.hasta = fin;

    res.set('Cache-Control', 'no-store');
    return res.json(reporte);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// DETALLE
// ============================================================
router.get('/:id', requierePermiso('compras', 'ver'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id);
    const compra = await traerCompraPopulada(req.db, _id);
    if (!compra) {
      return res.status(404).json({ error: 'Compra no encontrada', codigo: 'COMPRA_NOT_FOUND' });
    }
    return res.json(compra);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// CREAR
// ============================================================
router.post(
  '/',
  requierePermiso('compras', 'crear'),
  verificarPeriodoAbierto(),
  validarCompra,
  async (req, res, next) => {
    if (validar(req, res)) return;

    const errorTotales = validarTotales(req.body);
    if (errorTotales) return res.status(400).json({ error: errorTotales, codigo: 'TOTALES_INCONSISTENTES' });

    const errorFecha = validarFechaNoFutura(req.body.fecha_emision);
    if (errorFecha) return res.status(400).json({ error: errorFecha, codigo: 'FECHA_INVALIDA' });

    try {
      const {
        proveedorId, numero_factura, fecha_emision,
        detalles, subtotal, iva, total,
        tipo_compra, estado_pago, forma_pago,
        fecha_pago, retencion_valor, retencion_porcentaje,
        observaciones, impuestos_retencion
      } = req.body;

      const tipoCompra = tipo_compra || 'inventario';
      const retencionValorNum = toNumber(retencion_valor);

      // Validación de detalles
      if (tipoCompra === 'inventario') {
        for (const detalle of detalles) {
          if (!ObjectId.isValid(detalle?.productoId)) {
            const err = new Error(`ID de producto inválido: ${detalle?.productoId}`);
            err.status = 400;
            err.codigo = 'PRODUCTO_ID_INVALIDO';
            throw err;
          }
          const msg = validarDetalle(detalle);
          if (msg) {
            const err = new Error(msg);
            err.status = 400;
            err.codigo = 'DETALLE_INVALIDO';
            throw err;
          }
        }
      }

      // Verificaciones previas
      const [proveedorExiste, productos] = await Promise.all([
        req.db.collection(CONFIG.colProveedores).findOne(
          { _id: new ObjectId(proveedorId) }, { projection: { _id: 1 } }
        ),
        tipoCompra === 'inventario'
          ? req.db.collection(CONFIG.colProductos)
              .find({ _id: { $in: detalles.map(d => new ObjectId(d.productoId)) } })
              .project({ _id: 1 })
              .toArray()
          : Promise.resolve([])
      ]);

      if (!proveedorExiste) {
        return res.status(400).json({
          error: 'El proveedor no existe',
          codigo: 'PROVEEDOR_NO_EXISTE',
          proveedorId
        });
      }

      if (tipoCompra === 'inventario') {
        const encontrados = new Set(productos.map(p => String(p._id)));
        for (const detalle of detalles) {
          if (!encontrados.has(String(detalle.productoId))) {
            const err = new Error(`Producto ${detalle.productoId} no encontrado`);
            err.status = 400;
            err.codigo = 'PRODUCTO_NO_EXISTE';
            throw err;
          }
        }
      }

      // Reservar contador de compra FUERA de la transacción
      const contadorValor = await reservarContadorCompra(req.db);
      const codigo = `COM-${String(contadorValor).padStart(6, '0')}`;

      // Persistir dentro de transacción
      const resultado = await conTransaccion(req.db, async (session) => {
        const compra = {
          proveedorId: new ObjectId(proveedorId),
          numero_factura: numero_factura || codigo,
          fecha_emision: new Date(fecha_emision),
          detalles, subtotal: toNumber(subtotal), iva: toNumber(iva), total: toNumber(total),
          tipo_compra: tipoCompra,
          estado_pago: estado_pago || 'pendiente',
          monto_pagado: 0,
          forma_pago: forma_pago || '',
          fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
          retencion_valor: retencionValorNum,
          retencion_porcentaje: toNumber(retencion_porcentaje),
          retencion_pendiente_emision: retencionValorNum > 0,
          observaciones: observaciones || '',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const compraResult = await req.db.collection(CONFIG.colCompras).insertOne(compra, { session });
        const compraId = compraResult.insertedId;

        if (tipoCompra === 'inventario') {
          await aplicarStockDeCompra(req.db, compraId, detalles, fecha_emision, session);
        }

        return { compraId };
      });

      let compraCreada = await traerCompraPopulada(req.db, resultado.compraId);

      // ============================================================
      // 🆕 AUTO-CREACIÓN DE RETENCIÓN
      // ============================================================
      let retencionCreada = null;
      let errorRetencion = null;
      let advertenciasRetencion = [];

      if (retencionValorNum > 0) {
        try {
          const config = await req.db.collection(CONFIG.colConfig)
            .findOne({ _id: 'empresa' });

          retencionCreada = await crearRetencionDesdeCompra(req.db, {
            compra: compraCreada,
            compraId: resultado.compraId,
            config,
            proveedor: compraCreada.proveedor,
            impuestosRaw: impuestos_retencion,
            retencionValor: retencionValorNum,
            retencionPorcentaje: toNumber(retencion_porcentaje),
            subtotal: toNumber(subtotal),
            iva: toNumber(iva),
            tipoCompra,
            numeroFacturaCompra: compraCreada.numero_factura,
            fechaEmisionCompra: compraCreada.fecha_emision,
            claveAccesoCompra: compraCreada.clave_acceso || ''
          });

          // Vincular la compra con la retención
          await req.db.collection(CONFIG.colCompras).updateOne(
            { _id: resultado.compraId },
            {
              $set: {
                retencion_id: retencionCreada._id,
                retencion_numero: retencionCreada.numero_factura,
                retencion_clave_acceso: retencionCreada.clave_acceso,
                retencion_estado_sri: retencionCreada.estado_sri,
                retencion_pendiente_emision: false,
                updatedAt: new Date()
              }
            }
          );

          compraCreada.retencion_id = retencionCreada._id;
          compraCreada.retencion_numero = retencionCreada.numero_factura;
          compraCreada.retencion_clave_acceso = retencionCreada.clave_acceso;
          compraCreada.retencion_estado_sri = retencionCreada.estado_sri;
          compraCreada.retencion_pendiente_emision = false;

          if (Array.isArray(retencionCreada.advertencias)) {
            advertenciasRetencion = retencionCreada.advertencias;
          }
        } catch (e) {
          errorRetencion = e.message;
          log.warn(
            { err: e.message, compraId: String(resultado.compraId), codigo: e.codigo },
            'No se pudo auto-crear la retención; la compra queda con retencion_pendiente_emision=true'
          );
        }
      }

      await auditarSeguro(req.db, req, {
        accion: 'crear',
        coleccion: CONFIG.colCompras,
        documentoId: resultado.compraId,
        documentoNumero: compraCreada?.numero_factura || '',
        datosNuevos: compraCreada,
        detalle:
          `Compra creada: ${compraCreada?.numero_factura || ''} por $${round2(compraCreada?.total)}` +
          (retencionCreada
            ? ` — Retención ${retencionCreada.numero_factura} generada automáticamente`
            : '')
      });

      if (req.io) req.io.emit('nueva-compra', compraCreada);
      if (retencionCreada && req.io) {
        req.io.emit('nueva-retencion', retencionCreada);
      }

      // Mensaje de advertencia al frontend
      let advertencia = null;
      if (errorRetencion) {
        advertencia =
          `La compra se guardó, pero NO se pudo generar la retención automática: ${errorRetencion}. ` +
          `Puedes emitirla manualmente desde Ventas → Retenciones.`;
      } else if (retencionCreada?.estado_sri === 'PENDIENTE') {
        advertencia =
          `Retención ${retencionCreada.numero_factura} creada sin firma electrónica. ` +
          `Carga un certificado válido y fírmala desde Ventas → Retenciones.`;
      }

      return res.status(201).json({
        ...compraCreada,
        _retencion_creada: retencionCreada
          ? {
              _id: retencionCreada._id,
              numero: retencionCreada.numero_factura,
              clave_acceso: retencionCreada.clave_acceso,
              estado_sri: retencionCreada.estado_sri,
              total_retenido: retencionCreada.total_retenido,
              origen: retencionCreada.origen
            }
          : null,
        _advertencia: advertencia,
        _advertencias_retencion: advertenciasRetencion.length
          ? advertenciasRetencion
          : undefined
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// ACTUALIZAR
// ============================================================
router.put(
  '/:id',
  requierePermiso('compras', 'editar'),
  verificarPeriodoAbierto(),
  validarCompra,
  async (req, res, next) => {
    if (validar(req, res)) return;

    const errorTotales = validarTotales(req.body);
    if (errorTotales) return res.status(400).json({ error: errorTotales, codigo: 'TOTALES_INCONSISTENTES' });

    try {
      const _id = requireObjectId(req.params.id);

      const compraActual = req._documentoOriginal
        || await req.db.collection(CONFIG.colCompras).findOne({ _id });
      if (!compraActual) {
        return res.status(404).json({ error: 'Compra no encontrada', codigo: 'COMPRA_NOT_FOUND' });
      }

      const {
        proveedorId, numero_factura, fecha_emision,
        detalles, subtotal, iva, total,
        tipo_compra, estado_pago, forma_pago,
        fecha_pago, retencion_valor, retencion_porcentaje,
        observaciones, impuestos_retencion
      } = req.body;

      const tipoCompra = tipo_compra || 'inventario';
      const retencionValorNum = toNumber(retencion_valor);

      // Validar detalles fuera de tx
      if (tipoCompra === 'inventario') {
        for (const detalle of detalles) {
          if (!ObjectId.isValid(detalle?.productoId)) {
            const err = new Error(`ID de producto inválido: ${detalle?.productoId}`);
            err.status = 400;
            err.codigo = 'PRODUCTO_ID_INVALIDO';
            throw err;
          }
          const msg = validarDetalle(detalle);
          if (msg) {
            const err = new Error(msg);
            err.status = 400;
            err.codigo = 'DETALLE_INVALIDO';
            throw err;
          }
        }

        const ids = detalles.map(d => new ObjectId(d.productoId));
        const productos = await req.db.collection(CONFIG.colProductos)
          .find({ _id: { $in: ids } }).project({ _id: 1 }).toArray();
        const encontrados = new Set(productos.map(p => String(p._id)));
        for (const detalle of detalles) {
          if (!encontrados.has(String(detalle.productoId))) {
            const err = new Error(`Producto ${detalle.productoId} no encontrado`);
            err.status = 400;
            err.codigo = 'PRODUCTO_NO_EXISTE';
            throw err;
          }
        }
      }

      await conTransaccion(req.db, async (session) => {
        await revertirStockDeCompra(req.db, compraActual, session);

        const updateData = {
          proveedorId: new ObjectId(proveedorId),
          numero_factura,
          fecha_emision: new Date(fecha_emision),
          detalles, subtotal: toNumber(subtotal), iva: toNumber(iva), total: toNumber(total),
          tipo_compra: tipoCompra,
          estado_pago,
          forma_pago,
          fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
          retencion_valor: retencionValorNum,
          retencion_porcentaje: toNumber(retencion_porcentaje),
          retencion_pendiente_emision: retencionValorNum > 0,
          observaciones: observaciones || '',
          updatedAt: new Date()
        };

        await req.db.collection(CONFIG.colCompras).updateOne(
          { _id },
          { $set: updateData },
          { session }
        );

        if (tipoCompra === 'inventario') {
          await aplicarStockDeCompra(req.db, _id, detalles, fecha_emision, session);
        }
      });

      let compraActualizada = await traerCompraPopulada(req.db, _id);

      // ============================================================
      // 🆕 RE-SINCRONIZAR RETENCIÓN AL EDITAR
      // ============================================================
      let retencionNueva = null;
      let errorRetencion = null;
      let advertenciasRetencion = [];

      try {
        const retAnterior = await req.db.collection(CONFIG.colVentas).findOne({
          compra_origen_id: _id,
          tipo_documento: 'retencion'
        });

        const puedeRegenerar =
          !retAnterior ||
          !['AUTORIZADO', 'FIRMADO'].includes(retAnterior.estado_sri);

        if (!puedeRegenerar && retencionValorNum > 0) {
          errorRetencion =
            `La retención ${retAnterior.numero_factura} ya está en estado ${retAnterior.estado_sri}. ` +
            `Debes anularla en el SRI antes de regenerarla.`;
        } else if (puedeRegenerar) {
          // Borrar la anterior (si existe y no fue enviada al SRI)
          if (retAnterior) {
            await req.db.collection(CONFIG.colVentas).deleteOne({ _id: retAnterior._id });
          }

          if (retencionValorNum > 0) {
            const config = await req.db.collection(CONFIG.colConfig)
              .findOne({ _id: 'empresa' });

            retencionNueva = await crearRetencionDesdeCompra(req.db, {
              compra: compraActualizada,
              compraId: _id,
              config,
              proveedor: compraActualizada.proveedor,
              impuestosRaw: impuestos_retencion,
              retencionValor: retencionValorNum,
              retencionPorcentaje: toNumber(retencion_porcentaje),
              subtotal: toNumber(subtotal),
              iva: toNumber(iva),
              tipoCompra,
              numeroFacturaCompra: compraActualizada.numero_factura,
              fechaEmisionCompra: compraActualizada.fecha_emision,
              claveAccesoCompra: compraActualizada.clave_acceso || ''
            });

            await req.db.collection(CONFIG.colCompras).updateOne(
              { _id },
              {
                $set: {
                  retencion_id: retencionNueva._id,
                  retencion_numero: retencionNueva.numero_factura,
                  retencion_clave_acceso: retencionNueva.clave_acceso,
                  retencion_estado_sri: retencionNueva.estado_sri,
                  retencion_pendiente_emision: false,
                  updatedAt: new Date()
                }
              }
            );

            compraActualizada.retencion_id = retencionNueva._id;
            compraActualizada.retencion_numero = retencionNueva.numero_factura;
            compraActualizada.retencion_clave_acceso = retencionNueva.clave_acceso;
            compraActualizada.retencion_estado_sri = retencionNueva.estado_sri;
            compraActualizada.retencion_pendiente_emision = false;

            if (Array.isArray(retencionNueva.advertencias)) {
              advertenciasRetencion = retencionNueva.advertencias;
            }
          } else {
            // Ya no aplica retención → limpiar metadata
            await req.db.collection(CONFIG.colCompras).updateOne(
              { _id },
              {
                $set: {
                  retencion_id: null,
                  retencion_numero: null,
                  retencion_clave_acceso: null,
                  retencion_estado_sri: null,
                  retencion_pendiente_emision: false,
                  updatedAt: new Date()
                }
              }
            );
            compraActualizada.retencion_id = null;
            compraActualizada.retencion_pendiente_emision = false;
          }
        }
      } catch (e) {
        errorRetencion = e.message;
        log.warn(
          { err: e.message, compraId: String(_id), codigo: e.codigo },
          'No se pudo re-sincronizar la retención al editar la compra'
        );
      }

      await auditarSeguro(req.db, req, {
        accion: 'actualizar',
        coleccion: CONFIG.colCompras,
        documentoId: _id,
        documentoNumero: compraActualizada?.numero_factura || '',
        datosAnteriores: compraActual,
        datosNuevos: compraActualizada,
        detalle:
          `Compra actualizada: ${compraActualizada?.numero_factura || ''}` +
          (retencionNueva ? ` — Retención regenerada: ${retencionNueva.numero_factura}` : '')
      });

      if (req.io) req.io.emit('compra-actualizada', compraActualizada);
      if (retencionNueva && req.io) {
        req.io.emit('nueva-retencion', retencionNueva);
      }

      return res.json({
        ...compraActualizada,
        _retencion_creada: retencionNueva
          ? {
              _id: retencionNueva._id,
              numero: retencionNueva.numero_factura,
              clave_acceso: retencionNueva.clave_acceso,
              estado_sri: retencionNueva.estado_sri,
              total_retenido: retencionNueva.total_retenido,
              origen: retencionNueva.origen
            }
          : null,
        _advertencia: errorRetencion,
        _advertencias_retencion: advertenciasRetencion.length
          ? advertenciasRetencion
          : undefined
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// ELIMINAR
// ============================================================
router.delete(
  '/:id',
  requierePermiso('compras', 'eliminar'),
  verificarPeriodoAbierto(),
  async (req, res, next) => {
    try {
      const _id = requireObjectId(req.params.id);

      const compra = req._documentoOriginal
        || await req.db.collection(CONFIG.colCompras).findOne({ _id });
      if (!compra) {
        return res.status(404).json({ error: 'Compra no encontrada', codigo: 'COMPRA_NOT_FOUND' });
      }

      const [pagosAsociados, retencionesManuales] = await Promise.all([
        req.db.collection(CONFIG.colPagos).countDocuments({ compraId: _id, anulado: { $ne: true } }),
        req.db.collection(CONFIG.colRetenciones).countDocuments({ compraId: _id })
      ]);

      if (pagosAsociados > 0) {
        return res.status(409).json({
          error: `No se puede eliminar: hay ${pagosAsociados} pago${pagosAsociados === 1 ? '' : 's'} registrado${pagosAsociados === 1 ? '' : 's'}. Anule los pagos primero.`,
          codigo: 'COMPRA_CON_PAGOS',
          pagosAsociados
        });
      }
      if (retencionesManuales > 0) {
        return res.status(409).json({
          error: `No se puede eliminar: hay ${retencionesManuales} comprobante${retencionesManuales === 1 ? '' : 's'} de retención emitido${retencionesManuales === 1 ? '' : 's'} para esta compra. Anúlelos primero.`,
          codigo: 'COMPRA_CON_RETENCIONES',
          retencionesAsociadas: retencionesManuales
        });
      }

      // ---- Guard: retención auto-generada ----
      const retAuto = await req.db.collection(CONFIG.colVentas).findOne({
        compra_origen_id: _id,
        tipo_documento: 'retencion'
      });

      if (retAuto && ['AUTORIZADO', 'FIRMADO'].includes(retAuto.estado_sri)) {
        return res.status(409).json({
          error:
            `No se puede eliminar: la retención ${retAuto.numero_factura} ` +
            `ya fue firmada/enviada al SRI. Anúlala primero en el SRI.`,
          codigo: 'COMPRA_CON_RETENCION_EMITIDA',
          retencionId: retAuto._id,
          estado_sri: retAuto.estado_sri
        });
      }

      await conTransaccion(req.db, async (session) => {
        await revertirStockDeCompra(req.db, compra, session);
        const r = await req.db.collection(CONFIG.colCompras).deleteOne({ _id }, { session });
        if (r.deletedCount === 0) {
          const err = new Error('Compra no encontrada');
          err.status = 404;
          err.codigo = 'COMPRA_NOT_FOUND';
          throw err;
        }
      });

      // Borrar la retención auto (solo si no fue enviada al SRI)
      if (retAuto) {
        await req.db.collection(CONFIG.colVentas).deleteOne({ _id: retAuto._id });
      }

      await auditarSeguro(req.db, req, {
        accion: 'eliminar',
        coleccion: CONFIG.colCompras,
        documentoId: _id,
        documentoNumero: compra.numero_factura || '',
        datosAnteriores: compra,
        detalle:
          `Compra eliminada: ${compra.numero_factura || ''} por $${round2(compra.total)}` +
          (retAuto ? ` — Retención ${retAuto.numero_factura} eliminada en cascada` : '')
      });

      if (req.io) req.io.emit('compra-eliminada', { id: String(_id) });
      return res.json({ message: 'Compra eliminada correctamente' });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// IMPORTAR TXT
// ============================================================
router.post('/importar-txt', requierePermiso('compras', 'crear'), async (req, res, next) => {
  try {
    const { lineas } = req.body || {};
    if (!Array.isArray(lineas) || lineas.length === 0) {
      return res.status(400).json({ error: 'No se enviaron líneas para importar', codigo: 'SIN_LINEAS' });
    }
    if (lineas.length > IMPORT_MAX_LINEAS) {
      return res.status(413).json({
        error: `Máximo ${IMPORT_MAX_LINEAS} líneas por importación`,
        codigo: 'DEMASIADAS_LINEAS'
      });
    }

    const fechasValidas = lineas
      .map(l => l?.fechaEmision)
      .filter(Boolean);
    const cerrados = await obtenerPeriodosCerradosEnFechas(req.db, fechasValidas);
    if (cerrados.length > 0) {
      return res.status(423).json({
        error: `Hay líneas con fechas en períodos cerrados: ${cerrados.map(c => c.nombre).join(', ')}. Reabra el período o corrija las fechas.`,
        codigo: 'PERIODO_CERRADO',
        periodos: cerrados.map(c => c.nombre)
      });
    }

    const resultados = [];
    const errores = [];
    let importados = 0;
    let proveedoresCreados = 0;
    let retencionesCreadas = 0;

    for (let offset = 0; offset < lineas.length; offset += IMPORT_BATCH_SIZE) {
      const lote = lineas.slice(offset, offset + IMPORT_BATCH_SIZE);

      try {
        const contadoresLote = await reservarContadoresCompraLote(req.db, lote.length);

        const resumenLote = await conTransaccion(req.db, async (session) => {
          const productosCache = new Map();
          const proveedoresCache = new Map();
          const out = [];
          let provCreados = 0;
          let importadosLote = 0;
          const erroresLote = [];

          const buscarProducto = async (codigoProducto) => {
            if (!codigoProducto) return null;
            const key = String(codigoProducto).toLowerCase();
            if (productosCache.has(key)) return productosCache.get(key);

            const prod = await req.db.collection(CONFIG.colProductos).findOne(
              { $or: [{ codigo: codigoProducto }, { codigo_barras: codigoProducto }] },
              { collation: { locale: 'es', strength: 2 }, session }
            );
            productosCache.set(key, prod);
            return prod;
          };

          const buscarOCrearProveedor = async (ruc, razonSocial) => {
            const key = String(ruc).trim();
            if (proveedoresCache.has(key)) return proveedoresCache.get(key);

            let prov = await req.db.collection(CONFIG.colProveedores).findOne({ ruc: key }, { session });
            if (!prov) {
              const nuevoProv = {
                nombre: (razonSocial || `Proveedor ${ruc}`).trim(),
                ruc: key, telefono: '', email: '', direccion: '',
                createdAt: new Date()
              };
              const resultProv = await req.db.collection(CONFIG.colProveedores).insertOne(nuevoProv, { session });
              prov = { ...nuevoProv, _id: resultProv.insertedId };
              provCreados++;
            }
            proveedoresCache.set(key, prov);
            return prov;
          };

          for (let idx = 0; idx < lote.length; idx++) {
            const linea = lote[idx];
            const numLinea = offset + idx + 1;
            try {
              const {
                ruc, razonSocial, fechaEmision, total, valorSinImpuestos,
                iva, tipo_compra, codigoProducto
              } = linea;

              const totalNum = toNumber(total);
              if (!ruc || totalNum === 0) {
                erroresLote.push(`Línea ${numLinea}: sin RUC o total inválido`);
                continue;
              }

              const fecha = fechaEmision ? new Date(fechaEmision) : null;
              if (!fecha || Number.isNaN(fecha.getTime())) {
                erroresLote.push(`Línea ${numLinea} (RUC ${ruc}): fecha inválida "${fechaEmision}"`);
                continue;
              }

              const tipoCompra = tipo_compra || 'inventario';

              let producto = null;
              if (tipoCompra === 'inventario') {
                producto = await buscarProducto(codigoProducto);
                if (!producto) {
                  erroresLote.push(
                    `Línea ${numLinea} (RUC ${ruc}): producto no encontrado` +
                    (codigoProducto ? ` con código "${codigoProducto}"` : ' (sin código)')
                  );
                  continue;
                }
              }

              const proveedor = await buscarOCrearProveedor(ruc, razonSocial);

              const contadorValor = contadoresLote[idx];
              if (!Number.isFinite(contadorValor)) {
                erroresLote.push(`Línea ${numLinea}: no hay contador reservado para esta línea`);
                continue;
              }
              const codigo = `COM-${String(contadorValor).padStart(6, '0')}`;

              const ivaNum = toNumber(iva);

              const compraData = {
                proveedorId: proveedor._id,
                numero_factura: codigo,
                fecha_emision: fecha,
                detalles: producto
                  ? [{
                      productoId: producto._id,
                      cantidad: 1,
                      costo_unitario: totalNum,
                      aplica_iva: ivaNum > 0
                    }]
                  : [],
                subtotal: toNumber(valorSinImpuestos),
                iva: ivaNum,
                total: totalNum,
                tipo_compra: tipoCompra,
                estado_pago: 'pendiente',
                monto_pagado: 0,
                forma_pago: '',
                fecha_pago: null,
                retencion_valor: 0,
                retencion_porcentaje: 0,
                retencion_pendiente_emision: false,
                observaciones: `Importado desde TXT. Emisor: ${razonSocial || ''}`,
                createdAt: new Date(),
                updatedAt: new Date()
              };

              const compraResult = await req.db.collection(CONFIG.colCompras)
                .insertOne(compraData, { session });
              const compraId = compraResult.insertedId;

              if (tipoCompra === 'inventario' && producto) {
                const productoActualizado = await actualizarStockAtomico(
                  req.db, producto._id, 1, +1, session, { precio_compra: totalNum }
                );

                await req.db.collection(CONFIG.colKardex).insertOne({
                  productoId: producto._id,
                  fecha: compraData.fecha_emision,
                  tipo_movimiento: 'compra',
                  cantidad: 1,
                  costo_unitario: totalNum,
                  saldo: productoActualizado.stock,
                  referencia_id: compraId,
                  referencia_tipo: 'compra',
                  createdAt: new Date()
                }, { session });
              }

              out.push({ compraId, numero: compraData.numero_factura, ruc });
              importadosLote++;
            } catch (lineaError) {
              erroresLote.push(`Línea ${numLinea}: ${lineaError.message}`);
            }
          }

          return { out, importadosLote, provCreados, erroresLote };
        });

        resultados.push(...(resumenLote.out || []));
        errores.push(...(resumenLote.erroresLote || []));
        importados += resumenLote.importadosLote || 0;
        proveedoresCreados += resumenLote.provCreados || 0;
      } catch (batchError) {
        const numeroBatch = Math.floor(offset / IMPORT_BATCH_SIZE) + 1;
        errores.push(`Batch ${numeroBatch}: ${batchError.message}`);
      }
    }

    await auditarSeguro(req.db, req, {
      accion: 'importar',
      coleccion: CONFIG.colCompras,
      documentoNumero: `${importados} facturas`,
      datosNuevos: { importados, errores: errores.length, proveedoresCreados, retencionesCreadas },
      detalle: `Importación TXT: ${importados} facturas, ${errores.length} errores, ${proveedoresCreados} proveedores creados`
    });

    return res.json({
      success: true,
      importados,
      errores,
      resultados,
      proveedoresCreados,
      retencionesCreadas
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._validarTotales = validarTotales;
module.exports._validarFechaNoFutura = validarFechaNoFutura;
module.exports._validarDetalle = validarDetalle;
module.exports._toNumber = toNumber;
module.exports._round2 = round2;
module.exports._requireObjectId = requireObjectId;
module.exports._reservarContadorCompra = reservarContadorCompra;
module.exports._reservarContadoresCompraLote = reservarContadoresCompraLote;
module.exports._crearRetencionDesdeCompra = crearRetencionDesdeCompra;
module.exports._normalizarImpuestosRetencion = normalizarImpuestosRetencion;
module.exports._cargarCertificadoSeguro = cargarCertificadoSeguro;