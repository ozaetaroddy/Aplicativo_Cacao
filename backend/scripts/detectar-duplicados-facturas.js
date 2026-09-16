// backend/scripts/detectar-duplicados-facturas.js
// ============================================================
// Lista documentos que violarían el índice único
// (tipo_documento, numero_factura, ruc_emisor).
// ------------------------------------------------------------
// Uso:
//   node scripts/detectar-duplicados-facturas.js
//   node scripts/detectar-duplicados-facturas.js --json
//   node scripts/detectar-duplicados-facturas.js --json --out=dup.json
//   node scripts/detectar-duplicados-facturas.js --coleccion=compras_v2
//
// Exit code:
//   0 si no hay duplicados, 2 si los hay.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { run, log, ok, warn, auditar } = require('./_utils');

const COLECCIONES_DEFECTO = ['ventas_v2', 'compras_v2'];

// ============================================================
// MAIN
// ============================================================
async function main({ db, args }) {
  const { flags, kv } = args;
  const jsonOut = flags.has('json');
  const outFile = kv.out || null;
  const colecciones = kv.coleccion
    ? [String(kv.coleccion)]
    : COLECCIONES_DEFECTO;

  const resultados = [];
  let totalDuplicados = 0;

  for (const col of colecciones) {
    log(`📂 ${col}`);

    const dup = await db.collection(col).aggregate([
      { $match: { numero_factura: { $type: 'string', $gt: '' } } },
      {
        $group: {
          _id: {
            tipo_documento: '$tipo_documento',
            numero_factura: '$numero_factura',
            ruc_emisor: '$ruc_emisor'
          },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    totalDuplicados += dup.length;
    resultados.push({ coleccion: col, duplicados: dup });

    if (dup.length === 0) {
      ok(`  Sin duplicados`);
      continue;
    }

    warn(`  ${dup.length} combinaciones duplicadas`);
    if (!jsonOut) {
      for (const d of dup.slice(0, 30)) {
        log(`    tipo=${d._id.tipo_documento || '-'}  ` +
            `numero=${d._id.numero_factura}  ` +
            `ruc=${d._id.ruc_emisor || '-'}  →  ${d.count} veces`);
        log(`       _ids: ${d.ids.join(', ')}`);
      }
      if (dup.length > 30) log(`    … y ${dup.length - 30} más`);
    }
  }

  // ---- Salida JSON ----
  if (jsonOut) {
    const payload = {
      generado: new Date(),
      totalDuplicados,
      colecciones: resultados
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
  if (totalDuplicados === 0) {
    ok('🎉 No hay duplicados. El índice único se puede crear sin problemas.');
  } else {
    warn(`⚠️  ${totalDuplicados} combinaciones duplicadas. Corrige antes de crear el índice.`);
    process.exitCode = 2;
  }

  await auditar(db, {
    accion: 'detectar-duplicados-facturas',
    detalle: `${totalDuplicados} combinaciones duplicadas`,
    meta: { colecciones, totalDuplicados }
  });
}

run(main).catch(e => { console.error('❌ Error fatal:', e); process.exit(1); });