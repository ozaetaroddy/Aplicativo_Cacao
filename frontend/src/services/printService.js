// frontend/src/services/printService.js
// ============================================================
// Generador de RIDE (Representación Impresa del Documento Electrónico)
// ------------------------------------------------------------
// Incluye:
//   - Generador de código de barras Code128 subset C (SRI usa solo dígitos)
//   - Escape HTML en TODOS los valores dinámicos (previene XSS)
//   - Impresión robusta vía <iframe> oculto (sin popup blockers)
//   - Espera `document.fonts.ready` antes de imprimir
//   - Soporte A4 / A2 / Ticket 80mm
//   - Layout específico para GUÍA DE REMISIÓN
//
// 🔧 FIX 2025-XX:
//   1. Detección de tipo `guia_remision` → layout con 3 secciones:
//      destinatario + transportista + traslado. Antes caía al
//      fallback "Consumidor Final" porque las guías no tienen
//      `clienteId`.
//   2. `printDocument` usa un <iframe> oculto en lugar de window.open().
//   3. `@page size` con valores válidos de CSS Paged Media.
// ============================================================
'use strict'

// ============================================================
// CÓDIGO DE BARRAS (Code128 subset C)
// ============================================================
const CODE128_PATTERNS = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011'
]

const CODE128_START_C = 105
const CODE128_STOP = 106

function generarBitsCode128C(data) {
  const str = String(data ?? '')
  if (!/^\d+$/.test(str)) throw new Error('Code128C solo acepta dígitos')

  const normalizada = str.length % 2 !== 0 ? '0' + str : str
  const symbols = [CODE128_START_C]
  for (let i = 0; i < normalizada.length; i += 2) {
    symbols.push(parseInt(normalizada.substr(i, 2), 10))
  }

  let checksum = CODE128_START_C
  for (let i = 1; i < symbols.length; i++) checksum += symbols[i] * i
  checksum %= 103
  symbols.push(checksum)
  symbols.push(CODE128_STOP)

  let bits = ''
  for (const sym of symbols) bits += CODE128_PATTERNS[sym]
  return bits
}

function generarBarcodeSVG(texto, formato = 'A4', maxHeight = 45) {
  if (!texto) return ''

  let dataBarcode = String(texto)
  if (formato === 'ticket' && dataBarcode.length > 30) {
    dataBarcode = dataBarcode.slice(-22)
  }

  try {
    const bits = generarBitsCode128C(dataBarcode)
    const quietZone = 10
    const height = 60
    const totalWidth = bits.length + quietZone * 2

    let svg =
      `<svg class="barcode-svg" xmlns="http://www.w3.org/2000/svg" ` +
      `viewBox="0 0 ${totalWidth} ${height}" ` +
      `preserveAspectRatio="xMidYMid meet" ` +
      `shape-rendering="crispEdges" ` +
      `style="width: 100%; height: ${Number(maxHeight) || 45}px; display: block;">`
    svg += `<rect x="0" y="0" width="${totalWidth}" height="${height}" fill="#ffffff"/>`

    let x = quietZone
    let i = 0
    while (i < bits.length) {
      if (bits[i] === '1') {
        let w = 0
        while (i < bits.length && bits[i] === '1') { w++; i++ }
        svg += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#1a1a1a"/>`
        x += w
      } else {
        let w = 0
        while (i < bits.length && bits[i] === '0') { w++; i++ }
        x += w
      }
    }
    svg += '</svg>'
    return svg
  } catch (e) {
    console.error('Error generando código de barras:', e?.message || e)
    return `<div style="font-size: 0.7em; color: #888; text-align: center;">[Código de barras no disponible]</div>`
  }
}

// ============================================================
// HELPERS DE SEGURIDAD
// ============================================================
function escHtml(v) {
  if (v === null || v === undefined) return ''
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escAttr(v) {
  if (v === null || v === undefined) return ''
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, ' ')
}

function n2(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

function n2m(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0.00'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtFecha(f) {
  if (!f) return ''
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })
  } catch { return '' }
}

