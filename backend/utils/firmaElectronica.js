// backend/utils/firmaElectronica.js
// ============================================================
// Firma electrónica XAdES-BES para comprobantes del SRI
// ------------------------------------------------------------
// Características:
//   - Cifrado del password del certificado en BD (AES-256-GCM).
//   - Firma con C14N real (xml-crypto) + RSA-SHA1 (requerido SRI).
//   - Verificación criptográfica de la firma.
//
// ⚠️  El bloque de firma se inserta SIN `\n` extra entre el nodo
//     y la etiqueta de cierre. El SRI aplica enveloped-signature
//     eliminando el nodo <ds:Signature>; si hubiera whitespace
//     agregado por nosotros, el digest calculado por el SRI no
//     coincidiría con el que guardamos al firmar.
//
// ⚠️  El SRI exige SHA-1 para el digest. Sí, es obsoleto por NIST,
//     pero es requisito de la ficha técnica del SRI. NO cambiar sin
//     verificar nueva normativa.
//
// API pública:
//   cargarCertificado(p12Buffer, password)   → { privateKeyPem, certificatePem, certificate }
//   cargarCertificadoDesdeDB(db)             → idem
//   cifrarSecreto(texto)                     → string
//   descifrarSecreto(cifradoStr)             → string
//   firmarXML(xmlSinFirma, privKey, certPem) → string
//   validarFirma(xmlFirmado)                 → { valido, motivo?, partes? }
//   canonicalizarXml(xmlString)              → string (C14N)
//   extraerCertificadoPem(xmlFirmado)        → string | null
//
// Extensiones:
//   getCertificadoInfo(certPem)              → metadata del certificado
//   inspeccionarP12(p12Buffer, password)     → metadata sin cargar clave
//   validarEstructuraCertificado(cert)       → { valido, motivo? }
// ============================================================
'use strict';

const forge = require('node-forge');
const crypto = require('crypto');
const { C14nCanonicalization } = require('xml-crypto');
const { DOMParser } = require('@xmldom/xmldom');
const log = require('./logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  // ---- Cifrado ----
  algoritmoCifrado: 'aes-256-gcm',
  ivLength: 12,
  authTagLength: 16,

  // ---- Firma ----
  /** Algoritmo de digest exigido por el SRI (no cambiar sin normativa). */
  digestAlgoritmo: 'http://www.w3.org/2000/09/xmldsig#sha1',
  /** Algoritmo de firma exigido por el SRI. */
  firmaAlgoritmo: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  /** Canonicalización C14N. */
  c14nAlgoritmo: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  /** Enveloped signature transform. */
  envelopedTransform: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature',

  /** Longitud mínima de `CERT_ENCRYPTION_KEY` para advertir. */
  minKeyLen: 16,

  /** Máx. entradas del cache LRU de certificados parseados. */
  cacheMaxSize: 32
});

// ============================================================
// ERRORES TIPADOS
// ============================================================
function errorTipado(mensaje, codigo, status = 400) {
  const err = new Error(mensaje);
  err.codigo = codigo;
  err.status = status;
  return err;
}

// ============================================================
// CIFRADO DEL CERTIFICADO EN BD (AES-256-GCM)
// ============================================================
/**
 * Obtiene la clave de cifrado derivada del env `CERT_ENCRYPTION_KEY`.
 * @returns {Buffer} clave de 32 bytes (SHA-256 del secreto).
 * @throws {Error} si la variable falta.
 */
function obtenerClaveCifrado() {
  const raw = process.env.CERT_ENCRYPTION_KEY;
  if (!raw) {
    throw errorTipado(
      'Falta variable CERT_ENCRYPTION_KEY en el entorno',
      'CERT_ENCRYPTION_KEY_FALTANTE',
      500
    );
  }
  if (String(raw).length < CONFIG.minKeyLen && process.env.NODE_ENV === 'production') {
    log.warn(
      { len: String(raw).length },
      'CERT_ENCRYPTION_KEY es corta en producción (se recomienda 32+ caracteres aleatorios)'
    );
  }
  return crypto.createHash('sha256').update(String(raw)).digest();
}

