// backend/scripts/unificar-retenciones.js
// ============================================================
// Migración one-time para unificar el sistema de retenciones:
//
//   FASE 1: Recalcular `total` y `subtotal` de retenciones en
//           `ventas_v2` que quedaron en 0 (bug histórico).
//
//   FASE 2: Migrar documentos de la colección legacy
//           `retenciones` a `ventas_v2` como documentos marcados
//           con `estado_sri='LEGACY_NO_SRI'`.
//
//   FASE 3: Reporte final + instrucciones para borrar la colección
//           legacy.
//
// Uso:
//   node backend/scripts/unificar-retenciones.js            # dry-run
//   node backend/scripts/unificar-retenciones.js --apply    # aplicar
// ============================================================
'use strict';

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME;
const APPLY = process.argv.includes('--apply');

if (!URI || !DB_NAME) {
  console.error('❌ Faltan MONGODB_URI y/o DB_NAME en el entorno');
  process.exit(1);
}

function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

async function main() {
  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log(`\n🔌 Conectado a "${DB_NAME}"`);
  console.log(`🧪 Modo: ${APPLY ? '⚠️  APLICAR (escribe en BD)' : '🔍 DRY-RUN (solo lectura)'}`);
  console.log('═'.repeat(64));

  // ============================================================
  // FASE 1 — Recalcular totales en `ventas_v2`
  // ============================================================
  console.log('\n📊 FASE 1: Recalcular total/subtotal en `ventas_v2`');
  console.log('─'.repeat(64));

  const retsV2 = await db.collection('ventas_v2').find({
    tipo_documento: 'retencion',
    $or: [
      { total: 0 },
      { total: { $exists: false } },
      { total: null }
    ],
    impuestos_retencion: { $exists: true, $ne: [] }
  }).toArray();

  console.log(`  Encontradas: ${retsV2.length} retención(es) con total=0`);

  let actualizadasV2 = 0;
  for (const r of retsV2) {
    const total = round2(
      (r.impuestos_retencion || []).reduce(
        (s, x) => s + (Number(x.valorRetenido) || 0), 0
      )
    );
    const subtotal = round2(
      (r.impuestos_retencion || []).reduce(
        (s, x) => s + (Number(x.baseImponible) || 0), 0
      )
    );

    const patch = { total, subtotal };
    if (r.estado_pago !== 'pagado') patch.estado_pago = 'pagado';

    console.log(
      `  • ${r.numero_factura || String(r._id).slice(-8)} → ` +
      `total=$${total.toFixed(2)} subtotal=$${subtotal.toFixed(2)}`
    );

    if (APPLY) {
      await db.collection('ventas_v2').updateOne(
        { _id: r._id },
        { $set: { ...patch, updatedAt: new Date() } }
      );
      actualizadasV2++;
    }
  }

  // ============================================================
  // FASE 2 — Migrar colección legacy `retenciones`
  // ============================================================
  console.log('\n📊 FASE 2: Migrar colección legacy `retenciones`');
  console.log('─'.repeat(64));

  const colLegacyExists = await db.listCollections({ name: 'retenciones' }).hasNext();

  if (!colLegacyExists) {
    console.log('  ⏭️  Colección `retenciones` no existe — nada que migrar');
  } else {
    const retsLegacy = await db.collection('retenciones').find({}).toArray();
    console.log(`  Encontradas: ${retsLegacy.length} retención(es) legacy`);

    let migradas = 0;
    let omitidas = 0;
    let errores = 0;

    for (const r of retsLegacy) {
      // Normalizar impuestos al shape de ventas_v2
      const impuestos = [];
      if (r.tipo_retencion) {
        const impuestoDecl = String(r.impuesto_retencion || 'RENTA').toUpperCase();
        impuestos.push({
          codigo: impuestoDecl === 'IVA' ? '2' : '1',
          codigoRetencion: String(r.tipo_retencion || '').trim(),
          impuesto: impuestoDecl,
          concepto: '',
          baseImponible: round2(r.base_imponible || 0),
          porcentajeRetener: round2(r.porcentaje || 0),
          valorRetenido: round2(r.valor_retenido || 0),
          codigoDocumento: '01',
          numeroDocumento: r.numero_factura || '',
          fechaEmisionDocSustento: r.fecha_emision
            ? new Date(r.fecha_emision).toISOString().slice(0, 10)
            : ''
        });
      }

      const doc = {
        _id: r._id,
        clienteId: r.proveedorId || null,
        proveedorId: r.proveedorId || null,

        numero_factura: r.numero_factura || `RET-LEGACY-${String(r._id).slice(-6)}`,
        fecha_emision: r.fecha_emision || new Date(),
        tipo_documento: 'retencion',
        detalles: [],
        subtotal: round2(r.base_imponible || r.valor_retenido || 0),
        iva: 0,
        total: round2(r.valor_retenido || 0),

        impuestos_retencion: impuestos,
        total_retenido: round2(r.valor_retenido || 0),

        // Documento legacy → sin SRI
        clave_acceso: '',
        numero_autorizacion: '',
        estado_sri: 'LEGACY_NO_SRI',
        ambiente_sri: '1',

        // Metadata de migración
        es_legacy: true,
        legacy_id: r._id,
        legacy_created_at: r.createdAt || null,
        compra_origen_id: r.compraId || null,
        observaciones: r.observaciones || 'Migrada desde colección legacy',
        estado_pago: 'pagado',
        monto_pagado: 0,
        createdAt: r.createdAt || new Date(),
        updatedAt: new Date()
      };

      console.log(
        `  • ${doc.numero_factura} → total=$${doc.total.toFixed(2)} ` +
        `(${doc.impuestos_retencion.length} impuesto(s))`
      );

      if (APPLY) {
        try {
          await db.collection('ventas_v2').insertOne(doc);
          migradas++;
        } catch (e) {
          if (e.code === 11000) {
            console.log(`    ↳ ya existe en ventas_v2, se omite`);
            omitidas++;
          } else {
            console.error(`    ↳ ERROR: ${e.message}`);
            errores++;
          }
        }
      }
    }

    if (APPLY) {
      console.log(`\n  ✅ Migradas: ${migradas} · Omitidas: ${omitidas} · Errores: ${errores}`);
    }
  }

  // ============================================================
  // FASE 3 — Reporte final
  // ============================================================
  console.log('\n' + '═'.repeat(64));
  if (APPLY) {
    console.log(`✅ MIGRACIÓN APLICADA`);
    console.log(`   • ${actualizadasV2} retención(es) con total recalculado`);
    console.log(`   • Colección \`retenciones\` migrada a \`ventas_v2\``);
    console.log(`\n💡 Ya puedes eliminar la colección legacy:`);
    console.log(`   db.retenciones.drop()`);
    console.log(`\n⚠️  Reinicia el backend para que cargue la nueva config.`);
  } else {
    console.log(`🧪 DRY-RUN — No se escribió nada en la BD`);
    console.log(`   Vuelve a ejecutar con --apply para aplicar los cambios.`);
  }
  console.log('═'.repeat(64) + '\n');

  await client.close();
}

main().catch((e) => {
  console.error('❌ Error fatal:', e);
  process.exit(1);
});