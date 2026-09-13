// backend/utils/transacciones.js
// Ejecuta una operación en transacción si MongoDB lo soporta.
// Si es standalone (sin replica set), ejecuta sin transacción (con session=null).

const cacheSoporte = new WeakMap(); // db → boolean

async function conTransaccion(db, callback) {
  if (!db || !db.client) {
    return await callback(null);
  }

  if (cacheSoporte.get(db) === false) {
    return await callback(null);
  }

  let session;
  try {
    session = db.client.startSession();
  } catch (_err) {
    cacheSoporte.set(db, false);
    return await callback(null);
  }

  try {
    let resultado;
    await session.withTransaction(async () => {
      resultado = await callback(session);
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
      (msg.includes('transaction') && msg.includes('only allowed')) ||
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

async function soportaTransacciones(db) {
  if (cacheSoporte.has(db)) return cacheSoporte.get(db);
  try {
    const hello = await db.admin().command({ hello: 1 });
    const soporta = !!hello.setName || hello.msg === 'isdbgrid';
    cacheSoporte.set(db, soporta);
    return soporta;
  } catch (_err) {
    cacheSoporte.set(db, false);
    return false;
  }
}

module.exports = { conTransaccion, soportaTransacciones };