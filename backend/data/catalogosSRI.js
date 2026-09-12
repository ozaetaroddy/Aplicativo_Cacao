// backend/data/catalogosSRI.js
// Catálogos oficiales del SRI Ecuador
// Fuente: https://www.sri.gob.ec/facturacion-electronica

// ===== TIPO DE IDENTIFICACIÓN =====
const TIPO_IDENTIFICACION = [
  { codigo: '04', nombre: 'RUC', abreviatura: 'RUC' },
  { codigo: '05', nombre: 'Cédula', abreviatura: 'CI' },
  { codigo: '06', nombre: 'Pasaporte', abreviatura: 'PAS' },
  { codigo: '07', nombre: 'Consumidor Final', abreviatura: 'CF' },
  { codigo: '08', nombre: 'Identificación del Exterior', abreviatura: 'EXT' },
  { codigo: '09', nombre: 'Placa', abreviatura: 'PLACA' }
];

// ===== TIPO DE COMPROBANTE =====
const TIPO_COMPROBANTE = [
  { codigo: '01', nombre: 'Factura' },
  { codigo: '02', nombre: 'Nota de Venta' },
  { codigo: '03', nombre: 'Liquidación de Compra' },
  { codigo: '04', nombre: 'Nota de Crédito' },
  { codigo: '05', nombre: 'Nota de Débito' },
  { codigo: '06', nombre: 'Guía de Remisión' },
  { codigo: '07', nombre: 'Comprobante de Retención' },
  { codigo: '08', nombre: 'Boletos o entradas a espectáculos públicos' },
  { codigo: '09', nombre: 'Tiquetes o vales emitidos por máquinas registradoras' },
  { codigo: '11', nombre: 'Pasajes expedidos por empresas de aviación' },
  { codigo: '12', nombre: 'Documentos emitidos por instituciones financieras' },
  { codigo: '15', nombre: 'Comprobante de venta emitido en el exterior' },
  { codigo: '16', nombre: 'Formulario único de exportación' },
  { codigo: '18', nombre: 'Nota de Crédito' },
  { codigo: '19', nombre: 'Comprobante de Retención Presuntiva' },
  { codigo: '20', nombre: 'Comprobante de Retención' },
  { codigo: '21', nombre: 'Carta de Porte Aéreo' },
  { codigo: '22', nombre: 'Recibo' },
  { codigo: '23', nombre: 'Comprobante de Servicios Hoteleros' },
  { codigo: '24', nombre: 'Nota de Crédito Tributaria' },
  { codigo: '41', nombre: 'Comprobante de Venta en Regímenes Especiales' },
  { codigo: '42', nombre: 'Documento de Exportación' },
  { codigo: '43', nombre: 'Comprobante de Venta' },
  { codigo: '44', nombre: 'Comprobante de Retención' },
  { codigo: '45', nombre: 'Comprobante de Retención' }
];

// ===== FORMA DE PAGO =====
const FORMA_PAGO = [
  { codigo: '01', nombre: 'Sin sistema financiero' },
  { codigo: '15', nombre: 'Compensación de deudas' },
  { codigo: '16', nombre: 'Tarjeta de débito' },
  { codigo: '17', nombre: 'Dinero electrónico' },
  { codigo: '18', nombre: 'Tarjeta prepago' },
  { codigo: '19', nombre: 'Tarjeta de crédito' },
  { codigo: '20', nombre: 'Otros con utilización del sistema financiero' },
  { codigo: '21', nombre: 'Endoso de títulos' }
];

// ===== TARIFA DE IVA =====
// codigoSRI = "codigoPorcentaje" que se envía al SRI
// Tarifas vigentes 2024-2025: 0%, 5%, 15%
const TARIFA_IVA = [
  { codigo: '0',  nombre: 'IVA 0%',  porcentaje: 0,  codigoSRI: '0', codigoPorcentaje: '0', tarifa: '0.00' },
  { codigo: '5',  nombre: 'IVA 5%',  porcentaje: 5,  codigoSRI: '5', codigoPorcentaje: '5', tarifa: '5.00' },
  { codigo: '15', nombre: 'IVA 15%', porcentaje: 15, codigoSRI: '4', codigoPorcentaje: '4', tarifa: '15.00' },
  { codigo: 'NA', nombre: 'No objeto de IVA', porcentaje: 0, codigoSRI: '6', codigoPorcentaje: '6', tarifa: '0.00' },
  { codigo: 'EX', nombre: 'Exento de IVA', porcentaje: 0, codigoSRI: '7', codigoPorcentaje: '7', tarifa: '0.00' }
];

