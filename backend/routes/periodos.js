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

router.get('/', requierePermiso('reportes', 'ver'), async (req, res) => {
  try {
    const { anio } = req.query;
    const match = {};
    if (anio) match.anio = parseInt(anio);

    const periodos = await req.db.collection('periodos_cerrados')
      .find(match)
      .sort({ anio: -1, mes: -1 })
      .toArray();

    const periodosConNombre = periodos.map(p => ({
      ...p,
      nombre: `${MESES[p.mes - 1]} ${p.anio}`
    }));

    res.json(periodosConNombre);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/verificar/:anio/:mes', async (req, res) => {
  try {
    const { anio, mes } = req.params;
    const periodo = await req.db.collection('periodos_cerrados').findOne({
      anio: parseInt(anio),
      mes: parseInt(mes)
    });
    if (!periodo) {
      return res.json({ cerrado: false });
    }
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

router.post('/', requierePermiso('reportes', 'ver'), async (req, res) => {
  try {
    const { anio, mes, observaciones } = req.body;

    if (!anio || !mes) {
      return res.status(400).json({ error: 'Año y mes son obligatorios' });
    }

    const anioNum = parseInt(anio);
    const mesNum = parseInt(mes);

    if (mesNum < 1 || mesNum > 12) {
      return res.status(400).json({ error: 'Mes inválido (1-12)' });
    }
    if (anioNum < 2020 || anioNum > 2100) {
      return res.status(400).json({ error: 'Año fuera de rango' });
    }

    const existente = await req.db.collection('periodos_cerrados').findOne({
      anio: anioNum,
      mes: mesNum
    });
    if (existente) {
      return res.status(400).json({ error: `${MESES[mesNum - 1]} ${anioNum} ya está cerrado` });
    }

    const nuevoPeriodo = {
      anio: anioNum,
      mes: mesNum,
      fecha_cierre: new Date(),
      cerrado_por: req.user.email,
      cerrado_por_id: new ObjectId(req.user.userId),
      observaciones: observaciones || '',
      createdAt: new Date()
    };

    const result = await req.db.collection('periodos_cerrados').insertOne(nuevoPeriodo);

    await logAudit(req.db, req, {
      accion: 'crear',
      coleccion: 'periodos_cerrados',
      documentoId: result.insertedId,
      documentoNumero: `${MESES[mesNum - 1]} ${anioNum}`,
      datosNuevos: nuevoPeriodo,
      detalle: `Período cerrado: ${MESES[mesNum - 1]} ${anioNum}`
    });

    res.status(201).json({
      ...nuevoPeriodo,
      _id: result.insertedId,
      nombre: `${MESES[mesNum - 1]} ${anioNum}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requierePermiso('usuarios', 'ver'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const periodo = await req.db.collection('periodos_cerrados').findOne({ _id: new ObjectId(id) });
    if (!periodo) return res.status(404).json({ error: 'Período no encontrado' });

    const result = await req.db.collection('periodos_cerrados').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Período no encontrado' });

    await logAudit(req.db, req, {
      accion: 'eliminar',
      coleccion: 'periodos_cerrados',
      documentoId: id,
      documentoNumero: `${MESES[periodo.mes - 1]} ${periodo.anio}`,
      datosAnteriores: periodo,
      detalle: `Período REABIERTO: ${MESES[periodo.mes - 1]} ${periodo.anio}`
    });

    res.json({ message: 'Período reabierto correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;