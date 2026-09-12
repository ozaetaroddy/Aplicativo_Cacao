// backend/routes/contadores.js
const express = require('express');
const router = express.Router();
const { tienePermiso } = require('../utils/permisos');

const PREFIJOS = {
  'factura': 'FAC',
  'compra': 'COM',
  'guia_remision': 'GUI',
  'exportacion': 'EXP',
  'reembolso': 'REB',
  'retencion': 'RET',
  'liquidacion': 'LIQ',
  'nota_credito': 'NCR',
  'nota_debito': 'NDB',
  'proforma': 'PRO'
};

const PERMISO_POR_TIPO = {
  factura: ['ventas', 'crear'],
  nota_credito: ['ventas', 'crear'],
  nota_debito: ['ventas', 'crear'],
  guia_remision: ['ventas', 'crear'],
  liquidacion: ['ventas', 'crear'],
  exportacion: ['ventas', 'crear'],
  reembolso: ['ventas', 'crear'],
  proforma: ['ventas', 'crear'],
  compra: ['compras', 'crear'],
  retencion: ['retenciones', 'crear']
};

function requierePermisoSegunTipo(req, res, next) {
  const tipo = req.body?.tipo || req.params?.tipo;
  const [modulo, accion] = PERMISO_POR_TIPO[tipo] || [];
  if (!modulo) {
    return res.status(400).json({ error: `Tipo "${tipo}" no válido`, tiposValidos: Object.keys(PERMISO_POR_TIPO) });
  }
  const rol = req.user?.rol;
  if (!tienePermiso(rol, modulo, accion)) {
    return res.status(403).json({
      error: `No tiene permiso para "${accion}" en "${modulo}"`,
      modulo, accion, rol, tipo
    });
  }
  next();
}

// ============================================================
// POST /siguiente — RESERVA (incrementa)
// ============================================================
router.post('/siguiente', requierePermisoSegunTipo, async (req, res) => {
  try {
    const { tipo } = req.body;
    const result = await req.db.collection('contadores').findOneAndUpdate(
      { _id: tipo },
      { $inc: { valor: 1 } },
      { upsert: true, returnDocument: 'after' }
    );

    const valor = result?.valor || 1;
    const prefijo = PREFIJOS[tipo] || 'DOC';
    const codigo = `${prefijo}-${String(valor).padStart(6, '0')}`;

    res.json({ codigo, valor, tipo });
  } catch (err) {
    console.error('Error en contador:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /:tipo/peek — LECTURA (no incrementa)
// ============================================================
router.get('/:tipo/peek', requierePermisoSegunTipo, async (req, res) => {
  try {
    const { tipo } = req.params;
    const doc = await req.db.collection('contadores').findOne({ _id: tipo });
    const valorActual = doc?.valor || 0;
    const proximo = valorActual + 1;
    const prefijo = PREFIJOS[tipo] || 'DOC';
    const codigo = `${prefijo}-${String(proximo).padStart(6, '0')}`;

    res.json({
      codigo,
      valor: proximo,
      tipo,
      peek: true,
      nota: 'Este valor NO ha sido reservado. Usa POST /siguiente para reservarlo o crea el documento para consumirlo.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /:tipo — valor actual (read-only)
// ============================================================
router.get('/:tipo', requierePermisoSegunTipo, async (req, res) => {
  try {
    const { tipo } = req.params;
    const doc = await req.db.collection('contadores').findOne({ _id: tipo });
    res.json({ tipo, valor: doc?.valor || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /sincronizar — solo admin
// ✅ FIX: incluidos todos los tipos que existen en PREFIJOS
// ============================================================
router.post('/sincronizar', (req, res, next) => {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo un administrador puede sincronizar contadores' });
  }
  next();
}, async (req, res) => {
  try {
    const tipos = [
      'factura', 'compra', 'guia_remision', 'retencion', 'liquidacion',
      'nota_credito', 'nota_debito', 'proforma',
      'exportacion', 'reembolso'
    ];
    const resultados = {};

    for (const tipo of tipos) {
      const col = tipo === 'compra' ? 'compras_v2' : 'ventas_v2';
      const filtro = col === 'ventas_v2' ? { tipo_documento: tipo } : {};

      const [doc] = await req.db.collection(col).aggregate([
        { $match: filtro },
        { $project: { num: { $toInt: { $ifNull: [{ $arrayElemAt: [{ $split: ['$numero_factura', '-'] }, -1] }, 0] } } } },
        { $group: { _id: null, max: { $max: '$num' } } }
      ]).toArray();

      const max = doc?.max || 0;
      const actual = await req.db.collection('contadores').findOne({ _id: tipo });
      const valorActual = actual?.valor || 0;

      if (max > valorActual) {
        await req.db.collection('contadores').updateOne(
          { _id: tipo },
          { $set: { valor: max } },
          { upsert: true }
        );
        resultados[tipo] = { anterior: valorActual, actualizado: max };
      } else {
        resultados[tipo] = { anterior: valorActual, actualizado: valorActual, sinCambio: true };
      }
    }

    res.json({ message: 'Contadores sincronizados', resultados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;