// backend/routes/periodos.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

router.get('/', requierePermiso('periodos', 'ver'), async (req, res) => {
  try {
    const { anio } = req.query;
    const match = {};
    if (anio) match.anio = parseInt(anio, 10);

    const periodos = await req.db.collection('periodos_cerrados')
      .find(match).sort({ anio: -1, mes: -1 }).toArray();

    res.json(periodos.map(p => ({
      ...p,
      nombre: `${MESES[p.mes - 1]} ${p.anio}`
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Requiere permiso de períodos
router.get('/verificar/:anio/:mes', requierePermiso('periodos', 'ver'), async (req, res) => {
  try {
    const { anio, mes } = req.params;
    const periodo = await req.db.collection('periodos_cerrados').findOne({
      anio: parseInt(anio, 10),
      mes: parseInt(mes, 10)
    });
    if (!periodo) return res.json({ cerrado: false });
    res.json({
      cerrado: true,
      periodo: {
        ...periodo,
        nombre: `${MESES[periodo.mes - 1]} ${periodo.anio}`
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requierePermiso('periodos', 'cerrar'), async (req, res) => {
  try {
    const { anio, mes, observaciones } = req.body;

    if (!anio || !mes) {
      return res.status(400).json({ error: 'Año y mes son obligatorios' });
    }

    const anioNum = parseInt(anio, 10);
    const mesNum = parseInt(mes, 10);

    if (mesNum < 1 || mesNum > 12) {
      return res.status(400).json({ error: 'Mes inválido (1-12)' });
    }
    if (anioNum < 2020 || anioNum > 2100) {
      return res.status(400).json({ error: 'Año fuera de rango' });
    }

    // No cerrar períodos futuros
    const hoy = new Date();
    const primerDiaDelMes = new Date(anioNum, mesNum - 1, 1);
    if (primerDiaDelMes > hoy) {
      return res.status(400).json({ error: 'No se puede cerrar un período futuro' });
    }

    const existente = await req.db.collection('periodos_cerrados').findOne({
      anio: anioNum, mes: mesNum
    });
    if (existente) {
      return res.status(400).json({ error: `${MESES[mesNum - 1]} ${anioNum} ya está cerrado` });
    }

    // Verificar que no haya documentos sin clave de acceso en ese período
    const inicio = new Date(anioNum, mesNum - 1, 1);
    const fin = new Date(anioNum, mesNum, 0);
    fin.setHours(23, 59, 59, 999);

    const sinClave = await req.db.collection('ventas_v2').countDocuments({
      fecha_emision: { $gte: inicio, $lte: fin },
      tipo_documento: { $in: ['factura', 'nota_credito', 'nota_debito'] },
      $or: [{ clave_acceso: '' }, { clave_acceso: { $exists: false } }]
    });

    const nuevoPeriodo = {
      anio: anioNum,
      mes: mesNum,
      fecha_cierre: new Date(),
      cerrado_por: req.user.email,
      cerrado_por_id: new ObjectId(req.user.userId),
      observaciones: observaciones || '',
      documentos_sin_clave_al_cerrar: sinClave,
      createdAt: new Date()
    };

    const result = await req.db.collection('periodos_cerrados').insertOne(nuevoPeriodo);

    await logAudit(req.db, req, {
      accion: 'cerrar-periodo',
      coleccion: 'periodos_cerrados',
      documentoId: result.insertedId,
      documentoNumero: `${MESES[mesNum - 1]} ${anioNum}`,
      datosNuevos: nuevoPeriodo,
      detalle: `Período cerrado: ${MESES[mesNum - 1]} ${anioNum}${sinClave > 0 ? ` (con ${sinClave} documentos sin clave)` : ''}`
    });

    res.status(201).json({
      ...nuevoPeriodo,
      _id: result.insertedId,
      nombre: `${MESES[mesNum - 1]} ${anioNum}`,
      advertencia: sinClave > 0
        ? `Hay ${sinClave} documentos sin clave de acceso en este período`
        : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reapertura: SOLO admin
router.delete('/:id', requierePermiso('periodos', 'reabrir'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const periodo = await req.db.collection('periodos_cerrados').findOne({ _id: new ObjectId(id) });
    if (!periodo) return res.status(404).json({ error: 'Período no encontrado' });

    await req.db.collection('periodos_cerrados').deleteOne({ _id: new ObjectId(id) });

    await logAudit(req.db, req, {
      accion: 'reabrir-periodo',
      coleccion: 'periodos_cerrados',
      documentoId: id,
      documentoNumero: `${MESES[periodo.mes - 1]} ${periodo.anio}`,
      datosAnteriores: periodo,
      detalle: `Período REABIERTO: ${MESES[periodo.mes - 1]} ${periodo.anio} por ${req.user.email}`
    });

    res.json({ message: 'Período reabierto correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;