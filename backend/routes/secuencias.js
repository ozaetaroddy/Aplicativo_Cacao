// backend/routes/secuencias.js
// ⚠️  DEPRECADO: usar /api/contadores
// Este router mantiene la API por compatibilidad, pero internamente usa la
// MISMA colección `contadores` que /api/contadores.
//
// ⚠️  FIX: antes 'exportacion_numero' apuntaba a 'exportacion_numero' en
// contadores, mientras que /api/contadores y /api/ventas usan 'exportacion'.
// Ahora todo apunta al mismo id.

const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');

const SECUENCIA_A_CONTADOR = {
  'producto_codigo':    'producto_codigo',
  'factura_numero':     'factura',
  'compra_numero':      'compra',
  'guia_numero':        'guia_remision',
  'retencion_numero':   'retencion',
  'liquidacion_numero': 'liquidacion',
  'exportacion_numero': 'exportacion'
};

async function getNextSequence(db, nombreSecuencia, prefijo = '', longitud = 4) {
  const contadorId = SECUENCIA_A_CONTADOR[nombreSecuencia] || nombreSecuencia;
  const r = await db.collection('contadores').findOneAndUpdate(
    { _id: contadorId },
    { $inc: { valor: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const valor = r?.valor || 1;
  const numero = String(valor).padStart(longitud, '0');
  return { valor, codigo: `${prefijo}${numero}` };
}

async function peekSequence(db, nombreSecuencia, prefijo = '', longitud = 4) {
  const contadorId = SECUENCIA_A_CONTADOR[nombreSecuencia] || nombreSecuencia;
  const doc = await db.collection('contadores').findOne({ _id: contadorId });
  const valor = (doc?.valor || 0) + 1;
  const numero = String(valor).padStart(longitud, '0');
  return { valor, codigo: `${prefijo}${numero}` };
}

router.get('/producto', requierePermiso('productos', 'crear'), async (req, res) => {
  try {
    const { codigo } = await getNextSequence(req.db, 'producto_codigo', 'PROD-', 4);
    res.json({ codigo });
  } catch (err) {
    console.error('Error secuencia producto:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/producto/peek', requierePermiso('productos', 'crear'), async (req, res) => {
  try {
    const { codigo } = await peekSequence(req.db, 'producto_codigo', 'PROD-', 4);
    res.json({ codigo, peek: true, nota: 'Valor NO reservado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/factura', requierePermiso('ventas', 'crear'), async (req, res) => {
  try {
    const { codigo } = await getNextSequence(req.db, 'factura_numero', '', 7);
    res.json({ numero: codigo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/factura/peek', requierePermiso('ventas', 'crear'), async (req, res) => {
  try {
    const { codigo } = await peekSequence(req.db, 'factura_numero', '', 7);
    res.json({ numero: codigo, peek: true, nota: 'Valor NO reservado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/compra', requierePermiso('compras', 'crear'), async (req, res) => {
  try {
    const { codigo } = await getNextSequence(req.db, 'compra_numero', 'COMP-', 4);
    res.json({ numero: codigo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/compra/peek', requierePermiso('compras', 'crear'), async (req, res) => {
  try {
    const { codigo } = await peekSequence(req.db, 'compra_numero', 'COMP-', 4);
    res.json({ numero: codigo, peek: true, nota: 'Valor NO reservado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/guia', requierePermiso('ventas', 'crear'), async (req, res) => {
  try {
    const { codigo } = await getNextSequence(req.db, 'guia_numero', 'G-', 4);
    res.json({ numero: codigo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/guia/peek', requierePermiso('ventas', 'crear'), async (req, res) => {
  try {
    const { codigo } = await peekSequence(req.db, 'guia_numero', 'G-', 4);
    res.json({ numero: codigo, peek: true, nota: 'Valor NO reservado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/retencion', requierePermiso('retenciones', 'crear'), async (req, res) => {
  try {
    const { codigo } = await getNextSequence(req.db, 'retencion_numero', 'RET-', 4);
    res.json({ numero: codigo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/retencion/peek', requierePermiso('retenciones', 'crear'), async (req, res) => {
  try {
    const { codigo } = await peekSequence(req.db, 'retencion_numero', 'RET-', 4);
    res.json({ numero: codigo, peek: true, nota: 'Valor NO reservado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/liquidacion', requierePermiso('ventas', 'crear'), async (req, res) => {
  try {
    const { codigo } = await getNextSequence(req.db, 'liquidacion_numero', 'LIQ-', 4);
    res.json({ numero: codigo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/liquidacion/peek', requierePermiso('ventas', 'crear'), async (req, res) => {
  try {
    const { codigo } = await peekSequence(req.db, 'liquidacion_numero', 'LIQ-', 4);
    res.json({ numero: codigo, peek: true, nota: 'Valor NO reservado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/exportacion', requierePermiso('ventas', 'crear'), async (req, res) => {
  try {
    const { codigo } = await getNextSequence(req.db, 'exportacion_numero', 'EXP-', 4);
    res.json({ numero: codigo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/exportacion/peek', requierePermiso('ventas', 'crear'), async (req, res) => {
  try {
    const { codigo } = await peekSequence(req.db, 'exportacion_numero', 'EXP-', 4);
    res.json({ numero: codigo, peek: true, nota: 'Valor NO reservado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;