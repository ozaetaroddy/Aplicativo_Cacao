// backend/scripts/_utils.js
// ============================================================
// Utilidades compartidas para scripts CLI.
// ------------------------------------------------------------
// Provee: parseo de flags uniforme, conexión, confirmación,
// auditoría en Mongo, manejo de SIGINT y un wrapper `run()`.
//
// Convenciones CLI soportadas:
//   --dry-run              → no escribe nada
//   --confirm              → salta el prompt interactivo
//   --limit=N              → limita el universo de trabajo
//   --only=foo,bar         → filtra por una lista
//   --desde=YYYY-MM-DD     → rango (si el script lo soporta)
//   --hasta=YYYY-MM-DD
//
// Exit codes:
//   0  → OK
//   1  → error de negocio/configuración
//   130 → interrumpido por SIGINT
// ============================================================
'use strict';

require('dotenv').config();

const { MongoClient } = require('mongodb');
const readline = require('readline');
const os = require('os');

// ============================================================
// PARSEO DE ARGS
// ============================================================
/**
 * Parsea `process.argv` con las convenciones de arriba.
 * @param {string[]} [argv]
 */
function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  const kv = {};

  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const trimmed = raw.slice(2);
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      flags.add(trimmed);
    } else {
      const k = trimmed.slice(0, eqIdx);
      const v = trimmed.slice(eqIdx + 1);
      kv[k] = v;
    }
  }

  const limitRaw = kv.limit !== undefined ? parseInt(kv.limit, 10) : null;
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : null;

  const only = kv.only
    ? kv.only.split(',').map(s => s.trim()).filter(Boolean)
    : null;

  return {
    flags,
    kv,
    dryRun: flags.has('dry-run'),
    confirmado: flags.has('confirm'),
    limit,
    only,
    desde: kv.desde || null,
    hasta: kv.hasta || null
  };
}

// ============================================================
// CONEXIÓN
// ============================================================
async function conectar() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ Falta MONGODB_URI en el entorno');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  await client.connect();
  const db = process.env.DB_NAME ? client.db(process.env.DB_NAME) : client.db();
  return { client, db };
}

// ============================================================
// INTERACCIÓN
// ============================================================
async function preguntar(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, ans => {
      rl.close();
      resolve(ans);
    });
  });
}

/**
 * Pide confirmación textual. Si `--confirm` está presente, la salta.
 * @param {string} mensaje
 * @param {object} opts
 * @param {boolean} opts.confirmado  Del `args.confirmado`
 */
async function confirmar(mensaje, { confirmado = false } = {}) {
  if (confirmado) return true;
  const r = await preguntar(`${mensaje}\nEscribe SI para confirmar: `);
  return r.trim().toUpperCase() === 'SI';
}

// ============================================================
// LOGS CON TIMESTAMP
// ============================================================
function ts() {
  return new Date().toISOString().slice(11, 19);
}
function log(msg)  { console.log(`[${ts()}] ${msg}`); }
function warn(msg) { console.warn(`[${ts()}] ⚠️  ${msg}`); }
function ok(msg)   { console.log(`[${ts()}] ✅ ${msg}`); }
function err(msg)  { console.error(`[${ts()}] ❌ ${msg}`); }

// ============================================================
// AUDITORÍA
// ============================================================
/**
 * Inserta un registro de auditoría. NUNCA rompe el script.
 * @param {object} db
 * @param {object} payload
 * @param {string} payload.accion
 * @param {string} [payload.detalle]
 * @param {object} [payload.meta]
 */
async function auditar(db, payload) {
  try {
    await db.collection('auditoria').insertOne({
      accion: `script:${payload.accion}`,
      detalle: payload.detalle || '',
      meta: payload.meta || {},
      origen: 'cli',
      usuarioEmail: `cli:${os.hostname()}`,
      fecha: new Date()
    });
  } catch (_) {
    /* nunca romper por auditoría */
  }
}

// ============================================================
// WRAPPER run()
// ============================================================
/**
 * Envuelve un `main({ db, client, args })` con:
 *   - conexión y cierre limpios
 *   - manejo de SIGINT / SIGTERM
 *   - captura de errores con exit code
 *
 * @param {(ctx: {db: Db, client: MongoClient, args: object}) => Promise<void>} main
 */
async function run(main) {
  const args = parseArgs();
  let client;
  try {
    ({ client } = await conectar());
  } catch (e) {
    err(`No se pudo conectar: ${e.message}`);
    process.exit(1);
  }
  const db = process.env.DB_NAME ? client.db(process.env.DB_NAME) : client.db();

  const onSignal = async (code) => {
    warn(`Señal recibida (${code}). Cerrando…`);
    try { await client.close(); } catch (_) {}
    process.exit(code === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT',  () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));

  try {
    log(`🔌 Conectado a ${db.databaseName}`);
    if (args.dryRun) log('⚙️  Modo: DRY-RUN (no se escribe nada)');
    await main({ db, client, args });
  } catch (e) {
    err(e.message);
    if (process.env.DEBUG) console.error(e.stack);
    process.exitCode = 1;
  } finally {
    try { await client.close(); } catch (_) {}
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
  }
}

// ============================================================
// HELPERS DE FORMATO
// ============================================================
function pad(str, len) {
  return String(str ?? '').padEnd(len).slice(0, len);
}

function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  parseArgs,
  conectar,
  preguntar,
  confirmar,
  log,
  warn,
  ok,
  err,
  auditar,
  run,
  pad,
  round2
};