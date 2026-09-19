// backend/routes/ventas.js
// ============================================================
// Ventas — CRUD + facturación electrónica SRI
// ------------------------------------------------------------
// Endpoints:
//   GET    /                            → listado
//   POST   /validar-clave               → valida estructura de clave SRI
//   GET    /buscar-clave/:clave         → buscar por clave de acceso
//   GET    /buscar-acreditable          → facturas autorizadas con saldo > 0 (NC)
//   GET    /buscar-retenible            → facturas autorizadas (Retención)
//   POST   /migrar-claves               → migración masiva (admin)
//   GET    /:id/xml                     → descarga XML
//   GET    /:id/xml-preview             → previsualiza XML + estado
//   GET    /:id/xml-firmado             → descarga XML firmado
//   GET    /:id/qr                      → QR de verificación SRI
//   GET    /:id                         → detalle
//   POST   /:id/firmar                  → firmar con certificado
//   POST   /:id/generar-clave           → genera clave + XML + firma
//   POST   /                            → crear
//   PUT    /:id                         → actualizar (no si fue enviado)
//   DELETE /:id                         → eliminar (revierte stock)
//
// Convenciones:
//   - Todas las rutas requieren permisos (`ventas:*`).
//   - Escrituras pasan por `verificarPeriodoAbierto()`.
//   - Movimientos de stock se hacen DENTRO de transacción con
//     guard atómico (`stock: { $gte: cantidad }`).
//   - Una venta ya enviada al SRI (intentos_envio_sri > 0) NO se
//     puede editar/eliminar: se requiere nota de crédito.
//   - Errores delegados al `errorHandler` central.
//
// 🔧 FIXES Y MEJORAS 2025-XX:
//   1. Notas de crédito requieren factura original referenciada.
//   2. Retenciones requieren documento sustento.
//   3. Al crear NC se valida: factura AUTORIZADA y saldo disponible.
//   4. `numero_factura` de la NC siempre es el código del contador.
//   5. `numero_factura_modificada` en formato SRI.
//   6. `asegurarClaveYXml` usa guard atómico.
//   7. DELETE de factura bloqueado si tiene NCs asociadas.
//   8. 🔴 FIX CRÍTICO: `TIPOS_SIN_MOVIMIENTO_STOCK.has()` fallaba
//      porque el export original es un ARRAY, no un Set. Ahora se
//      importa `SETS.TIPOS_SIN_MOVIMIENTO_STOCK` (Set real, O(1)).
//   9. 🆕 RETENCIONES: `validarYNormalizarImpuestosRetencion()`
//      valida contra el catálogo SRI (`data/catalogosSRI.js`),
//      auto-calcula `valorRetenido = base × %`, corrige
//      discrepancias y devuelve advertencias al cliente.
//  10. 🆕 Se persiste `total_retenido` en el documento de retención.
//  11. 🔴 FIX CRÍTICO (POST /): la reserva del contador se hacía
//      DENTRO de `conTransaccion`. Si el driver reintentaba por
//      `TransientTransactionError`, el `$inc` se ejecutaba 2+ veces
//      → secuenciales duplicados y claves desalineadas con el
//      `numero_factura`. Ahora se reserva FUERA, igual que en
//      `routes/compras.js`.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const {
  parsePagination,
  wantsPagination,
  parseSort,
  escapeRegex
} = require('../utils/pagination');
const { verificarPeriodoAbierto } = require('../utils/periodos');
const {
  generarClaveAcceso,
  formatearSerie,
  descomponerClave,
  validarClave
} = require('../utils/claveAcceso');
const { generarXMLComprobante } = require('../utils/xmlComprobante');
const {
  cargarCertificado,
  firmarXML,
  validarFirma,
  descifrarSecreto
} = require('../utils/firmaElectronica');
const { conTransaccion } = require('../utils/transacciones');
const { validar } = require('../utils/validacion');
const { fechaSRI } = require('../utils/fechaEC');
const {
  SETS,
  TIPO_COMPROBANTE_SRI,
  PREFIJOS_CONTADOR,
  TIPOS_DOCUMENTO_VALIDOS
} = require('../utils/tiposDocumento');
// 🆕 Catálogo SRI para retenciones
const { buscarRetencion } = require('../data/catalogosSRI');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  colVentas: 'ventas_v2',
  colClientes: 'clientes',
  colProveedores: 'proveedores',   // 🆕 para retenciones emitidas a proveedores
  colProductos: 'productos',
  colKardex: 'kardex',
  colPagos: 'pagos',
  colContadores: 'contadores',
  colConfig: 'configuracion',
  colCertificados: 'certificados',

  maxDetallesPorDocumento: envNum('VENTAS_MAX_DETALLES', 500),
  maxSinPaginar: envNum('VENTAS_MAX_SIN_PAGINAR', 5000),

  migrarMaxDocs: envNum('VENTAS_MIGRAR_MAX_DOCS', 5000),

  migrarRequiereConfirmacion:
    String(process.env.VENTAS_MIGRAR_CONFIRM ?? 'false').toLowerCase() === 'true',

  estadosSriBloqueadosDelete: Object.freeze(
    new Set(['FIRMADO', 'AUTORIZADO', 'RECHAZADA', 'DEVUELTA'])
  ),

  proyeccionLista: Object.freeze({
    xml_generado: 0,
    xml_firmado: 0,
    xml_autorizado: 0,
    respuesta_sri: 0
  })
});

// Mapa: impuesto declarado → código SRI ('1' RENTA | '2' IVA)
const CODIGO_IMPUESTO_RETENCION = Object.freeze({
  RENTA: '1',
  IVA: '2'
});

// ============================================================
// HELPERS GENERALES
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
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

function parseEnteroSeguro(v, fallback = 1) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

function requireObjectId(id, mensaje = 'ID inválido') {
  if (!ObjectId.isValid(id)) {
    const err = new Error(mensaje);
    err.status = 400;
    err.codigo = 'ID_INVALIDO';
    throw err;
  }
  return new ObjectId(id);
}

async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar venta');
  }
}

function extraerValor(result) {
  if (!result) return null;
  const doc = result && result.value !== undefined ? result.value : result;
  const valor = Number(doc?.valor);
  return Number.isFinite(valor) ? valor : null;
}

// ============================================================
// HELPERS DE NEGOCIO
// ============================================================
const TIPOS_SIN_MOVIMIENTO_STOCK_SET = SETS.TIPOS_SIN_MOVIMIENTO_STOCK;

/**
 * ¿El tipo de documento afecta stock (kardex)?
 * 🔧 FIX: usa el Set canónico (O(1)), no el Array.
 */
function afectaStock(tipoDoc) {
  if (!tipoDoc || typeof tipoDoc !== 'string') return false;
  return !TIPOS_SIN_MOVIMIENTO_STOCK_SET.has(tipoDoc);
}

/**
 * Signo del movimiento de stock para un tipo dado.
 *   - Nota de crédito → +1 (devuelve stock)
 *   - Resto → -1 (consume)
 */
function signoStock(tipoDoc) {
  return tipoDoc === 'nota_credito' ? +1 : -1;
}

function resolverSerieEmision(venta, config) {
  const est = venta.establecimiento || config?.establecimiento || '001';
  const pe = venta.punto_emision || config?.punto_emision || '001';
  return formatearSerie(est, pe);
}

function resolverSecuencial(venta) {
  if (venta?.secuencial_sri !== undefined && venta?.secuencial_sri !== null) {
    const n = parseInt(String(venta.secuencial_sri), 10);
    if (Number.isInteger(n) && n > 0) return n;
  }
  if (venta?.numero_factura) {
    const matches = String(venta.numero_factura).match(/(\d+)/g);
    if (matches && matches.length > 0) {
      const n = parseInt(matches[matches.length - 1], 10);
      if (Number.isInteger(n) && n > 0) return n;
    }
  }
  return 1;
}

function formatearSecuencial(n) {
  return String(parseEnteroSeguro(n, 1)).padStart(9, '0');
}

/**
 * Formatea el número de comprobante al formato SRI: EEE-PPP-SSSSSSSSS.
 */
function formatearNumeroSRI(comprobante) {
  if (!comprobante) return '';
  const est = String(comprobante.establecimiento || '001').padStart(3, '0').slice(-3);
  const pe = String(comprobante.punto_emision || '001').padStart(3, '0').slice(-3);
  const sec = String(comprobante.secuencial_sri || '000000001').padStart(9, '0').slice(-9);
  return `${est}-${pe}-${sec}`;
}

function configRucValido(config) {
  return Boolean(config && config.ruc && String(config.ruc).length === 13);
}

// ============================================================
// HELPERS DE CERTIFICADO
// ============================================================
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
    log.warn({ err: e.message }, 'No se pudo cargar el certificado');
    return null;
  }
}

async function firmarXMLConCertificado(db, xmlSinFirma) {
  const pems = await cargarCertificadoSeguro(db);
  if (!pems) {
    const err = new Error('No hay certificado de firma electrónica cargado o es inválido');
    err.status = 400;
    err.codigo = 'CERT_NO_DISPONIBLE';
    throw err;
  }
  return firmarXML(xmlSinFirma, pems.privateKeyPem, pems.certificatePem);
}

// ============================================================
// HELPERS DE STOCK
// ============================================================
/**
 * Reserva un número secuencial del contador (atómico).
 *
 * ⚠️  IMPORTANTE: NUNCA llamar esto dentro de `session.withTransaction`.
 *     El `$inc` es atómico a nivel de documento y NO necesita
 *     transacción. Si el driver reintenta el callback por
 *     `TransientTransactionError`, el `$inc` se ejecuta múltiples
 *     veces → secuenciales duplicados. Reservar SIEMPRE antes de
 *     abrir la transacción.
 *
 * @param {Db} db
 * @param {string} tipoDoc
 * @param {ClientSession|null} [session]  Solo por compat con llamadas
 *   externas; el flujo normal debe pasarlo como `null`/omitido.
 */
