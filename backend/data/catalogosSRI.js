// backend/data/catalogosSRI.js
// ============================================================
// Catálogos oficiales del SRI Ecuador
// Fuente: https://www.sri.gob.ec/facturacion-electronica
// ============================================================
// Notas de mantenimiento:
//  - Todos los catálogos son inmutables (Object.freeze) para evitar
//    mutaciones accidentales desde otros módulos.
//  - Los helpers devuelven copias/valores seguros; nunca exponen la
//    referencia interna del array.
//  - Cuando un código se repite (p. ej. '725' en RENTA e IVA, o '07'
//    vs '20' en Comprobante de Retención), SIEMPRE filtra por el
//    campo discriminante correspondiente (`impuesto`, `uso`, etc.).
// ============================================================

'use strict';

// ============================================================
// CONSTANTES DE IMPUESTO
// ============================================================
const IMPUESTO = Object.freeze({
  RENTA: 'RENTA',
  IVA: 'IVA',
  ISD: 'ISD'
});

// ============================================================
// TIPO DE IDENTIFICACIÓN
// ============================================================
const TIPO_IDENTIFICACION = Object.freeze([
  Object.freeze({ codigo: '04', nombre: 'RUC',                          abreviatura: 'RUC',   longitud: 13, soloDigitos: true  }),
  Object.freeze({ codigo: '05', nombre: 'Cédula',                       abreviatura: 'CI',    longitud: 10, soloDigitos: true  }),
  Object.freeze({ codigo: '06', nombre: 'Pasaporte',                    abreviatura: 'PAS',   longitud: null, soloDigitos: false }),
  Object.freeze({ codigo: '07', nombre: 'Consumidor Final',             abreviatura: 'CF',    longitud: 13, soloDigitos: true  }),
  Object.freeze({ codigo: '08', nombre: 'Identificación del Exterior',  abreviatura: 'EXT',   longitud: null, soloDigitos: false }),
  Object.freeze({ codigo: '09', nombre: 'Placa',                        abreviatura: 'PLACA', longitud: null, soloDigitos: false })
]);

// ============================================================
// TIPO DE COMPROBANTE
// ------------------------------------------------------------
// Nota: el SRI mantiene códigos "duplicados" en nombre porque se
// usan en contextos distintos (físico vs electrónico, retenciones
// normales vs presuntivas). Se conservan tal cual los publica el SRI.
// ============================================================
const TIPO_COMPROBANTE = Object.freeze([
  Object.freeze({ codigo: '01', nombre: 'Factura' }),
  Object.freeze({ codigo: '02', nombre: 'Nota de Venta' }),
  Object.freeze({ codigo: '03', nombre: 'Liquidación de Compra' }),
  Object.freeze({ codigo: '04', nombre: 'Nota de Crédito' }),
  Object.freeze({ codigo: '05', nombre: 'Nota de Débito' }),
  Object.freeze({ codigo: '06', nombre: 'Guía de Remisión' }),
  Object.freeze({ codigo: '07', nombre: 'Comprobante de Retención' }),
  Object.freeze({ codigo: '08', nombre: 'Boletos o entradas a espectáculos públicos' }),
  Object.freeze({ codigo: '09', nombre: 'Tiquetes o vales emitidos por máquinas registradoras' }),
  Object.freeze({ codigo: '11', nombre: 'Pasajes expedidos por empresas de aviación' }),
  Object.freeze({ codigo: '12', nombre: 'Documentos emitidos por instituciones financieras' }),
  Object.freeze({ codigo: '15', nombre: 'Comprobante de venta emitido en el exterior' }),
  Object.freeze({ codigo: '16', nombre: 'Formulario único de exportación' }),
  Object.freeze({ codigo: '18', nombre: 'Nota de Crédito' }),
  Object.freeze({ codigo: '19', nombre: 'Comprobante de Retención Presuntiva' }),
  Object.freeze({ codigo: '20', nombre: 'Comprobante de Retención' }),
  Object.freeze({ codigo: '21', nombre: 'Carta de Porte Aéreo' }),
  Object.freeze({ codigo: '22', nombre: 'Recibo' }),
  Object.freeze({ codigo: '23', nombre: 'Comprobante de Servicios Hoteleros' }),
  Object.freeze({ codigo: '24', nombre: 'Nota de Crédito Tributaria' }),
  Object.freeze({ codigo: '41', nombre: 'Comprobante de Venta en Regímenes Especiales' }),
  Object.freeze({ codigo: '42', nombre: 'Documento de Exportación' }),
  Object.freeze({ codigo: '43', nombre: 'Comprobante de Venta' }),
  Object.freeze({ codigo: '44', nombre: 'Comprobante de Retención' }),
  Object.freeze({ codigo: '45', nombre: 'Comprobante de Retención' })
]);

