// services/printService.js
// Generador de RIDE (Representación Impresa del Documento Electrónico)

export const printService = {
  /**
   * Imprime un documento (factura, guía, etc.)
   * @param {Object} doc - Datos del documento
   * @param {string} formato - 'A4', 'A2', 'ticket'
   * @param {Function} obtenerNombreProducto - Función para resolver nombres de productos
   */
  printDocument(doc, formato = 'A4', obtenerNombreProducto = (id) => 'Producto') {
    const html = this.generarHTML(doc, formato, obtenerNombreProducto)
    const ventana = window.open('', '_blank', 'width=900,height=700')
    if (!ventana) {
      alert('Por favor, permita ventanas emergentes para imprimir')
      return
    }
    ventana.document.write(html)
    ventana.document.close()
    ventana.focus()
  },

  generarHTML(doc, formato, obtenerNombreProducto) {
    const esVenta = !!doc.cliente
    const nombreCliente = esVenta ? (doc.cliente?.nombre || 'Consumidor Final') : (doc.proveedor?.nombre || 'Proveedor N/A')
    const rucCliente = esVenta ? (doc.cliente?.ruc || '9999999999999') : (doc.proveedor?.ruc || '')
    const dirCliente = esVenta ? (doc.cliente?.direccion || '') : (doc.proveedor?.direccion || '')
    const telCliente = esVenta ? (doc.cliente?.telefono || '') : (doc.proveedor?.telefono || '')
    const emailCliente = esVenta ? (doc.cliente?.email || '') : (doc.proveedor?.email || '')

    const tipoDoc = (doc.tipo_documento || 'factura').toUpperCase()
    const numero = doc.numero_factura || doc.numero_guia || 'N/A'
    const fechaEmision = doc.fecha_emision ? new Date(doc.fecha_emision).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
    const claveAcceso = doc.clave_acceso || ''
    const numeroAutorizacion = doc.numero_autorizacion || claveAcceso
    const fechaAutorizacion = doc.fecha_emision ? new Date(doc.fecha_emision).toLocaleString('es-EC') : ''
    const ambiente = doc.ambiente_sri === '2' ? 'PRODUCCIÓN' : 'PRUEBAS'
    const tipoEmision = 'NORMAL'
    const razonSocialEmisor = doc.razon_social_emisor || "System Ozaet's Electronics"
    const rucEmisor = doc.ruc_emisor || '1790012345001'
    const dirMatriz = 'Av. Amazonas N34-451 y Av. Atahualpa, Quito, Ecuador'
    const dirSucursal = 'Av. Amazonas N34-451, Quito'
    const contribuyenteEspecial = ''
    const obligadoContabilidad = 'NO'

    const subtotal = parseFloat(doc.subtotal || 0)
    const iva = parseFloat(doc.iva || 0)
    const total = parseFloat(doc.total || 0)

    // Construir tabla de detalles
    let detallesHtml = ''
    if (doc.detalles && doc.detalles.length > 0) {
      detallesHtml = doc.detalles.map((d, idx) => {
        const cantidad = parseFloat(d.cantidad || 0)
        const precioUnit = parseFloat(d.precio_unitario || d.costo_unitario || 0)
        const descuento = 0
        const subtotalItem = cantidad * precioUnit - descuento
        const aplicaIVA = d.aplica_iva !== false
        const nombreProducto = d.nombre || d.descripcion || obtenerNombreProducto(d.productoId)
        const codigo = d.codigo || ''

        return `
          <tr>
            <td class="text-center">${idx + 1}</td>
            <td>
              <div class="product-name">${nombreProducto}</div>
              ${codigo ? `<div class="product-code">Código: ${codigo}</div>` : ''}
            </td>
            <td class="text-center">${cantidad}</td>
            <td class="text-right">$${precioUnit.toFixed(2)}</td>
            <td class="text-right">$${descuento.toFixed(2)}</td>
            <td class="text-center">${aplicaIVA ? '15%' : '0%'}</td>
            <td class="text-right">$${subtotalItem.toFixed(2)}</td>
          </tr>
        `
      }).join('')
    }

    // Configuración según formato
    let ancho = '210mm'
    let padding = '10mm'
    let fontSize = '11px'
    let formatoClase = 'a4'

    if (formato === 'A2') {
      ancho = '420mm'
      padding = '15mm'
      fontSize = '14px'
      formatoClase = 'a2'
    } else if (formato === 'ticket') {
      ancho = '80mm'
      padding = '4mm'
      fontSize = '10px'
      formatoClase = 'ticket'
    }

    // Generar código de barras simple (código de acceso en formato código barras)
    const barcodeHtml = claveAcceso ? this.generarBarcodeHTML(claveAcceso) : ''

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${tipoDoc} ${numero}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      background: #fff;
      color: #1a1a1a;
      font-size: ${fontSize};
      line-height: 1.4;
    }
    .container {
      width: ${ancho};
      margin: 0 auto;
      padding: ${padding};
      background: #fff;
    }

    /* ============ HEADER ============ */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding-bottom: 12px;
      border-bottom: 3px double #1a3a5c;
      margin-bottom: 12px;
    }
    .header-left {
      flex: 1;
    }
    .header-center {
      flex: 1.3;
      text-align: center;
    }
    .header-right {
      flex: 1;
      text-align: right;
    }

    .logo-empresa {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .logo-icon {
      width: 44px;
      height: 44px;
      background: #1a3a5c;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #f1c40f;
      font-size: 24px;
      font-weight: 800;
    }
    .empresa-nombre {
      font-size: 1.15em;
      font-weight: 800;
      color: #1a3a5c;
      line-height: 1.1;
    }
    .empresa-sub {
      font-size: 0.75em;
      color: #666;
    }
    .empresa-info {
      font-size: 0.82em;
      color: #333;
      margin-top: 8px;
    }
    .empresa-info div {
      margin: 2px 0;
    }

    .doc-tipo {
      display: inline-block;
      padding: 8px 20px;
      background: #1a3a5c;
      color: #fff;
      border-radius: 6px;
      font-size: 1.1em;
      font-weight: 800;
      letter-spacing: 1.5px;
      margin-bottom: 6px;
    }
    .doc-numero {
      font-size: 1.05em;
      font-weight: 700;
      color: #c0392b;
      margin-bottom: 4px;
    }
    .doc-meta {
      font-size: 0.75em;
      color: #555;
    }
    .doc-meta strong {
      color: #1a3a5c;
    }

    /* ============ AMBIENTE BADGE ============ */
    .ambiente-badge {
      display: inline-block;
      padding: 4px 12px;
      background: ${ambiente === 'PRODUCCIÓN' ? '#27ae60' : '#e67e22'};
      color: #fff;
      border-radius: 20px;
      font-size: 0.7em;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }

    /* ============ CLAVE DE ACCESO ============ */
    .clave-section {
      display: flex;
      gap: 15px;
      align-items: flex-start;
      padding: 10px 12px;
      background: #f8f9fa;
      border-left: 4px solid #1a3a5c;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .clave-left {
      flex: 1;
      min-width: 0;
    }
    .clave-label {
      font-size: 0.7em;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .clave-valor {
      font-family: 'Courier New', monospace;
      font-size: 0.72em;
      color: #1a3a5c;
      font-weight: 700;
      word-break: break-all;
      line-height: 1.3;
      margin-bottom: 6px;
    }
    .autorizacion-info {
      font-size: 0.7em;
      color: #555;
      line-height: 1.5;
    }
    .autorizacion-info strong {
      color: #1a3a5c;
    }
    .barcode-container {
      flex-shrink: 0;
      text-align: center;
    }
    .barcode-svg {
      height: 45px;
      width: auto;
    }
    .barcode-numero {
      font-family: 'Courier New', monospace;
      font-size: 0.55em;
      color: #333;
      margin-top: 2px;
      letter-spacing: -0.5px;
    }

    /* ============ INFO CLIENTE ============ */
    .cliente-section {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
    }
    .cliente-box {
      flex: 1;
      padding: 10px 12px;
      border: 1px solid #d5dbe0;
      border-radius: 6px;
      background: #fafbfc;
    }
    .cliente-box-title {
      font-size: 0.7em;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px dashed #d5dbe0;
    }
    .cliente-row {
      display: flex;
      font-size: 0.78em;
      margin: 3px 0;
      line-height: 1.3;
    }
    .cliente-row-label {
      min-width: 80px;
      color: #666;
      font-weight: 600;
    }
    .cliente-row-value {
      flex: 1;
      color: #1a1a1a;
      font-weight: 500;
    }

    /* ============ TABLA DETALLES ============ */
    .detalles-section {
      margin-bottom: 12px;
    }
    .detalles-title {
      font-size: 0.75em;
      font-weight: 700;
      color: #1a3a5c;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 6px 0;
      border-bottom: 2px solid #1a3a5c;
      margin-bottom: 0;
    }
    .detalles-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      font-size: 0.82em;
    }
    .detalles-table thead {
      background: #1a3a5c;
      color: #fff;
    }
    .detalles-table thead th {
      padding: 7px 6px;
      text-align: left;
      font-weight: 600;
      font-size: 0.72em;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      border: none;
    }
    .detalles-table thead th.text-center { text-align: center; }
    .detalles-table thead th.text-right { text-align: right; }
    .detalles-table tbody td {
      padding: 8px 6px;
      border-bottom: 1px solid #e9ecef;
      vertical-align: top;
    }
    .detalles-table tbody tr:nth-child(even) {
      background: #f8f9fa;
    }
    .detalles-table .text-center { text-align: center; }
    .detalles-table .text-right { text-align: right; }
    .product-name {
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 2px;
    }
    .product-code {
      font-size: 0.85em;
      color: #888;
      font-family: 'Courier New', monospace;
    }

    /* ============ TOTALES ============ */
    .totales-section {
      display: flex;
      justify-content: flex-end;
      margin-top: 12px;
      margin-bottom: 12px;
    }
    .totales-box {
      width: 100%;
      max-width: 320px;
      border: 1px solid #d5dbe0;
      border-radius: 6px;
      overflow: hidden;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 14px;
      font-size: 0.85em;
      border-bottom: 1px solid #e9ecef;
    }
    .total-row:last-child {
      border-bottom: none;
    }
    .total-row .label {
      color: #555;
      font-weight: 500;
    }
    .total-row .value {
      color: #1a1a1a;
      font-weight: 600;
      font-family: 'Courier New', monospace;
    }
    .total-final {
      display: flex;
      justify-content: space-between;
      padding: 12px 14px;
      background: #1a3a5c;
      color: #fff;
      font-size: 1.05em;
      font-weight: 800;
    }
    .total-final .label {
      letter-spacing: 0.5px;
    }
    .total-final .value {
      font-family: 'Courier New', monospace;
    }

    /* ============ INFO ADICIONAL ============ */
    .info-adicional {
      padding: 10px 12px;
      background: #f8f9fa;
      border-radius: 6px;
      margin-bottom: 12px;
      font-size: 0.78em;
    }
    .info-adicional-title {
      font-size: 0.7em;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .info-adicional div {
      margin: 2px 0;
    }

    /* ============ FOOTER ============ */
    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 2px solid #1a3a5c;
      text-align: center;
      font-size: 0.72em;
      color: #666;
      line-height: 1.6;
    }
    .footer strong {
      color: #1a3a5c;
    }
    .firma-section {
      margin-top: 30px;
      display: flex;
      justify-content: space-around;
      gap: 40px;
    }
    .firma-box {
      flex: 1;
      text-align: center;
    }
    .firma-line {
      border-top: 1px solid #1a1a1a;
      margin: 40px 20px 6px;
    }
    .firma-label {
      font-size: 0.75em;
      color: #555;
    }

    /* ============ TICKET (formatos pequeños) ============ */
    .ticket .header {
      flex-direction: column;
      align-items: stretch;
      text-align: center;
      gap: 8px;
    }
    .ticket .header-left,
    .ticket .header-center,
    .ticket .header-right {
      text-align: center;
    }
    .ticket .clave-section {
      flex-direction: column;
      gap: 8px;
      text-align: center;
    }
    .ticket .barcode-container {
      text-align: center;
    }
    .ticket .cliente-section {
      flex-direction: column;
    }
    .ticket .detalles-table {
      font-size: 0.75em;
    }
    .ticket .detalles-table thead th {
      font-size: 0.7em;
      padding: 4px 2px;
    }
    .ticket .detalles-table tbody td {
      padding: 5px 2px;
    }
    .ticket .totales-box {
      max-width: 100%;
    }

    /* ============ IMPRESIÓN ============ */
    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .container {
        width: 100%;
        padding: ${padding};
      }
      .no-print {
        display: none !important;
      }
      .header {
        page-break-inside: avoid;
      }
      .detalles-table {
        page-break-inside: auto;
      }
      .detalles-table tr {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container ${formatoClase}">
    <!-- ============ HEADER ============ -->
    <div class="header">
      <div class="header-left">
        <div class="logo-empresa">
          <div class="logo-icon">S</div>
          <div>
            <div class="empresa-nombre">${razonSocialEmisor}</div>
            <div class="empresa-sub">Sistema Contable</div>
          </div>
        </div>
        <div class="empresa-info">
          <div><strong>RUC:</strong> ${rucEmisor}</div>
          <div><strong>Dir. Matriz:</strong> ${dirMatriz}</div>
          <div><strong>Dir. Sucursal:</strong> ${dirSucursal}</div>
        </div>
      </div>

      <div class="header-center">
        <div class="doc-tipo">${tipoDoc}</div>
        <div class="doc-numero">Nº ${numero}</div>
        <div class="doc-meta">
          <div><strong>Fecha Emisión:</strong> ${fechaEmision}</div>
        </div>
        <div class="ambiente-badge">
          ${ambiente === 'PRODUCCIÓN' ? '● PRODUCCIÓN' : '● AMBIENTE DE PRUEBAS'}
        </div>
      </div>

      <div class="header-right">
        <div class="empresa-info">
          <div><strong>Obligado a llevar contabilidad:</strong> ${obligadoContabilidad}</div>
          ${contribuyenteEspecial ? `<div><strong>Contrib. Especial:</strong> ${contribuyenteEspecial}</div>` : ''}
          <div><strong>Tipo Emisión:</strong> ${tipoEmision}</div>
          <div><strong>Moneda:</strong> DÓLAR</div>
        </div>
      </div>
    </div>

    <!-- ============ CLAVE DE ACCESO ============ -->
    ${claveAcceso ? `
    <div class="clave-section">
      <div class="clave-left">
        <div class="clave-label">Clave de Acceso</div>
        <div class="clave-valor">${claveAcceso}</div>
        <div class="autorizacion-info">
          <div><strong>Nº Autorización:</strong> ${numeroAutorizacion}</div>
          <div><strong>Fecha Autorización:</strong> ${fechaAutorizacion}</div>
        </div>
      </div>
      <div class="barcode-container">
        ${barcodeHtml}
        <div class="barcode-numero">${claveAcceso}</div>
      </div>
    </div>
    ` : ''}

    <!-- ============ INFO CLIENTE ============ -->
    <div class="cliente-section">
      <div class="cliente-box">
        <div class="cliente-box-title">${esVenta ? 'Datos del Cliente' : 'Datos del Proveedor'}</div>
        <div class="cliente-row">
          <span class="cliente-row-label">Razón Social:</span>
          <span class="cliente-row-value">${nombreCliente}</span>
        </div>
        <div class="cliente-row">
          <span class="cliente-row-label">RUC/Cédula:</span>
          <span class="cliente-row-value">${rucCliente}</span>
        </div>
        ${dirCliente ? `
        <div class="cliente-row">
          <span class="cliente-row-label">Dirección:</span>
          <span class="cliente-row-value">${dirCliente}</span>
        </div>
        ` : ''}
      </div>

      <div class="cliente-box">
        <div class="cliente-box-title">Datos de Contacto</div>
        ${telCliente ? `
        <div class="cliente-row">
          <span class="cliente-row-label">Teléfono:</span>
          <span class="cliente-row-value">${telCliente}</span>
        </div>
        ` : ''}
        ${emailCliente ? `
        <div class="cliente-row">
          <span class="cliente-row-label">Email:</span>
          <span class="cliente-row-value">${emailCliente}</span>
        </div>
        ` : ''}
        <div class="cliente-row">
          <span class="cliente-row-label">Forma Pago:</span>
          <span class="cliente-row-value">${doc.forma_pago || 'Sin sistema financiero'}</span>
        </div>
        <div class="cliente-row">
          <span class="cliente-row-label">Estado:</span>
          <span class="cliente-row-value">${(doc.estado_pago || 'pendiente').toUpperCase()}</span>
        </div>
      </div>
    </div>

    <!-- ============ DETALLES ============ -->
    <div class="detalles-section">
      <div class="detalles-title">Detalle de Productos y Servicios</div>
      <table class="detalles-table">
        <thead>
          <tr>
            <th style="width:30px;" class="text-center">#</th>
            <th>Descripción</th>
            <th style="width:70px;" class="text-center">Cant.</th>
            <th style="width:80px;" class="text-right">P. Unit.</th>
            <th style="width:70px;" class="text-right">Desc.</th>
            <th style="width:60px;" class="text-center">IVA</th>
            <th style="width:90px;" class="text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${detallesHtml || `<tr><td colspan="7" class="text-center" style="padding:20px;color:#888;">Sin detalles registrados</td></tr>`}
        </tbody>
      </table>
    </div>

    <!-- ============ TOTALES ============ -->
    <div class="totales-section">
      <div class="totales-box">
        <div class="total-row">
          <span class="label">Subtotal</span>
          <span class="value">$${subtotal.toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span class="label">IVA 15%</span>
          <span class="value">$${iva.toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span class="label">Descuento</span>
          <span class="value">$0.00</span>
        </div>
        <div class="total-final">
          <span class="label">TOTAL A PAGAR</span>
          <span class="value">$${total.toFixed(2)}</span>
        </div>
      </div>
    </div>

    <!-- ============ INFO ADICIONAL ============ -->
    ${doc.observaciones ? `
    <div class="info-adicional">
      <div class="info-adicional-title">Información Adicional</div>
      <div>${doc.observaciones}</div>
    </div>
    ` : ''}

    <!-- ============ FIRMAS ============ -->
    <div class="firma-section">
      <div class="firma-box">
        <div class="firma-line"></div>
        <div class="firma-label">Firma del Cliente</div>
      </div>
      <div class="firma-box">
        <div class="firma-line"></div>
        <div class="firma-label">${razonSocialEmisor}</div>
      </div>
    </div>

    <!-- ============ FOOTER ============ -->
    <div class="footer">
      <div><strong>Documento generado por Sistema Contable</strong></div>
      <div>${razonSocialEmisor} — RUC: ${rucEmisor}</div>
      <div>Formato: ${formato} | Generado: ${new Date().toLocaleString('es-EC')}</div>
      ${claveAcceso ? `<div style="margin-top:6px;font-size:0.9em;">Este documento es una representación impresa de un comprobante electrónico autorizado por el SRI</div>` : ''}
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
        window.onafterprint = function() { window.close(); }
      }, 300);
    }
  <\/script>
</body>
</html>`
  },

  /**
   * Genera un código de barras en formato Code128 (simulado con HTML/CSS)
   * Para producción se recomienda usar una librería real como JsBarcode
   */
  generarBarcodeHTML(texto) {
    // Convertir cada caracter en un patrón de barras simple
    const barras = []
    for (let i = 0; i < texto.length; i++) {
      const charCode = texto.charCodeAt(i)
      // Generar 4 barras de ancho variable por cada carácter
      const w1 = (charCode % 4) + 1
      const w2 = ((charCode >> 2) % 4) + 1
      const w3 = ((charCode >> 4) % 3) + 1
      const w4 = ((charCode >> 6) % 3) + 1
      barras.push(w1, w2, w3, w4)
    }

    let svg = `<svg class="barcode-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${barras.reduce((a, b) => a + b, 0) + barras.length * 2} 60" preserveAspectRatio="none">`
    let x = 0
    let black = true
    for (let i = 0; i < barras.length; i++) {
      const w = barras[i]
      if (black) {
        svg += `<rect x="${x}" y="0" width="${w}" height="60" fill="#1a1a1a" />`
      }
      x += w + 1
      black = !black
    }
    svg += `</svg>`
    return svg
  }
}