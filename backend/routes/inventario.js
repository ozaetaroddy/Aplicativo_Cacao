// backend/routes/inventario.js
// ============================================================
// Inventario — Ajustes manuales y conteo físico
// ------------------------------------------------------------
// Endpoints:
//   POST /ajustar  → ajuste individual (sumar/restar/corregir)
//   POST /conteo   → aplicar diferencias de un conteo físico
//
// Convenciones:
//   - Todas las rutas requieren permiso `inventario:ajustar`.
//   - Cada ajuste se registra como movimiento en `kardex` con
//     `tipo_movimiento: 'ajuste'` y `referencia_tipo: 'ajuste'`.
//   - El cambio de stock se hace dentro de transacción con guard
//     atómico (`stock: { $gte: cantidad }`) para restar.
//   - NO permite stock negativo en nigún caso.
//   - Errores tipados delegados al `errorHandler` central.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { conTransaccion } = require('../utils/transacciones');
const { validar } = require('../utils/validacion');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  colProductos: 'productos',
  colKardex: 'kardex',

  tiposAjuste: Object.freeze(['sumar', 'restar', 'corregir']),

  motivoMaxLen: envNum('INVENTARIO_MOTIVO_MAX', 500),
  maxDetallesConteo: envNum('INVENTARIO_MAX_CONTEOS', 1000),
  maxCantidadPorAjuste: envNum('INVENTARIO_MAX_CANTIDAD', 1_000_000)
});

// ============================================================
// HELPERS GENERALES
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

