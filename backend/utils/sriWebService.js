// backend/utils/sriWebService.js
// ============================================================
// Cliente SOAP para los web services del SRI (Ecuador)
// ------------------------------------------------------------
// Servicios soportados:
//   - RecepcionComprobantesOffline
//   - AutorizacionComprobantesOffline
//
// Ambientes:
//   '1' → Pruebas    (celcer.sri.gob.ec)
//   '2' → Producción (cel.sri.gob.ec)
//
// API pública (compatibilidad total con la versión previa):
//   enviarRecepcion(xmlFirmado, ambiente)         → Recepción
//   consultarAutorizacion(clave, ambiente)        → Autorización
//   enviarYAutorizar(xml, clave, ambiente, max)   → Flujo completo
//   probarConexion(ambiente)                       → Diagnóstico
//   URLS                                           → Endpoints
//   normalizarEstado(estado)                       → "NO AUTORIZADO" → "NO_AUTORIZADO"
//
// Extensiones:
//   sanitizarParaLog(str)      → string seguro para logs
//   getMetricas()              → contadores de uso
//   resetearMetricas()         → limpiar contadores
//
// ⚠️  El SRI es notoriamente lento e inestable. Los tiempos están
//     calibrados para tolerar fallos transitorios sin castigar la
//     experiencia de usuario. Los valores se ajustan por env.
// ============================================================
'use strict';

const log = require('./logger');

// ============================================================
// CONFIGURACIÓN (env-driven)
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(nombre, fallback = false) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

const CONFIG = Object.freeze({
  /** Timeout por request HTTP (ms). */
  timeoutMs: envNum('SRI_TIMEOUT_MS', 45_000),

  /** Reintentos por request HTTP (además del primer intento). */
  reintentos: envNum('SRI_REINTENTOS', 2),

  /** Base del backoff exponencial (ms). */
  backoffBaseMs: envNum('SRI_BACKOFF_BASE_MS', 1500),

  /** Máx. tamaño de respuesta (bytes) — evita OOM si el SRI responde algo raro. */
  maxBytesRespuesta: envNum('SRI_MAX_BYTES', 10 * 1024 * 1024),

  /** Timeout global del flujo `enviarYAutorizar` (ms). */
  enviarYAutorizarTimeoutMs: envNum('SRI_ENVIO_Y_AUTORIZAR_TIMEOUT_MS', 3 * 60 * 1000),

  /** Intentos de consulta en `enviarYAutorizar`. */
  maxConsultas: envNum('SRI_MAX_CONSULTAS', 5),

  /** UA que usamos para identificarnos (algunos WAF lo requieren). */
  userAgent: process.env.SRI_USER_AGENT || 'SistemaContable/2.1 (+nodejs)',

  /** Debug verboso. NUNCA loguear la clave de acceso ni el XML completo. */
  debug: envBool('SRI_DEBUG', false),

  /** Máx. chars en logs de body. */
  maxLogBody: envNum('SRI_MAX_LOG_BODY', 500)
});

// ============================================================
// ENDPOINTS
// ============================================================
const URLS = Object.freeze({
  recepcion: Object.freeze({
    '1': 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline',
    '2': 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline'
  }),
  autorizacion: Object.freeze({
    '1': 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline',
    '2': 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline'
  })
});

/** Namespaces SOAP por acción. */
const NAMESPACES = Object.freeze({
  recepcion: 'http://ec.gob.sri.ws.recepcion',
  autorizacion: 'http://ec.gob.sri.ws.autorizacion'
});

/** Regex de clave de acceso SRI. */
const CLAVE_REGEX = /^\d{49}$/;

// ============================================================
// CARGA LAZY DE DEPENDENCIAS
// ============================================================
let _axios = null;
let _xml2js = null;

function getAxios() {
  if (!_axios) {
    try {
      // eslint-disable-next-line global-require
      _axios = require('axios');
    } catch (err) {
      log.error({ err: err.message }, 'axios no está instalado');
      throw errorTipado('axios no está instalado', 'DEPENDENCIA_FALTANTE', 500);
    }
  }
  return _axios;
}