function fmtFechaHora(f) {
  if (!f) return ''
  try {
    return new Date(f).toLocaleString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch { return '' }
}

function getTipoIdentLabel(codigo) {
  const s = String(codigo || '').trim()
  return (
    {
      '04': 'RUC',
      '05': 'Cédula',
      '06': 'Pasaporte',
      '07': 'Consumidor Final',
      '08': 'Identificación Exterior',
      '09': 'Placa'
    }[s] || s || '—'
  )
}

// ============================================================
// IMPRESIÓN VÍA IFRAME
// ============================================================
function imprimirViaIframe(html) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('data-print-iframe', '1')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.visibility = 'hidden'
  iframe.style.pointerEvents = 'none'
  document.body.appendChild(iframe)

  const limpiar = () => {
    try { if (iframe.parentNode) iframe.parentNode.removeChild(iframe) } catch { /* noop */ }
  }

  const timeoutDuro = setTimeout(limpiar, 60_000)

  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open()
    doc.write(html)
    doc.close()

    const esperarListo = () => {
      const d = iframe.contentDocument || iframe.contentWindow.document
      if (!d || d.readyState !== 'complete') {
        setTimeout(esperarListo, 50)
        return
      }

      const fw = iframe.contentWindow
      const fuentesReady = (fw.document && fw.document.fonts && fw.document.fonts.ready)
        ? fw.document.fonts.ready
        : Promise.resolve()

      fuentesReady.then(() => {
        setTimeout(() => {
          try {
            fw.focus()
            fw.print()
          } catch (e) {
            console.error('Error al imprimir:', e?.message || e)
            alert('No se pudo abrir el diálogo de impresión.')
          } finally {
            clearTimeout(timeoutDuro)
            const limpiarDespues = () => {
              setTimeout(() => {
                clearTimeout(timeoutDuro)
                limpiar()
              }, 300)
            }
            try {
              fw.addEventListener('afterprint', limpiarDespues, { once: true })
            } catch { /* noop */ }
            setTimeout(limpiar, 30_000)
          }
        }, 250)
      }).catch(() => {
        try { fw.print() } catch { /* noop */ }
        clearTimeout(timeoutDuro)
        setTimeout(limpiar, 1000)
      })
    }

    esperarListo()
  } catch (e) {
    console.error('Error preparando iframe de impresión:', e?.message || e)
    clearTimeout(timeoutDuro)
    limpiar()
    alert('No se pudo preparar la impresión.')
  }
}

