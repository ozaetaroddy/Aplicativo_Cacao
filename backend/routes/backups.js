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
  calcularTamano
} = require('../utils/backup');

const MAX_BACKUPS_AUTOMATICOS = 30;

// ===== LISTAR BACKUPS (metadata) =====
router.get('/', requierePermiso('usuarios', 'ver'), async (req, res) => {
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
// No lo guarda en BD, solo lo envía al cliente.
router.get('/download-now', requierePermiso('usuarios', 'ver'), async (req, res) => {
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
router.post('/', requierePermiso('usuarios', 'ver'), async (req, res) => {
  try {
    const { nombre, tipo = 'manual', descripcion = '' } = req.body;

    const snapshot = await generarBackup(req.db);
    const tamanoSinComprimir = calcularTamano(snapshot);
    const buffer = comprimirBackup(snapshot);

    // Verificar tamaño máximo (MongoDB: 16MB por documento BSON)
    const LIMITE_SEGURO = 15 * 1024 * 1024; // 15 MB
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

    // Rotación: si es automático, mantener solo los últimos N
    if (tipo === 'automatico') {
      const total = await req.db.collection('backups').countDocuments({ tipo: 'automatico' });
      if (total > MAX_BACKUPS_AUTOMATICOS) {
        const sobrantes = await req.db.collection('backups')
          .find({ tipo: 'automatico' })
          .sort({ fecha: 1 })
          .limit(total - MAX_BACKUPS_AUTOMATICOS)
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
router.get('/:id/download', requierePermiso('usuarios', 'ver'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const backup = await req.db.collection('backups').findOne({ _id: new ObjectId(id) });
    if (!backup) return res.status(404).json({ error: 'Backup no encontrado' });

    const contenido = backup.contenido;
    if (!contenido) return res.status(404).json({ error: 'El backup no tiene contenido' });

    await logAudit(req.db, req, {
      accion: 'descargar',
      coleccion: 'backups',
      documentoId: id,
      documentoNumero: backup.nombre,
      detalle: `Backup descargado: ${backup.nombre}`
    });

    const buffer = contenido.buffer || contenido;
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
router.post('/:id/restore', requierePermiso('usuarios', 'eliminar'), async (req, res) => {
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

    const buffer = backup.contenido.buffer || backup.contenido;
    const snapshot = descomprimirBackup(buffer);

    const resultados = await restaurarBackup(req.db, snapshot);

    await logAudit(req.db, req, {
      accion: 'restaurar',
      coleccion: 'backups',
      documentoId: id,
      documentoNumero: backup.nombre,
      detalle: `Backup restaurado: ${backup.nombre}. Colecciones afectadas: ${resultados.length}`
    });

    res.json({
      message: 'Backup restaurado correctamente',
      resultados
    });
  } catch (err) {
    console.error('Error restaurando backup:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== ELIMINAR UN BACKUP =====
router.delete('/:id', requierePermiso('usuarios', 'editar'), async (req, res) => {
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
router.get('/config', requierePermiso('usuarios', 'ver'), async (req, res) => {
  try {
    let config = await req.db.collection('backup_config').findOne({ _id: 'global' });
    if (!config) {
      config = {
        _id: 'global',
        automatico_habilitado: true,
        cron: '0 3 * * *', // Todos los días a las 3 AM
        retencion: MAX_BACKUPS_AUTOMATICOS,
        ultima_ejecucion: null
      };
      await req.db.collection('backup_config').insertOne(config);
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', requierePermiso('usuarios', 'editar'), async (req, res) => {
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

    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;