/** Número finito o fallback. NO silencia negativos. */
function toNumber(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Redondeo a 2 decimales. */
function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Valida ObjectId o lanza error tipado (400). */
function requireObjectId(id, mensaje = 'ID inválido', codigo = 'ID_INVALIDO') {
  if (!ObjectId.isValid(id)) {
    const err = new Error(mensaje);
    err.status = 400;
    err.codigo = codigo;
    throw err;
  }
  return new ObjectId(id);
}

/** Auditoría que NUNCA rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar inventario');
  }
}

// ============================================================
// HELPERS DE STOCK
// ============================================================
/**
 * Aplica un delta de stock atómicamente.
 * Si `delta < 0` exige stock suficiente con guard `$gte`.
 *
 * @param {object} db
 * @param {ObjectId} productoId
 * @param {number} delta          Puede ser positivo o negativo.
 * @param {object|null} session
 * @returns {Promise<object>} producto actualizado
 * @throws {Error} con codigo='STOCK_INSUFICIENTE' si el guard falla
 * @throws {Error} con codigo='PRODUCTO_NOT_FOUND' si no existe
 */
async function aplicarDeltaStock(db, productoId, delta, session) {
  const d = round2(delta);

  // Sin cambio → solo devolver el producto
  if (d === 0) {
    const doc = await db.collection(CONFIG.colProductos).findOne({ _id: productoId }, { session });
    if (!doc) {
      const err = new Error(`Producto ${productoId} no existe`);
      err.status = 404;
      err.codigo = 'PRODUCTO_NOT_FOUND';
      throw err;
    }
    return doc;
  }

  // Restar: guard de stock suficiente
  const filtro = d < 0
    ? { _id: productoId, stock: { $gte: Math.abs(d) } }
    : { _id: productoId };

  const r = await db.collection(CONFIG.colProductos).updateOne(
    filtro,
    {
      $inc: { stock: d },
      $set: { updatedAt: new Date() }
    },
    { session }
  );

  if (r.matchedCount === 0) {
    // Averiguar si fue por no existir o por stock insuficiente
    const existe = await db.collection(CONFIG.colProductos).findOne(
      { _id: productoId },
      { projection: { stock: 1 }, session }
    );

    if (!existe) {
      const err = new Error(`Producto ${productoId} no existe`);
      err.status = 404;
      err.codigo = 'PRODUCTO_NOT_FOUND';
      throw err;
    }

    const err = new Error(
      `Stock insuficiente para el producto ${productoId}. ` +
      `Disponible: ${existe.stock}, se intentó restar: ${Math.abs(d)}`
    );
    err.status = 409;
    err.codigo = 'STOCK_INSUFICIENTE';
    err.stockDisponible = Number(existe.stock) || 0;
    throw err;
  }

  return db.collection(CONFIG.colProductos).findOne({ _id: productoId }, { session });
}

/**
 * Registra un movimiento en kardex.
 * @param {object} opts
 * @param {object} opts.db
 * @param {ObjectId} opts.productoId
 * @param {number} opts.cantidad        Con signo (+/-).
 * @param {number} opts.saldo           Stock resultante.
 * @param {number} opts.costoUnitario
 * @param {object|null} opts.session
 * @param {ObjectId} opts.referenciaId  Puede ser el _id de un "ajuste padre" o el productoId.
 * @param {string} opts.motivo
 * @param {string} opts.usuarioEmail
 */
async function registrarKardexAjuste({
  db,
  productoId,
  cantidad,
  saldo,
  costoUnitario,
  session,
  referenciaId,
  motivo,
  usuarioEmail
}) {
  await db.collection(CONFIG.colKardex).insertOne(
    {
      productoId,
      fecha: new Date(),
      tipo_movimiento: 'ajuste',
      cantidad: round2(cantidad),
      costo_unitario: round2(costoUnitario),
      precio_unitario_venta: 0,
      saldo: round2(saldo),
      referencia_id: referenciaId,
      referencia_tipo: 'ajuste',
      motivo: String(motivo || '').trim(),
      usuario_email: String(usuarioEmail || '').trim(),
      createdAt: new Date()
    },
    { session }
  );
}

/**
 * Calcula la diferencia (delta) y el motivo textual para un ajuste.
 * @returns {{ delta: number, cantidadKardex: number, descripcion: string }}
 */
function calcularDeltaAjuste(tipo, cantidad, stockActual) {
  if (tipo === 'sumar') {
    return {
      delta: cantidad,
      cantidadKardex: cantidad,
      descripcion: `Ajuste manual: +${cantidad} unidades`
    };
  }
  if (tipo === 'restar') {
    return {
      delta: -cantidad,
      cantidadKardex: -cantidad,
      descripcion: `Ajuste manual: -${cantidad} unidades`
    };
  }
  // corregir: cantidad = stock final exacto
  const delta = round2(cantidad - stockActual);
  return {
    delta,
    cantidadKardex: delta,
    descripcion: `Ajuste manual: corrección de ${stockActual} → ${cantidad}`
  };
}

// ============================================================
// VALIDADORES
// ============================================================
const validarAjuste = [
  body('productoId')
    .exists().withMessage('productoId es obligatorio')
    .bail()
    .isMongoId().withMessage('ID de producto inválido'),

  body('tipo')
    .exists().withMessage('tipo es obligatorio')
    .bail()
    .isIn(CONFIG.tiposAjuste)
    .withMessage(`tipo debe ser uno de: ${CONFIG.tiposAjuste.join(', ')}`),

  body('cantidad')
    .exists().withMessage('cantidad es obligatoria')
    .bail()
    .isFloat({ min: 0, max: CONFIG.maxCantidadPorAjuste })
    .withMessage(`cantidad debe ser un número entre 0 y ${CONFIG.maxCantidadPorAjuste}`),

  body('motivo')
    .optional({ nullable: true })
    .isString().withMessage('motivo debe ser texto')
    .trim()
    .isLength({ max: CONFIG.motivoMaxLen })
    .withMessage(`motivo no puede superar ${CONFIG.motivoMaxLen} caracteres`)
];

const validarConteo = [
  body('diferencias')
    .exists().withMessage('diferencias es obligatorio')
    .bail()
    .isArray({ min: 1, max: CONFIG.maxDetallesConteo })
    .withMessage(`diferencias debe ser un array de 1 a ${CONFIG.maxDetallesConteo} elementos`)
    .custom((arr) => {
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        if (!it || typeof it !== 'object') {
          throw new Error(`Elemento ${i}: debe ser un objeto`);
        }
        if (!ObjectId.isValid(it.productoId)) {
          throw new Error(`Elemento ${i}: productoId inválido`);
        }
        const conteo = Number(it.conteoFisico);
        if (!Number.isFinite(conteo) || conteo < 0 || conteo > CONFIG.maxCantidadPorAjuste) {
          throw new Error(`Elemento ${i}: conteoFisico fuera de rango`);
        }
      }
      return true;
    }),

  body('motivo')
    .optional({ nullable: true })
    .isString().withMessage('motivo debe ser texto')
    .trim()
    .isLength({ max: CONFIG.motivoMaxLen })
    .withMessage(`motivo no puede superar ${CONFIG.motivoMaxLen} caracteres`)
];

