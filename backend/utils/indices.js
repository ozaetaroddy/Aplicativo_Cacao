// backend/utils/indices.js
// Definición centralizada de índices. Se ejecuta en cada arranque vía
// server.js, pero solo si la versión de schema cambió.

const log = require('./logger');

const SCHEMA_VERSION = 5; // subimos a 5 por el nuevo manejo de errores

async function crearIndices(db) {
  // Índices normales (no fallan si ya existen)
  const indicesNormales = [
    // === Clientes / proveedores / productos / usuarios ===
    () => db.collection('clientes').createIndex({ ruc: 1 }, { unique: true }),
    () => db.collection('clientes').createIndex({ nombre: 1 }),
    () => db.collection('proveedores').createIndex({ ruc: 1 }, { unique: true }),
    () => db.collection('proveedores').createIndex({ nombre: 1 }),
    () => db.collection('productos').createIndex({ codigo: 1 }, { unique: true }),
    () => db.collection('productos').createIndex({ nombre: 1 }),
    () => db.collection('productos').createIndex({ categoriaId: 1 }),
    () => db.collection('productos').createIndex(
      { codigo_barras: 1 },
      { sparse: true, partialFilterExpression: { codigo_barras: { $type: 'string', $gt: '' } } }
    ),
    () => db.collection('usuarios').createIndex({ email: 1 }, { unique: true }),

    // === Auditoría ===
    () => db.collection('auditoria').createIndex({ fecha: -1 }),
    () => db.collection('auditoria').createIndex({ usuarioId: 1, fecha: -1 }),
    () => db.collection('auditoria').createIndex({ coleccion: 1, accion: 1, fecha: -1 }),

    // === Ventas ===
    () => db.collection('ventas_v2').createIndex({ fecha_emision: -1 }),
    () => db.collection('ventas_v2').createIndex({ clienteId: 1, fecha_emision: -1 }),
    () => db.collection('ventas_v2').createIndex({ estado_sri: 1 }),
    () => db.collection('ventas_v2').createIndex({ clave_acceso: 1 }, { sparse: true }),
    () => db.collection('ventas_v2').createIndex({ tipo_documento: 1, fecha_emision: -1 }),

    // === Compras ===
    () => db.collection('compras_v2').createIndex({ fecha_emision: -1 }),
    () => db.collection('compras_v2').createIndex({ proveedorId: 1, fecha_emision: -1 }),
    () => db.collection('compras_v2').createIndex({ estado_pago: 1 }),
    () => db.collection('compras_v2').createIndex({ tipo_compra: 1, fecha_emision: -1 }),

    // === Periodos / backups ===
    () => db.collection('periodos_cerrados').createIndex({ anio: 1, mes: 1 }, { unique: true }),
    () => db.collection('backups').createIndex({ fecha: -1 }),
    () => db.collection('backups').createIndex({ tipo: 1, fecha: -1 }),
    () => db.collection('backup_lock').createIndex({ expira: 1 }),

    // === Kardex / retenciones ===
    () => db.collection('kardex').createIndex({ productoId: 1, fecha: -1 }),
    () => db.collection('kardex').createIndex({ referencia_id: 1, referencia_tipo: 1 }),
    () => db.collection('kardex').createIndex({ fecha: -1, tipo_movimiento: 1 }),
    () => db.collection('retenciones').createIndex({ fecha_emision: -1 }),
    () => db.collection('retenciones').createIndex({ compraId: 1 }),

    // === Pagos ===
    () => db.collection('pagos').createIndex({ fecha: -1 }),
    () => db.collection('pagos').createIndex({ tipo: 1, fecha: -1 }),
    () => db.collection('pagos').createIndex({ clienteId: 1, fecha: -1 }),
    () => db.collection('pagos').createIndex({ proveedorId: 1, fecha: -1 }),
    () => db.collection('pagos').createIndex({ ventaId: 1 }),
    () => db.collection('pagos').createIndex({ compraId: 1 }),
    () => db.collection('pagos').createIndex({ anulado: 1, fecha: -1 }),

    // === Refresh tokens (auth) ===
    () => db.collection('refresh_tokens').createIndex({ tokenHash: 1 }, { unique: true }),
    () => db.collection('refresh_tokens').createIndex({ userId: 1 }),
    () => db.collection('refresh_tokens').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'ttl_refresh_tokens' }
    ),

    // === Cache ===
    () => db.collection('cache_consultas').createIndex({ expira: 1 }, { expireAfterSeconds: 0 })
  ];

  const resultados = await Promise.allSettled(indicesNormales.map(fn => fn()));
  const fallidos = resultados
    .map((r, i) => (r.status === 'rejected' ? { i, error: r.reason?.message } : null))
    .filter(Boolean);

  // ✅ FIX: índice único de numero_factura — intentarlo SEPARADO, con manejo
  // especial si ya hay duplicados. No debe bloquear el arranque.
  let uniqOk = true;
  let uniqError = null;
  try {
    await db.collection('ventas_v2').createIndex(
      { tipo_documento: 1, numero_factura: 1, ruc_emisor: 1 },
      {
        unique: true,
        partialFilterExpression: {
          numero_factura: { $type: 'string', $gt: '' }
        },
        name: 'uniq_tipo_numero_ruc'
      }
    );
  } catch (err) {
    uniqOk = false;
    uniqError = err.message;
    log.warn(
      { err: err.message },
      '⚠️  Índice único de numero_factura NO se pudo crear (posibles duplicados). ' +
      'Ejecuta scripts/detectar-duplicados-facturas.js'
    );
  }

  return {
    total: indicesNormales.length + 1,
    fallidos,
    uniqNumeroFactura: { ok: uniqOk, error: uniqError }
  };
}

/**
 * Solo corre crearIndices si la versión de schema cambió.
 */
async function asegurarIndices(db) {
  const meta = await db.collection('meta').findOne({ _id: 'schema' });
  if (meta?.version === SCHEMA_VERSION) {
    return { salteado: true, version: SCHEMA_VERSION };
  }

  const r = await crearIndices(db);
  await db.collection('meta').updateOne(
    { _id: 'schema' },
    { $set: { version: SCHEMA_VERSION, actualizado: new Date() } },
    { upsert: true }
  );
  return { salteado: false, version: SCHEMA_VERSION, ...r };
}

module.exports = { crearIndices, asegurarIndices, SCHEMA_VERSION };