function getXml2js() {
  if (!_xml2js) {
    try {
      // eslint-disable-next-line global-require
      _xml2js = require('xml2js');
    } catch (err) {
      log.error({ err: err.message }, 'xml2js no está instalado');
      throw errorTipado('xml2js no está instalado', 'DEPENDENCIA_FALTANTE', 500);
    }
  }
  return _xml2js;
}

// ============================================================
// ERRORES TIPADOS
// ============================================================
function errorTipado(mensaje, codigo, status = 500) {
  const err = new Error(mensaje);
  err.codigo = codigo;
  err.status = status;
  return err;
}

// ============================================================
// MÉTRICAS (en memoria)
// ============================================================
const METRICAS = {
  recepciones: 0,
  recepcionesOk: 0,
  autorizaciones: 0,
  autorizacionesOk: 0,
  reintentos: 0,
  timeouts: 0,
  erroresRed: 0,
  erroresParseo: 0,
  enviarYAutorizar: 0,
  enviarYAutorizarOk: 0
};

function getMetricas() {
  return { ...METRICAS };
}

function resetearMetricas() {
  for (const k of Object.keys(METRICAS)) METRICAS[k] = 0;
}

// ============================================================
// HELPERS
// ============================================================
/** Debug log solo si `SRI_DEBUG=true`. NUNCA loguear claves ni XML. */
function debugLog(...args) {
  if (!CONFIG.debug) return;
  log.debug({ ctx: 'sri' }, ...args);
}

/**
 * Sanitiza un string para logs:
 *   - Elimina CRLF (los reemplaza por espacio, no los borra).
 *   - Reemplaza bloques base64 reales por `[base64 Nch]`.
 *   - Trunca a `maxLogBody` caracteres con `…`.
 *
 * @param {*} str
 * @returns {string}
 */
function sanitizarParaLog(str) {
  if (str === null || str === undefined) return '';

  let s = String(str);

  // 1. CRLF + line separators Unicode → espacio.
  s = s.replace(/[\r\n\0\u2028\u2029]+/g, ' ');

  // 2. Reemplazar bloques de apariencia base64.
  //    Consideramos base64 si:
  //      - tiene al menos 80 chars
  //      - contiene al menos 3 caracteres distintos (base64 real tiene variedad)
  s = s.replace(/[A-Za-z0-9+/=]{80,}/g, m => {
    const unicos = new Set(m).size;
    if (unicos < 3) return m; // "AAAA...", "aaaa...", "AAAA1..." no son base64 útiles
    return `[base64 ${m.length}ch]`;
  });

  // 3. Truncar al final.
  if (s.length > CONFIG.maxLogBody) {
    s = s.slice(0, CONFIG.maxLogBody) + '…';
  }

  return s;
}

/**
 * Escapa un string para incluirlo en XML.
 * Requerido para evitar XML injection si algún valor llegara con
 * caracteres especiales (por bug interno).
 */
function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Verifica que la clave sea válida (49 dígitos). */
function validarClaveAcceso(clave) {
  if (typeof clave !== 'string' || !CLAVE_REGEX.test(clave)) {
    throw errorTipado(
      `Clave de acceso inválida (se esperaban 49 dígitos, recibido "${String(clave).slice(0, 60)}")`,
      'CLAVE_INVALIDA',
      400
    );
  }
  return clave;
}

