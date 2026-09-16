// frontend/src/services/printService.js
// ============================================================
// Generador de RIDE (Representación Impresa del Documento Electrónico)
// ------------------------------------------------------------
// Incluye:
//   - Generador de código de barras Code128 subset C (SRI usa solo dígitos)
//   - Escape HTML en TODOS los valores dinámicos (previene XSS)
//   - Impresión robusta: espera `readyState` + `document.fonts.ready`
//   - Soporte A4 / A2 / Ticket 80mm
// ============================================================
'use strict'

// ============================================================
// CÓDIGO DE BARRAS (Code128 subset C)
// ============================================================
// Patrones oficiales Code128. Cada símbolo son 11 módulos (STOP = 13).
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

/**
 * Genera la secuencia de bits (string de 0s y 1s) para Code128 subset C.
 * Solo acepta dígitos. Si la longitud es impar, prepende un 0.
 *
 * @param {string} data  Cadena de solo dígitos
 * @returns {string}
 * @throws {Error} si contiene caracteres no numéricos
 */
function generarBitsCode128C(data) {
  const str = String(data ?? '')
  if (!/^\d+$/.test(str)) {
    throw new Error('Code128C solo acepta dígitos')
  }

  // Code128C empaqueta 2 dígitos por símbolo → siempre par
  const normalizada = str.length % 2 !== 0 ? '0' + str : str

  const symbols = [CODE128_START_C]
  for (let i = 0; i < normalizada.length; i += 2) {
    symbols.push(parseInt(normalizada.substr(i, 2), 10))
  }

  // Checksum módulo 103 con pesos posicionales
  let checksum = CODE128_START_C
  for (let i = 1; i < symbols.length; i++) {
    checksum += symbols[i] * i
  }
  checksum %= 103
  symbols.push(checksum)
  symbols.push(CODE128_STOP)

  let bits = ''
  for (const sym of symbols) bits += CODE128_PATTERNS[sym]
  return bits
}

/**
 * Genera el SVG del código de barras Code128C.
 *
 * @param {string} texto
 * @param {'A4'|'A2'|'ticket'} formato
 * @param {number} maxHeight  Alto en px del SVG renderizado
 * @returns {string}  SVG inline (seguro para inyectar)
 */
