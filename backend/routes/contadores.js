// backend/routes/contadores.js
// ============================================================
// Contadores secuenciales por tipo de documento
// ------------------------------------------------------------
// Endpoints:
//   POST /siguiente        → reserva y devuelve el siguiente número
//   GET  /:tipo/peek       → muestra el próximo SIN reservarlo
//   GET  /:tipo            → valor actual del contador
//   POST /sincronizar      → recalcula el max desde documentos (admin)
//
// Convenciones:
//   - Cada tipo tiene sus propios permisos (`PERMISO_POR_TIPO`).
//   - `POST /siguiente` es la única operación que consume el contador.
//   - Los contadores se guardan en `contadores` con `_id: tipo`.
//   - El orden de las rutas importa: `/siguiente` y `/sincronizar`
//     deben ir ANTES que `/:tipo` para evitar que el parámetro dinámico
//     capture sus paths.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { tienePermiso, requierePermiso } = require('../utils/permisos');
const { PREFIJOS_CONTADOR } = require('../utils/tiposDocumento');
const { logAudit } = require('../utils/audit');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  col: 'contadores',
  colVentas: 'ventas_v2',
  colCompras: 'compras_v2',
  /** Tope del secuencial (6 dígitos → 999 999). SRI permite hasta 9. */
  valorMax: 999_999_999,
  /** Tamaño del padding del código resultante. */
  padding: 6,
  prefijoFallback: 'DOC'
});

// Tipos válidos + permisos requeridos + colección fuente para sincronizar.
// Fuente única de verdad (evita duplicación con `sincronizar`).
const TIPOS = Object.freeze({
  factura:       { modulo: 'ventas',      accion: 'crear', coleccion: 'ventas',  filtro: { tipo_documento: 'factura' } },
  nota_credito:  { modulo: 'ventas',      accion: 'crear', coleccion: 'ventas',  filtro: { tipo_documento: 'nota_credito' } },
  nota_debito:   { modulo: 'ventas',      accion: 'crear', coleccion: 'ventas',  filtro: { tipo_documento: 'nota_debito' } },
  guia_remision: { modulo: 'ventas',      accion: 'crear', coleccion: 'ventas',  filtro: { tipo_documento: 'guia_remision' } },
  liquidacion:   { modulo: 'ventas',      accion: 'crear', coleccion: 'ventas',  filtro: { tipo_documento: 'liquidacion' } },
  exportacion:   { modulo: 'ventas',      accion: 'crear', coleccion: 'ventas',  filtro: { tipo_documento: 'exportacion' } },
  reembolso:     { modulo: 'ventas',      accion: 'crear', coleccion: 'ventas',  filtro: { tipo_documento: 'reembolso' } },
  proforma:      { modulo: 'ventas',      accion: 'crear', coleccion: 'ventas',  filtro: { tipo_documento: 'proforma' } },
  compra:        { modulo: 'compras',     accion: 'crear', coleccion: 'compras', filtro: {} },
  retencion:     { modulo: 'retenciones', accion: 'crear', coleccion: 'ventas',  filtro: { tipo_documento: 'retencion' } }
});

const TIPOS_VALIDOS = Object.keys(TIPOS);

// ============================================================
// HELPERS
// ============================================================

/** Setea headers seguros. */
function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/** Auditoría que nunca rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar contador');
  }
}

/** Devuelve el prefijo del tipo (o fallback). */
function prefijoDe(tipo) {
  return PREFIJOS_CONTADOR[tipo] || CONFIG.prefijoFallback;
}

/** Construye el código `PREFIJO-NNNNNN` desde el valor numérico. */
function construirCodigo(tipo, valor) {
  const prefijo = prefijoDe(tipo);
  const num = String(valor).padStart(CONFIG.padding, '0');
  return `${prefijo}-${num}`;
}

/** Valida que el tipo exista; devuelve la config o null. */
function configDeTipo(tipo) {
  if (typeof tipo !== 'string') return null;
  return TIPOS[tipo] || null;
}

/**
 * Middleware que exige permiso `[modulo, accion]` según el `tipo` del request.
 * Acepta `req.body.tipo` (POST) o `req.params.tipo` (GET).
 */
function requierePermisoSegunTipo(req, res, next) {
  const tipo = req.body?.tipo || req.params?.tipo;
  const cfg = configDeTipo(tipo);

  if (!cfg) {
    return res.status(400).json({
      error: `Tipo "${tipo || ''}" no válido`,
      codigo: 'TIPO_INVALIDO',
      tiposValidos: TIPOS_VALIDOS
    });
  }

  const rol = req.user?.rol;
  if (!tienePermiso(rol, cfg.modulo, cfg.accion)) {
    return res.status(403).json({
      error: `No tiene permiso para "${cfg.accion}" en "${cfg.modulo}"`,
      codigo: 'SIN_PERMISO',
      modulo: cfg.modulo,
      accion: cfg.accion,
      rol,
      tipo
    });
  }

  // Guardamos la config en req para reusarla en el handler (evita re-parsear).
  req._tipoConfig = cfg;
  req._tipoNombre = tipo;
  return next();
}

/**
 * Reserva el siguiente valor de un contador (atómico).
 * Maneja driver v3 (`{value: doc}`) y v4+ (doc directo).
 * @returns {Promise<number>} nuevo valor
 */
