// backend/routes/catalogos.js
const express = require('express');
const router = express.Router();
const catalogos = require('../data/catalogosSRI');

// Whitelist explícita: sólo se exponen los arrays, no los helpers
const CATALOGOS_PUBLICOS = {
  TIPO_IDENTIFICACION: catalogos.TIPO_IDENTIFICACION,
  TIPO_COMPROBANTE: catalogos.TIPO_COMPROBANTE,
  FORMA_PAGO: catalogos.FORMA_PAGO,
  TARIFA_IVA: catalogos.TARIFA_IVA,
  TIPO_RETENCION: catalogos.TIPO_RETENCION,
  DOCUMENTO_SUSTENTO: catalogos.DOCUMENTO_SUSTENTO,
  ESTADO_PAGO: catalogos.ESTADO_PAGO,
  TIPO_MEDIDA: catalogos.TIPO_MEDIDA
};

// Obtener todos los catálogos de una vez
router.get('/', (req, res) => {
  res.json(CATALOGOS_PUBLICOS);
});

// Obtener un catálogo específico
router.get('/:nombre', (req, res) => {
  const { nombre } = req.params;
  const key = nombre.toUpperCase().replace(/-/g, '_');
  const catalogo = CATALOGOS_PUBLICOS[key];
  if (!catalogo) {
    return res.status(404).json({
      error: `Catálogo '${nombre}' no encontrado`,
      disponibles: Object.keys(CATALOGOS_PUBLICOS)
    });
  }
  res.json(catalogo);
});

module.exports = router;