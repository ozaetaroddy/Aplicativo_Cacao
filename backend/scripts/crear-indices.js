// backend/scripts/crear-indices.js
// ============================================================
// Crea (idempotente) TODOS los índices recomendados del sistema.
// ------------------------------------------------------------
// Uso:
//   node scripts/crear-indices.js
//   node scripts/crear-indices.js --dry-run    (solo reporta)
//   node scripts/crear-indices.js --only=ventas_v2,usuarios
//
// Es IDEMPOTENTE: si el índice ya existe con la misma definición,
// no hace nada. Si existe con otra, lo reporta como warning.
// ============================================================
'use strict';

const { run, log, ok, warn, auditar } = require('./_utils');

/**
 * Definición de índices por colección.
 * `key` → objeto de índice
 * `opts` → opciones de createIndex (unique, sparse, name, etc.)
 */
const INDICES = {
  usuarios: [
    { key: { email: 1 }, opts: { unique: true, name: 'usuarios_email_unique' } },
    { key: { rol: 1, activo: 1 }, opts: { name: 'usuarios_rol_activo' } },
    { key: { createdAt: -1 }, opts: { name: 'usuarios_createdAt' } }
  ],

  clientes: [
    { key: { ruc: 1 }, opts: { unique: true, sparse: true, name: 'clientes_ruc_unique' } },
    { key: { nombre: 1 }, opts: { name: 'clientes_nombre' } }
  ],

  proveedores: [
    { key: { ruc: 1 }, opts: { unique: true, sparse: true, name: 'proveedores_ruc_unique' } },
    { key: { nombre: 1 }, opts: { name: 'proveedores_nombre' } }
  ],

  productos: [
    { key: { codigoNorm: 1 },             opts: { unique: true, sparse: true, name: 'productos_codigo_unique' } },
    { key: { nombreNorm: 1 },             opts: { unique: true, sparse: true, name: 'productos_nombre_unique' } },
    { key: { codigoBarrasNorm: 1 },       opts: { unique: true, sparse: true, name: 'productos_codigo_barras_unique' } },
    { key: { estado: 1, nombre: 1 },      opts: { name: 'productos_estado_nombre' } },
    { key: { categoriaId: 1, estado: 1 }, opts: { name: 'productos_categoria_estado' } },
    { key: { stock: 1, stock_minimo: 1 }, opts: { name: 'productos_stock' } }
  ],

  categorias: [
    { key: { nombreNorm: 1 }, opts: { unique: true, sparse: true, name: 'categorias_nombre_unique' } }
  ],

  ventas_v2: [
    { key: { tipo_documento: 1, fecha_emision: -1, _id: -1 },
      opts: { name: 'ventas_tipo_fecha' } },
    { key: { clave_acceso: 1 },
      opts: { unique: true, sparse: true, name: 'ventas_clave_unique' } },
    { key: { tipo_documento: 1, numero_factura: 1, ruc_emisor: 1 },
      opts: { unique: true, sparse: true, name: 'ventas_numero_ruc_unique' } },
    { key: { clienteId: 1, fecha_emision: -1 },
      opts: { name: 'ventas_cliente_fecha' } },
    { key: { estado_sri: 1 },
      opts: { name: 'ventas_estado_sri' } },
    { key: { estado_sri: 1, xml_firmado: 1, clave_acceso: 1 },
      opts: { name: 'ventas_sri_lote' } },
    { key: { estado_pago: 1, fecha_emision: -1 },
      opts: { name: 'ventas_estado_pago_fecha' } },
    { key: { mensajes_error_sri: 1 },
      opts: { name: 'ventas_sri_errores', sparse: true } }
  ],

  compras_v2: [
    { key: { fecha_emision: -1, _id: -1 },
      opts: { name: 'compras_fecha_id' } },
    { key: { proveedorId: 1, fecha_emision: -1 },
      opts: { name: 'compras_proveedor_fecha' } },
    { key: { tipo_compra: 1, fecha_emision: -1 },
      opts: { name: 'compras_tipo_fecha' } }
  ],

  pagos: [
    { key: { tipo: 1, anulado: 1, fecha: -1 },
      opts: { name: 'pagos_tipo_anulado_fecha' } },
    { key: { clienteId: 1, anulado: 1, fecha: 1 },
      opts: { name: 'pagos_cliente' } },
    { key: { proveedorId: 1, anulado: 1, fecha: 1 },
      opts: { name: 'pagos_proveedor' } },
    { key: { ventaId: 1, anulado: 1 },
      opts: { name: 'pagos_venta' } },
    { key: { compraId: 1, anulado: 1 },
      opts: { name: 'pagos_compra' } }
  ],

  kardex: [
    { key: { productoId: 1, fecha: 1, _id: 1 },
      opts: { name: 'kardex_producto_fecha' } },
    { key: { referencia_id: 1, referencia_tipo: 1 },
      opts: { name: 'kardex_referencia' } }
  ],

  retenciones: [
    { key: { fecha_emision: -1, _id: -1 },
      opts: { name: 'retenciones_fecha_id' } },
    { key: { proveedorId: 1, fecha_emision: -1 },
      opts: { name: 'retenciones_proveedor' } },
    { key: { compraId: 1, tipo_retencion: 1, impuesto_retencion: 1, anulado: 1 },
      opts: { name: 'retenciones_dedup' } }
  ],

  contadores: [
    { key: { updatedAt: -1 },
      opts: { name: 'contadores_updatedAt', sparse: true } }
  ],

  periodos_cerrados: [
    { key: { anio: 1, mes: 1 },
      opts: { unique: true, name: 'periodos_anio_mes_unique' } }
  ],

  auditoria: [
    { key: { fecha: -1 },                  opts: { name: 'auditoria_fecha' } },
    { key: { coleccion: 1, fecha: -1 },    opts: { name: 'auditoria_coleccion' } },
    { key: { usuarioEmail: 1, fecha: -1 }, opts: { name: 'auditoria_usuario' } }
  ],

  cache_consultas: [
    { key: { expira: 1 }, opts: { expireAfterSeconds: 0, name: 'cache_ttl' } }
  ],

  refresh_tokens: [
    { key: { tokenHash: 1 }, opts: { unique: true, name: 'refresh_hash_unique' } },
    { key: { userId: 1 },    opts: { name: 'refresh_user' } },
    { key: { familyId: 1 },  opts: { name: 'refresh_family' } },
    { key: { expiresAt: 1 }, opts: { expireAfterSeconds: 0, name: 'refresh_ttl' } }
  ]
};

