// backend/routes/diagnostico.js
const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');

// ============================================================
// DIAGNÓSTICO COMPLETO DEL SISTEMA
// ============================================================
router.get('/', requierePermiso('usuarios', 'ver'), async (req, res) => {
  try {
    const resultados = {
      configuracion_empresa: {},
      certificado: {},
      documentos: {},
      recomendaciones: []
    };

    // ===== 1. CONFIGURACIÓN DE EMPRESA =====
    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    if (!config) {
      resultados.configuracion_empresa = {
        ok: false,
        mensaje: 'No hay configuración de empresa guardada'
      };
      resultados.recomendaciones.push('Ve a Administración → Configuración Empresa y guarda los datos');
    } else {
      const rucOk = config.ruc && config.ruc.length === 13 && /^\d+$/.test(config.ruc);
      const ambienteOk = ['1', '2'].includes(String(config.ambiente));

      resultados.configuracion_empresa = {
        ok: rucOk && ambienteOk,
        ruc: config.ruc || '(vacío)',
        ruc_ok: rucOk,
        ruc_longitud: (config.ruc || '').length,
        razon_social: config.razon_social || '(vacío)',
        ambiente: config.ambiente || '(vacío)',
        ambiente_nombre: config.ambiente === '2' ? 'Producción' : (config.ambiente === '1' ? 'Pruebas' : 'No definido'),
        ambiente_ok: ambienteOk,
        establecimiento: config.establecimiento || '(vacío)',
        punto_emision: config.punto_emision || '(vacío)'
      };

      if (!rucOk) {
        resultados.recomendaciones.push('El RUC debe tener exactamente 13 dígitos numéricos en Configuración Empresa');
      }
      if (!ambienteOk) {
        resultados.recomendaciones.push('Configura el ambiente (1=Pruebas, 2=Producción)');
      }
      if (!config.establecimiento || config.establecimiento.length !== 3) {
        resultados.recomendaciones.push('El establecimiento debe tener 3 dígitos (ej: 001)');
      }
      if (!config.punto_emision || config.punto_emision.length !== 3) {
        resultados.recomendaciones.push('El punto de emisión debe tener 3 dígitos (ej: 001)');
      }
    }

    // ===== 2. CERTIFICADO DE FIRMA =====
    const cert = await req.db.collection('certificados').findOne(
      { _id: 'empresa' },
      { projection: { archivo_base64: 0, password: 0 } }
    );
    if (!cert) {
      resultados.certificado = {
        ok: false,
        mensaje: 'No hay certificado cargado'
      };
      resultados.recomendaciones.push('Ve a Administración → Certificado Firma y sube tu archivo .p12');
    } else {
      const ahora = new Date();
      const vence = new Date(cert.info?.validityNotAfter || '2000-01-01');
      const dias = Math.ceil((vence - ahora) / (1000 * 60 * 60 * 24));

      resultados.certificado = {
        ok: dias > 0,
        titular: cert.info?.subject || 'N/A',
        vence: cert.info?.validityNotAfter,
        dias_restantes: dias,
        vencido: dias <= 0
      };

      if (dias <= 0) {
        resultados.recomendaciones.push('El certificado de firma está vencido. Carga uno nuevo.');
      } else if (dias < 30) {
        resultados.recomendaciones.push(`El certificado vence en ${dias} días. Renuévalo pronto.`);
      }
    }

    // ===== 3. DOCUMENTOS =====
    const totalFacturas = await req.db.collection('ventas_v2').countDocuments({ tipo_documento: 'factura' });
    const sinClave = await req.db.collection('ventas_v2').countDocuments({
      tipo_documento: 'factura',
      $or: [
        { clave_acceso: '' },
        { clave_acceso: { $exists: false } }
      ]
    });
    const sinFirma = await req.db.collection('ventas_v2').countDocuments({
      tipo_documento: 'factura',
      $and: [
        { clave_acceso: { $ne: '' } },
        { $or: [{ xml_firmado: '' }, { xml_firmado: { $exists: false } }] }
      ]
    });
    const autorizados = await req.db.collection('ventas_v2').countDocuments({ estado_sri: 'AUTORIZADO' });

    resultados.documentos = {
      total_facturas: totalFacturas,
      sin_clave_acceso: sinClave,
      sin_firma: sinFirma,
      autorizados: autorizados
    };

    if (sinClave > 0) {
      resultados.recomendaciones.push(`Hay ${sinClave} facturas sin clave de acceso. Usa el botón "Generar clave" para regenerarlas.`);
    }

    // ===== 4. ESTADO GENERAL =====
    const todoOk = resultados.configuracion_empresa.ok && resultados.certificado.ok;

    res.json({
      estado_general: todoOk ? 'LISTO' : 'CONFIGURACION_INCOMPLETA',
      listo_para_facturar: todoOk,
      ...resultados
    });
  } catch (err) {
    console.error('Error en diagnóstico:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;