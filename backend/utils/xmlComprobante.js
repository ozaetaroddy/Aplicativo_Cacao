// backend/utils/xmlComprobante.js
// Generador de XML de comprobantes electrónicos del SRI (sin firma)

/**
 * Escapa caracteres especiales para XML.
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
 * Formatea un número a 2 decimales para XML (formato del SRI).
 */
function num(n) {
  const v = parseFloat(n) || 0;
  return v.toFixed(2);
}

/**
 * Formatea un número a 6 decimales (para cantidad).
 */
function num6(n) {
  const v = parseFloat(n) || 0;
  return v.toFixed(6);
}

/**
 * Formatea fecha al formato del SRI: ddmmaaaa
 */
function fechaSRI(fecha) {
  const d = new Date(fecha);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

/**
 * Mapea tipo identificación interna a código SRI (para comprador).
 */
function codigoTipoIdentificacion(ruc) {
  if (!ruc) return '07'; // Consumidor final
  const limpio = String(ruc).replace(/\D/g, '');
  if (limpio.length === 13) return '04'; // RUC
  if (limpio.length === 10) return '05'; // Cédula
  return '07';
}

/**
 * Código SRI del tipo de comprobante.
 */
const CODIGO_DOC = {
  factura: '01',
  liquidacion: '03',
  nota_credito: '04',
  nota_debito: '05',
  guia_remision: '06',
  retencion: '07'
};

/**
 * Código de impuesto IVA según tarifa.
 * 0 = IVA 0%, 5 = IVA 5%, 4 = IVA 15% (tarifa actual), 6 = No objeto, 7 = Exento
 */
function codigoPorcentajeIVA(aplicaIVA) {
  if (!aplicaIVA) return { codigo: '0', codigoPorcentaje: '0', tarifa: '0.00' };
  // IVA 15% tiene codigoPorcentaje = 4 en el SRI (históricamente era el 12%, ahora 15%)
  return { codigo: '2', codigoPorcentaje: '4', tarifa: '15.00' };
}

/**
 * Genera el XML del comprobante (factura, nota de crédito, etc.) sin firma.
 *
 * @param {object} venta - Documento desde MongoDB
 * @param {object} cliente - Cliente asociado
 * @param {object} config - Configuración de la empresa
 * @returns {string} XML
 */
function generarXMLComprobante(venta, cliente, config) {
  const tipoDoc = venta.tipo_documento || 'factura';
  const codDoc = CODIGO_DOC[tipoDoc] || '01';

  // ===== Info Tributaria =====
  const ambiente = config.ambiente || '1';
  const tipoEmision = config.tipo_emision || '1';
  const razonSocial = config.razon_social || 'CONTRIBUYENTE';
  const nombreComercial = config.nombre_comercial || razonSocial;
  const ruc = config.ruc || '';
  const claveAcceso = venta.clave_acceso || '';
  const estab = (venta.establecimiento || config.establecimiento || '001').padStart(3, '0');
  const ptoEmi = (venta.punto_emision || config.punto_emision || '001').padStart(3, '0');
  const secuencial = (venta.secuencial_sri || venta.numero_factura || '000000001').replace(/\D/g, '').padStart(9, '0').slice(-9);
  const dirMatriz = config.direccion_matriz || '';

  // ===== Info Factura =====
  const fechaEmision = fechaSRI(venta.fecha_emision);
  const dirEstablecimiento = config.direccion_establecimiento || dirMatriz;
  const obligadoContabilidad = config.obligado_contabilidad ? 'SI' : 'NO';

  const tipoIdComprador = codigoTipoIdentificacion(cliente?.ruc);
  const razonSocialComprador = cliente?.nombre || 'CONSUMIDOR FINAL';
  const identificacionComprador = cliente?.ruc || '9999999999999';

  const totalSinImpuestos = num(venta.subtotal || 0);
  const totalDescuento = num(0);
  const importeTotal = num(venta.total || 0);
  const moneda = 'DOLAR';

  // ===== Cálculo de totales con impuestos =====
  const detalles = venta.detalles || [];
  let baseImponible = 0;
  let baseCero = 0;
  let valorIVA = 0;

  detalles.forEach(d => {
    const sub = (d.cantidad || 0) * (d.precio_unitario || 0);
    if (d.aplica_iva !== false) {
      baseImponible += sub;
    } else {
      baseCero += sub;
    }
  });

  valorIVA = baseImponible * 0.15;

  // ===== Construcción del XML =====
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';

  switch (tipoDoc) {
    case 'nota_credito':
      xml += generarNotaCredito();
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

  return xml;

  // =====================================================
  // FACTURA (v1.1.0)
  // =====================================================
  function generarFactura() {
    let x = '';

    // infoTributaria
    x += '<factura id="comprobante" version="1.1.0">\n';
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

    // infoFactura
    x += '  <infoFactura>\n';
    x += `    <fechaEmision>${esc(fechaEmision)}</fechaEmision>\n`;
    x += `    <dirEstablecimiento>${esc(dirEstablecimiento)}</dirEstablecimiento>\n`;
    if (config.contribuyente_especial) {
      x += `    <contribuyenteEspecial>${esc(config.contribuyente_especial)}</contribuyenteEspecial>\n`;
    }
    x += `    <obligadoContabilidad>${esc(obligadoContabilidad)}</obligadoContabilidad>\n`;
    x += `    <tipoIdentificacionComprador>${esc(tipoIdComprador)}</tipoIdentificacionComprador>\n`;
    x += `    <razonSocialComprador>${esc(razonSocialComprador)}</razonSocialComprador>\n`;
    x += `    <identificacionComprador>${esc(identificacionComprador)}</identificacionComprador>\n`;
    x += `    <totalSinImpuestos>${totalSinImpuestos}</totalSinImpuestos>\n`;
    x += `    <totalDescuento>${totalDescuento}</totalDescuento>\n`;

    // totalConImpuestos
    x += '    <totalConImpuestos>\n';
    // IVA 15%
    x += '      <totalImpuesto>\n';
    x += '        <codigo>2</codigo>\n';
    x += '        <codigoPorcentaje>4</codigoPorcentaje>\n';
    x += `        <baseImponible>${num(baseImponible)}</baseImponible>\n`;
    x += `        <valor>${num(valorIVA)}</valor>\n`;
    x += '      </totalImpuesto>\n';
    // IVA 0% si aplica
    if (baseCero > 0) {
      x += '      <totalImpuesto>\n';
      x += '        <codigo>2</codigo>\n';
      x += '        <codigoPorcentaje>0</codigoPorcentaje>\n';
      x += `        <baseImponible>${num(baseCero)}</baseImponible>\n`;
      x += '        <valor>0.00</valor>\n';
      x += '      </totalImpuesto>\n';
    }
    x += '    </totalConImpuestos>\n';

    x += `    <propina>0.00</propina>\n`;
    x += `    <importeTotal>${importeTotal}</importeTotal>\n`;
    x += `    <moneda>${esc(moneda)}</moneda>\n`;

    // pagos
    x += '    <pagos>\n';
    x += '      <pago>\n';
    x += `        <formaPago>${esc(venta.forma_pago || '01')}</formaPago>\n`;
    x += `        <total>${importeTotal}</total>\n`;
    x += '      </pago>\n';
    x += '    </pagos>\n';

    x += '  </infoFactura>\n';

    // detalles
    x += '  <detalles>\n';
    detalles.forEach(d => {
      const esIVA = d.aplica_iva !== false;
      const cantidad = d.cantidad || 0;
      const precioUnit = d.precio_unitario || 0;
      const descuento = 0;
      const precioTotal = cantidad * precioUnit - descuento;
      const iva = esIVA ? precioTotal * 0.15 : 0;
      const ivaInfo = codigoPorcentajeIVA(esIVA);

      x += '    <detalle>\n';
      x += `      <codigoPrincipal>${esc(d.codigo || d.productoId || '')}</codigoPrincipal>\n`;
      x += `      <descripcion>${esc(d.descripcion || d.nombre_producto || 'PRODUCTO')}</descripcion>\n`;
      x += `      <cantidad>${num6(cantidad)}</cantidad>\n`;
      x += `      <precioUnitario>${num(precioUnit)}</precioUnitario>\n`;
      x += `      <descuento>${num(descuento)}</descuento>\n`;
      x += `      <precioTotalSinImpuesto>${num(precioTotal)}</precioTotalSinImpuesto>\n`;
      x += '      <impuestos>\n';
      x += '        <impuesto>\n';
      x += `          <codigo>2</codigo>\n`;
      x += `          <codigoPorcentaje>${ivaInfo.codigoPorcentaje}</codigoPorcentaje>\n`;
      x += `          <tarifa>${ivaInfo.tarifa}</tarifa>\n`;
      x += `          <baseImponible>${num(precioTotal)}</baseImponible>\n`;
      x += `          <valor>${num(iva)}</valor>\n`;
      x += '        </impuesto>\n';
      x += '      </impuestos>\n';
      x += '    </detalle>\n';
    });
    x += '  </detalles>\n';

    // infoAdicional
    x += '  <infoAdicional>\n';
    if (cliente?.email) {
      x += `    <campoAdicional nombre="Email">${esc(cliente.email)}</campoAdicional>\n`;
    }
    if (cliente?.telefono) {
      x += `    <campoAdicional nombre="Telefono">${esc(cliente.telefono)}</campoAdicional>\n`;
    }
    if (cliente?.direccion) {
      x += `    <campoAdicional nombre="Direccion">${esc(cliente.direccion)}</campoAdicional>\n`;
    }
    if (venta.observaciones) {
      x += `    <campoAdicional nombre="Observaciones">${esc(venta.observaciones)}</campoAdicional>\n`;
    }
    x += '  </infoAdicional>\n';

    x += '</factura>';
    return x;
  }

  // =====================================================
  // NOTA DE CRÉDITO (v1.1.0)
  // =====================================================
  function generarNotaCredito() {
    let x = '';
    x += '<notaCredito id="comprobante" version="1.1.0">\n';
    x += '  <infoTributaria>\n';
    x += `    <ambiente>${esc(ambiente)}</ambiente>\n`;
    x += `    <tipoEmision>${esc(tipoEmision)}</tipoEmision>\n`;
    x += `    <razonSocial>${esc(razonSocial)}</razonSocial>\n`;
    x += `    <nombreComercial>${esc(nombreComercial)}</nombreComercial>\n`;
    x += `    <ruc>${esc(ruc)}</ruc>\n`;
    x += `    <claveAcceso>${esc(claveAcceso)}</claveAcceso>\n`;
    x += `    <codDoc>04</codDoc>\n`;
    x += `    <estab>${esc(estab)}</estab>\n`;
    x += `    <ptoEmi>${esc(ptoEmi)}</ptoEmi>\n`;
    x += `    <secuencial>${esc(secuencial)}</secuencial>\n`;
    x += `    <dirMatriz>${esc(dirMatriz)}</dirMatriz>\n`;
    x += '  </infoTributaria>\n';

    x += '  <infoNotaCredito>\n';
    x += `    <fechaEmision>${esc(fechaEmision)}</fechaEmision>\n`;
    x += `    <dirEstablecimiento>${esc(dirEstablecimiento)}</dirEstablecimiento>\n`;
    x += `    <tipoIdentificacionComprador>${esc(tipoIdComprador)}</tipoIdentificacionComprador>\n`;
    x += `    <razonSocialComprador>${esc(razonSocialComprador)}</razonSocialComprador>\n`;
    x += `    <identificacionComprador>${esc(identificacionComprador)}</identificacionComprador>\n`;
    x += `    <obligadoContabilidad>${esc(obligadoContabilidad)}</obligadoContabilidad>\n`;
    x += `    <codDocModificado>01</codDocModificado>\n`;
    x += `    <numDocModificado>${esc(venta.numero_factura || '')}</numDocModificado>\n`;
    x += `    <fechaEmisionDocSustento>${esc(fechaEmision)}</fechaEmisionDocSustento>\n`;
    x += `    <totalSinImpuestos>${totalSinImpuestos}</totalSinImpuestos>\n`;
    x += `    <valorModificacion>${importeTotal}</valorModificacion>\n`;
    x += `    <moneda>${esc(moneda)}</moneda>\n`;

    x += '    <totalConImpuestos>\n';
    x += '      <totalImpuesto>\n';
    x += '        <codigo>2</codigo>\n';
    x += '        <codigoPorcentaje>4</codigoPorcentaje>\n';
    x += `        <baseImponible>${num(baseImponible)}</baseImponible>\n`;
    x += `        <valor>${num(valorIVA)}</valor>\n`;
    x += '      </totalImpuesto>\n';
    x += '    </totalConImpuestos>\n';

    x += `    <motivo>${esc(venta.motivo || 'DEVOLUCION')}</motivo>\n`;
    x += '  </infoNotaCredito>\n';

    x += '  <detalles>\n';
    detalles.forEach(d => {
      const cantidad = d.cantidad || 0;
      const precioUnit = d.precio_unitario || 0;
      const precioTotal = cantidad * precioUnit;
      const iva = d.aplica_iva !== false ? precioTotal * 0.15 : 0;

      x += '    <detalle>\n';
      x += `      <codigoInterno>${esc(d.codigo || '')}</codigoInterno>\n`;
      x += `      <descripcion>${esc(d.descripcion || d.nombre_producto || 'PRODUCTO')}</descripcion>\n`;
      x += `      <cantidad>${num6(cantidad)}</cantidad>\n`;
      x += `      <precioUnitario>${num(precioUnit)}</precioUnitario>\n`;
      x += `      <descuento>0.00</descuento>\n`;
      x += `      <precioTotalSinImpuesto>${num(precioTotal)}</precioTotalSinImpuesto>\n`;
      x += '      <impuestos>\n';
      x += '        <impuesto>\n';
      x += '          <codigo>2</codigo>\n';
      x += `          <codigoPorcentaje>${d.aplica_iva !== false ? '4' : '0'}</codigoPorcentaje>\n`;
      x += `          <tarifa>${d.aplica_iva !== false ? '15.00' : '0.00'}</tarifa>\n`;
      x += `          <baseImponible>${num(precioTotal)}</baseImponible>\n`;
      x += `          <valor>${num(iva)}</valor>\n`;
      x += '        </impuesto>\n';
      x += '      </impuestos>\n';
      x += '    </detalle>\n';
    });
    x += '  </detalles>\n';

    x += '  <infoAdicional>\n';
    if (cliente?.email) {
      x += `    <campoAdicional nombre="Email">${esc(cliente.email)}</campoAdicional>\n`;
    }
    x += '  </infoAdicional>\n';

    x += '</notaCredito>';
    return x;
  }

  // =====================================================
  // GUÍA DE REMISIÓN (v1.1.0)
  // =====================================================
  function generarGuiaRemision() {
    let x = '';
    x += '<guiaRemision id="comprobante" version="1.1.0">\n';
    x += '  <infoTributaria>\n';
    x += `    <ambiente>${esc(ambiente)}</ambiente>\n`;
    x += `    <tipoEmision>${esc(tipoEmision)}</tipoEmision>\n`;
    x += `    <razonSocial>${esc(razonSocial)}</razonSocial>\n`;
    x += `    <nombreComercial>${esc(nombreComercial)}</nombreComercial>\n`;
    x += `    <ruc>${esc(ruc)}</ruc>\n`;
    x += `    <claveAcceso>${esc(claveAcceso)}</claveAcceso>\n`;
    x += `    <codDoc>06</codDoc>\n`;
    x += `    <estab>${esc(estab)}</estab>\n`;
    x += `    <ptoEmi>${esc(ptoEmi)}</ptoEmi>\n`;
    x += `    <secuencial>${esc(secuencial)}</secuencial>\n`;
    x += `    <dirMatriz>${esc(dirMatriz)}</dirMatriz>\n`;
    x += '  </infoTributaria>\n';

    x += '  <infoGuiaRemision>\n';
    x += `    <dirEstablecimiento>${esc(dirEstablecimiento)}</dirEstablecimiento>\n`;
    x += `    <dirPartida>${esc(venta.direccion_partida || '')}</dirPartida>\n`;
    x += `    <razonSocialTransportista>${esc(venta.transportista_razon_social || '')}</razonSocialTransportista>\n`;
    x += `    <tipoIdentificacionTransportista>${esc(venta.transportista_tipo || '04')}</tipoIdentificacionTransportista>\n`;
    x += `    <rucTransportista>${esc(venta.transportista_identificacion || '')}</rucTransportista>\n`;
    x += `    <obligadoContabilidad>${esc(obligadoContabilidad)}</obligadoContabilidad>\n`;
    if (config.contribuyente_especial) {
      x += `    <contribuyenteEspecial>${esc(config.contribuyente_especial)}</contribuyenteEspecial>\n`;
    }
    x += `    <fechaIniTransporte>${esc(venta.inicio_transporte || fechaEmision)}</fechaIniTransporte>\n`;
    x += `    <fechaFinTransporte>${esc(venta.fin_transporte || fechaEmision)}</fechaFinTransporte>\n`;
    x += `    <placa>${esc(venta.placa_transporte || '')}</placa>\n`;
    x += '  </infoGuiaRemision>\n';

    x += '  <destinatarios>\n';
    x += '    <destinatario>\n';
    x += `      <identificacionDestinatario>${esc(venta.destinatario_identificacion || '')}</identificacionDestinatario>\n`;
    x += `      <razonSocialDestinatario>${esc(venta.destinatario_razon_social || '')}</razonSocialDestinatario>\n`;
    x += `      <dirDestinatario>${esc(venta.destinatario_direccion || '')}</dirDestinatario>\n`;
    x += `      <motivoTraslado>${esc(venta.motivo || '')}</motivoTraslado>\n`;
    if (venta.ruta) {
      x += `      <ruta>${esc(venta.ruta)}</ruta>\n`;
    }
    x += '      <detalles>\n';
    detalles.forEach(d => {
      const cantidad = d.cantidad || 0;
      x += '        <detalle>\n';
      x += `          <codigoInterno>${esc(d.codigo || '')}</codigoInterno>\n`;
      x += `          <descripcion>${esc(d.descripcion || 'PRODUCTO')}</descripcion>\n`;
      x += `          <cantidad>${num6(cantidad)}</cantidad>\n`;
      x += '        </detalle>\n';
    });
    x += '      </detalles>\n';
    x += '    </destinatario>\n';
    x += '  </destinatarios>\n';

    x += '</guiaRemision>';
    return x;
  }

  // =====================================================
  // COMPROBANTE DE RETENCIÓN (v1.0.0)
  // =====================================================
  function generarRetencion() {
    let x = '';
    x += '<comprobanteRetencion id="comprobante" version="1.0.0">\n';
    x += '  <infoTributaria>\n';
    x += `    <ambiente>${esc(ambiente)}</ambiente>\n`;
    x += `    <tipoEmision>${esc(tipoEmision)}</tipoEmision>\n`;
    x += `    <razonSocial>${esc(razonSocial)}</razonSocial>\n`;
    x += `    <nombreComercial>${esc(nombreComercial)}</nombreComercial>\n`;
    x += `    <ruc>${esc(ruc)}</ruc>\n`;
    x += `    <claveAcceso>${esc(claveAcceso)}</claveAcceso>\n`;
    x += `    <codDoc>07</codDoc>\n`;
    x += `    <estab>${esc(estab)}</estab>\n`;
    x += `    <ptoEmi>${esc(ptoEmi)}</ptoEmi>\n`;
    x += `    <secuencial>${esc(secuencial)}</secuencial>\n`;
    x += `    <dirMatriz>${esc(dirMatriz)}</dirMatriz>\n`;
    x += '  </infoTributaria>\n';

    x += '  <infoCompRetencion>\n';
    x += `    <fechaEmision>${esc(fechaEmision)}</fechaEmision>\n`;
    x += `    <dirEstablecimiento>${esc(dirEstablecimiento)}</dirEstablecimiento>\n`;
    x += `    <obligadoContabilidad>${esc(obligadoContabilidad)}</obligadoContabilidad>\n`;
    x += `    <tipoIdentificacionSujetoRetenido>${esc(tipoIdComprador)}</tipoIdentificacionSujetoRetenido>\n`;
    x += `    <razonSocialSujetoRetenido>${esc(razonSocialComprador)}</razonSocialSujetoRetenido>\n`;
    x += `    <identificacionSujetoRetenido>${esc(identificacionComprador)}</identificacionSujetoRetenido>\n`;
    x += `    <periodoFiscal>${esc(fechaEmision.substring(3))}</periodoFiscal>\n`;
    x += '  </infoCompRetencion>\n';

    x += '  <impuestos>\n';
    x += '    <impuesto>\n';
    x += `      <codigo>1</codigo>\n`;
    x += `      <codigoRetencion>${esc(venta.tipo_retencion || '312')}</codigoRetencion>\n`;
    x += `      <baseImponible>${num(venta.subtotal || 0)}</baseImponible>\n`;
    x += `      <porcentajeRetener>${num(venta.porcentaje_retencion || 0)}</porcentajeRetener>\n`;
    x += `      <valorRetenido>${num(venta.retencion_valor || 0)}</valorRetenido>\n`;
    x += '    </impuesto>\n';
    x += '  </impuestos>\n';

    x += '</comprobanteRetencion>';
    return x;
  }
}

module.exports = {
  generarXMLComprobante,
  esc,
  num,
  fechaSRI,
  codigoTipoIdentificacion
};