// backend/scripts/backup-manual.js
// ============================================================
// Genera un backup desde CLI (útil para cron externos, Docker, etc.).
// ------------------------------------------------------------
// Uso:
//   node scripts/backup-manual.js
//   node scripts/backup-manual.js --out=/backups/mi-backup.json.gz
//   node scripts/backup-manual.js --no-comprimir    (JSON plano)
//
// Salida por defecto: backup_YYYYMMDD_HHMMSS.json.gz en ./backups/
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { run, log, ok, warn, auditar } = require('./_utils');
const {
  generarBackup,
  comprimirBackup,
  calcularTamano
} = require('../utils/backup');

async function main({ db, args }) {
  const { kv, flags, dryRun } = args;
  const sinComprimir = flags.has('no-comprimir');

  log('📦 Generando snapshot de la base…');
  const t0 = Date.now();
  const snapshot = await generarBackup(db);
  const tSnap = Date.now() - t0;

  const colecciones = Object.keys(snapshot.colecciones || {});
  const totalDocs = colecciones.reduce(
    (s, k) => s + (snapshot.colecciones[k] || []).length, 0
  );

  log(`  ✔ ${colecciones.length} colecciones · ${totalDocs} documentos · ${tSnap} ms`);

  // ---- Nombre de archivo ----
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = sinComprimir ? '.json' : '.json.gz';
  const nombreDef = `backup_${stamp}${ext}`;
  const rutaOut = kv.out
    ? path.resolve(String(kv.out))
    : path.join(process.cwd(), 'backups', nombreDef);

  // Crear carpeta si hace falta.
  const dirOut = path.dirname(rutaOut);
  if (!fs.existsSync(dirOut)) {
    if (dryRun) {
      warn(`[dry-run] Crearía carpeta ${dirOut}`);
    } else {
      fs.mkdirSync(dirOut, { recursive: true });
    }
  }

  // ---- Serializar ----
  let buffer;
  if (sinComprimir) {
    buffer = Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8');
  } else {
    buffer = comprimirBackup(snapshot);
  }

  const tamSinComprimir = calcularTamano(snapshot);
  const ratio = tamSinComprimir > 0
    ? (buffer.length / tamSinComprimir * 100).toFixed(1)
    : '0.0';

  if (dryRun) {
    warn(`[dry-run] Escribiría ${rutaOut} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return;
  }

  fs.writeFileSync(rutaOut, buffer);

  ok(`💾 Backup guardado`);
  log(`   Archivo:     ${rutaOut}`);
  log(`   Comprimido:  ${(buffer.length / 1024).toFixed(1)} KB`);
  log(`   Sin comprimir: ${(tamSinComprimir / 1024).toFixed(1)} KB (ratio ${ratio}%)`);

  await auditar(db, {
    accion: 'backup-manual',
    detalle: `Backup CLI: ${path.basename(rutaOut)}`,
    meta: {
      archivo: rutaOut,
      tamanoComprimido: buffer.length,
      tamanoSinComprimir: tamSinComprimir,
      colecciones: colecciones.length,
      documentos: totalDocs
    }
  });
}

run(main).catch(err => { console.error('❌ Error fatal:', err); process.exit(1); });