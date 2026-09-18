// frontend/src/services/pdfService.js
// ============================================================
// Generación de PDF del RIDE — formato profesional A4.
// ------------------------------------------------------------
// Un solo lugar para generar el PDF del comprobante. Lo usan:
//   - Botón "PDF" del preview
//   - Adjunto del email (como base64)
//
// Incluye layout específico para:
//   - Facturas / notas / liquidaciones: cliente + condiciones
//   - Guías de remisión: destinatario + transportista + traslado
//
// 🔧 FIX 2025-XX: detección de `guia_remision` → el bloque de
//    cliente se reemplaza por 3 bloques específicos de guía.
// ============================================================
'use strict'

import { api } from './api'

const COLORS = Object.freeze({
  navy: [26, 58, 92],
  gray50: [248, 249, 250],
  gray100: [238, 241, 245],
  gray200: [222, 226, 230],
  gray600: [108, 117, 125],
  gray800: [52, 58, 64],
  ok: [30, 126, 52],
  warn: [230, 126, 34],
  err: [192, 57, 43],
  white: [255, 255, 255],
  text: [26, 26, 26]
})

const LAYOUT = Object.freeze({
  pageWidth: 210,
  pageHeight: 297,
  marginLeft: 12,
  marginRight: 12,
  marginTop: 12,
  marginBottom: 16
})

// ============================================================
// HELPERS
// ============================================================
const n2 = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

const n2m = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0.00'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fmtFecha = (f) => {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })
  } catch { return '—' }
}

