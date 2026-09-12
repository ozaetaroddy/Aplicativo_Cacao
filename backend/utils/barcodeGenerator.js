// frontend/src/utils/barcodeGenerator.js
// Generador profesional de códigos de barras (Code128 y EAN-13) en SVG puro.
// Sin dependencias externas.
//
// Code128C: óptimo para claves de acceso del SRI (49 dígitos).
// EAN-13: estándar para productos (etiquetas de venta).

// ============================================================
// CODE 128
// ============================================================
// Patrones oficiales (cada símbolo es una secuencia de 11 módulos).
// El último (index 106) es el STOP (13 módulos).
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
  '11010011100', '1100011101011' // STOP
];

const CODE128_START_C = 105;
const CODE128_STOP = 106;

/**
 * Convierte una cadena de dígitos en la secuencia de módulos binarios
 * usando Code128 subset C (más eficiente para dígitos).
 * @param {string} data - Cadena de dígitos (longitud par, o se hace par automáticamente)
 * @returns {string} Cadena de '0' y '1' (1 = barra negra)
 */
function generarBitsCode128C(data) {
  if (!/^\d+$/.test(data)) {
    throw new Error('Code128C solo acepta dígitos');
  }
  // Code128C requiere longitud par; si es impar, agregamos un 0 al inicio
  if (data.length % 2 !== 0) data = '0' + data;

  // Construir símbolos: START_C + pares de dígitos
  const symbols = [CODE128_START_C];
  for (let i = 0; i < data.length; i += 2) {
    symbols.push(parseInt(data.substr(i, 2), 10));
  }

  // Checksum: (START + Σ(símbolo_i × posición_i)) mod 103
  let checksum = CODE128_START_C;
  for (let i = 1; i < symbols.length; i++) {
    checksum += symbols[i] * i;
  }
  checksum = checksum % 103;
  symbols.push(checksum);

  // STOP
  symbols.push(CODE128_STOP);

  // Concatenar patrones
  let bits = '';
  for (const sym of symbols) {
    bits += CODE128_PATTERNS[sym];
  }
  return bits;
}

// ============================================================
// EAN-13
// ============================================================
const EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];

// Paridad del primer dígito
const EAN_PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
];

/**
 * Calcula el dígito verificador de un EAN-13 (12 dígitos → 13).
 */
function calcularChecksumEAN13(data12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(data12[i], 10);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Genera los bits de un EAN-13.
 * @param {string} data - 12 o 13 dígitos. Si son 12, se calcula el 13vo.
 */
function generarBitsEAN13(data) {
  if (!/^\d+$/.test(data)) throw new Error('EAN-13 solo acepta dígitos');
  if (data.length === 12) {
    data = data + String(calcularChecksumEAN13(data));
  }
  if (data.length !== 13) {
    throw new Error('EAN-13 debe tener 12 o 13 dígitos');
  }

  const first = parseInt(data[0], 10);
  const parity = EAN_PARITY[first];

  let bits = '101'; // START GUARD

  // 6 dígitos (posiciones 1-6) usando L o G según paridad
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(data[i + 1], 10);
    bits += parity[i] === 'L' ? EAN_L[digit] : EAN_G[digit];
  }

  bits += '01010'; // MIDDLE GUARD

  // 6 dígitos (posiciones 7-12) usando R
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(data[i + 7], 10);
    bits += EAN_R[digit];
  }

  bits += '101'; // END GUARD

  return bits;
}

// ============================================================
// SVG BUILDER
// ============================================================

/**
 * Convierte una cadena de bits ('0'/'1') en un SVG de código de barras.
 * @param {string} bits
 * @param {object} opts - { width, height, quietZone, color }
 */
function bitsToSVG(bits, opts = {}) {
  const {
    height = 60,
    quietZone = 10, // módulos a cada lado
    color = '#1a1a1a',
    moduleWidth = 1
  } = opts;

  const totalModules = bits.length + quietZone * 2;
  const totalWidth = totalModules * moduleWidth;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges">`;

  // Fondo blanco (útil para impresión / escaneo)
  svg += `<rect x="0" y="0" width="${totalWidth}" height="${height}" fill="#ffffff"/>`;

  // Dibujar barras
  let x = quietZone * moduleWidth;
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let w = 0;
      while (i < bits.length && bits[i] === '1') { w++; i++; }
      svg += `<rect x="${x}" y="0" width="${w * moduleWidth}" height="${height}" fill="${color}"/>`;
      x += w * moduleWidth;
    } else {
      let w = 0;
      while (i < bits.length && bits[i] === '0') { w++; i++; }
      x += w * moduleWidth;
    }
  }

  svg += '</svg>';
  return svg;
}

// ============================================================
// API PÚBLICA
// ============================================================

/**
 * Genera un SVG de Code128C a partir de una cadena de dígitos.
 * Ideal para claves de acceso del SRI.
 */
export function generarCode128SVG(data, opts = {}) {
  const bits = generarBitsCode128C(String(data));
  return bitsToSVG(bits, opts);
}

/**
 * Genera un SVG de EAN-13.
 * Ideal para etiquetas de productos.
 */
export function generarEAN13SVG(data, opts = {}) {
  const bits = generarBitsEAN13(String(data));
  return bitsToSVG(bits, opts);
}

/**
 * Genera una imagen PNG (data URL) de un Code128, usando canvas.
 * Útil para pegar en PDFs o descargar.
 */
export async function generarCode128PNG(data, opts = {}) {
  const { width = 800, height = 200, color = '#000', bgColor = '#fff' } = opts;
  const bits = generarBitsCode128C(String(data));
  const totalModules = bits.length + 20; // quiet zones
  const moduleWidth = width / totalModules;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Fondo
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Barras
  ctx.fillStyle = color;
  let x = 10 * moduleWidth;
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let w = 0;
      while (i < bits.length && bits[i] === '1') { w++; i++; }
      ctx.fillRect(Math.round(x), 0, Math.ceil(w * moduleWidth), height);
      x += w * moduleWidth;
    } else {
      let w = 0;
      while (i < bits.length && bits[i] === '0') { w++; i++; }
      x += w * moduleWidth;
    }
  }

  return canvas.toDataURL('image/png');
}

/**
 * Compatibilidad: reemplazo directo de la vieja función `generarBarcodeHTML` del printService.
 * Devuelve un SVG con las mismas firmas visuales que antes.
 */
export function generarBarcodeHTML(data, formato = 'A4', maxHeight = 45) {
  if (!data) return '';

  let dataBarcode = String(data);

  // En ticket usamos solo los últimos 22 dígitos para que quepa
  if (formato === 'ticket' && dataBarcode.length > 30) {
    dataBarcode = dataBarcode.slice(-22);
  }

  try {
    const bits = generarBitsCode128C(dataBarcode);
    const svg = bitsToSVG(bits, { height: 60, quietZone: 8, moduleWidth: 1 });

    // Envolver con estilos inline equivalentes a los anteriores
    return svg.replace(
      '<svg ',
      `<svg class="barcode-svg" style="width: 100%; height: ${maxHeight}px; display: block;" `
    );
  } catch (e) {
    console.error('Error generando código de barras:', e);
    return `<div style="font-size: 0.7em; color: #888; text-align: center;">[Código de barras no disponible]</div>`;
  }
}