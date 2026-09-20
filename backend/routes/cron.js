// backend/routes/cron.js
// ============================================================
// Endpoints para Cron Jobs externos (cron-job.org, GitHub Actions, etc.)
// ------------------------------------------------------------
// Estos endpoints NO requieren JWT ni cookies. Se autentican con
// un token compartido vía query string (`?token=...`) que debe
// coincidir con la env var `CRON_TOKEN`.
//
// ⚠️  Este router se monta en `server.js` ANTES del `authMiddleware`
//     global de `/api`. Si lo montas DESPUÉS, recibirás 401.
//
// Endpoints:
//   GET  /api/cron/backup-run  → dispara un backup automático (202 inmediato)
//   POST /api/cron/backup-run  → idem (algunos servicios usan POST)
//   GET  /api/cron/ping        → liveness simple, útil para keep-alive
//
// Seguridad:
//   - Comparación timing-safe del token.
//   - Si `CRON_TOKEN` no está definido → todos los endpoints devuelven 503.
//   - El backup corre en BACKGROUND: la respuesta es 202 inmediato.
//     Si algo falla, el propio scheduler envía email a los admins.
//   - El `LockManager` de `backupScheduler` evita duplicados si el
//     cron externo reintenta o dispara dos veces seguidas.
// ============================================================
'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const log = require('../utils/logger');

// ============================================================
// HELPERS
// ============================================================

/** Comparación timing-safe de strings (evita side-channel). */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Valida el token del query string. Devuelve `true` si autoriza. */
function autorizado(req) {
  const esperado = process.env.CRON_TOKEN || '';
  if (!esperado) return false;

  const recibido =
    (typeof req.query.token === 'string' && req.query.token) ||
    (typeof req.headers['x-cron-token'] === 'string' && req.headers['x-cron-token']) ||
    '';

  return safeCompare(recibido, esperado);
}

/** Responde 401 sin filtrar info. */
function noAutorizado(res) {
  res.set('Cache-Control', 'no-store');
  return res.status(401).json({
    error: 'No autorizado',
    codigo: 'NO_AUTORIZADO'
  });
}

/** Responde 503 si falta config. */
function noConfigurado(res) {
  res.set('Cache-Control', 'no-store');
  return res.status(503).json({
    error: 'CRON_TOKEN no está configurado en el servidor',
    codigo: 'CRON_NO_CONFIGURADO'
  });
}

// ============================================================
// HANDLER COMPARTIDO (GET + POST)
// ============================================================
async function handleBackupRun(req, res, next) {
  try {
    // ---- 1. Config presente ----
    if (!process.env.CRON_TOKEN) {
      log.warn('CRON_TOKEN no configurado — rechazando request a /cron/backup-run');
      return noConfigurado(res);
    }

    // ---- 2. Autorización ----
    if (!autorizado(req)) {
      log.warn(
        { ip: req.ip, ua: req.headers['user-agent'] },
        'Intento de ejecución de cron sin token válido'
      );
      return noAutorizado(res);
    }

    // ---- 3. req.db disponible ----
    if (!req.db) {
      return res.status(503).json({
        error: 'Base de datos no disponible',
        codigo: 'DB_NO_DISPONIBLE'
      });
    }

    // ---- 4. Disparar en BACKGROUND y responder 202 inmediato ----
    //      El backup puede tardar minutos. cron-job.org tiene timeout
    //      de 30s por default. Responder antes evita el timeout.
    const { ejecutarBackupAutomatico } = require('../utils/backupScheduler');

    // Fire and forget: no await, pero capturamos errores.
    ejecutarBackupAutomatico(req.db).catch(err => {
      log.error(
        { err: err.message },
        'Backup disparado por cron externo falló'
      );
    });

    log.info(
      {
        origen: 'cron-externo',
        ip: req.ip,
        ua: req.headers['user-agent']
      },
      '🕐 Backup disparado por cron externo'
    );

    res.set('Cache-Control', 'no-store');
    return res.status(202).json({
      ok: true,
      message: 'Backup iniciado en background. Se enviará email si falla.',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return next(err);
  }
}

// ============================================================
// ENDPOINTS
// ============================================================
router.get('/backup-run', handleBackupRun);
router.post('/backup-run', handleBackupRun);

/**
 * Ping simple — útil para mantener el dyno despierto con cron-job.org
 * a intervalos regulares (evita cold starts lentos en Render free).
 */
router.get('/ping', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({
    ok: true,
    service: 'cacao-backend',
    cron: 'ping',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;