/** Normaliza un array de xml2js (que puede devolver objeto o array). */
function normalizarArray(v) {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Sleep con `.unref()` para no retener el proceso. */
function dormir(ms) {
  return new Promise(resolve => {
    const t = setTimeout(resolve, ms);
    if (t.unref) t.unref();
  });
}

/** Backoff exponencial + jitter. */
function calcularBackoff(intento) {
  const base = CONFIG.backoffBaseMs * Math.pow(2, intento - 1);
  const jitter = 0.5 + Math.random(); // 0.5× .. 1.5×
  return Math.round(base * jitter);
}

// ============================================================
// CLASIFICACIÓN DE ERRORES DE RED
// ============================================================
/**
 * Clasifica un error de axios/red.
 * @returns {{ transitorio: boolean, codigo: string, mensaje: string }}
 */
function clasificarErrorRed(err) {
  if (!err) {
    return {
      transitorio: true,
      codigo: 'ERROR_DESCONOCIDO',
      mensaje: 'Error desconocido'
    };
  }

  const code = err.code;
  const timeoutMs = CONFIG.timeoutMs;

  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return {
      transitorio: true,
      codigo: 'ERROR_TIMEOUT',
      mensaje: `Timeout al conectar con el SRI (${timeoutMs / 1000}s)`
    };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return {
      transitorio: false, // DNS mal configurado → no reintentar
      codigo: 'ERROR_DNS',
      mensaje: 'No se pudo resolver el host del SRI'
    };
  }
  if (code === 'ECONNREFUSED') {
    return {
      transitorio: true,
      codigo: 'ERROR_CONEXION_RECHAZADA',
      mensaje: 'El SRI rechazó la conexión'
    };
  }
  if (code === 'ECONNRESET') {
    return {
      transitorio: true,
      codigo: 'ERROR_CONEXION_RESET',
      mensaje: 'La conexión con el SRI se reinició'
    };
  }
  if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return {
      transitorio: false,
      codigo: 'ERROR_TLS',
      mensaje: 'Problema con el certificado TLS del SRI'
    };
  }

  // Errores HTTP (axios los expone en `err.response`).
  if (err.response) {
    const status = err.response.status;
    if (status >= 500) {
      return {
        transitorio: true,
        codigo: 'ERROR_HTTP_5XX',
        mensaje: `El SRI devolvió HTTP ${status}`
      };
    }
    if (status >= 400) {
      return {
        transitorio: false,
        codigo: 'ERROR_HTTP_4XX',
        mensaje: `El SRI rechazó la petición (HTTP ${status})`
      };
    }
  }

  return {
    transitorio: true,
    codigo: 'ERROR_RED',
    mensaje: err.message || 'Error de red desconocido'
  };
}

// ============================================================
// CONSTRUCCIÓN DE SOAP ENVELOPES
// ============================================================
function xmlToBase64(xml) {
  return Buffer.from(String(xml), 'utf-8').toString('base64');
}

/**
 * Construye el envelope SOAP para `validarComprobante`.
 * El XML va en base64, por lo que no requiere escape adicional.
 */
