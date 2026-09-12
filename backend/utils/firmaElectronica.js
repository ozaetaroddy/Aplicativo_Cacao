// backend/utils/firmaElectronica.js
// Firma electrónica XAdES-BES para comprobantes del SRI.
// - Cifrado del certificado en BD (AES-256-GCM).
// - Firma con C14N real (xml-crypto) + RSA-SHA1 (requerido por el SRI).
// - Verificación criptográfica de la firma.
//
// ⚠️  FIX 2024-XX: el bloque de firma se inserta SIN `\n` extra entre el
// nodo y la etiqueta de cierre. El SRI aplica enveloped-signature eliminando
// el nodo <ds:Signature>; si hubiera whitespace agregado por nosotros, el
// digest calculado por el SRI no coincidiría con el que guardamos al firmar.

const forge = require('node-forge');
const crypto = require('crypto');
const { C14nCanonicalization } = require('xml-crypto');
const { DOMParser } = require('@xmldom/xmldom');

// ============================================================
// CIFRADO DEL CERTIFICADO EN BD (AES-256-GCM)
// ============================================================
const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

function obtenerClaveCifrado() {
  const raw = process.env.CERT_ENCRYPTION_KEY;
  if (!raw) throw new Error('Falta variable CERT_ENCRYPTION_KEY en el entorno');
  return crypto.createHash('sha256').update(raw).digest();
}

function cifrarSecreto(texto) {
  if (!texto) return '';
  const key = obtenerClaveCifrado();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const cifrado = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${cifrado.toString('base64')}`;
}

function descifrarSecreto(cifradoStr) {
  if (!cifradoStr) return '';
  if (!cifradoStr.includes(':')) return cifradoStr;
  try {
    const [ivB64, tagB64, dataB64] = cifradoStr.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const key = obtenerClaveCifrado();
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (err) {
    throw new Error('No se pudo descifrar el secreto (¿CERT_ENCRYPTION_KEY cambió?): ' + err.message);
  }
}

// ============================================================
// CARGAR CERTIFICADO .P12
// ============================================================
function cargarCertificado(p12Buffer, password) {
  try {
    if (!Buffer.isBuffer(p12Buffer) || p12Buffer.length === 0) {
      throw new Error('Archivo .p12 vacío o inválido');
    }

    const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBags = bags[forge.pki.oids.certBag] || [];
    if (certBags.length === 0) throw new Error('No se encontró certificado en el archivo .p12');

    const cert = certBags[0].cert;
    const certificatePem = forge.pki.certificateToPem(cert);

    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const pkcs8Bags = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
    const keyBags2 = p12.getBags({ bagType: forge.pki.oids.keyBag });
    const keyBags2Arr = keyBags2[forge.pki.oids.keyBag] || [];

    let privateKey = null;
    if (pkcs8Bags.length > 0) privateKey = pkcs8Bags[0].key;
    else if (keyBags2Arr.length > 0) privateKey = keyBags2Arr[0].key;

    if (!privateKey) throw new Error('No se encontró clave privada en el archivo .p12');

    const privateKeyPem = forge.pki.privateKeyToPem(privateKey);

    const ahora = new Date();
    const notBefore = cert.validity.notBefore;
    const notAfter = cert.validity.notAfter;
    const vencido = ahora > notAfter;
    const noVigenteAun = ahora < notBefore;

    return {
      privateKeyPem,
      certificatePem,
      certificate: {
        subject: cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', '),
        issuer: cert.issuer.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', '),
        serialNumber: cert.serialNumber,
        validityNotBefore: notBefore,
        validityNotAfter: notAfter,
        vencido,
        noVigenteAun,
        diasRestantes: Math.ceil((notAfter - ahora) / 86400000)
      }
    };
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('invalid password') || msg.includes('mac could not be verified')) {
      throw new Error('Contraseña del certificado incorrecta');
    }
    if (msg.includes('too few bytes') || msg.includes('malformed')) {
      throw new Error('El archivo no es un .p12 válido');
    }
    throw new Error('Error al cargar certificado: ' + err.message);
  }
}

async function cargarCertificadoDesdeDB(db) {
  const doc = await db.collection('certificados').findOne({ _id: 'empresa' });
  if (!doc) throw new Error('No hay certificado cargado en el sistema');
  const password = descifrarSecreto(doc.password_cifrado || doc.password);
  const p12Buffer = Buffer.from(doc.archivo_base64, 'base64');
  return cargarCertificado(p12Buffer, password);
}

// ============================================================
// HELPERS DE FIRMA
// ============================================================
function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function canonicalizarXml(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
  if (!doc || !doc.documentElement) throw new Error('XML inválido');
  const c14n = new C14nCanonicalization();
  return c14n.process(doc.documentElement, { inclusiveNamespacesPrefixList: [] });
}

function sha1Base64(str) {
  const md = forge.md.sha1.create();
  md.update(str, 'utf8');
  return forge.util.encode64(md.digest().bytes());
}

function extraerCertificadoPem(xmlFirmado) {
  const m = xmlFirmado.match(/<(?:\w+:)?X509Certificate>([\s\S]*?)<\/(?:\w+:)?X509Certificate>/);
  if (!m) return null;
  const b64 = m[1].replace(/\s/g, '');
  const chunks = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${chunks.join('\n')}\n-----END CERTIFICATE-----\n`;
}