// ===== TIPOS DE RETENCIÓN EN LA FUENTE =====
// NOTA: El código 725 aparece en RENTA (1.75%) y en IVA (100%). Son tipos DISTINTOS que
// comparten código porque el SRI así lo define, se distinguen por el campo "impuesto".
const TIPO_RETENCION = [
  // ---------- IMPUESTO A LA RENTA ----------
  { codigo: '303', nombre: '1% Bienes muebles corporales', porcentaje: 1, impuesto: 'RENTA' },
  { codigo: '312', nombre: '2% Servicios', porcentaje: 2, impuesto: 'RENTA' },
  { codigo: '319', nombre: '5% Arrendamiento mercantil', porcentaje: 5, impuesto: 'RENTA' },
  { codigo: '320', nombre: '8% Arrendamiento bienes inmuebles', porcentaje: 8, impuesto: 'RENTA' },
  { codigo: '322', nombre: '10% Seguros y reaseguros', porcentaje: 10, impuesto: 'RENTA' },
  { codigo: '323', nombre: '10% Rendimientos financieros', porcentaje: 10, impuesto: 'RENTA' },
  { codigo: '325', nombre: '25% Notarios y registradores', porcentaje: 25, impuesto: 'RENTA' },
  { codigo: '328', nombre: '1% Transporte privado de pasajeros', porcentaje: 1, impuesto: 'RENTA' },
  { codigo: '330', nombre: '1% Transporte público', porcentaje: 1, impuesto: 'RENTA' },
  { codigo: '331', nombre: '1% Transferencia de bienes muebles', porcentaje: 1, impuesto: 'RENTA' },
  { codigo: '332', nombre: '2% Servicios profesionales (personas naturales)', porcentaje: 2, impuesto: 'RENTA' },
  { codigo: '334', nombre: '2% Servicios prestados por personas naturales', porcentaje: 2, impuesto: 'RENTA' },
  { codigo: '340', nombre: '1% Energía eléctrica', porcentaje: 1, impuesto: 'RENTA' },
  { codigo: '341', nombre: '1% Servicio de telecomunicaciones', porcentaje: 1, impuesto: 'RENTA' },
  { codigo: '342', nombre: '5% Publicidad y comunicación', porcentaje: 5, impuesto: 'RENTA' },
  { codigo: '343', nombre: '3% Vehículos', porcentaje: 3, impuesto: 'RENTA' },
  { codigo: '344', nombre: '1% Compra de bienes', porcentaje: 1, impuesto: 'RENTA' },
  { codigo: '345', nombre: '1% Cuotas de arrendamiento', porcentaje: 1, impuesto: 'RENTA' },
  { codigo: '347', nombre: '10% Seguros', porcentaje: 10, impuesto: 'RENTA' },
  { codigo: '725', nombre: '1.75% Servicios profesionales', porcentaje: 1.75, impuesto: 'RENTA' },
  // ---------- IVA ----------
  { codigo: '721', nombre: '30% IVA bienes', porcentaje: 30, impuesto: 'IVA' },
  { codigo: '723', nombre: '70% IVA servicios', porcentaje: 70, impuesto: 'IVA' },
  { codigo: '725', nombre: '100% IVA honorarios profesionales', porcentaje: 100, impuesto: 'IVA' },
  { codigo: '727', nombre: '100% IVA arrendamiento mercantil', porcentaje: 100, impuesto: 'IVA' },
  { codigo: '729', nombre: '100% IVA arrendamiento bienes inmuebles', porcentaje: 100, impuesto: 'IVA' }
];

// ===== DOCUMENTO SUSTENTO =====
const DOCUMENTO_SUSTENTO = [
  { codigo: '01', nombre: 'Factura' },
  { codigo: '02', nombre: 'Nota de Venta' },
  { codigo: '03', nombre: 'Liquidación de Compra' },
  { codigo: '04', nombre: 'Nota de Crédito' },
  { codigo: '05', nombre: 'Nota de Débito' },
  { codigo: '06', nombre: 'Guía de Remisión' },
  { codigo: '07', nombre: 'Comprobante de Retención' },
  { codigo: '11', nombre: 'Pasajes expedidos por empresas de aviación' },
  { codigo: '12', nombre: 'Documentos emitidos por instituciones financieras' },
  { codigo: '16', nombre: 'Formulario Único de Exportación' },
  { codigo: '20', nombre: 'Comprobante de Retención Presuntiva' },
  { codigo: '21', nombre: 'Carta de Porte Aéreo' },
  { codigo: '22', nombre: 'Recibo' }
];

// ===== ESTADO DE PAGO =====
const ESTADO_PAGO = [
  { codigo: 'pendiente', nombre: 'Pendiente' },
  { codigo: 'pagado', nombre: 'Pagado' },
  { codigo: 'parcial', nombre: 'Pago Parcial' },
  { codigo: 'anulado', nombre: 'Anulado' }
];

// ===== TIPO DE MEDIDA (para productos) =====
const TIPO_MEDIDA = [
  { codigo: 'unidad', nombre: 'Unidad' },
  { codigo: 'peso', nombre: 'Peso (kg, g, lb)' },
  { codigo: 'volumen', nombre: 'Volumen (L, ml)' },
  { codigo: 'longitud', nombre: 'Longitud (m, cm)' },
  { codigo: 'area', nombre: 'Área (m²)' },
  { codigo: 'tiempo', nombre: 'Tiempo (h)' }
];

// ===== EXPORTAR =====
module.exports = {
  TIPO_IDENTIFICACION,
  TIPO_COMPROBANTE,
  FORMA_PAGO,
  TARIFA_IVA,
  TIPO_RETENCION,
  DOCUMENTO_SUSTENTO,
  ESTADO_PAGO,
  TIPO_MEDIDA
};