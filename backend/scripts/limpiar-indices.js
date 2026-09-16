// backend/scripts/limpiar-indices.js
// ============================================================
// Elimina índices obsoletos conocidos.
// ------------------------------------------------------------
// Uso:
//   node scripts/limpiar-indices.js
//   node scripts/limpiar-indices.js --dry-run
//   node scripts/limpiar-indices.js --confirm
//   node scripts/limpiar-indices.js --add=coleccion:indice
//      → Añade un índice extra a la lista de eliminación
// ============================================================
'use strict';

const { run, log, ok, warn, confirmar, auditar, pad } = require('./_utils');

// Índices obsoletos conocidos: { coleccion, nombreIndice, motivo }
const INDICES_OBSOLETOS = [
  {
    coleccion: 'productos',
    nombreIndice: 'nombre_1',
    motivo: 'Reemplazado por productos_nombre_unique sobre nombreNorm'
  }
];

async function main({ db, args }) {
  const { dryRun, confirmado, kv } = args;

  // --add=coleccion:indice
  const extras = [];
  if (kv.add) {
    for (const par of String(kv.add).split(',')) {
      const [col, idx] = par.split(':').map(s => s.trim());
      if (col && idx) {
        extras.push({ coleccion: col, nombreIndice: idx, motivo: 'Añadido por CLI' });
      }
    }
  }

  const aEliminar = [...INDICES_OBSOLETOS, ...extras];
  log(`📋 ${aEliminar.length} índices candidatos a eliminar`);
  log('');

  // ---- Detectar existentes ----
  const encontrados = [];
  for (const item of aEliminar) {
    const { coleccion, nombreIndice, motivo } = item;
    let indices;
    try {
      indices = await db.collection(coleccion).indexes();
    } catch (e) {
      warn(`${coleccion}.${nombreIndice}: no se pudo leer índices (${e.message})`);
      continue;
    }

    const existe = indices.find(i => i.name === nombreIndice);
    if (!existe) {
      log(`  ⏭️  ${pad(`${coleccion}.${nombreIndice}`, 40)} no existe, se omite`);
      continue;
    }
    encontrados.push({ coleccion, nombreIndice, motivo, def: existe });
    log(`  🗑️  ${pad(`${coleccion}.${nombreIndice}`, 40)} ${motivo}`);
  }

  if (encontrados.length === 0) {
    ok('');
    ok('Nada por eliminar');
    return;
  }

  if (dryRun) {
    warn('');
    warn('Dry-run: no se eliminó nada');
    return;
  }

  log('');
  const ok = await confirmar(`¿Eliminar los ${encontrados.length} índices?`, { confirmado });
  if (!ok) {
    warn('Cancelado');
    return;
  }

  // ---- Eliminar ----
  let eliminados = 0;
  const errores = [];
  for (const e of encontrados) {
    try {
      await db.collection(e.coleccion).dropIndex(e.nombreIndice);
      ok(`  🗑️  ${e.coleccion}.${e.nombreIndice}`);
      eliminados++;
    } catch (err) {
      warn(`  ❌ ${e.coleccion}.${e.nombreIndice}: ${err.message}`);
      errores.push({ ...e, error: err.message });
    }
  }

  log('');
  log('─'.repeat(60));
  ok(`🎉 ${eliminados} índices eliminados${errores.length ? `, ${errores.length} errores` : ''}`);
  log('Reinicia el servidor para recrear los índices correctos.');

  await auditar(db, {
    accion: 'limpiar-indices',
    detalle: `${eliminados} índices eliminados`,
    meta: { eliminados, errores, encontrados: encontrados.map(e => ({
      coleccion: e.coleccion, nombre: e.nombreIndice
    })) }
  });
}

run(main).catch(e => { console.error('❌ Error fatal:', e); process.exit(1); });