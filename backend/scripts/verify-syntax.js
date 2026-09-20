// backend/scripts/verify-syntax.js
// ============================================================
// Verifica que todos los .js del backend carguen sin errores.
// ------------------------------------------------------------
// Útil como pre-commit o step de CI. Detecta:
//   - Errores de sintaxis.
//   - Requires rotos (archivo que importa algo que no existe).
//   - Módulos que lanzan al cargar (side-effects problemáticos).
//
// Uso:
//   node scripts/verify-syntax.js
//   node scripts/verify-syntax.js --verbose
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const VERBOSE = process.argv.includes('--verbose');

const RAIZ = path.resolve(__dirname, '..');
const CARPETAS = ['middleware', 'routes', 'utils', 'data', 'scripts'];
const ARCHIVOS_SUELTOS = ['server.js'];

/** Recolecta archivos .js recursivamente. */
function recolectar(dir, base = '') {
  const out = [];
  const entradas = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entradas) {
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      out.push(...recolectar(full, rel));
    } else if (e.isFile() && e.name.endsWith('.js')) {
      out.push({ abs: full, rel });
    }
  }
  return out;
}

function main() {
  const archivos = [];

  for (const a of ARCHIVOS_SUELTOS) {
    const abs = path.join(RAIZ, a);
    if (fs.existsSync(abs)) archivos.push({ abs, rel: a });
  }

  for (const carpeta of CARPETAS) {
    const dir = path.join(RAIZ, carpeta);
    if (!fs.existsSync(dir)) continue;
    archivos.push(...recolectar(dir, carpeta));
  }

  console.log(`🔍 Verificando ${archivos.length} archivos .js...\n`);

  let ok = 0;
  const errores = [];

  for (const { abs, rel } of archivos) {
    try {
      // Envolvemos en try/catch porque algunos módulos tienen side effects
      // al cargar (ej: server.js intenta conectar a Mongo).
      // Para evitar eso, ejecutamos con NODE_ENV=test.
      delete require.cache[abs];
      require(abs);
      ok++;
      if (VERBOSE) console.log(`  ✅ ${rel}`);
    } catch (err) {
      // Ignorar errores de Mongo/red (los módulos que se conectan al cargar
      // no deberían hacerlo, pero server.js por ejemplo se puede saltar).
      const ignorable =
        /MongoNetwork|ECONNREFUSED|ENOTFOUND|JWT_SECRET|CERT_ENCRYPTION_KEY/.test(err.message);
      if (ignorable) {
        ok++;
        if (VERBOSE) console.log(`  ⚠️  ${rel} (side-effect ignorable)`);
        continue;
      }
      errores.push({ rel, err });
      console.error(`  ❌ ${rel}`);
      console.error(`     ${err.message}`);
      if (err.stack && VERBOSE) {
        console.error(`     ${err.stack.split('\n').slice(1, 3).join('\n     ')}`);
      }
    }
  }

  console.log('');
  console.log('─'.repeat(60));
  if (errores.length === 0) {
    console.log(`✅ Todos los archivos cargaron correctamente (${ok}/${archivos.length})`);
    process.exit(0);
  } else {
    console.error(`❌ ${errores.length} archivo(s) fallaron:`);
    for (const { rel, err } of errores) {
      console.error(`   · ${rel}: ${err.message}`);
    }
    process.exit(1);
  }
}

// Ejecutamos con NODE_ENV=test para minimizar side-effects
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

main();