// backend/tests/indices.test.js
// ============================================================
// Tests para utils/indices.js
// Cubren las definiciones y helpers puros. Los tests que
// requieren Mongo corren solo si `TEST_MONGO_URI` está presente.
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  SCHEMA_VERSION,
  INDICES,
  CONFIG,
  _CONFIG
} = require('../utils/indices');

// ============================================================
// CONSTANTES
// ============================================================
describe('indices · constantes', () => {
  test('SCHEMA_VERSION es un entero positivo', () => {
    assert.ok(Number.isInteger(SCHEMA_VERSION));
    assert.ok(SCHEMA_VERSION > 0);
  });

  test('SCHEMA_VERSION coincide con CONFIG', () => {
    assert.equal(SCHEMA_VERSION, CONFIG.schemaVersion);
  });

  test('coleccionMeta tiene valor', () => {
    assert.equal(CONFIG.coleccionMeta, 'meta');
    assert.equal(CONFIG.docMetaId, 'schema');
  });
});

// ============================================================
// DEFINICIÓN DE ÍNDICES
// ============================================================
describe('indices · INDICES', () => {
  test('es un array no vacío', () => {
    assert.ok(Array.isArray(INDICES));
    assert.ok(INDICES.length > 0);
  });

  test('cada índice tiene coleccion y key', () => {
    for (const idx of INDICES) {
      assert.ok(idx.coleccion, `Índice sin coleccion: ${JSON.stringify(idx)}`);
      assert.ok(idx.key, `Índice sin key: ${JSON.stringify(idx)}`);
      assert.ok(typeof idx.key === 'object');
      assert.ok(Object.keys(idx.key).length > 0);
    }
  });

  test('todos los índices tienen nombre explícito (excepto text)', () => {
    const sinNombre = INDICES.filter(i => !i.opts?.name);
    // Permitimos que los text indexes no tengan name si aún así son
    // únicos por colección — pero en nuestro código todos lo tienen.
    assert.equal(sinNombre.length, 0, `Índices sin name: ${sinNombre.map(i => i.coleccion).join(', ')}`);
  });

  test('nombres son únicos por colección', () => {
    const vistos = new Set();
    for (const idx of INDICES) {
      if (!idx.opts?.name) continue;
      const clave = `${idx.coleccion}::${idx.opts.name}`;
      assert.ok(!vistos.has(clave), `Nombre duplicado: ${clave}`);
      vistos.add(clave);
    }
  });

  test('los índices únicos tienen partialFilterExpression o son seguros', () => {
    const unicos = INDICES.filter(i => i.opts?.unique);
    for (const idx of unicos) {
      const esSeguro =
        idx.opts.partialFilterExpression ||
        idx.opts.sparse ||
        ['usuarios_email_unique', 'periodos_anio_mes_unique', 'refresh_hash_unique'].includes(idx.opts.name);
      assert.ok(
        esSeguro,
        `Índice único sin partialFilterExpression ni sparse: ${idx.opts.name}`
      );
    }
  });

  test('los índices con expireAfterSeconds son TTL', () => {
    const ttl = INDICES.filter(i => i.opts?.expireAfterSeconds !== undefined);
    assert.ok(ttl.length >= 2, 'Debería haber al menos 2 TTL indexes');
    const nombres = ttl.map(i => i.opts.name);
    assert.ok(nombres.includes('refresh_ttl'));
    assert.ok(nombres.includes('cache_consultas_ttl'));
  });

  test('hay índice único de numero_factura', () => {
    const uniq = INDICES.find(i => i.opts?.name === 'ventas_numero_ruc_unique');
    assert.ok(uniq);
    assert.equal(uniq.opts.unique, true);
    assert.deepEqual(uniq.key, { tipo_documento: 1, numero_factura: 1, ruc_emisor: 1 });
  });

  test('hay índice único de clave_acceso', () => {
    const uniq = INDICES.find(i => i.opts?.name === 'ventas_clave_unique');
    assert.ok(uniq);
    assert.equal(uniq.opts.unique, true);
  });

  test('hay migraciones para productos y categorías', () => {
    const prodMigrar = INDICES.find(i => i.coleccion === 'productos' && i.migrar);
    assert.ok(prodMigrar, 'Falta migración de productos');
    const catMigrar = INDICES.find(i => i.coleccion === 'categorias' && i.migrar);
    assert.ok(catMigrar, 'Falta migración de categorías');
  });

  test('los índices text tienen default_language=none', () => {
    const text = INDICES.filter(i => Object.values(i.key).includes('text'));
    assert.ok(text.length > 0);
    for (const t of text) {
      assert.equal(t.opts.default_language, 'none');
    }
  });
});

// ============================================================
// TEST INTEGRACIÓN (con Mongo real, opcional)
// ============================================================
const MONGO_URI = process.env.TEST_MONGO_URI;

describe('indices · integración (requiere TEST_MONGO_URI)', { skip: !MONGO_URI }, () => {
  let client;
  let db;

  test('setup', async () => {
    const { MongoClient } = require('mongodb');
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(`test_indices_${Date.now()}`);
  });

  test('crearIndices es idempotente', async () => {
    const r1 = await require('../utils/indices').crearIndices(db);
    assert.ok(r1.creados > 0);
    assert.equal(r1.fallidos.length, 0);

    const r2 = await require('../utils/indices').crearIndices(db);
    assert.equal(r2.creados, 0);
    assert.equal(r2.existentes, r1.creados);
  });

  test('dry-run no crea nada', async () => {
    const db2 = client.db(`test_dry_${Date.now()}`);
    const r = await require('../utils/indices').crearIndices(db2, { dryRun: true });
    assert.equal(r.creados, 0);
    const indices = await db2.collection('clientes').indexes();
    // Solo el _id por defecto.
    assert.equal(indices.length, 1);
  });

  test('asegurarIndices persiste la versión', async () => {
    const db3 = client.db(`test_aseg_${Date.now()}`);
    const r1 = await require('../utils/indices').asegurarIndices(db3);
    assert.equal(r1.salteado, false);

    const r2 = await require('../utils/indices').asegurarIndices(db3);
    assert.equal(r2.salteado, true);
    assert.equal(r2.version, SCHEMA_VERSION);
  });

  test('resetearMeta permite forzar rebuild', async () => {
    const db4 = client.db(`test_reset_${Date.now()}`);
    await require('../utils/indices').asegurarIndices(db4);
    const ok = await require('../utils/indices').resetearMeta(db4);
    assert.equal(ok, true);

    const r = await require('../utils/indices').asegurarIndices(db4);
    assert.equal(r.salteado, false);
  });

  test('only filtra por colección', async () => {
    const db5 = client.db(`test_only_${Date.now()}`);
    const r = await require('../utils/indices').crearIndices(db5, { only: ['usuarios'] });
    // Solo debe tocar usuarios.
    const usuariosIdx = await db5.collection('usuarios').indexes();
    assert.ok(usuariosIdx.some(i => i.name === 'usuarios_email_unique'));
    // clientes no debe tener índices aún.
    const clientesIdx = await db5.collection('clientes').indexes();
    assert.equal(clientesIdx.length, 1);
    // Y el resultado total debe coincidir con los de usuarios.
    assert.ok(r.total < INDICES.length);
  });

  test('cleanup', async () => {
    if (client) await client.close();
  });
});