// ============================================================
// POST /ajustar  → ajuste individual
// ------------------------------------------------------------
// Body: { productoId, tipo: 'sumar'|'restar'|'corregir', cantidad, motivo? }
// Respuesta: { message, ajuste: {...}, producto: {...} }
// ============================================================
router.post(
  '/ajustar',
  requierePermiso('inventario', 'ajustar'),
  validarAjuste,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const { productoId, tipo, cantidad, motivo } = req.body;

      const productoObjectId = new ObjectId(productoId);
      const cantidadNum = round2(toNumber(cantidad));
      const motivoLimpio = String(motivo || '').trim();

      // Guard: restar con cantidad 0 no tiene sentido
      if (tipo === 'restar' && cantidadNum <= 0) {
        return res.status(400).json({
          error: 'Para "restar" la cantidad debe ser mayor a 0',
          codigo: 'CANTIDAD_INVALIDA'
        });
      }

      const resultado = await conTransaccion(req.db, async (session) => {
        // 1. Leer producto actual (dentro de la transacción)
        const producto = await req.db
          .collection(CONFIG.colProductos)
          .findOne({ _id: productoObjectId }, { session });

        if (!producto) {
          const err = new Error('Producto no encontrado');
          err.status = 404;
          err.codigo = 'PRODUCTO_NOT_FOUND';
          throw err;
        }

        const stockActual = round2(toNumber(producto.stock));
        const { delta, cantidadKardex, descripcion } =
          calcularDeltaAjuste(tipo, cantidadNum, stockActual);

        // 2. Si es "corregir" y ya está en el valor pedido → no-op
        if (tipo === 'corregir' && delta === 0) {
          return {
            ajuste: {
              productoId: producto._id,
              tipo,
              cantidadAplicada: 0,
              stockAntes: stockActual,
              stockDespues: stockActual,
              motivo: motivoLimpio,
              sinCambio: true
            },
            producto
          };
        }

        // 3. Aplicar delta (con guard si es resta)
        const productoActualizado = await aplicarDeltaStock(
          req.db,
          productoObjectId,
          delta,
          session
        );

        // 4. Registrar en kardex
        await registrarKardexAjuste({
          db: req.db,
          productoId: productoObjectId,
          cantidad: cantidadKardex,
          saldo: productoActualizado.stock,
          costoUnitario: productoActualizado.precio_compra,
          session,
          referenciaId: productoObjectId,
          motivo: motivoLimpio,
          usuarioEmail: req.user?.email
        });

        return {
          ajuste: {
            productoId: producto._id,
            productoNombre: producto.nombre,
            productoCodigo: producto.codigo || '',
            tipo,
            cantidadAplicada: cantidadKardex,
            delta,
            stockAntes: stockActual,
            stockDespues: round2(toNumber(productoActualizado.stock)),
            motivo: motivoLimpio,
            descripcion,
            aplicadoEn: new Date(),
            aplicadoPor: req.user?.email || 'sistema'
          },
          producto: productoActualizado
        };
      });

      // 5. Auditoría (fuera de la transacción, nunca rompe la request)
      await auditarSeguro(req.db, req, {
        accion: 'ajustar-inventario',
        coleccion: CONFIG.colProductos,
        documentoId: productoObjectId,
        documentoNumero: resultado?.producto?.codigo || '',
        datosNuevos: resultado?.ajuste,
        detalle:
          `Ajuste ${tipo} (${resultado?.ajuste?.cantidadAplicada}) sobre ` +
          `"${resultado?.producto?.nombre || productoId}"` +
          (motivoLimpio ? ` — Motivo: ${motivoLimpio}` : '')
      });

      // 6. Emitir por WebSocket (si está disponible)
      if (req.io) {
        req.io.emit('inventario-ajustado', {
          productoId: String(productoObjectId),
          tipo,
          delta: resultado?.ajuste?.delta,
          stockNuevo: resultado?.ajuste?.stockDespues
        });
      }

      return res.status(201).json({
        message: resultado.ajuste.sinCambio
          ? 'Sin cambios: el stock ya estaba en el valor solicitado'
          : 'Ajuste aplicado correctamente',
        ajuste: resultado.ajuste,
        producto: resultado.producto
      });
    } catch (err) {
      log.error({ err: err.message }, 'Error aplicando ajuste de inventario');
      return next(err);
    }
  }
);

