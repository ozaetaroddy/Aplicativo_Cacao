// backend/utils/periodos.js
const { ObjectId } = require('mongodb');

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

async function obtenerPeriodoCerrado(db, fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return null;

  const anio = d.getFullYear();
  const mes = d.getMonth() + 1;

  return await db.collection('periodos_cerrados').findOne({ anio, mes });
}

/**
 * Middleware que verifica si el período está cerrado antes de permitir la operación.
 * Para PUT/PATCH/DELETE valida AMBAS fechas: la original del documento y la nueva.
 *
 * ✅ Optimización: en PUT/PATCH/DELETE lee el documento COMPLETO (sin proyección)
 * y lo cachea en `req._documentoOriginal`. Los handlers lo reutilizan y evitan
 * un segundo round-trip a MongoDB.
 */
function verificarPeriodoAbierto() {
  return async (req, res, next) => {
    try {
      const esModificacion = ['PUT', 'PATCH', 'DELETE'].includes(req.method);
      const id = req.params?.id;

      const fechaNueva = req.body?.fecha_emision
        || req.body?.fecha
        || req.query?.fecha_emision
        || req.query?.fecha;

      let fechaOriginal = null;
      let docOriginal = null;

      if (esModificacion && id && ObjectId.isValid(id)) {
        const coleccion = req.baseUrl.includes('ventas') ? 'ventas_v2'
                        : req.baseUrl.includes('compras') ? 'compras_v2'
                        : null;
        if (coleccion) {
          // ⚠️  SIN proyección: el handler necesita todos los campos (detalles, total, etc.)
          docOriginal = await req.db.collection(coleccion).findOne({ _id: new ObjectId(id) });
          fechaOriginal = docOriginal?.fecha_emision;
        }
      }

      const fechas = [fechaOriginal, fechaNueva].filter(Boolean);
      if (fechas.length === 0) {
        if (docOriginal) req._documentoOriginal = docOriginal;
        return next();
      }

      for (const f of fechas) {
        const periodo = await obtenerPeriodoCerrado(req.db, f);
        if (periodo) {
          const cual = (fechaOriginal && new Date(f).getTime() === new Date(fechaOriginal).getTime())
            ? 'original'
            : 'nueva';
          return res.status(423).json({
            error: `El período ${MESES[periodo.mes - 1]} ${periodo.anio} está cerrado (fecha ${cual}). No se pueden modificar documentos de ese mes.`,
            codigo: 'PERIODO_CERRADO',
            fecha: f,
            periodo: {
              anio: periodo.anio,
              mes: periodo.mes,
              nombre: `${MESES[periodo.mes - 1]} ${periodo.anio}`,
              fecha_cierre: periodo.fecha_cierre
            }
          });
        }
      }

      if (docOriginal) req._documentoOriginal = docOriginal;

      next();
    } catch (err) {
      console.error('Error verificando período:', err);
      res.status(500).json({ error: err.message });
    }
  };
}

module.exports = { obtenerPeriodoCerrado, verificarPeriodoAbierto, MESES };