async function reservarContador(db, tipoDoc, session = null) {
  const opts = { upsert: true, returnDocument: 'after' };
  if (session) opts.session = session;

  const r = await db.collection(CONFIG.colContadores).findOneAndUpdate(
    { _id: tipoDoc },
    { $inc: { valor: 1 } },
    opts
  );

  const valor = extraerValor(r);
  if (valor === null) {
    const err = new Error(`Contador "${tipoDoc}" devolvió un valor inválido`);
    err.status = 500;
    err.codigo = 'CONTADOR_INVALIDO';
    throw err;
  }
  return valor;
}

async function actualizarStockAtomico(db, productoId, cantidad, signo, session) {
  const cant = Math.abs(Number(cantidad));
  const filtro = signo < 0
    ? { _id: productoId, stock: { $gte: cant } }
    : { _id: productoId };

  const r = await db.collection(CONFIG.colProductos).updateOne(
    filtro,
    { $inc: { stock: signo * cant }, $set: { updatedAt: new Date() } },
    { session }
  );

  if (r.matchedCount === 0) {
    const err = new Error(
      `Stock insuficiente para el producto ${productoId} ` +
      `(otro usuario acaba de consumir el stock disponible)`
    );
    err.status = 409;
    err.codigo = 'STOCK_INSUFICIENTE';
    throw err;
  }

  return db.collection(CONFIG.colProductos).findOne({ _id: productoId }, { session });
}

async function moverStockVenta({ db, ventaId, detalles, tipoDoc, fechaEmision, session, reversion = false }) {
  if (!afectaStock(tipoDoc)) return;

  const signoBase = signoStock(tipoDoc);
  const signo = reversion ? -signoBase : signoBase;

  for (const detalle of detalles || []) {
    const productoId = new ObjectId(detalle.productoId);
    const productoActualizado = await actualizarStockAtomico(
      db, productoId, detalle.cantidad, signo, session
    );

    if (reversion) continue;

    const costoUnitario = toNumber(productoActualizado.precio_compra);
    const precioVentaUnitario = toNumber(detalle.precio_unitario);

    await db.collection(CONFIG.colKardex).insertOne({
      productoId,
      fecha: new Date(fechaEmision),
      tipo_movimiento: tipoDoc === 'nota_credito' ? 'devolucion' : 'venta',
      cantidad: signo * toNumber(detalle.cantidad),
      costo_unitario: costoUnitario,
      precio_unitario_venta: precioVentaUnitario,
      saldo: productoActualizado.stock,
      referencia_id: ventaId,
      referencia_tipo: 'venta',
      createdAt: new Date()
    }, { session });
  }
}

async function borrarKardexVenta(db, ventaId, session) {
  await db.collection(CONFIG.colKardex).deleteMany(
    { referencia_id: ventaId, referencia_tipo: 'venta' },
    { session }
  );
}

// ============================================================
// HELPERS DE VALIDACIÓN
// ============================================================
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

function validarDetalleCantidadPrecio(detalle) {
  const cantidad = Number(detalle?.cantidad);
  const precio = Number(detalle?.precio_unitario);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw Object.assign(
      new Error(`Cantidad inválida en detalle (debe ser > 0): ${detalle?.cantidad}`),
      { status: 400, codigo: 'DETALLE_INVALIDO' }
    );
  }
  if (!Number.isFinite(precio) || precio < 0) {
    throw Object.assign(
      new Error(`Precio unitario inválido (debe ser >= 0): ${detalle?.precio_unitario}`),
      { status: 400, codigo: 'DETALLE_INVALIDO' }
    );
  }
}

function normalizarFechasRetencion(body) {
  if (!body || body.tipo_documento !== 'retencion') return { ok: true };

  if (body.comprobante_fecha_emision) {
    try {
      body.comprobante_fecha_emision = fechaSRI(body.comprobante_fecha_emision);
    } catch {
      return { ok: false, error: `comprobante_fecha_emision inválida: ${body.comprobante_fecha_emision}` };
    }
  }

  if (Array.isArray(body.impuestos_retencion)) {
    for (const imp of body.impuestos_retencion) {
      if (!imp) continue;
      if (imp.fechaEmisionDocSustento) {
        try {
          imp.fechaEmisionDocSustento = fechaSRI(imp.fechaEmisionDocSustento);
        } catch {
          return { ok: false, error: `fechaEmisionDocSustento inválida: ${imp.fechaEmisionDocSustento}` };
        }
      }
    }
  }

  return { ok: true };
}

async function verificarNumeroUnico(db, { tipoDoc, numeroFactura, rucEmisor, excluirId = null }) {
  if (!numeroFactura) return { ok: true };
  const numeroLimpio = String(numeroFactura).trim();
  if (!numeroLimpio) return { ok: true };

  const filtro = {
    tipo_documento: tipoDoc,
    numero_factura: numeroLimpio,
    ruc_emisor: rucEmisor || ''
  };
  if (excluirId) filtro._id = { $ne: excluirId };

  const dup = await db.collection(CONFIG.colVentas).findOne(filtro, { projection: { _id: 1 } });
  if (dup) {
    return {
      ok: false,
      error: `Ya existe un comprobante ${tipoDoc} con el número "${numeroLimpio}"`,
      codigo: 'NUMERO_DUPLICADO',
      documentoExistenteId: dup._id
    };
  }
  return { ok: true };
}

async function resolverFacturaOriginalNC(db, {
  facturaOriginalId,
  comprobanteClaveAcceso,
  numeroFacturaModificada,
  motivo
}) {
  let factura = null;

  if (facturaOriginalId && ObjectId.isValid(facturaOriginalId)) {
    factura = await db.collection(CONFIG.colVentas).findOne({
      _id: new ObjectId(facturaOriginalId)
    });
  } else if (comprobanteClaveAcceso) {
    factura = await db.collection(CONFIG.colVentas).findOne({
      clave_acceso: comprobanteClaveAcceso,
      tipo_documento: 'factura'
    });
  } else if (numeroFacturaModificada) {
    factura = await db.collection(CONFIG.colVentas).findOne({
      numero_factura: numeroFacturaModificada,
      tipo_documento: 'factura'
    });
  }

  if (!factura) {
    return {
      error: {
        status: 404,
        codigo: 'NC_FACTURA_NO_ENCONTRADA',
        error: 'No se encontró la factura original que se quiere acreditar'
      }
    };
  }

  if (factura.tipo_documento !== 'factura') {
    return {
      error: {
        status: 400,
        codigo: 'NC_SOLO_FACTURA',
        error: `Solo se pueden acreditar facturas (recibido: "${factura.tipo_documento}")`
      }
    };
  }

  if (factura.estado_sri !== 'AUTORIZADO') {
    return {
      error: {
        status: 409,
        codigo: 'NC_FACTURA_NO_AUTORIZADA',
        error: `La factura debe estar AUTORIZADA por el SRI. Estado actual: ${factura.estado_sri || 'desconocido'}`,
        estadoFactura: factura.estado_sri
      }
    };
  }

  if (!motivo || !String(motivo).trim()) {
    return {
      error: {
        status: 400,
        codigo: 'NC_MOTIVO_REQUERIDO',
        error: 'El motivo es obligatorio en una nota de crédito'
      }
    };
  }

  return { factura, motivo: String(motivo).trim() };
}

async function calcularSaldoAcreditable(db, facturaId) {
  const [r] = await db.collection(CONFIG.colVentas).aggregate([
    {
      $match: {
        tipo_documento: 'nota_credito',
        factura_original_id: facturaId,
        estado_sri: { $ne: 'RECHAZADA' }
      }
    },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]).toArray();
  return round2(toNumber(r?.total));
}

// ============================================================
// 🆕 VALIDACIÓN Y NORMALIZACIÓN DE IMPUESTOS DE RETENCIÓN
// ------------------------------------------------------------
// - Valida estructura de cada impuesto.
// - Busca el `codigoRetencion` en el catálogo SRI (con el
//   discriminador `impuesto` para evitar ambigüedades del tipo
//   '725' que existe tanto en RENTA como en IVA).
// - Auto-calcula `valorRetenido = base × %`.
// - Corrige discrepancias (por ej. si el usuario envía un %
//   distinto al del catálogo, gana el del catálogo).
// - Devuelve advertencias legibles + total retenido.
// ============================================================
function validarYNormalizarImpuestosRetencion(body) {
  const arr = body?.impuestos_retencion;

  if (!Array.isArray(arr) || arr.length === 0) {
    return {
      ok: false,
      error: 'Los comprobantes de retención requieren al menos un impuesto (impuestos_retencion[])'
    };
  }

  const normalizados = [];
  const advertencias = [];
  let totalRetenido = 0;

  for (let i = 0; i < arr.length; i++) {
    const imp = arr[i];
    const idx = i + 1;

    if (!imp || typeof imp !== 'object') {
      return { ok: false, error: `Impuesto #${idx}: debe ser un objeto` };
    }

    const codigoRetencionRaw = imp.codigoRetencion ?? imp.tipo_retencion;
    if (!codigoRetencionRaw || !String(codigoRetencionRaw).trim()) {
      return { ok: false, error: `Impuesto #${idx}: falta codigoRetencion` };
    }
    const codigoRetencion = String(codigoRetencionRaw).trim();

    const base = Number(imp.baseImponible);
    if (!Number.isFinite(base) || base < 0) {
      return { ok: false, error: `Impuesto #${idx}: baseImponible debe ser >= 0` };
    }

    let impuestoDeclarado = String(imp.impuesto || imp.impuesto_retencion || '')
      .trim()
      .toUpperCase();

    if (!impuestoDeclarado) {
      const codigoNum = String(imp.codigo || '').trim();
      if (codigoNum === '1') impuestoDeclarado = 'RENTA';
      else if (codigoNum === '2') impuestoDeclarado = 'IVA';
    }

    if (!impuestoDeclarado) {
      const catAny = buscarRetencion(codigoRetencion);
      if (catAny) impuestoDeclarado = catAny.impuesto;
    }

    if (!['RENTA', 'IVA'].includes(impuestoDeclarado)) {
      return {
        ok: false,
        error: `Impuesto #${idx}: no se pudo determinar si es RENTA o IVA`
      };
    }

    const cat = buscarRetencion(codigoRetencion, impuestoDeclarado);

    let pct = cat ? Number(cat.porcentaje) : Number(imp.porcentajeRetener);

    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      pct = cat ? Number(cat.porcentaje) : 0;
    }

    if (cat && imp.porcentajeRetener !== undefined && imp.porcentajeRetener !== null) {
      const pctEnviado = Number(imp.porcentajeRetener);
      if (Number.isFinite(pctEnviado) && Math.abs(pctEnviado - cat.porcentaje) > 0.01) {
        advertencias.push(
          `Impuesto #${idx}: el % enviado (${pctEnviado}%) difiere del catálogo SRI (${cat.porcentaje}%). Se usará el del catálogo.`
        );
        pct = cat.porcentaje;
      }
    }

    const valorCalculado = round2(base * pct / 100);
    let valor = Number(imp.valorRetenido);

    if (!Number.isFinite(valor) || valor < 0) {
      valor = valorCalculado;
    } else if (Math.abs(valor - valorCalculado) > 0.01) {
      advertencias.push(
        `Impuesto #${idx}: valorRetenido ($${valor.toFixed(2)}) no coincide con base × % ($${valorCalculado.toFixed(2)}). Se usó el calculado.`
      );
      valor = valorCalculado;
    }

    if (!cat) {
      advertencias.push(
        `Impuesto #${idx}: código "${codigoRetencion}" no está en el catálogo SRI. Se emitirá tal cual.`
      );
    }

    const normalizado = {
      codigo: CODIGO_IMPUESTO_RETENCION[impuestoDeclarado],
      codigoRetencion,
      impuesto: impuestoDeclarado,
      concepto: cat ? cat.nombre : String(imp.concepto || ''),
      baseImponible: round2(base),
      porcentajeRetener: round2(pct),
      valorRetenido: round2(valor),
      codigoDocumento: String(imp.codigoDocumento || imp.codDocSustento || '').trim(),
      numeroDocumento: String(imp.numeroDocumento || imp.numDocSustento || '').trim(),
      fechaEmisionDocSustento: imp.fechaEmisionDocSustento || ''
    };

    normalizados.push(normalizado);
    totalRetenido += normalizado.valorRetenido;
  }

  return {
    ok: true,
    impuestos: normalizados,
    advertencias,
    totalRetenido: round2(totalRetenido)
  };
}

