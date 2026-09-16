// backend/utils/xmlComprobante.js
// ============================================================
// Generador de XML de comprobantes electrónicos del SRI (sin firma)
// ------------------------------------------------------------
// Genera el XML para los 5 tipos principales:
//   - factura       (01)
//   - liquidacion   (03)
//   - nota_credito  (04)
//   - nota_debito   (05)
//   - guia_remision (06)
//   - retencion     (07)
//   - exportacion   (01)
//   - reembolso     (01)
//
// El XML generado es SIN FIRMA. La firma se aplica después con
// `utils/firmaElectronica.js`.
//
// API pública:
//   generarXMLComprobante(venta, cliente, config) → string XML
//   esc(str)                                       → escape XML
//   num(n)                                         → 'NNN.NN'
//   num6(n)                                        → 'NNN.NNNNNN'
//   fechaSRI, periodoFiscal, codigoTipoIdentificacion, infoIVA
//   CODIGOS_IVA                                    → tabla tarifas IVA
//
// Extensiones:
//   validarVentaParaXML(venta, config)             → {ok, motivo?}
//   formatearSecuencial(valor)                     → 9 dígitos
//   normalizarFormaPago(codigo)                    → '01' | código válido
//   FORMAS_PAGO_VALIDAS                            → Set
//
// Configuración por env:
//   XML_MAX_DETALLES=500           → tope de detalles por comprobante
//   XML_MAX_LONGITUD_CAMPO=300     → tope por string del SRI
//   XML_MAX_BYTES=2097152          → tope total del XML (2 MB)
//
// ⚠️  El SRI rechaza XMLs con:
//     - strings > 300 caracteres en descripciones
//     - más de 500 detalles (según tipo)
//     - códigos de forma de pago fuera del catálogo
//     Todas estas validaciones están centralizadas acá.
// ============================================================
'use strict';

const { buscarRetencion } = require('../data/catalogosSRI');
const { fechaSRI, periodoFiscal } = require('./fechaEC');
const log = require('./logger');

// ============================================================
// CONFIGURACIÓN (env-driven)
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  /** Máx. detalles por comprobante (el SRI tiene topes por tipo). */
  maxDetalles: envNum('XML_MAX_DETALLES', 500),

  /** Longitud máxima por string (el SRI rechaza >300). */
  maxLongitudCampo: envNum('XML_MAX_LONGITUD_CAMPO', 300),

  /** Tope total del XML (bytes). Previene OOM. */
  maxBytes: envNum('XML_MAX_BYTES', 2 * 1024 * 1024),

  /** RUC genérico para consumidor final (SRI). */
  rucConsumidorFinal: '9999999999999'
});

// ============================================================
// ERRORES TIPADOS
// ============================================================
function errorTipado(mensaje, codigo, status = 400) {
  const err = new Error(mensaje);
  err.codigo = codigo;
  err.status = status;
  return err;
}

// ============================================================
// HELPERS DE FORMATO
// ============================================================

/**
 * Escapa caracteres peligrosos para XML.
 * Maneja `null`/`undefined` → `''`.
 *
 * @param {*} str
 * @returns {string}
 */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Redondea a 2 decimales sin drift por punto flotante.
 * @param {*} n
 * @returns {number}
 */
function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Formatea un número a 2 decimales como string.
 * - Rechaza `NaN`, `Infinity`, notación científica.
 * - Clampea al rango válido del SRI (`-999999999.99` a `999999999.99`).
 *
 * @param {*} n
 * @returns {string} Ej: `'123.45'`
 */
function num(n) {
  if (n === null || n === undefined || n === '') return '0.00';
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.00';
  const clamped = Math.max(-999_999_999.99, Math.min(999_999_999.99, v));
  return clamped.toFixed(2);
}

/**
 * Formatea un número a 6 decimales (para cantidades).
 * @param {*} n
 * @returns {string}
 */
function num6(n) {
  if (n === null || n === undefined || n === '') return '0.000000';
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.000000';
  const clamped = Math.max(-999_999_999.999999, Math.min(999_999_999.999999, v));
  return clamped.toFixed(6);
}

/**
 * Trunca un string al máximo permitido por el SRI.
 * @param {*} str
 * @param {number} [max]
 * @returns {string}
 */
function sanitizarCampoXML(str, max = CONFIG.maxLongitudCampo) {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s.length > max ? s.slice(0, max) : s;
}

// ============================================================
// IDENTIFICACIÓN DEL COMPRADOR
// ============================================================
/**
 * Devuelve el código SRI de tipo de identificación.
 *
 *   04 → RUC (13 dígitos)
 *   05 → Cédula (10 dígitos)
 *   06 → Pasaporte (alfanumérico 5-20)
 *   07 → Consumidor final (por defecto)
 *   08 → Identificación del exterior
 *   09 → Placa
 *
 * @param {*} identificacion
 * @returns {string}
 */
function codigoTipoIdentificacion(identificacion) {
  if (!identificacion) return '07';
  const raw = String(identificacion).trim();
  if (!raw) return '07';

  const limpio = raw.replace(/\D/g, '');

  // Cédula (10 dígitos) o RUC (13 dígitos).
  if (limpio.length === 13 && /^\d{13}$/.test(limpio)) return '04';
  if (limpio.length === 10 && /^\d{10}$/.test(limpio)) return '05';

  // Consumidor final explícito.
  if (raw === CONFIG.rucConsumidorFinal) return '07';

  // Pasaporte: alfanumérico, 5-20 chars, con al menos una letra.
  if (/^[A-Z0-9]{5,20}$/i.test(raw) && /[A-Z]/i.test(raw)) return '06';

  // Identificación del exterior (con guiones, letras, etc., no solo dígitos).
  if (/^[A-Z0-9\-_.]{5,20}$/i.test(raw)) return '08';

  // Fallback: consumidor final.
  return '07';
}

