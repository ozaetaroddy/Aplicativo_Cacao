// backend/utils/backupScheduler.js
const cron = require('node-cron');
const { generarBackup, comprimirBackup, calcularTamano } = require('./backup');
const { crearTransporter } = require('./emailService');

let tareaActiva = null;
let dbGlobal = null;
let enEjecucionLocal = false;

const MAX_BACKUPS_AUTOMATICOS = 30;
const LIMITE_SEGURO = 15 * 1024 * 1024;
const LOCK_MINUTOS = 30;

// Cantidad de fallos consecutivos antes de enviar alerta por email
const FALLOS_ANTES_DE_ALERTA = 2;

async function adquirirLock(db, owner) {
  const ahora = new Date();
  const expira = new Date(ahora.getTime() + LOCK_MINUTOS * 60 * 1000);
  const res = await db.collection('backup_lock').findOneAndUpdate(
    {
      _id: 'backup_lock',
      $or: [
        { expira: { $lt: ahora } },
        { expira: { $exists: false } },
        { owner }
      ]
    },
    { $set: { owner, expira, tomado_en: ahora } },
    { upsert: true, returnDocument: 'after' }
  );
  return res?.owner === owner;
}

async function liberarLock(db, owner) {
  try {
    await db.collection('backup_lock').updateOne(
      { _id: 'backup_lock', owner },
      { $unset: { owner: '', expira: '' }, $set: { liberado_en: new Date() } }
    );
  } catch (_) { /* noop */ }
}

/**
 * Obtiene los emails de administradores activos.
 * Si está definida la variable de entorno ADMIN_EMAILS, esa tiene prioridad.
 */
async function obtenerEmailsAdmin(db) {
  const envList = (process.env.ADMIN_EMAILS || '').trim();
  if (envList) {
    return envList.split(',').map(e => e.trim()).filter(Boolean);
  }
  try {
    const admins = await db.collection('usuarios').find(
      { rol: 'admin', activo: true },
      { projection: { email: 1 } }
    ).limit(5).toArray();
    return admins.map(a => a.email).filter(Boolean);
  } catch (_) {
    return [];
  }
}

async function enviarAlertaFallo(db, err, fallosConsecutivos) {
  const destinatarios = await obtenerEmailsAdmin(db);
  if (destinatarios.length === 0) {
    console.warn('⚠️  No hay destinatarios para la alerta de backup (ADMIN_EMAILS o admins activos)');
    return;
  }

  try {
    const transporter = crearTransporter();
    if (!transporter) {
      console.warn('⚠️  SMTP no configurado, no se envía alerta de backup');
      return;
    }

    const razonSocial = (await db.collection('configuracion').findOne({ _id: 'empresa' }))?.razon_social
      || 'Sistema Contable';

    const fecha = new Date().toLocaleString('es-EC');
    const asunto = `[ALERTA] Backup automático fallando — ${fallosConsecutivos} fallo(s) consecutivo(s)`;

    const cuerpo = `Se han detectado ${fallosConsecutivos} fallos consecutivos del backup automático.

Detalles:
  · Fecha del último fallo: ${fecha}
  · Error: ${err.message}

Acción recomendada:
  1. Revisar los logs del servidor.
  2. Verificar espacio en disco.
  3. Verificar tamaño de la base de datos (el backup se omite si supera 15 MB).
  4. Revisar el panel de Administración → Backups.

Sistema: ${razonSocial}
`;

    await transporter.sendMail({
      from: `"${razonSocial}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: destinatarios.join(', '),
      subject: asunto,
      text: cuerpo
    });

    console.log(`📧 Alerta de backup enviada a ${destinatarios.length} admin(s)`);
  } catch (e) {
    console.warn('⚠️  No se pudo enviar la alerta de backup:', e.message);
  }
}

async function registrarFallo(db, err) {
  try {
    const config = await db.collection('backup_config').findOne({ _id: 'global' });
    const fallos = (config?.fallos_consecutivos || 0) + 1;

    await db.collection('backup_config').updateOne(
      { _id: 'global' },
      {
        $set: {
          ultima_ejecucion: new Date(),
          ultimo_estado: 'error',
          ultimo_error: err.message,
          fallos_consecutivos: fallos
        }
      }
    );

    if (fallos === FALLOS_ANTES_DE_ALERTA) {
      await enviarAlertaFallo(db, err, fallos);
    }
  } catch (_) { /* noop */ }
}

async function registrarExito(db, tamanoBuffer) {
  try {
    await db.collection('backup_config').updateOne(
      { _id: 'global' },
      {
        $set: {
          ultima_ejecucion: new Date(),
          ultimo_estado: 'ok',
          ultimo_tamano: tamanoBuffer,
          fallos_consecutivos: 0,
          ultimo_error: null
        }
      }
    );
  } catch (_) { /* noop */ }
}

async function ejecutarBackupAutomatico(db) {
  if (enEjecucionLocal) {
    console.log('⏭️  Backup ya en ejecución, se omite este tick');
    return;
  }

  const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const lockTomado = await adquirirLock(db, owner);
  if (!lockTomado) {
    console.log('⏭️  Otro worker tiene el lock de backup, se omite');
    return;
  }

  enEjecucionLocal = true;
  const inicio = Date.now();

  try {
    console.log('🔄 Ejecutando backup automático...');

    const snapshot = await generarBackup(db);
    const tamanoSinComprimir = calcularTamano(snapshot);
    const buffer = comprimirBackup(snapshot);

    if (buffer.length > LIMITE_SEGURO) {
      console.warn(`⚠️  Backup demasiado grande (${(buffer.length / 1024 / 1024).toFixed(2)} MB). Se omite.`);
      await db.collection('backup_config').updateOne(
        { _id: 'global' },
        {
          $set: {
            ultima_ejecucion: new Date(),
            ultimo_estado: 'omitido_por_tamano',
            ultimo_tamano: buffer.length
          }
        }
      );
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
      duracion_ms: Date.now() - inicio,
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
        console.log(`🗑️  ${sobrantes.length} backups antiguos eliminados`);
      }
    }

    await registrarExito(db, buffer.length);

    console.log(`✅ Backup automático completado (${(buffer.length / 1024).toFixed(1)} KB en ${Date.now() - inicio}ms)`);
  } catch (err) {
    console.error('❌ Error en backup automático:', err.message);
    await registrarFallo(db, err);
  } finally {
    await liberarLock(db, owner);
    enEjecucionLocal = false;
  }
}

async function iniciarScheduler(db) {
  dbGlobal = db;

  let config = await db.collection('backup_config').findOne({ _id: 'global' });
  if (!config) {
    config = {
      _id: 'global',
      automatico_habilitado: true,
      cron: '0 3 * * *',
      retencion: MAX_BACKUPS_AUTOMATICOS,
      ultima_ejecucion: null,
      ultimo_estado: null,
      fallos_consecutivos: 0
    };
    await db.collection('backup_config').insertOne(config);
  }

  if (!config.automatico_habilitado) {
    console.log('ℹ️  Backups automáticos deshabilitados');
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
  }, { timezone: 'America/Guayaquil' });

  console.log(`⏰ Backups automáticos programados: ${config.cron} (America/Guayaquil)`);
}

function detenerScheduler() {
  if (tareaActiva) {
    tareaActiva.stop();
    tareaActiva = null;
    console.log('🛑 Scheduler de backups detenido');
  }
}

async function reiniciarScheduler() {
  if (dbGlobal) await iniciarScheduler(dbGlobal);
}

module.exports = {
  iniciarScheduler,
  detenerScheduler,
  reiniciarScheduler,
  ejecutarBackupAutomatico
};