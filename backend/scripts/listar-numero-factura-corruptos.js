// backend/scripts/listar-numero-factura-corruptos.js
// ============================================================
// Lista documentos cuyo `numero_factura` no es un string válido.
// ------------------------------------------------------------
// Uso:
//   node scripts/listar-numero-factura-corruptos.js
//   node scripts/listar-numero-factura-corruptos.js --json
//   node scripts/listar-numero-factura-corruptos.js --json --out=corruptos.json
//   node scripts/listar-numero-factura-corruptos.js --coleccion=ventas_v2
//
// Exit code: 0 si no hay, 2 si los hay.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { run, log, ok, warn, auditar } = require('./_utils');

const COLECCIONES_DEFECTO = ['ventas_v2', 'compras_v2'];

async function main({ db, args }) {
  const { flags, kv } = args;
  const jsonOut = flags.has('json');
  const outFile = kv.out || null;
  const colecciones = kv.coleccion ? [String(kv.coleccion)] : COLECCIONES_DEFECTO;

  const reporte = [];
  let totalCorruptos = 0;

  for (const col of colecciones) {
    log(`📂 ${col}`);

    const docs = await db.collection(col).find(
      { numero_factura: { $exists: true, $ne: null } },
      { projection: { numero_factura: 1, tipo_documento: 1, fecha_emision: 1, total: 1 } }
    ).toArray();

    const corruptos = docs.filter(d => typeof d.numero_factura !== 'string');
    totalCorruptos += corruptos.length;
    reporte.push({ coleccion: col, total: corruptos.length, docs: corruptos });

    if (corruptos.length === 0) {
      ok(`  Sin registros corruptos`);
      continue;
    }

    warn(`  ${corruptos.length} registro(s) con numero_factura no-string`);
    if (!jsonOut) {
      for (const d of corruptos.slice(0, 30)) {
        log(`    _id:            ${d._id}`);
        log(`    tipo_documento: ${d.tipo_documento || '(n/a)'}`);
        log(`    fecha_emision:  ${d.fecha_emision}`);
        log(`    total:          ${d.total}`);
        log(`    numero_factura: ${JSON.stringify(d.numero_factura)} (${typeof d.numero_factura})`);
        log('');
      }
      if (corruptos.length > 30) log(`    … y ${corruptos.length - 30} más`);
    }
  }

  // ---- JSON out ----
  if (jsonOut) {
    const payload = {
      generado: new Date(),
      totalCorruptos,
      colecciones: reporte
    };
    const json = JSON.stringify(payload, null, 2);
    if (outFile) {
      const ruta = path.resolve(outFile);
      fs.writeFileSync(ruta, json, 'utf8');
      ok(`💾 Reporte guardado en ${ruta}`);
    } else {
      process.stdout.write(json + '\n');
    }
  }

  log('');
  log('─'.repeat(60));
  log(`Total de registros corruptos: ${totalCorruptos}`);

  if (totalCorruptos > 0) {
    warn('💡 Recomendación: corregir manualmente estos registros desde Compass');
    warn('   antes de correr migrate:claves.');
    process.exitCode = 2;
  }

  await auditar(db, {
    accion: 'listar-numero-factura-corruptos',
    detalle: `${totalCorruptos} registros corruptos`,
    meta: { colecciones, totalCorruptos }
  });
}

run(main).catch(e => { console.error('❌ Error fatal:', e); process.exit(1); });