// ============================================================
// VALIDADORES (express-validator)
// ============================================================
const validarVenta = [
  body('clienteId')
    .if(body('tipo_documento').not().equals('guia_remision'))
    .isMongoId().withMessage('ID de cliente inválido'),

  body('fecha_emision')
    .isISO8601().withMessage('Fecha inválida'),

  body('detalles')
    .isArray({ min: 1 }).withMessage('Debe incluir al menos un detalle')
    .custom(arr => Array.isArray(arr) && arr.length <= CONFIG.maxDetallesPorDocumento)
    .withMessage(`Máximo ${CONFIG.maxDetallesPorDocumento} detalles por documento`),

  body('subtotal').isNumeric().withMessage('Subtotal debe ser número'),
  body('iva').isNumeric().withMessage('IVA debe ser número'),
  body('total').isNumeric().withMessage('Total debe ser número'),

  body('tipo_documento')
    .optional()
    .isIn(TIPOS_DOCUMENTO_VALIDOS)
    .withMessage(`Tipo de documento inválido. Válidos: ${TIPOS_DOCUMENTO_VALIDOS.join(', ')}`),

  body('factura_original_id')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId().withMessage('ID de factura original inválido'),

  body('impuestos_retencion')
    .optional()
    .isArray().withMessage('impuestos_retencion debe ser un array')
];

// ============================================================
// PIPELINE DE LISTADO
// ============================================================
function buildPipelineListado(match) {
  return [
    { $match: match },
    { $project: { ...CONFIG.proyeccionLista } },
    {
      $lookup: {
        from: CONFIG.colClientes,
        localField: 'clienteId',
        foreignField: '_id',
        as: 'cliente',
        pipeline: [{ $project: { nombre: 1, ruc: 1, telefono: 1, email: 1 } }]
      }
    },
    { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
    // 🆕 Lookup proveedores: las retenciones emitidas a un proveedor
    //    tienen `proveedorId` pero NO `clienteId`. Sin este lookup,
    //    la lista mostraba "N/A" como contraparte.
    {
      $lookup: {
        from: CONFIG.colProveedores,
        localField: 'proveedorId',
        foreignField: '_id',
        as: 'proveedor',
        pipeline: [{ $project: { nombre: 1, ruc: 1, telefono: 1, email: 1 } }]
      }
    },
    { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } }
  ]
}

