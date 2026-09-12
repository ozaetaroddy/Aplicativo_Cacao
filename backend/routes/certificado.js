// backend/routes/certificado.js
const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');
const { cargarCertificado, cifrarSecreto } = require('../utils/firmaElectronica');

const MAX_BASE64_LEN = 20 * 1024 * 1024;
const MAX_PASSWORD_LEN = 200;
const MAX_NOMBRE_ARCHIVO_LEN = 200;

/**
 * Intenta extraer el RUC del subject/issuer del certificado.
 * Los certificados ecuatorianos lo incluyen en:
 *   - CN="APELLIDO NOMBRE" serialNumber=0992...001  (con prefijo RUC)
 *   - O="EMPRESA S.A." serialNumber=0992...001
 *   - SubjectAltName a veces
 * Probamos varios patrones y validamos que no venga pegado a otro dígito.
 */
function extraerRucDelCertificado(certificate) {
  const candidatos = [certificate.subject, certificate.issuer].filter(Boolean);

  for (const fuente of candidatos) {
    const s = String(fuente);

    // 1. RUC explícito: "RUC: 0992...", "RUC=0992...", "serialNumber=0992..."
    let m = s.match(/(?:RUC|serialNumber|SERIALNUMBER)[^\d]*(\d{13})(?!\d)/i);
    if (m) return m[1];

    // 2. Cualquier 13 dígitos que no esté rodeado de otros dígitos
    m = s.match(/(?:^|[^\d])(\d{13})(?!\d)/);
    if (m) return m[1];
  }
  return null;
}

