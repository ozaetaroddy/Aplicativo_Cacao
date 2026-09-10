// backend/routes/catalogos.js
const express = require('express');
const router = express.Router();
const catalogos = require('../data/catalogosSRI');

// Obtener todos los catálogos de una vez
router.get('/', (req, res) => {
  res.json(catalogos);
});

// Obtener un catálogo específico
router.get('/:nombre', (req, res) => {
  const { nombre } = req.params;
  const key = nombre.toUpperCase().replace(/-/g, '_');
  const catalogo = catalogos[key];
  if (!catalogo) {
    return res.status(404).json({ error: `Catálogo '${nombre}' no encontrado` });
  }
  res.json(catalogo);
});

module.exports = router;