const fmtFechaHora = (f) => {
  if (!f) return ''
  try {
    return new Date(f).toLocaleString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch { return '' }
}

const labelTipo = (t) =>
  ({
    factura: 'FACTURA',
    guia_remision: 'GUÍA DE REMISIÓN',
    exportacion: 'FACTURA DE EXPORTACIÓN',
    reembolso: 'FACTURA DE REEMBOLSO',
    retencion: 'COMPROBANTE DE RETENCIÓN',
    liquidacion: 'LIQUIDACIÓN DE COMPRA',
    nota_credito: 'NOTA DE CRÉDITO',
    nota_debito: 'NOTA DE DÉBITO',
    proforma: 'PROFORMA',
    compras: 'COMPRA'
  }[t] || 'DOCUMENTO')

const esGuiaRemision = (doc) =>
  String(doc?.tipo_documento || '').toLowerCase() === 'guia_remision'

const getTipoIdentLabel = (codigo) => {
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
// FETCH QR
// ============================================================
async function obtenerQR(doc, qrYaCargado) {
  if (qrYaCargado) return qrYaCargado
  if (!doc?._id || !doc?.clave_acceso) return null

  try {
    const res = await api.request(`/ventas/${doc._id}/qr`, {
      method: 'GET',
      skipLoader: true
    })
    return res?.qr || null
  } catch (e) {
    console.warn('QR no disponible para PDF:', e?.message)
    return null
  }
}

// ============================================================
// PRIMITIVAS
// ============================================================
function setColorText(pdf, [r, g, b]) { pdf.setTextColor(r, g, b) }
function setColorFill(pdf, [r, g, b]) { pdf.setFillColor(r, g, b) }
function setColorDraw(pdf, [r, g, b]) { pdf.setDrawColor(r, g, b) }

function dibujarCajaDatos(pdf, { x, y, width, title, filas }) {
  const padding = 3
  const rowH = 5
  const titleH = 6

  const contenidoH = Math.max(1, filas.length) * rowH
  const height = titleH + contenidoH + padding * 2

  setColorFill(pdf, COLORS.gray50)
  setColorDraw(pdf, COLORS.gray200)
  pdf.setLineWidth(0.2)
  pdf.roundedRect(x, y, width, height, 1.5, 1.5, 'FD')

  setColorText(pdf, COLORS.navy)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text(String(title || '').toUpperCase(), x + padding, y + 4.5)

  setColorDraw(pdf, COLORS.gray200)
  pdf.line(x + padding, y + titleH, x + width - padding, y + titleH)

  let fy = y + titleH + rowH - 1
  for (const f of filas) {
    const label = f[0]
    const value = f[1] ?? '—'
    setColorText(pdf, COLORS.gray600)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.text(`${label}:`, x + padding, fy)
    setColorText(pdf, COLORS.text)
    pdf.setFont('helvetica', 'normal')
    pdf.text(String(value), x + padding + 24, fy, {
      maxWidth: width - padding - 26
    })
    fy += rowH
  }

  return height
}

function dibujarMarcaDeAgua(pdf) {
  try {
    if (typeof pdf.saveGraphicsState === 'function') {
      pdf.saveGraphicsState()
      if (typeof pdf.setGState === 'function' && pdf.GState) {
        pdf.setGState(new pdf.GState({ opacity: 0.07 }))
      }
      setColorText(pdf, COLORS.warn)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(90)
      pdf.text('PRUEBAS', LAYOUT.pageWidth / 2, LAYOUT.pageHeight / 2, {
        align: 'center', angle: 30
      })
      pdf.restoreGraphicsState()
    } else {
      setColorText(pdf, [235, 220, 200])
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(90)
      pdf.text('PRUEBAS', LAYOUT.pageWidth / 2, LAYOUT.pageHeight / 2, {
        align: 'center', angle: 30
      })
    }
  } catch { /* cosmético */ }
}

// ============================================================
// HEADER
// ============================================================
function dibujarHeader(pdf, doc, config) {
  const { marginLeft: ml, marginRight: mr, marginTop: mt, pageWidth: pw } = LAYOUT
  const usableW = pw - ml - mr

  const emisorNombre = doc.razon_social_emisor || config?.razon_social || 'MI EMPRESA'
  const emisorRUC = doc.ruc_emisor || config?.ruc || ''
  const dirMatriz = config?.direccion_matriz || ''
  const dirSucursal = config?.direccion_establecimiento || dirMatriz
  const telefono = config?.telefono || ''
  const emailEmpresa = config?.email || ''

  const boxW = 62
  const boxH = 26
  const boxX = ml + usableW - boxW
  const boxY = mt

  setColorDraw(pdf, COLORS.navy)
  pdf.setLineWidth(0.5)
  setColorFill(pdf, COLORS.white)
  pdf.roundedRect(boxX, boxY, boxW, boxH, 1.5, 1.5, 'FD')

  setColorText(pdf, COLORS.navy)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text(labelTipo(doc.tipo_documento), boxX + boxW / 2, boxY + 7, { align: 'center' })

  setColorDraw(pdf, COLORS.gray200)
  pdf.setLineWidth(0.2)
  pdf.line(boxX + 3, boxY + 8.5, boxX + boxW - 3, boxY + 8.5)

  const numero = doc.numero_factura || doc.numero_guia || 'N/A'
  setColorText(pdf, COLORS.err)
  pdf.setFont('courier', 'bold')
  pdf.setFontSize(10)
  pdf.text(`Nº ${numero}`, boxX + boxW / 2, boxY + 14, { align: 'center' })

  const esProd = doc.ambiente_sri === '2'
  const ambColor = esProd ? COLORS.ok : COLORS.warn
  const ambText = esProd ? '● PRODUCCIÓN' : '● PRUEBAS'
  const badgeW = 26
  const badgeH = 4.5
  const badgeX = boxX + (boxW - badgeW) / 2
  const badgeY = boxY + 17
  setColorFill(pdf, ambColor)
  pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, 2.25, 2.25, 'F')
  setColorText(pdf, COLORS.white)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.5)
  pdf.text(ambText, badgeX + badgeW / 2, badgeY + 3.2, { align: 'center' })

  setColorText(pdf, COLORS.gray600)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.text(`Fecha: ${fmtFecha(doc.fecha_emision)}`, boxX + boxW / 2, boxY + 24, { align: 'center' })

  let y = mt
  const logoSize = 12
  const logoX = ml
  const logoY = y
  setColorFill(pdf, COLORS.navy)
  pdf.roundedRect(logoX, logoY, logoSize, logoSize, 2, 2, 'F')
  setColorText(pdf, COLORS.white)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text(emisorNombre.charAt(0).toUpperCase(), logoX + logoSize / 2, logoY + 8.5, { align: 'center' })

  setColorText(pdf, COLORS.navy)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text(emisorNombre, logoX + logoSize + 3, logoY + 4)
  setColorText(pdf, COLORS.gray800)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text(`RUC: ${emisorRUC}`, logoX + logoSize + 3, logoY + 9)

  setColorText(pdf, COLORS.gray600)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  let infoY = logoY + 14
  const infoX = ml
  if (dirMatriz) {
    pdf.text(`Dir. Matriz: ${dirMatriz}`, infoX, infoY, { maxWidth: usableW - boxW - 4 })
    infoY += 3.5
  }
  if (dirSucursal && dirSucursal !== dirMatriz) {
    pdf.text(`Dir. Sucursal: ${dirSucursal}`, infoX, infoY, { maxWidth: usableW - boxW - 4 })
    infoY += 3.5
  }
  const contacto = [telefono && `Tel: ${telefono}`, emailEmpresa && emailEmpresa].filter(Boolean).join(' · ')
  if (contacto) {
    pdf.text(contacto, infoX, infoY, { maxWidth: usableW - boxW - 4 })
  }

  const lineY = mt + Math.max(boxH, infoY - mt + 3) + 2
  setColorDraw(pdf, COLORS.navy)
  pdf.setLineWidth(0.8)
  pdf.line(ml, lineY, pw - mr, lineY)

  return lineY + 4
}

