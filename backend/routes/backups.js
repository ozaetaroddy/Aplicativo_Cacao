// backend/routes/backups.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');
const {
  generarBackup,
  comprimirBackup,
  descomprimirBackup,
  restaurarBackup,
  calcularTamano,
  extraerBufferContenido
} = require('../utils/backup');

const MAX_BACKUPS_AUTOMATICOS_DEFAULT = 30;

async function obtenerRetencion(db) {
  const config = await db.collection('backup_config').findOne({ _id: 'global' });
  const ret = parseInt(config?.retencion, 10);
  return ret > 0 ? ret : MAX_BACKUPS_AUTOMATICOS_DEFAULT;
}

// ===== LISTAR BACKUPS (metadata) =====
router.get('/', requierePermiso('backups', 'ver'), async (req, res) => {
  try {
    const backups = await req.db.collection('backups')
      .find({}, { projection: { contenido: 0 } })
      .sort({ fecha: -1 })
      .limit(100)
      .toArray();
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== GENERAR BACKUP PARA DESCARGA INMEDIATA =====
router.get('/download-now', requierePermiso('backups', 'ver'), async (req, res) => {
  try {
    const snapshot = await generarBackup(req.db);
    const buffer = comprimirBackup(snapshot);

    await logAudit(req.db, req, {
      accion: 'descargar',
      coleccion: 'backups',
      documentoNumero: 'backup-manual',
      detalle: `Backup manual descargado (${(buffer.length / 1024).toFixed(1)} KB)`
    });

    const filename = `backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('Error generando backup:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== CREAR Y GUARDAR BACKUP EN BD =====
router.post('/', requierePermiso('backups', 'crear'), async (req, res) => {
  try {
    const { nombre, tipo = 'manual', descripcion = '' } = req.body;

    const snapshot = await generarBackup(req.db);
    const tamanoSinComprimir = calcularTamano(snapshot);
    const buffer = comprimirBackup(snapshot);

    const LIMITE_SEGURO = 15 * 1024 * 1024;
    if (buffer.length > LIMITE_SEGURO) {
      return res.status(413).json({
        error: `El backup es demasiado grande (${(buffer.length / 1024 / 1024).toFixed(2)} MB). ` +
               `El límite es 15 MB. Use la descarga directa (/download-now) en su lugar.`
      });
    }

    const backup = {
      nombre: nombre || `Backup ${tipo} del ${new Date().toLocaleString('es-EC')}`,
      tipo,
      descripcion,
      fecha: new Date(),
      usuario_id: new ObjectId(req.user.userId),
      usuario_email: req.user.email,
      tamano_sin_comprimir: tamanoSinComprimir,
      tamano_comprimido: buffer.length,
      contenido: buffer,
      colecciones: Object.keys(snapshot.colecciones).map(k => ({
        nombre: k,
        cantidad: snapshot.colecciones[k].length
      }))
    };

    const result = await req.db.collection('backups').insertOne(backup);

    // Rotación: si es automático, respetar la config del usuario
    if (tipo === 'automatico') {
      const retencion = await obtenerRetencion(req.db);
      const total = await req.db.collection('backups').countDocuments({ tipo: 'automatico' });
      if (total > retencion) {
        const sobrantes = await req.db.collection('backups')
          .find({ tipo: 'automatico' })
          .sort({ fecha: 1 })
          .limit(total - retencion)
          .project({ _id: 1 })
          .toArray();
        if (sobrantes.length > 0) {
          await req.db.collection('backups').deleteMany({
            _id: { $in: sobrantes.map(s => s._id) }
          });
        }
      }
    }

    await logAudit(req.db, req, {
      accion: 'crear',
      coleccion: 'backups',
      documentoId: result.insertedId,
      documentoNumero: backup.nombre,
      detalle: `Backup creado: ${backup.nombre} (${(buffer.length / 1024).toFixed(1)} KB)`
    });

    const { contenido, ...metadata } = backup;
    res.status(201).json({ _id: result.insertedId, ...metadata });
  } catch (err) {
    console.error('Error creando backup:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== DESCARGAR UN BACKUP EXISTENTE =====
router.get('/:id/download', requierePermiso('backups', 'ver'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const backup = await req.db.collection('backups').findOne({ _id: new ObjectId(id) });
    if (!backup) return res.status(404).json({ error: 'Backup no encontrado' });

    const buffer = extraerBufferContenido(backup.contenido);
    if (!buffer) {
      return res.status(500).json({
        error: 'El contenido del backup está corrupto o en un formato no soportado',
        codigo: 'BACKUP_CORRUPTO'
      });
    }

    await logAudit(req.db, req, {
      accion: 'descargar',
      coleccion: 'backups',
      documentoId: id,
      documentoNumero: backup.nombre,
      detalle: `Backup descargado: ${backup.nombre}`
    });

    const filename = `${backup.nombre.replace(/[^a-z0-9]/gi, '_')}.json.gz`;

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('Error descargando backup:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== RESTAURAR UN BACKUP EXISTENTE =====
router.post('/:id/restore', requierePermiso('backups', 'restaurar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmacion } = req.body;

    if (confirmacion !== 'CONFIRMAR RESTAURACION') {
      return res.status(400).json({
        error: 'Debe enviar la confirmación exacta: "CONFIRMAR RESTAURACION"'
      });
    }

    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const backup = await req.db.collection('backups').findOne({ _id: new ObjectId(id) });
    if (!backup) return res.status(404).json({ error: 'Backup no encontrado' });

    const buffer = extraerBufferContenido(backup.contenido);
    if (!buffer) {
      return res.status(500).json({
        error: 'El contenido del backup está corrupto o en un formato no soportado',
        codigo: 'BACKUP_CORRUPTO'
      });
    }

    const snapshot = descomprimirBackup(buffer);
    const resultados = await restaurarBackup(req.db, snapshot);

    await logAudit(req.db, req, {
      accion: 'restaurar',
      coleccion: 'backups',
      documentoId: id,
      documentoNumero: backup.nombre,
      detalle: `Backup restaurado: ${backup.nombre}. Colecciones afectadas: ${resultados.length}`
    });

    res.json({ message: 'Backup restaurado correctamente', resultados });
  } catch (err) {
    console.error('Error restaurando backup:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== ELIMINAR UN BACKUP =====
router.delete('/:id', requierePermiso('backups', 'eliminar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const backup = await req.db.collection('backups').findOne({ _id: new ObjectId(id) });
    if (!backup) return res.status(404).json({ error: 'Backup no encontrado' });

    await req.db.collection('backups').deleteOne({ _id: new ObjectId(id) });

    await logAudit(req.db, req, {
      accion: 'eliminar',
      coleccion: 'backups',
      documentoId: id,
      documentoNumero: backup.nombre,
      detalle: `Backup eliminado: ${backup.nombre}`
    });

    res.json({ message: 'Backup eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== CONFIGURACIÓN DE BACKUPS AUTOMÁTICOS =====
router.get('/config', requierePermiso('backups', 'ver'), async (req, res) => {
  try {
    let config = await req.db.collection('backup_config').findOne({ _id: 'global' });
    if (!config) {
      config = {
        _id: 'global',
        automatico_habilitado: true,
        cron: '0 3 * * *',
        retencion: MAX_BACKUPS_AUTOMATICOS_DEFAULT,
        ultima_ejecucion: null
      };
      await req.db.collection('backup_config').insertOne(config);
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', requierePermiso('backups', 'crear'), async (req, res) => {
  try {
    const { automatico_habilitado, cron, retencion } = req.body;

    const update = { updatedAt: new Date() };
    if (typeof automatico_habilitado === 'boolean') update.automatico_habilitado = automatico_habilitado;
    if (typeof cron === 'string') update.cron = cron;
    if (typeof retencion === 'number' && retencion > 0) update.retencion = retencion;

    await req.db.collection('backup_config').updateOne(
      { _id: 'global' },
      { $set: update },
      { upsert: true }
    );

    const config = await req.db.collection('backup_config').findOne({ _id: 'global' });

    await logAudit(req.db, req, {
      accion: 'actualizar',
      coleccion: 'backup_config',
      documentoNumero: 'global',
      datosNuevos: update,
      detalle: 'Configuración de backups actualizada'
    });

    // Reiniciar scheduler para aplicar cambios en caliente
    try {
      const { reiniciarScheduler } = require('../utils/backupScheduler');
      await reiniciarScheduler();
    } catch (e) {
      console.warn('No se pudo reiniciar scheduler:', e.message);
    }

    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;