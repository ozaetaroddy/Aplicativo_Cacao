// backend/utils/firmaElectronica.js
// Firma electrónica XAdES-BES para comprobantes del SRI

const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');
const { DOMParser, XMLSerializer } = require('xmldom');

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

    // Buscar el certificado y la clave privada
    let certificatePem = null;
    let privateKeyPem = null;

    // Obtener bolsas
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBags = bags[forge.pki.oids.certBag] || [];

    if (certBags.length === 0) {
      throw new Error('No se encontró certificado en el archivo .p12');
    }

    // Tomar el primer certificado (normalmente el del titular)
    const cert = certBags[0].cert;
    certificatePem = forge.pki.certificateToPem(cert);

    // Obtener la clave privada
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const pkcs8Bags = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
    const keyBags2 = p12.getBags({ bagType: forge.pki.oids.keyBag });
    const keyBags2Arr = keyBags2[forge.pki.oids.keyBag] || [];

    let privateKey = null;
    if (pkcs8Bags.length > 0) {
      privateKey = pkcs8Bags[0].key;
    } else if (keyBags2Arr.length > 0) {
      privateKey = keyBags2Arr[0].key;
    }

    if (!privateKey) {
      throw new Error('No se encontró clave privada en el archivo .p12');
    }

    privateKeyPem = forge.pki.privateKeyToPem(privateKey);

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
    if (err.message.includes('Invalid password') || err.message.includes('mac could not be verified')) {
      throw new Error('Contraseña del certificado incorrecta');
    }
    throw new Error('Error al cargar certificado: ' + err.message);
  }
}

/**
 * Calcula el hash SHA1 en base64 de un string (para el digest del XML).
 */
function sha1Base64(text) {
  const md = forge.md.sha1.create();
  md.update(text, 'utf8');
  return forge.util.encode64(md.digest().bytes());
}

/**
 * Calcula el hash SHA1 en base64 de un string sin modificar.
 */
function sha1Digest(text) {
  const md = forge.md.sha1.create();
  md.update(text, 'utf8');
  return forge.util.encode64(md.digest().bytes());
}

/**
 * Firma un XML de comprobante electrónico con XAdES-BES (formato exigido por el SRI).
 *
 * @param {string} xmlSinFirma - XML del comprobante (sin firma)
 * @param {string} privateKeyPem - Clave privada en formato PEM
 * @param {string} certificatePem - Certificado en formato PEM
 * @param {object} certInfo - Información del certificado (opcional)
 * @returns {string} XML firmado
 */
function firmarXML(xmlSinFirma, privateKeyPem, certificatePem) {
  // El SRI exige que la firma sea enveloped, sobre el elemento raíz (factura, notaCredito, etc.)
  // La firma va al final, dentro del elemento raíz

  // 1. Preparar certificado limpio (sin headers)
  const certLimpio = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');

  // 2. Extraer el nombre del emisor y el serial
  const certForge = forge.pki.certificateFromPem(certificatePem);
  const issuerName = certForge.issuer.attributes
    .map(a => `${a.shortName || a.name}=${a.value}`)
    .join(', ');
  const serialNumber = certForge.serialNumber;

  // 3. Calcular el digest del documento
  // Para XAdES-BES del SRI, se hace un digest del XML completo (con la firma NO incluida)
  const digestValue = sha1Digest(xmlSinFirma);

  // 4. Generar un ID único para la firma (para referencias)
  const signatureId = `Signature-${Date.now()}`;
  const signedPropertiesId = `Signature-SignedProperties-${Date.now()}`;
  const reference0Id = `Reference-ID-${Date.now()}`;

  // 5. Fecha de firma en formato ISO 8601
  const fechaFirma = new Date().toISOString();

  // 6. Construir el bloque de KeyInfo con el certificado
  const x509Certificate = certLimpio;

  // 7. Construir el bloque SignedProperties (XAdES)
  const signedProperties = `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${signedPropertiesId}">
    <xades:SignedSignatureProperties>
      <xades:SigningTime>${fechaFirma}</xades:SigningTime>
      <xades:SigningCertificate>
        <xades:Cert>
          <xades:CertDigest>
            <ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
            <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${sha1Digest(forge.util.decode64(x509Certificate))}</ds:DigestValue>
          </xades:CertDigest>
          <xades:IssuerSerial>
            <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${issuerName}</ds:X509IssuerName>
            <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${serialNumber}</ds:X509SerialNumber>
          </xades:IssuerSerial>
        </xades:Cert>
      </xades:SigningCertificate>
    </xades:SignedSignatureProperties>
    <xades:SignedDataObjectProperties>
      <xades:DataObjectFormat ObjectReference="#${reference0Id}">
        <xades:Description>contenido comprobante</xades:Description>
        <xades:MimeType>text/xml</xades:MimeType>
      </xades:DataObjectFormat>
    </xades:SignedDataObjectProperties>
  </xades:SignedProperties>`;

  // Calcular digest del SignedProperties para la Reference
  const signedPropertiesDigest = sha1Digest(signedProperties);

  // 8. Construir el bloque SignedInfo
  const signedInfo = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
    <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    <ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
    <ds:Reference Id="${reference0Id}" URI="#comprobante">
      <ds:Transforms>
        <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
      </ds:Transforms>
      <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
      <ds:DigestValue>${digestValue}</ds:DigestValue>
    </ds:Reference>
    <ds:Reference URI="#${signedPropertiesId}">
      <ds:Transforms>
        <ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      </ds:Transforms>
      <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
      <ds:DigestValue>${signedPropertiesDigest}</ds:DigestValue>
    </ds:Reference>
  </ds:SignedInfo>`;

  // 9. Firmar el SignedInfo con la clave privada (RSA-SHA1)
  const md = forge.md.sha1.create();
  md.update(signedInfo, 'utf8');
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const signature = privateKey.sign(md);
  const signatureValue = forge.util.encode64(signature);

  // 10. Construir el bloque Signature completo
  const signatureBlock = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${signatureId}">
    ${signedInfo}
    <ds:SignatureValue>${signatureValue}</ds:SignatureValue>
    <ds:KeyInfo Id="Certificate-${Date.now()}">
      <ds:X509Data>
        <ds:X509Certificate>${x509Certificate}</ds:X509Certificate>
      </ds:X509Data>
    </ds:KeyInfo>
    <ds:Object Id="Signature-Object-${Date.now()}">
      ${signedProperties}
    </ds:Object>
  </ds:Signature>`;

  // 11. Insertar la firma dentro del elemento raíz
  // La firma debe ir DENTRO del elemento raíz (factura, notaCredito, etc.), al final
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
 * Valida la firma básica (verifica que la firma esté presente y bien formada).
 */
function validarFirma(xmlFirmado) {
  if (!xmlFirmado || !xmlFirmado.includes('<ds:Signature')) {
    return { valido: false, motivo: 'No se encontró bloque de firma' };
  }
  if (!xmlFirmado.includes('<ds:SignatureValue>')) {
    return { valido: false, motivo: 'No se encontró SignatureValue' };
  }
  return { valido: true };
}

module.exports = {
  cargarCertificado,
  firmarXML,
  validarFirma
};