router.post('/subir', requierePermiso('certificados', 'crear'), async (req, res) => {
  try {
    const { archivo_base64, password, nombre_archivo } = req.body;

    if (typeof archivo_base64 !== 'string' || archivo_base64.length === 0) {
      return res.status(400).json({ error: 'archivo_base64 debe ser un string no vacío' });
    }
    if (typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'password debe ser un string no vacío' });
    }
    if (password.length > MAX_PASSWORD_LEN) {
      return res.status(400).json({ error: `password demasiado largo (máx ${MAX_PASSWORD_LEN} caracteres)` });
    }
    if (nombre_archivo !== undefined && nombre_archivo !== null) {
      if (typeof nombre_archivo !== 'string' || nombre_archivo.length > MAX_NOMBRE_ARCHIVO_LEN) {
        return res.status(400).json({ error: 'nombre_archivo inválido' });
      }
    }
    if (archivo_base64.length > MAX_BASE64_LEN) {
      return res.status(413).json({
        error: `El archivo es demasiado grande. Límite: ~15 MB binarios (${(MAX_BASE64_LEN / 1024 / 1024).toFixed(0)} MB en base64)`
      });
    }

    let p12Buffer;
    try {
      p12Buffer = Buffer.from(archivo_base64, 'base64');
    } catch (e) {
      return res.status(400).json({ error: 'El archivo no es un base64 válido' });
    }

    if (p12Buffer.length === 0) return res.status(400).json({ error: 'El archivo está vacío' });
    if (p12Buffer[0] !== 0x30) {
      return res.status(400).json({ error: 'El archivo no parece ser un certificado .p12/.pfx válido' });
    }

    let certificado;
    try {
      certificado = cargarCertificado(p12Buffer, password);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const ahora = new Date();
    const notBefore = new Date(certificado.certificate.validityNotBefore);
    const notAfter = new Date(certificado.certificate.validityNotAfter);

    if (ahora < notBefore) {
      return res.status(400).json({
        error: `El certificado aún no es válido. Vigente desde: ${notBefore.toLocaleDateString('es-EC')}`
      });
    }
    if (ahora > notAfter) {
      return res.status(400).json({
        error: `El certificado ha expirado el: ${notAfter.toLocaleDateString('es-EC')}`
      });
    }

    const config = await req.db.collection('configuracion').findOne({ _id: 'empresa' });
    const rucEmpresa = config?.ruc;

    if (rucEmpresa && rucEmpresa.length === 13) {
      const rucCert = extraerRucDelCertificado(certificado.certificate);
      if (!rucCert) {
        return res.status(400).json({
          error: 'No se pudo determinar el RUC del certificado. Verifique que sea un certificado de firma electrónica ecuatoriano.',
          codigo: 'RUC_NO_DETECTADO',
          subject: certificado.certificate.subject,
          issuer: certificado.certificate.issuer,
          serialNumber: certificado.certificate.serialNumber
        });
      }
      if (rucCert !== rucEmpresa) {
        return res.status(400).json({
          error: `El certificado pertenece al RUC ${rucCert}, pero la empresa está configurada con el RUC ${rucEmpresa}. Corrija la configuración o cargue el certificado correcto.`,
          codigo: 'RUC_NO_COINCIDE',
          rucCertificado: rucCert,
          rucEmpresa
        });
      }
    }

    const passwordCifrado = cifrarSecreto(password);

    const docCert = {
      _id: 'empresa',
      archivo_base64,
      password_cifrado: passwordCifrado,
      nombre_archivo: (nombre_archivo || 'certificado.p12').trim(),
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
      accion: 'subir', coleccion: 'certificados',
      documentoNumero: docCert.nombre_archivo,
      datosNuevos: {
        subject: certificado.certificate.subject,
        issuer: certificado.certificate.issuer,
        vence: certificado.certificate.validityNotAfter
      },
      detalle: `Certificado subido: ${certificado.certificate.subject}`
    });

    res.json({
      message: 'Certificado cargado correctamente',
      certificado: {
        subject: certificado.certificate.subject,
        issuer: certificado.certificate.issuer,
        serialNumber: certificado.certificate.serialNumber,
        valido_desde: certificado.certificate.validityNotBefore,
        valido_hasta: certificado.certificate.validityNotAfter,
        dias_restantes: certificado.certificate.diasRestantes
      }
    });
  } catch (err) {
    console.error('Error subiendo certificado:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/info', requierePermiso('certificados', 'ver'), async (req, res) => {
  try {
    const cert = await req.db.collection('certificados').findOne(
      { _id: 'empresa' },
      { projection: { archivo_base64: 0, password: 0, password_cifrado: 0 } }
    );

    if (!cert) return res.json({ cargado: false });

    const ahora = new Date();
    const vence = new Date(cert.info.validityNotAfter);
    const diasRestantes = Math.ceil((vence - ahora) / 86400000);

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

router.delete('/', requierePermiso('certificados', 'eliminar'), async (req, res) => {
  try {
    const { confirmacion } = req.body || {};
    if (confirmacion !== 'ELIMINAR CERTIFICADO') {
      return res.status(400).json({
        error: 'Debe enviar { "confirmacion": "ELIMINAR CERTIFICADO" } para confirmar',
        codigo: 'CONFIRMACION_REQUERIDA'
      });
    }

    const cert = await req.db.collection('certificados').findOne({ _id: 'empresa' });
    if (!cert) return res.status(404).json({ error: 'No hay certificado cargado' });

    const pendientes = await req.db.collection('ventas_v2').countDocuments({
      estado_sri: 'PENDIENTE',
      xml_generado: { $exists: true, $ne: '' }
    });

    if (pendientes > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: hay ${pendientes} documentos pendientes de firma. Fírmelos o elimínelos primero.`,
        pendientes
      });
    }

    await req.db.collection('certificados').deleteOne({ _id: 'empresa' });

    await logAudit(req.db, req, {
      accion: 'eliminar', coleccion: 'certificados',
      documentoNumero: cert.nombre_archivo,
      detalle: 'Certificado de firma electrónica eliminado'
    });

    res.json({ message: 'Certificado eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/verificar', requierePermiso('certificados', 'ver'), async (req, res) => {
  try {
    const cert = await req.db.collection('certificados').findOne(
      { _id: 'empresa' },
      { projection: { info: 1 } }
    );
    if (!cert) return res.json({ valido: false, motivo: 'No hay certificado cargado' });

    const ahora = new Date();
    const vence = new Date(cert.info.validityNotAfter);
    if (ahora > vence) return res.json({ valido: false, motivo: 'Certificado vencido' });

    res.json({ valido: true, subject: cert.info.subject, valido_hasta: cert.info.validityNotAfter });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;