// ============================================================
// CLAVE + QR
// ============================================================
function dibujarClaveYQR(pdf, doc, qrDataUrl, yInicial) {
  const { marginLeft: ml, marginRight: mr, pageWidth: pw } = LAYOUT
  const usableW = pw - ml - mr
  const sectionH = 26
  const qrSize = 22

  setColorFill(pdf, COLORS.gray50)
  setColorDraw(pdf, COLORS.gray100)
  pdf.setLineWidth(0.2)
  pdf.roundedRect(ml, yInicial, usableW, sectionH, 2, 2, 'FD')

  setColorFill(pdf, COLORS.navy)
  pdf.rect(ml, yInicial, 1.5, sectionH, 'F')

  if (qrDataUrl) {
    try {
      pdf.addImage(qrDataUrl, 'PNG', ml + usableW - qrSize - 4, yInicial + (sectionH - qrSize) / 2, qrSize, qrSize)
    } catch { /* ignorar */ }
  }

  setColorText(pdf, COLORS.navy)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('CLAVE DE ACCESO', ml + 4, yInicial + 5)

  const clave = String(doc.clave_acceso || '')
  const claveChunks = clave.match(/.{1,12}/g) || []
  setColorText(pdf, COLORS.navy)
  pdf.setFont('courier', 'bold')
  pdf.setFontSize(8)
  pdf.text(claveChunks.join(' '), ml + 4, yInicial + 10, { maxWidth: usableW - qrSize - 12 })

  setColorText(pdf, COLORS.gray600)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  let infoY = yInicial + 15
  if (doc.numero_autorizacion) {
    setColorText(pdf, COLORS.ok)
    pdf.setFont('helvetica', 'bold')
    pdf.text('✓ Autorizado por el SRI', ml + 4, infoY)
    infoY += 3.5
    setColorText(pdf, COLORS.gray600)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`Nº Autorización: ${doc.numero_autorizacion}`, ml + 4, infoY, { maxWidth: usableW - qrSize - 12 })
    infoY += 3.5
    if (doc.fecha_autorizacion) {
      pdf.text(`Fecha Autorización: ${fmtFechaHora(doc.fecha_autorizacion)}`, ml + 4, infoY)
    }
  } else {
    setColorText(pdf, COLORS.warn)
    pdf.setFont('helvetica', 'bold')
    pdf.text('⚠ Pendiente de autorización por el SRI', ml + 4, infoY)
    infoY += 4
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.text(`Documento generado: ${fmtFechaHora(new Date())}`, ml + 4, infoY)
  }

  return yInicial + sectionH + 4
}

