// backend/utils/firmaElectronica.js
// Firma electrónica XAdES-BES para comprobantes del SRI (Ecuador)

const forge = require('node-forge');

/**
 * Carga un certificado .p12 desde un Buffer y extrae la clave privada y el certificado.
 * @param {Buffer} p12Buffer - Contenido del archivo .p12
 * @param {string} password - Contraseña del certificado
 * @returns {{ privateKeyPem: string, certificatePem: string, certificate: object }}
 */
function cargarCertificado(p12Buffer, password) {
  try {
    const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    // ===== Obtener certificado =====
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBags = bags[forge.pki.oids.certBag] || [];
    if (certBags.length === 0) {
      throw new Error('No se encontró certificado en el archivo .p12');
    }

    const cert = certBags[0].cert;
    const certificatePem = forge.pki.certificateToPem(cert);

    // ===== Obtener clave privada =====
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const pkcs8Bags = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
    const keyBags2 = p12.getBags({ bagType: forge.pki.oids.keyBag });
    const keyBags2Arr = keyBags2[forge.pki.oids.keyBag] || [];

    let privateKey = null;
    if (pkcs8Bags.length > 0) privateKey = pkcs8Bags[0].key;
    else if (keyBags2Arr.length > 0) privateKey = keyBags2Arr[0].key;

    if (!privateKey) {
      throw new Error('No se encontró clave privada en el archivo .p12');
    }

    const privateKeyPem = forge.pki.privateKeyToPem(privateKey);

    return {
      privateKeyPem,
      certificatePem,
      certificate: {
        subject: cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', '),
        issuer: cert.issuer.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', '),
        serialNumber: cert.serialNumber,
        validityNotBefore: cert.validity.notBefore,
        validityNotAfter: cert.validity.notAfter
      }
    };
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('invalid password') || msg.includes('mac could not be verified')) {
      throw new Error('Contraseña del certificado incorrecta');
    }
    throw new Error('Error al cargar certificado: ' + err.message);
  }
}

/**
 * Firma un XML de comprobante electrónico con XAdES-BES (formato exigido por el SRI).
 *
 * Estructura de la firma (elementos obligatorios para el SRI):
 *  - ds:Signature
 *    - ds:SignedInfo (con 2 References: documento + SignedProperties)
 *    - ds:SignatureValue
 *    - ds:KeyInfo > ds:X509Data > ds:X509Certificate
 *    - ds:Object > xades:SignedProperties
 *
 * @param {string} xmlSinFirma - XML del comprobante (sin firma)
 * @param {string} privateKeyPem - Clave privada en formato PEM
 * @param {string} certificatePem - Certificado en formato PEM
 * @returns {string} XML firmado
 */
function firmarXML(xmlSinFirma, privateKeyPem, certificatePem) {
  // ===== 1. Preparar certificado limpio (sin headers PEM) =====
  const certLimpio = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');

  // ===== 2. Extraer issuer y serial del certificado =====
  const certForge = forge.pki.certificateFromPem(certificatePem);
  const issuerName = certForge.issuer.attributes
    .map(a => `${a.shortName || a.name}=${a.value}`)
    .join(', ');
  const serialNumber = certForge.serialNumber;

  // ===== 3. Calcular digest del certificado (para SignedProperties) =====
  const certDer = forge.util.decode64(certLimpio);
  const certMd = forge.md.sha1.create();
  certMd.update(certDer);
  const certDigest = forge.util.encode64(certMd.digest().bytes());

  // ===== 4. IDs únicos para la firma =====
  const ts = Date.now();
  const signatureId = `Signature-${ts}`;
  const signedPropertiesId = `Signature-SignedProperties-${ts}`;
  const reference0Id = `Reference-ID-${ts}`;
  const keyInfoId = `Certificate-${ts}`;
  const objectId = `Signature-Object-${ts}`;

  // ===== 5. Fecha de firma =====
  const fechaFirma = new Date().toISOString();

  // ===== 6. Digest del documento (XML sin firma) =====
  // El SRI usa SHA1 con enveloped-signature: el digest es del XML tal cual está
  // (sin la firma que aún no se ha insertado).
  const mdDoc = forge.md.sha1.create();
  mdDoc.update(xmlSinFirma, 'utf8');
  const digestValue = forge.util.encode64(mdDoc.digest().bytes());

  // ===== 7. Construir SignedProperties =====
  // Nota: minimizado para evitar problemas con canonicalización.
  const signedProperties =
    `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${signedPropertiesId}">` +
      `<xades:SignedSignatureProperties>` +
        `<xades:SigningTime>${fechaFirma}</xades:SigningTime>` +
        `<xades:SigningCertificate>` +
          `<xades:Cert>` +
            `<xades:CertDigest>` +
              `<ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
              `<ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certDigest}</ds:DigestValue>` +
            `</xades:CertDigest>` +
            `<xades:IssuerSerial>` +
              `<ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${issuerName}</ds:X509IssuerName>` +
              `<ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${serialNumber}</ds:X509SerialNumber>` +
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

  const mdSP = forge.md.sha1.create();
  mdSP.update(signedProperties, 'utf8');
  const signedPropertiesDigest = forge.util.encode64(mdSP.digest().bytes());

  // ===== 8. Construir SignedInfo =====
  const signedInfo =
    `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
      `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
      `<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
      // Reference al documento raíz (id="comprobante")
      `<ds:Reference Id="${reference0Id}" URI="#comprobante">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
        `<ds:DigestValue>${digestValue}</ds:DigestValue>` +
      `</ds:Reference>` +
      // Reference a SignedProperties
      `<ds:Reference URI="#${signedPropertiesId}">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
        `<ds:DigestValue>${signedPropertiesDigest}</ds:DigestValue>` +
      `</ds:Reference>` +
    `</ds:SignedInfo>`;

  // ===== 9. Firmar SignedInfo con RSA-SHA1 =====
  const mdSig = forge.md.sha1.create();
  mdSig.update(signedInfo, 'utf8');
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const signature = privateKey.sign(mdSig);
  const signatureValue = forge.util.encode64(signature);

  // ===== 10. Construir bloque Signature completo =====
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

  // ===== 11. Insertar la firma DENTRO del elemento raíz =====
  const closingTagMatch = xmlSinFirma.match(/<\/([a-zA-Z]+)>\s*$/);
  if (!closingTagMatch) {
    throw new Error('No se encontró etiqueta de cierre del XML');
  }
  const closingTag = closingTagMatch[0];
  const xmlFirmado = xmlSinFirma.replace(
    new RegExp(closingTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$'),
    signatureBlock + '\n' + closingTag
  );

  return xmlFirmado;
}

/**
 * Valida la estructura básica de la firma (verifica presencia de elementos).
 * NO valida criptográficamente ni contra el SRI.
 */
function validarFirma(xmlFirmado) {
  if (!xmlFirmado || !xmlFirmado.includes('<ds:Signature')) {
    return { valido: false, motivo: 'No se encontró bloque de firma' };
  }
  if (!xmlFirmado.includes('<ds:SignatureValue>')) {
    return { valido: false, motivo: 'No se encontró SignatureValue' };
  }
  if (!xmlFirmado.includes('<ds:X509Certificate>')) {
    return { valido: false, motivo: 'No se encontró X509Certificate' };
  }
  if (!xmlFirmado.includes('<xades:SignedProperties')) {
    return { valido: false, motivo: 'No se encontró SignedProperties (XAdES)' };
  }
  return { valido: true };
}

module.exports = {
  cargarCertificado,
  firmarXML,
  validarFirma
};