/**
 * Cifra un texto con AES-256-GCM.
 * Formato de salida: `base64(iv):base64(tag):base64(cipher)`.
 *
 * @param {string} texto
 * @returns {string} Vacío si `texto` está vacío.
 */
function cifrarSecreto(texto) {
  if (!texto) return '';
  const key = obtenerClaveCifrado();
  const iv = crypto.randomBytes(CONFIG.ivLength);
  const cipher = crypto.createCipheriv(CONFIG.algoritmoCifrado, key, iv);
  const cifrado = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${cifrado.toString('base64')}`;
}

/**
 * Descifra un texto con AES-256-GCM.
 *
 * Compatibilidad: si el string no contiene `:`, se asume que viene
 * de versiones previas sin cifrar y se devuelve tal cual (con warning).
 *
 * @param {string} cifradoStr
 * @returns {string}
 * @throws {Error} con codigo estable si el formato o la clave fallan.
 */
function descifrarSecreto(cifradoStr) {
  if (!cifradoStr) return '';

  // Compatibilidad con datos sin cifrar.
  if (!cifradoStr.includes(':')) {
    log.warn(
      'Secreto sin cifrar detectado en BD. Re-súbelo por /api/certificado ' +
      'para que se guarde con AES-256-GCM.'
    );
    return cifradoStr;
  }

  const partes = cifradoStr.split(':');
  if (partes.length !== 3) {
    throw errorTipado(
      'Formato de secreto cifrado inválido (se esperaban 3 partes separadas por ":")',
      'SECRETO_FORMATO_INVALIDO',
      500
    );
  }

  const [ivB64, tagB64, dataB64] = partes;
  if (!ivB64 || !tagB64 || !dataB64) {
    throw errorTipado(
      'Formato de secreto cifrado incompleto',
      'SECRETO_FORMATO_INVALIDO',
      500
    );
  }

  let iv;
  let authTag;
  let data;
  try {
    iv = Buffer.from(ivB64, 'base64');
    authTag = Buffer.from(tagB64, 'base64');
    data = Buffer.from(dataB64, 'base64');
  } catch {
    throw errorTipado(
      'Secreto cifrado contiene base64 inválido',
      'SECRETO_FORMATO_INVALIDO',
      500
    );
  }

  if (iv.length !== CONFIG.ivLength) {
    throw errorTipado(
      `IV de longitud inválida (esperado ${CONFIG.ivLength}, recibido ${iv.length})`,
      'SECRETO_FORMATO_INVALIDO',
      500
    );
  }
  if (authTag.length !== CONFIG.authTagLength) {
    throw errorTipado(
      `Auth tag de longitud inválida (esperado ${CONFIG.authTagLength}, recibido ${authTag.length})`,
      'SECRETO_FORMATO_INVALIDO',
      500
    );
  }
  if (data.length === 0) {
    throw errorTipado('Secreto cifrado vacío', 'SECRETO_FORMATO_INVALIDO', 500);
  }

  try {
    const key = obtenerClaveCifrado();
    const decipher = crypto.createDecipheriv(CONFIG.algoritmoCifrado, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (err) {
    // El error típico es "Unsupported state or unable to authenticate data"
    // → CERT_ENCRYPTION_KEY cambió o el ciphertext fue manipulado.
    throw errorTipado(
      'No se pudo descifrar el secreto. ¿Cambió CERT_ENCRYPTION_KEY?',
      'SECRETO_DESCIFRADO_FALLO',
      500
    );
  }
}

// ============================================================
// CACHE LRU DE CERTIFICADOS Y CLAVES
// ------------------------------------------------------------
// `forge.pki.certificateFromPem` y `privateKeyFromPem` son caros
// (~10 ms con RSA-2048). En firma masiva, este cache ahorra
// tiempo significativo.
// ============================================================
const _cache = new Map(); // key: hash(PEM), value: { publicKey | privateKey, cert }

function _hashCacheKey(pem) {
  return crypto.createHash('sha256').update(pem).digest('hex').slice(0, 16);
}

function _cacheSet(key, value) {
  if (_cache.size >= CONFIG.cacheMaxSize) {
    // Elimina la primera entrada (FIFO simple — sirve para nuestro uso).
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) _cache.delete(firstKey);
  }
  _cache.set(key, value);
}

function _cacheGetOrCompute(key, computeFn) {
  if (_cache.has(key)) return _cache.get(key);
  const value = computeFn();
  _cacheSet(key, value);
  return value;
}

/** Limpia el cache interno (útil en tests y rotación de certificado). */
function limpiarCache() {
  _cache.clear();
}

// ============================================================
// HELPERS DE FORMATO
// ============================================================
/** Escapa un valor para XML. */
function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Escapa una cadena para usarla dentro de `new RegExp()`. */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Canonicaliza un XML con C14N (inclusive namespaces).
 * @param {string} xmlString
 * @returns {string}
 * @throws {Error} con codigo='XML_INVALIDO'.
 */
function canonicalizarXml(xmlString) {
  if (typeof xmlString !== 'string' || xmlString.length === 0) {
    throw errorTipado('XML vacío', 'XML_INVALIDO');
  }

  // Verificar que no queden caracteres sospechosos antes de parsear.
  // Un XML válido nunca empieza con `<<`.
  const trimmed = xmlString.trim();
  if (/^<<|<>/.test(trimmed)) {
    throw errorTipado('XML malformado (no empieza con etiqueta válida)', 'XML_INVALIDO');
  }

  let doc;
  try {
    doc = new DOMParser().parseFromString(xmlString, 'text/xml');
  } catch (err) {
    throw errorTipado(`No se pudo parsear el XML: ${err.message}`, 'XML_INVALIDO');
  }

  if (!doc || !doc.documentElement) {
    throw errorTipado('XML sin elemento raíz', 'XML_INVALIDO');
  }

  // `@xmldom/xmldom` a veces deja `nodeName` con `<<` cuando falla el parseo.
  if (doc.documentElement.nodeName && doc.documentElement.nodeName.includes('<')) {
    throw errorTipado(
      `XML inválido: tag no reconocido "${doc.documentElement.nodeName}"`,
      'XML_INVALIDO'
    );
  }

  try {
    const c14n = new C14nCanonicalization();
    return c14n.process(doc.documentElement, { inclusiveNamespacesPrefixList: [] });
  } catch (err) {
    throw errorTipado(`Error canonicalizando XML: ${err.message}`, 'XML_INVALIDO');
  }
}

/** SHA-1 del string (UTF-8), codificado en base64. Requerido por el SRI. */
function sha1Base64(str) {
  const md = forge.md.sha1.create();
  md.update(str, 'utf8');
  return forge.util.encode64(md.digest().bytes());
}

/**
 * Extrae el certificado X.509 (PEM) del XML firmado.
 * @param {string} xmlFirmado
 * @returns {string|null}
 */
function extraerCertificadoPem(xmlFirmado) {
  if (typeof xmlFirmado !== 'string') return null;
  const m = xmlFirmado.match(/<(?:\w+:)?X509Certificate>([\s\S]*?)<\/(?:\w+:)?X509Certificate>/);
  if (!m) return null;
  const b64 = m[1].replace(/\s/g, '');
  if (!b64 || b64.length < 100) return null;
  const chunks = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${chunks.join('\n')}\n-----END CERTIFICATE-----\n`;
}

