// backend/utils/qrGenerator.js
// Genera códigos QR para comprobantes electrónicos del SRI.

const QRCode = require('qrcode');

/**
 * Formato oficial del QR del SRI (desde 2020):
 * El QR contiene directamente la clave de acceso de 49 dígitos.
 * Es lo más compatible con las apps de verificación del SRI.
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

  if (!claveAcceso || claveAcceso.length !== 49) {
    console.warn('QR: clave de acceso inválida o ausente');
    return { dataUrl: '', buffer: null };
  }

  // Verificador del SRI usa la clave directamente
  const contenido = claveAcceso;

  try {
    const dataUrl = await QRCode.toDataURL(contenido, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 1,
      width: 200,
      color: { dark: '#1a3a5c', light: '#ffffff' }
    });

    const buffer = await QRCode.toBuffer(contenido, {
      errorCorrectionLevel: 'M',
      type: 'png',
      margin: 1,
      width: 200,
      color: { dark: '#1a3a5c', light: '#ffffff' }
    });

    return { dataUrl, buffer };
  } catch (err) {
    console.error('Error generando QR:', err);
    return { dataUrl: '', buffer: null };
  }
}

async function generarQRClaveAcceso(claveAcceso) {
  try {
    return await QRCode.toDataURL(claveAcceso, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 1,
      width: 200
    });
  } catch (err) {
    console.error('Error generando QR:', err);
    return '';
  }
}

module.exports = { generarQRComprobante, generarQRClaveAcceso };