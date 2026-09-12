// backend/routes/auditoria.js
const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const { escapeRegex } = require('../utils/pagination');

router.use(requierePermiso('auditoria', 'ver'));

// Fuerza string para evitar inyecciones si alguien manda ?campo[$ne]=x
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

router.get('/', async (req, res) => {
  try {
    const rawPage = parseInt(req.query.page, 10);
    const rawLimit = parseInt(req.query.limit, 10);
    const page = rawPage > 0 ? rawPage : 1;
    const limit = rawLimit > 0 ? Math.min(rawLimit, 500) : 30;
    const skip = (page - 1) * limit;

    const search = (soloString(req.query.search) || '').trim();
    const accion = soloString(req.query.accion);
    const coleccion = soloString(req.query.coleccion);
    const usuarioEmail = soloString(req.query.usuarioEmail);
    const ip = soloString(req.query.ip);
    const desde = soloString(req.query.desde);
    const hasta = soloString(req.query.hasta);
    const soloErrores = soloString(req.query.soloErrores);

    const match = {};
    if (accion) match.accion = accion;
    if (coleccion) match.coleccion = coleccion;
    if (usuarioEmail) match.usuarioEmail = usuarioEmail;
    if (ip) match.ip = ip;
    if (soloErrores === 'true') match.accion = { $regex: 'error|fallido|rechaz', $options: 'i' };

    if (desde || hasta) {
      match.fecha = {};
      if (desde) { const d = new Date(desde); if (!isNaN(d)) match.fecha.$gte = d; }
      if (hasta) { const h = new Date(hasta); if (!isNaN(h)) { h.setHours(23, 59, 59, 999); match.fecha.$lte = h; } }
    }

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      match.$or = [
        { usuarioEmail: regex },
        { usuarioNombre: regex },
        { documentoNumero: regex },
        { detalle: regex },
        { coleccion: regex }
      ];
    }

    const total = await req.db.collection('auditoria').countDocuments(match);
    const data = await req.db.collection('auditoria')
      .find(match)
      .sort({ fecha: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Error listando auditoría:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const hace7dias = new Date();
    hace7dias.setDate(hace7dias.getDate() - 7);

    const [totalRegistros, ultimos7dias, porAccion, porColeccion, topUsuarios] = await Promise.all([
      req.db.collection('auditoria').countDocuments(),
      req.db.collection('auditoria').countDocuments({ fecha: { $gte: hace7dias } }),
      req.db.collection('auditoria').aggregate([
        { $group: { _id: '$accion', total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 }
      ]).toArray(),
      req.db.collection('auditoria').aggregate([
        { $group: { _id: '$coleccion', total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 }
      ]).toArray(),
      req.db.collection('auditoria').aggregate([
        { $match: { fecha: { $gte: hace7dias } } },
        { $group: { _id: '$usuarioEmail', total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 5 }
      ]).toArray()
    ]);

    res.json({ totalRegistros, ultimos7dias, porAccion, porColeccion, topUsuarios });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;