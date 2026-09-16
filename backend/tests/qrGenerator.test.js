// backend/tests/qrGenerator.test.js
// ============================================================
// Tests para utils/qrGenerator.js
// Generan QRs reales si `qrcode` está instalado; si no, se
// saltan con aviso.
// ============================================================
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  generarQRComprobante,
  generarQRClaveAcceso,
  generarQRDataUrl,
  generarQRBuffer,
  validarClaveAcceso,
  limpiarCacheQR,
  getEstadisticasQR,
  CONFIG,
  ECC_VALIDOS,
  _mergeOpts,
  _defaultOpts,
  _cache,
  _stats,
  _optsKey,
  _esCacheable,
  _errorTipado,
  _CLAVE_REGEX
} = require('../utils/qrGenerator');

// ============================================================
// CONSTANTES
// ============================================================
const CLAVE_VALIDA = '1'.repeat(49);
const CLAVE_INVALIDA_LEN = '1'.repeat(48);
const CLAVE_INVALIDA_TEXTO = 'a'.repeat(49);

// ¿Está instalado qrcode? Algunos tests requieren el paquete real.
let tieneQrcode = true;
try { require.resolve('qrcode'); } catch { tieneQrcode = false; }

// ============================================================
// CONFIG
// ============================================================
describe('qrGenerator · CONFIG', () => {
  test('valores por defecto sensatos', () => {
    assert.ok(CONFIG.width > 0);
    assert.ok(CONFIG.margin >= 0);
    assert.ok(ECC_VALIDOS.includes(CONFIG.errorCorrectionLevel));
    assert.match(CONFIG.colorDark, /^#[0-9a-f]{6}$/i);
    assert.match(CONFIG.colorLight, /^#[0-9a-f]{6}$/i);
    assert.ok(CONFIG.timeoutMs > 0);
  });

  test('ECC_VALIDOS tiene los 4 niveles', () => {
    assert.deepEqual([...ECC_VALIDOS], ['L', 'M', 'Q', 'H']);
  });

  test('CLAVE_REGEX matchea 49 dígitos', () => {
    assert.equal(_CLAVE_REGEX.test('1'.repeat(49)), true);
    assert.equal(_CLAVE_REGEX.test('a'.repeat(49)), false);
    assert.equal(_CLAVE_REGEX.test('1'.repeat(48)), false);
  });
});

// ============================================================
// validarClaveAcceso
// ============================================================
describe('qrGenerator · validarClaveAcceso', () => {
  test('clave válida', () => {
    const r = validarClaveAcceso(CLAVE_VALIDA);
    assert.equal(r.valido, true);
  });

  test('clave ausente', () => {
    assert.equal(validarClaveAcceso(null).valido, false);
    assert.equal(validarClaveAcceso(undefined).valido, false);
    assert.equal(validarClaveAcceso('').valido, false);
  });

  test('clave no-string', () => {
    assert.equal(validarClaveAcceso(42).valido, false);
    assert.equal(validarClaveAcceso({}).valido, false);
  });

  test('longitud incorrecta', () => {
    const r = validarClaveAcceso(CLAVE_INVALIDA_LEN);
    assert.equal(r.valido, false);
    assert.match(r.motivo, /Longitud/);
  });

  test('solo dígitos', () => {
    const r = validarClaveAcceso(CLAVE_INVALIDA_TEXTO);
    assert.equal(r.valido, false);
    assert.match(r.motivo, /dígitos/);
  });
});

// ============================================================
// mergeOpts
// ============================================================
describe('qrGenerator · mergeOpts', () => {
  test('sin overrides usa defaults', () => {
    const o = _mergeOpts();
    const d = _defaultOpts();
    assert.deepEqual(o, d);
  });

  test('sobrescribe width', () => {
    const o = _mergeOpts({ width: 500 });
    assert.equal(o.width, 500);
  });

  test('ignora width inválido', () => {
    const o = _mergeOpts({ width: -100 });
    assert.equal(o.width, CONFIG.width);
  });

  test('sobrescribe ECC', () => {
    const o = _mergeOpts({ errorCorrectionLevel: 'H' });
    assert.equal(o.errorCorrectionLevel, 'H');
  });

  test('ECC case-insensitive', () => {
    const o = _mergeOpts({ errorCorrectionLevel: 'h' });
    assert.equal(o.errorCorrectionLevel, 'H');
  });

  test('ignora ECC inválido', () => {
    const o = _mergeOpts({ errorCorrectionLevel: 'X' });
    assert.equal(o.errorCorrectionLevel, CONFIG.errorCorrectionLevel);
  });

  test('sobrescribe colores', () => {
    const o = _mergeOpts({ color: { dark: '#000000', light: '#eeeeee' } });
    assert.equal(o.color.dark, '#000000');
    assert.equal(o.color.light, '#eeeeee');
  });

  test('null/no-object → defaults', () => {
    assert.deepEqual(_mergeOpts(null), _defaultOpts());
    assert.deepEqual(_mergeOpts('abc'), _defaultOpts());
  });
});

// ============================================================
// CACHE
// ============================================================
describe('qrGenerator · cache', () => {
  beforeEach(() => limpiarCacheQR());

  test('_optsKey es estable', () => {
    const o = _defaultOpts();
    assert.equal(_optsKey(o), _optsKey({ ...o }));
  });

  test('_esCacheable true solo con defaults', () => {
    assert.equal(_esCacheable(_defaultOpts()), true);
    assert.equal(_esCacheable(_mergeOpts({ width: 500 })), false);
  });

  test('limpiarCacheQR vacía todo', () => {
    _cache.set('x', { dataUrl: 'a' });
    limpiarCacheQR();
    assert.equal(_cache.size, 0);
  });

  test('estadísticas iniciales en 0', () => {
    limpiarCacheQR();
    const s = getEstadisticasQR();
    assert.equal(s.hits, 0);
    assert.equal(s.misses, 0);
    assert.equal(s.generados, 0);
    assert.equal(s.fallidos, 0);
  });
});

// ============================================================
// generarQRComprobante — validación
// ============================================================
describe('qrGenerator · generarQRComprobante (validación)', () => {
  test('clave ausente → error CLAVE_INVALIDA sin lanzar', async () => {
    const r = await generarQRComprobante({});
    assert.equal(r.dataUrl, '');
    assert.equal(r.buffer, null);
    assert.equal(r.codigo, 'CLAVE_INVALIDA');
    assert.ok(r.error);
  });

  test('clave corta → error CLAVE_INVALIDA', async () => {
    const r = await generarQRComprobante({ claveAcceso: '1'.repeat(10) });
    assert.equal(r.codigo, 'CLAVE_INVALIDA');
  });

  test('clave con letras → error CLAVE_INVALIDA', async () => {
    const r = await generarQRComprobante({ claveAcceso: 'a'.repeat(49) });
    assert.equal(r.codigo, 'CLAVE_INVALIDA');
  });
});

// ============================================================
// GENERACIÓN REAL (requiere qrcode)
// ============================================================
describe('qrGenerator · generación real', { skip: !tieneQrcode }, () => {
  beforeEach(() => limpiarCacheQR());

  test('genera dataUrl y buffer', async () => {
    const r = await generarQRComprobante({ claveAcceso: CLAVE_VALIDA });
    assert.match(r.dataUrl, /^data:image\/png;base64,/);
    assert.ok(Buffer.isBuffer(r.buffer));
    assert.ok(r.buffer.length > 100);
  });

  test('soloDataUrl omite el buffer', async () => {
    const r = await generarQRComprobante({
      claveAcceso: CLAVE_VALIDA,
      soloDataUrl: true
    });
    assert.ok(r.dataUrl);
    assert.equal(r.buffer, null);
  });

  test('soloBuffer omite el dataUrl', async () => {
    const r = await generarQRComprobante({
      claveAcceso: CLAVE_VALIDA,
      soloBuffer: true
    });
    assert.equal(r.dataUrl, '');
    assert.ok(Buffer.isBuffer(r.buffer));
  });

  test('dos llamadas idénticas usan cache (hits)', async () => {
    limpiarCacheQR();
    await generarQRComprobante({ claveAcceso: CLAVE_VALIDA });
    await generarQRComprobante({ claveAcceso: CLAVE_VALIDA });
    const s = getEstadisticasQR();
    assert.ok(s.hits >= 1, `hits=${s.hits}`);
  });

  test('generarQRClaveAcceso devuelve dataUrl', async () => {
    const d = await generarQRClaveAcceso(CLAVE_VALIDA);
    assert.match(d, /^data:image\/png;base64,/);
  });

  test('generarQRClaveAcceso con clave inválida → ""', async () => {
    assert.equal(await generarQRClaveAcceso('corta'), '');
    assert.equal(await generarQRClaveAcceso('a'.repeat(49)), '');
  });

  test('generarQRDataUrl lanza con clave inválida', async () => {
    await assert.rejects(
      () => generarQRDataUrl('corta'),
      (err) => err.codigo === 'CLAVE_INVALIDA'
    );
  });

  test('generarQRDataUrl devuelve dataUrl con clave válida', async () => {
    const d = await generarQRDataUrl(CLAVE_VALIDA);
    assert.match(d, /^data:image\/png;base64,/);
  });

  test('generarQRBuffer lanza con clave inválida', async () => {
    await assert.rejects(
      () => generarQRBuffer('corta'),
      (err) => err.codigo === 'CLAVE_INVALIDA'
    );
  });

  test('generarQRBuffer devuelve Buffer', async () => {
    const b = await generarQRBuffer(CLAVE_VALIDA);
    assert.ok(Buffer.isBuffer(b));
  });

  test('width custom afecta al tamaño del buffer', async () => {
    const chico = await generarQRBuffer(CLAVE_VALIDA, { width: 100 });
    const grande = await generarQRBuffer(CLAVE_VALIDA, { width: 500 });
    assert.ok(grande.length > chico.length);
  });

  test('ECC H genera QR más grande (por resiliencia)', async () => {
    const m = await generarQRBuffer(CLAVE_VALIDA, { errorCorrectionLevel: 'M' });
    const h = await generarQRBuffer(CLAVE_VALIDA, { errorCorrectionLevel: 'H' });
    assert.ok(h.length > m.length);
  });
});

// ============================================================
// ERROR TIPADO
// ============================================================
describe('qrGenerator · errorTipado', () => {
  test('crea error con codigo y status', () => {
    const err = _errorTipado('test', 'MI_CODIGO', 400);
    assert.equal(err.message, 'test');
    assert.equal(err.codigo, 'MI_CODIGO');
    assert.equal(err.status, 400);
  });

  test('status por defecto 400', () => {
    const err = _errorTipado('test', 'X');
    assert.equal(err.status, 400);
  });
});