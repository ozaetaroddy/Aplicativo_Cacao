// backend/routes/configuracion.js
const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');
const { validarRUC, validarEmail } = require('../utils/validators');

const REGIMENES = ['RIMPE', 'RIMPE_NEGOCIO', 'GENERAL', 'ESPECIAL'];

// ===== OBTENER CONFIGURACIÓN =====
router.get('/empresa', async (req, res) => {
  try {
    let config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    if (!config) {
      config = {
        _id: 'empresa',
        ruc: '0000000000001',
        razon_social: 'MI EMPRESA',
        nombre_comercial: 'MI EMPRESA',
        direccion_matriz: '',
        direccion_establecimiento: '',
        telefono: '',
        email: '',
        contribuyente_especial: '',
        obligado_contabilidad: false,
        regimen: 'RIMPE',
        agente_retencion: '',
        ambiente: '1',
        tipo_emision: '1',
        establecimiento: '001',
        punto_emision: '001',
        logo_url: '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await req.db.collection('configuracion').insertOne(config);
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ACTUALIZAR CONFIGURACIÓN =====
router.put('/empresa', requierePermiso('configuracion', 'editar'), async (req, res) => {
  try {
    const anteriores = await req.db.collection('configuracion').findOne({ _id: 'empresa' });

    const {
      ruc, razon_social, nombre_comercial,
      direccion_matriz, direccion_establecimiento,
      telefono, email, contribuyente_especial,
      obligado_contabilidad, regimen, agente_retencion,
      ambiente, tipo_emision,
      establecimiento, punto_emision,
      logo_url
    } = req.body;

    // ==== Validaciones ====
    const errores = [];

    if (ruc) {
      const rucTrim = String(ruc).trim();
      if (!validarRUC(rucTrim)) {
        errores.push('RUC inválido (verifique el dígito verificador y que termine en 001)');
      }
    }
    if (email) {
      const check = validarEmail(email);
      if (!check.valido) errores.push(check.mensaje || 'Email inválido');
    }
    if (ambiente && !['1', '2'].includes(String(ambiente))) {
      errores.push('Ambiente debe ser "1" (Pruebas) o "2" (Producción)');
    }
    if (establecimiento && !/^\d{3}$/.test(establecimiento)) {
      errores.push('Establecimiento debe tener 3 dígitos');
    }
    if (punto_emision && !/^\d{3}$/.test(punto_emision)) {
      errores.push('Punto de emisión debe tener 3 dígitos');
    }
    if (regimen && !REGIMENES.includes(regimen)) {
      errores.push(`Régimen inválido. Válidos: ${REGIMENES.join(', ')}`);
    }

    // Si cambia a producción, verificar certificado cargado y vigente
    if (String(ambiente) === '2' && anteriores?.ambiente !== '2') {
      const cert = await req.db.collection('certificados').findOne({ _id: 'empresa' });
      if (!cert) {
        errores.push('No puede activar Producción sin un certificado de firma electrónica cargado');
      } else {
        const vence = new Date(cert.info?.validityNotAfter);
        if (vence < new Date()) {
          errores.push('No puede activar Producción con un certificado vencido');
        }
      }
    }

    if (errores.length > 0) {
      return res.status(400).json({ error: errores.join('. '), errores });
    }

    // Advertencia si cambia el RUC con documentos existentes
    let advertencia = null;
    if (ruc && anteriores?.ruc && ruc !== anteriores.ruc) {
      const docsCount = await req.db.collection('ventas_v2').countDocuments({});
      if (docsCount > 0) {
        advertencia = `Cambió el RUC con ${docsCount} documentos existentes. Los documentos anteriores conservan su RUC original.`;
      }
    }

    const updateData = {
      ruc: ruc || anteriores?.ruc,
      razon_social: razon_social || anteriores?.razon_social,
      nombre_comercial: nombre_comercial || anteriores?.nombre_comercial,
      direccion_matriz: direccion_matriz || '',
      direccion_establecimiento: direccion_establecimiento || '',
      telefono: telefono || '',
      email: email || '',
      contribuyente_especial: contribuyente_especial || '',
      obligado_contabilidad: !!obligado_contabilidad,
      regimen: regimen || 'RIMPE',
      agente_retencion: agente_retencion || '',
      ambiente: String(ambiente || anteriores?.ambiente || '1'),
      tipo_emision: String(tipo_emision || '1'),
      establecimiento: establecimiento || anteriores?.establecimiento || '001',
      punto_emision: punto_emision || anteriores?.punto_emision || '001',
      logo_url: logo_url || '',
      updatedAt: new Date()
    };

    await req.db.collection('configuracion').updateOne(
      { _id: 'empresa' },
      { $set: updateData },
      { upsert: true }
    );

    const actualizada = await req.db.collection('configuracion').findOne({ _id: 'empresa' });

    await logAudit(req.db, req, {
      accion: 'actualizar',
      coleccion: 'configuracion',
      documentoId: 'empresa',
      documentoNumero: actualizada.ruc,
      datosAnteriores: anteriores,
      datosNuevos: updateData,
      detalle: `Configuración actualizada (${actualizada.razon_social})${advertencia ? '. ' + advertencia : ''}`
    });

    res.json({ ...actualizada, _advertencia: advertencia });
  } catch (err) {
    console.error('Error actualizando configuración:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== VERIFICAR AMBIENTE =====
router.get('/ambiente', async (req, res) => {
  try {
    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    res.json({
      ambiente: config?.ambiente || '1',
      ambienteNombre: config?.ambiente === '2' ? 'Producción' : 'Pruebas',
      ruc: config?.ruc || '',
      razon_social: config?.razon_social || ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;