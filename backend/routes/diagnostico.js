// backend/routes/diagnostico.js
// ============================================================
// Diagnóstico de salud del sistema
// ------------------------------------------------------------
// Endpoint:
//   GET /  → resumen de configuración, certificado, documentos
//
// Devuelve:
//   {
//     estado_general: 'LISTO' | 'ADVERTENCIAS' | 'CONFIGURACION_INCOMPLETA',
//     listo_para_facturar: boolean,
//     configuracion_empresa: {...},
//     certificado: {...},
//     documentos: {...},
//     contadores: {...},
//     recomendaciones: [{ severidad, mensaje, codigo }]
//   }
//
// Todo es de solo lectura (no escribe ni modifica nada).
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  colConfig: 'configuracion',
  colCertificados: 'certificados',
  colVentas: 'ventas_v2',
  colContadores: 'contadores',
  colCache: 'cache_consultas',

  rucRegex: /^\d{13}$/,
  tresDigitos: /^\d{3}$/,
  ambientes: Object.freeze(['1', '2']),

  /** Días antes del vencimiento para avisar. */
  diasAlertaCertificado: 30,
  /** Días para avisar por contadores cercanos al límite. */
  diasAlertaCacheConsultas: 365,

  severidades: Object.freeze({
    INFO: 'info',
    ADVERTENCIA: 'advertencia',
    CRITICO: 'critico'
  })
});

// ============================================================
// HELPERS
// ============================================================

/** Setea headers seguros. */
function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/** Calcula días enteros entre dos fechas (puede ser negativo). */
function diasHasta(fecha) {
  if (!fecha) return null;
  const t = new Date(fecha).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

/** Normaliza texto (trim, sin tocar contenido). */
function texto(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Crea una recomendación con severidad y código estable. */
function recomendacion(severidad, mensaje, codigo) {
  return { severidad, mensaje, codigo };
}

// ============================================================
// BLOQUES DE DIAGNÓSTICO (funciones puras / casi puras)
// ============================================================

/**
 * Diagnostica la configuración de empresa.
 * @returns {{ bloque: object, recomendaciones: array, ok: boolean }}
 */
function diagnosticarConfiguracion(config) {
  const recomendaciones = [];

  if (!config) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.CRITICO,
      'No hay configuración de empresa guardada. Ve a Administración → Configuración Empresa y guarda los datos.',
      'CONFIG_FALTANTE'
    ));
    return {
      bloque: { ok: false, mensaje: 'No hay configuración de empresa guardada' },
      recomendaciones,
      ok: false
    };
  }

  const ruc = texto(config.ruc);
  const rucOk = CONFIG.rucRegex.test(ruc);
  const ambiente = texto(config.ambiente);
  const ambienteOk = CONFIG.ambientes.includes(ambiente);
  const establecimiento = texto(config.establecimiento);
  const puntoEmision = texto(config.punto_emision);
  const establecimientoOk = CONFIG.tresDigitos.test(establecimiento);
  const puntoEmisionOk = CONFIG.tresDigitos.test(puntoEmision);

  const bloque = {
    ok: rucOk && ambienteOk && establecimientoOk && puntoEmisionOk,
    ruc: ruc || '(vacío)',
    ruc_ok: rucOk,
    ruc_longitud: ruc.length,
    razon_social: texto(config.razon_social) || '(vacío)',
    nombre_comercial: texto(config.nombre_comercial) || '(vacío)',
    ambiente: ambiente || '(vacío)',
    ambiente_nombre: ambiente === '2' ? 'Producción' : (ambiente === '1' ? 'Pruebas' : 'No definido'),
    ambiente_ok: ambienteOk,
    establecimiento: establecimiento || '(vacío)',
    establecimiento_ok: establecimientoOk,
    punto_emision: puntoEmision || '(vacío)',
    punto_emision_ok: puntoEmisionOk,
    regimen: texto(config.regimen) || '(vacío)'
  };

  if (!rucOk) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.CRITICO,
      'El RUC debe tener exactamente 13 dígitos numéricos en Configuración Empresa.',
      'RUC_INVALIDO'
    ));
  }
  if (!ambienteOk) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.CRITICO,
      'Configura el ambiente en Configuración Empresa (1=Pruebas, 2=Producción).',
      'AMBIENTE_FALTANTE'
    ));
  }
  if (!establecimientoOk) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.ADVERTENCIA,
      'El establecimiento debe tener 3 dígitos (ej: 001).',
      'ESTABLECIMIENTO_INVALIDO'
    ));
  }
  if (!puntoEmisionOk) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.ADVERTENCIA,
      'El punto de emisión debe tener 3 dígitos (ej: 001).',
      'PUNTO_EMISION_INVALIDO'
    ));
  }

  return { bloque, recomendaciones, ok: bloque.ok };
}