// ============================================================
// PARSEO DE PEM CON CACHE
// ============================================================
function _parseCertificadoPem(certificatePem) {
  const key = `cert:${_hashCacheKey(certificatePem)}`;
  return _cacheGetOrCompute(key, () => forge.pki.certificateFromPem(certificatePem));
}

function _parseClavePrivadaPem(privateKeyPem) {
  const key = `key:${_hashCacheKey(privateKeyPem)}`;
  return _cacheGetOrCompute(key, () => forge.pki.privateKeyFromPem(privateKeyPem));
}

// ============================================================
// INSPECCIÓN DE CERTIFICADOS
// ============================================================
/**
 * Extrae metadata legible de un certificado X.509 (PEM).
 * @param {string} certificatePem
 * @returns {object}
 */
function getCertificadoInfo(certificatePem) {
  const cert = _parseCertificadoPem(certificatePem);
  const ahora = new Date();

  const subjectAltNames = [];
  try {
    const ext = cert.getExtension('subjectAltName');
    if (ext && Array.isArray(ext.altNames)) {
      for (const alt of ext.altNames) {
        if (!alt) continue;
        if (typeof alt.value === 'string') {
          subjectAltNames.push(alt.value);
        } else if (alt.value && typeof alt.value === 'object') {
          try { subjectAltNames.push(JSON.stringify(alt.value)); } catch { /* noop */ }
        }
      }
    }
  } catch { /* noop: algunos P12 no traen SAN */ }

  const notBefore = cert.validity.notBefore;
  const notAfter = cert.validity.notAfter;
  const vencido = ahora > notAfter;
  const noVigenteAun = ahora < notBefore;

  return {
    subject: cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', '),
    issuer: cert.issuer.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', '),
    serialNumber: cert.serialNumber,
    validityNotBefore: notBefore,
    validityNotAfter: notAfter,
    vencido,
    noVigenteAun,
    subjectAltNames,
    diasRestantes: Math.ceil((notAfter - ahora) / 86_400_000)
  };
}

