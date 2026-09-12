// backend/utils/transacciones.js
// Ejecuta una operación en transacción si MongoDB lo soporta.
// Si es standalone (sin replica set), ejecuta sin transacción (con session=null).
//
// Uso:
//   const result = await conTransaccion(req.db, async (session) => {
//     await col.updateOne({...}, {$set:{...}}, { session });
//     return { ok: true };
//   });

const cacheSoporte = new WeakMap(); // db → boolean

/**
 * Ejecuta un callback en transacción si es posible.
 * El callback recibe `session` (puede ser null si no hay soporte).
 */
async function conTransaccion(db, callback) {
  if (!db || !db.client) {
    // Sin cliente Mongo real, ejecutar sin session
    return await callback(null);
  }

  // Si ya sabemos que no soporta, evitamos el intento
  if (cacheSoporte.get(db) === false) {
    return await callback(null);
  }

  let session;
  try {
    session = db.client.startSession();
  } catch (_err) {
    // Standalone sin soporte: no se puede crear session
    cacheSoporte.set(db, false);
    return await callback(null);
  }

  try {
    let resultado;
    await session.withTransaction(async () => {
      resultado = await callback(session);
      // ⚠️  MongoDB exige que el callback retorne algo distinto de null/undefined.
      //     Retornamos true para cumplir con la restricción.
      return true;
    });
    cacheSoporte.set(db, true);
    return resultado;
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    const noSoporta =
      msg.includes('transaction numbers') ||
      msg.includes('transactions are not supported') ||
      msg.includes('replica set') ||
      msg.includes('transaction') && msg.includes('only allowed') ||
      msg.includes('does not support transactions');

    if (noSoporta) {
      console.warn('⚠️  MongoDB sin soporte de transacciones, ejecutando sin ellas');
      cacheSoporte.set(db, false);
      return await callback(null);
    }
    throw err;
  } finally {
    try { await session.endSession(); } catch (_) { /* noop */ }
  }
}

/**
 * Devuelve true/false sin ejecutar nada (útil para diagnóstico).
 */
async function soportaTransacciones(db) {
  if (cacheSoporte.has(db)) return cacheSoporte.get(db);
  try {
    const hello = await db.admin().command({ hello: 1 });
    // Replica set: tiene setName
    // Sharded cluster: msg = 'isdbgrid'
    const soporta = !!hello.setName || hello.msg === 'isdbgrid';
    cacheSoporte.set(db, soporta);
    return soporta;
  } catch (_err) {
    cacheSoporte.set(db, false);
    return false;
  }
}

module.exports = { conTransaccion, soportaTransacciones };