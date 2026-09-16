// backend/scripts/generar-certificado-prueba.js
// ============================================================
// Genera un certificado .p12 AUTOFIRMADO para probar el flujo de firma.
//
// ⚠️  ADVERTENCIA:
//   Este certificado NO es válido para el SRI. Solo sirve para probar
//   que el código de firma funciona. Para facturar de verdad necesitas
//   un certificado de Security Data, ANF, BCE u otra CA autorizada.
//
// Uso:
//   node scripts/generar-certificado-prueba.js
//   node scripts/generar-certificado-prueba.js --ruc=1790012344001
//   node scripts/generar-certificado-prueba.js --nombre="MI EMPRESA" --dias=30
//   node scripts/generar-certificado-prueba.js --password=MiPass --out=./cert.p12
// ============================================================
'use strict';

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const { log, ok, warn } = require('./_utils');

// ============================================================
// PARSEO (standalone: no usa run() porque no toca Mongo)
// ============================================================
function parseArgs(argv) {
  const flags = new Set();
  const kv = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const trimmed = raw.slice(2);
    const eq = trimmed.indexOf('=');
    if (eq === -1) flags.add(trimmed);
    else kv[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return { flags, kv };
}

const { kv } = parseArgs(process.argv.slice(2));

const PASSWORD = kv.password || 'prueba123';
const RUC = kv.ruc || '1790012344001';
const NOMBRE = kv.nombre || 'CERTIFICADO PRUEBA';
const DIAS_VALIDEZ = Number(kv.dias) > 0 ? Number(kv.dias) : 365;
const RUTA_SALIDA = kv.out
  ? path.resolve(kv.out)
  : path.join(process.cwd(), 'certificado-prueba.p12');

// ============================================================
// MAIN
// ============================================================
async function main() {
  log('🔐 Generando certificado autofirmado de prueba…');
  log(`   RUC:      ${RUC}`);
  log(`   Titular:  ${NOMBRE}`);
  log(`   Validez:  ${DIAS_VALIDEZ} días`);
  log(`   Password: ${'•'.repeat(PASSWORD.length)}`);
  log('');

  // 1. Par de claves RSA-2048
  log('   🔑 Generando par de claves RSA-2048 (puede tardar unos segundos)…');
  const keys = forge.pki.rsa.generateKeyPair(2048);

  // 2. Certificado
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
    { name: 'serialNumber', value: RUC }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'extKeyUsage', clientAuth: true, emailProtection: true },
    { name: 'subjectAltName', altNames: [{ type: 4, value: `${NOMBRE} <prueba@local>` }] }
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());
  log('   ✍️  Certificado autofirmado con SHA-256');

  // 3. Empaquetar como PKCS#12
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PASSWORD, {
    algorithm: '3des'
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const p12Buffer = Buffer.from(p12Der, 'binary');

  // 4. Guardar
  const dir = path.dirname(RUTA_SALIDA);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(RUTA_SALIDA, p12Buffer);

  log('');
  log('─'.repeat(60));
  ok('Certificado generado');
  log('');
  log(`   Archivo:    ${path.basename(RUTA_SALIDA)}`);
  log(`   Ruta:       ${RUTA_SALIDA}`);
  log(`   Tamaño:     ${(p12Buffer.length / 1024).toFixed(1)} KB`);
  log(`   Contraseña: ${PASSWORD}`);
  log('');
  log(`   Subject: ${cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ')}`);
  log(`   Serial:  ${cert.serialNumber}`);
  log(`   Vence:   ${cert.validity.notAfter.toISOString().slice(0, 10)}`);
  log('');
  log('─'.repeat(60));
  log('');
  log('📋 SIGUIENTE PASO:');
  log('   1. Abre el panel web');
  log('   2. Ve a Administración → Certificado Firma');
  log(`   3. Sube "${path.basename(RUTA_SALIDA)}" con la contraseña "${PASSWORD}"`);
  log('');
  warn('Este certificado NO sirve para el SRI. Solo prueba interna.');
  log('   Para facturar de verdad: Security Data, ANF, BCE, etc.');
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});