// backend/utils/indices.js
// ============================================================
// Definición centralizada de índices Mongo
// ------------------------------------------------------------
// Se ejecuta al arrancar (server.js → asegurarIndices), pero solo
// si la versión de schema cambió (o si se fuerza con env).
//
// Convenciones:
//   - Todos los índices tienen nombre explícito: `<col>_<campos>`.
//   - Se usa `background: true` para no bloquear en prod.
//   - Los `partialFilterExpression` filtran strings vacíos.
//   - Cada índice incluye metadata para diagnósticos.
//
// Uso:
//   const { crearIndices, asegurarIndices } = require('./utils/indices');
//   await asegurarIndices(db);                          // al arrancar
//   await crearIndices(db, { dryRun: true });           // solo reportar
//   await crearIndices(db, { only: ['ventas_v2'] });    // una colección
// ============================================================
'use strict';

const log = require('./logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
function envBool(nombre, fallback = false) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

const CONFIG = Object.freeze({
  /**
   * Versión del schema de índices. Subir cuando agregues o cambies
   * un índice de forma no aditiva.
   *
   * ⚠️  Incrementar requiere revisar los índices viejos que ya no
   *     existan en este archivo (Mongo no los borra automáticamente).
   */
  schemaVersion: 10,

  /** Nombre de la colección donde se persiste la versión aplicada. */
  coleccionMeta: 'meta',
  docMetaId: 'schema',

  /** Forzar la recreación aunque la versión no haya cambiado. */
  forceRebuild: envBool('INDICES_FORCE_REBUILD', false),

  /** Si `true`, ningún error individual aborta el proceso. */
  tolerante: true,

  /**
   * Opciones comunes a todos los `createIndex`.
   * `background` está deprecado en Mongo 4.2+ (ahora es siempre background)
   * pero se mantiene por compatibilidad con 3.6.
   */
  optsComunes: Object.freeze({
    background: true
  })
});

// Alias de compatibilidad — el archivo exporta `SCHEMA_VERSION`.
const SCHEMA_VERSION = CONFIG.schemaVersion;

// ============================================================
// DEFINICIÓN DE ÍNDICES
// ------------------------------------------------------------
// Estructura de cada entrada:
//   { coleccion, key, opts? }
// - `key`: campos del índice
// - `opts`: opciones de createIndex (unique, sparse, name, etc.)
// - `migrar`: función opcional que corre ANTES de crear el índice.
//             Útil para rellenar campos requeridos por índices únicos.
// ============================================================

/**
 * Rellena los campos `nombreNorm`, `codigoNorm` y `codigoBarrasNorm`
 * para poder crear los índices únicos case-insensitive.
 * Solo toca documentos que no tengan esos campos.
 */
async function migrarProductosNorm(db) {
  const col = db.collection('productos');
  const faltantes = await col.countDocuments({
    $or: [
      { nombreNorm: { $exists: false } },
      { codigoNorm: { $exists: false } },
      { codigoBarrasNorm: { $exists: false } }
    ]
  });

  if (faltantes === 0) return { migrados: 0 };

  const cursor = col.find({
    $or: [
      { nombreNorm: { $exists: false } },
      { codigoNorm: { $exists: false } },
      { codigoBarrasNorm: { $exists: false } }
    ]
  }, { projection: { nombre: 1, codigo: 1, codigo_barras: 1 } });

  let migrados = 0;
  const ops = [];
  while (await cursor.hasNext()) {
    const p = await cursor.next();
    ops.push({
      updateOne: {
        filter: { _id: p._id },
        update: {
          $set: {
            nombreNorm: String(p.nombre || '').trim().toLowerCase(),
            codigoNorm: String(p.codigo || '').trim().toLowerCase(),
            codigoBarrasNorm: String(p.codigo_barras || '').trim().toLowerCase()
          }
        }
      }
    });
    migrados++;
    if (ops.length >= 500) {
      await col.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }
  if (ops.length > 0) await col.bulkWrite(ops, { ordered: false });

  return { migrados };
}

/** Migra `categorias.nombreNorm`. */
async function migrarCategoriasNorm(db) {
  const col = db.collection('categorias');
  const cursor = col.find({ nombreNorm: { $exists: false } }, { projection: { nombre: 1 } });
  let migrados = 0;
  const ops = [];
  while (await cursor.hasNext()) {
    const c = await cursor.next();
    ops.push({
      updateOne: {
        filter: { _id: c._id },
        update: { $set: { nombreNorm: String(c.nombre || '').trim().toLowerCase() } }
      }
    });
    migrados++;
    if (ops.length >= 500) {
      await col.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }
  if (ops.length > 0) await col.bulkWrite(ops, { ordered: false });
  return { migrados };
}

const INDICES = [
  // ============================================================
  // CLIENTES
  // ============================================================
  {
    coleccion: 'clientes',
    key: { ruc: 1 },
    opts: {
      unique: true,
      name: 'clientes_ruc_unique',
      partialFilterExpression: { ruc: { $type: 'string', $gt: '' } }
    }
  },
  {
    coleccion: 'clientes',
    key: { nombre: 1 },
    opts: { name: 'clientes_nombre' }
  },
  {
    coleccion: 'clientes',
    key: { createdAt: -1 },
    opts: { name: 'clientes_createdAt' }
  },

  // ============================================================
  // PROVEEDORES
  // ============================================================
  {
    coleccion: 'proveedores',
    key: { ruc: 1 },
    opts: {
      unique: true,
      name: 'proveedores_ruc_unique',
      partialFilterExpression: { ruc: { $type: 'string', $gt: '' } }
    }
  },
  {
    coleccion: 'proveedores',
    key: { nombre: 1 },
    opts: { name: 'proveedores_nombre' }
  },
  {
    coleccion: 'proveedores',
    key: { createdAt: -1 },
    opts: { name: 'proveedores_createdAt' }
  },

  // ============================================================
  // PRODUCTOS (con migración previa de *Norm)
  // ============================================================
  {
  coleccion: 'productos',
  key: { codigo: 1 },
  opts: {
    unique: true,
    name: 'productos_codigo_unique',
    partialFilterExpression: { codigo: { $type: 'string', $gt: '' } }
  }
},
  {
    coleccion: 'productos',
    key: { codigoNorm: 1 },
    opts: {
      unique: true,
      sparse: true,
      name: 'productos_codigoNorm_unique',
      partialFilterExpression: { codigoNorm: { $type: 'string', $gt: '' } }
    },
    migrar: migrarProductosNorm
  },
  {
    coleccion: 'productos',
    key: { nombreNorm: 1 },
    opts: {
      unique: true,
      sparse: true,
      name: 'productos_nombreNorm_unique',
      partialFilterExpression: { nombreNorm: { $type: 'string', $gt: '' } }
    }
  },
  {
    coleccion: 'productos',
    key: { codigoBarrasNorm: 1 },
    opts: {
      unique: true,
      sparse: true,
      name: 'productos_codigoBarrasNorm_unique',
      partialFilterExpression: { codigoBarrasNorm: { $type: 'string', $gt: '' } }
    }
  },
  {
    coleccion: 'productos',
    key: { nombre: 1 },
    opts: { name: 'productos_nombre' }
  },
  {
    coleccion: 'productos',
    key: { categoriaId: 1 },
    opts: { name: 'productos_categoriaId' }
  },
  {
    coleccion: 'productos',
    key: { estado: 1, nombre: 1 },
    opts: { name: 'productos_estado_nombre' }
  },
  {
    coleccion: 'productos',
    key: { stock: 1, stock_minimo: 1 },
    opts: { name: 'productos_stock' }
  },

  // ============================================================
  // CATEGORÍAS
  // ============================================================
  {
    coleccion: 'categorias',
    key: { nombreNorm: 1 },
    opts: {
      unique: true,
      sparse: true,
      name: 'categorias_nombreNorm_unique',
      partialFilterExpression: { nombreNorm: { $type: 'string', $gt: '' } }
    },
    migrar: migrarCategoriasNorm
  },

  // ============================================================
  // USUARIOS
  // ============================================================
  {
    coleccion: 'usuarios',
    key: { email: 1 },
    opts: { unique: true, name: 'usuarios_email_unique' }
  },
  {
    coleccion: 'usuarios',
    key: { rol: 1, activo: 1 },
    opts: { name: 'usuarios_rol_activo' }
  },
  {
    coleccion: 'usuarios',
    key: { createdAt: -1 },
    opts: { name: 'usuarios_createdAt' }
  },

  // ============================================================
  // AUDITORÍA
  // ============================================================
  {
    coleccion: 'auditoria',
    key: { fecha: -1 },
    opts: { name: 'auditoria_fecha' }
  },
  {
    coleccion: 'auditoria',
    key: { usuarioId: 1, fecha: -1 },
    opts: { name: 'auditoria_usuarioId' }
  },
  {
    coleccion: 'auditoria',
    key: { usuarioEmail: 1, fecha: -1 },
    opts: { name: 'auditoria_usuarioEmail' }
  },
  {
    coleccion: 'auditoria',
    key: { coleccion: 1, accion: 1, fecha: -1 },
    opts: { name: 'auditoria_coleccion_accion' }
  },

  // ============================================================
  // VENTAS
  // ============================================================
  {
    coleccion: 'ventas_v2',
    key: { fecha_emision: -1, _id: -1 },
    opts: { name: 'ventas_fecha_id' }
  },
  {
    coleccion: 'ventas_v2',
    key: { clienteId: 1, fecha_emision: -1 },
    opts: { name: 'ventas_cliente_fecha' }
  },
  {
    coleccion: 'ventas_v2',
    key: { estado_sri: 1 },
    opts: { name: 'ventas_estado_sri' }
  },
  {
    coleccion: 'ventas_v2',
    key: { estado_sri: 1, xml_firmado: 1, clave_acceso: 1 },
    opts: { name: 'ventas_sri_lote' }
  },
  {
    coleccion: 'ventas_v2',
    key: { clave_acceso: 1 },
    opts: {
      unique: true,
      sparse: true,
      name: 'ventas_clave_unique',
      partialFilterExpression: { clave_acceso: { $type: 'string', $gt: '' } }
    }
  },
  {
    coleccion: 'ventas_v2',
    key: { tipo_documento: 1, fecha_emision: -1 },
    opts: { name: 'ventas_tipo_fecha' }
  },
  {
    coleccion: 'ventas_v2',
    key: { estado_pago: 1, fecha_emision: -1 },
    opts: { name: 'ventas_estado_pago_fecha' }
  },
  {
    coleccion: 'ventas_v2',
    // Unicidad lógica: tipo + número + RUC emisor.
    key: { tipo_documento: 1, numero_factura: 1, ruc_emisor: 1 },
    opts: {
      unique: true,
      name: 'ventas_numero_ruc_unique',
      partialFilterExpression: { numero_factura: { $type: 'string', $gt: '' } }
    }
  },
  {
    coleccion: 'ventas_v2',
    key: { mensajes_error_sri: 1 },
    opts: { sparse: true, name: 'ventas_sri_errores' }
  },

  // ============================================================
  // COMPRAS
  // ============================================================
  {
    coleccion: 'compras_v2',
    key: { fecha_emision: -1, _id: -1 },
    opts: { name: 'compras_fecha_id' }
  },
  {
    coleccion: 'compras_v2',
    key: { proveedorId: 1, fecha_emision: -1 },
    opts: { name: 'compras_proveedor_fecha' }
  },
  {
    coleccion: 'compras_v2',
    key: { estado_pago: 1, fecha_emision: -1 },
    opts: { name: 'compras_estado_pago_fecha' }
  },
  {
    coleccion: 'compras_v2',
    key: { tipo_compra: 1, fecha_emision: -1 },
    opts: { name: 'compras_tipo_fecha' }
  },

  // ============================================================
  // PERÍODOS / BACKUPS
  // ============================================================
  {
    coleccion: 'periodos_cerrados',
    key: { anio: 1, mes: 1 },
    opts: { unique: true, name: 'periodos_anio_mes_unique' }
  },
  {
    coleccion: 'backups',
    key: { fecha: -1 },
    opts: { name: 'backups_fecha' }
  },
  {
    coleccion: 'backups',
    key: { tipo: 1, fecha: -1 },
    opts: { name: 'backups_tipo_fecha' }
  },
  {
    coleccion: 'backup_lock',
    key: { expira: 1 },
    opts: { name: 'backup_lock_expira' }
  },

  // ============================================================
  // KARDEX
  // ============================================================
  {
    coleccion: 'kardex',
    key: { productoId: 1, fecha: -1, _id: -1 },
    opts: { name: 'kardex_producto_fecha' }
  },
  {
    coleccion: 'kardex',
    key: { referencia_id: 1, referencia_tipo: 1 },
    opts: { name: 'kardex_referencia' }
  },
  {
    coleccion: 'kardex',
    key: { fecha: -1, tipo_movimiento: 1 },
    opts: { name: 'kardex_fecha_tipo' }
  },

  // ============================================================
  // RETENCIONES
  // ============================================================
  {
    coleccion: 'retenciones',
    key: { fecha_emision: -1, _id: -1 },
    opts: { name: 'retenciones_fecha_id' }
  },
  {
    coleccion: 'retenciones',
    key: { proveedorId: 1, fecha_emision: -1 },
    opts: { name: 'retenciones_proveedor' }
  },
  {
    coleccion: 'retenciones',
    key: { compraId: 1 },
    opts: { name: 'retenciones_compra' }
  },
  {
    coleccion: 'retenciones',
    // Detección de duplicados lógicos.
    key: { compraId: 1, tipo_retencion: 1, impuesto_retencion: 1, anulado: 1 },
    opts: { name: 'retenciones_dedup' }
  },

  // ============================================================
  // PAGOS
  // ============================================================
  {
    coleccion: 'pagos',
    key: { fecha: -1, _id: -1 },
    opts: { name: 'pagos_fecha_id' }
  },
  {
    coleccion: 'pagos',
    key: { tipo: 1, anulado: 1, fecha: -1 },
    opts: { name: 'pagos_tipo_anulado_fecha' }
  },
  {
    coleccion: 'pagos',
    key: { clienteId: 1, anulado: 1, fecha: -1 },
    opts: { name: 'pagos_cliente' }
  },
  {
    coleccion: 'pagos',
    key: { proveedorId: 1, anulado: 1, fecha: -1 },
    opts: { name: 'pagos_proveedor' }
  },
  {
    coleccion: 'pagos',
    key: { ventaId: 1, anulado: 1 },
    opts: { name: 'pagos_venta' }
  },
  {
    coleccion: 'pagos',
    key: { compraId: 1, anulado: 1 },
    opts: { name: 'pagos_compra' }
  },

  // ============================================================
  // CONTADORES
  // ============================================================
  {
    coleccion: 'contadores',
    key: { updatedAt: -1 },
    opts: { sparse: true, name: 'contadores_updatedAt' }
  },

  // ============================================================
  // REFRESH TOKENS (auth)
  // ============================================================
  {
    coleccion: 'refresh_tokens',
    key: { tokenHash: 1 },
    opts: { unique: true, name: 'refresh_hash_unique' }
  },
  {
    coleccion: 'refresh_tokens',
    key: { userId: 1 },
    opts: { name: 'refresh_user' }
  },
  {
    coleccion: 'refresh_tokens',
    key: { familyId: 1 },
    opts: { name: 'refresh_family' }
  },
  {
    coleccion: 'refresh_tokens',
    key: { expiresAt: 1 },
    opts: { expireAfterSeconds: 0, name: 'refresh_ttl' }
  },

  // ============================================================
  // CACHE CONSULTAS (TTL)
  // ============================================================
  {
    coleccion: 'cache_consultas',
    key: { expira: 1 },
    opts: { expireAfterSeconds: 0, name: 'cache_consultas_ttl' }
  },

  // ============================================================
  // TEXT INDEXES (búsqueda full-text, opcionales)
  // ============================================================
  {
    coleccion: 'clientes',
    key: { nombre: 'text', ruc: 'text', email: 'text' },
    opts: {
      name: 'clientes_text',
      default_language: 'none',
      weights: { nombre: 10, ruc: 5, email: 2 }
    }
  },
  {
    coleccion: 'proveedores',
    key: { nombre: 'text', ruc: 'text', email: 'text' },
    opts: {
      name: 'proveedores_text',
      default_language: 'none',
      weights: { nombre: 10, ruc: 5, email: 2 }
    }
  },
  {
    coleccion: 'productos',
    key: { nombre: 'text', codigo: 'text', codigo_barras: 'text' },
    opts: {
      name: 'productos_text',
      default_language: 'none',
      weights: { nombre: 10, codigo: 5, codigo_barras: 3 }
    }
  }
];

// ============================================================
// CREAR ÍNDICES
// ============================================================
/**
 * Crea todos los índices definidos, opcionalmente filtrados.
 *
 * @param {Db} db
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false]     Si `true`, no crea nada.
 * @param {string[]} [opts.only]            Solo crear índices de estas colecciones.
 * @param {boolean} [opts.tolerante]        Si `true`, los errores no abortan.
 * @returns {Promise<{
 *   total: number,
 *   creados: number,
 *   existentes: number,
 *   fallidos: Array<{ coleccion: string, nombre: string, error: string }>,
 *   migraciones: Array<{ coleccion: string, resultado: object }>,
 *   uniqNumeroFactura: { ok: boolean, error: string|null },
 *   tiempoMs: number
 * }>}
 */
async function crearIndices(db, opts = {}) {
  const {
    dryRun = false,
    only = null,
    tolerante = CONFIG.tolerante
  } = opts;

  const t0 = Date.now();
  const migraciones = [];
  const fallidos = [];
  let creados = 0;
  let existentes = 0;

  // Filtrar por colecciones si se pidió.
  const indicesAProcesar = only && only.length > 0
    ? INDICES.filter(i => only.includes(i.coleccion))
    : INDICES;

  // Agrupar por colección para leer índices existentes una vez.
  const porColeccion = new Map();
  for (const idx of indicesAProcesar) {
    if (!porColeccion.has(idx.coleccion)) porColeccion.set(idx.coleccion, []);
    porColeccion.get(idx.coleccion).push(idx);
  }

  for (const [coleccion, entradas] of porColeccion) {
    // --- Migraciones previas ---
    const migracionesUnicas = new Set();
    for (const e of entradas) {
      if (!e.migrar || migracionesUnicas.has(e.migrar)) continue;
      migracionesUnicas.add(e.migrar);
      if (dryRun) continue;

      try {
        const r = await e.migrar(db);
        if (r && r.migrados > 0) {
          migraciones.push({ coleccion, resultado: r });
          log.info({ coleccion, ...r }, '📦 Migración de campos previa a índice');
        }
      } catch (err) {
        fallidos.push({
          coleccion,
          nombre: `migracion:${e.migrar.name}`,
          error: `Migración falló: ${err.message}`
        });
        if (!tolerante) throw err;
      }
    }

    // --- Índices existentes ---
    let existentesSet;
    try {
      const actuales = await db.collection(coleccion).indexes();
      existentesSet = new Set(actuales.map(i => i.name));
    } catch (err) {
      // Colección nueva: no hay índices.
      existentesSet = new Set();
    }

    // --- Crear cada índice ---
    for (const idx of entradas) {
      const nombre = idx.opts?.name || `${coleccion}_auto_${Object.keys(idx.key).join('_')}`;

      if (existentesSet.has(nombre)) {
        existentes++;
        continue;
      }

      if (dryRun) {
        log.info({ coleccion, nombre }, '🔍 [dry-run] Crearía índice');
        continue;
      }

      try {
        await db.collection(coleccion).createIndex(idx.key, {
          ...CONFIG.optsComunes,
          ...idx.opts
        });
        creados++;
      } catch (err) {
        fallidos.push({
          coleccion,
          nombre,
          error: err.message
        });
        log.warn({ coleccion, nombre, err: err.message }, '⚠️  No se pudo crear índice');
        if (!tolerante) throw err;
      }
    }
  }

  // ============================================================
  // Índice único de numero_factura (manejado aparte por el diagnóstico)
  // ============================================================
  let uniqOk = true;
  let uniqError = null;

  // Solo verificamos si el índice crítico está presente.
  try {
    const ventasIdx = await db.collection('ventas_v2').indexes();
    uniqOk = ventasIdx.some(i => i.name === 'ventas_numero_ruc_unique');
    if (!uniqOk) {
      uniqError = 'El índice único de numero_factura no está presente';
      log.warn(
        { err: uniqError },
        '⚠️  Índice único de numero_factura NO se pudo crear (posibles duplicados). ' +
        'Ejecuta scripts/detectar-duplicados-facturas.js'
      );
    }
  } catch (err) {
    uniqOk = false;
    uniqError = err.message;
  }

  const tiempoMs = Date.now() - t0;

  return {
    total: indicesAProcesar.length,
    creados,
    existentes,
    fallidos,
    migraciones,
    uniqNumeroFactura: { ok: uniqOk, error: uniqError },
    tiempoMs
  };
}

// ============================================================
// ASEGURAR (idempotente)
// ============================================================
/**
 * Ejecuta `crearIndices` solo si la versión de schema cambió
 * (o si `INDICES_FORCE_REBUILD=true`).
 *
 * NUNCA lanza: si algo falla, se loggea y se devuelve el estado.
 *
 * @param {Db} db
 * @param {object} [opts]
 * @param {boolean} [opts.force]  Fuerza la recreación.
 * @returns {Promise<object>}
 */
async function asegurarIndices(db, opts = {}) {
  const force = opts.force ?? CONFIG.forceRebuild;

  try {
    // 1. Leer la versión aplicada.
    const meta = await db.collection(CONFIG.coleccionMeta).findOne({
      _id: CONFIG.docMetaId
    });

    if (!force && meta?.version === SCHEMA_VERSION) {
      return { salteado: true, version: SCHEMA_VERSION };
    }

    log.info(
      { version: SCHEMA_VERSION, previa: meta?.version || 'sin-registro' },
      '🔧 Verificando índices Mongo'
    );

    // 2. Crear índices.
    const r = await crearIndices(db);

    // 3. Registrar la versión aplicada.
    await db.collection(CONFIG.coleccionMeta).updateOne(
      { _id: CONFIG.docMetaId },
      {
        $set: {
          version: SCHEMA_VERSION,
          actualizado: new Date()
        }
      },
      { upsert: true }
    );

    log.info(
      {
        creados: r.creados,
        existentes: r.existentes,
        fallidos: r.fallidos.length,
        tiempoMs: r.tiempoMs
      },
      '✅ Índices verificados'
    );

    return {
      salteado: false,
      version: SCHEMA_VERSION,
      ...r
    };
  } catch (err) {
    // Tolerante: no bloqueamos el arranque por índices.
    log.error(
      { err: err.message },
      '❌ Error creando índices (el arranque continúa)'
    );
    return {
      salteado: false,
      version: SCHEMA_VERSION,
      error: err.message
    };
  }
}

// ============================================================
// ESTADO
// ============================================================
/**
 * Devuelve el estado actual de los índices para /health.
 * @param {Db} db
 */
async function getEstado(db) {
  try {
    const meta = await db.collection(CONFIG.coleccionMeta).findOne({
      _id: CONFIG.docMetaId
    });

    const colecciones = [...new Set(INDICES.map(i => i.coleccion))];
    const detalle = {};

    for (const col of colecciones) {
      try {
        const indices = await db.collection(col).indexes();
        detalle[col] = indices.map(i => ({
          name: i.name,
          key: i.key,
          unique: Boolean(i.unique),
          sparse: Boolean(i.sparse),
          expireAfterSeconds: i.expireAfterSeconds
        }));
      } catch (err) {
        detalle[col] = { error: err.message };
      }
    }

    return {
      schemaVersionActual: SCHEMA_VERSION,
      schemaVersionAplicada: meta?.version || null,
      actualizado: meta?.actualizado || null,
      definidos: INDICES.length,
      colecciones: detalle
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Fuerza que la próxima `asegurarIndices` recree los índices.
 * Borra el registro de versión de la colección `meta`.
 *
 * @param {Db} db
 */
async function resetearMeta(db) {
  try {
    await db.collection(CONFIG.coleccionMeta).deleteOne({ _id: CONFIG.docMetaId });
    return true;
  } catch (err) {
    log.warn({ err: err.message }, 'No se pudo resetear la meta de índices');
    return false;
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  crearIndices,
  asegurarIndices,
  SCHEMA_VERSION,

  // ---- Extensiones ----
  getEstado,
  resetearMeta,
  INDICES,

  // ---- Constantes ----
  CONFIG
};

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._migrarProductosNorm = migrarProductosNorm;
module.exports._migrarCategoriasNorm = migrarCategoriasNorm;