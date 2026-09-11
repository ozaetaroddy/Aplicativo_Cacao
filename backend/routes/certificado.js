// backend/routes/certificado.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');
const { cargarCertificado } = require('../utils/firmaElectronica');

// ===== SUBIR CERTIFICADO .P12 =====
// Recibe el archivo en base64 en el body
router.post('/subir', requierePermiso('usuarios', 'editar'), async (req, res) => {
  try {
    const { archivo_base64, password, nombre_archivo } = req.body;

    if (!archivo_base64) {
      return res.status(400).json({ error: 'No se recibió el archivo del certificado' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Se requiere la contraseña del certificado' });
    }

    // Decodificar base64
    const p12Buffer = Buffer.from(archivo_base64, 'base64');

    // Validar que sea un archivo .p12 válido
    let certificado;
    try {
      certificado = cargarCertificado(p12Buffer, password);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    // Verificar fecha de validez
    const ahora = new Date();
    const notBefore = new Date(certificado.certificate.validityNotBefore);
    const notAfter = new Date(certificado.certificate.validityNotAfter);

    if (ahora < notBefore) {
      return res.status(400).json({
        error: `El certificado aún no es válido. Vigente desde: ${notBefore.toLocaleDateString()}`
      });
    }
    if (ahora > notAfter) {
      return res.status(400).json({
        error: `El certificado ha expirado. Venció el: ${notAfter.toLocaleDateString()}`
      });
    }

    // Guardar en la colección "certificados" (reemplazar el anterior)
    // Guardamos el .p12 en base64 y el password cifrado simple (mejor cifrarlo con una key del env)
    const cifradoKey = process.env.CERT_ENCRYPTION_KEY || 'default-key-change-me';

    const docCert = {
      _id: 'empresa',
      archivo_base64: archivo_base64,
      password: password, // En producción, cifrar con crypto
      nombre_archivo: nombre_archivo || 'certificado.p12',
      info: certificado.certificate,
      subido_por: req.user.email,
      subido_en: new Date(),
      actualizado_en: new Date()
    };

    await req.db.collection('certificados').updateOne(
      { _id: 'empresa' },
      { $set: docCert },
      { upsert: true }
    );

    await logAudit(req.db, req, {
      accion: 'subir',
      coleccion: 'certificados',
      documentoNumero: docCert.nombre_archivo,
      datosNuevos: {
        subject: certificado.certificate.subject,
        vence: certificado.certificate.validityNotAfter
      },
      detalle: `Certificado de firma electrónica subido: ${certificado.certificate.subject}`
    });

    res.json({
      message: 'Certificado cargado correctamente',
      certificado: {
        subject: certificado.certificate.subject,
        issuer: certificado.certificate.issuer,
        serialNumber: certificado.certificate.serialNumber,
        valido_desde: certificado.certificate.validityNotBefore,
        valido_hasta: certificado.certificate.validityNotAfter,
        dias_restantes: Math.ceil((notAfter - ahora) / (1000 * 60 * 60 * 24))
      }
    });
  } catch (err) {
    console.error('Error subiendo certificado:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== OBTENER INFO DEL CERTIFICADO ACTUAL =====
router.get('/info', requierePermiso('usuarios', 'ver'), async (req, res) => {
  try {
    const cert = await req.db.collection('certificados').findOne(
      { _id: 'empresa' },
      { projection: { archivo_base64: 0, password: 0 } }
    );

    if (!cert) {
      return res.json({ cargado: false });
    }

    const ahora = new Date();
    const vence = new Date(cert.info.validityNotAfter);
    const diasRestantes = Math.ceil((vence - ahora) / (1000 * 60 * 60 * 24));

    res.json({
      cargado: true,
      nombre_archivo: cert.nombre_archivo,
      info: cert.info,
      subido_por: cert.subido_por,
      subido_en: cert.subido_en,
      dias_restantes: diasRestantes,
      vencido: diasRestantes < 0,
      por_vencer: diasRestantes >= 0 && diasRestantes < 30
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ELIMINAR CERTIFICADO =====
router.delete('/', requierePermiso('usuarios', 'editar'), async (req, res) => {
  try {
    const cert = await req.db.collection('certificados').findOne({ _id: 'empresa' });
    if (!cert) {
      return res.status(404).json({ error: 'No hay certificado cargado' });
    }

    await req.db.collection('certificados').deleteOne({ _id: 'empresa' });

    await logAudit(req.db, req, {
      accion: 'eliminar',
      coleccion: 'certificados',
      documentoNumero: cert.nombre_archivo,
      detalle: 'Certificado de firma electrónica eliminado'
    });

    res.json({ message: 'Certificado eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== VERIFICAR SI HAY CERTIFICADO VÁLIDO =====
router.get('/verificar', async (req, res) => {
  try {
    const cert = await req.db.collection('certificados').findOne({ _id: 'empresa' });
    if (!cert) {
      return res.json({ valido: false, motivo: 'No hay certificado cargado' });
    }
    const ahora = new Date();
    const vence = new Date(cert.info.validityNotAfter);
    if (ahora > vence) {
      return res.json({ valido: false, motivo: 'Certificado vencido' });
    }
    res.json({
      valido: true,
      subject: cert.info.subject,
      valido_hasta: cert.info.validityNotAfter
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;