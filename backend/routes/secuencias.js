const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Obtener y actualizar secuencia
async function getNextSequence(db, nombreSecuencia, prefijo = '', longitud = 4) {
  const secuencia = await db.collection('secuencias').findOneAndUpdate(
    { _id: nombreSecuencia },
    { $inc: { valor: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const valor = secuencia.value || 1;
  const numero = String(valor).padStart(longitud, '0');
  return `${prefijo}${numero}`;
}

// Generar código de producto
router.get('/producto', async (req, res) => {
  try {
    const codigo = await getNextSequence(req.db, 'producto_codigo', 'PROD-', 4);
    res.json({ codigo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generar número de factura
router.get('/factura', async (req, res) => {
  try {
    const numero = await getNextSequence(req.db, 'factura_numero', '', 7);
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generar número de compra
router.get('/compra', async (req, res) => {
  try {
    const numero = await getNextSequence(req.db, 'compra_numero', 'COMP-', 4);
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generar número de guía de remisión
router.get('/guia', async (req, res) => {
  try {
    const numero = await getNextSequence(req.db, 'guia_numero', 'G-', 4);
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generar número de retención
router.get('/retencion', async (req, res) => {
  try {
    const numero = await getNextSequence(req.db, 'retencion_numero', 'RET-', 4);
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generar número de liquidación
router.get('/liquidacion', async (req, res) => {
  try {
    const numero = await getNextSequence(req.db, 'liquidacion_numero', 'LIQ-', 4);
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generar número de exportación
router.get('/exportacion', async (req, res) => {
  try {
    const numero = await getNextSequence(req.db, 'exportacion_numero', 'EXP-', 4);
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;