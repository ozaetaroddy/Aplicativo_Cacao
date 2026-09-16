// backend/routes/consultas.js
// ============================================================
// Consultas externas (cédula → nombre) con caché y circuit breaker
// ------------------------------------------------------------
// Endpoints:
//   GET    /cedula/:cedula    → consulta cédula (10 dígitos)
//   DELETE /cache/:cedula     → invalida entrada de caché
//   GET    /circuit-stats     → estado del circuit breaker
//
// Defensas:
//   - Rate limit por IP (20/min).
//   - Validación de cédula ecuatoriana (dígito verificador).
//   - Caché en `cache_consultas` con TTL de 30 días (índice TTL Mongo).
//   - Circuit breaker con umbral y cooldown configurables.
//   - Timeout HTTP y tamaño máximo de respuesta.
//   - Errores tipados y delegados al `errorHandler` central.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const rateLimit = require('express-rate-limit');
const { requierePermiso } = require('../utils/permisos');
const { validarCedula } = require('../utils/validators');
const { CircuitBreaker } = require('../utils/circuitBreaker');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN (env-driven)
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  colCache: 'cache_consultas',
  cacheKeyPrefix: 'cedula:',
  cacheDias: envNum('CONSULTAS_CACHE_DIAS', 30),
  httpTimeoutMs: envNum('CONSULTAS_HTTP_TIMEOUT_MS', 12_000),
  maxContentLength: envNum('CONSULTAS_MAX_CONTENT_BYTES', 2 * 1024 * 1024), // 2 MB
  urlExterna: 'https://www.ecuadorlegalonline.com/consultar-nombre-cedula/',
  userAgent:
    process.env.CONSULTAS_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  debug:
    process.env.SRI_DEBUG === 'true' ||
    process.env.NODE_ENV !== 'production',
  cedulaRegex: /^\d{10}$/
});

const DEBUG = CONFIG.debug;

// ============================================================
// RATE LIMIT
// ============================================================
const consultaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: envNum('CONSULTAS_RATE_MAX', 20),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(429).json({
      error: 'Demasiadas consultas. Espere un momento.',
      codigo: 'RATE_LIMIT'
    });
  }
});

// ============================================================
// CIRCUIT BREAKER
// ============================================================
const breakerExterno = new CircuitBreaker({
  nombre: 'ecuadorlegalonline',
  umbralFallos: envNum('CONSULTAS_CB_UMBRAL', 5),
  cooldownMs: envNum('CONSULTAS_CB_COOLDOWN_MS', 10 * 60 * 1000)
});

// ============================================================
// HELPERS
// ============================================================

/** Headers de no-cache (los datos pueden variar y son PII). */
function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/** Extrae el nombre de una respuesta HTML del servicio. */
function extraerNombre($) {
  // 1. Tabla: primera fila con 2+ celdas donde la 2ª es texto razonable.
  let nombre = null;
  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 2) {
      const texto = $(cells[1]).text().trim();
      if (texto && texto.length > 2 && texto.length < 200) {
        nombre = texto;
        return false; // detiene el each
      }
    }
  });
  if (nombre) return nombre;

  // 2. Texto con etiqueta "Nombre:" / "Apellidos:"
  const texto = $('body').text();
  const regex = /(?:Nombre|NOMBRE|Apellidos|APELLIDOS)\s*:\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]{2,100})/;
  const m = texto.match(regex);
  if (m && m[1]) return m[1].trim();

  // 3. Fallback: dos o más palabras capitalizadas contiguas.
  const m2 = texto.match(/([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,5})/);
  return m2 ? m2[0].trim() : null;
}

/** Devuelve una entrada de caché si existe y no ha expirado. */
async function leerCache(db, cedula) {
  try {
    const _id = CONFIG.cacheKeyPrefix + cedula;
    const cached = await db.collection(CONFIG.colCache).findOne({
      _id,
      expira: { $gt: new Date() }
    });
    if (cached && cached.nombre) return cached;
    return null;
  } catch (err) {
    log.warn({ err: err.message, cedula }, 'Error leyendo cache de consulta');
    return null;
  }
}

/** Guarda en caché (idempotente). */
async function guardarCache(db, cedula, nombre) {
  try {
    const _id = CONFIG.cacheKeyPrefix + cedula;
    const ahora = new Date();
    const expira = new Date(ahora.getTime() + CONFIG.cacheDias * 24 * 60 * 60 * 1000);
    await db.collection(CONFIG.colCache).updateOne(
      { _id },
      {
        $set: {
          tipo: 'cedula',
          identificacion: cedula,
          nombre,
          consultado_en: ahora,
          expira
        }
      },
      { upsert: true }
    );
  } catch (err) {
    // Fallo de caché no debe romper la respuesta.
    log.warn({ err: err.message, cedula }, 'No se pudo guardar cache de consulta');
  }
}