// ============================================================
// FORMA DE PAGO
// ============================================================
const FORMA_PAGO = Object.freeze([
  Object.freeze({ codigo: '01', nombre: 'Sin sistema financiero' }),
  Object.freeze({ codigo: '15', nombre: 'Compensación de deudas' }),
  Object.freeze({ codigo: '16', nombre: 'Tarjeta de débito' }),
  Object.freeze({ codigo: '17', nombre: 'Dinero electrónico' }),
  Object.freeze({ codigo: '18', nombre: 'Tarjeta prepago' }),
  Object.freeze({ codigo: '19', nombre: 'Tarjeta de crédito' }),
  Object.freeze({ codigo: '20', nombre: 'Otros con utilización del sistema financiero' }),
  Object.freeze({ codigo: '21', nombre: 'Endoso de títulos' })
]);

// ============================================================
// TARIFA DE IVA
// ------------------------------------------------------------
//  - `codigo`           → clave interna amigable ('0', '5', '15', 'NA', 'EX')
//  - `codigoPorcentaje` → código que espera el SRI en el XML
//  - `tarifa`           → tarifa con 2 decimales como string (requerido por SRI)
// ============================================================
const TARIFA_IVA = Object.freeze([
  Object.freeze({ codigo: '0',  nombre: 'IVA 0%',           porcentaje: 0,  codigoSRI: '0', codigoPorcentaje: '0', tarifa: '0.00'  }),
  Object.freeze({ codigo: '5',  nombre: 'IVA 5%',           porcentaje: 5,  codigoSRI: '5', codigoPorcentaje: '5', tarifa: '5.00'  }),
  Object.freeze({ codigo: '15', nombre: 'IVA 15%',          porcentaje: 15, codigoSRI: '4', codigoPorcentaje: '4', tarifa: '15.00' }),
  Object.freeze({ codigo: 'NA', nombre: 'No objeto de IVA', porcentaje: 0,  codigoSRI: '6', codigoPorcentaje: '6', tarifa: '0.00'  }),
  Object.freeze({ codigo: 'EX', nombre: 'Exento de IVA',    porcentaje: 0,  codigoSRI: '7', codigoPorcentaje: '7', tarifa: '0.00'  })
]);

// ============================================================
// TIPOS DE RETENCIÓN EN LA FUENTE
// ------------------------------------------------------------
// ⚠️  El código '725' existe DOS veces:
//      - RENTA → 1.75% Servicios profesionales
//      - IVA   → 100%  Honorarios profesionales
//    SIEMPRE usa `buscarRetencion(codigo, impuesto)` o
//    `retencionesDe(impuesto)` para evitar ambigüedades.
// ============================================================
const TIPO_RETENCION = Object.freeze([
  // ---------- IMPUESTO A LA RENTA ----------
  Object.freeze({ codigo: '303', nombre: '1% Bienes muebles corporales',                       porcentaje: 1,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '312', nombre: '2% Servicios',                                       porcentaje: 2,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '319', nombre: '5% Arrendamiento mercantil',                         porcentaje: 5,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '320', nombre: '8% Arrendamiento bienes inmuebles',                  porcentaje: 8,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '322', nombre: '10% Seguros y reaseguros',                           porcentaje: 10,   impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '323', nombre: '10% Rendimientos financieros',                       porcentaje: 10,   impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '325', nombre: '25% Notarios y registradores',                       porcentaje: 25,   impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '328', nombre: '1% Transporte privado de pasajeros',                 porcentaje: 1,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '330', nombre: '1% Transporte público',                              porcentaje: 1,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '331', nombre: '1% Transferencia de bienes muebles',                 porcentaje: 1,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '332', nombre: '2% Servicios profesionales (personas naturales)',    porcentaje: 2,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '334', nombre: '2% Servicios prestados por personas naturales',      porcentaje: 2,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '340', nombre: '1% Energía eléctrica',                               porcentaje: 1,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '341', nombre: '1% Servicio de telecomunicaciones',                  porcentaje: 1,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '342', nombre: '5% Publicidad y comunicación',                       porcentaje: 5,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '343', nombre: '3% Vehículos',                                       porcentaje: 3,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '344', nombre: '1% Compra de bienes',                                porcentaje: 1,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '345', nombre: '1% Cuotas de arrendamiento',                         porcentaje: 1,    impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '347', nombre: '10% Seguros',                                        porcentaje: 10,   impuesto: IMPUESTO.RENTA }),
  Object.freeze({ codigo: '725', nombre: '1.75% Servicios profesionales',                      porcentaje: 1.75, impuesto: IMPUESTO.RENTA }),

  // ---------- IVA ----------
  Object.freeze({ codigo: '721', nombre: '30% IVA bienes',                    porcentaje: 30,  impuesto: IMPUESTO.IVA }),
  Object.freeze({ codigo: '723', nombre: '70% IVA servicios',                 porcentaje: 70,  impuesto: IMPUESTO.IVA }),
  Object.freeze({ codigo: '725', nombre: '100% IVA honorarios profesionales', porcentaje: 100, impuesto: IMPUESTO.IVA }),
  Object.freeze({ codigo: '727', nombre: '100% IVA arrendamiento mercantil',  porcentaje: 100, impuesto: IMPUESTO.IVA }),
  Object.freeze({ codigo: '729', nombre: '100% IVA arrendamiento bienes inmuebles', porcentaje: 100, impuesto: IMPUESTO.IVA })
]);