/**
 * Diagnostica el certificado de firma electrónica.
 * @returns {{ bloque: object, recomendaciones: array, ok: boolean }}
 */
function diagnosticarCertificado(cert) {
  const recomendaciones = [];

  if (!cert) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.CRITICO,
      'No hay certificado de firma electrónica cargado. Ve a Administración → Certificado Firma y sube tu archivo .p12.',
      'CERT_FALTANTE'
    ));
    return {
      bloque: { ok: false, mensaje: 'No hay certificado cargado' },
      recomendaciones,
      ok: false
    };
  }

  const info = cert.info || {};
  const dias = diasHasta(info.validityNotAfter);
  const valido = dias !== null && dias > 0;

  const bloque = {
    ok: valido,
    titular: info.subject || 'N/A',
    emisor: info.issuer || 'N/A',
    vence: info.validityNotAfter || null,
    dias_restantes: dias,
    vencido: dias !== null && dias <= 0,
    por_vencer: dias !== null && dias > 0 && dias < CONFIG.diasAlertaCertificado,
    nombre_archivo: cert.nombre_archivo || null,
    subido_en: cert.subido_en || null
  };

  if (dias === null) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.CRITICO,
      'El certificado tiene una fecha de vencimiento inválida o ausente. Carga uno nuevo.',
      'CERT_FECHA_INVALIDA'
    ));
  } else if (dias <= 0) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.CRITICO,
      `El certificado está vencido (venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}). Carga uno nuevo.`,
      'CERT_VENCIDO'
    ));
  } else if (dias < CONFIG.diasAlertaCertificado) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.ADVERTENCIA,
      `El certificado vence en ${dias} día${dias === 1 ? '' : 's'}. Renuévalo pronto.`,
      'CERT_POR_VENCER'
    ));
  }

  return { bloque, recomendaciones, ok: valido };
}

/**
 * Diagnostica el estado de los documentos emitidos.
 * @returns {{ bloque: object, recomendaciones: array, ok: boolean }}
 */
async function diagnosticarDocumentos(db) {
  const recomendaciones = [];
  const col = db.collection(CONFIG.colVentas);

  // Consultas en paralelo.
  const [
    totalFacturas,
    sinClave,
    sinFirma,
    autorizados,
    pendientes,
    rechazados
  ] = await Promise.all([
    col.countDocuments({ tipo_documento: 'factura' }),
    col.countDocuments({
      tipo_documento: 'factura',
      $or: [
        { clave_acceso: '' },
        { clave_acceso: { $exists: false } },
        { clave_acceso: null }
      ]
    }),
    col.countDocuments({
      tipo_documento: 'factura',
      clave_acceso: { $nin: ['', null] },
      $or: [
        { xml_firmado: '' },
        { xml_firmado: { $exists: false } },
        { xml_firmado: null }
      ]
    }),
    col.countDocuments({ estado_sri: 'AUTORIZADO' }),
    col.countDocuments({ estado_sri: 'PENDIENTE' }),
    col.countDocuments({ estado_sri: { $in: ['RECHAZADO', 'DEVUELTA'] } })
  ]);

  const bloque = {
    total_facturas: totalFacturas,
    sin_clave_acceso: sinClave,
    sin_firma: sinFirma,
    autorizados,
    pendientes,
    rechazados
  };

  if (sinClave > 0) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.ADVERTENCIA,
      `Hay ${sinClave} factura${sinClave === 1 ? '' : 's'} sin clave de acceso. Usa el botón "Generar clave" para regenerarlas.`,
      'DOCS_SIN_CLAVE'
    ));
  }
  if (sinFirma > 0) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.ADVERTENCIA,
      `Hay ${sinFirma} factura${sinFirma === 1 ? '' : 's'} con clave pero sin firma. Fírmalas para enviarlas al SRI.`,
      'DOCS_SIN_FIRMA'
    ));
  }
  if (rechazados > 0) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.CRITICO,
      `Hay ${rechazados} comprobante${rechazados === 1 ? '' : 's'} rechazado${rechazados === 1 ? '' : 's'} por el SRI. Revísalos en el listado de documentos.`,
      'DOCS_RECHAZADOS'
    ));
  }
  if (pendientes > 0) {
    recomendaciones.push(recomendacion(
      CONFIG.severidades.INFO,
      `Hay ${pendientes} comprobante${pendientes === 1 ? '' : 's'} pendiente${pendientes === 1 ? '' : 's'} de envío al SRI.`,
      'DOCS_PENDIENTES'
    ));
  }

  return { bloque, recomendaciones, ok: rechazados === 0 && sinFirma === 0 };
}