function construirEnvioRecepcion(xmlFirmado) {
  if (!xmlFirmado || typeof xmlFirmado !== 'string') {
    throw errorTipado('XML firmado vacío o inválido', 'XML_VACIO', 400);
  }
  const base64 = xmlToBase64(xmlFirmado);
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="${NAMESPACES.recepcion}">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <xml>${base64}</xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Construye el envelope SOAP para `autorizacionComprobante`.
 * La clave se valida ANTES para evitar XML injection.
 */
function construirEnvioAutorizacion(claveAcceso) {
  validarClaveAcceso(claveAcceso);
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="${NAMESPACES.autorizacion}">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ============================================================
// POST SOAP CON REINTENTOS
// ============================================================
/**
 * Realiza un POST SOAP al SRI con reintentos exponenciales.
 *
 * Solo se reintentan errores **transitorios** (timeouts, reset, 5xx).
 * Los errores permanentes (DNS malo, 4xx, TLS) se devuelven de inmediato.
 *
 * @param {string} url
 * @param {string} body
 * @param {object} [opts]
 * @param {string} [opts.contexto='SRI']    Para logs y métricas.
 * @param {number} [opts.reintentos]        Override de CONFIG.reintentos.
 * @returns {Promise<{ ok: true, response } | { ok: false, error, clasificacion }>}
 */
async function postSOAP(url, body, opts = {}) {
  const {
    contexto = 'SRI',
    reintentos = CONFIG.reintentos
  } = opts;

  const axios = getAxios();
  let ultimoError = null;
  let ultimaClasificacion = null;
  const maxIntentos = reintentos + 1;

  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      debugLog(`POST ${contexto} (intento ${intento}/${maxIntentos}) → ${url}`);

      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '',
          'Accept': 'text/xml, application/soap+xml',
          'User-Agent': CONFIG.userAgent
        },
        timeout: CONFIG.timeoutMs,
        // Aceptamos 2xx-5xx para parsear el body, pero clasificamos.
        validateStatus: (s) => s >= 200 && s < 600,
        maxRedirects: 0,
        maxContentLength: CONFIG.maxBytesRespuesta,
        maxBodyLength: CONFIG.maxBytesRespuesta
      });

      debugLog(`← ${response.status} ${response.statusText} (${response.data?.length || 0} bytes)`);

      // ---- Errores HTTP ----
      if (response.status >= 500) {
        ultimoError = errorTipado(`HTTP ${response.status}`, 'ERROR_HTTP_5XX', 502);
        ultimaClasificacion = {
          transitorio: true,
          codigo: 'ERROR_HTTP_5XX',
          mensaje: `El SRI devolvió HTTP ${response.status}`
        };
        if (intento < maxIntentos) {
          METRICAS.reintentos++;
          await dormir(calcularBackoff(intento));
          continue;
        }
        return { ok: false, error: ultimoError, clasificacion: ultimaClasificacion };
      }

      if (response.status >= 400) {
        ultimoError = errorTipado(`HTTP ${response.status}`, 'ERROR_HTTP_4XX', 400);
        ultimaClasificacion = {
          transitorio: false,
          codigo: 'ERROR_HTTP_4XX',
          mensaje: `El SRI rechazó la petición (HTTP ${response.status})`
        };
        // No reintentamos 4xx.
        return { ok: false, error: ultimoError, clasificacion: ultimaClasificacion };
      }

      // ---- Sanity check de tamaño ----
      if (typeof response.data === 'string' && response.data.length > CONFIG.maxBytesRespuesta) {
        log.warn(
          { longitud: response.data.length, contexto },
          'Respuesta del SRI excede el tamaño máximo'
        );
        return {
          ok: false,
          error: errorTipado('Respuesta del SRI demasiado grande', 'RESPUESTA_DEMASIADO_GRANDE', 502),
          clasificacion: { transitorio: false, codigo: 'RESPUESTA_DEMASIADO_GRANDE', mensaje: 'Respuesta demasiado grande' }
        };
      }

      return { ok: true, response };
    } catch (err) {
      ultimoError = err;
      ultimaClasificacion = clasificarErrorRed(err);

      if (ultimaClasificacion.codigo === 'ERROR_TIMEOUT') METRICAS.timeouts++;
      if (ultimaClasificacion.codigo.startsWith('ERROR_RED') || ultimaClasificacion.codigo.startsWith('ERROR_CONEXION')) {
        METRICAS.erroresRed++;
      }

      debugLog(
        `Error (${intento}/${maxIntentos}): ${ultimaClasificacion.codigo} - ${ultimaClasificacion.mensaje}`
      );

      if (!ultimaClasificacion.transitorio || intento >= maxIntentos) break;

      METRICAS.reintentos++;
      await dormir(calcularBackoff(intento));
    }
  }

  return { ok: false, error: ultimoError, clasificacion: ultimaClasificacion };
}

// ============================================================
// PARSING DE RESPUESTAS SOAP
// ============================================================
/**
 * Busca un valor en un objeto parseado por xml2js, sin importar el
 * prefijo de namespace (`soap:`, `soapenv:`, `SOAP-ENV:`, etc.).
 */
function buscarConNamespace(obj, nombreLocal) {
  if (!obj || typeof obj !== 'object') return undefined;
  const nombreLower = nombreLocal.toLowerCase();
  for (const key of Object.keys(obj)) {
    if (key === nombreLocal) return obj[key];
    if (key.toLowerCase() === nombreLocal.toLowerCase()) return obj[key];
    if (key.includes(':')) {
      const local = key.split(':')[1];
      if (local.toLowerCase() === nombreLower) return obj[key];
    }
  }
  return undefined;
}