// ============================================================
// TIPO DE COMPROBANTE SRI
// ============================================================
const CODIGO_DOC = Object.freeze({
  factura: '01',
  liquidacion: '03',
  nota_credito: '04',
  nota_debito: '05',
  guia_remision: '06',
  retencion: '07',
  exportacion: '01',
  reembolso: '01'
});

// ============================================================
// TARIFAS DE IVA
// ------------------------------------------------------------
// Tarifas vigentes en Ecuador:
//   0%   → codigoPorcentaje 0
//   5%   → codigoPorcentaje 5
//   15%  → codigoPorcentaje 4
//   No objeto → 6
//   Exento    → 7
// ============================================================
const CODIGOS_IVA = Object.freeze({
  0:    Object.freeze({ codigo: '2', codigoPorcentaje: '0', tarifa: '0.00' }),
  5:    Object.freeze({ codigo: '2', codigoPorcentaje: '5', tarifa: '5.00' }),
  15:   Object.freeze({ codigo: '2', codigoPorcentaje: '4', tarifa: '15.00' }),
  999:  Object.freeze({ codigo: '2', codigoPorcentaje: '6', tarifa: '0.00' }),
  998:  Object.freeze({ codigo: '2', codigoPorcentaje: '7', tarifa: '0.00' })
});

/**
 * Resuelve la metadata de IVA a partir de los parámetros del detalle.
 *
 * @param {boolean} aplicaIVA
 * @param {number|string} tarifaIva   Puede ser: 15, '15', 0.15, 'NO_OBJETO', 'EXENTO'
 * @returns {{ codigo, codigoPorcentaje, tarifa, porcentaje }}
 */
function infoIVA(aplicaIVA, tarifaIva) {
  // Tarifas especiales (strings mágicos).
  if (tarifaIva === 'NO_OBJETO') return { ...CODIGOS_IVA[999], porcentaje: 0 };
  if (tarifaIva === 'EXENTO') return { ...CODIGOS_IVA[998], porcentaje: 0 };

  // Si no aplica IVA → 0%.
  if (!aplicaIVA) return { ...CODIGOS_IVA[0], porcentaje: 0 };

  // Normalizar porcentaje.
  let pct;
  if (typeof tarifaIva === 'string' && tarifaIva.trim() !== '') {
    pct = Number(tarifaIva);
  } else {
    pct = Number(tarifaIva);
  }

  // NaN o 0 explícito → 0%.
  if (!Number.isFinite(pct) || pct === 0) {
    return { ...CODIGOS_IVA[0], porcentaje: 0 };
  }

  // Porcentaje fraccional (0.15 → 15).
  if (pct > 0 && pct < 1) pct = round2(pct * 100);

  // Buscar tarifa exacta.
  if (pct === 15) return { ...CODIGOS_IVA[15], porcentaje: 15 };
  if (pct === 5)  return { ...CODIGOS_IVA[5],  porcentaje: 5 };
  if (pct === 0)  return { ...CODIGOS_IVA[0],  porcentaje: 0 };

  // Tarifa desconocida: loggear y usar 15% como fallback.
  log.warn({ tarifaIva, pct }, 'Tarifa de IVA desconocida, usando 15% como fallback');
  return { ...CODIGOS_IVA[15], porcentaje: 15 };
}

// ============================================================
// FORMAS DE PAGO
// ============================================================
const FORMAS_PAGO_VALIDAS = Object.freeze(new Set([
  '01', '15', '16', '17', '18', '19', '20', '21'
]));

/**
 * Normaliza un código de forma de pago. Devuelve `'01'` si es inválido.
 * @param {*} codigo
 * @returns {string}
 */
function normalizarFormaPago(codigo) {
  if (!codigo) return '01';
  const s = String(codigo).trim();
  if (FORMAS_PAGO_VALIDAS.has(s)) return s;
  log.warn({ codigo }, 'Forma de pago inválida, usando "01" como fallback');
  return '01';
}

// ============================================================
// SECUENCIAL
// ============================================================
/**
 * Normaliza cualquier entrada a un secuencial SRI de 9 dígitos.
 * Garantiza que la salida tenga exactamente 9 dígitos numéricos.
 *
 * @param {*} valor
 * @returns {string}
 */
function formatearSecuencial(valor) {
  if (valor === null || valor === undefined || valor === '') return '000000001';
  const soloDigitos = String(valor).replace(/\D/g, '');
  if (!soloDigitos) return '000000001';
  // Tomar los últimos 9 dígitos y paddear a 9.
  return soloDigitos.slice(-9).padStart(9, '0');
}

// ============================================================
// VALIDACIÓN PREVIA
// ============================================================
/**
 * Valida los prerequisitos mínimos para generar un XML del SRI.
 * El caller puede usarlo para fallar ANTES de construir el XML.
 *
 * @param {object} venta
 * @param {object} config
 * @returns {{ ok: boolean, motivo?: string, codigo?: string }}
 */