// ============================================================
// CLIENTE / PROVEEDOR / DESTINATARIO + CONDICIONES
// ============================================================
function dibujarClienteYCondiciones(pdf, doc, yInicial) {
  const { marginLeft: ml, marginRight: mr, pageWidth: pw } = LAYOUT
  const usableW = pw - ml - mr
  const gap = 4
  const boxW = (usableW - gap) / 2

  const esGuia = esGuiaRemision(doc)

  if (esGuia) {
    // ===== GUÍA: 3 bloques =====
    // Fila 1: Destinatario + Datos del documento
    const filasDest = [
      ['Razón social', doc.destinatario_razon_social || doc.cliente?.nombre || '—'],
      ['Identificación', doc.destinatario_identificacion || doc.cliente?.ruc || '—']
    ]
    if (doc.destinatario_tipo) {
      filasDest.push(['Tipo ID', getTipoIdentLabel(doc.destinatario_tipo)])
    }
    if (doc.destinatario_direccion) {
      filasDest.push(['Dir. destino', doc.destinatario_direccion])
    }

    const h1 = dibujarCajaDatos(pdf, {
      x: ml,
      y: yInicial,
      width: boxW,
      title: 'Datos del Destinatario',
      filas: filasDest
    })

    const filasDoc = [
      ['Motivo', doc.motivo || '—']
    ]
    if (doc.ruta) filasDoc.push(['Ruta', doc.ruta])
    filasDoc.push(['Estado', String(doc.estado_sri || doc.estado_pago || 'PENDIENTE').toUpperCase()])
    if (doc.documento_aduana) filasDoc.push(['Doc. aduanero', doc.documento_aduana])

    const h2 = dibujarCajaDatos(pdf, {
      x: ml + boxW + gap,
      y: yInicial,
      width: boxW,
      title: 'Datos del Documento',
      filas: filasDoc
    })

    let y = yInicial + Math.max(h1, h2) + 4

    // Fila 2: Transportista + Traslado
    const filasTransp = [
      ['Razón social', doc.transportista_razon_social || doc.transportista || '—'],
      ['Identificación', doc.transportista_identificacion || '—']
    ]
    if (doc.transportista_tipo) {
      filasTransp.push(['Tipo ID', getTipoIdentLabel(doc.transportista_tipo)])
    }
    if (doc.transportista_correo) {
      filasTransp.push(['Correo', doc.transportista_correo])
    }

    const h3 = dibujarCajaDatos(pdf, {
      x: ml,
      y,
      width: boxW,
      title: 'Datos del Transportista',
      filas: filasTransp
    })

    const filasTraslado = [
      ['Dir. partida', doc.direccion_partida || '—']
    ]
    if (doc.inicio_transporte) {
      filasTraslado.push(['Inicio', fmtFechaHora(doc.inicio_transporte)])
    }
    if (doc.fin_transporte) {
      filasTraslado.push(['Fin', fmtFechaHora(doc.fin_transporte)])
    }
    filasTraslado.push(['Placa', doc.placa_transporte || doc.placa || '—'])

    const h4 = dibujarCajaDatos(pdf, {
      x: ml + boxW + gap,
      y,
      width: boxW,
      title: 'Datos del Traslado',
      filas: filasTraslado
    })

    return y + Math.max(h3, h4) + 4
  }

  // ===== FACTURA / NOTA / LIQUIDACIÓN: cliente o proveedor + condiciones =====
  const contraparte = doc.cliente || doc.proveedor || {}
  const esVenta = Boolean(doc.cliente)

  const filasCliente = [
    ['Razón social', contraparte.nombre || 'Consumidor Final'],
    ['RUC/Cédula', contraparte.ruc || '9999999999999']
  ]
  if (contraparte.direccion) filasCliente.push(['Dirección', contraparte.direccion])
  if (contraparte.telefono) filasCliente.push(['Teléfono', contraparte.telefono])
  if (contraparte.email) filasCliente.push(['Email', contraparte.email])

  const hIzq = dibujarCajaDatos(pdf, {
    x: ml,
    y: yInicial,
    width: boxW,
    title: esVenta ? 'Información del Cliente' : 'Información del Proveedor',
    filas: filasCliente
  })

  const filasCond = [
    ['Forma pago', doc.forma_pago || 'Sin sistema financiero'],
    ['Estado', String(doc.estado_pago || doc.estado_sri || 'PENDIENTE').toUpperCase()],
    ['Moneda', 'DÓLAR'],
    ['Tipo emisión', 'NORMAL'],
    ['Obligado cont.', doc.obligado_contabilidad ? 'SÍ' : 'NO']
  ]
  const hDer = dibujarCajaDatos(pdf, {
    x: ml + boxW + gap,
    y: yInicial,
    width: boxW,
    title: 'Condiciones del Documento',
    filas: filasCond
  })

  return yInicial + Math.max(hIzq, hDer) + 4
}