/**
 * Valida estructuralmente un objeto `certificate` (el que devuelve
 * `cargarCertificado`). No vuelve a parsear.
 * @param {object} cert
 * @returns {{ valido: boolean, motivo?: string }}
 */
function validarEstructuraCertificado(cert) {
  if (!cert) return { valido: false, motivo: 'Certificado ausente' };
  if (!cert.subject) return { valido: false, motivo: 'Certificado sin subject' };
  if (!cert.issuer) return { valido: false, motivo: 'Certificado sin issuer' };
  if (!cert.validityNotAfter) return { valido: false, motivo: 'Certificado sin fecha de vencimiento' };

  const ahora = new Date();
  if (ahora > cert.validityNotAfter) {
    return { valido: false, motivo: `Certificado vencido el ${cert.validityNotAfter.toISOString().slice(0, 10)}` };
  }
  if (cert.validityNotBefore && ahora < cert.validityNotBefore) {
    return { valido: false, motivo: `Certificado aún no válido (desde ${cert.validityNotBefore.toISOString().slice(0, 10)})` };
  }
  return { valido: true };
}

// ============================================================
// CARGAR CERTIFICADO .P12
// ============================================================
/**
 * Carga un .p12 / .pfx y extrae la clave privada + certificado.
 *
 * @param {Buffer} p12Buffer
 * @param {string} password
 * @returns {{
 *   privateKeyPem: string,
 *   certificatePem: string,
 *   certificate: object
 * }}
 * @throws {Error} con códigos tipados:
 *   - P12_VACIO | P12_INVALIDO
 *   - PASSWORD_INCORRECTA
 *   - CERT_NO_ENCONTRADO | KEY_NO_ENCONTRADA
 */
