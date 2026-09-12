// backend/scripts/generar-certificado-prueba.js
// Genera un certificado .p12 AUTOFIRMADO para probar el flujo de firma.
//
// ⚠️  ADVERTENCIA:
//   Este certificado NO es válido para el SRI. Solo sirve para probar
//   que el código de firma funciona. Para facturar de verdad necesitas
//   un certificado de Security Data, ANF, BCE u otra CA autorizada.
//
// Uso:
//   node scripts/generar-certificado-prueba.js
//
// Genera: certificado-prueba.p12 (contraseña: "prueba123")

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

const PASSWORD = 'prueba123';
const RUC = '1790012344001'; // ⚠️ Cámbialo por tu RUC real si quieres
const NOMBRE = 'CERTIFICADO PRUEBA';
const DIAS_VALIDEZ = 365;

console.log('🔐 Generando certificado autofirmado de prueba...');
console.log(`   RUC: ${RUC}`);
console.log(`   Titular: ${NOMBRE}`);
console.log(`   Validez: ${DIAS_VALIDEZ} días`);
console.log('');

// 1. Generar par de claves RSA 2048
console.log('   🔑 Generando par de claves RSA-2048 (puede tardar unos segundos)...');
const keys = forge.pki.rsa.generateKeyPair(2048);

// 2. Crear el certificado
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = String(Date.now());

const ahora = new Date();
cert.validity.notBefore = ahora;
cert.validity.notAfter = new Date();
cert.validity.notAfter.setDate(cert.validity.notAfter.getDate() + DIAS_VALIDEZ);

const attrs = [
  { name: 'commonName', value: `${NOMBRE} ${RUC}` },
  { name: 'countryName', value: 'EC' },
  { shortName: 'ST', value: 'Pichincha' },
  { name: 'localityName', value: 'Quito' },
  { name: 'organizationName', value: 'PRUEBAS INTERNAS' },
  { name: 'organizationalUnitName', value: 'FACTURACION ELECTRONICA' },
  // RUC en el serialNumber (como hacen las CAs ecuatorianas)
  { name: 'serialNumber', value: RUC }
];

cert.setSubject(attrs);
cert.setIssuer(attrs);

// Extensiones
cert.setExtensions([
  { name: 'basicConstraints', cA: false },
  { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
  { name: 'extKeyUsage', clientAuth: true, emailProtection: true },
  { name: 'subjectAltName', altNames: [{ type: 4, value: `${NOMBRE} <prueba@local>` }] }
]);

// 3. Autofirmar con SHA-256
cert.sign(keys.privateKey, forge.md.sha256.create());
console.log('   ✍️  Certificado autofirmado con SHA-256');

// 4. Empaquetar como PKCS#12 (.p12)
const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PASSWORD, {
  algorithm: '3des'
});
const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
const p12Buffer = Buffer.from(p12Der, 'binary');

// 5. Guardar
const rutaSalida = path.join(__dirname, '..', 'certificado-prueba.p12');
fs.writeFileSync(rutaSalida, p12Buffer);

console.log('');
console.log('─'.repeat(60));
console.log('✅ Certificado generado');
console.log('');
console.log(`   Archivo:    certificado-prueba.p12`);
console.log(`   Ruta:       ${rutaSalida}`);
console.log(`   Tamaño:     ${(p12Buffer.length / 1024).toFixed(1)} KB`);
console.log(`   Contraseña: ${PASSWORD}`);
console.log('');
console.log('   Subject: ' + cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', '));
console.log('   Serial:  ' + cert.serialNumber);
console.log('   Vence:   ' + cert.validity.notAfter.toISOString().slice(0, 10));
console.log('');
console.log('─'.repeat(60));
console.log('');
console.log('📋 SIGUIENTE PASO:');
console.log('   1. Abre el panel web del sistema');
console.log('   2. Ve a Administración → Certificado Firma');
console.log('   3. Sube el archivo "certificado-prueba.p12"');
console.log(`   4. Contraseña: ${PASSWORD}`);
console.log('');
console.log('⚠️  Este certificado NO sirve para el SRI. Solo prueba interna.');
console.log('   Para facturar de verdad: Security Data, ANF, BCE, etc.');