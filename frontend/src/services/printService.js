// Servicio centralizado para imprimir documentos
export const printService = {
  /**
   * Imprime un documento (factura, guía, etc.)
   * @param {Object} doc - Datos del documento
   * @param {string} formato - 'A4', 'A2', 'ticket'
   * @param {Function} obtenerNombreProducto - Función para resolver nombres de productos
   */
  printDocument(doc, formato = 'A4', obtenerNombreProducto = (id) => 'Producto') {
    // Generar HTML
    const html = this.generarHTML(doc, formato, obtenerNombreProducto)
    const titulo = `Documento ${doc.numero_factura || doc.numero_guia || 'Sin número'}`

    const ventana = window.open('', '_blank', 'width=800,height=600')
    if (!ventana) {
      alert('Por favor, permita ventanas emergentes para imprimir')
      return
    }

    ventana.document.write(html)
    ventana.document.close()
    ventana.focus()
    // La impresión se dispara automáticamente al cargar (ver script al final del HTML)
  },

  generarHTML(doc, formato, obtenerNombreProducto) {
    const esVenta = doc.cliente !== null
    const nombreCliente = esVenta ? doc.cliente?.nombre || 'Cliente N/A' : doc.proveedor?.nombre || 'Proveedor N/A'
    const tipoDoc = doc.tipo_documento || 'Factura'
    const total = (doc.total || 0).toFixed(2)
    const subtotal = (doc.subtotal || 0).toFixed(2)
    const iva = (doc.iva || 0).toFixed(2)
    const fecha = new Date(doc.fecha_emision).toLocaleDateString()
    const numero = doc.numero_factura || 'N/A'

    let ancho = '210mm'
    let padding = '20mm'
    let fontSize = '14px'
    if (formato === 'A2') {
      ancho = '420mm'
      padding = '20mm'
      fontSize = '18px'
    } else if (formato === 'ticket') {
      ancho = '80mm'
      padding = '10mm'
      fontSize = '12px'
    }

    let detallesHtml = ''
    if (doc.detalles && doc.detalles.length > 0) {
      detallesHtml = `
        <table style="width:100%; border-collapse:collapse; margin-top:10px;">
          <thead>
            <tr style="background:#f2f2f2;">
              <th style="border:1px solid #ddd; padding:8px; text-align:left;">Producto</th>
              <th style="border:1px solid #ddd; padding:8px; text-align:center;">Cant.</th>
              <th style="border:1px solid #ddd; padding:8px; text-align:right;">Precio</th>
              <th style="border:1px solid #ddd; padding:8px; text-align:right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${doc.detalles.map(d => `
              <tr>
                <td style="border:1px solid #ddd; padding:8px;">${obtenerNombreProducto(d.productoId)}</td>
                <td style="border:1px solid #ddd; padding:8px; text-align:center;">${d.cantidad || 0}</td>
                <td style="border:1px solid #ddd; padding:8px; text-align:right;">$${(d.precio_unitario || 0).toFixed(2)}</td>
                <td style="border:1px solid #ddd; padding:8px; text-align:right;">$${((d.cantidad || 0) * (d.precio_unitario || 0)).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${tipoDoc}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: ${padding}; width: ${ancho}; margin: 0 auto; font-size: ${fontSize}; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .header h1 { margin: 0; font-size: ${formato === 'A2' ? '28px' : '20px'}; }
          .info { margin-bottom: 15px; }
          .info p { margin: 4px 0; }
          .footer { margin-top: 20px; text-align: center; font-size: ${formato === 'ticket' ? '10px' : '12px'}; border-top: 1px solid #ccc; padding-top: 10px; }
          @media print { body { margin: 0; padding: ${padding}; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Sistema Contable</h1>
          <p><strong>${tipoDoc}</strong></p>
        </div>
        <div class="info">
          <p><strong>Nº Documento:</strong> ${numero}</p>
          <p><strong>Fecha:</strong> ${fecha}</p>
          <p><strong>${esVenta ? 'Cliente' : 'Proveedor'}:</strong> ${nombreCliente}</p>
        </div>
        ${detallesHtml}
        <div style="margin-top: 15px; text-align: right;">
          <p><strong>Subtotal:</strong> $${subtotal}</p>
          <p><strong>IVA (15%):</strong> $${iva}</p>
          <p><strong>Total:</strong> $${total}</p>
        </div>
        <div class="footer">
          <p>Generado por Sistema Contable</p>
          <p>${formato} - ${new Date().toLocaleString()}</p>
        </div>
        <script>
          window.onload = function() { window.print(); window.close(); }
        <\/script>
      </body>
      </html>
    `
  }
}