function cargarCertificado(p12Buffer, password) {
  if (!Buffer.isBuffer(p12Buffer) || p12Buffer.length === 0) {
    throw errorTipado('Archivo .p12 vacío o inválido', 'P12_VACIO');
  }
  if (password === null || password === undefined) {
    throw errorTipado('Contraseña del certificado requerida', 'PASSWORD_REQUERIDA');
  }

  let p12;
  try {
    // `latin1` = `binary` (deprecated). Conserva byte a byte.
    const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('latin1'));
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  } catch (err) {
    const msg = String(err.message || '').toLowerCase();
    if (msg.includes('invalid password') || msg.includes('mac could not be verified')) {
      throw errorTipado('Contraseña del certificado incorrecta', 'PASSWORD_INCORRECTA');
    }
    if (msg.includes('too few bytes') || msg.includes('malformed')) {
      throw errorTipado('El archivo no es un .p12 válido', 'P12_INVALIDO');
    }
    throw errorTipado(`Error al leer el .p12: ${err.message}`, 'P12_INVALIDO');
  }

  // ---- Certificado ----
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  if (certBags.length === 0) {
    throw errorTipado('No se encontró certificado en el archivo .p12', 'CERT_NO_ENCONTRADO');
  }

  // ---- Clave privada ----
  const pkcs8Bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  const keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [];

  let privateKey = null;
  let keyLocalId = null;
  if (pkcs8Bags.length > 0) {
    privateKey = pkcs8Bags[0].key;
    keyLocalId = pkcs8Bags[0].attributes?.localKeyId;
  } else if (keyBags.length > 0) {
    privateKey = keyBags[0].key;
    keyLocalId = keyBags[0].attributes?.localKeyId;
  }

  if (!privateKey) {
    throw errorTipado('No se encontró clave privada en el archivo .p12', 'KEY_NO_ENCONTRADA');
  }

  // ---- Emparejar leaf certificate ----
  // Si `localKeyId` está disponible, lo usamos para elegir el cert correcto
  // entre la cadena (leaf + intermedios). Si no, tomamos el primero.
  let leafBag = certBags[0];
  if (keyLocalId) {
    const match = certBags.find(b => {
      const id = b.attributes?.localKeyId;
      return id && Buffer.isBuffer(id) && Buffer.isBuffer(keyLocalId) && id.equals(keyLocalId);
    });
    if (match) leafBag = match;
  }

  const cert = leafBag.cert;
  const certificatePem = forge.pki.certificateToPem(cert);
  const privateKeyPem = forge.pki.privateKeyToPem(privateKey);

  const info = getCertificadoInfo(certificatePem);

  return { privateKeyPem, certificatePem, certificate: info };
}

/**
 * Carga el certificado desde la colección `certificados` (singleton `_id: 'empresa'`).
 * @param {Db} db
 * @returns {Promise<object>}
 */
async function cargarCertificadoDesdeDB(db) {
  const doc = await db.collection('certificados').findOne({ _id: 'empresa' });
  if (!doc) {
    throw errorTipado('No hay certificado cargado en el sistema', 'CERT_NO_CARGADO', 404);
  }

  const passwordCifrado = doc.password_cifrado || doc.password;
  if (!passwordCifrado) {
    throw errorTipado('El certificado en BD no tiene contraseña', 'CERT_SIN_PASSWORD', 500);
  }

  const password = descifrarSecreto(passwordCifrado);
  if (!doc.archivo_base64) {
    throw errorTipado('El certificado en BD no tiene archivo', 'CERT_SIN_ARCHIVO', 500);
  }

  const p12Buffer = Buffer.from(doc.archivo_base64, 'base64');
  return cargarCertificado(p12Buffer, password);
}

/**
 * Inspecciona un .p12 sin cargar la clave privada completa (útil
 * para endpoints de diagnóstico).
 *
 * @param {Buffer} p12Buffer
 * @param {string} password
 * @returns {{ certificate: object, tieneKey: boolean, cadenaLongitud: number }}
 */