// ============================================================
// POST /conteo  → aplicar diferencias de un conteo físico
// ------------------------------------------------------------
// Body: { diferencias: [{ productoId, conteoFisico }], motivo? }
// Nota: el backend RECALCULA stockTeorico desde la BD para
//       evitar manipulación del payload.
// Respuesta: { message, ajustados, omitidos, ajustes: [...] }
// ============================================================
router.post(
  '/conteo',
  requierePermiso('inventario', 'ajustar'),
  validarConteo,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const { diferencias, motivo } = req.body;
      const motivoLimpio = String(motivo || 'Conteo físico').trim();

      const resultado = await conTransaccion(req.db, async (session) => {
        const ajustes = [];
        const omitidos = [];

        for (const it of diferencias) {
          const productoId = new ObjectId(it.productoId);
          const conteoFisico = round2(toNumber(it.conteoFisico));

          // 1. Leer producto actual
          const producto = await req.db
            .collection(CONFIG.colProductos)
            .findOne({ _id: productoId }, { session });

          if (!producto) {
            omitidos.push({
              productoId: it.productoId,
              motivo: 'Producto no encontrado'
            });
            continue;
          }

          const stockTeorico = round2(toNumber(producto.stock));
          const delta = round2(conteoFisico - stockTeorico);

          // 2. Sin diferencia → omitir
          if (delta === 0) {
            omitidos.push({
              productoId: it.productoId,
              productoNombre: producto.nombre,
              motivo: 'Sin diferencia',
              stock: stockTeorico
            });
            continue;
          }

          // 3. Aplicar delta (con guard si es resta)
          let productoActualizado;
          try {
            productoActualizado = await aplicarDeltaStock(
              req.db,
              productoId,
              delta,
              session
            );
          } catch (e) {
            // Si falla un producto (ej. stock insuficiente por race),
            // lo registramos como omitido y seguimos con el resto.
            if (e.codigo === 'STOCK_INSUFICIENTE' || e.codigo === 'PRODUCTO_NOT_FOUND') {
              omitidos.push({
                productoId: it.productoId,
                productoNombre: producto.nombre,
                motivo: e.message,
                codigo: e.codigo,
                stockTeorico,
                conteoFisico
              });
              continue;
            }
            throw e; // otros errores abortan la transacción completa
          }

          // 4. Kardex
          await registrarKardexAjuste({
            db: req.db,
            productoId,
            cantidad: delta,
            saldo: productoActualizado.stock,
            costoUnitario: productoActualizado.precio_compra,
            session,
            referenciaId: productoId,
            motivo: `Conteo físico: ${motivoLimpio}`,
            usuarioEmail: req.user?.email
          });

          ajustes.push({
            productoId: producto._id,
            productoNombre: producto.nombre,
            productoCodigo: producto.codigo || '',
            stockTeorico,
            conteoFisico,
            delta,
            stockDespues: round2(toNumber(productoActualizado.stock))
          });
        }

        return { ajustes, omitidos };
      });

      // Auditoría
      await auditarSeguro(req.db, req, {
        accion: 'conteo-inventario',
        coleccion: CONFIG.colProductos,
        documentoNumero: `${resultado.ajustes.length} ajustes`,
        datosNuevos: {
          totalRecibidos: diferencias.length,
          ajustados: resultado.ajustes.length,
          omitidos: resultado.omitidos.length,
          motivo: motivoLimpio,
          ajustes: resultado.ajustes.slice(0, 100) // limitar payload de auditoría
        },
        detalle:
          `Conteo físico aplicado: ${resultado.ajustes.length} ajuste(s), ` +
          `${resultado.omitidos.length} omitido(s)`
      });

      if (req.io && resultado.ajustes.length > 0) {
        req.io.emit('inventario-conteo-aplicado', {
          ajustados: resultado.ajustes.length
        });
      }

      return res.json({
        message: `Conteo aplicado: ${resultado.ajustes.length} ajuste(s), ${resultado.omitidos.length} omitido(s)`,
        ajustados: resultado.ajustes.length,
        omitidos: resultado.omitidos.length,
        ajustes: resultado.ajustes,
        omitidosDetalle: resultado.omitidos
      });
    } catch (err) {
      log.error({ err: err.message }, 'Error aplicando conteo de inventario');
      return next(err);
    }
  }
);

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._validarAjuste = validarAjuste;
module.exports._validarConteo = validarConteo;
module.exports._calcularDeltaAjuste = calcularDeltaAjuste;
module.exports._aplicarDeltaStock = aplicarDeltaStock;
module.exports._registrarKardexAjuste = registrarKardexAjuste;
module.exports._toNumber = toNumber;
module.exports._round2 = round2;