/**
 * Diagnostica los contadores (opcional — no bloquea si falla).
 * @returns {{ bloque: object, recomendaciones: array }}
 */
async function diagnosticarContadores(db) {
  const recomendaciones = [];
  try {
    const contadores = await db.collection(CONFIG.colContadores).find({}).toArray();
    const resumen = {};
    for (const c of contadores) {
      resumen[c._id] = {
        valor: Number(c.valor) || 0,
        updatedAt: c.updatedAt || null
      };
    }
    return { bloque: resumen, recomendaciones };
  } catch (err) {
    // No es crítico que falle.
    log.warn({ err: err.message }, 'No se pudieron leer contadores');
    return { bloque: { error: 'No se pudieron leer los contadores' }, recomendaciones };
  }
}

/**
 * Diagnostica la caché de consultas (info, no error).
 */
async function diagnosticarCache(db) {
  try {
    const total = await db.collection(CONFIG.colCache).countDocuments({});
    const expirados = await db.collection(CONFIG.colCache).countDocuments({
      expira: { $lt: new Date() }
    });
    return { total, expirados };
  } catch (err) {
    log.warn({ err: err.message }, 'No se pudo leer caché de consultas');
    return { error: 'No disponible' };
  }
}

// ============================================================
// GET /  → diagnóstico
// ============================================================
router.get('/', requierePermiso('usuarios', 'ver'), async (req, res, next) => {
  try {
    // 1. Cargar config + cert en paralelo (una sola ida y vuelta a Mongo).
    const [config, cert] = await Promise.all([
      req.db.collection(CONFIG.colConfig).findOne({ _id: 'empresa' }),
      req.db.collection(CONFIG.colCertificados).findOne(
        { _id: 'empresa' },
        { projection: { archivo_base64: 0, password: 0, password_cifrado: 0 } }
      )
    ]);

    // 2. Ejecutar los diagnósticos (algunos en paralelo).
    const [diagConfig, diagCert, diagDocs, diagContadores, diagCache] = await Promise.all([
      Promise.resolve(diagnosticarConfiguracion(config)),
      Promise.resolve(diagnosticarCertificado(cert)),
      diagnosticarDocumentos(req.db),
      diagnosticarContadores(req.db),
      diagnosticarCache(req.db)
    ]);

    // 3. Unificar recomendaciones (orden: crítico > advertencia > info).
    const orden = {
      [CONFIG.severidades.CRITICO]: 0,
      [CONFIG.severidades.ADVERTENCIA]: 1,
      [CONFIG.severidades.INFO]: 2
    };
    const recomendaciones = [
      ...diagConfig.recomendaciones,
      ...diagCert.recomendaciones,
      ...diagDocs.recomendaciones
    ].sort((a, b) => (orden[a.severidad] ?? 99) - (orden[b.severidad] ?? 99));

    // 4. Estado general.
    const tieneCriticos = recomendaciones.some(r => r.severidad === CONFIG.severidades.CRITICO);
    const tieneAdvertencias = recomendaciones.some(r => r.severidad === CONFIG.severidades.ADVERTENCIA);
    const listoParaFacturar = diagConfig.ok && diagCert.ok;

    let estadoGeneral;
    if (listoParaFacturar && !tieneCriticos && !tieneAdvertencias) {
      estadoGeneral = 'LISTO';
    } else if (listoParaFacturar) {
      estadoGeneral = 'ADVERTENCIAS';
    } else {
      estadoGeneral = 'CONFIGURACION_INCOMPLETA';
    }

    headersNoStore(res);
    return res.json({
      estado_general: estadoGeneral,
      listo_para_facturar: listoParaFacturar,
      configuracion_empresa: diagConfig.bloque,
      certificado: diagCert.bloque,
      documentos: diagDocs.bloque,
      contadores: diagContadores.bloque,
      cache_consultas: diagCache,
      recomendaciones,
      generado_en: new Date()
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._diasHasta = diasHasta;
module.exports._diagnosticarConfiguracion = diagnosticarConfiguracion;
module.exports._diagnosticarCertificado = diagnosticarCertificado;
module.exports._diagnosticarDocumentos = diagnosticarDocumentos;