function validarVentaParaXML(venta, config) {
  if (!venta || typeof venta !== 'object') {
    return { ok: false, motivo: 'La venta es obligatoria', codigo: 'XML_VENTA_INVALIDA' };
  }
  if (!config || typeof config !== 'object') {
    return { ok: false, motivo: 'La configuración es obligatoria', codigo: 'XML_CONFIG_INVALIDA' };
  }
  if (!config.ruc || String(config.ruc).length !== 13) {
    return { ok: false, motivo: 'La empresa no tiene RUC válido (13 dígitos)', codigo: 'XML_RUC_INVALIDO' };
  }
  if (!venta.fecha_emision) {
    return { ok: false, motivo: 'La venta no tiene fecha de emisión', codigo: 'XML_FECHA_FALTANTE' };
  }
  const d = new Date(venta.fecha_emision);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, motivo: `Fecha de emisión inválida: ${venta.fecha_emision}`, codigo: 'XML_FECHA_INVALIDA' };
  }
  const tipoDoc = venta.tipo_documento || 'factura';
  if (!CODIGO_DOC[tipoDoc]) {
    return { ok: false, motivo: `Tipo de documento desconocido: ${tipoDoc}`, codigo: 'XML_TIPO_INVALIDO' };
  }

  // ⬇️ FIX: las retenciones no llevan `detalles` (van por `impuestos_retencion`).
  const tipoDocUpper = String(tipoDoc).toLowerCase();
  const exigeDetalles = tipoDocUpper !== 'retencion';

  if (exigeDetalles) {
    const detalles = Array.isArray(venta.detalles) ? venta.detalles : [];
    if (detalles.length === 0) {
      return { ok: false, motivo: 'La venta no tiene detalles', codigo: 'XML_SIN_DETALLES' };
    }
    if (detalles.length > CONFIG.maxDetalles) {
      return {
        ok: false,
        motivo: `Demasiados detalles (${detalles.length}, máx ${CONFIG.maxDetalles})`,
        codigo: 'XML_DEMASIADOS_DETALLES'
      };
    }
  }

  return { ok: true };
}

// ============================================================
// IMPUESTOS DE RETENCIÓN
// ============================================================
function tipoImpuestoDesdeCodigo(cod) {
  if (cod === '1') return 'RENTA';
  if (cod === '2') return 'IVA';
  return null;
}

/**
 * Normaliza una fecha que puede venir como:
 *   - Date
 *   - ISO string
 *   - `DD/MM/YYYY` ya formateada
 * Siempre devuelve `DD/MM/YYYY`.
 */
function normalizarFechaSRI(fecha) {
  if (!fecha) return '';
  const s = String(fecha);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  try {
    return fechaSRI(fecha);
  } catch {
    return s;
  }
}

/**
 * Normaliza un impuesto de retención desde múltiples shapes posibles.
 * @param {object} imp
 * @param {object} defaults  { codDocSustento, numDocSustento, fechaEmisionDocSustento }
 * @returns {object}
 */
function normalizarImpuestoRetencion(imp, defaults) {
  const codigo = imp.codigo || '1';
  const impuestoDeclarado = imp.impuesto
    || (imp.impuesto_retencion ? String(imp.impuesto_retencion).toUpperCase() : null)
    || tipoImpuestoDesdeCodigo(codigo);

  let codigoRetencion = imp.codigoRetencion || imp.tipo_retencion || '';
  let porcentaje = imp.porcentajeRetener ?? imp.porcentaje ?? 0;
  let valorRetenido = imp.valorRetenido ?? imp.valor_retenido ?? 0;
  let baseImponible = imp.baseImponible ?? imp.base_imponible ?? 0;

  if (codigoRetencion) {
    const cat = buscarRetencion(codigoRetencion, impuestoDeclarado);
    if (cat) {
      codigoRetencion = cat.codigo;
      if (Number(porcentaje) === 0 && cat.porcentaje != null) {
        porcentaje = cat.porcentaje;
      }
    } else {
      log.warn(
        { codigoRetencion, impuestoDeclarado },
        'Retención no existe en el catálogo del SRI, se emite tal cual'
      );
    }
  } else {
    codigoRetencion = '312';
  }

  const fechaEmisionDocSustento = normalizarFechaSRI(
    imp.fechaEmisionDocSustento || defaults.fechaEmisionDocSustento
  );

  return {
    codigo,
    codigoRetencion,
    baseImponible: round2(baseImponible),
    porcentajeRetener: round2(porcentaje),
    valorRetenido: round2(valorRetenido),
    codDocSustento: imp.codDocSustento || defaults.codDocSustento,
    numDocSustento: imp.numDocSustento || defaults.numDocSustento,
    fechaEmisionDocSustento
  };
}

// ============================================================
// GENERADOR PRINCIPAL
// ============================================================
/**
 * Genera el XML de un comprobante electrónico del SRI (sin firma).
 *
 * @param {object} venta   Documento del sistema.
 * @param {object|null} cliente
 * @param {object} config  Configuración de la empresa.
 * @returns {string} XML en UTF-8.
 * @throws {Error} con código tipado si falta algo crítico.
 */
