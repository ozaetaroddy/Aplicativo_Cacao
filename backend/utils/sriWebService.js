// backend/utils/sriWebService.js
// Cliente para los web services SOAP del SRI

const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');

// ===== URLs del SRI =====
const URLS = {
  recepcion: {
    '1': 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline',
    '2': 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline'
  },
  autorizacion: {
    '1': 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline',
    '2': 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline'
  }
};

/**
 * Convierte el XML firmado a base64 (SRI exige base64 sin comprimir).
 */
function xmlToBase64(xml) {
  return Buffer.from(xml, 'utf-8').toString('base64');
}

/**
 * Construye el sobre SOAP para validar comprobante.
 */
function construirEnvioRecepcion(xmlFirmado) {
  const base64 = xmlToBase64(xmlFirmado);
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <xml>${base64}</xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Construye el sobre SOAP para consultar autorización.
 */
function construirEnvioAutorizacion(claveAcceso) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Envía un comprobante firmado al web service de RECEPCIÓN del SRI.
 * @param {string} xmlFirmado - XML firmado con XAdES-BES
 * @param {string} ambiente - '1' Pruebas, '2' Producción
 * @returns {Promise<object>} Respuesta del SRI
 */
async function enviarRecepcion(xmlFirmado, ambiente = '1') {
  const url = URLS.recepcion[ambiente] || URLS.recepcion['1'];
  const soapBody = construirEnvioRecepcion(xmlFirmado);

  try {
    const response = await axios.post(url, soapBody, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '',
        'User-Agent': 'SistemaContable/2.0'
      },
      timeout: 30000
    });

    const parsed = await parseStringPromise(response.data, { explicitArray: false });

    // Navegar la respuesta SOAP
    const body = parsed['soap:Envelope']?.['soap:Body'] || parsed['soapenv:Envelope']?.['soapenv:Body'];
    const respuesta = body?.['ns2:validarComprobanteResponse'] || body?.['ns:validarComprobanteResponse'] || body;

    if (!respuesta) {
      throw new Error('Respuesta del SRI vacía o malformada');
    }

    // Extraer los datos clave
    const resp = respuesta.RespuestaRecepcionComprobante || respuesta;
    const estado = resp.estado || 'DESCONOCIDO';

    const comprobantes = [];
    const comprobantesRaw = resp.comprobantes?.comprobante || [];
    const comprobantesArr = Array.isArray(comprobantesRaw) ? comprobantesRaw : [comprobantesRaw];

    for (const c of comprobantesArr) {
      if (!c || !c.claveAcceso) continue;

      const mensajes = [];
      const msgRaw = c.mensajes?.mensaje || [];
      const msgArr = Array.isArray(msgRaw) ? msgRaw : [msgRaw];
      for (const m of msgArr) {
        if (m) {
          mensajes.push({
            identificador: m.identificador || '',
            mensaje: m.mensaje || '',
            informacionAdicional: m.informacionAdicional || '',
            tipo: m.tipo || ''
          });
        }
      }

      comprobantes.push({
        claveAcceso: c.claveAcceso,
        estado: c.estado || '',
        mensajes
      });
    }

    return {
      estado,
      comprobantes,
      exito: estado === 'RECIBIDA',
      error: null
    };
  } catch (err) {
    // Error de red o timeout
    let mensaje = err.message;
    if (err.code === 'ECONNABORTED') mensaje = 'Timeout al conectar con el SRI (30s)';
    if (err.code === 'ENOTFOUND') mensaje = 'No se pudo conectar al servidor del SRI';
    if (err.response?.status === 500) mensaje = 'Error interno del SRI';

    return {
      estado: 'ERROR_RED',
      comprobantes: [],
      exito: false,
      error: mensaje
    };
  }
}

/**
 * Consulta la AUTORIZACIÓN de un comprobante.
 * @param {string} claveAcceso - Clave de acceso de 49 dígitos
 * @param {string} ambiente - '1' Pruebas, '2' Producción
 * @returns {Promise<object>} Respuesta del SRI con autorizaciones
 */
