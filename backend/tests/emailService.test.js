// backend/tests/emailService.test.js
// ============================================================
// Tests para utils/emailService.js
// No envían emails reales: cubren helpers y flujos con mocks.
// ============================================================
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  escHtml,
  validarEmail,
  sanitizarNombreRemitente,
  sanitizarNombreArchivo,
  sanitizarTexto,
  formatearMonto,
  getMetricas,
  CONFIG,
  _generarHTML,
  _esErrorTransitorioSMTP,
  _conTimeout,
  _validarPuerto,
  _resetMetricas
} = require('../utils/emailService');

// ============================================================
// escHtml
// ============================================================
describe('emailService · escHtml', () => {
  test('escapa caracteres básicos', () => {
    assert.equal(escHtml('<b>'), '&lt;b&gt;');
    assert.equal(escHtml('&'), '&amp;');
    assert.equal(escHtml('"'), '&quot;');
    assert.equal(escHtml("'"), '&#39;');
    assert.equal(escHtml('`'), '&#96;');
  });

  test('combina varios en un string', () => {
    assert.equal(
      escHtml('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  test('null/undefined → vacío', () => {
    assert.equal(escHtml(null), '');
    assert.equal(escHtml(undefined), '');
  });

  test('números se convierten', () => {
    assert.equal(escHtml(42), '42');
    assert.equal(escHtml(0), '0');
  });
});

// ============================================================
// validarEmail
// ============================================================
describe('emailService · validarEmail', () => {
  test('emails válidos', () => {
    assert.equal(validarEmail('test@example.com'), true);
    assert.equal(validarEmail('user.name+tag@sub.domain.io'), true);
  });

  test('emails inválidos', () => {
    assert.equal(validarEmail('notanemail'), false);
    assert.equal(validarEmail('@example.com'), false);
    assert.equal(validarEmail('user@'), false);
    assert.equal(validarEmail(''), false);
    assert.equal(validarEmail(null), false);
    assert.equal(validarEmail(42), false);
  });

  test('rechaza CRLF', () => {
    assert.equal(validarEmail('a@b.com\r\nBcc: evil@x.com'), false);
  });

  test('rechaza exceso de longitud', () => {
    const largo = 'a'.repeat(300) + '@b.com';
    assert.equal(validarEmail(largo), false);
  });
});

// ============================================================
// sanitizarNombreRemitente
// ============================================================
describe('emailService · sanitizarNombreRemitente', () => {
  test('quita comillas, angle brackets y backslash', () => {
    assert.equal(
      sanitizarNombreRemitente('ACME "S.A." <evil>'),
      'ACME S.A. evil'
    );
  });

  test('quita CRLF y puntos y coma', () => {
    assert.equal(sanitizarNombreRemitente('ACME\r\nS.A.;x'), 'ACME S.A.x');
  });

  test('null/undefined/vacío → fallback', () => {
    assert.equal(sanitizarNombreRemitente(null), 'Sistema Contable');
    assert.equal(sanitizarNombreRemitente(''), 'Sistema Contable');
  });

  test('trunca a maxNombreRemitente', () => {
    const largo = 'a'.repeat(500);
    const r = sanitizarNombreRemitente(largo);
    assert.ok(r.length <= CONFIG.maxNombreRemitente);
  });
});

// ============================================================
// sanitizarNombreArchivo
// ============================================================
describe('emailService · sanitizarNombreArchivo', () => {
  test('reemplaza caracteres inválidos', () => {
    assert.equal(sanitizarNombreArchivo('FAC/001/2024'), 'FAC_001_2024');
    assert.equal(sanitizarNombreArchivo('a:b*c?d'), 'a_b_c_d');
  });

  test('colapsa underscores repetidos', () => {
    assert.equal(sanitizarNombreArchivo('a///b'), 'a_b');
  });

  test('quita puntos/guiones al inicio', () => {
    assert.equal(sanitizarNombreArchivo('.hidden'), 'hidden');
  });

  test('null/vacío → fallback', () => {
    assert.equal(sanitizarNombreArchivo(null, 'def'), 'def');
    assert.equal(sanitizarNombreArchivo('', 'def'), 'def');
  });

  test('trunca a 120 chars', () => {
    const r = sanitizarNombreArchivo('a'.repeat(300));
    assert.ok(r.length <= 120);
  });
});

// ============================================================
// sanitizarTexto
// ============================================================
describe('emailService · sanitizarTexto', () => {
  test('quita CRLF', () => {
    assert.equal(sanitizarTexto('hola\r\nmundo'), 'hola mundo');
  });

  test('colapsa espacios', () => {
    assert.equal(sanitizarTexto('hola    mundo'), 'hola mundo');
  });

  test('respeta max personalizado', () => {
    const r = sanitizarTexto('a'.repeat(500), 10);
    assert.equal(r.length, 10);
  });

  test('null/undefined → vacío', () => {
    assert.equal(sanitizarTexto(null), '');
    assert.equal(sanitizarTexto(undefined), '');
  });
});

// ============================================================
// formatearMonto
// ============================================================
describe('emailService · formatearMonto', () => {
  test('números válidos', () => {
    assert.equal(formatearMonto(100), '100.00');
    assert.equal(formatearMonto(99.999), '100.00');
    assert.equal(formatearMonto(1.005), '1.00'); // toFixed, no round
  });

  test('strings numéricos', () => {
    assert.equal(formatearMonto('42.5'), '42.50');
  });

  test('valores inválidos → "0.00"', () => {
    assert.equal(formatearMonto(NaN), '0.00');
    assert.equal(formatearMonto(Infinity), '0.00');
    assert.equal(formatearMonto('abc'), '0.00');
    assert.equal(formatearMonto(null), '0.00');
    assert.equal(formatearMonto(undefined), '0.00');
  });
});

// ============================================================
// validarPuerto
// ============================================================
describe('emailService · validarPuerto', () => {
  test('puertos válidos', () => {
    assert.equal(_validarPuerto('587'), 587);
    assert.equal(_validarPuerto(25), 25);
    assert.equal(_validarPuerto('465'), 465);
  });

  test('puertos inválidos → default', () => {
    assert.equal(_validarPuerto('abc'), CONFIG.puertoDefault);
    assert.equal(_validarPuerto('99999'), CONFIG.puertoDefault);
    assert.equal(_validarPuerto('-1'), CONFIG.puertoDefault);
    assert.equal(_validarPuerto(undefined), CONFIG.puertoDefault);
  });
});

// ============================================================
// Error transitorio
// ============================================================
describe('emailService · esErrorTransitorioSMTP', () => {
  test('códigos SMTP 4xx son transitorios', () => {
    assert.equal(_esErrorTransitorioSMTP({ responseCode: 421 }), true);
    assert.equal(_esErrorTransitorioSMTP({ responseCode: 450 }), true);
  });

  test('códigos SMTP 5xx NO son transitorios', () => {
    assert.equal(_esErrorTransitorioSMTP({ responseCode: 550 }), false);
    assert.equal(_esErrorTransitorioSMTP({ responseCode: 500 }), false);
  });

  test('códigos de nodemailer de red son transitorios', () => {
    assert.equal(_esErrorTransitorioSMTP({ code: 'ECONNECTION' }), true);
    assert.equal(_esErrorTransitorioSMTP({ code: 'ETIMEDOUT' }), true);
    assert.equal(_esErrorTransitorioSMTP({ code: 'ECONNRESET' }), true);
  });

  test('errores desconocidos NO son transitorios', () => {
    assert.equal(_esErrorTransitorioSMTP({ code: 'ERANDOM' }), false);
    assert.equal(_esErrorTransitorioSMTP(null), false);
  });
});

// ============================================================
// conTimeout
// ============================================================
describe('emailService · conTimeout', () => {
  test('resuelve si es rápido', async () => {
    const r = await _conTimeout(Promise.resolve(42), 1000, 'x');
    assert.equal(r, 42);
  });

  test('rechaza con EMAIL_TIMEOUT si excede', async () => {
    const lento = new Promise(r => setTimeout(() => r('x'), 100));
    await assert.rejects(
      _conTimeout(lento, 10, 'excedió'),
      (err) => err.codigo === 'EMAIL_TIMEOUT' && err.status === 504
    );
  });
});

// ============================================================
// generarHTML
// ============================================================
describe('emailService · generarHTML', () => {
  const base = {
    razonSocialEmisor: 'ACME S.A.',
    rucEmisor: '1790012344001',
    nombreCliente: 'Juan Pérez',
    tipoDoc: 'FACTURA',
    numeroDoc: 'FAC-000001',
    fecha: '15/06/2024',
    total: '23.00',
    numeroAutorizacion: '',
    claveAcceso: '',
    xmlBuffer: null
  };

  test('contiene datos básicos', () => {
    const html = _generarHTML(base);
    assert.match(html, /ACME S\.A\./);
    assert.match(html, /FAC-000001/);
    assert.match(html, /\$23\.00/);
  });

  test('escapa HTML en valores', () => {
    const html = _generarHTML({
      ...base,
      nombreCliente: '<script>alert("xss")</script>'
    });
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  test('muestra número de autorización si existe', () => {
    const html = _generarHTML({ ...base, numeroAutorizacion: 'AUT-123' });
    assert.match(html, /AUT-123/);
  });

  test('muestra clave de acceso si existe', () => {
    const html = _generarHTML({ ...base, claveAcceso: '1'.repeat(49) });
    assert.match(html, /1{49}/);
  });

  test('listado de adjuntos refleja XML', () => {
    const sin = _generarHTML({ ...base, xmlBuffer: null });
    const con = _generarHTML({ ...base, xmlBuffer: Buffer.from('x') });
    assert.doesNotMatch(sin, /Comprobante\.xml/);
    assert.match(con, /Comprobante\.xml/);
  });
});

// ============================================================
// Métricas
// ============================================================
describe('emailService · métricas', () => {
  beforeEach(() => _resetMetricas());

  test('shape correcto', () => {
    const m = getMetricas();
    assert.equal(typeof m.enviados, 'number');
    assert.equal(typeof m.fallidos, 'number');
    assert.equal(typeof m.reintentos, 'number');
    assert.equal(typeof m.verificaciones, 'number');
    assert.equal(typeof m.verificacionesOk, 'number');
  });

  test('_resetMetricas limpia todo', () => {
    _resetMetricas();
    const m = getMetricas();
    assert.equal(m.enviados, 0);
    assert.equal(m.reintentos, 0);
  });
});