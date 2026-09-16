// backend/scripts/reporte-ventas-csv.js
// ============================================================
// Exporta ventas de un rango a CSV (útil para contabilidad).
// ------------------------------------------------------------
// Uso:
//   node scripts/reporte-ventas-csv.js --desde=2025-01-01 --hasta=2025-01-31
//   node scripts/reporte-ventas-csv.js --desde=2025-01-01 --hasta=2025-01-31 --out=enero.csv
//   node scripts/reporte-ventas-csv.js --desde=... --hasta=... --tipo=factura
//
// Salida por defecto: ventas_YYYYMMDD_HHMMSS.csv en CWD.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { run, log, ok, warn, auditar } = require('./_utils');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const TIPOS_VALIDOS = [
  'factura', 'nota_credito', 'nota_debito',
  'guia_remision', 'retencion', 'liquidacion', 'exportacion'
];

// ============================================================
// CSV HELPERS
// ============================================================
function escapar(valor) {
  if (valor === null || valor === undefined) return '';
  const s = String(valor);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fechaISO(d) {
  if (!d) return '';
  try { return new Date(d).toISOString().slice(0, 10); }
  catch { return ''; }
}

// ============================================================
// MAIN
// ============================================================
async function main({ db, args }) {
  const { desde, hasta, kv } = args;

  if (!desde || !hasta) {
    warn('Se requieren --desde y --hasta (formato YYYY-MM-DD)');
    process.exitCode = 1;
    return;
  }

  const inicio = new Date(desde);
  const fin = new Date(hasta);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    warn('Fechas inválidas');
    process.exitCode = 1;
    return;
  }
  fin.setHours(23, 59, 59, 999);

  const tipoFiltro = kv.tipo ? String(kv.tipo).trim() : null;
  if (tipoFiltro && !TIPOS_VALIDOS.includes(tipoFiltro)) {
    warn(`Tipo inválido: ${tipoFiltro}. Válidos: ${TIPOS_VALIDOS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const match = { fecha_emision: { $gte: inicio, $lte: fin } };
  if (tipoFiltro) match.tipo_documento = tipoFiltro;

  log(`📅 Rango: ${desde} → ${hasta}`);
  if (tipoFiltro) log(`🏷️  Tipo: ${tipoFiltro}`);

  const cursor = db.collection('ventas_v2').aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'clientes',
        localField: 'clienteId',
        foreignField: '_id',
        as: 'cliente',
        pipeline: [{ $project: { nombre: 1, ruc: 1 } }]
      }
    },
    { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
    { $sort: { fecha_emision: 1, _id: 1 } }
  ]);

  const columnas = [
    'fecha_emision', 'tipo_documento', 'numero_factura',
    'cliente_nombre', 'cliente_ruc',
    'subtotal', 'iva', 'total',
    'estado_pago', 'monto_pagado',
    'estado_sri', 'clave_acceso', 'numero_autorizacion'
  ];

  const nombreArchivo = kv.out
    ? String(kv.out)
    : `ventas_${new Date().toISOString().replace(/[:.-]/g, '').slice(0, 15)}.csv`;
  const rutaSalida = path.isAbsolute(nombreArchivo)
    ? nombreArchivo
    : path.join(process.cwd(), nombreArchivo);

  const stream = fs.createWriteStream(rutaSalida, { encoding: 'utf8' });
  // BOM para que Excel abra bien acentos.
  stream.write('\uFEFF');
  stream.write(columnas.join(',') + '\n');

  let total = 0;
  let procesados = 0;

  while (await cursor.hasNext()) {
    const v = await cursor.next();
    procesados++;

    const fila = [
      fechaISO(v.fecha_emision),
      v.tipo_documento || '',
      v.numero_factura || '',
      v.cliente?.nombre || '',
      v.cliente?.ruc || '',
      Number(v.subtotal) || 0,
      Number(v.iva) || 0,
      Number(v.total) || 0,
      v.estado_pago || '',
      Number(v.monto_pagado) || 0,
      v.estado_sri || '',
      v.clave_acceso || '',
      v.numero_autorizacion || ''
    ];

    total += Number(v.total) || 0;
    stream.write(fila.map(escapar).join(',') + '\n');
  }

  await new Promise(resolve => stream.end(resolve));

  const stats = fs.statSync(rutaSalida);

  log('');
  log('─'.repeat(60));
  ok(`📄 ${procesados} ventas exportadas`);
  log(`💰 Total: $${total.toFixed(2)}`);
  log(`📁 Archivo: ${rutaSalida}`);
  log(`📦 Tamaño:  ${(stats.size / 1024).toFixed(1)} KB`);

  await auditar(db, {
    accion: 'reporte-ventas-csv',
    detalle: `Exportadas ${procesados} ventas`,
    meta: { desde, hasta, tipoFiltro, archivo: rutaSalida, total, procesados }
  });
}

run(main).catch(err => { console.error('❌ Error fatal:', err); process.exit(1); });