async function consultarAutorizacion(claveAcceso, ambiente = '1') {
  const url = URLS.autorizacion[ambiente] || URLS.autorizacion['1'];
  const soapBody = construirEnvioAutorizacion(claveAcceso);

  try {
    const response = await axios.post(url, soapBody, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '',
        'User-Agent': 'SistemaContable/2.0'
      },
      timeout: 30000
    });

    const parsed = await parseStringPromise(response.data, { explicitArray: false });

    const body = parsed['soap:Envelope']?.['soap:Body'] || parsed['soapenv:Envelope']?.['soapenv:Body'];
    const respuesta = body?.['ns2:autorizacionComprobanteResponse'] || body?.['ns:autorizacionComprobanteResponse'] || body;

    if (!respuesta) {
      throw new Error('Respuesta del SRI vacía');
    }

    const resp = respuesta.RespuestaAutorizacionComprobante || respuesta;
    const autorizacionesRaw = resp.autorizaciones?.autorizacion || [];
    const autorizacionesArr = Array.isArray(autorizacionesRaw) ? autorizacionesRaw : [autorizacionesRaw];

    const autorizaciones = [];
    for (const a of autorizacionesArr) {
      if (!a) continue;

      const mensajes = [];
      const msgRaw = a.mensajes?.mensaje || [];
      const msgArr = Array.isArray(msgRaw) ? msgRaw : [msgRaw];
      for (const m of msgArr) {
        if (m) {
          mensajes.push({
            identificador: m.identificador || '',
            mensaje: m.mensaje || '',
            informacionAdicional: m.informacionAdicional || '',
            tipo: m.tipo || ''
          });
        }
      }

      autorizaciones.push({
        estado: a.estado || '',
        numeroAutorizacion: a.numeroAutorizacion || '',
        fechaAutorizacion: a.fechaAutorizacion || '',
        ambiente: a.ambiente || '',
        comprobante: a.comprobante || '',
        mensajes
      });
    }

    // Determinar el estado final
    const autorizacionPrincipal = autorizaciones[0] || null;
    const estadoFinal = autorizacionPrincipal?.estado || 'SIN_RESPUESTA';

    return {
      estado: estadoFinal,
      autorizaciones,
      exito: estadoFinal === 'AUTORIZADO',
      numeroAutorizacion: autorizacionPrincipal?.numeroAutorizacion || '',
      fechaAutorizacion: autorizacionPrincipal?.fechaAutorizacion || '',
      comprobanteAutorizado: autorizacionPrincipal?.comprobante || null,
      error: null
    };
  } catch (err) {
    let mensaje = err.message;
    if (err.code === 'ECONNABORTED') mensaje = 'Timeout al conectar con el SRI';
    if (err.code === 'ENOTFOUND') mensaje = 'No se pudo conectar al servidor del SRI';

    return {
      estado: 'ERROR_RED',
      autorizaciones: [],
      exito: false,
      error: mensaje
    };
  }
}

/**
 * Envía y espera la autorización (con reintentos).
 * El SRI puede tardar unos segundos en autorizar, por eso se reintenta.
 */
async function enviarYAutorizar(xmlFirmado, claveAcceso, ambiente = '1', maxIntentos = 5) {
  // 1. Enviar a recepción
  const recepcion = await enviarRecepcion(xmlFirmado, ambiente);
  if (!recepcion.exito) {
    return {
      exito: false,
      fase: 'recepcion',
      recepcion,
      autorizacion: null
    };
  }

  // 2. Consultar autorización con reintentos
  let autorizacion = null;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    await new Promise(r => setTimeout(r, 1500 * intento)); // Espera creciente

    autorizacion = await consultarAutorizacion(claveAcceso, ambiente);
    if (autorizacion.exito || autorizacion.estado === 'RECHAZADA' || autorizacion.estado === 'NO AUTORIZADO') {
      break;
    }
  }

  return {
    exito: autorizacion?.exito || false,
    fase: 'autorizacion',
    recepcion,
    autorizacion
  };
}

module.exports = {
  enviarRecepcion,
  consultarAutorizacion,
  enviarYAutorizar
};