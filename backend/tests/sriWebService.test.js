// backend/tests/sriWebService.test.js
// ============================================================
// Tests para utils/sriWebService.js
// Solo helpers puros y parsers — la red se mockea con stubs.
// ============================================================
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  URLS,
  normalizarEstado,
  sanitizarParaLog,
  validarClaveAcceso,
  getMetricas,
  resetearMetricas,
  CONFIG,
  _buscarConNamespace,
  _extraerMensajes,
  _extraerComprobantes,
  _extraerAutorizaciones,
  _parsearRespuestaSOAP,
  _construirEnvioRecepcion,
  _construirEnvioAutorizacion,
  _clasificarErrorRed,
  _calcularBackoff,
  _normalizarArray,
  _escXml,
  _errorTipado
} = require('../utils/sriWebService');

// ============================================================
// CONSTANTES
// ============================================================
describe('sriWebService · URLS', () => {
  test('tiene ambientes 1 y 2', () => {
    assert.ok(URLS.recepcion['1']);
    assert.ok(URLS.recepcion['2']);
    assert.ok(URLS.autorizacion['1']);
    assert.ok(URLS.autorizacion['2']);
  });

  test('ambiente 1 usa celcer (pruebas)', () => {
    assert.match(URLS.recepcion['1'], /celcer\.sri\.gob\.ec/);
  });

  test('ambiente 2 usa cel (producción)', () => {
    assert.match(URLS.recepcion['2'], /cel\.sri\.gob\.ec/);
  });

  test('están congeladas', () => {
    assert.throws(() => { URLS.recepcion = {}; }, TypeError);
  });
});

// ============================================================
// normalizarEstado
// ============================================================
describe('sriWebService · normalizarEstado', () => {
  test('quita espacios y uppercases', () => {
    assert.equal(normalizarEstado('RECIBIDA'), 'RECIBIDA');
    assert.equal(normalizarEstado('recibida'), 'RECIBIDA');
    assert.equal(normalizarEstado('  Recibida  '), 'RECIBIDA');
  });

  test('reemplaza espacios internos', () => {
    assert.equal(normalizarEstado('NO AUTORIZADO'), 'NO_AUTORIZADO');
    assert.equal(normalizarEstado('no autorizado'), 'NO_AUTORIZADO');
    assert.equal(normalizarEstado('NO  AUTORIZADO'), 'NO_AUTORIZADO');
  });

  test('null/undefined → ""', () => {
    assert.equal(normalizarEstado(null), '');
    assert.equal(normalizarEstado(undefined), '');
    assert.equal(normalizarEstado(''), '');
  });

  test('no-string → ""', () => {
    assert.equal(normalizarEstado(42), '');
    assert.equal(normalizarEstado({}), '');
  });
});