function generarXMLComprobante(venta, cliente, config) {
  // ---- Validación previa ----
  const check = validarVentaParaXML(venta, config);
  if (!check.ok) {
    throw errorTipado(check.motivo, check.codigo);
  }

  const tipoDoc = venta.tipo_documento || 'factura';
  const codDoc = CODIGO_DOC[tipoDoc] || '01';

  // ---- Configuración ----
  const ambiente = config.ambiente || '1';
  const tipoEmision = config.tipo_emision || '1';
  const razonSocial = sanitizarCampoXML(config.razon_social || 'CONTRIBUYENTE');
  const nombreComercial = sanitizarCampoXML(config.nombre_comercial || razonSocial);
  const ruc = String(config.ruc || '');
  const claveAcceso = String(venta.clave_acceso || '');
  const estab = String(venta.establecimiento || config.establecimiento || '001').padStart(3, '0').slice(-3);
  const ptoEmi = String(venta.punto_emision || config.punto_emision || '001').padStart(3, '0').slice(-3);

  // ---- Secuencial ----
  const secuencial = venta.secuencial_sri
    ? formatearSecuencial(venta.secuencial_sri)
    : formatearSecuencial(venta.numero_factura || '1');

  // ---- Direcciones ----
  const dirMatriz = sanitizarCampoXML(config.direccion_matriz || '');
  const dirEstablecimiento = sanitizarCampoXML(config.direccion_establecimiento || dirMatriz);
  const obligadoContabilidad = config.obligado_contabilidad ? 'SI' : 'NO';
  const contribuyenteEspecial = sanitizarCampoXML(config.contribuyente_especial || '', 20);

  // ---- Fecha de emisión ----
  let fechaEmision;
  try {
    fechaEmision = fechaSRI(venta.fecha_emision);
  } catch (e) {
    throw errorTipado(`Fecha de emisión inválida: ${venta.fecha_emision}`, 'XML_FECHA_INVALIDA');
  }

  // ---- Comprador ----
  const tipoIdComprador = codigoTipoIdentificacion(cliente?.ruc);
  const razonSocialComprador = sanitizarCampoXML(cliente?.nombre || 'CONSUMIDOR FINAL');
  const identificacionComprador = (cliente?.ruc || CONFIG.rucConsumidorFinal).toString().trim();
  const moneda = 'DOLAR';

  // ---- Detalles y grupos de IVA ----
  const detalles = venta.detalles || [];
  const gruposIVA = {};
  let totalSinImpuestos = 0;
  let totalDescuento = 0;

  const detallesCalculados = detalles.map(d => {
    const cantidad = Number(d.cantidad) || 0;
    const precioUnit = Number(d.precio_unitario ?? d.costo_unitario) || 0;
    const descuento = Number(d.descuento) || 0;
    const precioTotal = round2(cantidad * precioUnit - descuento);

    const aplicaIVA = d.aplica_iva !== false;
    const tarifaIva = d.tarifa_iva !== undefined ? d.tarifa_iva : 15;
    const ivaInfo = infoIVA(aplicaIVA, tarifaIva);
    const valorIVA = round2(precioTotal * (ivaInfo.porcentaje / 100));

    const key = ivaInfo.codigoPorcentaje;
    if (!gruposIVA[key]) {
      gruposIVA[key] = {
        codigo: ivaInfo.codigo,
        codigoPorcentaje: ivaInfo.codigoPorcentaje,
        tarifa: ivaInfo.tarifa,
        baseImponible: 0,
        valor: 0
      };
    }
    gruposIVA[key].baseImponible += precioTotal;
    gruposIVA[key].valor += valorIVA;

    totalSinImpuestos += precioTotal;
    totalDescuento += descuento;

    return { d, cantidad, precioUnit, descuento, precioTotal, aplicaIVA, tarifaIva, ivaInfo, valorIVA };
  });

  // Redondear grupos y totales tras acumular.
  Object.values(gruposIVA).forEach(g => {
    g.baseImponible = round2(g.baseImponible);
    g.valor = round2(g.valor);
  });
  totalSinImpuestos = round2(totalSinImpuestos);
  totalDescuento = round2(totalDescuento);

  const totalIVA = round2(
    Object.values(gruposIVA)
      .filter(g => g.codigoPorcentaje !== '0')
      .reduce((s, g) => s + g.valor, 0)
  );

  const importeTotal = round2(totalSinImpuestos + totalIVA);
  const formaPago = normalizarFormaPago(venta.forma_pago);

  // ---- Delegar al generador específico ----
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  switch (tipoDoc) {
    case 'nota_credito':
      xml += generarNotaCredito();
      break;
    case 'nota_debito':
      xml += generarNotaDebito();
      break;
    case 'guia_remision':
      xml += generarGuiaRemision();
      break;
    case 'retencion':
      xml += generarRetencion();
      break;
    case 'factura':
    case 'liquidacion':
    case 'exportacion':
    case 'reembolso':
    default:
      xml += generarFactura();
      break;
  }

  // ---- Sanity check de tamaño ----
  if (xml.length > CONFIG.maxBytes) {
    throw errorTipado(
      `El XML resultante es demasiado grande (${(xml.length / 1024).toFixed(0)} KB > ${(CONFIG.maxBytes / 1024).toFixed(0)} KB)`,
      'XML_DEMASIADO_GRANDE',
      413
    );
  }

  return xml;

  // ============================================================
  // HELPERS INTERNOS (closures con scope de la venta)
  // ============================================================

  function bloqueInfoTributaria() {
    let x = '';
    x += '  <infoTributaria>\n';
    x += `    <ambiente>${esc(ambiente)}</ambiente>\n`;
    x += `    <tipoEmision>${esc(tipoEmision)}</tipoEmision>\n`;
    x += `    <razonSocial>${esc(razonSocial)}</razonSocial>\n`;
    x += `    <nombreComercial>${esc(nombreComercial)}</nombreComercial>\n`;
    x += `    <ruc>${esc(ruc)}</ruc>\n`;
    x += `    <claveAcceso>${esc(claveAcceso)}</claveAcceso>\n`;
    x += `    <codDoc>${esc(codDoc)}</codDoc>\n`;
    x += `    <estab>${esc(estab)}</estab>\n`;
    x += `    <ptoEmi>${esc(ptoEmi)}</ptoEmi>\n`;
    x += `    <secuencial>${esc(secuencial)}</secuencial>\n`;
    x += `    <dirMatriz>${esc(dirMatriz)}</dirMatriz>\n`;
    x += '  </infoTributaria>\n';
    return x;
  }

  function bloqueTotalConImpuestos(indent = '    ') {
    let x = `${indent}<totalConImpuestos>\n`;
    Object.values(gruposIVA)
      .sort((a, b) => a.codigoPorcentaje.localeCompare(b.codigoPorcentaje))
      .forEach(g => {
        x += `${indent}  <totalImpuesto>\n`;
        x += `${indent}    <codigo>${esc(g.codigo)}</codigo>\n`;
        x += `${indent}    <codigoPorcentaje>${esc(g.codigoPorcentaje)}</codigoPorcentaje>\n`;
        x += `${indent}    <baseImponible>${num(g.baseImponible)}</baseImponible>\n`;
        x += `${indent}    <valor>${num(g.valor)}</valor>\n`;
        x += `${indent}  </totalImpuesto>\n`;
      });
    x += `${indent}</totalConImpuestos>\n`;
    return x;
  }

  function bloqueImpuestosDetalle(ivaInfo, precioTotal, valorIVA, indent = '      ') {
    let x = `${indent}<impuestos>\n`;
    x += `${indent}  <impuesto>\n`;
    x += `${indent}    <codigo>${esc(ivaInfo.codigo)}</codigo>\n`;
    x += `${indent}    <codigoPorcentaje>${esc(ivaInfo.codigoPorcentaje)}</codigoPorcentaje>\n`;
    x += `${indent}    <tarifa>${esc(ivaInfo.tarifa)}</tarifa>\n`;
    x += `${indent}    <baseImponible>${num(precioTotal)}</baseImponible>\n`;
    x += `${indent}    <valor>${num(valorIVA)}</valor>\n`;
    x += `${indent}  </impuesto>\n`;
    x += `${indent}</impuestos>\n`;
    return x;
  }

  function bloqueInfoAdicional(adicionales) {
    if (!adicionales || adicionales.length === 0) return '';
    let x = '  <infoAdicional>\n';
    adicionales.forEach(([nombre, valor]) => {
      if (valor === null || valor === undefined || valor === '') return;
      x += `    <campoAdicional nombre="${esc(nombre)}">${esc(sanitizarCampoXML(valor))}</campoAdicional>\n`;
    });
    x += '  </infoAdicional>\n';
    return x;
  }

  function generarFactura() {
    let x = '<factura id="comprobante" version="1.1.0">\n';
    x += bloqueInfoTributaria();

    x += '  <infoFactura>\n';
    x += `    <fechaEmision>${esc(fechaEmision)}</fechaEmision>\n`;
    x += `    <dirEstablecimiento>${esc(dirEstablecimiento)}</dirEstablecimiento>\n`;
    if (contribuyenteEspecial) {
      x += `    <contribuyenteEspecial>${esc(contribuyenteEspecial)}</contribuyenteEspecial>\n`;
    }
    x += `    <obligadoContabilidad>${esc(obligadoContabilidad)}</obligadoContabilidad>\n`;
    x += `    <tipoIdentificacionComprador>${esc(tipoIdComprador)}</tipoIdentificacionComprador>\n`;
    x += `    <razonSocialComprador>${esc(razonSocialComprador)}</razonSocialComprador>\n`;
    x += `    <identificacionComprador>${esc(identificacionComprador)}</identificacionComprador>\n`;
    x += `    <totalSinImpuestos>${num(totalSinImpuestos)}</totalSinImpuestos>\n`;
    x += `    <totalDescuento>${num(totalDescuento)}</totalDescuento>\n`;
    x += bloqueTotalConImpuestos('    ');
    x += `    <propina>0.00</propina>\n`;
    x += `    <importeTotal>${num(importeTotal)}</importeTotal>\n`;
    x += `    <moneda>${esc(moneda)}</moneda>\n`;

    x += '    <pagos>\n';
    x += '      <pago>\n';
    x += `        <formaPago>${esc(formaPago)}</formaPago>\n`;
    x += `        <total>${num(importeTotal)}</total>\n`;
    x += '      </pago>\n';
    x += '    </pagos>\n';
    x += '  </infoFactura>\n';

    x += '  <detalles>\n';
    detallesCalculados.forEach((item, idx) => {
      const { d, cantidad, precioUnit, descuento, precioTotal, ivaInfo, valorIVA } = item;
      const codigo = sanitizarCampoXML(d.codigo || d.productoId?.toString() || `ITEM${idx + 1}`);
      const descripcion = sanitizarCampoXML(d.nombre || d.descripcion || d.nombre_producto || 'PRODUCTO');

      x += '    <detalle>\n';
      x += `      <codigoPrincipal>${esc(codigo)}</codigoPrincipal>\n`;
      if (d.codigo_auxiliar) {
        x += `      <codigoAuxiliar>${esc(sanitizarCampoXML(d.codigo_auxiliar))}</codigoAuxiliar>\n`;
      }
      x += `      <descripcion>${esc(descripcion)}</descripcion>\n`;
      x += `      <cantidad>${num6(cantidad)}</cantidad>\n`;
      x += `      <precioUnitario>${num(precioUnit)}</precioUnitario>\n`;
      x += `      <descuento>${num(descuento)}</descuento>\n`;
      x += `      <precioTotalSinImpuesto>${num(precioTotal)}</precioTotalSinImpuesto>\n`;
      x += bloqueImpuestosDetalle(ivaInfo, precioTotal, valorIVA, '      ');
      x += '    </detalle>\n';
    });
    x += '  </detalles>\n';

    const adicionales = [];
    if (cliente?.email) adicionales.push(['Email', cliente.email]);
    if (cliente?.telefono) adicionales.push(['Telefono', cliente.telefono]);
    if (cliente?.direccion) adicionales.push(['Direccion', cliente.direccion]);
    if (venta.observaciones) adicionales.push(['Observaciones', venta.observaciones]);
    if (venta.forma_pago === '20') adicionales.push(['FormaPago', 'Otros con sistema financiero']);
    x += bloqueInfoAdicional(adicionales);

    x += '</factura>';
    return x;
  }

  function generarNotaCredito() {
    let x = '<notaCredito id="comprobante" version="1.1.0">\n';
    x += bloqueInfoTributaria();

    x += '  <infoNotaCredito>\n';
    x += `    <fechaEmision>${esc(fechaEmision)}</fechaEmision>\n`;
    x += `    <dirEstablecimiento>${esc(dirEstablecimiento)}</dirEstablecimiento>\n`;
    x += `    <tipoIdentificacionComprador>${esc(tipoIdComprador)}</tipoIdentificacionComprador>\n`;
    x += `    <razonSocialComprador>${esc(razonSocialComprador)}</razonSocialComprador>\n`;
    x += `    <identificacionComprador>${esc(identificacionComprador)}</identificacionComprador>\n`;
    if (contribuyenteEspecial) {
      x += `    <contribuyenteEspecial>${esc(contribuyenteEspecial)}</contribuyenteEspecial>\n`;
    }
    x += `    <obligadoContabilidad>${esc(obligadoContabilidad)}</obligadoContabilidad>\n`;
    x += `    <codDocModificado>01</codDocModificado>\n`;
    x += `    <numDocModificado>${esc(venta.numero_factura_modificada || venta.numero_factura || '')}</numDocModificado>\n`;
    x += `    <fechaEmisionDocSustento>${esc(normalizarFechaSRI(venta.comprobante_fecha_emision) || fechaEmision)}</fechaEmisionDocSustento>\n`;
    x += `    <totalSinImpuestos>${num(totalSinImpuestos)}</totalSinImpuestos>\n`;
    x += `    <valorModificacion>${num(importeTotal)}</valorModificacion>\n`;
    x += `    <moneda>${esc(moneda)}</moneda>\n`;
    x += bloqueTotalConImpuestos('    ');
    x += `    <motivo>${esc(sanitizarCampoXML(venta.motivo || 'DEVOLUCION'))}</motivo>\n`;
    x += '  </infoNotaCredito>\n';

    x += '  <detalles>\n';
    detallesCalculados.forEach((item, idx) => {
      const { d, cantidad, precioUnit, descuento, precioTotal, ivaInfo, valorIVA } = item;
      const codigo = sanitizarCampoXML(d.codigo || `ITEM${idx + 1}`);
      const descripcion = sanitizarCampoXML(d.nombre || d.descripcion || 'PRODUCTO');
      x += '    <detalle>\n';
      x += `      <codigoInterno>${esc(codigo)}</codigoInterno>\n`;
      x += `      <descripcion>${esc(descripcion)}</descripcion>\n`;
      x += `      <cantidad>${num6(cantidad)}</cantidad>\n`;
      x += `      <precioUnitario>${num(precioUnit)}</precioUnitario>\n`;
      x += `      <descuento>${num(descuento)}</descuento>\n`;
      x += `      <precioTotalSinImpuesto>${num(precioTotal)}</precioTotalSinImpuesto>\n`;
      x += bloqueImpuestosDetalle(ivaInfo, precioTotal, valorIVA, '      ');
      x += '    </detalle>\n';
    });
    x += '  </detalles>\n';

    const adicionales = [];
    if (cliente?.email) adicionales.push(['Email', cliente.email]);
    if (cliente?.direccion) adicionales.push(['Direccion', cliente.direccion]);
    x += bloqueInfoAdicional(adicionales);

    x += '</notaCredito>';
    return x;
  }

  function generarNotaDebito() {
    let x = '<notaDebito id="comprobante" version="1.0.0">\n';
    x += bloqueInfoTributaria();

    x += '  <infoNotaDebito>\n';
    x += `    <fechaEmision>${esc(fechaEmision)}</fechaEmision>\n`;
    x += `    <dirEstablecimiento>${esc(dirEstablecimiento)}</dirEstablecimiento>\n`;
    x += `    <tipoIdentificacionComprador>${esc(tipoIdComprador)}</tipoIdentificacionComprador>\n`;
    x += `    <razonSocialComprador>${esc(razonSocialComprador)}</razonSocialComprador>\n`;
    x += `    <identificacionComprador>${esc(identificacionComprador)}</identificacionComprador>\n`;
    if (contribuyenteEspecial) {
      x += `    <contribuyenteEspecial>${esc(contribuyenteEspecial)}</contribuyenteEspecial>\n`;
    }
    x += `    <obligadoContabilidad>${esc(obligadoContabilidad)}</obligadoContabilidad>\n`;
    x += `    <codDocModificado>01</codDocModificado>\n`;
    x += `    <numDocModificado>${esc(venta.numero_factura_modificada || venta.numero_factura || '')}</numDocModificado>\n`;
    x += `    <fechaEmisionDocSustento>${esc(normalizarFechaSRI(venta.comprobante_fecha_emision) || fechaEmision)}</fechaEmisionDocSustento>\n`;
    x += `    <totalSinImpuestos>${num(totalSinImpuestos)}</totalSinImpuestos>\n`;
    x += bloqueTotalConImpuestos('    ');
    x += `    <valorTotal>${num(importeTotal)}</valorTotal>\n`;
    x += '    <pagos>\n';
    x += '      <pago>\n';
    x += `        <formaPago>${esc(formaPago)}</formaPago>\n`;
    x += `        <total>${num(importeTotal)}</total>\n`;
    x += '      </pago>\n';
    x += '    </pagos>\n';
    x += '  </infoNotaDebito>\n';

    x += '  <motivos>\n';
    x += '    <motivo>\n';
    x += `      <razon>${esc(sanitizarCampoXML(venta.motivo || 'AJUSTE'))}</razon>\n`;
    x += `      <valor>${num(importeTotal)}</valor>\n`;
    x += '    </motivo>\n';
    x += '  </motivos>\n';

    x += '</notaDebito>';
    return x;
  }

  function generarGuiaRemision() {
    let x = '<guiaRemision id="comprobante" version="1.1.0">\n';
    x += bloqueInfoTributaria();

    const fechaIni = venta.inicio_transporte ? normalizarFechaSRI(venta.inicio_transporte) : fechaEmision;
    const fechaFin = venta.fin_transporte ? normalizarFechaSRI(venta.fin_transporte) : fechaEmision;

    x += '  <infoGuiaRemision>\n';
    x += `    <dirEstablecimiento>${esc(dirEstablecimiento)}</dirEstablecimiento>\n`;
    x += `    <dirPartida>${esc(sanitizarCampoXML(venta.direccion_partida || ''))}</dirPartida>\n`;
    x += `    <razonSocialTransportista>${esc(sanitizarCampoXML(venta.transportista_razon_social || ''))}</razonSocialTransportista>\n`;
    x += `    <tipoIdentificacionTransportista>${esc(venta.transportista_tipo || '04')}</tipoIdentificacionTransportista>\n`;
    x += `    <rucTransportista>${esc(venta.transportista_identificacion || '')}</rucTransportista>\n`;
    if (venta.transportista_correo) {
      x += `    <correoTransportista>${esc(venta.transportista_correo)}</correoTransportista>\n`;
    }
    x += `    <obligadoContabilidad>${esc(obligadoContabilidad)}</obligadoContabilidad>\n`;
    if (contribuyenteEspecial) {
      x += `    <contribuyenteEspecial>${esc(contribuyenteEspecial)}</contribuyenteEspecial>\n`;
    }
    x += `    <fechaIniTransporte>${esc(fechaIni)}</fechaIniTransporte>\n`;
    x += `    <fechaFinTransporte>${esc(fechaFin)}</fechaFinTransporte>\n`;
    x += `    <placa>${esc(venta.placa_transporte || venta.placa || '')}</placa>\n`;
    x += '  </infoGuiaRemision>\n';

    x += '  <destinatarios>\n';
    x += '    <destinatario>\n';
    x += `      <identificacionDestinatario>${esc(venta.destinatario_identificacion || cliente?.ruc || '')}</identificacionDestinatario>\n`;
    x += `      <razonSocialDestinatario>${esc(sanitizarCampoXML(venta.destinatario_razon_social || razonSocialComprador))}</razonSocialDestinatario>\n`;
    x += `      <dirDestinatario>${esc(sanitizarCampoXML(venta.destinatario_direccion || ''))}</dirDestinatario>\n`;
    x += `      <motivoTraslado>${esc(sanitizarCampoXML(venta.motivo || 'VENTA'))}</motivoTraslado>\n`;
    if (venta.documento_aduana) {
      x += `      <docAduaneroUnico>${esc(venta.documento_aduana)}</docAduaneroUnico>\n`;
    }
    if (venta.ruta) {
      x += `      <ruta>${esc(sanitizarCampoXML(venta.ruta))}</ruta>\n`;
    }
    if (venta.codigo_establecimiento_destino) {
      x += `      <codEstabDestino>${esc(venta.codigo_establecimiento_destino)}</codEstabDestino>\n`;
    }
    x += '      <detalles>\n';
    detallesCalculados.forEach(item => {
      const d = item.d;
      const codigo = sanitizarCampoXML(d.codigo || '');
      const descripcion = sanitizarCampoXML(d.nombre || d.descripcion || 'PRODUCTO');
      x += '        <detalle>\n';
      x += `          <codigoInterno>${esc(codigo)}</codigoInterno>\n`;
      if (d.codigo_auxiliar) {
        x += `          <codigoAdicional>${esc(sanitizarCampoXML(d.codigo_auxiliar))}</codigoAdicional>\n`;
      }
      x += `          <descripcion>${esc(descripcion)}</descripcion>\n`;
      x += `          <cantidad>${num6(item.cantidad)}</cantidad>\n`;
      x += '        </detalle>\n';
    });
    x += '      </detalles>\n';
    x += '    </destinatario>\n';
    x += '  </destinatarios>\n';

    x += '</guiaRemision>';
    return x;
  }

  function generarRetencion() {
    const codDocSustentoDefault = venta.comprobante_documento || '01';
    const numDocSustentoDefault = venta.comprobante_numero || venta.numero_factura_modificada || '';
    const fechaDocSustentoDefault = venta.comprobante_fecha_emision
      ? normalizarFechaSRI(venta.comprobante_fecha_emision)
      : fechaEmision;

    const defaults = {
      codDocSustento: codDocSustentoDefault,
      numDocSustento: numDocSustentoDefault,
      fechaEmisionDocSustento: fechaDocSustentoDefault
    };

    const impuestosRetencionRaw = Array.isArray(venta.impuestos_retencion) && venta.impuestos_retencion.length > 0
      ? venta.impuestos_retencion
      : [{
          codigo: venta.tipo_impuesto || '1',
          codigoRetencion: venta.tipo_retencion || '312',
          baseImponible: venta.subtotal || 0,
          porcentajeRetener: venta.porcentaje_retencion || 0,
          valorRetenido: venta.retencion_valor || 0
        }];

    const impuestosRetencion = impuestosRetencionRaw.map(imp =>
      normalizarImpuestoRetencion(imp, defaults)
    );

    let x = '<comprobanteRetencion id="comprobante" version="1.0.0">\n';
    x += bloqueInfoTributaria();

    x += '  <infoCompRetencion>\n';
    x += `    <fechaEmision>${esc(fechaEmision)}</fechaEmision>\n`;
    x += `    <dirEstablecimiento>${esc(dirEstablecimiento)}</dirEstablecimiento>\n`;
    if (contribuyenteEspecial) {
      x += `    <contribuyenteEspecial>${esc(contribuyenteEspecial)}</contribuyenteEspecial>\n`;
    }
    x += `    <obligadoContabilidad>${esc(obligadoContabilidad)}</obligadoContabilidad>\n`;
    x += `    <tipoIdentificacionSujetoRetenido>${esc(tipoIdComprador)}</tipoIdentificacionSujetoRetenido>\n`;
    x += `    <parteRel>NO</parteRel>\n`;
    x += `    <razonSocialSujetoRetenido>${esc(razonSocialComprador)}</razonSocialSujetoRetenido>\n`;
    x += `    <identificacionSujetoRetenido>${esc(identificacionComprador)}</identificacionSujetoRetenido>\n`;
    x += `    <periodoFiscal>${esc(periodoFiscal(venta.fecha_emision))}</periodoFiscal>\n`;
    x += '  </infoCompRetencion>\n';

    x += '  <impuestos>\n';
    impuestosRetencion.forEach(imp => {
      x += '    <impuesto>\n';
      x += `      <codigo>${esc(imp.codigo)}</codigo>\n`;
      x += `      <codigoRetencion>${esc(imp.codigoRetencion)}</codigoRetencion>\n`;
      x += `      <baseImponible>${num(imp.baseImponible)}</baseImponible>\n`;
      x += `      <porcentajeRetener>${num(imp.porcentajeRetener)}</porcentajeRetener>\n`;
      x += `      <valorRetenido>${num(imp.valorRetenido)}</valorRetenido>\n`;
      x += `      <codDocSustento>${esc(imp.codDocSustento)}</codDocSustento>\n`;
      x += `      <numDocSustento>${esc(imp.numDocSustento)}</numDocSustento>\n`;
      x += `      <fechaEmisionDocSustento>${esc(imp.fechaEmisionDocSustento)}</fechaEmisionDocSustento>\n`;
      x += '    </impuesto>\n';
    });
    x += '  </impuestos>\n';

    const adicionales = [];
    if (cliente?.email) adicionales.push(['Email', cliente.email]);
    if (venta.observaciones) adicionales.push(['Observaciones', venta.observaciones]);
    x += bloqueInfoAdicional(adicionales);

    x += '</comprobanteRetencion>';
    return x;
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  generarXMLComprobante,
  esc,
  num,
  num6,
  fechaSRI,
  periodoFiscal,
  codigoTipoIdentificacion,
  infoIVA,
  CODIGOS_IVA,

  // ---- Extensiones ----
  validarVentaParaXML,
  formatearSecuencial,
  normalizarFormaPago,
  normalizarFechaSRI,
  sanitizarCampoXML,
  FORMAS_PAGO_VALIDAS,
  CODIGO_DOC,

  // ---- Constantes ----
  CONFIG
};

// ---- Solo para tests ----
module.exports._round2 = round2;
module.exports._errorTipado = errorTipado;
module.exports._normalizarImpuestoRetencion = normalizarImpuestoRetencion;
module.exports._tipoImpuestoDesdeCodigo = tipoImpuestoDesdeCodigo;