/** Llama al servicio externo protegido por el circuit breaker. */
async function consultarServicioExterno(cedula) {
  return breakerExterno.ejecutar(async () => {
    return axios.post(
      CONFIG.urlExterna,
      new URLSearchParams({ cedula }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': CONFIG.userAgent,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-EC,es;q=0.9'
        },
        timeout: CONFIG.httpTimeoutMs,
        maxRedirects: 3,
        maxContentLength: CONFIG.maxContentLength,
        maxBodyLength: CONFIG.maxContentLength,
        validateStatus: (s) => s >= 200 && s < 400
      }
    );
  });
}

// ============================================================
// GET /cedula/:cedula
// ============================================================
router.get(
  '/cedula/:cedula',
  requierePermiso('clientes', 'ver'),
  consultaLimiter,
  async (req, res, next) => {
    try {
      const { cedula } = req.params;

      // ---- Validaciones ----
      if (!CONFIG.cedulaRegex.test(cedula)) {
        return res.status(400).json({
          error: 'Cédula inválida (debe tener 10 dígitos)',
          codigo: 'CEDULA_FORMATO'
        });
      }
      if (!validarCedula(cedula)) {
        return res.status(400).json({
          error: 'Cédula inválida (dígito verificador incorrecto)',
          codigo: 'CEDULA_INVALIDA'
        });
      }

      // ---- Cache ----
      const cached = await leerCache(req.db, cedula);
      if (cached) {
        headersNoStore(res);
        return res.json({
          nombre: cached.nombre,
          cache: true,
          consultado_en: cached.consultado_en
        });
      }

      // ---- Servicio externo ----
      let response;
      try {
        response = await consultarServicioExterno(cedula);
      } catch (err) {
        // El errorHandler traduce estos si dejamos caer el error.
        // Pero para el circuit breaker queremos devolver 503 + Retry-After.
        const codigo = err.codigo || err.code;
        if (codigo === 'CIRCUIT_OPEN') {
          res.setHeader('Retry-After', String(err.retryAfter || 60));
          return res.status(503).json({
            error: err.message || 'Servicio temporalmente no disponible',
            codigo: 'CIRCUIT_OPEN',
            retryAfter: err.retryAfter
          });
        }
        if (codigo === 'ECONNABORTED' || codigo === 'ETIMEDOUT') {
          return res.status(504).json({
            error: 'Timeout consultando el servicio externo',
            codigo: 'TIMEOUT_EXTERNO'
          });
        }
        // Otros errores de axios → 502
        if (err.isAxiosError) {
          return res.status(502).json({
            error: 'Servicio externo no disponible',
            codigo: 'SERVICIO_EXTERNO'
          });
        }
        // Errores inesperados → errorHandler
        throw err;
      }

      // ---- Parsing ----
      const $ = cheerio.load(response.data);
      const nombre = extraerNombre($);

      if (!nombre) {
        if (DEBUG) log.debug({ cedula }, 'Consulta sin nombre en respuesta');
        return res.status(404).json({
          error: 'No se encontró información para esta cédula',
          codigo: 'SIN_RESULTADO'
        });
      }

      // ---- Guardar cache (no bloqueante) ----
      guardarCache(req.db, cedula, nombre).catch(() => {});

      headersNoStore(res);
      return res.json({ nombre, cache: false });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// DELETE /cache/:cedula
// ============================================================
router.delete('/cache/:cedula', requierePermiso('clientes', 'editar'), async (req, res, next) => {
  try {
    const { cedula } = req.params;
    if (!CONFIG.cedulaRegex.test(cedula)) {
      return res.status(400).json({
        error: 'Cédula inválida (debe tener 10 dígitos)',
        codigo: 'CEDULA_FORMATO'
      });
    }

    const r = await req.db.collection(CONFIG.colCache).deleteOne({
      _id: CONFIG.cacheKeyPrefix + cedula
    });

    headersNoStore(res);
    return res.json({
      message: r.deletedCount > 0 ? 'Cache eliminado' : 'No había cache para esa cédula',
      eliminado: r.deletedCount > 0
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /circuit-stats
// ============================================================
router.get('/circuit-stats', requierePermiso('usuarios', 'ver'), async (req, res, next) => {
  try {
    headersNoStore(res);
    return res.json(breakerExterno.stats());
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._extraerNombre = extraerNombre;
module.exports._breakerExterno = breakerExterno;