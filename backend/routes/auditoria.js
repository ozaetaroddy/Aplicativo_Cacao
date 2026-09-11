// backend/routes/auditoria.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Solo admin puede ver la auditoría
function soloAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores pueden ver la auditoría' });
  }
  next();
}

router.use(soloAdmin);

// Listar auditoría con paginación, búsqueda y filtros
router.get('/', async (req, res) => {
  try {
    const rawPage = parseInt(req.query.page, 10);
    const rawLimit = parseInt(req.query.limit, 10);
    const page = rawPage > 0 ? rawPage : 1;
    const limit = rawLimit > 0 ? Math.min(rawLimit, 200) : 30;
    const skip = (page - 1) * limit;

    const { search = '', accion, coleccion, usuarioEmail, desde, hasta } = req.query;

    const match = {};

    if (accion) match.accion = accion;
    if (coleccion) match.coleccion = coleccion;
    if (usuarioEmail) match.usuarioEmail = usuarioEmail;

    if (desde || hasta) {
      match.fecha = {};
      if (desde) {
        const d = new Date(desde);
        if (!isNaN(d)) match.fecha.$gte = d;
      }
      if (hasta) {
        const h = new Date(hasta);
        if (!isNaN(h)) {
          h.setHours(23, 59, 59, 999);
          match.fecha.$lte = h;
        }
      }
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
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

    res.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Error listando auditoría:', err);
    res.status(500).json({ error: err.message });
  }
});

// Estadísticas rápidas de auditoría
router.get('/stats', async (req, res) => {
  try {
    const hace7dias = new Date();
    hace7dias.setDate(hace7dias.getDate() - 7);

    const [totalRegistros, ultimas24h, porAccion, porColeccion] = await Promise.all([
      req.db.collection('auditoria').countDocuments(),
      req.db.collection('auditoria').countDocuments({ fecha: { $gte: hace7dias } }),
      req.db.collection('auditoria').aggregate([
        { $group: { _id: '$accion', total: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ]).toArray(),
      req.db.collection('auditoria').aggregate([
        { $group: { _id: '$coleccion', total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 }
      ]).toArray()
    ]);

    res.json({
      totalRegistros,
      ultimos7dias: ultimas24h,
      porAccion,
      porColeccion
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;