// ============================================================
// DOCUMENTO SUSTENTO
// ============================================================
const DOCUMENTO_SUSTENTO = Object.freeze([
  Object.freeze({ codigo: '01', nombre: 'Factura' }),
  Object.freeze({ codigo: '02', nombre: 'Nota de Venta' }),
  Object.freeze({ codigo: '03', nombre: 'Liquidación de Compra' }),
  Object.freeze({ codigo: '04', nombre: 'Nota de Crédito' }),
  Object.freeze({ codigo: '05', nombre: 'Nota de Débito' }),
  Object.freeze({ codigo: '06', nombre: 'Guía de Remisión' }),
  Object.freeze({ codigo: '07', nombre: 'Comprobante de Retención' }),
  Object.freeze({ codigo: '11', nombre: 'Pasajes expedidos por empresas de aviación' }),
  Object.freeze({ codigo: '12', nombre: 'Documentos emitidos por instituciones financieras' }),
  Object.freeze({ codigo: '16', nombre: 'Formulario Único de Exportación' }),
  Object.freeze({ codigo: '20', nombre: 'Comprobante de Retención Presuntiva' }),
  Object.freeze({ codigo: '21', nombre: 'Carta de Porte Aéreo' }),
  Object.freeze({ codigo: '22', nombre: 'Recibo' })
]);

// ============================================================
// ESTADO DE PAGO
// ============================================================
const ESTADO_PAGO = Object.freeze([
  Object.freeze({ codigo: 'pendiente', nombre: 'Pendiente' }),
  Object.freeze({ codigo: 'pagado',    nombre: 'Pagado' }),
  Object.freeze({ codigo: 'parcial',   nombre: 'Pago Parcial' }),
  Object.freeze({ codigo: 'anulado',   nombre: 'Anulado' })
]);

// ============================================================
// TIPO DE MEDIDA
// ============================================================
const TIPO_MEDIDA = Object.freeze([
  Object.freeze({ codigo: 'unidad',   nombre: 'Unidad' }),
  Object.freeze({ codigo: 'peso',     nombre: 'Peso (kg, g, lb)' }),
  Object.freeze({ codigo: 'volumen',  nombre: 'Volumen (L, ml)' }),
  Object.freeze({ codigo: 'longitud', nombre: 'Longitud (m, cm)' }),
  Object.freeze({ codigo: 'area',     nombre: 'Área (m²)' }),
  Object.freeze({ codigo: 'tiempo',   nombre: 'Tiempo (h)' })
]);

// ============================================================
// HELPERS GENÉRICOS
// ============================================================
/**
 * Normaliza un código a string sin espacios. Devuelve `null` si es vacío.
 * @param {string|number|null|undefined} codigo
 * @returns {string|null}
 */
function normalizarCodigo(codigo) {
  if (codigo === null || codigo === undefined) return null;
  const s = String(codigo).trim();
  return s.length ? s : null;
}

/**
 * Busca un registro en cualquier catálogo por su `codigo`.
 * @template T
 * @param {ReadonlyArray<T>} catalogo
 * @param {string|number} codigo
 * @returns {T|null}
 */
