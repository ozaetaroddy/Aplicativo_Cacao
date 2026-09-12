// backend/utils/sriWebService.js
// Cliente SOAP para los web services del SRI (Ecuador)
// - RecepcionComprobantesOffline
// - AutorizacionComprobantesOffline
//
// Referencia: https://www.sri.gob.ec/facturacion-electronica

const axios = require('axios');
const { parseStringPromise } = require('xml2js');

// ============================================================
// URLs OFICIALES DEL SRI
// ============================================================
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

const TIMEOUT_MS = parseInt(process.env.SRI_TIMEOUT_MS || '45000', 10);
const DEBUG = process.env.SRI_DEBUG === 'true';

// ============================================================
// HELPERS INTERNOS
// ============================================================
function debugLog(...args) {
  if (DEBUG) console.log('[SRI]', ...args);
}

function xmlToBase64(xml) {
  return Buffer.from(xml, 'utf-8').toString('base64');
}

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
 * Extrae un valor del objeto parseado, sin importar el namespace.
 * Útil porque el SRI a veces devuelve `ns2:`, `ns3:`, `soap:` o `soapenv:`
 */
function buscarConNamespace(obj, nombreLocal) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of Object.keys(obj)) {
    // Coincidencia exacta
    if (key === nombreLocal) return obj[key];
    // Con prefijo (ns:, ns2:, soapenv:, etc.)
    if (key.includes(':')) {
      const local = key.split(':')[1];
      if (local === nombreLocal) return obj[key];
    }
  }
  return undefined;
}

function extraerMensajes(contenedor) {
  const mensajes = [];
  if (!contenedor) return mensajes;
  const raw = buscarConNamespace(contenedor, 'mensaje');
  if (!raw) return mensajes;
  const arr = Array.isArray(raw) ? raw : [raw];
  for (const m of arr) {
    if (!m) continue;
    mensajes.push({
      identificador: buscarConNamespace(m, 'identificador') || '',
      mensaje: buscarConNamespace(m, 'mensaje') || '',
      informacionAdicional: buscarConNamespace(m, 'informacionAdicional') || '',
      tipo: buscarConNamespace(m, 'tipo') || ''
    });
  }
  return mensajes;
}

/**
 * POST al SRI con reintentos para errores de RED (no para errores del SRI)
 */
async function postSOAP(url, body, { reintentos = 2, contexto = 'SRI' } = {}) {
  let ultimoError = null;
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      debugLog(`POST ${contexto} (intento ${intento + 1}/${reintentos + 1}) → ${url}`);
      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '',
          'User-Agent': 'SistemaContable/2.1'
        },
        timeout: TIMEOUT_MS,
        // El SRI a veces devuelve 500 con XML válido dentro
        validateStatus: (s) => s >= 200 && s < 600,
        maxRedirects: 0
      });
      debugLog(`← ${response.status} ${response.statusText}`);
      return { ok: true, response };
    } catch (err) {
      ultimoError = err;
      // No reintentar en errores del SRI (5xx con respuesta); sí en red/timeout
      const esRedError = !err.response || ['ECONNABORTED', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(err.code);
      if (!esRedError) break;
      if (intento < reintentos) {
        const espera = 1500 * (intento + 1);
        debugLog(`Error de red, reintentando en ${espera}ms: ${err.message}`);
        await new Promise(r => setTimeout(r, espera));
      }
    }
  }
  return { ok: false, error: ultimoError };
}

// ============================================================
// RECEPCIÓN
// ============================================================
async function enviarRecepcion(xmlFirmado, ambiente = '1') {
  const url = URLS.recepcion[ambiente] || URLS.recepcion['1'];
  const soapBody = construirEnvioRecepcion(xmlFirmado);

  const { ok, response, error } = await postSOAP(url, soapBody, { contexto: 'RECEPCION', reintentos: 2 });

  if (!ok) {
    let mensaje = error?.message || 'Error desconocido';
    if (error?.code === 'ECONNABORTED') mensaje = `Timeout al conectar con el SRI (${TIMEOUT_MS / 1000}s)`;
    if (error?.code === 'ENOTFOUND') mensaje = 'No se pudo resolver el host del SRI';
    if (error?.code === 'ECONNREFUSED') mensaje = 'El SRI rechazó la conexión';
    return { estado: 'ERROR_RED', comprobantes: [], exito: false, error: mensaje };
  }

  try {
    const parsed = await parseStringPromise(response.data, {
      explicitArray: false,
      tagNameProcessors: [],
      trim: true
    });

    const envelope = parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed['Envelope'];
    const body = envelope?.['soap:Body'] || envelope?.['soapenv:Body'] || envelope?.['Body'];

    if (!body) {
      debugLog('Respuesta sin Body:', JSON.stringify(parsed).slice(0, 500));
      return { estado: 'RESPUESTA_INVALIDA', comprobantes: [], exito: false, error: 'Respuesta del SRI sin Body' };
    }

    // Buscar la respuesta sin importar namespace
    const respuesta = buscarConNamespace(body, 'validarComprobanteResponse') || body;
    const resp = buscarConNamespace(respuesta, 'RespuestaRecepcionComprobante') || respuesta;

    const estado = buscarConNamespace(resp, 'estado') || 'DESCONOCIDO';

    const comprobantes = [];
    const comprobantesContainer = buscarConNamespace(resp, 'comprobantes');
    if (comprobantesContainer) {
      const compsRaw = buscarConNamespace(comprobantesContainer, 'comprobante');
      const compsArr = !compsRaw ? [] : (Array.isArray(compsRaw) ? compsRaw : [compsRaw]);
      for (const c of compsArr) {
        if (!c) continue;
        comprobantes.push({
          claveAcceso: buscarConNamespace(c, 'claveAcceso') || '',
          estado: buscarConNamespace(c, 'estado') || '',
          mensajes: extraerMensajes(c)
        });
      }
    }

    return {
      estado,
      comprobantes,
      exito: estado === 'RECIBIDA',
      error: null
    };
  } catch (err) {
    debugLog('Error parseando respuesta:', err.message, response.data?.slice?.(0, 500));
    return {
      estado: 'ERROR_PARSEO',
      comprobantes: [],
      exito: false,
      error: 'Error parseando respuesta del SRI: ' + err.message
    };
  }
}

