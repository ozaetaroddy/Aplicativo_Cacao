// backend/tests/firmaElectronica.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const forge = require('node-forge');
const { firmarXML, validarFirma } = require('../utils/firmaElectronica');

/**
 * Genera un certificado autofirmado RSA-2048 (para tests).
 * Caché a nivel módulo para no regenerar en cada test (es costoso).
 */
let _certCache = null;
function certificadoPrueba() {
  if (_certCache) return _certCache;

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [
    { name: 'commonName', value: 'Test Certificado' },
    { name: 'countryName', value: 'EC' }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  _certCache = {
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certificatePem: forge.pki.certificateToPem(cert)
  };
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

describe('firmaElectronica', () => {
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
    // Alterar el contenido sin tocar la firma
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
    assert.throws(() => firmarXML(xmlMalo, privateKeyPem, certificatePem));
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
});