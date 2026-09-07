const express = require('express');
const router = express.Router();

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

router.get('/producto', async (req, res) => {
  try {
    const codigo = await getNextSequence(req.db, 'producto_codigo', 'PROD-', 4);
    res.json({ codigo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/factura', async (req, res) => {
  try {
    const numero = await getNextSequence(req.db, 'factura_numero', '', 7);
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/compra', async (req, res) => {
  try {
    const numero = await getNextSequence(req.db, 'compra_numero', 'COMP-', 4);
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/guia', async (req, res) => {
  try {
    const numero = await getNextSequence(req.db, 'guia_numero', 'G-', 4);
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/retencion', async (req, res) => {
  try {
    const numero = await getNextSequence(req.db, 'retencion_numero', 'RET-', 4);
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/liquidacion', async (req, res) => {
  try {
    const numero = await getNextSequence(req.db, 'liquidacion_numero', 'LIQ-', 4);
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/exportacion', async (req, res) => {
  try {
    const numero = await getNextSequence(req.db, 'exportacion_numero', 'EXP-', 4);
    res.json({ numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;