// ============================================================
// sanitizarParaLog
// ============================================================
describe('sriWebService · sanitizarParaLog', () => {
  test('trunca strings largos (sin base64)', () => {
  // "x" repetida → sin variedad → NO es base64 → debe truncar.
  const larga = 'x'.repeat(1000);
  const r = sanitizarParaLog(larga);
  assert.ok(r.length <= CONFIG.maxLogBody + 1);
  assert.match(r, /…/);
});

test('reemplaza bloques base64', () => {
  // Base64 real: variedad de caracteres.
  const b64 = 'Ab1+/Ab1+/Ab1+/'.repeat(10); // 140 chars con variedad
  const r = sanitizarParaLog(`<xml>${b64}</xml>`);
  assert.match(r, /\[base64 \d+ch\]/);
  assert.doesNotMatch(r, /Ab1\+\//);
});

  test('elimina CRLF', () => {
    assert.equal(sanitizarParaLog('a\r\nb'), 'a b');
  });

  test('null/undefined → ""', () => {
    assert.equal(sanitizarParaLog(null), '');
    assert.equal(sanitizarParaLog(undefined), '');
  });
});

// ============================================================
// validarClaveAcceso
// ============================================================
describe('sriWebService · validarClaveAcceso', () => {
  test('clave válida pasa', () => {
    assert.doesNotThrow(() => validarClaveAcceso('1'.repeat(49)));
  });

  test('clave corta → CLAVE_INVALIDA', () => {
    assert.throws(
      () => validarClaveAcceso('1'.repeat(48)),
      (err) => err.codigo === 'CLAVE_INVALIDA' && err.status === 400
    );
  });

  test('clave con letras → CLAVE_INVALIDA', () => {
    assert.throws(
      () => validarClaveAcceso('a'.repeat(49)),
      (err) => err.codigo === 'CLAVE_INVALIDA'
    );
  });

  test('null/no-string → CLAVE_INVALIDA', () => {
    assert.throws(() => validarClaveAcceso(null));
    assert.throws(() => validarClaveAcceso(42));
  });
});

// ============================================================
// buscarConNamespace
// ============================================================
describe('sriWebService · buscarConNamespace', () => {
  test('encuentra clave sin namespace', () => {
    const obj = { estado: 'RECIBIDA' };
    assert.equal(_buscarConNamespace(obj, 'estado'), 'RECIBIDA');
  });

  test('encuentra clave con namespace soap:', () => {
    const obj = { 'soap:Body': { hola: 'mundo' } };
    assert.deepEqual(_buscarConNamespace(obj, 'Body'), { hola: 'mundo' });
  });

  test('encuentra clave con namespace soapenv:', () => {
    const obj = { 'soapenv:Envelope': {} };
    assert.deepEqual(_buscarConNamespace(obj, 'Envelope'), {});
  });

  test('case-insensitive', () => {
    const obj = { Body: { x: 1 } };
    assert.deepEqual(_buscarConNamespace(obj, 'body'), { x: 1 });
  });

  test('no encuentra → undefined', () => {
    assert.equal(_buscarConNamespace({ a: 1 }, 'b'), undefined);
    assert.equal(_buscarConNamespace(null, 'x'), undefined);
  });
});

// ============================================================
// extraerMensajes
// ============================================================
describe('sriWebService · extraerMensajes', () => {
  test('array de mensajes', () => {
    const contenedor = {
      mensaje: [
        { identificador: 'ID1', mensaje: 'Error 1', informacionAdicional: 'extra', tipo: 'ERROR' },
        { identificador: 'ID2', mensaje: 'Error 2', informacionAdicional: '', tipo: 'WARN' }
      ]
    };
    const r = _extraerMensajes(contenedor);
    assert.equal(r.length, 2);
    assert.equal(r[0].identificador, 'ID1');
    assert.equal(r[0].tipo, 'ERROR');
  });

  test('objeto único (no array)', () => {
    const contenedor = { mensaje: { identificador: 'X', mensaje: 'Y' } };
    const r = _extraerMensajes(contenedor);
    assert.equal(r.length, 1);
    assert.equal(r[0].identificador, 'X');
  });

  test('contenedor sin mensajes → []', () => {
    assert.deepEqual(_extraerMensajes({}), []);
    assert.deepEqual(_extraerMensajes(null), []);
  });

  test('mensajes sin campos → defaults vacíos', () => {
    const contenedor = { mensaje: { identificador: 'X' } };
    const r = _extraerMensajes(contenedor);
    assert.equal(r[0].mensaje, '');
    assert.equal(r[0].tipo, '');
  });
});

// ============================================================
// extraerComprobantes
// ============================================================
describe('sriWebService · extraerComprobantes', () => {
  test('extrae comprobantes anidados', () => {
    const resp = {
      comprobantes: {
        comprobante: {
          claveAcceso: '1'.repeat(49),
          estado: 'RECIBIDA',
          mensajes: {
            mensaje: { identificador: 'X', mensaje: 'OK' }
          }
        }
      }
    };
    const r = _extraerComprobantes(resp);
    assert.equal(r.length, 1);
    assert.equal(r[0].claveAcceso, '1'.repeat(49));
    assert.equal(r[0].estado, 'RECIBIDA');
    assert.equal(r[0].mensajes.length, 1);
  });

  test('sin comprobantes → []', () => {
    assert.deepEqual(_extraerComprobantes({}), []);
  });
});

// ============================================================
// extraerAutorizaciones
// ============================================================
describe('sriWebService · extraerAutorizaciones', () => {
  test('extrae autorizaciones', () => {
    const resp = {
      autorizaciones: {
        autorizacion: {
          estado: 'AUTORIZADO',
          numeroAutorizacion: '1234567890',
          fechaAutorizacion: '2024-06-15T10:00:00Z',
          ambiente: '1',
          comprobante: '<factura>...</factura>'
        }
      }
    };
    const r = _extraerAutorizaciones(resp);
    assert.equal(r.length, 1);
    assert.equal(r[0].estado, 'AUTORIZADO');
    assert.equal(r[0].numeroAutorizacion, '1234567890');
    assert.equal(r[0].comprobante, '<factura>...</factura>');
  });

  test('múltiples autorizaciones', () => {
    const resp = {
      autorizaciones: {
        autorizacion: [
          { estado: 'AUTORIZADO', numeroAutorizacion: 'A' },
          { estado: 'RECHAZADA', numeroAutorizacion: 'B' }
        ]
      }
    };
    const r = _extraerAutorizaciones(resp);
    assert.equal(r.length, 2);
    assert.equal(r[1].estado, 'RECHAZADA');
  });
});

// ============================================================
// construirEnvio*
// ============================================================
describe('sriWebService · construirEnvioRecepcion', () => {
  test('incluye base64 del XML', () => {
    const xml = '<factura>hola</factura>';
    const soap = _construirEnvioRecepcion(xml);
    assert.match(soap, /<ec:validarComprobante>/);
    assert.match(soap, /<xml>[A-Za-z0-9+/=]+<\/xml>/);
    const expected = Buffer.from(xml, 'utf-8').toString('base64');
    assert.ok(soap.includes(expected), `No incluye base64 "${expected}"`);
  });

  test('rechaza XML vacío', () => {
    assert.throws(() => _construirEnvioRecepcion(''));
    assert.throws(() => _construirEnvioRecepcion(null));
  });
});

describe('sriWebService · construirEnvioAutorizacion', () => {
  test('incluye la clave directamente', () => {
    const clave = '1'.repeat(49);
    const soap = _construirEnvioAutorizacion(clave);
    assert.match(soap, /<ec:autorizacionComprobante>/);
    assert.match(soap, new RegExp(`<claveAccesoComprobante>${clave}</claveAccesoComprobante>`));
  });

  test('rechaza clave inválida (anti XML injection)', () => {
    assert.throws(() => _construirEnvioAutorizacion('</clave><mal>'));
    assert.throws(() => _construirEnvioAutorizacion('1'.repeat(48)));
  });
});

// ============================================================
// parsearRespuestaSOAP
// ============================================================
describe('sriWebService · parsearRespuestaSOAP', () => {
  test('extrae Body de SOAP-ENV', async () => {
    const xml = `<?xml version="1.0"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Body>
    <Respuesta><estado>RECIBIDA</estado></Respuesta>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
    const body = await _parsearRespuestaSOAP(xml);
    assert.ok(body);
    assert.ok(body.Respuesta);
    assert.equal(body.Respuesta.estado, 'RECIBIDA');
  });

  test('rechaza XML inválido', async () => {
    await assert.rejects(
      () => _parsearRespuestaSOAP('<<<no xml'),
      (err) => err.codigo === 'ERROR_PARSEO'
    );
  });

  test('rechaza vacío', async () => {
    await assert.rejects(
      () => _parsearRespuestaSOAP(''),
      (err) => err.codigo === 'RESPUESTA_VACIA'
    );
  });

  test('rechaza sin Body', async () => {
    const xml = '<Envelope><Header/></Envelope>';
    await assert.rejects(
      () => _parsearRespuestaSOAP(xml),
      (err) => err.codigo === 'RESPUESTA_INVALIDA'
    );
  });
});

// ============================================================
// clasificarErrorRed
// ============================================================
describe('sriWebService · clasificarErrorRed', () => {
  test('timeout → transitorio', () => {
    const r = _clasificarErrorRed({ code: 'ECONNABORTED' });
    assert.equal(r.transitorio, true);
    assert.equal(r.codigo, 'ERROR_TIMEOUT');
  });

  test('ENOTFOUND → NO transitorio', () => {
    const r = _clasificarErrorRed({ code: 'ENOTFOUND' });
    assert.equal(r.transitorio, false);
    assert.equal(r.codigo, 'ERROR_DNS');
  });

  test('ECONNREFUSED → transitorio', () => {
    const r = _clasificarErrorRed({ code: 'ECONNREFUSED' });
    assert.equal(r.transitorio, true);
  });

  test('HTTP 500 → transitorio', () => {
    const r = _clasificarErrorRed({ response: { status: 500 } });
    assert.equal(r.transitorio, true);
    assert.equal(r.codigo, 'ERROR_HTTP_5XX');
  });

  test('HTTP 400 → NO transitorio', () => {
    const r = _clasificarErrorRed({ response: { status: 400 } });
    assert.equal(r.transitorio, false);
    assert.equal(r.codigo, 'ERROR_HTTP_4XX');
  });

  test('TLS → NO transitorio', () => {
    const r = _clasificarErrorRed({ code: 'CERT_HAS_EXPIRED' });
    assert.equal(r.transitorio, false);
    assert.equal(r.codigo, 'ERROR_TLS');
  });

  test('null → transitorio por defecto', () => {
    const r = _clasificarErrorRed(null);
    assert.equal(r.transitorio, true);
  });
});

// ============================================================
// calcularBackoff
// ============================================================
describe('sriWebService · calcularBackoff', () => {
  test('crece exponencialmente', () => {
    // Aunque hay jitter, el rango debe crecer.
    const intento1 = [];
    const intento3 = [];
    for (let i = 0; i < 50; i++) {
      intento1.push(_calcularBackoff(1));
      intento3.push(_calcularBackoff(3));
    }
    const avg1 = intento1.reduce((a, b) => a + b, 0) / 50;
    const avg3 = intento3.reduce((a, b) => a + b, 0) / 50;
    assert.ok(avg3 > avg1 * 3, `avg1=${avg1}, avg3=${avg3}`);
  });

  test('devuelve entero positivo', () => {
    for (let i = 1; i <= 5; i++) {
      const b = _calcularBackoff(i);
      assert.ok(Number.isInteger(b));
      assert.ok(b > 0);
    }
  });
});

// ============================================================
// normalizarArray
// ============================================================
describe('sriWebService · normalizarArray', () => {
  test('null/undefined → []', () => {
    assert.deepEqual(_normalizarArray(null), []);
    assert.deepEqual(_normalizarArray(undefined), []);
  });

  test('objeto único → [objeto]', () => {
    assert.deepEqual(_normalizarArray({ a: 1 }), [{ a: 1 }]);
  });

  test('array → el mismo array', () => {
    assert.deepEqual(_normalizarArray([1, 2]), [1, 2]);
  });
});

// ============================================================
// escXml
// ============================================================
describe('sriWebService · escXml', () => {
  test('escapa los 5 caracteres básicos', () => {
    assert.equal(_escXml('<b>'), '&lt;b&gt;');
    assert.equal(_escXml('&'), '&amp;');
    assert.equal(_escXml('"'), '&quot;');
    assert.equal(_escXml("'"), '&apos;');
  });
});

// ============================================================
// MÉTRICAS
// ============================================================
describe('sriWebService · métricas', () => {
  beforeEach(() => resetearMetricas());

  test('shape completo', () => {
    const m = getMetricas();
    assert.equal(typeof m.recepciones, 'number');
    assert.equal(typeof m.autorizaciones, 'number');
    assert.equal(typeof m.reintentos, 'number');
    assert.equal(typeof m.timeouts, 'number');
  });

  test('reset limpia todo', () => {
    resetearMetricas();
    const m = getMetricas();
    for (const k of Object.keys(m)) {
      assert.equal(m[k], 0);
    }
  });
});

// ============================================================
// CONFIG
// ============================================================
describe('sriWebService · CONFIG', () => {
  test('valores por defecto sensatos', () => {
    assert.ok(CONFIG.timeoutMs >= 5000);
    assert.ok(CONFIG.reintentos >= 0);
    assert.ok(CONFIG.maxBytesRespuesta > 0);
    assert.ok(CONFIG.enviarYAutorizarTimeoutMs > 0);
    assert.ok(CONFIG.userAgent.length > 0);
  });
});

// ============================================================
// errorTipado
// ============================================================
describe('sriWebService · errorTipado', () => {
  test('crea error con codigo y status', () => {
    const err = _errorTipado('msg', 'COD', 500);
    assert.equal(err.message, 'msg');
    assert.equal(err.codigo, 'COD');
    assert.equal(err.status, 500);
  });
});