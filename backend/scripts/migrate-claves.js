// backend/scripts/migrate-claves.js
// ============================================================
// Migra facturas/comprobantes sin clave de acceso: genera clave,
// XML y (si hay certificado) firma.
// ------------------------------------------------------------
// Uso:
//   node scripts/migrate-claves.js                     (ESCRITURA)
//   node scripts/migrate-claves.js --dry-run           (solo lista)
//   node scripts/migrate-claves.js --limit=500         (tope)
//   node scripts/migrate-claves.js --confirm           (no pedir SI)
//   node scripts/migrate-claves.js --sin-backup        (no backup pre-run)
//
// 💡 Antes de escribir hace un BACKUP automático a ./backups/.
// 💡 Registra auditoría en Mongo al terminar.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { run, log, ok, warn, err, confirmar, auditar, pad, pad2 } = require('./_utils');
const { generarClaveAcceso, formatearSerie } = require('../utils/claveAcceso');
const { generarXMLComprobante } = require('../utils/xmlComprobante');
const {
  cargarCertificado,
  firmarXML,
  descifrarSecreto
} = require('../utils/firmaElectronica');
const {
  generarBackup,
  comprimirBackup
} = require('../utils/backup');

// ============================================================
// CONSTANTES
// ============================================================
const TIPO_COMPROBANTE_SRI = Object.freeze({
  factura: '01',
  liquidacion: '03',
  nota_credito: '04',
  nota_debito: '05',
  guia_remision: '06',
  retencion: '07',
  exportacion: '01',
  reembolso: '01'
});
const DOCS_CON_CLAVE = Object.keys(TIPO_COMPROBANTE_SRI);

// ============================================================
// HELPERS
// ============================================================
function cargarPems(certDoc) {
  if (!certDoc) return null;
  try {
    const password = certDoc.password_cifrado
      ? descifrarSecreto(certDoc.password_cifrado)
      : certDoc.password;
    const p12Buffer = Buffer.from(certDoc.archivo_base64, 'base64');
    const { privateKeyPem, certificatePem } = cargarCertificado(p12Buffer, password);
    return { privateKeyPem, certificatePem };
  } catch (e) {
    warn(`No se pudo cargar el certificado: ${e.message}`);
    return null;
  }
}