// ============================================================
// AUTORIZACIÓN
// ============================================================
async function consultarAutorizacion(claveAcceso, ambiente = '1') {
  const url = URLS.autorizacion[ambiente] || URLS.autorizacion['1'];
  const soapBody = construirEnvioAutorizacion(claveAcceso);

  const { ok, response, error } = await postSOAP(url, soapBody, { contexto: 'AUTORIZACION', reintentos: 2 });

  if (!ok) {
    let mensaje = error?.message || 'Error desconocido';
    if (error?.code === 'ECONNABORTED') mensaje = `Timeout al conectar con el SRI (${TIMEOUT_MS / 1000}s)`;
    if (error?.code === 'ENOTFOUND') mensaje = 'No se pudo resolver el host del SRI';
    return { estado: 'ERROR_RED', autorizaciones: [], exito: false, error: mensaje };
  }

  try {
    const parsed = await parseStringPromise(response.data, { explicitArray: false, trim: true });

    const envelope = parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed['Envelope'];
    const body = envelope?.['soap:Body'] || envelope?.['soapenv:Body'] || envelope?.['Body'];

    if (!body) {
      return { estado: 'RESPUESTA_INVALIDA', autorizaciones: [], exito: false, error: 'Respuesta del SRI sin Body' };
    }

    const respuesta = buscarConNamespace(body, 'autorizacionComprobanteResponse') || body;
    const resp = buscarConNamespace(respuesta, 'RespuestaAutorizacionComprobante') || respuesta;

    const autorizaciones = [];
    const autContainer = buscarConNamespace(resp, 'autorizaciones');
    if (autContainer) {
      const autsRaw = buscarConNamespace(autContainer, 'autorizacion');
      const autsArr = !autsRaw ? [] : (Array.isArray(autsRaw) ? autsRaw : [autsRaw]);
      for (const a of autsArr) {
        if (!a) continue;
        autorizaciones.push({
          estado: buscarConNamespace(a, 'estado') || '',
          numeroAutorizacion: buscarConNamespace(a, 'numeroAutorizacion') || '',
          fechaAutorizacion: buscarConNamespace(a, 'fechaAutorizacion') || '',
          ambiente: buscarConNamespace(a, 'ambiente') || '',
          comprobante: buscarConNamespace(a, 'comprobante') || '',
          mensajes: extraerMensajes(a)
        });
      }
    }

    const principal = autorizaciones[0] || null;
    const estadoFinal = principal?.estado || 'SIN_RESPUESTA';
    const exito = estadoFinal === 'AUTORIZADO';

    return {
      estado: estadoFinal,
      autorizaciones,
      exito,
      numeroAutorizacion: principal?.numeroAutorizacion || '',
      fechaAutorizacion: principal?.fechaAutorizacion || '',
      comprobanteAutorizado: principal?.comprobante || null,
      error: null
    };
  } catch (err) {
    debugLog('Error parseando autorización:', err.message);
    return {
      estado: 'ERROR_PARSEO',
      autorizaciones: [],
      exito: false,
      error: 'Error parseando respuesta del SRI: ' + err.message
    };
  }
}

// ============================================================
// ENVIAR Y ESPERAR AUTORIZACIÓN
// ============================================================
async function enviarYAutorizar(xmlFirmado, claveAcceso, ambiente = '1', maxIntentos = 5) {
  const recepcion = await enviarRecepcion(xmlFirmado, ambiente);
  if (!recepcion.exito) {
    return { exito: false, fase: 'recepcion', recepcion, autorizacion: null };
  }

  let autorizacion = null;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    // Backoff: 1.5s, 3s, 4.5s, 6s, 7.5s
    const espera = 1500 * intento;
    await new Promise(r => setTimeout(r, espera));

    autorizacion = await consultarAutorizacion(claveAcceso, ambiente);

    if (autorizacion.exito) break;
    if (['RECHAZADA', 'NO AUTORIZADO', 'ERROR_RED', 'ERROR_PARSEO'].includes(autorizacion.estado)) break;

    debugLog(`Intento ${intento}/${maxIntentos}: estado=${autorizacion.estado}`);
  }

  return {
    exito: autorizacion?.exito || false,
    fase: 'autorizacion',
    recepcion,
    autorizacion
  };
}

// ============================================================
// DIAGNÓSTICO
// ============================================================
async function probarConexion(ambiente = '1') {
  const url = URLS.recepcion[ambiente] || URLS.recepcion['1'];
  const inicio = Date.now();
  try {
    // Enviamos un SOAP vacío — solo verificamos conectividad
    await axios.post(url, '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body/></soapenv:Envelope>', {
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      timeout: 10000,
      validateStatus: () => true
    });
    return {
      ok: true,
      ambiente,
      latencia_ms: Date.now() - inicio,
      url
    };
  } catch (err) {
    return {
      ok: false,
      ambiente,
      error: err.message,
      codigo: err.code,
      url
    };
  }
}

module.exports = {
  enviarRecepcion,
  consultarAutorizacion,
  enviarYAutorizar,
  probarConexion,
  URLS
};