// backend/scripts/migrate-claves.js
// Migra facturas/comprobantes sin clave de acceso: genera clave, XML y firma.
// Requiere certificado cargado y configuración de empresa válida.
//
// Uso:
//   npm run migrate:claves
//   npm run migrate:claves -- --dry-run       (solo lista, no modifica)

require('dotenv').config();
const { MongoClient } = require('mongodb');
const { generarClaveAcceso, formatearSerie } = require('../utils/claveAcceso');
const { generarXMLComprobante } = require('../utils/xmlComprobante');
const {
  cargarCertificado,
  firmarXML,
  descifrarSecreto
} = require('../utils/firmaElectronica');

const TIPO_COMPROBANTE_SRI = {
  factura: '01', liquidacion: '03', nota_credito: '04', nota_debito: '05',
  guia_remision: '06', retencion: '07', exportacion: '01', reembolso: '01'
};
const DOCS_CON_CLAVE = Object.keys(TIPO_COMPROBANTE_SRI);

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
    console.warn('⚠️  No se pudo cargar el certificado:', e.message);
    return null;
  }
}

/**
 * Extrae el secuencial de un documento, tolerando datos corruptos.
 * Devuelve null si no puede determinarlo.
 */
function extraerSecuencialDirecto(venta) {
  // 1. secuencial_sri explícito (más confiable)
  if (venta.secuencial_sri) {
    const n = parseInt(String(venta.secuencial_sri).replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // 2. numero_factura como string
  if (typeof venta.numero_factura === 'string' && venta.numero_factura.trim()) {
    const match = venta.numero_factura.match(/(\d+)/g);
    if (match) {
      const n = parseInt(match[match.length - 1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function numeroParaLog(venta, idx) {
  if (typeof venta.numero_factura === 'string' && venta.numero_factura.trim()) {
    return venta.numero_factura.padEnd(20);
  }
  const shortId = String(venta._id).slice(-8);
  return `(id:${shortId})`.padEnd(20);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME;

  if (!uri) {
    console.error('❌ Falta MONGODB_URI en el entorno');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db();
    console.log(`🔌 Conectado a ${db.databaseName}`);
    console.log(`⚙️  Modo: ${dryRun ? 'DRY-RUN (solo listar)' : 'ESCRITURA'}`);
    console.log('─'.repeat(60));

    const config = await db.collection('configuracion').findOne({ _id: 'empresa' });
    if (!config?.ruc || config.ruc.length !== 13) {
      console.error('❌ No hay configuración de empresa con RUC válido');
      process.exit(1);
    }

    const certDoc = await db.collection('certificados').findOne({ _id: 'empresa' });
    const pems = cargarPems(certDoc);
    if (!pems) {
      console.warn('⚠️  Sin certificado: se generarán claves y XML pero SIN firma');
    }

    // Traemos también secuencial_sri para el cálculo robusto
    const docs = await db.collection('ventas_v2').find({
      tipo_documento: { $in: DOCS_CON_CLAVE },
      estado_sri: { $ne: 'AUTORIZADO' },
      $or: [
        { clave_acceso: '' },
        { clave_acceso: { $exists: false } },
        { clave_acceso: null }
      ]
    }).sort({ _id: 1 }).toArray();

    console.log(`📋 Documentos sin clave: ${docs.length}`);

    if (docs.length === 0) {
      console.log('🏁 Nada por hacer');
      return;
    }

    // Pre-scan: máximo secuencial ya usado (para fallback determinístico)
    let maxSecuencialConocido = 0;
    for (const v of docs) {
      const s = extraerSecuencialDirecto(v);
      if (s !== null && s > maxSecuencialConocido) maxSecuencialConocido = s;
    }

    let exitosas = 0;
    let errores = 0;
    let maxSecuencialUsado = 0;

    for (const venta of docs) {
      const etiqueta = numeroParaLog(venta);
      try {
        const tipoDoc = venta.tipo_documento || 'factura';
        const codigoSRI = TIPO_COMPROBANTE_SRI[tipoDoc] || '01';
        const est = venta.establecimiento || config.establecimiento || '001';
        const pe = venta.punto_emision || config.punto_emision || '001';
        const serie = formatearSerie(est, pe);

        // Fallback determinístico: si no podemos extraer, asignamos uno nuevo
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

        const cliente = await db.collection('clientes').findOne({ _id: venta.clienteId });

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
            console.warn(`  ⚠️  Error firmando ${etiqueta}: ${e.message}`);
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
                updatedAt: new Date()
              }
            }
          );
        }

        console.log(`✅ ${etiqueta} ${claveAcceso} ${estadoSri}`);
        exitosas++;
      } catch (e) {
        console.error(`❌ ${etiqueta}: ${e.message}`);
        errores++;
      }
    }

    if (!dryRun && maxSecuencialUsado > 0) {
      await db.collection('contadores').updateOne(
        { _id: 'factura' },
        { $max: { valor: maxSecuencialUsado } },
        { upsert: true }
      );
      console.log(`🔢 Contador 'factura' ajustado a ${maxSecuencialUsado}`);
    }

    console.log('─'.repeat(60));
    console.log(`🏁 Exitosas: ${exitosas} | Errores: ${errores}`);
    if (dryRun) console.log('(Dry-run: no se escribió nada)');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();