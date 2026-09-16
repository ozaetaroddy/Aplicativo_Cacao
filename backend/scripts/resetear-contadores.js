// backend/scripts/resetear-contadores.js
// ============================================================
// Resetea contadores. Operación SENSIBLE: por defecto exige
// confirmación textual + hace backup automático.
// ------------------------------------------------------------
// Uso:
//   node scripts/resetear-contadores.js                          (interactivo)
//   node scripts/resetear-contadores.js --only=factura           (uno)
//   node scripts/resetear-contadores.js --set=factura=10,compra=86  (valores)
//   node scripts/resetear-contadores.js --confirm                (no pedir SI)
//   node scripts/resetear-contadores.js --dry-run                (solo ver)
//   node scripts/resetear-contadores.js --sin-backup             (no backup)
//
// 💡 Hace backup automático a ./backups/ ANTES de escribir.
// 💡 Escritura auditada en Mongo.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { run, log, ok, warn, err, confirmar, auditar, pad } = require('./_utils');
const {
  generarBackup,
  comprimirBackup
} = require('./_utils');

// ============================================================
// PARSEO DE `--set=factura=10,compra=86`
// ============================================================
function parseSet(raw) {
  if (!raw) return {};
  const salida = {};
  for (const par of String(raw).split(',')) {
    const [k, v] = par.split('=').map(s => s.trim());
    if (!k) continue;
    const n = parseInt(v, 10);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`Valor inválido para "${k}": ${v}`);
    }
    salida[k] = n;
  }
  return salida;
}

async function backupPreRun(db) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ruta = path.join(dir, `pre-reset-contadores_${stamp}.json.gz`);

  const snap = await generarBackup(db);
  const buf = comprimirBackup(snap);
  fs.writeFileSync(ruta, buf);
  return ruta;
}

// ============================================================
// MAIN
// ============================================================
async function main({ db, args }) {
  const { dryRun, confirmado, only, kv, flags } = args;
  const sinBackup = flags.has('sin-backup');

  let valores = {};
  try {
    valores = parseSet(kv.set);
  } catch (e) {
    err(e.message);
    process.exitCode = 1;
    return;
  }

  const col = db.collection('contadores');

  // ---- Universo a tocar ----
  const filtro = only && only.length > 0 ? { _id: { $in: only } } : {};
  const actuales = await col.find(filtro).sort({ _id: 1 }).toArray();

  if (actuales.length === 0) {
    warn('No hay contadores que coincidan con el filtro');
    return;
  }

  // ---- Vista previa ----
  log('');
  log('Contadores ANTES:');
  for (const c of actuales) {
    const objetivo = valores[c._id] !== undefined ? valores[c._id] : 0;
    const flecha = objetivo !== c.valor ? `→ ${objetivo}` : '(sin cambio)';
    log(`  ${pad(c._id, 20)} ${pad(c.valor, 8)} ${flecha}`);
  }

  if (dryRun) {
    warn('');
    warn('Dry-run: no se escribirá nada');
    return;
  }

  // ---- Confirmación obligatoria ----
  log('');
  warn('⚠️  Esta operación reinicia la numeración de documentos.');
  warn('    Un secuencial mal reseteado puede causar claves duplicadas ante el SRI.');

  const ok = await confirmar('¿Ejecutar el reset?', { confirmado });
  if (!ok) {
    warn('Cancelado');
    return;
  }

  // ---- Backup ----
  if (!sinBackup) {
    log('💾 Generando backup pre-reset…');
    const ruta = await backupPreRun(db);
    ok(`Backup guardado: ${ruta}`);
  }

  // ---- Aplicar ----
  let aplicados = 0;
  if (Object.keys(valores).length === 0) {
    const r = await col.updateMany(filtro, {
      $set: { valor: 0, updatedAt: new Date() }
    });
    aplicados = r.modifiedCount;
  } else {
    for (const [id, valor] of Object.entries(valores)) {
      await col.updateOne(
        { _id: id },
        { $set: { valor, updatedAt: new Date() } },
        { upsert: true }
      );
      aplicados++;
    }
  }

  // ---- Reporte ----
  log('');
  log('Contadores DESPUÉS:');
  const despues = await col.find(filtro).sort({ _id: 1 }).toArray();
  for (const c of despues) {
    log(`  ${pad(c._id, 20)} ${pad(c.valor, 8)}`);
  }
  ok(`🎉 ${aplicados} contadores actualizados`);

  await auditar(db, {
    accion: 'resetear-contadores',
    detalle: `${aplicados} contadores actualizados`,
    meta: {
      valores,
      only: only || null,
      antes: actuales.map(c => ({ _id: c._id, valor: c.valor })),
      despues: despues.map(c => ({ _id: c._id, valor: c.valor }))
    }
  });
}

run(main).catch(e => { console.error('❌ Error fatal:', e); process.exit(1); });