// ============================================================
// TABLA
// ============================================================
function dibujarTablaItems(pdf, autoTable, doc, yInicial, obtenerNombreProducto) {
  const detalles = Array.isArray(doc.detalles) ? doc.detalles : []
  const esGuia = esGuiaRemision(doc)

  const { marginLeft: ml, marginRight: mr, pageWidth: pw } = LAYOUT
  setColorText(pdf, COLORS.navy)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  pdf.text(
    esGuia ? 'DETALLE DE PRODUCTOS A TRASLADAR' : 'DETALLE DE PRODUCTOS Y SERVICIOS',
    ml,
    yInicial
  )
  const underlineY = yInicial + 1.5
  setColorDraw(pdf, COLORS.navy)
  pdf.setLineWidth(0.5)
  pdf.line(ml, underlineY, pw - mr, underlineY)

  const startY = underlineY + 3

  let head
  let body
  let columnStyles

  if (esGuia) {
    head = [['#', 'Descripción', 'Cant.']]
    body = detalles.map((d, idx) => {
      const cantidad = Number(d.cantidad) || 0
      const nombre = d.nombre || d.descripcion || obtenerNombreProducto(d.productoId)
      return [String(idx + 1), nombre, n2(cantidad)]
    })
    columnStyles = {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 20, halign: 'center' }
    }
  } else {
    head = [['#', 'Descripción', 'Cant.', 'P. Unit.', 'Desc.', 'IVA', 'Subtotal']]
    body = detalles.map((d, idx) => {
      const cantidad = Number(d.cantidad) || 0
      const precioUnit = Number(d.precio_unitario ?? d.costo_unitario) || 0
      const descuento = Number(d.descuento) || 0
      const subtotalItem = cantidad * precioUnit - descuento
      const aplicaIVA = d.aplica_iva !== false
      const nombre = d.nombre || d.descripcion || obtenerNombreProducto(d.productoId)
      return [
        String(idx + 1),
        nombre,
        n2(cantidad),
        `$${n2m(precioUnit)}`,
        `$${n2m(descuento)}`,
        aplicaIVA ? '15%' : '0%',
        `$${n2m(subtotalItem)}`
      ]
    })
    columnStyles = {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }
    }
  }

  if (body.length === 0) {
    body.push(
      esGuia
        ? ['—', 'Sin productos a trasladar', '—']
        : ['—', 'Sin detalles registrados', '—', '—', '—', '—', '—']
    )
  }

  autoTable(pdf, {
    startY,
    head,
    body,
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.navy,
      textColor: COLORS.white,
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 2
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: COLORS.text
    },
    alternateRowStyles: { fillColor: COLORS.gray50 },
    columnStyles,
    margin: { left: ml, right: mr },
    showHead: 'everyPage'
  })

  return pdf.lastAutoTable.finalY + 6
}