// ============================================================
// GET /  → listado
// ============================================================
router.get('/', requierePermiso('ventas', 'ver'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (soloString(req.query.search) || '').trim();

    const { tipo_documento, estado_pago, estado_sri, clienteId } = req.query;

    const desde = req.query.desde ? new Date(req.query.desde) : null;
    const hasta = req.query.hasta ? new Date(req.query.hasta) : null;

    const match = {};
    if ((desde && !Number.isNaN(desde.getTime())) || (hasta && !Number.isNaN(hasta.getTime()))) {
      match.fecha_emision = {};
      if (desde && !Number.isNaN(desde.getTime())) match.fecha_emision.$gte = desde;
      if (hasta && !Number.isNaN(hasta.getTime())) {
        hasta.setHours(23, 59, 59, 999);
        match.fecha_emision.$lte = hasta;
      }
    }

    if (soloString(tipo_documento)) match.tipo_documento = tipo_documento;
    if (soloString(estado_pago)) match.estado_pago = estado_pago;
    if (soloString(estado_sri)) match.estado_sri = estado_sri;
    if (soloString(clienteId) && ObjectId.isValid(clienteId)) {
      match.clienteId = new ObjectId(clienteId);
    }

    const pipeline = buildPipelineListado(match);

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

    const sort = parseSort(req.query, { fecha_emision: -1, _id: -1 });
    const col = req.db.collection(CONFIG.colVentas);

    if (!paginar) {
      const data = await col.aggregate([
        ...pipeline,
        { $sort: sort },
        { $limit: CONFIG.maxSinPaginar }
      ]).toArray();

      headersNoStore(res);
      return res.json(data);
    }

    const [countRes, data] = await Promise.all([
      col.aggregate([...pipeline, { $count: 'total' }]).toArray(),
      col.aggregate([
        ...pipeline,
        { $sort: sort },
        { $skip: skip },
        { $limit: limit }
      ]).toArray()
    ]);

    const total = countRes[0]?.total || 0;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    headersNoStore(res);
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
// POST /validar-clave
// ============================================================
router.post('/validar-clave', requierePermiso('ventas', 'ver'), async (req, res, next) => {
  try {
    const clave = soloString(req.body?.clave);
    const valida = validarClave(clave);
    const partes = descomponerClave(clave);

    headersNoStore(res);
    return res.json({ valida, partes });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /buscar-clave/:clave
// ============================================================
router.get('/buscar-clave/:clave', requierePermiso('ventas', 'ver'), async (req, res, next) => {
  try {
    const clave = soloString(req.params.clave);
    if (!clave || clave.length !== 49) {
      return res.status(400).json({
        error: 'Clave debe tener 49 dígitos',
        codigo: 'CLAVE_LONGITUD_INVALIDA'
      });
    }

    const venta = await req.db.collection(CONFIG.colVentas).findOne(
      { clave_acceso: clave },
      { projection: CONFIG.proyeccionLista }
    );
    if (!venta) {
      return res.status(404).json({
        error: 'No se encontró documento con esa clave',
        codigo: 'VENTA_NOT_FOUND'
      });
    }

    const cliente = venta.clienteId
      ? await req.db.collection(CONFIG.colClientes).findOne({ _id: venta.clienteId })
      : null;

    headersNoStore(res);
    return res.json({ ...venta, cliente });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /buscar-acreditable  → facturas autorizadas con saldo > 0
// ============================================================
router.get('/buscar-acreditable', requierePermiso('ventas', 'ver'), async (req, res, next) => {
  try {
    const q = (soloString(req.query.q) || '').trim();
    const clienteId = soloString(req.query.clienteId);

    const match = {
      tipo_documento: 'factura',
      estado_sri: 'AUTORIZADO'
    };

    if (q) {
      const regex = new RegExp(escapeRegex(q), 'i');
      match.$or = [
        { numero_factura: regex },
        { clave_acceso: regex }
      ];
    }

    if (clienteId && ObjectId.isValid(clienteId)) {
      match.clienteId = new ObjectId(clienteId);
    }

    const facturas = await req.db.collection(CONFIG.colVentas).aggregate([
      { $match: match },
      { $sort: { fecha_emision: -1 } },
      { $limit: 30 },
      {
        $lookup: {
          from: CONFIG.colVentas,
          let: { facturaId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$factura_original_id', '$$facturaId'] },
                tipo_documento: 'nota_credito',
                estado_sri: { $ne: 'RECHAZADA' }
              }
            },
            { $group: { _id: null, totalNC: { $sum: '$total' } } }
          ],
          as: 'ncs'
        }
      },
      {
        $addFields: {
          totalNC: { $ifNull: [{ $arrayElemAt: ['$ncs.totalNC', 0] }, 0] }
        }
      },
      {
        $addFields: {
          saldoAcreditable: { $subtract: ['$total', '$totalNC'] }
        }
      },
      { $match: { saldoAcreditable: { $gt: 0.01 } } },
      {
        $lookup: {
          from: CONFIG.colClientes,
          localField: 'clienteId',
          foreignField: '_id',
          as: 'cliente',
          pipeline: [{ $project: { nombre: 1, ruc: 1, telefono: 1, email: 1, direccion: 1 } }]
        }
      },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          numero_factura: 1,
          clave_acceso: 1,
          fecha_emision: 1,
          total: 1,
          totalNC: 1,
          saldoAcreditable: 1,
          establecimiento: 1,
          punto_emision: 1,
          secuencial_sri: 1,
          detalles: 1,
          clienteId: 1,
          cliente: 1,
          razon_social_emisor: 1,
          ruc_emisor: 1
        }
      }
    ]).toArray();

    headersNoStore(res);
    return res.json(facturas);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /buscar-retenible  → facturas autorizadas para retención
// ============================================================
router.get('/buscar-retenible', requierePermiso('ventas', 'ver'), async (req, res, next) => {
  try {
    const q = (soloString(req.query.q) || '').trim();
    const clienteId = soloString(req.query.clienteId);

    const match = {
      tipo_documento: 'factura',
      estado_sri: 'AUTORIZADO'
    };

    if (q) {
      const regex = new RegExp(escapeRegex(q), 'i');
      match.$or = [
        { numero_factura: regex },
        { clave_acceso: regex }
      ];
    }

    if (clienteId && ObjectId.isValid(clienteId)) {
      match.clienteId = new ObjectId(clienteId);
    }

    const facturas = await req.db.collection(CONFIG.colVentas).aggregate([
      { $match: match },
      { $sort: { fecha_emision: -1 } },
      { $limit: 30 },
      {
        $lookup: {
          from: CONFIG.colClientes,
          localField: 'clienteId',
          foreignField: '_id',
          as: 'cliente',
          pipeline: [{ $project: { nombre: 1, ruc: 1, telefono: 1, email: 1, direccion: 1 } }]
        }
      },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          numero_factura: 1,
          clave_acceso: 1,
          numero_autorizacion: 1,
          fecha_emision: 1,
          fecha_autorizacion: 1,
          subtotal: 1,
          iva: 1,
          total: 1,
          detalles: 1,
          clienteId: 1,
          cliente: 1,
          razon_social_emisor: 1,
          ruc_emisor: 1
        }
      }
    ]).toArray();

    headersNoStore(res);
    return res.json(facturas);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /migrar-claves
// ============================================================
router.post(
  '/migrar-claves',
  (req, res, next) => {
    if (req.user?.rol !== 'admin') {
      return res.status(403).json({
        error: 'Solo un administrador puede ejecutar migraciones masivas de claves',
        codigo: 'SOLO_ADMIN'
      });
    }
    next();
  },
  async (req, res, next) => {
    try {
      if (CONFIG.migrarRequiereConfirmacion && req.query.confirmar !== 'true') {
        return res.status(400).json({
          error: 'Debe enviar ?confirmar=true para ejecutar la migración',
          codigo: 'CONFIRMACION_REQUERIDA'
        });
      }

      const config = await req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' });
      if (!configRucValido(config)) {
        return res.status(400).json({
          error: 'La empresa no tiene un RUC válido (13 dígitos) configurado',
          codigo: 'RUC_INVALIDO'
        });
      }

      const t0 = Date.now();
      const col = req.db.collection(CONFIG.colVentas);

      const facturasSinClave = await col.find({
        tipo_documento: { $in: [...SETS.DOCS_CON_CLAVE] },
        estado_sri: { $ne: 'AUTORIZADO' },
        $or: [
          { clave_acceso: '' },
          { clave_acceso: { $exists: false } },
          { clave_acceso: null }
        ]
      }).limit(CONFIG.migrarMaxDocs).toArray();

      const truncado = facturasSinClave.length >= CONFIG.migrarMaxDocs;

      const resultados = [];
      let exitosas = 0;
      let errores = 0;
      let maxSecuencialUsado = 0;

      const pems = await cargarCertificadoSeguro(req.db);
      const ahora = new Date();

      for (const venta of facturasSinClave) {
        try {
          const tipoDoc = venta.tipo_documento || 'factura';
          const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';
          const serie = resolverSerieEmision(venta, config);
          const sec = resolverSecuencial(venta);

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

          const cliente = venta.clienteId
            ? await req.db.collection(CONFIG.colClientes).findOne({ _id: venta.clienteId })
            : null;

          const ventaParaXml = {
            ...venta,
            clave_acceso: claveAcceso,
            serie,
            secuencial_sri: formatearSecuencial(sec),
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
              log.warn({ err: e.message, ventaId: String(venta._id) }, 'Error firmando en migración');
            }
          }

          await col.updateOne(
            { _id: venta._id },
            {
              $set: {
                clave_acceso: claveAcceso,
                serie,
                secuencial_sri: formatearSecuencial(sec),
                ruc_emisor: config.ruc,
                razon_social_emisor: config.razon_social || '',
                ambiente_sri: config.ambiente || '1',
                xml_generado: xml,
                xml_firmado: xmlFirmado,
                estado_sri: estadoSri,
                updatedAt: ahora
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
        await req.db.collection(CONFIG.colContadores).updateOne(
          { _id: 'factura' },
          { $max: { valor: maxSecuencialUsado }, $set: { updatedAt: ahora } },
          { upsert: true }
        );
      }

      await auditarSeguro(req.db, req, {
        accion: 'migrar-claves',
        coleccion: CONFIG.colVentas,
        documentoNumero: 'migracion',
        detalle:
          `Migración de claves: ${exitosas} exitosas, ${errores} errores. ` +
          `Contador factura en ${maxSecuencialUsado}` +
          (truncado ? ` (TRUNCADO a ${CONFIG.migrarMaxDocs})` : '')
      });

      headersNoStore(res);
      return res.json({
        total: facturasSinClave.length,
        exitosas,
        errores,
        resultados,
        _meta: {
          tiempoMs: Date.now() - t0,
          maxDocs: CONFIG.migrarMaxDocs,
          truncado
        }
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// GET /:id/xml
// ============================================================
router.get('/:id/xml', requierePermiso('ventas', 'ver'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id);

    const venta = await req.db.collection(CONFIG.colVentas).findOne({ _id });
    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada', codigo: 'VENTA_NOT_FOUND' });
    }

    const { claveAcceso, xml, xmlFirmado, motivo } = await asegurarClaveYXml(req.db, venta);
    if (!claveAcceso || (!xml && !xmlFirmado)) {
      return res.status(400).json({
        error: motivo || 'No se pudo generar la clave',
        codigo: 'XML_NO_GENERABLE'
      });
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${claveAcceso}.xml"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(xmlFirmado || xml);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /:id/xml-preview
// ============================================================
router.get('/:id/xml-preview', requierePermiso('ventas', 'ver'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id);

    const venta = await req.db.collection(CONFIG.colVentas).findOne({ _id });
    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada', codigo: 'VENTA_NOT_FOUND' });
    }

    const { claveAcceso, xml, xmlFirmado, motivo } = await asegurarClaveYXml(req.db, venta);
    if (!claveAcceso || (!xml && !xmlFirmado)) {
      return res.status(400).json({
        error: motivo || 'No se pudo generar la clave',
        codigo: 'XML_NO_GENERABLE'
      });
    }

    headersNoStore(res);
    return res.json({
      xml,
      xml_firmado: xmlFirmado,
      clave_acceso: claveAcceso,
      firmado: Boolean(xmlFirmado)
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /:id/xml-firmado
// ============================================================
router.get('/:id/xml-firmado', requierePermiso('ventas', 'ver'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id);

    const venta = await req.db.collection(CONFIG.colVentas).findOne(
      { _id },
      { projection: { xml_firmado: 1, clave_acceso: 1 } }
    );
    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada', codigo: 'VENTA_NOT_FOUND' });
    }
    if (!venta.xml_firmado) {
      return res.status(404).json({
        error: 'Este documento no está firmado',
        codigo: 'XML_NO_FIRMADO'
      });
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${venta.clave_acceso}_firmado.xml"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(venta.xml_firmado);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /:id/qr
// ============================================================
router.get('/:id/qr', requierePermiso('ventas', 'ver'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id);

    const venta = await req.db.collection(CONFIG.colVentas).findOne({ _id });
    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada', codigo: 'VENTA_NOT_FOUND' });
    }

    const { claveAcceso } = await asegurarClaveYXml(req.db, venta);
    if (!claveAcceso) {
      return res.status(400).json({
        error: 'No se pudo generar la clave',
        codigo: 'CLAVE_NO_GENERABLE'
      });
    }

    const config = await req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' });
    const { generarQRComprobante } = require('../utils/qrGenerator');
    const qr = await generarQRComprobante({
      ruc: config?.ruc || venta.ruc_emisor || '',
      tipoComprobante: '01',
      numeroComprobante: venta.numero_factura || '',
      fechaEmision: venta.fecha_emision,
      montoTotal: venta.total,
      claveAcceso
    });

    headersNoStore(res);
    return res.json({ qr: qr.dataUrl, clave_acceso: claveAcceso });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /:id  → detalle
// ============================================================
router.get('/:id', requierePermiso('ventas', 'ver'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id);

        const [venta] = await req.db.collection(CONFIG.colVentas).aggregate([
      { $match: { _id } },
      { $project: { ...CONFIG.proyeccionLista } },
      {
        $lookup: {
          from: CONFIG.colClientes,
          localField: 'clienteId',
          foreignField: '_id',
          as: 'cliente'
        }
      },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
      // 🆕 lookup proveedor para retenciones auto-emitidas
      {
        $lookup: {
          from: CONFIG.colProveedores,
          localField: 'proveedorId',
          foreignField: '_id',
          as: 'proveedor'
        }
      },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } }
    ]).toArray();

    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada', codigo: 'VENTA_NOT_FOUND' });
    }

    headersNoStore(res);
    return res.json(venta);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /:id/firmar
// ============================================================
router.post('/:id/firmar', requierePermiso('ventas', 'editar'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id);

    const venta = await req.db.collection(CONFIG.colVentas).findOne({ _id });
    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada', codigo: 'VENTA_NOT_FOUND' });
    }
    if (venta.xml_firmado) {
      return res.status(409).json({
        error: 'Este documento ya está firmado',
        codigo: 'YA_FIRMADO'
      });
    }

    const { claveAcceso, xml, motivo } = await asegurarClaveYXml(req.db, venta);
    if (!claveAcceso || !xml) {
      return res.status(400).json({ error: motivo || 'No se puede firmar', codigo: 'XML_NO_GENERABLE' });
    }

    let xmlFirmado;
    try {
      xmlFirmado = await firmarXMLConCertificado(req.db, xml);
    } catch (e) {
      return res.status(e.status || 400).json({
        error: 'Error al firmar: ' + e.message,
        codigo: e.codigo || 'FIRMA_ERROR'
      });
    }

    const validacion = validarFirma(xmlFirmado);
    if (!validacion.valido) {
      return res.status(400).json({
        error: 'La firma generada es inválida: ' + validacion.motivo,
        codigo: 'FIRMA_INVALIDA'
      });
    }

    await req.db.collection(CONFIG.colVentas).updateOne(
      { _id },
      { $set: { xml_firmado: xmlFirmado, estado_sri: 'FIRMADO', fecha_firma: new Date(), updatedAt: new Date() } }
    );

    await auditarSeguro(req.db, req, {
      accion: 'firmar',
      coleccion: CONFIG.colVentas,
      documentoId: venta._id,
      documentoNumero: venta.numero_factura || '',
      detalle: `Documento firmado electrónicamente: ${venta.numero_factura || ''}`
    });

    headersNoStore(res);
    return res.json({
      message: 'Documento firmado correctamente',
      xml_firmado: xmlFirmado,
      clave_acceso: claveAcceso
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /:id/generar-clave
// ============================================================
router.post('/:id/generar-clave', requierePermiso('ventas', 'editar'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id);

    const venta = await req.db.collection(CONFIG.colVentas).findOne({ _id });
    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada', codigo: 'VENTA_NOT_FOUND' });
    }
    if (venta.estado_sri === 'AUTORIZADO') {
      return res.status(409).json({
        error: 'Este documento ya fue autorizado. No se puede regenerar la clave.',
        codigo: 'YA_AUTORIZADO'
      });
    }

    const config = await req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' });
    if (!configRucValido(config)) {
      return res.status(400).json({
        error: 'La empresa no tiene un RUC válido (13 dígitos) configurado',
        codigo: 'RUC_INVALIDO'
      });
    }

    const tipoDoc = venta.tipo_documento || 'factura';
    if (!SETS.DOCS_CON_CLAVE.has(tipoDoc)) {
      return res.status(400).json({
        error: `El tipo "${tipoDoc}" no requiere clave de acceso`,
        codigo: 'NO_REQUIERE'
      });
    }

    const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';
    const serie = resolverSerieEmision(venta, config);
    const sec = resolverSecuencial(venta);

    const claveAcceso = generarClaveAcceso({
      fechaEmision: new Date(venta.fecha_emision),
      tipoComprobante: codigoSRI,
      ruc: config.ruc,
      ambiente: config.ambiente || '1',
      serie,
      secuencial: sec,
      tipoEmision: config.tipo_emision || '1'
    });

    const secuencialFormateado = formatearSecuencial(sec);

    const cliente = venta.clienteId
      ? await req.db.collection(CONFIG.colClientes).findOne({ _id: venta.clienteId })
      : null;

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
        log.warn({ err: e.message, ventaId: String(_id) }, 'Error firmando en generar-clave');
      }
    }

    await req.db.collection(CONFIG.colVentas).updateOne(
      { _id },
      {
        $set: {
          clave_acceso: claveAcceso,
          serie,
          secuencial_sri: secuencialFormateado,
          ruc_emisor: config.ruc,
          razon_social_emisor: config.razon_social || '',
          ambiente_sri: config.ambiente || '1',
          xml_generado: xml,
          xml_firmado: xmlFirmado,
          estado_sri: estadoSri,
          fecha_firma: fechaFirma,
          updatedAt: new Date()
        }
      }
    );

    await auditarSeguro(req.db, req, {
      accion: 'generar-clave',
      coleccion: CONFIG.colVentas,
      documentoId: venta._id,
      documentoNumero: venta.numero_factura || '',
      detalle: `Clave de acceso generada: ${claveAcceso}`
    });

    headersNoStore(res);
    return res.json({
      success: true,
      message: 'Clave de acceso generada correctamente',
      clave_acceso: claveAcceso,
      serie,
      secuencial: secuencialFormateado,
      firmado: Boolean(xmlFirmado),
      estado_sri: estadoSri
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /  → crear
// ============================================================
router.post(
  '/',
  requierePermiso('ventas', 'crear'),
  verificarPeriodoAbierto(),
  validarVenta,
  async (req, res, next) => {
    if (validar(req, res)) return;

    const errorTotales = validarTotales(req.body);
    if (errorTotales) {
      return res.status(400).json({ error: errorTotales, codigo: 'TOTALES_INCONSISTENTES' });
    }

    const errorFecha = validarFechaNoFutura(req.body.fecha_emision);
    if (errorFecha) {
      return res.status(400).json({ error: errorFecha, codigo: 'FECHA_INVALIDA' });
    }

    const normFechas = normalizarFechasRetencion(req.body);
    if (!normFechas.ok) {
      return res.status(400).json({ error: normFechas.error, codigo: 'FECHA_INVALIDA' });
    }

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
        forma_pago, estado_pago, fecha_pago, observaciones,
        factura_original_id
      } = req.body;

            const tipoDoc = tipo_documento || 'factura';

      // ============================================================
      // 🆕 REFACTOR 2025-XX: la creación MANUAL de retenciones está
      //    DEPRECADA. Las retenciones se emiten AUTOMÁTICAMENTE
      //    desde `POST /api/compras`.
      //
      //    Motivo:
      //      1. Garantiza que toda retención tenga `compra_origen_id`
      //         (trazabilidad fiscal).
      //      2. Evita duplicados: el usuario no puede crear dos
      //         retenciones para la misma compra.
      //      3. Simplifica el flujo: siempre se retiene "al comprar".
      //
      //    Devolvemos 410 Gone con instrucciones de qué hacer.
      // ============================================================
      if (tipoDoc === 'retencion') {
        return res.status(410).json({
          error:
            'Las retenciones ahora se emiten automáticamente al crear una compra. ' +
            'Registra la compra correspondiente y la retención se generará sola, ' +
            'con clave de acceso SRI, XML y firma electrónica.',
          codigo: 'RETENCION_MANUAL_DEPRECADA',
          redirigir_a: '/compras/nuevo',
          doc: 'POST /api/compras (con campo retencion_valor > 0)'
        });
      }

      if (!SETS.TIPOS_DOCUMENTO_VALIDOS.has(tipoDoc)) {
        return res.status(400).json({
          error: `Tipo de documento "${tipoDoc}" no es válido`,
          codigo: 'TIPO_DOCUMENTO_INVALIDO',
          tipos_validos: TIPOS_DOCUMENTO_VALIDOS
        });
      }

      const config = await req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' });

      // ===== NOTA DE CRÉDITO: resolver factura original + validar =====
      let facturaOriginal = null;
      let motivoNC = '';

      if (tipoDoc === 'nota_credito') {
        const resuelto = await resolverFacturaOriginalNC(req.db, {
          facturaOriginalId: factura_original_id,
          comprobanteClaveAcceso: comprobante_clave_acceso,
          numeroFacturaModificada: numero_factura_modificada,
          motivo
        });

        if (resuelto.error) {
          return res.status(resuelto.error.status).json({
            error: resuelto.error.error,
            codigo: resuelto.error.codigo,
            ...(resuelto.error.estadoFactura ? { estadoFactura: resuelto.error.estadoFactura } : {})
          });
        }

        facturaOriginal = resuelto.factura;
        motivoNC = resuelto.motivo;

        const totalNCsPrevio = await calcularSaldoAcreditable(req.db, facturaOriginal._id);
        const saldoAcreditable = round2(toNumber(facturaOriginal.total) - totalNCsPrevio);
        const totalNuevaNC = round2(toNumber(total));

        if (saldoAcreditable <= 0.01) {
          return res.status(409).json({
            error: `Esta factura ya está totalmente acreditada. Total: $${facturaOriginal.total}, NCs previas: $${totalNCsPrevio}.`,
            codigo: 'NC_FACTURA_SIN_SALDO',
            saldoAcreditable: 0
          });
        }

        if (totalNuevaNC > saldoAcreditable + 0.01) {
          return res.status(400).json({
            error: `El monto de la NC ($${totalNuevaNC}) supera el saldo acreditable ($${saldoAcreditable}). Total factura: $${facturaOriginal.total}, NCs previas: $${totalNCsPrevio}.`,
            codigo: 'NC_EXCEDE_SALDO',
            saldoAcreditable,
            totalFactura: facturaOriginal.total,
            totalNCsPrevio
          });
        }
      }

      // ===== RETENCIÓN: validar y normalizar impuestos =====
      let impuestosRetencionFinal = impuestos_retencion;
      let retencionInfo = null;

      if (tipoDoc === 'retencion') {
        const valRet = validarYNormalizarImpuestosRetencion(req.body);
        if (!valRet.ok) {
          return res.status(400).json({
            error: valRet.error,
            codigo: 'RETENCION_INVALIDA'
          });
        }
        impuestosRetencionFinal = valRet.impuestos;
        retencionInfo = valRet;
      }

      if (tipoDoc !== 'nota_credito' && tipoDoc !== 'guia_remision') {
        for (const detalle of detalles) {
          if (!ObjectId.isValid(detalle.productoId)) {
            return res.status(400).json({
              error: `ID de producto inválido: ${detalle.productoId}`,
              codigo: 'PRODUCTO_ID_INVALIDO'
            });
          }
          validarDetalleCantidadPrecio(detalle);
        }

        const productoIds = detalles.map(d => new ObjectId(d.productoId));
        const productos = await req.db.collection(CONFIG.colProductos)
          .find({ _id: { $in: productoIds } })
          .project({ _id: 1 })
          .toArray();
        const encontrados = new Set(productos.map(p => String(p._id)));
        for (const detalle of detalles) {
          if (!encontrados.has(String(detalle.productoId))) {
            return res.status(400).json({
              error: `Producto ${detalle.productoId} no existe`,
              codigo: 'PRODUCTO_NO_EXISTE'
            });
          }
        }
      }

      // Solo verificar unicidad de número si NO es NC
      if (tipoDoc !== 'nota_credito') {
        const uniqCheck = await verificarNumeroUnico(req.db, {
          tipoDoc,
          numeroFactura: numero_factura,
          rucEmisor: config?.ruc || ''
        });
        if (!uniqCheck.ok) {
          return res.status(409).json({
            error: uniqCheck.error,
            codigo: uniqCheck.codigo,
            documentoExistenteId: uniqCheck.documentoExistenteId
          });
        }
      }

      let cliente = null;
      if (tipoDoc !== 'guia_remision') {
        cliente = await req.db.collection(CONFIG.colClientes).findOne({
          _id: new ObjectId(clienteId)
        });
        if (!cliente) {
          return res.status(400).json({
            error: 'El cliente no existe',
            codigo: 'CLIENTE_NO_EXISTE',
            clienteId
          });
        }
      }

      const generaClave = SETS.DOCS_CON_CLAVE.has(tipoDoc) && configRucValido(config);
      const prefijo = PREFIJOS_CONTADOR[tipoDoc] || 'DOC';
      const pems = await cargarCertificadoSeguro(req.db);
      const clienteIdObj = clienteId && ObjectId.isValid(clienteId)
        ? new ObjectId(clienteId)
        : null;

      // 🔧 FIX CRÍTICO: reservar el contador FUERA de la transacción.
      //
      //    ANTES: `reservarContador` se llamaba DENTRO del callback de
      //    `conTransaccion`. Un `findOneAndUpdate` con `$inc` es atómico
      //    a nivel de documento y NO requiere transacción. Pero al
      //    envolverlo en `session.withTransaction`, si el driver
      //    reintentaba el callback por `TransientTransactionError`
      //    (conflicto de escritura sobre el propio documento `contadores`
      //    cuando hay concurrencia), el `$inc` se ejecutaba 2+ veces →
      //    secuenciales duplicados y `clave_acceso` desalineada con
      //    `numero_factura`.
      //
      //    AHORA: se reserva antes de abrir la transacción. Si la
      //    transacción falla después, el número queda "quemado" — es
      //    aceptable y muchísimo mejor que duplicar. Mismo criterio ya
      //    aplicado en `routes/compras.js`.
      const contadorValor = await reservarContador(req.db, tipoDoc);
      const codigo = `${prefijo}-${String(contadorValor).padStart(6, '0')}`;

      const resultado = await conTransaccion(req.db, async (session) => {
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
            throw Object.assign(
              new Error(`Error generando clave de acceso: ${e.message}`),
              { status: 400, codigo: 'CLAVE_ERROR' }
            );
          }
        }

        const exportacionCodigo = tipoDoc === 'exportacion' ? codigo : null;

        let xmlGenerado = '';
        let xmlFirmado = '';
        let estadoSri = generaClave ? 'PENDIENTE' : 'NO_APLICA';
        let fechaFirma = null;

        const numeroFacturaFinal = tipoDoc === 'nota_credito'
          ? codigo
          : (numero_factura || codigo);

        const numeroFacturaModificadaFinal = tipoDoc === 'nota_credito' && facturaOriginal
          ? formatearNumeroSRI(facturaOriginal)
          : (numero_factura_modificada || '');

        if (claveAcceso && config) {
          const ventaParaXml = {
            clienteId: clienteIdObj,
            numero_factura: numeroFacturaFinal,
            fecha_emision: new Date(fecha_emision),
            tipo_documento: tipoDoc,
            detalles, subtotal, iva, total,
            clave_acceso: claveAcceso,
            serie: serieFormateada,
            secuencial_sri: formatearSecuencial(numeroSecuencial),
            ruc_emisor: config.ruc,
            razon_social_emisor: config.razon_social || '',
            establecimiento: establecimiento || config.establecimiento || '001',
            punto_emision: punto_emision || config.punto_emision || '001',
            tipo_retencion, tipo_impuesto, impuestos_retencion: impuestosRetencionFinal,
            numero_retencion, porcentaje_retencion,
            comprobante_documento, comprobante_numero, comprobante_fecha_emision,
            numero_factura_modificada: numeroFacturaModificadaFinal,
            motivo: motivoNC || motivo || ''
          };
          try {
            xmlGenerado = generarXMLComprobante(ventaParaXml, cliente, config);
          } catch (e) {
            throw Object.assign(
              new Error(`Error generando XML: ${e.message}`),
              { status: 500, codigo: 'XML_ERROR' }
            );
          }
        }

        if (xmlGenerado && pems) {
          try {
            xmlFirmado = firmarXML(xmlGenerado, pems.privateKeyPem, pems.certificatePem);
            estadoSri = 'FIRMADO';
            fechaFirma = new Date();
          } catch (e) {
            log.warn({ err: e.message, tipoDoc }, 'Error firmando en POST /ventas');
          }
        }

        const ahora = new Date();
        const venta = {
          clienteId: clienteIdObj,
          numero_factura: numeroFacturaFinal,
          fecha_emision: new Date(fecha_emision),
          tipo_documento: tipoDoc,
          detalles, subtotal, iva, total,
          clave_acceso: claveAcceso || '',
          numero_autorizacion: '',
          estado_sri: estadoSri,
          ambiente_sri: config?.ambiente || '1',
          serie: serieFormateada || '',
          secuencial_sri: formatearSecuencial(numeroSecuencial),
          ruc_emisor: config?.ruc || '',
          razon_social_emisor: config?.razon_social || '',

          // Nota de Crédito
          factura_original_id: facturaOriginal?._id || null,
          numero_factura_modificada: numeroFacturaModificadaFinal,
          motivo: motivoNC || motivo || '',

          // 🆕 Retención (normalizada + total)
          numero_retencion: numero_retencion || '',
          porcentaje_retencion: porcentaje_retencion || 0,
          tipo_retencion: tipo_retencion || '',
          tipo_impuesto: tipo_impuesto || '1',
          impuestos_retencion: Array.isArray(impuestosRetencionFinal) ? impuestosRetencionFinal : undefined,
          total_retenido: retencionInfo?.totalRetenido || 0,

          numero_guia: numero_guia || '',
          transportista: transportista || '',
          placa: placa || '',
          numero_exportacion: numero_exportacion || exportacionCodigo || '',
          pais_destino: pais_destino || '',
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
          documento_aduana: documento_aduana || '',
          comprobante_tipo_emision: comprobante_tipo_emision || '',
          comprobante_documento: comprobante_documento || '',
          comprobante_clave_acceso: comprobante_clave_acceso || '',
          comprobante_numero_autorizacion: comprobante_numero_autorizacion || '',
          comprobante_numero: comprobante_numero || '',
          comprobante_fecha_emision: comprobante_fecha_emision || '',
          forma_pago: forma_pago || '',
          estado_pago: estado_pago || 'pendiente',
          monto_pagado: 0,
          fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
          observaciones: observaciones || '',
          xml_generado: xmlGenerado,
          xml_firmado: xmlFirmado,
          fecha_firma: fechaFirma,
          intentos_envio_sri: 0,
          createdAt: ahora,
          updatedAt: ahora
        };

        const ventaResult = await req.db.collection(CONFIG.colVentas)
          .insertOne(venta, { session });
        const ventaId = ventaResult.insertedId;

        await moverStockVenta({
          db: req.db,
          ventaId,
          detalles,
          tipoDoc,
          fechaEmision: fecha_emision,
          session
        });

        return { ventaResult, claveAcceso, partesClave };
      });

      const [ventaCreada] = await req.db.collection(CONFIG.colVentas).aggregate([
        { $match: { _id: resultado.ventaResult.insertedId } },
        { $project: { ...CONFIG.proyeccionLista } },
        {
          $lookup: {
            from: CONFIG.colClientes,
            localField: 'clienteId',
            foreignField: '_id',
            as: 'cliente'
          }
        },
        { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } }
      ]).toArray();

      let advertencia = null;
      if (generaClave && ventaCreada?.estado_sri === 'PENDIENTE') {
        advertencia =
          'El comprobante se guardó sin firma electrónica. Cargue un certificado válido y ' +
          'fírmelo manualmente (POST /api/ventas/{id}/firmar).';
      } else if (!generaClave && SETS.DOCS_CON_CLAVE.has(tipoDoc)) {
        advertencia =
          'La empresa no tiene un RUC de 13 dígitos configurado. El comprobante se guardó ' +
          'sin clave de acceso.';
      }

      await auditarSeguro(req.db, req, {
        accion: 'crear',
        coleccion: CONFIG.colVentas,
        documentoId: resultado.ventaResult.insertedId,
        documentoNumero: ventaCreada?.numero_factura || '',
        datosNuevos: ventaCreada,
        detalle:
          `Venta creada: ${ventaCreada?.numero_factura || ''} por ` +
          `$${round2(ventaCreada?.total)}${advertencia ? ' — ' + advertencia : ''}`
      });

      if (req.io) req.io.emit('nueva-venta', ventaCreada);

      headersNoStore(res);
      return res.status(201).json({
        ...ventaCreada,
        clave_acceso_partes: resultado.partesClave,
        _advertencia: advertencia,
        // 🆕 Advertencias de retención (si las hay)
        _advertencias_retencion: retencionInfo?.advertencias?.length
          ? retencionInfo.advertencias
          : undefined,
        total_retenido: retencionInfo?.totalRetenido
      });
    } catch (err) {
      log.error({ err: err.message }, 'Error creando venta');
      return next(err);
    }
  }
);

// ============================================================
// PUT /:id  → actualizar
// ============================================================
router.put(
  '/:id',
  requierePermiso('ventas', 'editar'),
  verificarPeriodoAbierto(),
  validarVenta,
  async (req, res, next) => {
    if (validar(req, res)) return;

    const errorTotales = validarTotales(req.body);
    if (errorTotales) {
      return res.status(400).json({ error: errorTotales, codigo: 'TOTALES_INCONSISTENTES' });
    }

    const normFechas = normalizarFechasRetencion(req.body);
    if (!normFechas.ok) {
      return res.status(400).json({ error: normFechas.error, codigo: 'FECHA_INVALIDA' });
    }

    try {
      const _id = requireObjectId(req.params.id);

      const ventaActual = req._documentoOriginal
        || await req.db.collection(CONFIG.colVentas).findOne({ _id });
      if (!ventaActual) {
        return res.status(404).json({ error: 'Venta no encontrada', codigo: 'VENTA_NOT_FOUND' });
      }
      if (ventaActual.estado_sri === 'AUTORIZADO') {
        return res.status(409).json({
          error: 'Esta factura ya fue autorizada por el SRI. Genere una nota de crédito.',
          codigo: 'YA_AUTORIZADO'
        });
      }
            if ((ventaActual.intentos_envio_sri || 0) > 0) {
        return res.status(409).json({
          error: 'No se puede editar: el documento ya fue enviado al SRI. Genere una nota de crédito o anúlelo con el SRI.',
          codigo: 'YA_ENVIADO_SRI',
          intentos: ventaActual.intentos_envio_sri
        });
      }

      // ============================================================
      // 🆕 REFACTOR 2025-XX: las retenciones emitidas NO se editan
      //    directamente. Se regeneran al editar la compra origen.
      // ============================================================
      if (ventaActual.tipo_documento === 'retencion') {
        return res.status(409).json({
          error:
            'Las retenciones se regeneran automáticamente al editar la compra ' +
            'origen. Edita la compra para modificar la retención.',
          codigo: 'RETENCION_NO_EDITABLE',
          compra_origen_id: ventaActual.compra_origen_id
            ? String(ventaActual.compra_origen_id)
            : null
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
        forma_pago, estado_pago, fecha_pago, observaciones,
        factura_original_id
      } = req.body;

      const config = await req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' });
      const tipoDoc = tipo_documento || 'factura';

      let facturaOriginal = null;
      let motivoNC = '';

      if (tipoDoc === 'nota_credito') {
        const resuelto = await resolverFacturaOriginalNC(req.db, {
          facturaOriginalId: factura_original_id || ventaActual.factura_original_id,
          comprobanteClaveAcceso: comprobante_clave_acceso,
          numeroFacturaModificada: numero_factura_modificada || ventaActual.numero_factura_modificada,
          motivo: motivo || ventaActual.motivo
        });

        if (resuelto.error) {
          return res.status(resuelto.error.status).json({
            error: resuelto.error.error,
            codigo: resuelto.error.codigo
          });
        }

        facturaOriginal = resuelto.factura;
        motivoNC = resuelto.motivo;

        const totalNCsPrevio = await req.db.collection(CONFIG.colVentas).aggregate([
          {
            $match: {
              tipo_documento: 'nota_credito',
              factura_original_id: facturaOriginal._id,
              estado_sri: { $ne: 'RECHAZADA' },
              _id: { $ne: _id }
            }
          },
          { $group: { _id: null, total: { $sum: '$total' } } }
        ]).toArray();

        const acreditado = round2(toNumber(totalNCsPrevio[0]?.total));
        const saldoAcreditable = round2(toNumber(facturaOriginal.total) - acreditado);
        const totalNuevaNC = round2(toNumber(total));

        if (totalNuevaNC > saldoAcreditable + 0.01) {
          return res.status(400).json({
            error: `El monto de la NC ($${totalNuevaNC}) supera el saldo acreditable ($${saldoAcreditable}).`,
            codigo: 'NC_EXCEDE_SALDO',
            saldoAcreditable,
            totalFactura: facturaOriginal.total,
            totalNCsPrevio: acreditado
          });
        }
      }

      // 🆕 RETENCIÓN: normalizar
      let impuestosRetencionFinal = impuestos_retencion;
      let retencionInfo = null;

      if (tipoDoc === 'retencion') {
        const valRet = validarYNormalizarImpuestosRetencion(req.body);
        if (!valRet.ok) {
          return res.status(400).json({
            error: valRet.error,
            codigo: 'RETENCION_INVALIDA'
          });
        }
        impuestosRetencionFinal = valRet.impuestos;
        retencionInfo = valRet;
      }

      if (tipoDoc !== 'nota_credito' && tipoDoc !== 'guia_remision') {
        for (const detalle of detalles) {
          if (!ObjectId.isValid(detalle.productoId)) {
            return res.status(400).json({
              error: `ID de producto inválido: ${detalle.productoId}`,
              codigo: 'PRODUCTO_ID_INVALIDO'
            });
          }
          validarDetalleCantidadPrecio(detalle);
        }
      }

      if (tipoDoc !== 'nota_credito' && (numero_factura !== ventaActual.numero_factura || tipoDoc !== ventaActual.tipo_documento)) {
        const uniqCheck = await verificarNumeroUnico(req.db, {
          tipoDoc,
          numeroFactura: numero_factura,
          rucEmisor: config?.ruc || ventaActual.ruc_emisor || '',
          excluirId: _id
        });
        if (!uniqCheck.ok) {
          return res.status(409).json({
            error: uniqCheck.error,
            codigo: uniqCheck.codigo,
            documentoExistenteId: uniqCheck.documentoExistenteId
          });
        }
      }

      let nuevaClave = ventaActual.clave_acceso || '';
      const fechaCambio = new Date(fecha_emision).getTime() !== new Date(ventaActual.fecha_emision).getTime();
      const tipoCambio = tipoDoc !== ventaActual.tipo_documento;

      if ((fechaCambio || tipoCambio || !ventaActual.clave_acceso) && SETS.DOCS_CON_CLAVE.has(tipoDoc)) {
        if (configRucValido(config)) {
          try {
            const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';
            const serie = resolverSerieEmision({ establecimiento, punto_emision }, config);
            const secuencial = parseEnteroSeguro(ventaActual.secuencial_sri, 1);
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
            log.warn({ err: e.message }, 'Error regenerando clave');
          }
        }
      }

      let cliente = null;
      if (tipoDoc !== 'guia_remision') {
        cliente = await req.db.collection(CONFIG.colClientes).findOne({
          _id: new ObjectId(clienteId)
        });
        if (!cliente) {
          return res.status(400).json({
            error: 'El cliente no existe',
            codigo: 'CLIENTE_NO_EXISTE',
            clienteId
          });
        }
      }

      const numeroFacturaFinal = tipoDoc === 'nota_credito'
        ? (ventaActual.numero_factura || '')
        : numero_factura;

      const numeroFacturaModificadaFinal = tipoDoc === 'nota_credito' && facturaOriginal
        ? formatearNumeroSRI(facturaOriginal)
        : (numero_factura_modificada || '');

      const updateData = {
        clienteId: clienteId && ObjectId.isValid(clienteId) ? new ObjectId(clienteId) : null,
        numero_factura: numeroFacturaFinal,
        fecha_emision: new Date(fecha_emision),
        tipo_documento: tipoDoc,
        detalles, subtotal, iva, total,
        clave_acceso: nuevaClave,

        // NC
        factura_original_id: facturaOriginal?._id || null,
        numero_factura_modificada: numeroFacturaModificadaFinal,
        motivo: motivoNC || motivo || '',

        // 🆕 Retención normalizada
        numero_retencion: numero_retencion || '',
        porcentaje_retencion: porcentaje_retencion || 0,
        tipo_retencion: tipo_retencion || ventaActual.tipo_retencion || '',
        tipo_impuesto: tipo_impuesto || ventaActual.tipo_impuesto || '1',
        impuestos_retencion: Array.isArray(impuestosRetencionFinal)
          ? impuestosRetencionFinal
          : ventaActual.impuestos_retencion,
        total_retenido: retencionInfo?.totalRetenido || ventaActual.total_retenido || 0,

        numero_guia, transportista, placa,
        numero_exportacion, pais_destino,
        establecimiento, nombre_comercial, punto_emision,
        transportista_identificacion, transportista_tipo,
        transportista_razon_social, transportista_correo,
        direccion_partida, inicio_transporte, fin_transporte, placa_transporte,
        destinatario_identificacion, destinatario_tipo,
        destinatario_razon_social, destinatario_direccion,
        ruta, documento_aduana,
        comprobante_tipo_emision, comprobante_documento, comprobante_clave_acceso,
        comprobante_numero_autorizacion, comprobante_numero, comprobante_fecha_emision,
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
            updateData.xml_firmado = firmarXML(
              updateData.xml_generado, pems.privateKeyPem, pems.certificatePem
            );
            updateData.estado_sri = 'FIRMADO';
            updateData.fecha_firma = new Date();
          }
        } catch (e) {
          log.warn({ err: e.message, ventaId: String(_id) }, 'Error regenerando XML/firma en PUT');
        }
      }

      await conTransaccion(req.db, async (session) => {
        await moverStockVenta({
          db: req.db,
          ventaId: _id,
          detalles: ventaActual.detalles,
          tipoDoc: ventaActual.tipo_documento,
          fechaEmision: ventaActual.fecha_emision,
          session,
          reversion: true
        });
        await borrarKardexVenta(req.db, _id, session);

        await req.db.collection(CONFIG.colVentas).updateOne(
          { _id },
          { $set: updateData },
          { session }
        );

        await moverStockVenta({
          db: req.db,
          ventaId: _id,
          detalles,
          tipoDoc,
          fechaEmision: fecha_emision,
          session
        });
      });

      const [ventaActualizada] = await req.db.collection(CONFIG.colVentas).aggregate([
        { $match: { _id } },
        { $project: { ...CONFIG.proyeccionLista } },
        {
          $lookup: {
            from: CONFIG.colClientes,
            localField: 'clienteId',
            foreignField: '_id',
            as: 'cliente'
          }
        },
        { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } }
      ]).toArray();

      await auditarSeguro(req.db, req, {
        accion: 'actualizar',
        coleccion: CONFIG.colVentas,
        documentoId: ventaActual._id,
        documentoNumero: ventaActualizada?.numero_factura || '',
        datosAnteriores: {
          ...ventaActual,
          xml_generado: undefined,
          xml_firmado: undefined,
          xml_autorizado: undefined
        },
        datosNuevos: ventaActualizada,
        detalle: `Venta actualizada: ${ventaActualizada?.numero_factura || ''}`
      });

      if (req.io) req.io.emit('venta-actualizada', ventaActualizada);

      headersNoStore(res);
      return res.json({
        ...ventaActualizada,
        // 🆕 Advertencias de retención
        _advertencias_retencion: retencionInfo?.advertencias?.length
          ? retencionInfo.advertencias
          : undefined,
        total_retenido: retencionInfo?.totalRetenido
      });
    } catch (err) {
      log.error({ err: err.message }, 'Error actualizando venta');
      return next(err);
    }
  }
);

// ============================================================
// DELETE /:id  → eliminar (revierte stock)
// ============================================================
router.delete(
  '/:id',
  requierePermiso('ventas', 'eliminar'),
  verificarPeriodoAbierto(),
  async (req, res, next) => {
    try {
      const _id = requireObjectId(req.params.id);

      const venta = req._documentoOriginal
        || await req.db.collection(CONFIG.colVentas).findOne({ _id });
      if (!venta) {
        return res.status(404).json({ error: 'Venta no encontrada', codigo: 'VENTA_NOT_FOUND' });
      }

      if (venta.estado_sri === 'AUTORIZADO') {
        return res.status(409).json({
          error: 'Esta factura ya fue autorizada por el SRI. Genere una nota de crédito.',
          codigo: 'YA_AUTORIZADO'
        });
      }
      if (CONFIG.estadosSriBloqueadosDelete.has(venta.estado_sri)) {
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

      // ============================================================
      // 🆕 REFACTOR 2025-XX: las retenciones se eliminan en cascada
      //    al eliminar la compra origen. No se borran directo desde acá.
      // ============================================================
      if (venta.tipo_documento === 'retencion') {
        return res.status(409).json({
          error:
            'Las retenciones se eliminan automáticamente al eliminar la compra ' +
            'origen (siempre que no hayan sido enviadas al SRI).',
          codigo: 'RETENCION_NO_ELIMINABLE',
          compra_origen_id: venta.compra_origen_id
            ? String(venta.compra_origen_id)
            : null
        });
      }

      const pagosAsociados = await req.db.collection(CONFIG.colPagos).countDocuments({
        ventaId: _id,
        anulado: { $ne: true }
      });
      if (pagosAsociados > 0) {
        return res.status(409).json({
          error: `No se puede eliminar: hay ${pagosAsociados} pagos registrados. Anule los pagos primero.`,
          codigo: 'VENTA_CON_PAGOS',
          pagosAsociados
        });
      }

      if (venta.tipo_documento === 'factura') {
        const ncsAsociadas = await req.db.collection(CONFIG.colVentas).countDocuments({
          tipo_documento: 'nota_credito',
          factura_original_id: _id,
          estado_sri: { $ne: 'RECHAZADA' }
        });
        if (ncsAsociadas > 0) {
          return res.status(409).json({
            error: `No se puede eliminar: hay ${ncsAsociadas} nota(s) de crédito asociada(s). Eliminá primero las NC.`,
            codigo: 'FACTURA_CON_NCS',
            ncsAsociadas
          });
        }
      }

      await conTransaccion(req.db, async (session) => {
        await moverStockVenta({
          db: req.db,
          ventaId: _id,
          detalles: venta.detalles,
          tipoDoc: venta.tipo_documento,
          fechaEmision: venta.fecha_emision,
          session,
          reversion: true
        });
        await borrarKardexVenta(req.db, _id, session);

        const r = await req.db.collection(CONFIG.colVentas).deleteOne({ _id }, { session });
        if (r.deletedCount === 0) {
          const err = new Error('Venta no encontrada');
          err.status = 404;
          err.codigo = 'VENTA_NOT_FOUND';
          throw err;
        }
      });

      await auditarSeguro(req.db, req, {
        accion: 'eliminar',
        coleccion: CONFIG.colVentas,
        documentoId: venta._id,
        documentoNumero: venta.numero_factura || '',
        datosAnteriores: venta,
        detalle: `Venta eliminada: ${venta.numero_factura || ''}`
      });

      if (req.io) req.io.emit('venta-eliminada', { id: String(_id) });

      headersNoStore(res);
      return res.json({ message: 'Venta eliminada correctamente' });
    } catch (err) {
      log.error({ err: err.message }, 'Error eliminando venta');
      return next(err);
    }
  }
);

// ============================================================
// HELPERS DE GENERACIÓN DE CLAVE + XML
// ============================================================
async function asegurarClaveYXml(db, venta, opts = {}) {
  const { persistir = true } = opts;

  const tipoDoc = venta.tipo_documento || 'factura';

  if (!SETS.DOCS_CON_CLAVE.has(tipoDoc)) {
    return {
      claveAcceso: null,
      xml: null,
      xmlFirmado: venta.xml_firmado || null,
      motivo: 'Este tipo de documento no requiere clave',
      persistida: false
    };
  }

  const config = await db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' });
  if (!configRucValido(config)) {
    return {
      claveAcceso: null,
      xml: null,
      xmlFirmado: venta.xml_firmado || null,
      motivo: 'Debe configurar el RUC (13 dígitos) en Administración → Configuración Empresa',
      persistida: false
    };
  }

  if (venta.clave_acceso && venta.xml_generado) {
    return {
      claveAcceso: venta.clave_acceso,
      xml: venta.xml_generado,
      xmlFirmado: venta.xml_firmado || null,
      motivo: null,
      persistida: false
    };
  }

  let claveAcceso = venta.clave_acceso;
  let serieFormateada = venta.serie;
  let numeroSecuencial = venta.secuencial_sri;

  if (!claveAcceso) {
    const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';
    serieFormateada = resolverSerieEmision(venta, config);
    const sec = resolverSecuencial(venta);

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
      numeroSecuencial = formatearSecuencial(sec);
    } catch (e) {
      return {
        claveAcceso: null,
        xml: null,
        xmlFirmado: venta.xml_firmado || null,
        motivo: 'Error generando clave: ' + e.message,
        persistida: false
      };
    }
  }

  let xml = venta.xml_generado;
  if (!xml) {
    try {
      const cliente = venta.clienteId
        ? await db.collection(CONFIG.colClientes).findOne({ _id: venta.clienteId })
        : null;
      const ventaParaXml = {
        ...venta,
        clave_acceso: claveAcceso,
        serie: serieFormateada || venta.serie,
        secuencial_sri: numeroSecuencial || venta.secuencial_sri
      };
      xml = generarXMLComprobante(ventaParaXml, cliente, config);
    } catch (e) {
      return {
        claveAcceso,
        xml: null,
        xmlFirmado: venta.xml_firmado || null,
        motivo: 'Error generando XML: ' + e.message,
        persistida: false
      };
    }
  }

  const necesitabaPersistir = !venta.clave_acceso || !venta.xml_generado;
  let persistida = false;
  let xmlFirmado = venta.xml_firmado || null;

  if (persistir && necesitabaPersistir) {
    try {
      const r = await db.collection(CONFIG.colVentas).updateOne(
        {
          _id: venta._id,
          $or: [
            { clave_acceso: '' },
            { clave_acceso: { $exists: false } },
            { clave_acceso: null }
          ]
        },
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

      persistida = r.modifiedCount > 0;

      if (!persistida) {
        const fresco = await db.collection(CONFIG.colVentas).findOne(
          { _id: venta._id },
          { projection: { clave_acceso: 1, xml_generado: 1, xml_firmado: 1 } }
        );
        if (fresco?.clave_acceso && fresco.clave_acceso !== claveAcceso) {
          log.info(
            { ventaId: String(venta._id) },
            'Race en asegurarClaveYXml: se usa la clave ganadora'
          );
          claveAcceso = fresco.clave_acceso;
          if (fresco.xml_generado) xml = fresco.xml_generado;
        }
        if (fresco?.xml_firmado) xmlFirmado = fresco.xml_firmado;
      }
    } catch (e) {
      if (e.code === 11000) {
        log.warn(
          { ventaId: String(venta._id) },
          'Colisión de clave_acceso al persistir en asegurarClaveYXml'
        );
      } else {
        log.warn(
          { err: e.message, ventaId: String(venta._id) },
          'No se pudo persistir clave/xml en asegurarClaveYXml'
        );
      }
    }
  }

  return {
    claveAcceso,
    xml,
    xmlFirmado,
    motivo: null,
    persistida
  };
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._validarTotales = validarTotales;
module.exports._validarFechaNoFutura = validarFechaNoFutura;
module.exports._validarDetalleCantidadPrecio = validarDetalleCantidadPrecio;
module.exports._normalizarFechasRetencion = normalizarFechasRetencion;
module.exports._verificarNumeroUnico = verificarNumeroUnico;
module.exports._resolverSerieEmision = resolverSerieEmision;
module.exports._resolverSecuencial = resolverSecuencial;
module.exports._formatearSecuencial = formatearSecuencial;
module.exports._formatearNumeroSRI = formatearNumeroSRI;
module.exports._afectaStock = afectaStock;
module.exports._signoStock = signoStock;
module.exports._moverStockVenta = moverStockVenta;
module.exports._borrarKardexVenta = borrarKardexVenta;
module.exports._reservarContador = reservarContador;
module.exports._actualizarStockAtomico = actualizarStockAtomico;
module.exports._extraerValor = extraerValor;
module.exports._asegurarClaveYXml = asegurarClaveYXml;
module.exports._configRucValido = configRucValido;
module.exports._resolverFacturaOriginalNC = resolverFacturaOriginalNC;
module.exports._calcularSaldoAcreditable = calcularSaldoAcreditable;
module.exports._validarYNormalizarImpuestosRetencion = validarYNormalizarImpuestosRetencion;
module.exports._CODIGO_IMPUESTO_RETENCION = CODIGO_IMPUESTO_RETENCION;