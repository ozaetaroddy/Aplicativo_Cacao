// backend/utils/backupScheduler.js
const cron = require('node-cron');
const { generarBackup, comprimirBackup, calcularTamano } = require('./backup');

let tareaActiva = null;
let dbGlobal = null;

const MAX_BACKUPS_AUTOMATICOS = 30;
const LIMITE_SEGURO = 15 * 1024 * 1024;

/**
 * Ejecuta un backup automático y lo guarda en BD.
 */
async function ejecutarBackupAutomatico(db) {
  try {
    console.log('🔄 Ejecutando backup automático...');
    const snapshot = await generarBackup(db);
    const tamanoSinComprimir = calcularTamano(snapshot);
    const buffer = comprimirBackup(snapshot);

    if (buffer.length > LIMITE_SEGURO) {
      console.warn(`⚠️ Backup automático demasiado grande (${(buffer.length / 1024 / 1024).toFixed(2)} MB). Se omite guardar en BD.`);
      return;
    }

    const backup = {
      nombre: `Backup automático del ${new Date().toLocaleString('es-EC')}`,
      tipo: 'automatico',
      descripcion: 'Generado por el scheduler',
      fecha: new Date(),
      usuario_id: null,
      usuario_email: 'sistema',
      tamano_sin_comprimir: tamanoSinComprimir,
      tamano_comprimido: buffer.length,
      contenido: buffer,
      colecciones: Object.keys(snapshot.colecciones).map(k => ({
        nombre: k,
        cantidad: snapshot.colecciones[k].length
      }))
    };

    await db.collection('backups').insertOne(backup);

    // Rotación
    const config = await db.collection('backup_config').findOne({ _id: 'global' });
    const retencion = config?.retencion || MAX_BACKUPS_AUTOMATICOS;

    const total = await db.collection('backups').countDocuments({ tipo: 'automatico' });
    if (total > retencion) {
      const sobrantes = await db.collection('backups')
        .find({ tipo: 'automatico' })
        .sort({ fecha: 1 })
        .limit(total - retencion)
        .project({ _id: 1 })
        .toArray();
      if (sobrantes.length > 0) {
        await db.collection('backups').deleteMany({
          _id: { $in: sobrantes.map(s => s._id) }
        });
        console.log(`🗑️ ${sobrantes.length} backups antiguos eliminados`);
      }
    }

    // Actualizar última ejecución
    await db.collection('backup_config').updateOne(
      { _id: 'global' },
      { $set: { ultima_ejecucion: new Date() } }
    );

    console.log(`✅ Backup automático completado (${(buffer.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error('❌ Error en backup automático:', err.message);
  }
}

/**
 * Inicia el scheduler.
 */
async function iniciarScheduler(db) {
  dbGlobal = db;

  // Cargar configuración
  let config = await db.collection('backup_config').findOne({ _id: 'global' });
  if (!config) {
    config = {
      _id: 'global',
      automatico_habilitado: true,
      cron: '0 3 * * *',
      retencion: MAX_BACKUPS_AUTOMATICOS,
      ultima_ejecucion: null
    };
    await db.collection('backup_config').insertOne(config);
  }

  if (!config.automatico_habilitado) {
    console.log('ℹ️ Backups automáticos deshabilitados');
    return;
  }

  if (tareaActiva) {
    tareaActiva.stop();
    tareaActiva = null;
  }

  if (!cron.validate(config.cron)) {
    console.error('❌ Expresión cron inválida:', config.cron);
    return;
  }

  tareaActiva = cron.schedule(config.cron, () => {
    ejecutarBackupAutomatico(dbGlobal);
  });

  console.log(`⏰ Backups automáticos programados: ${config.cron}`);
}

/**
 * Detiene el scheduler.
 */
function detenerScheduler() {
  if (tareaActiva) {
    tareaActiva.stop();
    tareaActiva = null;
    console.log('🛑 Scheduler de backups detenido');
  }
}

/**
 * Reinicia el scheduler con la configuración actual.
 */
async function reiniciarScheduler() {
  if (dbGlobal) {
    await iniciarScheduler(dbGlobal);
  }
}

module.exports = {
  iniciarScheduler,
  detenerScheduler,
  reiniciarScheduler,
  ejecutarBackupAutomatico
};