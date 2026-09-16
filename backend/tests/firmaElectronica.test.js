// backend/tests/firmaElectronica.test.js
// ============================================================
// Tests para utils/firmaElectronica.js
// ============================================================
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const forge = require('node-forge');
const crypto = require('node:crypto');

const {
  firmarXML,
  validarFirma,
  cargarCertificado,
  cifrarSecreto,
  descifrarSecreto,
  canonicalizarXml,
  extraerCertificadoPem,
  getCertificadoInfo,
  validarEstructuraCertificado,
  inspeccionarP12,
  limpiarCache,
  _CONFIG
} = require('../utils/firmaElectronica');

// ============================================================
// SETUP: ENV
// ============================================================
process.env.CERT_ENCRYPTION_KEY =
  process.env.CERT_ENCRYPTION_KEY || 'test-key-super-secret-1234567890';

// ============================================================
// HELPERS
// ============================================================
/** Genera un certificado autofirmado RSA-2048 y su .p12. */
function generarP12(opts = {}) {
  const {
    password = 'prueba123',
    ruc = '1790012344001',
    validezDias = 365,
    notBeforeOffsetDias = 0
  } = opts;

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = String(Date.now());

  const notBefore = new Date();
  notBefore.setDate(notBefore.getDate() + notBeforeOffsetDias);
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notAfter.getDate() + validezDias);

  const attrs = [
    { name: 'commonName', value: `TEST ${ruc}` },
    { name: 'countryName', value: 'EC' },
    { name: 'serialNumber', value: ruc }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const p12Buffer = Buffer.from(p12Der, 'binary');

  return {
    p12Buffer,
    password,
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certificatePem: forge.pki.certificateToPem(cert),
    cert
  };
}

// Cache del cert de prueba (generarlo es costoso).
let _certCache = null;
function certificadoPrueba() {
  if (_certCache) return _certCache;
  const { privateKeyPem, certificatePem } = generarP12();
  _certCache = { privateKeyPem, certificatePem };
  return _certCache;
}

const XML_BASE = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>1</ambiente>
    <ruc>1790012344001</ruc>
    <claveAcceso>${'1'.repeat(49)}</claveAcceso>
    <codDoc>01</codDoc>
    <secuencial>000000001</secuencial>
  </infoTributaria>
  <infoFactura>
    <importeTotal>100.00</importeTotal>
  </infoFactura>