// ============================================================
// FIRMAR XML (XAdES-BES)
// ============================================================
function firmarXML(xmlSinFirma, privateKeyPem, certificatePem) {
  if (!xmlSinFirma || typeof xmlSinFirma !== 'string') {
    throw new Error('XML a firmar vacío o inválido');
  }
  if (!privateKeyPem) throw new Error('Falta la clave privada para firmar');
  if (!certificatePem) throw new Error('Falta el certificado para firmar');

  if (xmlSinFirma.includes('<ds:Signature')) return xmlSinFirma;

  if (!/id="comprobante"/i.test(xmlSinFirma)) {
    throw new Error('El elemento raíz del XML debe tener id="comprobante"');
  }

  const certLimpio = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');

  const certForge = forge.pki.certificateFromPem(certificatePem);
  const issuerName = certForge.issuer.attributes
    .map(a => `${a.shortName || a.name}=${a.value}`)
    .join(', ');
  const serialNumber = certForge.serialNumber;

  const ts = Date.now();
  const signatureId = `Signature-${ts}`;
  const signedPropertiesId = `Signature-SignedProperties-${ts}`;
  const reference0Id = `Reference-ID-${ts}`;
  const keyInfoId = `Certificate-${ts}`;
  const objectId = `Signature-Object-${ts}`;

  const fechaFirma = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const certDer = forge.util.decode64(certLimpio);
  const certMd = forge.md.sha1.create();
  certMd.update(certDer);
  const certDigest = forge.util.encode64(certMd.digest().bytes());

  const signedProperties =
    `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${signedPropertiesId}">` +
      `<xades:SignedSignatureProperties>` +
        `<xades:SigningTime>${fechaFirma}</xades:SigningTime>` +
        `<xades:SigningCertificate>` +
          `<xades:Cert>` +
            `<xades:CertDigest>` +
              `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
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

  const docC14n = canonicalizarXml(xmlSinFirma);
  const digestValue = sha1Base64(docC14n);

  const spC14n = canonicalizarXml(signedProperties);
  const signedPropertiesDigest = sha1Base64(spC14n);

  const signedInfo =
    `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
      `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
      `<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
      `<ds:Reference Id="${reference0Id}" URI="#comprobante">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
        `<ds:DigestValue>${digestValue}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference URI="#${signedPropertiesId}">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
        `<ds:DigestValue>${signedPropertiesDigest}</ds:DigestValue>` +
      `</ds:Reference>` +
    `</ds:SignedInfo>`;

  const signedInfoC14n = canonicalizarXml(signedInfo);
  const mdSig = forge.md.sha1.create();
  mdSig.update(signedInfoC14n, 'utf8');
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const signatureValue = forge.util.encode64(privateKey.sign(mdSig));

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

  const closingTagMatch = xmlSinFirma.match(/<\/([a-zA-Z][\w:-]*)>\s*$/);
  if (!closingTagMatch) throw new Error('No se encontró etiqueta de cierre del XML');

  const closingTag = closingTagMatch[0];

  // ⚠️  CRÍTICO: NO insertar '\n' entre signatureBlock y closingTag.
  // El SRI aplica enveloped-signature eliminando el nodo <ds:Signature>;
  // si agregamos whitespace, el digest calculado por el SRI diferirá del
  // que guardamos al firmar y rechazará el comprobante.
  const xmlFirmado = xmlSinFirma.replace(
    new RegExp(closingTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$'),
    signatureBlock + closingTag
  );

  return xmlFirmado;
}

// ============================================================
// VALIDAR FIRMA
// ============================================================
function validarFirma(xmlFirmado) {
  if (!xmlFirmado || typeof xmlFirmado !== 'string') {
    return { valido: false, motivo: 'XML vacío' };
  }
  if (!xmlFirmado.includes('<ds:Signature')) return { valido: false, motivo: 'No se encontró bloque de firma' };
  if (!xmlFirmado.includes('<ds:SignatureValue>')) return { valido: false, motivo: 'Falta SignatureValue' };
  if (!xmlFirmado.includes('<ds:X509Certificate>')) return { valido: false, motivo: 'Falta X509Certificate' };
  if (!xmlFirmado.includes('<xades:SignedProperties')) return { valido: false, motivo: 'Falta SignedProperties (XAdES-BES)' };
  if (!/id="comprobante"/i.test(xmlFirmado)) return { valido: false, motivo: 'El elemento raíz no tiene id="comprobante"' };

  try {
    const certificatePem = extraerCertificadoPem(xmlFirmado);
    if (!certificatePem) return { valido: false, motivo: 'No se pudo extraer el certificado del XML' };

    const sigBlockMatch = xmlFirmado.match(/<ds:Signature[\s\S]*?<\/ds:Signature>/);
    const signedInfoMatch = xmlFirmado.match(/<ds:SignedInfo[\s\S]*?<\/ds:SignedInfo>/);
    const sigValueMatch = xmlFirmado.match(/<ds:SignatureValue>([\s\S]*?)<\/ds:SignatureValue>/);
    if (!sigBlockMatch || !signedInfoMatch || !sigValueMatch) {
      return { valido: false, motivo: 'Bloques de firma incompletos' };
    }

    const certForge = forge.pki.certificateFromPem(certificatePem);
    const publicKey = certForge.publicKey;

    const signedInfoC14n = canonicalizarXml(signedInfoMatch[0]);
    const md = forge.md.sha1.create();
    md.update(signedInfoC14n, 'utf8');
    const signatureBytes = forge.util.decode64(sigValueMatch[1].replace(/\s/g, ''));
    const firmaOk = publicKey.verify(md.digest().bytes(), signatureBytes);

    if (!firmaOk) return { valido: false, motivo: 'La firma no coincide con el certificado' };

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

    return { valido: true };
  } catch (err) {
    return { valido: false, motivo: 'Error verificando firma: ' + err.message };
  }
}

module.exports = {
  cargarCertificado,
  cargarCertificadoDesdeDB,
  cifrarSecreto,
  descifrarSecreto,
  firmarXML,
  validarFirma,
  canonicalizarXml,
  extraerCertificadoPem
};