function inspeccionarP12(p12Buffer, password) {
  if (!Buffer.isBuffer(p12Buffer) || p12Buffer.length === 0) {
    throw errorTipado('Archivo .p12 vacío o inválido', 'P12_VACIO');
  }
  const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('latin1'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  if (certBags.length === 0) {
    throw errorTipado('No se encontró certificado en el archivo .p12', 'CERT_NO_ENCONTRADO');
  }

  const pkcs8Bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  const keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [];

  const certPem = forge.pki.certificateToPem(certBags[0].cert);
  return {
    certificate: getCertificadoInfo(certPem),
    tieneKey: pkcs8Bags.length > 0 || keyBags.length > 0,
    cadenaLongitud: certBags.length
  };
}

// ============================================================
// FIRMAR XML (XAdES-BES)
// ============================================================
/**
 * Firma un XML con XAdES-BES y lo devuelve con el bloque
 * `<ds:Signature>` insertado antes del cierre del root.
 *
 * ⚠️  La estructura del XML firmado es EXACTAMENTE la que exige el
 *     SRI. No cambiar el orden de elementos ni los algoritmos sin
 *     revisar la ficha técnica del SRI.
 *
 * @param {string} xmlSinFirma
 * @param {string} privateKeyPem
 * @param {string} certificatePem
 * @returns {string} XML firmado
 * @throws {Error} con códigos tipados.
 */
function firmarXML(xmlSinFirma, privateKeyPem, certificatePem) {
  // ---- Validaciones de entrada ----
  if (!xmlSinFirma || typeof xmlSinFirma !== 'string') {
    throw errorTipado('XML a firmar vacío o inválido', 'XML_VACIO');
  }
  if (!privateKeyPem) {
    throw errorTipado('Falta la clave privada para firmar', 'KEY_FALTANTE');
  }
  if (!certificatePem) {
    throw errorTipado('Falta el certificado para firmar', 'CERT_FALTANTE');
  }

  // ---- Parseo del certificado + verificación de vigencia ----
  let certForge;
  try {
    certForge = _parseCertificadoPem(certificatePem);
  } catch (e) {
    throw errorTipado(`No se pudo parsear el certificado: ${e.message}`, 'CERT_INVALIDO');
  }

  const ahora = new Date();
  if (ahora > certForge.validity.notAfter) {
    throw errorTipado(
      `El certificado está vencido (expiró el ${certForge.validity.notAfter.toISOString().slice(0, 10)})`,
      'CERT_VENCIDO'
    );
  }
  if (ahora < certForge.validity.notBefore) {
    throw errorTipado(
      `El certificado aún no es válido (vigente desde ${certForge.validity.notBefore.toISOString().slice(0, 10)})`,
      'CERT_NO_VIGENTE'
    );
  }

  // ---- Idempotencia: si ya está firmado, no re-firmar ----
  if (xmlSinFirma.includes('<ds:Signature')) {
    return xmlSinFirma;
  }

  // ---- Validación del root ----
  if (!/id\s*=\s*"comprobante"/i.test(xmlSinFirma)) {
    throw errorTipado(
      'El elemento raíz del XML debe tener id="comprobante"',
      'XML_SIN_ID_COMPROBANTE'
    );
  }

  // ---- Preparar datos del certificado ----
  const certLimpio = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');

  const issuerName = certForge.issuer.attributes
    .map(a => `${a.shortName || a.name}=${a.value}`)
    .join(', ');
  const serialNumber = certForge.serialNumber;

  // ---- IDs únicos ----
  const ts = Date.now();
  const signatureId = `Signature-${ts}`;
  const signedPropertiesId = `Signature-SignedProperties-${ts}`;
  const reference0Id = `Reference-ID-${ts}`;
  const keyInfoId = `Certificate-${ts}`;
  const objectId = `Signature-Object-${ts}`;

  // Sin milisegundos — algunas validaciones XAdES lo prefieren.
  const fechaFirma = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const certDer = forge.util.decode64(certLimpio);
  const certMd = forge.md.sha1.create();
  certMd.update(certDer);
  const certDigest = forge.util.encode64(certMd.digest().bytes());

  // ---- SignedProperties (XAdES-BES) ----
  const signedProperties =
    `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${signedPropertiesId}">` +
      `<xades:SignedSignatureProperties>` +
        `<xades:SigningTime>${fechaFirma}</xades:SigningTime>` +
        `<xades:SigningCertificate>` +
          `<xades:Cert>` +
            `<xades:CertDigest>` +
              `<ds:DigestMethod Algorithm="${CONFIG.digestAlgoritmo}"/>` +
              `<ds:DigestValue>${certDigest}</ds:DigestValue>` +
            `</xades:CertDigest>` +
            `<xades:IssuerSerial>` +
              `<ds:X509IssuerName>${escXml(issuerName)}</ds:X509IssuerName>` +
              `<ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>` +
            `</xades:IssuerSerial>` +
          `</xades:Cert>` +
        `</xades:SigningCertificate>` +
      `</xades:SignedSignatureProperties>` +
      `<xades:SignedDataObjectProperties>` +
        `<xades:DataObjectFormat ObjectReference="#${reference0Id}">` +
          `<xades:Description>contenido comprobante</xades:Description>` +
          `<xades:MimeType>text/xml</xades:MimeType>` +
        `</xades:DataObjectFormat>` +
      `</xades:SignedDataObjectProperties>` +
    `</xades:SignedProperties>`;

  // ---- Digests ----
  const docC14n = canonicalizarXml(xmlSinFirma);
  const digestValue = sha1Base64(docC14n);

  const spC14n = canonicalizarXml(signedProperties);
  const signedPropertiesDigest = sha1Base64(spC14n);

  // ---- SignedInfo ----
  const signedInfo =
    `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
      `<ds:CanonicalizationMethod Algorithm="${CONFIG.c14nAlgoritmo}"/>` +
      `<ds:SignatureMethod Algorithm="${CONFIG.firmaAlgoritmo}"/>` +
      `<ds:Reference Id="${reference0Id}" URI="#comprobante">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="${CONFIG.envelopedTransform}"/>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="${CONFIG.digestAlgoritmo}"/>` +
        `<ds:DigestValue>${digestValue}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference URI="#${signedPropertiesId}">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="${CONFIG.c14nAlgoritmo}"/>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="${CONFIG.digestAlgoritmo}"/>` +
        `<ds:DigestValue>${signedPropertiesDigest}</ds:DigestValue>` +
      `</ds:Reference>` +
    `</ds:SignedInfo>`;

  // ---- Firmar SignedInfo ----
  const signedInfoC14n = canonicalizarXml(signedInfo);
  const mdSig = forge.md.sha1.create();
  mdSig.update(signedInfoC14n, 'utf8');
  const privateKey = _parseClavePrivadaPem(privateKeyPem);
  const signatureValue = forge.util.encode64(privateKey.sign(mdSig));

  // ---- Bloque de firma completo ----
  const signatureBlock =
    `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${signatureId}">` +
      signedInfo +
      `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
      `<ds:KeyInfo Id="${keyInfoId}">` +
        `<ds:X509Data>` +
          `<ds:X509Certificate>${certLimpio}</ds:X509Certificate>` +
        `</ds:X509Data>` +
      `</ds:KeyInfo>` +
      `<ds:Object Id="${objectId}">${signedProperties}</ds:Object>` +
    `</ds:Signature>`;

  // ---- Insertar antes del closing tag del root ----
  const closingTagMatch = xmlSinFirma.match(/<\/([a-zA-Z][\w:-]*)>\s*$/);
  if (!closingTagMatch) {
    throw errorTipado('No se encontró etiqueta de cierre del XML', 'XML_SIN_CIERRE');
  }

  const closingTag = closingTagMatch[0];
  const closingTagEscapado = escapeRegExp(closingTag);

  const xmlFirmado = xmlSinFirma.replace(
    new RegExp(closingTagEscapado + '\\s*$'),
    signatureBlock + closingTag
  );

  return xmlFirmado;
}

// ============================================================
// VALIDAR FIRMA
// ============================================================
/**
 * Verifica la firma de un XML firmado con `firmarXML`.
 * @param {string} xmlFirmado
 * @returns {{ valido: boolean, motivo?: string, certificado?: object }}
 */
function validarFirma(xmlFirmado) {
  if (!xmlFirmado || typeof xmlFirmado !== 'string') {
    return { valido: false, motivo: 'XML vacío' };
  }

  // ---- Chequeos estructurales ----
  const checks = [
    ['<ds:Signature', 'No se encontró bloque de firma'],
    ['<ds:SignatureValue>', 'Falta SignatureValue'],
    ['<ds:X509Certificate>', 'Falta X509Certificate'],
    ['<xades:SignedProperties', 'Falta SignedProperties (XAdES-BES)']
  ];
  for (const [needle, motivo] of checks) {
    if (!xmlFirmado.includes(needle)) return { valido: false, motivo };
  }

  if (!/id\s*=\s*"comprobante"/i.test(xmlFirmado)) {
    return { valido: false, motivo: 'El elemento raíz no tiene id="comprobante"' };
  }

  // ---- Detectar múltiples firmas (no soportado) ----
  const signaturesCount = (xmlFirmado.match(/<ds:Signature\b/g) || []).length;
  if (signaturesCount > 1) {
    return { valido: false, motivo: `Se encontraron ${signaturesCount} firmas (no soportado)` };
  }

  try {
    const certificatePem = extraerCertificadoPem(xmlFirmado);
    if (!certificatePem) {
      return { valido: false, motivo: 'No se pudo extraer el certificado del XML' };
    }

    const sigBlockMatch = xmlFirmado.match(/<ds:Signature[\s\S]*?<\/ds:Signature>/);
    const signedInfoMatch = xmlFirmado.match(/<ds:SignedInfo[\s\S]*?<\/ds:SignedInfo>/);
    const sigValueMatch = xmlFirmado.match(/<ds:SignatureValue>([\s\S]*?)<\/ds:SignatureValue>/);
    if (!sigBlockMatch || !signedInfoMatch || !sigValueMatch) {
      return { valido: false, motivo: 'Bloques de firma incompletos' };
    }

    const certForge = _parseCertificadoPem(certificatePem);
    const publicKey = certForge.publicKey;

    // ---- Verificar firma del SignedInfo ----
    const signedInfoC14n = canonicalizarXml(signedInfoMatch[0]);
    const md = forge.md.sha1.create();
    md.update(signedInfoC14n, 'utf8');
    const signatureBytes = forge.util.decode64(sigValueMatch[1].replace(/\s/g, ''));
    const firmaOk = publicKey.verify(md.digest().bytes(), signatureBytes);

    if (!firmaOk) {
      return { valido: false, motivo: 'La firma no coincide con el certificado' };
    }

    // ---- Verificar digest del documento (detecta manipulación) ----
    const xmlSinFirma = xmlFirmado.replace(sigBlockMatch[0], '');
    const docC14n = canonicalizarXml(xmlSinFirma);
    const docDigestCalc = sha1Base64(docC14n);

    const digestRefMatch = sigBlockMatch[0].match(
      /<ds:Reference[^>]*URI="#comprobante"[^>]*>[\s\S]*?<ds:DigestValue>([\s\S]*?)<\/ds:DigestValue>/
    );
    if (digestRefMatch) {
      const digestDocEnXml = digestRefMatch[1].replace(/\s/g, '');
      if (digestDocEnXml !== docDigestCalc) {
        return { valido: false, motivo: 'El digest del documento no coincide (fue alterado)' };
      }
    }

    // ---- Certificado parseado (útil para el caller) ----
    const certificado = getCertificadoInfo(certificatePem);
    return { valido: true, certificado };
  } catch (err) {
    return { valido: false, motivo: 'Error verificando firma: ' + err.message };
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  cargarCertificado,
  cargarCertificadoDesdeDB,
  cifrarSecreto,
  descifrarSecreto,
  firmarXML,
  validarFirma,
  canonicalizarXml,
  extraerCertificadoPem,

  // ---- Extensiones ----
  getCertificadoInfo,
  validarEstructuraCertificado,
  inspeccionarP12,
  limpiarCache,

  // ---- Constantes ----
  CONFIG
};

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._errorTipado = errorTipado;
module.exports._escXml = escXml;
module.exports._escapeRegExp = escapeRegExp;
module.exports._sha1Base64 = sha1Base64;
module.exports._obtenerClaveCifrado = obtenerClaveCifrado;
module.exports._parseCertificadoPem = _parseCertificadoPem;
module.exports._parseClavePrivadaPem = _parseClavePrivadaPem;
module.exports._cache = _cache;
module.exports._hashCacheKey = _hashCacheKey;