// backend/utils/qrGenerator.js
const QRCode = require('qrcode');

/**
 * Genera un código QR con la información del comprobante.
 * El SRI exige que el QR contenga:
 * - RUC del emisor
 * - Tipo de comprobante
 * - Número de comprobante
 * - Fecha de emisión
 * - Monto total
 * - Clave de acceso
 *
 * @param {object} data
 * @returns {Promise<{ dataUrl: string, buffer: Buffer }>}
 */
async function generarQRComprobante(data) {
  const {
    ruc,
    tipoComprobante,
    numeroComprobante,
    fechaEmision,
    montoTotal,
    claveAcceso
  } = data;

  // Formato oficial del SRI para el QR
  const contenido = JSON.stringify({
    ruc: ruc || '',
    tipo: tipoComprobante || '01',
    numero: numeroComprobante || '',
    fecha: fechaEmision || '',
    monto: parseFloat(montoTotal || 0).toFixed(2),
    clave: claveAcceso || ''
  });

  try {
    // Data URL para incrustar en HTML
    const dataUrl = await QRCode.toDataURL(contenido, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 1,
      width: 200,
      color: {
        dark: '#1a3a5c',
        light: '#ffffff'
      }
    });

    // Buffer PNG para embeber en PDF
    const buffer = await QRCode.toBuffer(contenido, {
      errorCorrectionLevel: 'M',
      type: 'png',
      margin: 1,
      width: 200,
      color: {
        dark: '#1a3a5c',
        light: '#ffffff'
      }
    });

    return { dataUrl, buffer };
  } catch (err) {
    console.error('Error generando QR:', err);
    return { dataUrl: '', buffer: null };
  }
}

/**
 * Genera el QR con formato simplificado (solo la clave de acceso).
 * Útil para verificaciones rápidas.
 */
async function generarQRClaveAcceso(claveAcceso) {
  try {
    const dataUrl = await QRCode.toDataURL(claveAcceso, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 1,
      width: 200
    });
    return dataUrl;
  } catch (err) {
    console.error('Error generando QR:', err);
    return '';
  }
}

module.exports = { generarQRComprobante, generarQRClaveAcceso };