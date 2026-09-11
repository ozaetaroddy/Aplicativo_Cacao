// backend/utils/periodos.js
const { ObjectId } = require('mongodb');

async function obtenerPeriodoCerrado(db, fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d)) return null;

  const anio = d.getFullYear();
  const mes = d.getMonth() + 1;

  return await db.collection('periodos_cerrados').findOne({ anio, mes });
}

function verificarPeriodoAbierto() {
  return async (req, res, next) => {
    try {
      let fecha = req.body?.fecha_emision || req.query?.fecha_emision || req.query?.fecha;

      if (!fecha && req.method === 'DELETE' && req.params.id) {
        const coleccion = req.baseUrl.includes('ventas') ? 'ventas_v2' : 'compras_v2';
        const doc = await req.db.collection(coleccion).findOne(
          { _id: new ObjectId(req.params.id) },
          { projection: { fecha_emision: 1 } }
        );
        fecha = doc?.fecha_emision;
      }

      if (!fecha) return next();

      const periodo = await obtenerPeriodoCerrado(req.db, fecha);
      if (periodo) {
        const meses = [
          'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        return res.status(423).json({
          error: `El período ${meses[periodo.mes - 1]} ${periodo.anio} está cerrado. No se pueden modificar documentos de ese mes.`,
          periodo: {
            anio: periodo.anio,
            mes: periodo.mes,
            nombre: `${meses[periodo.mes - 1]} ${periodo.anio}`,
            fecha_cierre: periodo.fecha_cierre
          }
        });
      }

      next();
    } catch (err) {
      console.error('Error verificando período:', err);
      res.status(500).json({ error: err.message });
    }
  };
}

module.exports = { obtenerPeriodoCerrado, verificarPeriodoAbierto };