// ============================================================
// TOTALES (no aplica a guías)
// ============================================================
function dibujarTotales(pdf, doc, yInicial) {
  const { marginLeft: ml, marginRight: mr, pageWidth: pw } = LAYOUT
  const boxW = 82
  const boxX = ml + (pw - ml - mr) - boxW
  const rowH = 6
  const filas = [
    ['Subtotal', `$${n2m(doc.subtotal)}`],
    ['Descuento', '$0.00'],
    ['IVA 15%', `$${n2m(doc.iva)}`]
  ]

  const boxH = filas.length * rowH + rowH + 2

  setColorFill(pdf, COLORS.white)
  setColorDraw(pdf, COLORS.gray200)
  pdf.setLineWidth(0.2)
  pdf.roundedRect(boxX, yInicial, boxW, boxH, 1.5, 1.5, 'FD')

  let y = yInicial + rowH - 1
  for (const [k, v] of filas) {
    setColorText(pdf, COLORS.gray600)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.text(k, boxX + 4, y)
    setColorText(pdf, COLORS.text)
    pdf.setFont('courier', 'normal')
    pdf.text(v, boxX + boxW - 4, y, { align: 'right' })
    setColorDraw(pdf, COLORS.gray100)
    pdf.setLineWidth(0.15)
    pdf.line(boxX + 2, y + 1.8, boxX + boxW - 2, y + 1.8)
    y += rowH
  }

  const finalY = yInicial + filas.length * rowH
  setColorFill(pdf, COLORS.navy)
  pdf.rect(boxX + 0.3, finalY + 0.2, boxW - 0.6, rowH - 0.4, 'F')
  setColorText(pdf, COLORS.white)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9.5)
  pdf.text('TOTAL A PAGAR', boxX + 4, finalY + 4.2)
  pdf.setFont('courier', 'bold')
  pdf.setFontSize(11)
  pdf.text(`$${n2m(doc.total)}`, boxX + boxW - 4, finalY + 4.3, { align: 'right' })

  return finalY + rowH + 6
}

// ============================================================
// INFO ADICIONAL + FIRMA
// ============================================================
function dibujarInfoAdicional(pdf, doc, yInicial) {
  if (!doc.observaciones) return yInicial

  const { marginLeft: ml, marginRight: mr, pageWidth: pw } = LAYOUT
  const usableW = pw - ml - mr
  const padding = 3

  const texto = String(doc.observaciones)
  setColorText(pdf, COLORS.gray800)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  const lines = pdf.splitTextToSize(texto, usableW - padding * 2 - 2)
  const height = lines.length * 3.5 + padding * 2 + 5

  setColorFill(pdf, [253, 246, 227])
  setColorDraw(pdf, COLORS.warn)
  pdf.setLineWidth(0.2)
  pdf.roundedRect(ml, yInicial, usableW, height, 1.5, 1.5, 'FD')

  setColorFill(pdf, COLORS.warn)
  pdf.rect(ml, yInicial, 1.2, height, 'F')

  setColorText(pdf, [138, 109, 59])
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.text('INFORMACIÓN ADICIONAL', ml + 4, yInicial + 4)

  setColorText(pdf, [90, 74, 30])
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  let fy = yInicial + 8
  for (const line of lines) {
    pdf.text(line, ml + 4, fy)
    fy += 3.5
  }

  return yInicial + height + 4
}

function dibujarFirma(pdf, doc, yInicial) {
  const { marginLeft: ml, marginRight: mr, pageWidth: pw } = LAYOUT
  const usableW = pw - ml - mr
  const blockH = 20
  const esGuia = esGuiaRemision(doc)

  const y = yInicial + 4
  const colW = usableW / 2

  setColorDraw(pdf, COLORS.gray800)
  pdf.setLineWidth(0.3)
  pdf.line(ml + 15, y + 10, ml + colW - 15, y + 10)
  setColorText(pdf, COLORS.gray600)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.text(
    esGuia ? 'Recibí Conforme (Destinatario)' : 'Firma del Cliente',
    ml + colW / 2, y + 14, { align: 'center' }
  )

  pdf.line(ml + colW + 15, y + 10, pw - mr - 15, y + 10)
  const emisorNombre = doc.razon_social_emisor || 'Emisor'
  pdf.text(emisorNombre, ml + colW + colW / 2, y + 14, { align: 'center' })

  return y + blockH
}