/** Extrae el secuencial, tolerando datos corruptos. */
function extraerSecuencialDirecto(venta) {
  if (venta.secuencial_sri) {
    const s = String(venta.secuencial_sri).replace(/\D/g, '');
    if (s) {
      const n = parseInt(s, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  if (typeof venta.numero_factura === 'string' && venta.numero_factura.trim()) {
    const match = venta.numero_factura.match(/(\d+)/g);
    if (match) {
      const n = parseInt(match[match.length - 1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function numeroParaLog(venta) {
  if (typeof venta.numero_factura === 'string' && venta.numero_factura.trim()) {
    return pad(venta.numero_factura, 22);
  }
  return pad(`(id:${String(venta._id).slice(-8)})`, 22);
}

/** Guarda un backup pre-run y devuelve la ruta. */
async function backupPreRun(db) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ruta = path.join(dir, `pre-migrate-claves_${stamp}.json.gz`);

  const snap = await generarBackup(db);
  const buf = comprimirBackup(snap);
  fs.writeFileSync(ruta, buf);

  return ruta;
}

// ============================================================
// MAIN
// ============================================================
async function main({ db, args }) {
  const { dryRun, limit, confirmado, flags } = args;
  const sinBackup = flags.has('sin-backup');

  // ---- Configuración empresa ----
  const config = await db.collection('configuracion').findOne({ _id: 'empresa' });
  if (!config?.ruc || String(config.ruc).length !== 13) {
    err('No hay configuración de empresa con RUC válido (13 dígitos)');
    process.exitCode = 1;
    return;
  }

  // ---- Certificado (opcional) ----
  const certDoc = await db.collection('certificados').findOne({ _id: 'empresa' });
  const pems = cargarPems(certDoc);
  if (!pems) {
    warn('Sin certificado: se generarán claves y XML pero SIN firma');
  }

  // ---- Universo a migrar ----
  let cursor = db.collection('ventas_v2').find({
    tipo_documento: { $in: DOCS_CON_CLAVE },
    estado_sri: { $ne: 'AUTORIZADO' },
    $or: [
      { clave_acceso: '' },
      { clave_acceso: { $exists: false } },
      { clave_acceso: null }
    ]
  }).sort({ _id: 1 });

  if (limit) cursor = cursor.limit(limit);

  const docs = await cursor.toArray();
  log(`📋 Documentos sin clave: ${docs.length}`);

  if (docs.length === 0) {
    ok('Nada por hacer');
    return;
  }

  // ---- Pre-scan de secuenciales ----
  let maxSecuencialConocido = 0;
  for (const v of docs) {
    const s = extraerSecuencialDirecto(v);
    if (s !== null && s > maxSecuencialConocido) maxSecuencialConocido = s;
  }

  // ---- Confirmación (solo si se va a escribir) ----
  if (!dryRun) {
    log('');
    log(`📌 Plan: migrar ${docs.length} documentos`);
    log(`   Empresa: ${config.razon_social || '(sin razón social)'} — RUC ${config.ruc}`);
    log(`   Ambiente: ${config.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS'}`);
    log(`   Certificado: ${pems ? 'sí (se firmará)' : 'no (sin firma)'}`);
    log(`   Secuencial máximo detectado: ${maxSecuencialConocido}`);

    const ok = await confirmar('¿Ejecutar migración?', { confirmado });
    if (!ok) {
      warn('Cancelado por el usuario');
      return;
    }

    // ---- Backup pre-run ----
    if (!sinBackup) {
      log('💾 Generando backup pre-migración…');
      const ruta = await backupPreRun(db);
      ok(`Backup guardado: ${ruta}`);
    }
  }

  // ---- Procesar ----
  let exitosas = 0;
  let errores = 0;
  let maxSecuencialUsado = 0;
  const ahora = new Date();

  for (const venta of docs) {
    const etiqueta = numeroParaLog(venta);
    try {
      const tipoDoc = venta.tipo_documento || 'factura';
      const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';
      const est = venta.establecimiento || config.establecimiento || '001';
      const pe = venta.punto_emision || config.punto_emision || '001';
      const serie = formatearSerie(est, pe);

      let sec = extraerSecuencialDirecto(venta);
      if (sec === null) {
        maxSecuencialConocido++;
        sec = maxSecuencialConocido;
      }
      if (sec > maxSecuencialUsado) maxSecuencialUsado = sec;

      const claveAcceso = generarClaveAcceso({
        fechaEmision: new Date(venta.fecha_emision),
        tipoComprobante: codigoSRI,
        ruc: config.ruc,
        ambiente: config.ambiente || '1',
        serie,
        secuencial: sec,
        tipoEmision: config.tipo_emision || '1'
      });

      const cliente = venta.clienteId
        ? await db.collection('clientes').findOne({ _id: venta.clienteId })
        : null;

      const ventaParaXml = {
        ...venta,
        clave_acceso: claveAcceso,
        serie,
        secuencial_sri: String(sec).padStart(9, '0'),
        ruc_emisor: config.ruc,
        razon_social_emisor: config.razon_social || ''
      };
      const xml = generarXMLComprobante(ventaParaXml, cliente, config);

      let xmlFirmado = '';
      let estadoSri = 'PENDIENTE';
      if (pems) {
        try {
          xmlFirmado = firmarXML(xml, pems.privateKeyPem, pems.certificatePem);
          estadoSri = 'FIRMADO';
        } catch (e) {
          warn(`  Error firmando ${etiqueta.trim()}: ${e.message}`);
        }
      }

      if (!dryRun) {
        await db.collection('ventas_v2').updateOne(
          { _id: venta._id },
          {
            $set: {
              clave_acceso: claveAcceso,
              serie,
              secuencial_sri: String(sec).padStart(9, '0'),
              ruc_emisor: config.ruc,
              razon_social_emisor: config.razon_social || '',
              ambiente_sri: config.ambiente || '1',
              xml_generado: xml,
              xml_firmado: xmlFirmado,
              estado_sri: estadoSri,
              updatedAt: ahora
            }
          }
        );
      }

      const flag = dryRun ? '🔍' : '✅';
      log(`${flag} ${etiqueta} ${claveAcceso} ${estadoSri}`);
      exitosas++;
    } catch (e) {
      err(`${etiqueta} ${e.message}`);
      errores++;
    }
  }

  // ---- Actualizar contador ----
  if (!dryRun && maxSecuencialUsado > 0) {
    await db.collection('contadores').updateOne(
      { _id: 'factura' },
      { $max: { valor: maxSecuencialUsado }, $set: { updatedAt: ahora } },
      { upsert: true }
    );
    ok(`🔢 Contador 'factura' ajustado a ${maxSecuencialUsado}`);
  }

  // ---- Reporte final ----
  log('');
  log('─'.repeat(60));
  ok(`🏁 Exitosas: ${exitosas} | Errores: ${errores}`);
  if (dryRun) warn('(Dry-run: no se escribió nada)');

  if (!dryRun) {
    await auditar(db, {
      accion: 'migrate-claves',
      detalle: `${exitosas} exitosas, ${errores} errores. Contador factura en ${maxSecuencialUsado}`,
      meta: {
        exitosas,
        errores,
        maxSecuencialUsado,
        total: docs.length,
        conCertificado: Boolean(pems)
      }
    });
  }
}

run(main).catch(e => { console.error('❌ Error fatal:', e); process.exit(1); });