function buscarPorCodigo(catalogo, codigo) {
  const cod = normalizarCodigo(codigo);
  if (!cod) return null;
  return catalogo.find(item => item.codigo === cod) || null;
}

/**
 * Busca un registro en cualquier catálogo por coincidencia parcial de `nombre`
 * (case-insensitive). Devuelve el primero que coincida.
 * @template T
 * @param {ReadonlyArray<T>} catalogo
 * @param {string} texto
 * @returns {T|null}
 */
function buscarPorNombre(catalogo, texto) {
  if (!texto) return null;
  const q = String(texto).trim().toLowerCase();
  if (!q) return null;
  return catalogo.find(item => String(item.nombre).toLowerCase().includes(q)) || null;
}

/**
 * Devuelve `true` si el código existe en el catálogo.
 * @param {ReadonlyArray<{codigo:string}>} catalogo
 * @param {string|number} codigo
 */
function existeCodigo(catalogo, codigo) {
  return buscarPorCodigo(catalogo, codigo) !== null;
}

// ============================================================
// HELPERS ESPECÍFICOS
// ============================================================

/** Busca un tipo de identificación por código ('04','05', ...). */
function buscarTipoIdentificacion(codigo) {
  return buscarPorCodigo(TIPO_IDENTIFICACION, codigo);
}

/** Busca un tipo de comprobante por código. */
function buscarTipoComprobante(codigo) {
  return buscarPorCodigo(TIPO_COMPROBANTE, codigo);
}

/** Busca una forma de pago por código. */
function buscarFormaPago(codigo) {
  return buscarPorCodigo(FORMA_PAGO, codigo);
}

/**
 * Busca una tarifa de IVA por su código interno ('0','5','15','NA','EX')
 * o por su `codigoPorcentaje` del SRI ('0','5','4','6','7').
 */
function buscarTarifaIVA(codigo) {
  const cod = normalizarCodigo(codigo);
  if (!cod) return null;
  return TARIFA_IVA.find(t => t.codigo === cod || t.codigoPorcentaje === cod) || null;
}

/**
 * Busca un tipo de retención por código.
 * Si se indica `impuesto` (IMPUESTO.RENTA | IMPUESTO.IVA), filtra por él.
 * ⚠️  Es OBLIGATORIO pasar `impuesto` cuando el código es '725'.
 * @param {string} codigo
 * @param {'RENTA'|'IVA'|string} [impuesto]
 */
function buscarRetencion(codigo, impuesto) {
  const cod = normalizarCodigo(codigo);
  if (!cod) return null;
  const imp = impuesto ? String(impuesto).toUpperCase() : null;
  return TIPO_RETENCION.find(t => t.codigo === cod && (!imp || t.impuesto === imp)) || null;
}

/**
 * Devuelve todas las retenciones de un impuesto.
 * @param {'RENTA'|'IVA'|string} [impuesto]  Si se omite, devuelve todas.
 */
function retencionesDe(impuesto) {
  if (!impuesto) return [...TIPO_RETENCION];
  const imp = String(impuesto).toUpperCase();
  return TIPO_RETENCION.filter(t => t.impuesto === imp);
}

/** Devuelve todos los códigos únicos del catálogo de retenciones. */
function codigosRetencionUnicos() {
  return [...new Set(TIPO_RETENCION.map(t => t.codigo))];
}

/**
 * Devuelve los códigos que aparecen más de una vez en el catálogo de retenciones.
 * Útil para tests / alertas.
 */
function codigosRetencionDuplicados() {
  const conteo = TIPO_RETENCION.reduce((acc, t) => {
    acc[t.codigo] = (acc[t.codigo] || 0) + 1;
    return acc;
  }, {});
  return Object.keys(conteo).filter(c => conteo[c] > 1);
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // Constantes
  IMPUESTO,

  // Catálogos
  TIPO_IDENTIFICACION,
  TIPO_COMPROBANTE,
  FORMA_PAGO,
  TARIFA_IVA,
  TIPO_RETENCION,
  DOCUMENTO_SUSTENTO,
  ESTADO_PAGO,
  TIPO_MEDIDA,

  // Helpers genéricos
  normalizarCodigo,
  buscarPorCodigo,
  buscarPorNombre,
  existeCodigo,

  // Helpers específicos
  buscarTipoIdentificacion,
  buscarTipoComprobante,
  buscarFormaPago,
  buscarTarifaIVA,
  buscarRetencion,
  retencionesDe,
  codigosRetencionUnicos,
  codigosRetencionDuplicados
};