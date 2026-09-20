// backend/scripts/reset-datos.js
// ============================================================
// Limpia los datos de NEGOCIO pero preserva:
//   - usuarios             → login
//   - refresh_tokens       → sesiones activas
//   - configuracion        → RUC, ambiente SRI, etc.
//   - certificados         → firma electrónica
//   - catalogos            → catálogos SRI
//   - meta                 → versión, migraciones
//   - backup_config        → config del scheduler
//   - backup_lock          → lock del scheduler
//   - backups              → índice de backups
//
// Uso:
//   node scripts/reset-datos.js                    # dry-run
//   node scripts/reset-datos.js --apply            # aplicar
//   node scripts/reset-datos.js --apply --contadores
// ============================================================
'use strict';

// 🔧 FIX: cargar .env desde backend/ sin importar el CWD
const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env')
});

const { MongoClient } = require('mongodb');

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME;
const APPLY = process.argv.includes('--apply');
const RESET_CONTADORES = process.argv.includes('--contadores');

if (!URI || !DB_NAME) {
  console.error('❌ Faltan MONGODB_URI y/o DB_NAME en backend/.env');
  console.error('   CWD actual:', process.cwd());
  console.error('   Buscando en:', path.resolve(__dirname, '..', '.env'));
  process.exit(1);
}

// ============================================================
// COLECCIONES A BORRAR (datos de negocio)
// ============================================================
const COLECCIONES_BORRAR = [
  // Documentos
  'ventas_v2',
  'compras_v2',
  'retenciones',        // legacy
  'pagos',
  'kardex',

  // Maestros
  'productos',
  'categorias',
  'clientes',
  'proveedores',

  // Metadata de negocio
  'auditoria',
  'periodos_cerrados',
  'periodos',
  'notificaciones',
  'emails_enviados',
  'sri_respuestas',
  'backups_meta',

  // Cache
  'cache_consultas'
];

// ============================================================
// COLECCIONES A PRESERVAR (configuración y auth)
// ============================================================
const COLECCIONES_PRESERVAR = [
  'usuarios',
  'refresh_tokens',     // ← preservamos para no cerrar sesiones activas
  'configuracion',
  'certificados',
  'catalogos',

  // Sistema
  'meta',
  'backup_config',
  'backup_lock',
  'backups'
];

async function main() {
  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log(`\n🔌 Conectado a "${DB_NAME}"`);
  console.log(`🧪 Modo: ${APPLY ? '⚠️  APLICAR' : '🔍 DRY-RUN'}`);
  console.log('═'.repeat(64));

  const existentes = (await db.listCollections().toArray()).map(c => c.name);

  // ---- Inventario ----
  console.log('\n📋 Colecciones encontradas:');
  const desconocidas = [];

  for (const c of existentes) {
    const count = await db.collection(c).estimatedDocumentCount();
    const esPreservar = COLECCIONES_PRESERVAR.includes(c);
    const esBorrar = COLECCIONES_BORRAR.includes(c);
    let tag;
    if (esPreservar) tag = '🔒 PRESERVAR';
    else if (esBorrar) tag = '🗑️  BORRAR';
    else {
      tag = '❓ DESCONOCIDA';
      desconocidas.push(c);
    }
    console.log(`  ${tag.padEnd(16)} ${c.padEnd(24)} ${count} docs`);
  }

  if (desconocidas.length > 0) {
    console.log(
      `\n⚠️  ${desconocidas.length} colección(es) desconocida(s): ${desconocidas.join(', ')}`
    );
    console.log('   Se PRESERVARÁN por seguridad. Si quieres borrarlas,');
    console.log('   añádelas a COLECCIONES_BORRAR en este script.\n');
  }

  // ---- Borrar ----
  console.log('\n🗑️  Eliminando datos de negocio...');
  let coleccionesVaciadas = 0;
  let totalDocs = 0;

  for (const nombre of COLECCIONES_BORRAR) {
    if (!existentes.includes(nombre)) {
      console.log(`  ⏭️  ${nombre.padEnd(22)} (no existe)`);
      continue;
    }
    const count = await db.collection(nombre).estimatedDocumentCount();

    if (APPLY) {
      const res = await db.collection(nombre).deleteMany({});
      console.log(`  ✅ ${nombre.padEnd(22)} ${res.deletedCount} docs eliminados`);
      totalDocs += res.deletedCount;
    } else {
      console.log(`  🔍 ${nombre.padEnd(22)} ${count} docs (se borrarían)`);
    }
    coleccionesVaciadas++;
  }

  // ---- Contadores ----
  if (RESET_CONTADORES) {
    console.log('\n🔢 Reseteando contadores...');
    if (existentes.includes('contadores')) {
      if (APPLY) {
        const r = await db.collection('contadores').deleteMany({});
        console.log(`  ✅ contadores             ${r.deletedCount} contadores eliminados`);
      } else {
        const conts = await db.collection('contadores').find({}).toArray();
        console.log(`  🔍 Se eliminarían ${conts.length} contadores:`);
        for (const c of conts) {
          console.log(`      • ${String(c._id).padEnd(20)} = ${c.valor}`);
        }
      }
    } else {
      console.log('  ⏭️  No hay colección de contadores');
    }
  } else {
    console.log('\n🔢 Contadores: PRESERVADOS (usa --contadores para resetearlos)');
  }

  // ---- Preservadas ----
  console.log('\n🔒 Colecciones preservadas:');
  for (const nombre of COLECCIONES_PRESERVAR) {
    if (existentes.includes(nombre)) {
      const count = await db.collection(nombre).estimatedDocumentCount();
      console.log(`  • ${nombre.padEnd(22)} ${count} docs`);
    }
  }

  // ---- Reporte ----
  console.log('\n' + '═'.repeat(64));
  if (APPLY) {
    console.log(`✅ LIMPIEZA APLICADA`);
    console.log(`   ${coleccionesVaciadas} colección(es) vaciada(s)`);
    console.log(`   ${totalDocs} documento(s) eliminado(s)`);

    if (!RESET_CONTADORES) {
      console.log(`\n💡 Los contadores NO se resetearon.`);
      const conts = await db.collection('contadores').find({}).toArray();
      if (conts.length > 0) {
        console.log(`   Tus próximos documentos seguirán la numeración actual:`);
        for (const c of conts) {
          console.log(`     ${c._id}: FAC-${String(Number(c.valor) + 1).padStart(6, '0')}`);
        }
      }
    } else {
      console.log(`\n💡 Contadores reseteados. El primer documento de cada tipo`);
      console.log(`   volverá a empezar en 000001.`);
    }
  } else {
    console.log(`🧪 DRY-RUN — No se escribió nada en la BD`);
    console.log(`   Ejecuta con --apply para aplicar.`);
  }
  console.log('═'.repeat(64) + '\n');

  await client.close();
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});