</factura>`;

// ============================================================
// FIRMA / VALIDACIÓN (tests originales ampliados)
// ============================================================
describe('firmaElectronica · firmarXML + validarFirma', () => {
  test('firma y valida un XML', () => {
    const { privateKeyPem, certificatePem } = certificadoPrueba();
    const firmado = firmarXML(XML_BASE, privateKeyPem, certificatePem);

    assert.match(firmado, /<ds:Signature/);
    assert.match(firmado, /<ds:SignatureValue>/);
    assert.match(firmado, /<ds:X509Certificate>/);
    assert.match(firmado, /<xades:SignedProperties/);
    assert.match(firmado, /id="comprobante"/);

    const validacion = validarFirma(firmado);
    assert.equal(validacion.valido, true, validacion.motivo || 'firma inválida');
  });

  test('rechaza firma si el documento fue alterado', () => {
    const { privateKeyPem, certificatePem } = certificadoPrueba();
    const firmado = firmarXML(XML_BASE, privateKeyPem, certificatePem);
    const alterado = firmado.replace('1790012344001', '1790012344999');
    const validacion = validarFirma(alterado);
    assert.equal(validacion.valido, false);
  });

  test('no re-firma un XML ya firmado', () => {
    const { privateKeyPem, certificatePem } = certificadoPrueba();
    const firmado = firmarXML(XML_BASE, privateKeyPem, certificatePem);
    const reFirmado = firmarXML(firmado, privateKeyPem, certificatePem);
    assert.equal(firmado, reFirmado);
  });

  test('rechaza XML sin id="comprobante"', () => {
    const { privateKeyPem, certificatePem } = certificadoPrueba();
    const xmlMalo = '<factura><infoTributaria/></factura>';
    assert.throws(
      () => firmarXML(xmlMalo, privateKeyPem, certificatePem),
      (err) => err.codigo === 'XML_SIN_ID_COMPROBANTE'
    );
  });

  test('rechaza entrada vacía', () => {
    const { privateKeyPem, certificatePem } = certificadoPrueba();
    assert.throws(() => firmarXML('', privateKeyPem, certificatePem));
    assert.throws(() => firmarXML(null, privateKeyPem, certificatePem));
  });

  test('valida rechaza XML sin firma', () => {
    const r = validarFirma(XML_BASE);
    assert.equal(r.valido, false);
    assert.match(r.motivo, /firma/i);
  });

  test('valida rechaza XML vacío', () => {
    assert.equal(validarFirma('').valido, false);
    assert.equal(validarFirma(null).valido, false);
  });

  test('validación devuelve info del certificado', () => {
    const { privateKeyPem, certificatePem } = certificadoPrueba();
    const firmado = firmarXML(XML_BASE, privateKeyPem, certificatePem);
    const validacion = validarFirma(firmado);
    assert.equal(validacion.valido, true);
    assert.ok(validacion.certificado);
    assert.ok(validacion.certificado.subject);
  });
});

// ============================================================
// CARGAR CERTIFICADO
// ============================================================
describe('firmaElectronica · cargarCertificado', () => {
  test('carga un .p12 válido', () => {
    const { p12Buffer, password, certificatePem } = generarP12();
    const r = cargarCertificado(p12Buffer, password);
    assert.ok(r.privateKeyPem);
    assert.ok(r.certificatePem);
    assert.equal(r.certificatePem.trim(), certificatePem.trim());
    assert.ok(r.certificate.subject);
    assert.equal(r.certificate.vencido, false);
  });

  test('rechaza contraseña incorrecta con codigo tipado', () => {
    const { p12Buffer } = generarP12();
    assert.throws(
      () => cargarCertificado(p12Buffer, 'mala-password'),
      (err) => err.codigo === 'PASSWORD_INCORRECTA'
    );
  });

  test('rechaza buffer vacío', () => {
    assert.throws(
      () => cargarCertificado(Buffer.alloc(0), 'x'),
      (err) => err.codigo === 'P12_VACIO'
    );
  });

  test('rechaza buffer random', () => {
    assert.throws(
      () => cargarCertificado(crypto.randomBytes(500), 'x'),
      (err) => ['P12_INVALIDO', 'PASSWORD_INCORRECTA'].includes(err.codigo)
    );
  });
});

// ============================================================
// CIFRADO
// ============================================================
describe('firmaElectronica · cifrarSecreto / descifrarSecreto', () => {
  test('round-trip', () => {
    const cifrado = cifrarSecreto('mi-password-secreto');
    assert.notEqual(cifrado, 'mi-password-secreto');
    assert.equal(descifrarSecreto(cifrado), 'mi-password-secreto');
  });

  test('cifra dos veces produce outputs distintos (IV aleatorio)', () => {
    const a = cifrarSecreto('x');
    const b = cifrarSecreto('x');
    assert.notEqual(a, b);
  });

  test('string vacío → string vacío', () => {
    assert.equal(cifrarSecreto(''), '');
    assert.equal(descifrarSecreto(''), '');
  });

  test('formato corrupto (2 partes) → error tipado', () => {
    assert.throws(
      () => descifrarSecreto('aaa:bbb'),
      (err) => err.codigo === 'SECRETO_FORMATO_INVALIDO'
    );
  });

  test('auth tag alterado → error tipado', () => {
    const cifrado = cifrarSecreto('x');
    const [iv, , data] = cifrado.split(':');
    const tagFalso = Buffer.alloc(16).toString('base64');
    assert.throws(
      () => descifrarSecreto(`${iv}:${tagFalso}:${data}`),
      (err) => err.codigo === 'SECRETO_DESCIFRADO_FALLO'
    );
  });

  test('compat: string sin ":" se devuelve tal cual', () => {
    // No debería crashear ni lanzar.
    assert.equal(descifrarSecreto('password-sin-cifrar'), 'password-sin-cifrar');
  });
});

// ============================================================
// CANONICALIZACIÓN
// ============================================================
describe('firmaElectronica · canonicalizarXml', () => {
  test('canoniza un XML simple', () => {
    const xml = '<root><a>1</a><b>2</b></root>';
    const r = canonicalizarXml(xml);
    assert.match(r, /<root>/);
    assert.match(r, /<a>1<\/a>/);
    assert.match(r, /<b>2<\/b>/);
  });

  test('rechaza XML inválido', () => {
    assert.throws(() => canonicalizarXml(''));
    assert.throws(() => canonicalizarXml('<<<mal'));
  });
});

// ============================================================
// EXTRAER CERTIFICADO PEM
// ============================================================
describe('firmaElectronica · extraerCertificadoPem', () => {
  test('extrae del XML firmado', () => {
    const { privateKeyPem, certificatePem } = certificadoPrueba();
    const firmado = firmarXML(XML_BASE, privateKeyPem, certificatePem);
    const pem = extraerCertificadoPem(firmado);
    assert.ok(pem);
    assert.match(pem, /^-----BEGIN CERTIFICATE-----/);
    assert.match(pem, /-----END CERTIFICATE-----/);
  });

  test('devuelve null si no hay X509Certificate', () => {
    assert.equal(extraerCertificadoPem('<root/>'), null);
  });

  test('devuelve null con contenido muy corto', () => {
    assert.equal(extraerCertificadoPem('<ds:X509Certificate>abc</ds:X509Certificate>'), null);
  });
});

// ============================================================
// getCertificadoInfo
// ============================================================
describe('firmaElectronica · getCertificadoInfo', () => {
  test('extrae metadata', () => {
    const { certificatePem } = certificadoPrueba();
    const info = getCertificadoInfo(certificatePem);
    assert.ok(info.subject);
    assert.ok(info.issuer);
    assert.ok(info.serialNumber);
    assert.ok(info.validityNotAfter);
    assert.equal(typeof info.vencido, 'boolean');
    assert.equal(typeof info.diasRestantes, 'number');
  });
});

// ============================================================
// validarEstructuraCertificado
// ============================================================
describe('firmaElectronica · validarEstructuraCertificado', () => {
  test('cert válido', () => {
    const { certificatePem } = certificadoPrueba();
    const info = getCertificadoInfo(certificatePem);
    const r = validarEstructuraCertificado(info);
    assert.equal(r.valido, true);
  });

  test('null → inválido', () => {
    assert.equal(validarEstructuraCertificado(null).valido, false);
  });

  test('cert vencido → inválido', () => {
    const { certificatePem } = certificadoPrueba();
    const info = getCertificadoInfo(certificatePem);
    info.validityNotAfter = new Date(Date.now() - 86_400_000);
    const r = validarEstructuraCertificado(info);
    assert.equal(r.valido, false);
    assert.match(r.motivo, /vencido/i);
  });
});

// ============================================================
// inspeccionarP12
// ============================================================
describe('firmaElectronica · inspeccionarP12', () => {
  test('devuelve metadata sin exponer la key', () => {
    const { p12Buffer, password } = generarP12();
    const r = inspeccionarP12(p12Buffer, password);
    assert.ok(r.certificate);
    assert.equal(r.tieneKey, true);
    assert.equal(r.cadenaLongitud, 1);
  });

  test('contraseña incorrecta → error', () => {
    const { p12Buffer } = generarP12();
    assert.throws(() => inspeccionarP12(p12Buffer, 'mal'));
  });
});

// ============================================================
// CACHE
// ============================================================
describe('firmaElectronica · cache de certificados', () => {
  beforeEach(() => limpiarCache());

  test('limpiarCache vacía el cache', () => {
    const { certificatePem } = certificadoPrueba();
    getCertificadoInfo(certificatePem);
    getCertificadoInfo(certificatePem);
    // No hay forma directa de verificar hits, pero no debe romper.
    limpiarCache();
    assert.doesNotThrow(() => getCertificadoInfo(certificatePem));
  });
});

// ============================================================
// FIRMA CON CERT VENCIDO
// ============================================================
describe('firmaElectronica · cert vencido / no vigente', () => {
  test('rechaza firmar con cert vencido', () => {
    const { privateKeyPem, certificatePem } = generarP12({ validezDias: -1 });
    assert.throws(
      () => firmarXML(XML_BASE, privateKeyPem, certificatePem),
      (err) => err.codigo === 'CERT_VENCIDO'
    );
  });

  test('rechaza firmar con cert no vigente aún', () => {
    const { privateKeyPem, certificatePem } = generarP12({ notBeforeOffsetDias: 30 });
    assert.throws(
      () => firmarXML(XML_BASE, privateKeyPem, certificatePem),
      (err) => err.codigo === 'CERT_NO_VIGENTE'
    );
  });
});

// ============================================================
// MÚLTIPLES FIRMAS
// ============================================================
describe('firmaElectronica · múltiples firmas', () => {
  test('validarFirma rechaza XML con >1 Signature', () => {
    const { privateKeyPem, certificatePem } = certificadoPrueba();
    const firmado = firmarXML(XML_BASE, privateKeyPem, certificatePem);
    // Duplicamos el bloque de firma dentro del XML.
    const duplicado = firmado.replace('</factura>', firmado.match(/<ds:Signature[\s\S]*?<\/ds:Signature>/)[0] + '</factura>');
    const r = validarFirma(duplicado);
    assert.equal(r.valido, false);
    assert.match(r.motivo, /firmas/);
  });
});