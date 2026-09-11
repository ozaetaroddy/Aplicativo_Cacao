// backend/routes/configuracion.js
const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');

// ===== OBTENER CONFIGURACIÓN DE LA EMPRESA =====
router.get('/empresa', async (req, res) => {
  try {
    let config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    if (!config) {
      // Crear configuración por defecto
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
        ambiente: '1', // 1=Pruebas, 2=Producción
        tipo_emision: '1', // 1=Normal
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

// ===== ACTUALIZAR CONFIGURACIÓN DE LA EMPRESA =====
router.put('/empresa', requierePermiso('usuarios', 'editar'), async (req, res) => {
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

    // Validar RUC
    if (ruc && !/^\d{13}$/.test(ruc)) {
      return res.status(400).json({ error: 'RUC debe tener 13 dígitos numéricos' });
    }
    // Validar ambiente
    if (ambiente && !['1', '2'].includes(String(ambiente))) {
      return res.status(400).json({ error: 'Ambiente debe ser "1" (Pruebas) o "2" (Producción)' });
    }
    // Validar establecimiento y punto de emisión
    if (establecimiento && !/^\d{3}$/.test(establecimiento)) {
      return res.status(400).json({ error: 'Establecimiento debe tener 3 dígitos' });
    }
    if (punto_emision && !/^\d{3}$/.test(punto_emision)) {
      return res.status(400).json({ error: 'Punto de emisión debe tener 3 dígitos' });
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
      detalle: `Configuración de empresa actualizada (${actualizada.razon_social})`
    });

    res.json(actualizada);
  } catch (err) {
    console.error('Error actualizando configuración:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== VERIFICAR AMBIENTE (PRUEBAS O PRODUCCIÓN) =====
router.get('/ambiente', async (req, res) => {
  try {
    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    res.json({
      ambiente: config?.ambiente || '1',
      ambienteNombre: (config?.ambiente === '2') ? 'Producción' : 'Pruebas',
      ruc: config?.ruc || '',
      razon_social: config?.razon_social || ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;