/**
 * Parsea el XML de respuesta y devuelve el `Body` interno.
 * @returns {Promise<object>} `Body` o lanza error tipado.
 */
async function parsearRespuestaSOAP(xml) {
  if (!xml || typeof xml !== 'string') {
    throw errorTipado('Respuesta SOAP vacía', 'RESPUESTA_VACIA', 502);
  }
  const { parseStringPromise } = getXml2js();
  let parsed;
  try {
    parsed = await parseStringPromise(xml, {
      explicitArray: false,
      trim: true,
      tagNameProcessors: [] // namespaces crudos
    });
  } catch (err) {
    throw errorTipado(
      `Respuesta del SRI no es XML válido: ${err.message}`,
      'ERROR_PARSEO',
      502
    );
  }

  const envelope =
    parsed['soap:Envelope'] ||
    parsed['soapenv:Envelope'] ||
    parsed['SOAP-ENV:Envelope'] ||
    parsed.Envelope;

  const body =
    envelope?.['soap:Body'] ||
    envelope?.['soapenv:Body'] ||
    envelope?.['SOAP-ENV:Body'] ||
    envelope?.Body;

  if (!body) {
    throw errorTipado('Respuesta del SRI sin Body', 'RESPUESTA_INVALIDA', 502);
  }
  return body;
}

/**
 * Extrae la lista de mensajes de un contenedor del SRI.
 *
 * El XML del SRI usa dos niveles:
 *   <mensajes>          ← plural (contenedor)
 *     <mensaje>...</mensaje>  ← singular (item)
 *   </mensajes>
 *
 * Acepta que el input sea:
 *   - El `comprobante` completo (busca `.mensajes.mensaje`)
 *   - El propio contenedor `{ mensaje: ... }`
 *
 * @param {object} contenedor
 * @returns {Array<{identificador, mensaje, informacionAdicional, tipo}>}
 */