// ============================================================
// FOOTER EN TODAS LAS PÁGINAS
// ============================================================
function dibujarFooterTodasLasPaginas(pdf, doc, config) {
  const { marginLeft: ml, marginRight: mr, pageWidth: pw, pageHeight: ph, marginBottom: mb } = LAYOUT
  const total = pdf.getNumberOfPages()
  const emisorNombre = doc.razon_social_emisor || config?.razon_social || ''
  const emisorRUC = doc.ruc_emisor || config?.ruc || ''

  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    const fy = ph - mb + 4

    setColorDraw(pdf, COLORS.navy)
    pdf.setLineWidth(0.4)
    pdf.line(ml, fy - 4, pw - mr, fy - 4)

    setColorText(pdf, COLORS.gray600)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.5)
    pdf.text(
      'Documento generado por Sistema Contable · Representación impresa de un comprobante electrónico',
      ml, fy
    )

    if (emisorNombre) {
      const centro = `${emisorNombre}${emisorRUC ? ' — RUC: ' + emisorRUC : ''}`
      pdf.text(centro, pw / 2, fy + 3, { align: 'center' })
    }

    pdf.setFont('helvetica', 'bold')
    setColorText(pdf, COLORS.navy)
    pdf.setFontSize(7)
    pdf.text(`Página ${i} de ${total}`, pw - mr, fy, { align: 'right' })
  }
}

// ============================================================
// API PÚBLICA
// ============================================================
export const pdfService = {
  async generarRIDE(doc, opts = {}) {
    if (!doc || typeof doc !== 'object') {
      throw new Error('generarRIDE: doc inválido')
    }

    const {
      qrDataUrl = null,
      config = null,
      obtenerNombreProducto = () => 'Producto'
    } = opts

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ])

    const qr = await obtenerQR(doc, qrDataUrl)
    const esGuia = esGuiaRemision(doc)

    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
      compress: true
    })

    if (doc.ambiente_sri !== '2') {
      dibujarMarcaDeAgua(pdf)
    }

    let y = dibujarHeader(pdf, doc, config)
    if (doc.clave_acceso) {
      y = dibujarClaveYQR(pdf, doc, qr, y)
    }
    y = dibujarClienteYCondiciones(pdf, doc, y)
    y = dibujarTablaItems(pdf, autoTable, doc, y, obtenerNombreProducto)

    // Solo mostramos totales si NO es guía de remisión.
    if (!esGuia) {
      y = dibujarTotales(pdf, doc, y)
    }

    y = dibujarInfoAdicional(pdf, doc, y)

    if (y + 30 < LAYOUT.pageHeight - LAYOUT.marginBottom - 10) {
      dibujarFirma(pdf, doc, y)
    }

    dibujarFooterTodasLasPaginas(pdf, doc, config)

    return pdf
  },

  async descargarRIDE(doc, opts = {}) {
    const pdf = await this.generarRIDE(doc, opts)

    const tipo = String(doc.tipo_documento || 'documento').toUpperCase().replace(/_/g, '-')
    const numero = doc.numero_factura || doc.numero_guia || 'sin_numero'
    const fecha = new Date().toISOString().slice(0, 10)
    const filename = `${tipo}_${numero}_${fecha}.pdf`

    pdf.save(filename)
    return filename
  },

  async generarRIDEBase64(doc, opts = {}) {
    const pdf = await this.generarRIDE(doc, opts)
    const dataUri = pdf.output('datauristring')
    return dataUri.split(',')[1]
  }
}