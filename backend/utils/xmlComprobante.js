// backend/utils/xmlComprobante.js
// Generador de XML de comprobantes electrónicos del SRI (sin firma)

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function num(n) {
  const v = parseFloat(n) || 0;
  return v.toFixed(2);
}

function num6(n) {
  const v = parseFloat(n) || 0;
  return v.toFixed(6);
}

function fechaSRI(fecha) {
  const d = new Date(fecha);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

function periodoFiscal(fecha) {
  const d = new Date(fecha);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${mes}/${anio}`;
}

function codigoTipoIdentificacion(ruc) {
  if (!ruc) return '07';
  const limpio = String(ruc).replace(/\D/g, '');
  if (limpio.length === 13) return '04';
  if (limpio.length === 10) return '05';
  return '07';
}

const CODIGO_DOC = {
  factura: '01',
  liquidacion: '03',
  nota_credito: '04',
  nota_debito: '05',
  guia_remision: '06',
  retencion: '07',
  exportacion: '01',
  reembolso: '01'
};

const CODIGOS_IVA = {
  0:    { codigo: '2', codigoPorcentaje: '0', tarifa: '0.00' },
  5:    { codigo: '2', codigoPorcentaje: '5', tarifa: '5.00' },
  12:   { codigo: '2', codigoPorcentaje: '2', tarifa: '12.00' },
  14:   { codigo: '2', codigoPorcentaje: '3', tarifa: '14.00' },
  15:   { codigo: '2', codigoPorcentaje: '4', tarifa: '15.00' },
  999:  { codigo: '2', codigoPorcentaje: '6', tarifa: '0.00' },
  998:  { codigo: '2', codigoPorcentaje: '7', tarifa: '0.00' }
};

function infoIVA(aplicaIVA, tarifaIva) {
  if (tarifaIva === 'NO_OBJETO') return { ...CODIGOS_IVA[999], porcentaje: 0 };
  if (tarifaIva === 'EXENTO') return { ...CODIGOS_IVA[998], porcentaje: 0 };

  if (!aplicaIVA) return { ...CODIGOS_IVA[0], porcentaje: 0 };

  let pct = parseFloat(tarifaIva);
  if (!isNaN(pct) && pct > 0 && pct < 1) pct = pct * 100;

  if (pct === 15 || pct === 12 || pct === 14) return { ...CODIGOS_IVA[pct], porcentaje: pct };
  if (pct === 5) return { ...CODIGOS_IVA[5], porcentaje: 5 };
  if (pct === 0 || isNaN(pct)) return { ...CODIGOS_IVA[0], porcentaje: 0 };

  return { ...CODIGOS_IVA[15], porcentaje: 15 };
}

function generarXMLComprobante(venta, cliente, config) {
  const tipoDoc = venta.tipo_documento || 'factura';
  const codDoc = CODIGO_DOC[tipoDoc] || '01';

  const ambiente = config.ambiente || '1';
  const tipoEmision = config.tipo_emision || '1';
  const razonSocial = config.razon_social || 'CONTRIBUYENTE';
  const nombreComercial = config.nombre_comercial || razonSocial;
  const ruc = config.ruc || '';
  const claveAcceso = venta.clave_acceso || '';
  const estab = (venta.establecimiento || config.establecimiento || '001').padStart(3, '0');
  const ptoEmi = (venta.punto_emision || config.punto_emision || '001').padStart(3, '0');

  let secuencial = venta.secuencial_sri;
  if (!secuencial) {
    const soloDigitos = String(venta.numero_factura || '1').replace(/\D/g, '');
    secuencial = soloDigitos.slice(-9).padStart(9, '0');
  } else {
    secuencial = String(secuencial).replace(/\D/g, '').padStart(9, '0').slice(-9);
  }

  const dirMatriz = config.direccion_matriz || '';
  const dirEstablecimiento = config.direccion_establecimiento || dirMatriz;
  const obligadoContabilidad = config.obligado_contabilidad ? 'SI' : 'NO';
  const contribuyenteEspecial = config.contribuyente_especial || '';

  const fechaEmision = fechaSRI(venta.fecha_emision);
  const tipoIdComprador = codigoTipoIdentificacion(cliente?.ruc);
  const razonSocialComprador = cliente?.nombre || 'CONSUMIDOR FINAL';
  const identificacionComprador = (cliente?.ruc || '9999999999999').toString().trim();
  const moneda = 'DOLAR';

  const detalles = venta.detalles || [];

  const gruposIVA = {};
  let totalSinImpuestos = 0;
  let totalDescuento = 0;

  const detallesCalculados = detalles.map(d => {
    const cantidad = parseFloat(d.cantidad) || 0;
    const precioUnit = parseFloat(d.precio_unitario || d.costo_unitario) || 0;
    const descuento = parseFloat(d.descuento) || 0;
    const precioTotal = cantidad * precioUnit - descuento;

    const aplicaIVA = d.aplica_iva !== false;
    const tarifaIva = d.tarifa_iva !== undefined ? d.tarifa_iva : 15;
    const ivaInfo = infoIVA(aplicaIVA, tarifaIva);
    const valorIVA = +(precioTotal * (ivaInfo.porcentaje / 100)).toFixed(2);

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

  Object.values(gruposIVA).forEach(g => {
    g.baseImponible = +g.baseImponible.toFixed(2);
    g.valor = +g.valor.toFixed(2);
  });

  const totalIVA = Object.values(gruposIVA)
    .filter(g => g.codigoPorcentaje !== '0')
    .reduce((s, g) => s + g.valor, 0);

  const importeTotal = +(totalSinImpuestos + totalIVA).toFixed(2);
  const formaPago = venta.forma_pago || '01';

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

  // ============================================================
  // FACTURA
  // ============================================================
  function generarFactura() {
    let x = '';
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

    x += '    <totalConImpuestos>\n';
    const gruposOrdenados = Object.values(gruposIVA).sort((a, b) =>
      a.codigoPorcentaje.localeCompare(b.codigoPorcentaje)
    );
    gruposOrdenados.forEach(g => {
      x += '      <totalImpuesto>\n';
      x += `        <codigo>${esc(g.codigo)}</codigo>\n`;
      x += `        <codigoPorcentaje>${esc(g.codigoPorcentaje)}</codigoPorcentaje>\n`;
      x += `        <baseImponible>${num(g.baseImponible)}</baseImponible>\n`;
      x += `        <valor>${num(g.valor)}</valor>\n`;
      x += '      </totalImpuesto>\n';
    });
    x += '    </totalConImpuestos>\n';

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
      const codigo = d.codigo || d.productoId?.toString() || `ITEM${idx + 1}`;
      const descripcion = d.nombre || d.descripcion || d.nombre_producto || 'PRODUCTO';

      x += '    <detalle>\n';
      x += `      <codigoPrincipal>${esc(codigo)}</codigoPrincipal>\n`;
      if (d.codigo_auxiliar) {
        x += `      <codigoAuxiliar>${esc(d.codigo_auxiliar)}</codigoAuxiliar>\n`;
      }
      x += `      <descripcion>${esc(descripcion)}</descripcion>\n`;
      x += `      <cantidad>${num6(cantidad)}</cantidad>\n`;
      x += `      <precioUnitario>${num(precioUnit)}</precioUnitario>\n`;
      x += `      <descuento>${num(descuento)}</descuento>\n`;
      x += `      <precioTotalSinImpuesto>${num(precioTotal)}</precioTotalSinImpuesto>\n`;
      x += '      <impuestos>\n';
      x += '        <impuesto>\n';
      x += `          <codigo>${esc(ivaInfo.codigo)}</codigo>\n`;
      x += `          <codigoPorcentaje>${esc(ivaInfo.codigoPorcentaje)}</codigoPorcentaje>\n`;
      x += `          <tarifa>${esc(ivaInfo.tarifa)}</tarifa>\n`;
      x += `          <baseImponible>${num(precioTotal)}</baseImponible>\n`;
      x += `          <valor>${num(valorIVA)}</valor>\n`;
      x += '        </impuesto>\n';
      x += '      </impuestos>\n';
      x += '    </detalle>\n';
    });
    x += '  </detalles>\n';

    const adicionales = [];
    if (cliente?.email) adicionales.push(['Email', cliente.email]);
    if (cliente?.telefono) adicionales.push(['Telefono', cliente.telefono]);
    if (cliente?.direccion) adicionales.push(['Direccion', cliente.direccion]);
    if (venta.observaciones) adicionales.push(['Observaciones', venta.observaciones]);
    if (venta.forma_pago === '20') adicionales.push(['FormaPago', 'Otros con sistema financiero']);

    if (adicionales.length > 0) {
      x += '  <infoAdicional>\n';
      adicionales.forEach(([nombre, valor]) => {
        x += `    <campoAdicional nombre="${esc(nombre)}">${esc(valor)}</campoAdicional>\n`;
      });
      x += '  </infoAdicional>\n';
    }

    x += '</factura>';
    return x;
  }

  // ============================================================
  // NOTA DE CRÉDITO
  // ============================================================
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
    if (contribuyenteEspecial) {
      x += `    <contribuyenteEspecial>${esc(contribuyenteEspecial)}</contribuyenteEspecial>\n`;
    }
    x += `    <obligadoContabilidad>${esc(obligadoContabilidad)}</obligadoContabilidad>\n`;
    x += `    <codDocModificado>01</codDocModificado>\n`;
    x += `    <numDocModificado>${esc(venta.numero_factura_modificada || venta.numero_factura || '')}</numDocModificado>\n`;
    x += `    <fechaEmisionDocSustento>${esc(fechaEmision)}</fechaEmisionDocSustento>\n`;
    x += `    <totalSinImpuestos>${num(totalSinImpuestos)}</totalSinImpuestos>\n`;
    x += `    <valorModificacion>${num(importeTotal)}</valorModificacion>\n`;
    x += `    <moneda>${esc(moneda)}</moneda>\n`;

    x += '    <totalConImpuestos>\n';
    Object.values(gruposIVA)
      .sort((a, b) => a.codigoPorcentaje.localeCompare(b.codigoPorcentaje))
      .forEach(g => {
        x += '      <totalImpuesto>\n';
        x += `        <codigo>${esc(g.codigo)}</codigo>\n`;
        x += `        <codigoPorcentaje>${esc(g.codigoPorcentaje)}</codigoPorcentaje>\n`;
        x += `        <baseImponible>${num(g.baseImponible)}</baseImponible>\n`;
        x += `        <valor>${num(g.valor)}</valor>\n`;
        x += '      </totalImpuesto>\n';
      });
    x += '    </totalConImpuestos>\n';

    x += `    <motivo>${esc(venta.motivo || 'DEVOLUCION')}</motivo>\n`;
    x += '  </infoNotaCredito>\n';

    x += '  <detalles>\n';
    detallesCalculados.forEach((item, idx) => {
      const { d, cantidad, precioUnit, descuento, precioTotal, ivaInfo, valorIVA } = item;
      x += '    <detalle>\n';
      x += `      <codigoInterno>${esc(d.codigo || `ITEM${idx + 1}`)}</codigoInterno>\n`;
      x += `      <descripcion>${esc(d.nombre || d.descripcion || 'PRODUCTO')}</descripcion>\n`;
      x += `      <cantidad>${num6(cantidad)}</cantidad>\n`;
      x += `      <precioUnitario>${num(precioUnit)}</precioUnitario>\n`;
      x += `      <descuento>${num(descuento)}</descuento>\n`;
      x += `      <precioTotalSinImpuesto>${num(precioTotal)}</precioTotalSinImpuesto>\n`;
      x += '      <impuestos>\n';
      x += '        <impuesto>\n';
      x += `          <codigo>${esc(ivaInfo.codigo)}</codigo>\n`;
      x += `          <codigoPorcentaje>${esc(ivaInfo.codigoPorcentaje)}</codigoPorcentaje>\n`;
      x += `          <tarifa>${esc(ivaInfo.tarifa)}</tarifa>\n`;
      x += `          <baseImponible>${num(precioTotal)}</baseImponible>\n`;
      x += `          <valor>${num(valorIVA)}</valor>\n`;
      x += '        </impuesto>\n';
      x += '      </impuestos>\n';
      x += '    </detalle>\n';
    });
    x += '  </detalles>\n';

    if (cliente?.email || cliente?.direccion) {
      x += '  <infoAdicional>\n';
      if (cliente?.email) x += `    <campoAdicional nombre="Email">${esc(cliente.email)}</campoAdicional>\n`;
      if (cliente?.direccion) x += `    <campoAdicional nombre="Direccion">${esc(cliente.direccion)}</campoAdicional>\n`;
      x += '  </infoAdicional>\n';
    }

    x += '</notaCredito>';
    return x;
  }

  // ============================================================
  // GUÍA DE REMISIÓN
  // ============================================================
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

    const fechaIni = venta.inicio_transporte ? fechaSRI(venta.inicio_transporte) : fechaEmision;
    const fechaFin = venta.fin_transporte ? fechaSRI(venta.fin_transporte) : fechaEmision;

    x += '  <infoGuiaRemision>\n';
    x += `    <dirEstablecimiento>${esc(dirEstablecimiento)}</dirEstablecimiento>\n`;
    x += `    <dirPartida>${esc(venta.direccion_partida || '')}</dirPartida>\n`;
    x += `    <razonSocialTransportista>${esc(venta.transportista_razon_social || '')}</razonSocialTransportista>\n`;
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
    x += `      <razonSocialDestinatario>${esc(venta.destinatario_razon_social || razonSocialComprador)}</razonSocialDestinatario>\n`;
    x += `      <dirDestinatario>${esc(venta.destinatario_direccion || '')}</dirDestinatario>\n`;
    x += `      <motivoTraslado>${esc(venta.motivo || 'VENTA')}</motivoTraslado>\n`;
    if (venta.documento_aduana) {
      x += `      <docAduaneroUnico>${esc(venta.documento_aduana)}</docAduaneroUnico>\n`;
    }
    if (venta.ruta) {
      x += `      <ruta>${esc(venta.ruta)}</ruta>\n`;
    }
    if (venta.codigo_establecimiento_destino) {
      x += `      <codEstabDestino>${esc(venta.codigo_establecimiento_destino)}</codEstabDestino>\n`;
    }
    x += '      <detalles>\n';
    detallesCalculados.forEach(item => {
      const d = item.d;
      x += '        <detalle>\n';
      x += `          <codigoInterno>${esc(d.codigo || '')}</codigoInterno>\n`;
      if (d.codigo_auxiliar) {
        x += `          <codigoAdicional>${esc(d.codigo_auxiliar)}</codigoAdicional>\n`;
      }
      x += `          <descripcion>${esc(d.nombre || d.descripcion || 'PRODUCTO')}</descripcion>\n`;
      x += `          <cantidad>${num6(item.cantidad)}</cantidad>\n`;
      x += '        </detalle>\n';
    });
    x += '      </detalles>\n';
    x += '    </destinatario>\n';
    x += '  </destinatarios>\n';

    x += '</guiaRemision>';
    return x;
  }

  // ============================================================
  // COMPROBANTE DE RETENCIÓN
  // ============================================================
  function generarRetencion() {
    // El SRI exige codDocSustento/numDocSustento/fechaEmisionDocSustento
    // en CADA <impuesto>. Si el caller no los trae, usamos los del comprobante
    // modificado (comprobante_documento / comprobante_numero / fecha_emision).
    const codDocSustentoDefault = venta.comprobante_documento || '01';
    const numDocSustentoDefault = venta.comprobante_numero || venta.numero_factura_modificada || '';
    const fechaDocSustentoDefault = venta.comprobante_fecha_emision || fechaEmision;

    const impuestosRetencionRaw = Array.isArray(venta.impuestos_retencion)
      ? venta.impuestos_retencion
      : [{
          codigo: venta.tipo_impuesto || '1',
          codigoRetencion: venta.tipo_retencion || '312',
          baseImponible: venta.subtotal || 0,
          porcentajeRetener: venta.porcentaje_retencion || 0,
          valorRetenido: venta.retencion_valor || 0
        }];

    const impuestosRetencion = impuestosRetencionRaw.map(imp => ({
      codigo: imp.codigo || '1',
      codigoRetencion: imp.codigoRetencion || imp.tipo_retencion || '312',
      baseImponible: imp.baseImponible || 0,
      porcentajeRetener: imp.porcentajeRetener ?? imp.porcentaje ?? 0,
      valorRetenido: imp.valorRetenido ?? imp.valor_retenido ?? 0,
      codDocSustento: imp.codDocSustento || codDocSustentoDefault,
      numDocSustento: imp.numDocSustento || numDocSustentoDefault,
      fechaEmisionDocSustento: imp.fechaEmisionDocSustento || fechaDocSustentoDefault
    }));

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

    if (cliente?.email || venta.observaciones) {
      x += '  <infoAdicional>\n';
      if (cliente?.email) x += `    <campoAdicional nombre="Email">${esc(cliente.email)}</campoAdicional>\n`;
      if (venta.observaciones) x += `    <campoAdicional nombre="Observaciones">${esc(venta.observaciones)}</campoAdicional>\n`;
      x += '  </infoAdicional>\n';
    }

    x += '</comprobanteRetencion>';
    return x;
  }
}

module.exports = {
  generarXMLComprobante,
  esc,
  num,
  num6,
  fechaSRI,
  periodoFiscal,
  codigoTipoIdentificacion,
  infoIVA,
  CODIGOS_IVA
};