function extraerMensajes(contenedor) {
  const mensajes = [];
  if (!contenedor || typeof contenedor !== 'object') return mensajes;

  // 1. Encontrar el contenedor de mensajes.
  //    Si `contenedor.mensajes` existe → usarlo (caso `<comprobante>`).
  //    Si no → asumir que `contenedor` YA es el contenedor.
  const contMensajes = buscarConNamespace(contenedor, 'mensajes') || contenedor;

  // 2. Los `<mensaje>` pueden ser objeto único o array.
  const raw = buscarConNamespace(contMensajes, 'mensaje');
  if (!raw) return mensajes;

  for (const m of normalizarArray(raw)) {
    if (!m || typeof m !== 'object') continue;
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
 * Normaliza un estado del SRI:
 *   - trim
 *   - upper
 *   - espacios internos → "_"   ("NO AUTORIZADO" → "NO_AUTORIZADO")
 */
function normalizarEstado(estado) {
  if (!estado || typeof estado !== 'string') return '';
  return estado.trim().toUpperCase().replace(/\s+/g, '_');
}

/**
 * Extrae los comprobantes de una respuesta de recepción.
 * Acepta múltiples formas:
 *   - { comprobantes: { comprobante: {...} } }
 *   - { comprobantes: { comprobante: [{...}, {...}] } }
 *   - { comprobante: {...} }         (algunas variantes del SRI)
 *
 * @param {object} resp
 * @returns {Array<object>}
 */
function extraerComprobantes(resp) {
  const out = [];
  if (!resp || typeof resp !== 'object') return out;

  // Contenedor: `<comprobantes>` o, si `resp` YA es el comprobante, usar resp.
  let contenedor = buscarConNamespace(resp, 'comprobantes');
  if (!contenedor) contenedor = resp;

  const raw = buscarConNamespace(contenedor, 'comprobante');
  if (!raw) return out;

  for (const c of normalizarArray(raw)) {
    if (!c || typeof c !== 'object') continue;
    out.push({
      claveAcceso: buscarConNamespace(c, 'claveAcceso') || '',
      estado: buscarConNamespace(c, 'estado') || '',
      mensajes: extraerMensajes(c)  // ← esta llamada ahora funciona porque
                                    //   extraerMensajes busca `.mensajes.mensaje`
    });
  }
  return out;
}

/**
 * Extrae las autorizaciones de una respuesta de autorización.
 */
function extraerAutorizaciones(resp) {
  const out = [];
  const contenedor = buscarConNamespace(resp, 'autorizaciones');
  if (!contenedor) return out;

  const raw = buscarConNamespace(contenedor, 'autorizacion');
  for (const a of normalizarArray(raw)) {
    if (!a) continue;
    out.push({
      estado: buscarConNamespace(a, 'estado') || '',
      numeroAutorizacion: buscarConNamespace(a, 'numeroAutorizacion') || '',
      fechaAutorizacion: buscarConNamespace(a, 'fechaAutorizacion') || '',
      ambiente: buscarConNamespace(a, 'ambiente') || '',
      comprobante: buscarConNamespace(a, 'comprobante') || '',
      mensajes: extraerMensajes(a)
    });
  }
  return out;
}

// ============================================================
// RECEPCIÓN
// ============================================================
/**
 * Envía un XML firmado al servicio de recepción del SRI.
 *
 * @param {string} xmlFirmado
 * @param {'1'|'2'} [ambiente='1']
 * @returns {Promise<{
 *   estado: string,
 *   comprobantes: Array<object>,
 *   exito: boolean,
 *   error: string|null
 * }>}
 */
async function enviarRecepcion(xmlFirmado, ambiente = '1') {
  METRICAS.recepciones++;
  const url = URLS.recepcion[ambiente] || URLS.recepcion['1'];
  const soapBody = construirEnvioRecepcion(xmlFirmado);

  const r = await postSOAP(url, soapBody, { contexto: 'RECEPCION' });

  if (!r.ok) {
    const clasif = r.clasificacion || { codigo: 'ERROR_RED', mensaje: 'Error desconocido' };
    return {
      estado: clasif.codigo === 'ERROR_TIMEOUT' ? 'ERROR_TIMEOUT' : 'ERROR_RED',
      comprobantes: [],
      exito: false,
      error: clasif.mensaje
    };
  }

  try {
    const body = await parsearRespuestaSOAP(r.response.data);
    const respuesta = buscarConNamespace(body, 'validarComprobanteResponse') || body;
    const resp = buscarConNamespace(respuesta, 'RespuestaRecepcionComprobante') || respuesta;

    const estadoRaw = buscarConNamespace(resp, 'estado') || 'DESCONOCIDO';
    const estado = normalizarEstado(estadoRaw) || estadoRaw;
    const comprobantes = extraerComprobantes(resp);
    const exito = estado === 'RECIBIDA';

    if (exito) METRICAS.recepcionesOk++;

    debugLog(`Recepción: estado=${estado}, comprobantes=${comprobantes.length}`);
    return { estado, comprobantes, exito, error: null };
  } catch (err) {
    METRICAS.erroresParseo++;
    debugLog(
      `Error parseando recepción: ${err.message} — body: ${sanitizarParaLog(r.response.data)}`
    );
    return {
      estado: 'ERROR_PARSEO',
      comprobantes: [],
      exito: false,
      error: err.codigo === 'ERROR_PARSEO'
        ? err.message
        : 'Error parseando respuesta del SRI: ' + err.message
    };
  }
}

// ============================================================
// AUTORIZACIÓN
// ============================================================
/**
 * Consulta el estado de autorización de un comprobante.
 *
 * @param {string} claveAcceso  Clave de 49 dígitos.
 * @param {'1'|'2'} [ambiente='1']
 * @returns {Promise<{
 *   estado: string,
 *   autorizaciones: Array<object>,
 *   exito: boolean,
 *   numeroAutorizacion?: string,
 *   fechaAutorizacion?: string,
 *   comprobanteAutorizado?: string|null,
 *   error: string|null
 * }>}
 */
async function consultarAutorizacion(claveAcceso, ambiente = '1') {
  METRICAS.autorizaciones++;
  const url = URLS.autorizacion[ambiente] || URLS.autorizacion['1'];
  const soapBody = construirEnvioAutorizacion(claveAcceso);

  const r = await postSOAP(url, soapBody, { contexto: 'AUTORIZACION' });

  if (!r.ok) {
    const clasif = r.clasificacion || { codigo: 'ERROR_RED', mensaje: 'Error desconocido' };
    return {
      estado: clasif.codigo === 'ERROR_TIMEOUT' ? 'ERROR_TIMEOUT' : 'ERROR_RED',
      autorizaciones: [],
      exito: false,
      numeroAutorizacion: '',
      fechaAutorizacion: '',
      comprobanteAutorizado: null,
      error: clasif.mensaje
    };
  }

  try {
    const body = await parsearRespuestaSOAP(r.response.data);
    const respuesta = buscarConNamespace(body, 'autorizacionComprobanteResponse') || body;
    const resp = buscarConNamespace(respuesta, 'RespuestaAutorizacionComprobante') || respuesta;

    const autorizaciones = extraerAutorizaciones(resp);
    const principal = autorizaciones[0] || null;
    const estadoRaw = principal?.estado || 'SIN_RESPUESTA';
    const estadoFinal = normalizarEstado(estadoRaw) || estadoRaw;
    const exito = estadoFinal === 'AUTORIZADO';

    if (exito) METRICAS.autorizacionesOk++;

    debugLog(`Autorización: estado=${estadoFinal}, auts=${autorizaciones.length}`);
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
    METRICAS.erroresParseo++;
    debugLog(
      `Error parseando autorización: ${err.message} — body: ${sanitizarParaLog(r.response.data)}`
    );
    return {
      estado: 'ERROR_PARSEO',
      autorizaciones: [],
      exito: false,
      numeroAutorizacion: '',
      fechaAutorizacion: '',
      comprobanteAutorizado: null,
      error: err.codigo === 'ERROR_PARSEO'
        ? err.message
        : 'Error parseando respuesta del SRI: ' + err.message
    };
  }
}

// ============================================================
// FLUJO COMPLETO
// ============================================================
/**
 * Envía un XML y espera hasta obtener autorización (o rechazo).
 *
 * Polling con backoff creciente entre consultas. Se detiene cuando:
 *   - se obtiene AUTORIZADO (éxito)
 *   - se obtiene RECHAZADA / NO_AUTORIZADO (rechazo definitivo)
 *   - se obtiene un error permanente
 *   - se agotan los intentos
 *   - se excede el timeout global
 *
 * @param {string} xmlFirmado
 * @param {string} claveAcceso
 * @param {'1'|'2'} [ambiente='1']
 * @param {number} [maxIntentos=CONFIG.maxConsultas]
 * @returns {Promise<{
 *   exito: boolean,
 *   fase: 'recepcion'|'autorizacion',
 *   recepcion: object,
 *   autorizacion: object|null,
 *   motivo?: string
 * }>}
 */
async function enviarYAutorizar(xmlFirmado, claveAcceso, ambiente = '1', maxIntentos = CONFIG.maxConsultas) {
  METRICAS.enviarYAutorizar++;
  const t0 = Date.now();
  const timeoutGlobal = CONFIG.enviarYAutorizarTimeoutMs;

  // ---- 1. Recepción ----
  const recepcion = await enviarRecepcion(xmlFirmado, ambiente);
  if (!recepcion.exito) {
    return {
      exito: false,
      fase: 'recepcion',
      recepcion,
      autorizacion: null,
      motivo: recepcion.estado
    };
  }

  // ---- 2. Polling de autorización ----
  let autorizacion = null;

  for (let intento = 1; intento <= maxIntentos; intento++) {
    const elapsed = Date.now() - t0;
    if (elapsed >= timeoutGlobal) {
      log.warn(
        { elapsed, timeoutGlobal, intento },
        'Timeout global en enviarYAutorizar'
      );
      return {
        exito: false,
        fase: 'autorizacion',
        recepcion,
        autorizacion,
        motivo: 'TIMEOUT_GLOBAL'
      };
    }

    // Backoff creciente, pero acotado al timeout global restante.
    const espera = Math.min(1500 * intento, timeoutGlobal - elapsed);
    await dormir(espera);

    autorizacion = await consultarAutorizacion(claveAcceso, ambiente);

    if (autorizacion.exito) {
      METRICAS.enviarYAutorizarOk++;
      return {
        exito: true,
        fase: 'autorizacion',
        recepcion,
        autorizacion
      };
    }

    // ---- Estados que cortan el polling ----
    const estadoNorm = normalizarEstado(autorizacion.estado);
    const esRechazoDefinitivo = [
      'RECHAZADA',
      'NO_AUTORIZADO',
      'ERROR_HTTP_4XX',
      'ERROR_DNS',
      'ERROR_TLS',
      'ERROR_PARSEO',
      'RESPUESTA_INVALIDA'
    ].includes(estadoNorm);

    if (esRechazoDefinitivo) {
      debugLog(`Corte por estado definitivo: ${estadoNorm}`);
      return {
        exito: false,
        fase: 'autorizacion',
        recepcion,
        autorizacion,
        motivo: estadoNorm
      };
    }

    debugLog(`Intento ${intento}/${maxIntentos}: estado=${autorizacion.estado}`);
  }

  return {
    exito: false,
    fase: 'autorizacion',
    recepcion,
    autorizacion,
    motivo: 'INTENTOS_AGOTADOS'
  };
}

// ============================================================
// DIAGNÓSTICO
// ============================================================
/**
 * Prueba rápida de conectividad con el SRI.
 * Envía un SOAP vacío; cualquier respuesta HTTP (incluso 500) confirma
 * que el host es alcanzable.
 *
 * @param {'1'|'2'} [ambiente='1']
 * @returns {Promise<object>}
 */
async function probarConexion(ambiente = '1') {
  const url = URLS.recepcion[ambiente] || URLS.recepcion['1'];
  const inicio = Date.now();

  const axios = getAxios();
  try {
    const response = await axios.post(
      url,
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body/></soapenv:Envelope>',
      {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'User-Agent': CONFIG.userAgent
        },
        timeout: 10_000,
        validateStatus: () => true,
        maxRedirects: 0
      }
    );

    return {
      ok: true,
      ambiente,
      latencia_ms: Date.now() - inicio,
      statusCode: response.status,
      contentLength: Number(response.headers?.['content-length']) || null,
      url
    };
  } catch (err) {
    const clasif = clasificarErrorRed(err);
    return {
      ok: false,
      ambiente,
      error: clasif.mensaje,
      codigo: clasif.codigo,
      latencia_ms: Date.now() - inicio,
      url
    };
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  enviarRecepcion,
  consultarAutorizacion,
  enviarYAutorizar,
  probarConexion,
  URLS,
  normalizarEstado,

  // ---- Extensiones ----
  sanitizarParaLog,
  validarClaveAcceso,
  getMetricas,
  resetearMetricas,

  // ---- Constantes ----
  CONFIG
};

// ---- Solo para tests ----
module.exports._NAMESPACES = NAMESPACES;
module.exports._CLAVE_REGEX = CLAVE_REGEX;
module.exports._CONFIG = CONFIG;
module.exports._errorTipado = errorTipado;
module.exports._buscarConNamespace = buscarConNamespace;
module.exports._extraerMensajes = extraerMensajes;
module.exports._extraerComprobantes = extraerComprobantes;
module.exports._extraerAutorizaciones = extraerAutorizaciones;
module.exports._parsearRespuestaSOAP = parsearRespuestaSOAP;
module.exports._construirEnvioRecepcion = construirEnvioRecepcion;
module.exports._construirEnvioAutorizacion = construirEnvioAutorizacion;
module.exports._clasificarErrorRed = clasificarErrorRed;
module.exports._calcularBackoff = calcularBackoff;
module.exports._postSOAP = postSOAP;
module.exports._escXml = escXml;
module.exports._normalizarArray = normalizarArray;
module.exports._debugLog = debugLog;