async function reservarSiguiente(db, tipo, session = null) {
  const opts = { upsert: true, returnDocument: 'after' };
  if (session) opts.session = session;

  const r = await db.collection(CONFIG.col).findOneAndUpdate(
    { _id: tipo },
    { $inc: { valor: 1 }, $set: { updatedAt: new Date() } },
    opts
  );

  const doc = r && r.value !== undefined ? r.value : r;
  const valor = Number(doc?.valor);

  if (!Number.isFinite(valor)) {
    const err = new Error(`Contador "${tipo}" devolvió un valor inválido`);
    err.status = 500;
    err.codigo = 'CONTADOR_INVALIDO';
    throw err;
  }
  if (valor > CONFIG.valorMax) {
    const err = new Error(
      `El contador "${tipo}" alcanzó el máximo permitido (${CONFIG.valorMax}). ` +
      `Contacte al administrador para reasignar la secuencia.`
    );
    err.status = 409;
    err.codigo = 'CONTADOR_AGOTADO';
    throw err;
  }
  return valor;
}

// ============================================================
// POST /siguiente  → reservar y devolver
// ============================================================
router.post('/siguiente', requierePermisoSegunTipo, async (req, res, next) => {
  try {
    const tipo = req._tipoNombre;
    const valor = await reservarSiguiente(req.db, tipo);
    const codigo = construirCodigo(tipo, valor);

    headersNoStore(res);
    return res.json({ codigo, valor, tipo });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /sincronizar  → recalcular el max desde documentos (admin)
// ------------------------------------------------------------
// ⚠️  Debe ir ANTES que `/:tipo` para no ser capturado por el parámetro.
// ============================================================
router.post(
  '/sincronizar',
  requierePermiso('contadores', 'editar', { rolAlterno: 'admin' }),
  async (req, res, next) => {
    try {
      // Sincronizar todos los tipos EN PARALELO (antes era secuencial).
      const entradas = Object.entries(TIPOS);

      const resultados = {};
      await Promise.all(entradas.map(async ([tipo, cfg]) => {
        try {
          const col = cfg.coleccion === 'compras' ? CONFIG.colCompras : CONFIG.colVentas;
          const filtro = cfg.filtro || {};

          // Extrae el número más alto visto en `numero_factura`.
          // Si el formato no tiene guiones o no es numérico, `$toInt` devuelve
          // null → `$max` lo ignora.
          const [doc] = await req.db.collection(col).aggregate([
            { $match: filtro },
            {
              $project: {
                num: {
                  $toInt: {
                    $ifNull: [
                      { $arrayElemAt: [{ $split: ['$numero_factura', '-'] }, -1] },
                      0
                    ]
                  }
                }
              }
            },
            { $match: { num: { $ne: null } } },
            { $group: { _id: null, max: { $max: '$num' } } }
          ]).toArray();

          const max = Number(doc?.max) || 0;
          const actual = await req.db.collection(CONFIG.col).findOne({ _id: tipo });
          const valorActual = Number(actual?.valor) || 0;

          if (max > valorActual) {
            // $max: nunca retrocede si otro worker ya subió más.
            await req.db.collection(CONFIG.col).updateOne(
              { _id: tipo },
              { $max: { valor: max }, $set: { updatedAt: new Date() } },
              { upsert: true }
            );
            resultados[tipo] = { anterior: valorActual, actualizado: max };
          } else {
            resultados[tipo] = { anterior: valorActual, actualizado: valorActual, sinCambio: true };
          }
        } catch (err) {
          resultados[tipo] = { error: err.message };
        }
      }));

      await auditarSeguro(req.db, req, {
        accion: 'sincronizar',
        coleccion: CONFIG.col,
        documentoNumero: 'global',
        datosNuevos: resultados,
        detalle: `Contadores sincronizados (${Object.keys(resultados).length} tipos)`
      });

      headersNoStore(res);
      return res.json({ message: 'Contadores sincronizados', resultados });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// GET /:tipo/peek  → próximo SIN reservar
// ============================================================
router.get('/:tipo/peek', requierePermisoSegunTipo, async (req, res, next) => {
  try {
    const tipo = req._tipoNombre;
    const doc = await req.db.collection(CONFIG.col).findOne({ _id: tipo });
    const valorActual = Number(doc?.valor) || 0;
    const proximo = valorActual + 1;
    const codigo = construirCodigo(tipo, proximo);

    headersNoStore(res);
    return res.json({
      codigo,
      valor: proximo,
      tipo,
      peek: true,
      nota: 'Este valor NO ha sido reservado. Usa POST /siguiente para reservarlo.'
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /:tipo  → valor actual
// ============================================================
router.get('/:tipo', requierePermisoSegunTipo, async (req, res, next) => {
  try {
    const tipo = req._tipoNombre;
    const doc = await req.db.collection(CONFIG.col).findOne({ _id: tipo });

    headersNoStore(res);
    return res.json({ tipo, valor: Number(doc?.valor) || 0 });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._TIPOS = TIPOS;
module.exports._TIPOS_VALIDOS = TIPOS_VALIDOS;
module.exports._construirCodigo = construirCodigo;
module.exports._prefijoDe = prefijoDe;
module.exports._reservarSiguiente = reservarSiguiente;