function generarBarcodeSVG(texto, formato = 'A4', maxHeight = 45) {
  if (!texto) return ''

  let dataBarcode = String(texto)

  // En ticket solo se ve la cola del código (22 dígitos → 22 módulos C ≈ 242 px)
  if (formato === 'ticket' && dataBarcode.length > 30) {
    dataBarcode = dataBarcode.slice(-22)
  }

  try {
    const bits = generarBitsCode128C(dataBarcode)
    // Quiet zone estándar: mínimo 10 módulos por lado
    const quietZone = 10
    const height = 60
    const totalModules = bits.length + quietZone * 2
    const totalWidth = totalModules

    // `preserveAspectRatio="xMidYMid meet"` mantiene proporciones sin distorsionar
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
        while (i < bits.length && bits[i] === '1') {
          w++
          i++
        }
        svg += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#1a1a1a"/>`
        x += w
      } else {
        let w = 0
        while (i < bits.length && bits[i] === '0') {
          w++
          i++
        }
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
// HELPERS DE SEGURIDAD (previenen XSS/HTML injection)
// ============================================================
/**
 * Escapa un valor para insertarlo en contenido HTML.
 * NO usar en atributos (esos usan escAttr).
 */
function escHtml(v) {
  if (v === null || v === undefined) return ''
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Escapa un valor para insertarlo dentro de un atributo HTML.
 * Es más estricto con comillas y saltos de línea.
 */
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

/** Formatea un número a 2 decimales; devuelve '0.00' si es inválido. */
function n2(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

/** Formatea fecha en formato es-EC (dd/mm/yyyy). */
function fmtFecha(f) {
  if (!f) return ''
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  } catch {
    return ''
  }
}

/** Formatea fecha+hora en formato es-EC. */
function fmtFechaHora(f) {
  if (!f) return ''
  try {
    return new Date(f).toLocaleString('es-EC')
  } catch {
    return ''
  }
}

// ============================================================
// SERVICIO DE IMPRESIÓN
// ============================================================
export const printService = {
  /**
   * Abre una nueva ventana con el RIDE y dispara `window.print()`.
   * @param {object} doc
   * @param {'A4'|'A2'|'ticket'} formato
   * @param {(id:string)=>string} obtenerNombreProducto
   */
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

    // `noopener` → evita que la nueva ventana manipule la actual
    const ventana = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')

    if (!ventana) {
      alert(
        'No se pudo abrir la ventana de impresión.\n\n' +
        'Permita las ventanas emergentes para este sitio e intente de nuevo.'
      )
      return
    }

    try {
      ventana.document.open()
      ventana.document.write(html)
      ventana.document.close()
      ventana.focus()
    } catch (e) {
      console.error('Error escribiendo en la ventana de impresión:', e?.message || e)
      try { ventana.close() } catch { /* noop */ }
    }
  },

  /**
   * Construye el HTML del RIDE.
   * @param {object} doc
   * @param {'A4'|'A2'|'ticket'} formato
   * @param {(id:string)=>string} obtenerNombreProducto
   * @returns {string}
   */
  generarHTML(doc, formato = 'A4', obtenerNombreProducto = () => 'Producto') {
    if (!doc || typeof doc !== 'object') {
      throw new Error('generarHTML: doc inválido')
    }

    // ---- Determinar si es venta o compra ----
    const esVenta = !!doc.cliente
    const contraparte = esVenta ? doc.cliente : doc.proveedor

    // ---- Extraer y escapar todos los campos dinámicos ----
    const nombreCliente = escHtml(
      contraparte?.nombre || (esVenta ? 'Consumidor Final' : 'Proveedor N/A')
    )
    const rucCliente = escHtml(
      contraparte?.ruc || (esVenta ? '9999999999999' : '')
    )
    const dirCliente = escHtml(contraparte?.direccion || '')
    const telCliente = escHtml(contraparte?.telefono || '')
    const emailCliente = escHtml(contraparte?.email || '')

    const tipoDoc = escHtml((doc.tipo_documento || 'factura').toUpperCase())
    const numero = escHtml(doc.numero_factura || doc.numero_guia || 'N/A')
    const fechaEmision = escHtml(fmtFecha(doc.fecha_emision))
    const claveAcceso = String(doc.clave_acceso || '')
    const numeroAutorizacion = escHtml(doc.numero_autorizacion || claveAcceso)
    const fechaAutorizacion = escHtml(fmtFechaHora(doc.fecha_emision))
    const esProduccion = doc.ambiente_sri === '2'
    const ambiente = esProduccion ? 'PRODUCCIÓN' : 'PRUEBAS'
    const tipoEmision = 'NORMAL'
    const razonSocialEmisor = escHtml(
      doc.razon_social_emisor || "System Ozaet's Electronics"
    )
    const rucEmisor = escHtml(doc.ruc_emisor || '1790012345001')
    const dirMatriz = escHtml('Av. Amazonas N34-451 y Av. Atahualpa, Quito, Ecuador')
    const dirSucursal = escHtml('Av. Amazonas N34-451, Quito')
    const contribuyenteEspecial = ''
    const obligadoContabilidad = 'NO'

    const formaPago = escHtml(doc.forma_pago || 'Sin sistema financiero')
    const estadoPago = escHtml((doc.estado_pago || 'pendiente').toUpperCase())
    const observaciones = escHtml(doc.observaciones || '')

    const subtotal = Number(doc.subtotal) || 0
    const iva = Number(doc.iva) || 0
    const total = Number(doc.total) || 0

    const esTicket = formato === 'ticket'

    // ---- Tabla de detalles ----
    const detalles = Array.isArray(doc.detalles) ? doc.detalles : []
    let detallesHtml = ''

    if (detalles.length > 0) {
      if (esTicket) {
        detallesHtml = detalles
          .map((d, idx) => {
            const cantidad = Number(d.cantidad) || 0
            const precioUnit =
              Number(d.precio_unitario ?? d.costo_unitario) || 0
            const subtotalItem = cantidad * precioUnit
            const aplicaIVA = d.aplica_iva !== false
            const nombreProducto = escHtml(
              d.nombre || d.descripcion || obtenerNombreProducto(d.productoId)
            )
            const codigo = escHtml(d.codigo || '')
            return `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td>
                  <div class="product-name">${nombreProducto}</div>
                  ${codigo ? `<div class="product-code">${codigo}</div>` : ''}
                  <div class="product-meta">IVA ${aplicaIVA ? '15%' : '0%'}</div>
                </td>
                <td class="text-center">${cantidad}</td>
                <td class="text-right">$${n2(precioUnit)}</td>
                <td class="text-right fw-bold">$${n2(subtotalItem)}</td>
              </tr>`
          })
          .join('')
      } else {
        detallesHtml = detalles
          .map((d, idx) => {
            const cantidad = Number(d.cantidad) || 0
            const precioUnit =
              Number(d.precio_unitario ?? d.costo_unitario) || 0
            const descuento = Number(d.descuento) || 0
            const subtotalItem = cantidad * precioUnit - descuento
            const aplicaIVA = d.aplica_iva !== false
            const nombreProducto = escHtml(
              d.nombre || d.descripcion || obtenerNombreProducto(d.productoId)
            )
            const codigo = escHtml(d.codigo || '')
            return `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td>
                  <div class="product-name">${nombreProducto}</div>
                  ${codigo ? `<div class="product-code">Código: ${codigo}</div>` : ''}
                </td>
                <td class="text-center">${cantidad}</td>
                <td class="text-right">$${n2(precioUnit)}</td>
                <td class="text-right">$${n2(descuento)}</td>
                <td class="text-center">${aplicaIVA ? '15%' : '0%'}</td>
                <td class="text-right">$${n2(subtotalItem)}</td>
              </tr>`
          })
          .join('')
      }
    }

    // ---- Configuración por formato ----
    let ancho = '210mm'
    let padding = '10mm'
    let fontSize = '11px'
    let formatoClase = 'a4'
    let barcodeHeight = 45

    if (formato === 'A2') {
      ancho = '420mm'
      padding = '15mm'
      fontSize = '14px'
      formatoClase = 'a2'
      barcodeHeight = 55
    } else if (formato === 'ticket') {
      ancho = '80mm'
      padding = '3mm'
      fontSize = '9px'
      formatoClase = 'ticket'
      barcodeHeight = 32
    }

    // ---- Código de barras ----
    const barcodeHtml = claveAcceso
      ? generarBarcodeSVG(claveAcceso, formato, barcodeHeight)
      : ''

    // ---- Clave formateada en chunks ----
    const chunkSize = esTicket ? 12 : 16
    const claveChunks = String(claveAcceso).match(
      new RegExp(`.{1,${chunkSize}}`, 'g')
    ) || []
    const claveFormateada = escHtml(claveChunks.join(' '))

    // ---- Colores según ambiente ----
    const ambienteColor = esProduccion ? '#27ae60' : '#e67e22'

    // ============================================================
    // HTML FINAL
    // ============================================================
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${tipoDoc} ${numero}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #1a1a1a; font-size: ${fontSize}; line-height: 1.35; }
    .container { width: ${ancho}; margin: 0 auto; padding: ${padding}; background: #fff; }

    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 10px; border-bottom: 3px double #1a3a5c; margin-bottom: 10px; }
    .header-left { flex: 1; }
    .header-center { flex: 1.2; text-align: center; }
    .header-right { flex: 0.9; text-align: right; }
    .logo-empresa { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .logo-icon { width: 40px; height: 40px; background: #1a3a5c; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #f1c40f; font-size: 22px; font-weight: 800; flex-shrink: 0; }
    .empresa-nombre { font-size: 1.1em; font-weight: 800; color: #1a3a5c; line-height: 1.1; }
    .empresa-sub { font-size: 0.72em; color: #666; }
    .empresa-info { font-size: 0.8em; color: #333; margin-top: 6px; }
    .empresa-info div { margin: 2px 0; }
    .doc-tipo { display: inline-block; padding: 6px 16px; background: #1a3a5c; color: #fff; border-radius: 5px; font-size: 1em; font-weight: 800; letter-spacing: 1.2px; margin-bottom: 5px; }
    .doc-numero { font-size: 0.95em; font-weight: 700; color: #c0392b; margin-bottom: 3px; font-family: 'Courier New', monospace; }
    .doc-meta { font-size: 0.72em; color: #555; }
    .ambiente-badge { display: inline-block; padding: 3px 10px; background: ${ambienteColor}; color: #fff; border-radius: 20px; font-size: 0.68em; font-weight: 700; letter-spacing: 0.4px; margin-top: 3px; }

    .clave-section { display: flex; gap: 12px; align-items: center; padding: 10px 12px; background: #f8f9fa; border-left: 4px solid #1a3a5c; border-radius: 5px; margin-bottom: 10px; }
    .clave-left { flex: 1; min-width: 0; overflow: hidden; }
    .clave-label { font-size: 0.68em; color: #666; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; margin-bottom: 3px; }
    .clave-valor { font-family: 'Courier New', monospace; font-size: 0.7em; color: #1a3a5c; font-weight: 700; word-break: break-all; line-height: 1.4; margin-bottom: 4px; letter-spacing: 0.3px; }
    .autorizacion-info { font-size: 0.68em; color: #555; line-height: 1.4; word-break: break-all; }
    .autorizacion-info strong { color: #1a3a5c; }
    .barcode-container { flex-shrink: 0; text-align: center; max-width: 100%; }
    .barcode-svg { height: ${barcodeHeight}px; width: auto; max-width: 100%; display: block; }
    .barcode-numero { font-family: 'Courier New', monospace; font-size: 0.55em; color: #333; margin-top: 2px; letter-spacing: 0; word-break: break-all; max-width: 100%; overflow: hidden; line-height: 1.1; }

    .cliente-section { display: flex; gap: 10px; margin-bottom: 10px; }
    .cliente-box { flex: 1; padding: 8px 10px; border: 1px solid #d5dbe0; border-radius: 5px; background: #fafbfc; min-width: 0; }
    .cliente-box-title { font-size: 0.68em; color: #666; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; margin-bottom: 5px; padding-bottom: 3px; border-bottom: 1px dashed #d5dbe0; }
    .cliente-row { display: flex; font-size: 0.75em; margin: 2px 0; line-height: 1.35; word-break: break-word; }
    .cliente-row-label { min-width: 80px; color: #666; font-weight: 600; flex-shrink: 0; }
    .cliente-row-value { flex: 1; color: #1a1a1a; font-weight: 500; min-width: 0; word-break: break-word; }

    .detalles-section { margin-bottom: 10px; }
    .detalles-title { font-size: 0.72em; font-weight: 700; color: #1a3a5c; text-transform: uppercase; letter-spacing: 0.4px; padding: 5px 0; border-bottom: 2px solid #1a3a5c; }
    .detalles-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 0.8em; }
    .detalles-table thead { background: #1a3a5c; color: #fff; }
    .detalles-table thead th { padding: 6px 5px; text-align: left; font-weight: 600; font-size: 0.68em; text-transform: uppercase; letter-spacing: 0.2px; }
    .detalles-table tbody td { padding: 7px 5px; border-bottom: 1px solid #e9ecef; vertical-align: top; }
    .detalles-table tbody tr:nth-child(even) { background: #f8f9fa; }
    .detalles-table .text-center { text-align: center; }
    .detalles-table .text-right { text-align: right; }
    .product-name { font-weight: 600; color: #1a1a1a; margin-bottom: 1px; font-size: 0.95em; }
    .product-code { font-size: 0.85em; color: #888; font-family: 'Courier New', monospace; }
    .product-meta { font-size: 0.7em; color: #888; font-style: italic; }
    .fw-bold { font-weight: 700; }

    .totales-section { display: flex; justify-content: flex-end; margin-top: 10px; margin-bottom: 10px; }
    .totales-box { width: 100%; max-width: 300px; border: 1px solid #d5dbe0; border-radius: 5px; overflow: hidden; }
    .total-row { display: flex; justify-content: space-between; padding: 6px 12px; font-size: 0.82em; border-bottom: 1px solid #e9ecef; }
    .total-row:last-child { border-bottom: none; }
    .total-row .label { color: #555; font-weight: 500; }
    .total-row .value { color: #1a1a1a; font-weight: 600; font-family: 'Courier New', monospace; }
    .total-final { display: flex; justify-content: space-between; padding: 10px 12px; background: #1a3a5c; color: #fff; font-size: 1em; font-weight: 800; }
    .total-final .value { font-family: 'Courier New', monospace; }

    .info-adicional { padding: 8px 10px; background: #f8f9fa; border-left: 3px solid #e67e22; border-radius: 5px; margin-bottom: 10px; font-size: 0.75em; }
    .info-adicional-title { font-size: 0.68em; color: #666; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; margin-bottom: 3px; }

    .firma-section { margin-top: 25px; display: flex; justify-content: space-around; gap: 30px; }
    .firma-box { flex: 1; text-align: center; }
    .firma-line { border-top: 1px solid #1a1a1a; margin: 35px 15px 5px; }
    .firma-label { font-size: 0.7em; color: #555; }

    .footer { margin-top: 16px; padding-top: 8px; border-top: 2px solid #1a3a5c; text-align: center; font-size: 0.68em; color: #666; line-height: 1.6; }
    .footer strong { color: #1a3a5c; }

    /* ===== TICKET 80mm ===== */
    .ticket { padding: 3mm; }
    .ticket .header { flex-direction: column; align-items: center; text-align: center; gap: 6px; padding-bottom: 8px; }
    .ticket .header-left, .ticket .header-center, .ticket .header-right { text-align: center; flex: none; width: 100%; }
    .ticket .logo-empresa { justify-content: center; }
    .ticket .logo-icon { width: 34px; height: 34px; font-size: 18px; }
    .ticket .empresa-nombre { font-size: 1em; }
    .ticket .empresa-info { font-size: 0.7em; }
    .ticket .doc-tipo { padding: 4px 12px; font-size: 0.9em; }
    .ticket .doc-numero { font-size: 0.85em; }
    .ticket .clave-section { flex-direction: column; gap: 6px; padding: 8px; text-align: center; }
    .ticket .clave-left { width: 100%; text-align: center; }
    .ticket .clave-label { font-size: 0.62em; }
    .ticket .clave-valor { font-size: 0.6em; letter-spacing: 0; line-height: 1.3; word-break: break-all; }
    .ticket .autorizacion-info { font-size: 0.6em; text-align: center; }
    .ticket .autorizacion-info div { word-break: break-all; }
    .ticket .barcode-container { width: 100%; max-width: 100%; text-align: center; }
    .ticket .barcode-svg { height: ${barcodeHeight}px; width: 100%; max-width: 72mm; margin: 0 auto; display: block; }
    .ticket .barcode-numero { font-size: 0.5em; line-height: 1.2; word-break: break-all; max-width: 100%; overflow: hidden; }
    .ticket .cliente-section { flex-direction: column; gap: 6px; }
    .ticket .cliente-box { padding: 6px 8px; }
    .ticket .cliente-row-label { min-width: 65px; font-size: 0.95em; }
    .ticket .detalles-table { font-size: 0.75em; table-layout: fixed; width: 100%; }
    .ticket .detalles-table thead th { padding: 5px 3px; font-size: 0.65em; text-transform: uppercase; }
    .ticket .detalles-table tbody td { padding: 6px 3px; vertical-align: top; word-wrap: break-word; }
    .ticket .detalles-table thead th:nth-child(1) { width: 22px; }
    .ticket .detalles-table thead th:nth-child(2) { width: auto; }
    .ticket .detalles-table thead th:nth-child(3) { width: 38px; }
    .ticket .detalles-table thead th:nth-child(4) { width: 55px; }
    .ticket .detalles-table thead th:nth-child(5) { width: 65px; }
    .ticket .product-name { font-size: 0.95em; font-weight: 600; word-wrap: break-word; overflow-wrap: break-word; hyphens: auto; }
    .ticket .product-code { font-size: 0.75em; color: #999; margin-top: 1px; }
    .ticket .product-meta { font-size: 0.7em; color: #999; font-style: italic; margin-top: 1px; }
    .ticket .totales-box { max-width: 100%; }
    .ticket .total-row { padding: 5px 10px; font-size: 0.75em; }
    .ticket .total-final { padding: 8px 10px; font-size: 0.9em; }
    .ticket .firma-section { flex-direction: column; gap: 15px; margin-top: 20px; }
    .ticket .firma-line { margin: 25px 30px 5px; }
    .ticket .footer { font-size: 0.6em; }

    @media print {
      body { margin: 0; padding: 0; }
      .container { width: 100%; padding: ${padding}; box-shadow: none; }
      .no-print { display: none !important; }
      .header, .clave-section, .cliente-section, .totales-section, .info-adicional { page-break-inside: avoid; }
      .detalles-table tr { page-break-inside: avoid; }
      @page { size: ${esTicket ? '80mm auto' : formato === 'A2' ? 'A2' : 'A4'}; margin: ${esTicket ? '2mm' : '8mm'}; }
    }
  </style>
</head>
<body>
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

      <div class="header-center">
        <div class="doc-tipo">${tipoDoc}</div>
        <div class="doc-numero">Nº ${numero}</div>
        <div class="doc-meta"><div><strong>Fecha Emisión:</strong> ${fechaEmision}</div></div>
        <div class="ambiente-badge">${esProduccion ? '● PRODUCCIÓN' : '● PRUEBAS'}</div>
      </div>

      <div class="header-right">
        <div class="empresa-info">
          <div><strong>Obligado contab.:</strong> ${obligadoContabilidad}</div>
          ${contribuyenteEspecial ? `<div><strong>Contrib. Especial:</strong> ${contribuyenteEspecial}</div>` : ''}
          <div><strong>Tipo Emisión:</strong> ${tipoEmision}</div>
          <div><strong>Moneda:</strong> DÓLAR</div>
        </div>
      </div>
    </div>

    ${claveAcceso ? `
    <div class="clave-section">
      <div class="clave-left">
        <div class="clave-label">Clave de Acceso</div>
        <div class="clave-valor">${claveFormateada}</div>
        <div class="autorizacion-info">
          <div><strong>Nº Autorización:</strong> ${numeroAutorizacion}</div>
          <div><strong>Fecha Autorización:</strong> ${fechaAutorizacion}</div>
        </div>
      </div>
      <div class="barcode-container">
        ${barcodeHtml}
        <div class="barcode-numero">${escHtml(claveAcceso)}</div>
      </div>
    </div>
    ` : ''}

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
        ${dirCliente ? `<div class="cliente-row"><span class="cliente-row-label">Dirección:</span><span class="cliente-row-value">${dirCliente}</span></div>` : ''}
      </div>

      <div class="cliente-box">
        <div class="cliente-box-title">Datos de Contacto</div>
        ${telCliente ? `<div class="cliente-row"><span class="cliente-row-label">Teléfono:</span><span class="cliente-row-value">${telCliente}</span></div>` : ''}
        ${emailCliente ? `<div class="cliente-row"><span class="cliente-row-label">Email:</span><span class="cliente-row-value">${emailCliente}</span></div>` : ''}
        <div class="cliente-row"><span class="cliente-row-label">Forma Pago:</span><span class="cliente-row-value">${formaPago}</span></div>
        <div class="cliente-row"><span class="cliente-row-label">Estado:</span><span class="cliente-row-value">${estadoPago}</span></div>
      </div>
    </div>

    <div class="detalles-section">
      <div class="detalles-title">Detalle de Productos y Servicios</div>
      <table class="detalles-table">
        ${esTicket ? `
          <thead><tr><th class="text-center">#</th><th>Producto</th><th class="text-center">Cant</th><th class="text-right">P.U.</th><th class="text-right">Total</th></tr></thead>
        ` : `
          <thead><tr><th style="width:30px;" class="text-center">#</th><th>Descripción</th><th style="width:70px;" class="text-center">Cant.</th><th style="width:80px;" class="text-right">P. Unit.</th><th style="width:70px;" class="text-right">Desc.</th><th style="width:60px;" class="text-center">IVA</th><th style="width:90px;" class="text-right">Subtotal</th></tr></thead>
        `}
        <tbody>
          ${detallesHtml || `<tr><td colspan="${esTicket ? 5 : 7}" class="text-center" style="padding:20px;color:#888;">Sin detalles registrados</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="totales-section">
      <div class="totales-box">
        <div class="total-row"><span class="label">Subtotal</span><span class="value">$${n2(subtotal)}</span></div>
        <div class="total-row"><span class="label">IVA 15%</span><span class="value">$${n2(iva)}</span></div>
        <div class="total-row"><span class="label">Descuento</span><span class="value">$0.00</span></div>
        <div class="total-final"><span class="label">TOTAL A PAGAR</span><span class="value">$${n2(total)}</span></div>
      </div>
    </div>

    ${observaciones ? `<div class="info-adicional"><div class="info-adicional-title">Información Adicional</div><div>${observaciones}</div></div>` : ''}

    <div class="firma-section">
      <div class="firma-box"><div class="firma-line"></div><div class="firma-label">Firma del Cliente</div></div>
      <div class="firma-box"><div class="firma-line"></div><div class="firma-label">${razonSocialEmisor}</div></div>
    </div>

    <div class="footer">
      <div><strong>Documento generado por Sistema Contable</strong></div>
      <div>${razonSocialEmisor} — RUC: ${rucEmisor}</div>
      <div>Formato: ${escHtml(formato)} | Generado: ${escHtml(fmtFechaHora(new Date()))}</div>
      ${claveAcceso ? `<div style="margin-top:6px;font-size:0.9em;">Representación impresa de un comprobante electrónico autorizado por el SRI</div>` : ''}
    </div>
  </div>

  <script>
    // Espera a que TODAS las fuentes y el DOM estén listos antes de imprimir
    (function() {
      function dispararImpresion() {
        try {
          window.focus()
          window.print()
        } catch (e) {
          console.error('Error al imprimir:', e)
        }
      }

      function cuandoListo(cb) {
        if (document.readyState === 'complete') {
          cb()
          return
        }
        window.addEventListener('load', cb, { once: true })
      }

      cuandoListo(function() {
        var fuentesListas = (document.fonts && document.fonts.ready)
          ? document.fonts.ready
          : Promise.resolve()

        fuentesListas.then(function() {
          // Pequeño delay para que el navegador pinte el layout
          setTimeout(dispararImpresion, 200)
        }).catch(function() {
          setTimeout(dispararImpresion, 400)
        })
      })

      window.onafterprint = function() {
        setTimeout(function() {
          try { window.close() } catch (e) {}
        }, 100)
      }
    })()
  <\/script>
</body>
</html>`
  }
}