// ============================================================
// SERVICIO DE IMPRESIÓN
// ============================================================
export const printService = {
  printDocument(doc, formato = 'A4', obtenerNombreProducto = () => 'Producto') {
    if (!doc) {
      console.warn('printDocument: doc vacío')
      return
    }

    let html
    try {
      html = this.generarHTML(doc, formato, obtenerNombreProducto)
    } catch (e) {
      console.error('Error generando HTML del RIDE:', e?.message || e)
      alert('No se pudo generar el documento para imprimir')
      return
    }

    imprimirViaIframe(html)
  },

  generarHTML(doc, formato = 'A4', obtenerNombreProducto = () => 'Producto') {
    if (!doc || typeof doc !== 'object') {
      throw new Error('generarHTML: doc inválido')
    }

    // ---- Detectar tipo ----
    const tipoDocLower = String(doc.tipo_documento || 'factura').toLowerCase()
    const esGuia = tipoDocLower === 'guia_remision'
    const esVenta = !esGuia && Boolean(doc.cliente)
    const esCompra = !esVenta && !esGuia

    // ---- Datos del emisor ----
    const razonSocialEmisor = escHtml(doc.razon_social_emisor || "System Ozaet's Electronics")
    const rucEmisor = escHtml(doc.ruc_emisor || '1790012345001')
    const dirMatriz = escHtml('Av. Amazonas N34-451 y Av. Atahualpa, Quito, Ecuador')
    const dirSucursal = escHtml('Av. Amazonas N34-451, Quito')
    const contribuyenteEspecial = ''
    const obligadoContabilidad = 'NO'

    // ---- Datos de la contraparte ----
    let nombreContraparte = ''
    let rucContraparte = ''
    let dirContraparte = ''
    let telContraparte = ''
    let emailContraparte = ''

    if (esGuia) {
      nombreContraparte = escHtml(doc.destinatario_razon_social || doc.cliente?.nombre || '')
      rucContraparte = escHtml(doc.destinatario_identificacion || doc.cliente?.ruc || '')
      dirContraparte = escHtml(doc.destinatario_direccion || '')
      telContraparte = escHtml(doc.cliente?.telefono || '')
      emailContraparte = escHtml(doc.cliente?.email || '')
    } else if (esVenta) {
      nombreContraparte = escHtml(doc.cliente?.nombre || 'Consumidor Final')
      rucContraparte = escHtml(doc.cliente?.ruc || '9999999999999')
      dirContraparte = escHtml(doc.cliente?.direccion || '')
      telContraparte = escHtml(doc.cliente?.telefono || '')
      emailContraparte = escHtml(doc.cliente?.email || '')
    } else {
      nombreContraparte = escHtml(doc.proveedor?.nombre || 'Proveedor N/A')
      rucContraparte = escHtml(doc.proveedor?.ruc || '')
      dirContraparte = escHtml(doc.proveedor?.direccion || '')
      telContraparte = escHtml(doc.proveedor?.telefono || '')
      emailContraparte = escHtml(doc.proveedor?.email || '')
    }

    // ---- Datos del documento ----
    const tipoDoc = escHtml((doc.tipo_documento || 'factura').toUpperCase().replace(/_/g, ' '))
    const numero = escHtml(doc.numero_factura || doc.numero_guia || 'N/A')
    const fechaEmision = escHtml(fmtFecha(doc.fecha_emision))
    const claveAcceso = String(doc.clave_acceso || '')
    const numeroAutorizacion = escHtml(doc.numero_autorizacion || claveAcceso || '')
    const fechaAutorizacion = escHtml(fmtFechaHora(doc.fecha_autorizacion) || fmtFechaHora(doc.fecha_emision))
    const esProduccion = doc.ambiente_sri === '2'
    const ambiente = esProduccion ? 'PRODUCCIÓN' : 'PRUEBAS'
    const tipoEmision = 'NORMAL'
    const formaPago = escHtml(doc.forma_pago || 'Sin sistema financiero')
    const estadoPago = escHtml((doc.estado_pago || 'pendiente').toUpperCase())
    const observaciones = escHtml(doc.observaciones || '')

    const subtotal = Number(doc.subtotal) || 0
    const iva = Number(doc.iva) || 0
    const total = Number(doc.total) || 0

    const esTicket = formato === 'ticket'
    const esA2 = formato === 'A2'

    // ---- Detalles ----
    const detalles = Array.isArray(doc.detalles) ? doc.detalles : []
    let detallesHtml = ''

    if (detalles.length > 0) {
      if (esTicket) {
        detallesHtml = detalles.map((d, idx) => {
          const cantidad = Number(d.cantidad) || 0
          const precioUnit = Number(d.precio_unitario ?? d.costo_unitario) || 0
          const subtotalItem = cantidad * precioUnit
          const aplicaIVA = d.aplica_iva !== false
          const nombreProducto = escHtml(d.nombre || d.descripcion || obtenerNombreProducto(d.productoId))
          const codigo = escHtml(d.codigo || '')
          return `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td>
                <div class="product-name">${nombreProducto}</div>
                ${codigo ? `<div class="product-code">${codigo}</div>` : ''}
                ${!esGuia ? `<div class="product-meta">IVA ${aplicaIVA ? '15%' : '0%'}</div>` : ''}
              </td>
              <td class="text-center">${cantidad}</td>
              ${!esGuia ? `
                <td class="text-right">$${n2(precioUnit)}</td>
                <td class="text-right fw-bold">$${n2(subtotalItem)}</td>
              ` : ''}
            </tr>`
        }).join('')
      } else {
        detallesHtml = detalles.map((d, idx) => {
          const cantidad = Number(d.cantidad) || 0
          const precioUnit = Number(d.precio_unitario ?? d.costo_unitario) || 0
          const descuento = Number(d.descuento) || 0
          const subtotalItem = cantidad * precioUnit - descuento
          const aplicaIVA = d.aplica_iva !== false
          const nombreProducto = escHtml(d.nombre || d.descripcion || obtenerNombreProducto(d.productoId))
          const codigo = escHtml(d.codigo || '')
          return `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td>
                <div class="product-name">${nombreProducto}</div>
                ${codigo ? `<div class="product-code">Código: ${codigo}</div>` : ''}
              </td>
              <td class="text-center">${cantidad}</td>
              ${!esGuia ? `
                <td class="text-right">$${n2(precioUnit)}</td>
                <td class="text-right">$${n2(descuento)}</td>
                <td class="text-center">${aplicaIVA ? '15%' : '0%'}</td>
                <td class="text-right fw-bold">$${n2(subtotalItem)}</td>
              ` : ''}
            </tr>`
        }).join('')
      }
    }

    // ---- Configuración por formato ----
    let ancho = '210mm'
    let padding = '10mm'
    let fontSize = '11px'
    let formatoClase = 'a4'
    let barcodeHeight = 45
    let pageRule = 'size: A4 portrait; margin: 8mm;'

    if (esA2) {
      ancho = '420mm'
      padding = '15mm'
      fontSize = '14px'
      formatoClase = 'a2'
      barcodeHeight = 55
      pageRule = 'size: 420mm 594mm; margin: 12mm;'
    } else if (esTicket) {
      ancho = '80mm'
      padding = '3mm'
      fontSize = '9px'
      formatoClase = 'ticket'
      barcodeHeight = 32
      pageRule = 'size: 80mm auto; margin: 2mm;'
    }

    // ---- Código de barras ----
    const barcodeHtml = claveAcceso ? generarBarcodeSVG(claveAcceso, formato, barcodeHeight) : ''

    // ---- Clave formateada ----
    const chunkSize = esTicket ? 12 : 16
    const claveChunks = String(claveAcceso).match(new RegExp(`.{1,${chunkSize}}`, 'g')) || []
    const claveFormateada = escHtml(claveChunks.join(' '))

    // ---- Colores ambiente ----
    const ambienteColor = esProduccion ? '#1e7e34' : '#e67e22'

    // ---- Secciones específicas de guía ----
    const seccionGuiaHtml = esGuia ? `
      <div class="cliente-section">
        <div class="cliente-box">
          <div class="cliente-box-title">Datos del Destinatario</div>
          <div class="cliente-row">
            <span class="cliente-row-label">Razón Social:</span>
            <span class="cliente-row-value">${nombreContraparte || '—'}</span>
          </div>
          <div class="cliente-row">
            <span class="cliente-row-label">Identificación:</span>
            <span class="cliente-row-value">${rucContraparte || '—'}</span>
          </div>
          ${doc.destinatario_tipo ? `
          <div class="cliente-row">
            <span class="cliente-row-label">Tipo ID:</span>
            <span class="cliente-row-value">${escHtml(getTipoIdentLabel(doc.destinatario_tipo))}</span>
          </div>` : ''}
          ${dirContraparte ? `
          <div class="cliente-row">
            <span class="cliente-row-label">Dir. Destino:</span>
            <span class="cliente-row-value">${dirContraparte}</span>
          </div>` : ''}
        </div>
        <div class="cliente-box">
          <div class="cliente-box-title">Datos del Documento</div>
          <div class="cliente-row">
            <span class="cliente-row-label">Motivo:</span>
            <span class="cliente-row-value">${escHtml(doc.motivo || '—')}</span>
          </div>
          ${doc.ruta ? `
          <div class="cliente-row">
            <span class="cliente-row-label">Ruta:</span>
            <span class="cliente-row-value">${escHtml(doc.ruta)}</span>
          </div>` : ''}
          <div class="cliente-row">
            <span class="cliente-row-label">Estado:</span>
            <span class="cliente-row-value">${estadoPago}</span>
          </div>
          ${doc.documento_aduana ? `
          <div class="cliente-row">
            <span class="cliente-row-label">Doc. Aduanero:</span>
            <span class="cliente-row-value">${escHtml(doc.documento_aduana)}</span>
          </div>` : ''}
        </div>
      </div>
      <div class="cliente-section">
        <div class="cliente-box">
          <div class="cliente-box-title">Datos del Transportista</div>
          <div class="cliente-row">
            <span class="cliente-row-label">Razón Social:</span>
            <span class="cliente-row-value">${escHtml(doc.transportista_razon_social || doc.transportista || '—')}</span>
          </div>
          <div class="cliente-row">
            <span class="cliente-row-label">Identificación:</span>
            <span class="cliente-row-value">${escHtml(doc.transportista_identificacion || '—')}</span>
          </div>
          ${doc.transportista_tipo ? `
          <div class="cliente-row">
            <span class="cliente-row-label">Tipo ID:</span>
            <span class="cliente-row-value">${escHtml(getTipoIdentLabel(doc.transportista_tipo))}</span>
          </div>` : ''}
          ${doc.transportista_correo ? `
          <div class="cliente-row">
            <span class="cliente-row-label">Correo:</span>
            <span class="cliente-row-value">${escHtml(doc.transportista_correo)}</span>
          </div>` : ''}
        </div>
        <div class="cliente-box">
          <div class="cliente-box-title">Datos del Traslado</div>
          <div class="cliente-row">
            <span class="cliente-row-label">Dir. Partida:</span>
            <span class="cliente-row-value">${escHtml(doc.direccion_partida || '—')}</span>
          </div>
          ${doc.inicio_transporte ? `
          <div class="cliente-row">
            <span class="cliente-row-label">Inicio:</span>
            <span class="cliente-row-value">${escHtml(fmtFechaHora(doc.inicio_transporte))}</span>
          </div>` : ''}
          ${doc.fin_transporte ? `
          <div class="cliente-row">
            <span class="cliente-row-label">Fin:</span>
            <span class="cliente-row-value">${escHtml(fmtFechaHora(doc.fin_transporte))}</span>
          </div>` : ''}
          <div class="cliente-row">
            <span class="cliente-row-label">Placa:</span>
            <span class="cliente-row-value">${escHtml(doc.placa_transporte || doc.placa || '—')}</span>
          </div>
        </div>
      </div>
    ` : ''

    const seccionContraparteHtml = !esGuia ? `
      <div class="cliente-section">
        <div class="cliente-box">
          <div class="cliente-box-title">${esVenta ? 'Datos del Cliente' : 'Datos del Proveedor'}</div>
          <div class="cliente-row">
            <span class="cliente-row-label">Razón Social:</span>
            <span class="cliente-row-value">${nombreContraparte}</span>
          </div>
          <div class="cliente-row">
            <span class="cliente-row-label">RUC/Cédula:</span>
            <span class="cliente-row-value">${rucContraparte}</span>
          </div>
          ${dirContraparte ? `
          <div class="cliente-row">
            <span class="cliente-row-label">Dirección:</span>
            <span class="cliente-row-value">${dirContraparte}</span>
          </div>` : ''}
          ${telContraparte && !esTicket ? `
          <div class="cliente-row">
            <span class="cliente-row-label">Teléfono:</span>
            <span class="cliente-row-value">${telContraparte}</span>
          </div>` : ''}
          ${emailContraparte && !esTicket ? `
          <div class="cliente-row">
            <span class="cliente-row-label">Email:</span>
            <span class="cliente-row-value">${emailContraparte}</span>
          </div>` : ''}
        </div>
        ${!esTicket ? `
        <div class="cliente-box">
          <div class="cliente-box-title">Condiciones del Documento</div>
          <div class="cliente-row">
            <span class="cliente-row-label">Forma Pago:</span>
            <span class="cliente-row-value">${formaPago}</span>
          </div>
          <div class="cliente-row">
            <span class="cliente-row-label">Estado:</span>
            <span class="cliente-row-value">${estadoPago}</span>
          </div>
          <div class="cliente-row">
            <span class="cliente-row-label">Obligado Cont.:</span>
            <span class="cliente-row-value">${obligadoContabilidad}</span>
          </div>
          ${contribuyenteEspecial ? `
          <div class="cliente-row">
            <span class="cliente-row-label">Contrib. Especial:</span>
            <span class="cliente-row-value">${contribuyenteEspecial}</span>
          </div>` : ''}
          <div class="cliente-row">
            <span class="cliente-row-label">Moneda:</span>
            <span class="cliente-row-value">DÓLAR</span>
          </div>
        </div>
        ` : ''}
      </div>
    ` : ''

    // Tabla de detalles: cabecera condicional
    const tablaHeadHtml = esTicket
      ? (esGuia
          ? `<tr><th class="text-center">#</th><th>Producto</th><th class="text-center">Cant</th></tr>`
          : `<tr><th class="text-center">#</th><th>Producto</th><th class="text-center">Cant</th><th class="text-right">P.U.</th><th class="text-right">Total</th></tr>`)
      : (esGuia
          ? `<tr><th style="width:32px;" class="text-center">#</th><th>Descripción</th><th style="width:80px;" class="text-center">Cant.</th></tr>`
          : `<tr><th style="width:32px;" class="text-center">#</th><th>Descripción</th><th style="width:70px;" class="text-center">Cant.</th><th style="width:85px;" class="text-right">P. Unit.</th><th style="width:75px;" class="text-right">Desc.</th><th style="width:60px;" class="text-center">IVA</th><th style="width:95px;" class="text-right">Subtotal</th></tr>`)

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${tipoDoc} ${numero}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; }
    body {
      font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      background: #fff;
      color: #1a1a1a;
      font-size: ${fontSize};
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .container {
      width: ${ancho};
      min-height: ${esTicket ? 'auto' : esA2 ? '594mm' : '297mm'};
      margin: 0 auto;
      padding: ${padding};
      background: #fff;
      position: relative;
    }
    ${!esProduccion && !esTicket ? `
    .watermark {
      position: absolute;
      top: 45%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: ${esA2 ? '120px' : '90px'};
      font-weight: 900;
      color: rgba(230, 126, 34, 0.08);
      letter-spacing: 12px;
      pointer-events: none;
      user-select: none;
      z-index: 0;
      white-space: nowrap;
    }
    ` : ''}
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding-bottom: 12px;
      border-bottom: 3px solid #1a3a5c;
      margin-bottom: 14px;
      position: relative;
      z-index: 1;
    }
    .header-left { flex: 1; min-width: 0; }
    .header-right { flex-shrink: 0; text-align: right; }
    .logo-empresa { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .logo-icon {
      width: 48px; height: 48px;
      background: linear-gradient(135deg, #1a3a5c 0%, #2c5f8a 100%);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 24px; font-weight: 800;
      flex-shrink: 0;
      box-shadow: 0 2px 6px rgba(26, 58, 92, 0.2);
    }
    .empresa-nombre { font-size: 1.25em; font-weight: 800; color: #1a3a5c; line-height: 1.15; letter-spacing: 0.2px; }
    .empresa-sub { font-size: 0.72em; color: #888; letter-spacing: 0.3px; margin-top: 2px; }
    .empresa-info { font-size: 0.78em; color: #444; margin-top: 8px; line-height: 1.5; }
    .empresa-info div { margin: 1px 0; }
    .empresa-info strong { color: #1a3a5c; font-weight: 700; }
    .comprobante-box {
      border: 2px solid #1a3a5c;
      border-radius: 8px;
      padding: 10px 16px;
      min-width: 190px;
      text-align: center;
      background: #fff;
    }
    .comprobante-tipo {
      font-size: 1em; font-weight: 800; color: #1a3a5c;
      letter-spacing: 2px; text-transform: uppercase;
      padding-bottom: 4px; margin-bottom: 6px;
      border-bottom: 1px dashed #c8d6e5;
    }
    .comprobante-numero {
      font-size: 0.95em; font-weight: 700; color: #c0392b;
      font-family: 'Courier New', monospace;
      margin-bottom: 6px;
    }
    .ambiente-badge {
      display: inline-block;
      padding: 3px 12px;
      background: ${ambienteColor};
      color: #fff;
      border-radius: 20px;
      font-size: 0.68em; font-weight: 800;
      letter-spacing: 0.6px;
    }
    .comprobante-meta { font-size: 0.7em; color: #666; margin-top: 6px; line-height: 1.4; }
    .clave-section {
      display: flex;
      gap: 14px;
      align-items: center;
      padding: 12px 14px;
      background: #f8f9fa;
      border-left: 4px solid #1a3a5c;
      border-radius: 6px;
      margin-bottom: 12px;
      position: relative;
      z-index: 1;
    }
    .clave-left { flex: 1; min-width: 0; }
    .clave-label {
      font-size: 0.68em; color: #666;
      text-transform: uppercase; letter-spacing: 0.5px;
      font-weight: 700; margin-bottom: 4px;
    }
    .clave-valor {
      font-family: 'Courier New', monospace;
      font-size: 0.72em; color: #1a3a5c; font-weight: 700;
      word-break: break-all; line-height: 1.4;
      margin-bottom: 6px; letter-spacing: 0.3px;
    }
    .autorizacion-info { font-size: 0.68em; color: #555; line-height: 1.5; }
    .autorizacion-info strong { color: #1a3a5c; font-weight: 700; }
    .autorizacion-info .ok-badge {
      display: inline-flex; align-items: center; gap: 4px;
      color: #1e7e34; font-weight: 700; margin-bottom: 3px;
    }
    .autorizacion-info .ok-badge::before {
      content: '✓';
      display: inline-flex; align-items: center; justify-content: center;
      width: 14px; height: 14px;
      background: #1e7e34; color: #fff;
      border-radius: 50%; font-size: 10px; font-weight: 800;
    }
    .barcode-container { flex-shrink: 0; text-align: center; max-width: 100%; }
    .barcode-svg { height: ${barcodeHeight}px; width: auto; max-width: 100%; display: block; }
    .barcode-numero {
      font-family: 'Courier New', monospace;
      font-size: 0.55em; color: #555;
      margin-top: 2px; letter-spacing: 0;
      word-break: break-all; max-width: 100%;
      overflow: hidden; line-height: 1.1;
    }
    .cliente-section {
      display: grid;
      grid-template-columns: ${esTicket ? '1fr' : '1.6fr 1fr'};
      gap: 10px;
      margin-bottom: 12px;
      position: relative;
      z-index: 1;
    }
    .cliente-box {
      padding: 10px 12px;
      border: 1px solid #dee2e6;
      border-radius: 6px;
      background: #fafbfc;
      min-width: 0;
    }
    .cliente-box-title {
      font-size: 0.68em; color: #1a3a5c;
      text-transform: uppercase; letter-spacing: 0.5px;
      font-weight: 800; margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px dashed #dee2e6;
    }
    .cliente-row {
      display: flex; font-size: 0.78em; margin: 3px 0;
      line-height: 1.4; word-break: break-word;
    }
    .cliente-row-label {
      min-width: 95px; color: #666; font-weight: 600;
      flex-shrink: 0;
    }
    .cliente-row-value {
      flex: 1; color: #1a1a1a; font-weight: 500;
      min-width: 0; word-break: break-word;
    }
    .detalles-section { margin-bottom: 12px; position: relative; z-index: 1; }
    .detalles-title {
      font-size: 0.72em; font-weight: 800; color: #1a3a5c;
      text-transform: uppercase; letter-spacing: 0.5px;
      padding: 6px 0; margin-bottom: 4px;
      border-bottom: 2px solid #1a3a5c;
    }
    .detalles-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 0.82em; }
    .detalles-table thead { background: #1a3a5c; color: #fff; }
    .detalles-table thead th {
      padding: 8px 6px; text-align: left;
      font-weight: 700; font-size: 0.7em;
      text-transform: uppercase; letter-spacing: 0.4px;
    }
    .detalles-table tbody td {
      padding: 8px 6px; border-bottom: 1px solid #eef1f5;
      vertical-align: top;
    }
    .detalles-table tbody tr:nth-child(even) { background: #f8f9fa; }
    .detalles-table tbody tr:last-child td { border-bottom: 2px solid #dee2e6; }
    .detalles-table .text-center { text-align: center; }
    .detalles-table .text-right { text-align: right; }
    .detalles-table .fw-bold { font-weight: 700; }
    .product-name { font-weight: 600; color: #1a1a1a; margin-bottom: 2px; font-size: 0.98em; }
    .product-code { font-size: 0.85em; color: #888; font-family: 'Courier New', monospace; }
    .product-meta { font-size: 0.72em; color: #888; font-style: italic; }
    .totales-section { display: flex; justify-content: flex-end; margin-top: 12px; margin-bottom: 12px; position: relative; z-index: 1; }
    .totales-box {
      width: 100%;
      max-width: ${esTicket ? '100%' : esA2 ? '380px' : '310px'};
      border: 1px solid #dee2e6;
      border-radius: 6px;
      overflow: hidden;
      background: #fff;
    }
    .total-row {
      display: flex; justify-content: space-between;
      padding: 7px 14px; font-size: 0.82em;
      border-bottom: 1px solid #f1f3f5;
    }
    .total-row:last-child { border-bottom: none; }
    .total-row .label { color: #555; font-weight: 500; }
    .total-row .value { color: #1a1a1a; font-weight: 600; font-family: 'Courier New', monospace; }
    .total-final {
      display: flex; justify-content: space-between;
      padding: 11px 14px;
      background: linear-gradient(135deg, #1a3a5c 0%, #2c5f8a 100%);
      color: #fff;
      font-size: 1em; font-weight: 800;
    }
    .total-final .value { font-family: 'Courier New', monospace; font-size: 1.05em; }
    .info-adicional {
      padding: 9px 12px;
      background: #fdf6e3;
      border-left: 3px solid #e67e22;
      border-radius: 6px;
      margin-bottom: 12px;
      font-size: 0.78em;
      position: relative; z-index: 1;
    }
    .info-adicional-title {
      font-size: 0.68em; color: #8a6d3b;
      text-transform: uppercase; letter-spacing: 0.4px;
      font-weight: 700; margin-bottom: 3px;
    }
    .info-adicional-body { color: #5a4a1e; line-height: 1.5; }
    .firma-section {
      margin-top: 30px;
      display: flex;
      flex-direction: ${esTicket ? 'column' : 'row'};
      justify-content: ${esTicket ? 'flex-start' : 'space-around'};
      gap: ${esTicket ? '20px' : '40px'};
      position: relative; z-index: 1;
    }
    .firma-box { flex: 1; text-align: center; }
    .firma-line { border-top: 1px solid #1a1a1a; margin: 40px 20px 6px; }
    .firma-label { font-size: 0.72em; color: #555; font-weight: 600; letter-spacing: 0.3px; }
    .footer {
      margin-top: 18px;
      padding-top: 10px;
      border-top: 2px solid #1a3a5c;
      text-align: center;
      font-size: 0.68em;
      color: #666;
      line-height: 1.7;
      position: relative; z-index: 1;
    }
    .footer strong { color: #1a3a5c; font-weight: 700; }
    .footer .legal-note { color: #1e7e34; font-weight: 600; margin-top: 4px; }
    .container.ticket { padding: 3mm; }
    .ticket .header { flex-direction: column; align-items: stretch; text-align: center; gap: 8px; padding-bottom: 8px; margin-bottom: 8px; }
    .ticket .header-left, .ticket .header-right { text-align: center; flex: none; width: 100%; }
    .ticket .logo-empresa { justify-content: center; }
    .ticket .logo-icon { width: 36px; height: 36px; font-size: 18px; }
    .ticket .empresa-nombre { font-size: 1.1em; }
    .ticket .empresa-sub { font-size: 0.7em; }
    .ticket .empresa-info { font-size: 0.72em; margin-top: 6px; }
    .ticket .comprobante-box { padding: 6px 10px; min-width: 0; }
    .ticket .comprobante-tipo { font-size: 0.9em; letter-spacing: 1px; }
    .ticket .comprobante-numero { font-size: 0.85em; }
    .ticket .ambiente-badge { font-size: 0.62em; padding: 2px 8px; }
    .ticket .clave-section { flex-direction: column; gap: 6px; padding: 8px; text-align: center; }
    .ticket .clave-left { width: 100%; text-align: center; }
    .ticket .clave-label { font-size: 0.6em; }
    .ticket .clave-valor { font-size: 0.6em; letter-spacing: 0; line-height: 1.3; }
    .ticket .autorizacion-info { font-size: 0.6em; text-align: center; }
    .ticket .barcode-container { width: 100%; max-width: 100%; }
    .ticket .barcode-svg { height: ${barcodeHeight}px; width: 100%; max-width: 72mm; margin: 0 auto; }
    .ticket .barcode-numero { font-size: 0.5em; }
    .ticket .cliente-row-label { min-width: 70px; font-size: 0.95em; }
    .ticket .detalles-table { font-size: 0.75em; table-layout: fixed; width: 100%; }
    .ticket .detalles-table thead th { padding: 5px 3px; font-size: 0.62em; }
    .ticket .detalles-table tbody td { padding: 6px 3px; word-wrap: break-word; }
    .ticket .product-name { font-size: 0.95em; word-wrap: break-word; overflow-wrap: break-word; }
    .ticket .product-code { font-size: 0.72em; }
    .ticket .product-meta { font-size: 0.68em; }
    .ticket .total-row { padding: 5px 10px; font-size: 0.75em; }
    .ticket .total-final { padding: 8px 10px; font-size: 0.9em; }
    .ticket .firma-line { margin: 25px 30px 6px; }
    .ticket .footer { font-size: 0.6em; }
    @media print {
      body { margin: 0; padding: 0; background: #fff; }
      .container {
        width: 100% !important;
        min-height: auto;
        padding: ${padding};
        box-shadow: none;
        margin: 0;
      }
      .no-print { display: none !important; }
      .header, .clave-section, .cliente-section, .totales-section, .info-adicional, .footer { page-break-inside: avoid; }
      .detalles-table tr { page-break-inside: avoid; }
      .detalles-table thead { display: table-header-group; }
      .firma-section { page-break-inside: avoid; }
      @page { ${pageRule} }
    }
  </style>
</head>
<body>
  ${!esProduccion && !esTicket ? `<div class="watermark">PRUEBAS</div>` : ''}

  <div class="container ${formatoClase}">
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
          ${!esTicket ? `<div><strong>Dir. Sucursal:</strong> ${dirSucursal}</div>` : ''}
        </div>
      </div>
      <div class="header-right">
        <div class="comprobante-box">
          <div class="comprobante-tipo">${tipoDoc}</div>
          <div class="comprobante-numero">Nº ${numero}</div>
          <div class="ambiente-badge">● ${ambiente}</div>
          <div class="comprobante-meta">
            <div><strong>Fecha:</strong> ${fechaEmision}</div>
            ${!esTicket ? `<div><strong>Tipo:</strong> ${tipoEmision}</div>` : ''}
          </div>
        </div>
      </div>
    </div>

    ${claveAcceso ? `
    <div class="clave-section">
      <div class="clave-left">
        <div class="clave-label">Clave de Acceso</div>
        <div class="clave-valor">${claveFormateada}</div>
        <div class="autorizacion-info">
          ${numeroAutorizacion ? `
            <div class="ok-badge">Autorizado por el SRI</div>
            <div><strong>Nº Autorización:</strong> ${numeroAutorizacion}</div>
            <div><strong>Fecha Autorización:</strong> ${fechaAutorizacion}</div>
          ` : `
            <div style="color:#e67e22;font-weight:700;">⚠ Pendiente de autorización por el SRI</div>
          `}
        </div>
      </div>
      <div class="barcode-container">
        ${barcodeHtml}
        <div class="barcode-numero">${escHtml(claveAcceso)}</div>
      </div>
    </div>
    ` : ''}

    ${seccionGuiaHtml}
    ${seccionContraparteHtml}

    <div class="detalles-section">
      <div class="detalles-title">
        ${esGuia ? 'Detalle de Productos a Trasladar' : 'Detalle de Productos y Servicios'}
      </div>
      <table class="detalles-table">
        <thead>
          ${tablaHeadHtml}
        </thead>
        <tbody>
          ${detallesHtml || `<tr><td colspan="${esGuia ? (esTicket ? 3 : 3) : (esTicket ? 5 : 7)}" class="text-center" style="padding:24px;color:#888;">Sin detalles registrados</td></tr>`}
        </tbody>
      </table>
    </div>

    ${!esGuia ? `
    <div class="totales-section">
      <div class="totales-box">
        <div class="total-row"><span class="label">Subtotal</span><span class="value">$${n2m(subtotal)}</span></div>
        <div class="total-row"><span class="label">Descuento</span><span class="value">$0.00</span></div>
        <div class="total-row"><span class="label">IVA 15%</span><span class="value">$${n2m(iva)}</span></div>
        <div class="total-final"><span class="label">TOTAL A PAGAR</span><span class="value">$${n2m(total)}</span></div>
      </div>
    </div>
    ` : ''}

    ${observaciones ? `
      <div class="info-adicional">
        <div class="info-adicional-title">Información Adicional</div>
        <div class="info-adicional-body">${observaciones}</div>
      </div>
    ` : ''}

    ${!esTicket ? `
    <div class="firma-section">
      <div class="firma-box">
        <div class="firma-line"></div>
        <div class="firma-label">${esGuia ? 'Recibí Conforme (Destinatario)' : 'Firma del Cliente'}</div>
      </div>
      <div class="firma-box">
        <div class="firma-line"></div>
        <div class="firma-label">${razonSocialEmisor}</div>
      </div>
    </div>
    ` : ''}

    <div class="footer">
      <div><strong>Documento generado por Sistema Contable</strong></div>
      <div>${razonSocialEmisor} — RUC: ${rucEmisor}</div>
      ${claveAcceso ? `
        <div class="legal-note">
          ✓ Representación impresa de un comprobante electrónico autorizado por el SRI
        </div>
      ` : ''}
    </div>
  </div>
</body>
</html>`
  }
}