const express = require('express');
const router = express.Router();

// Obtener siguiente número secuencial para un tipo de documento
router.post('/siguiente', async (req, res) => {
  try {
    const { tipo } = req.body;
    if (!tipo) {
      return res.status(400).json({ error: 'Tipo de documento es requerido' });
    }

    const collection = req.db.collection('contadores');
    
    // Buscar y actualizar atómicamente
    const result = await collection.findOneAndUpdate(
      { _id: tipo },
      { $inc: { valor: 1 } },
      { upsert: true, returnDocument: 'after' }
    );

    const valor = result.valor;
    const prefijos = {
      'factura': 'FAC',
      'compra': 'COM',
      'guia_remision': 'GUI',
      'exportacion': 'EXP',
      'reembolso': 'REB',
      'retencion': 'RET',
      'liquidacion': 'LIQ',
      'nota_credito': 'NCR',
      'proforma': 'PRO'
    };
    const prefijo = prefijos[tipo] || 'DOC';
    const codigo = `${prefijo}-${String(valor).padStart(6, '0')}`;

    res.json({ codigo, valor });
  } catch (err) {
    console.error('Error en contador:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;