async function main({ db, args }) {
  const { dryRun, only } = args;
  const colecciones = only && only.length > 0
    ? Object.keys(INDICES).filter(c => only.includes(c))
    : Object.keys(INDICES);

  if (colecciones.length === 0) {
    warn('Ninguna colección seleccionada con --only');
    return;
  }

  let creados = 0;
  let existentes = 0;
  let conflictos = 0;
  let errores = 0;

  for (const colName of colecciones) {
    log(`📂 ${colName}`);
    const definiciones = INDICES[colName];
    const col = db.collection(colName);

    let actuales = [];
    try {
      actuales = await col.indexes();
    } catch (e) {
      warn(`  No se pudieron leer índices: ${e.message}`);
      errores++;
      continue;
    }
    const porNombre = new Map(actuales.map(i => [i.name, i]));

    for (const def of definiciones) {
      const nombre = def.opts.name;

      if (porNombre.has(nombre)) {
        existentes++;
        continue;
      }

      if (dryRun) {
        log(`  [dry-run] Crearía ${nombre}`);
        continue;
      }

      try {
        await col.createIndex(def.key, def.opts);
        ok(`  ➕ ${nombre}`);
        creados++;
      } catch (e) {
        if (e.code === 11000 || /duplicate key/i.test(e.message)) {
          warn(`  ⚠️  ${nombre}: hay duplicados que impiden crear el índice único`);
          warn(`     Corre "node scripts/detectar-duplicados-facturas.js" o similar.`);
          conflictos++;
        } else {
          warn(`  ❌ ${nombre}: ${e.message}`);
          errores++;
        }
      }
    }
  }

  log('');
  log('─'.repeat(60));
  log(`📊 Resultado: ${creados} creados, ${existentes} ya existían, ${conflictos} conflictos, ${errores} errores`);
  if (dryRun) log('(Dry-run: no se escribió nada)');

  if (!dryRun && creados > 0) {
    await auditar(db, {
      accion: 'crear-indices',
      detalle: `${creados} índices creados en ${colecciones.length} colecciones`,
      meta: { creados, existentes, conflictos, errores, colecciones }
    });
  }
}

run(main).catch(err => { console.error('❌ Error fatal:', err); process.exit(1); });