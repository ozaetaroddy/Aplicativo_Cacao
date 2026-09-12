// backend/routes/consultas.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const rateLimit = require('express-rate-limit');
const { requierePermiso } = require('../utils/permisos');
const { validarCedula } = require('../utils/validators'); // 🔒 reutiliza el validador central

const DEBUG = process.env.SRI_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
function debugLog(...args) {
  if (DEBUG) console.log('[CONSULTAS]', ...args);
}

const consultaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas. Espere un momento.' }
});

const CACHE_DIAS = 30;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extraerNombre($) {
  let nombre = null;
  $('table tbody tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 2) {
      const texto = $(cells[1]).text().trim();
      if (texto && texto.length > 2) {
        nombre = texto;
        return false;
      }
    }
  });
  if (nombre) return nombre;

  const texto = $('body').text();
  const regex = /(?:Nombre|NOMBRE|Apellidos|APELLIDOS)\s*:\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]+)/;
  const m = texto.match(regex);
  if (m && m[1]) return m[1].trim();

  const m2 = texto.match(/([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,})/);
  return m2 ? m2[0].trim() : null;
}

router.get('/cedula/:cedula',
  requierePermiso('clientes', 'ver'),
  consultaLimiter,
  async (req, res) => {
    try {
      const { cedula } = req.params;

      if (!/^\d{10}$/.test(cedula)) {
        return res.status(400).json({ error: 'Cédula inválida (debe tener 10 dígitos)' });
      }
      if (!validarCedula(cedula)) {
        return res.status(400).json({ error: 'Cédula inválida (dígito verificador incorrecto)' });
      }

      const cacheKey = `cedula:${cedula}`;

      try {
        const cached = await req.db.collection('cache_consultas').findOne({
          _id: cacheKey,
          expira: { $gt: new Date() }
        });
        if (cached && cached.nombre) {
          return res.json({ nombre: cached.nombre, cache: true, consultado_en: cached.consultado_en });
        }
      } catch (e) { /* noop */ }

      debugLog(`Consultando cédula: ${cedula}`);
      let response;
      try {
        response = await axios.post(
          'https://www.ecuadorlegalonline.com/consultar-nombre-cedula/',
          new URLSearchParams({ cedula }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': USER_AGENT,
              'Accept': 'text/html,application/xhtml+xml',
              'Accept-Language': 'es-EC,es;q=0.9'
            },
            timeout: 12000,
            maxRedirects: 3
          }
        );
      } catch (err) {
        if (err.code === 'ECONNABORTED') {
          return res.status(504).json({ error: 'Timeout consultando el servicio externo' });
        }
        return res.status(502).json({ error: 'Servicio externo no disponible' });
      }

      const $ = cheerio.load(response.data);
      const nombre = extraerNombre($);

      if (!nombre) {
        debugLog(`No se encontró nombre para la cédula ${cedula}`);
        return res.status(404).json({ error: 'No se encontró información para esta cédula' });
      }

      try {
        const expira = new Date(Date.now() + CACHE_DIAS * 24 * 60 * 60 * 1000);
        await req.db.collection('cache_consultas').updateOne(
          { _id: cacheKey },
          {
            $set: {
              tipo: 'cedula',
              identificacion: cedula,
              nombre,
              consultado_en: new Date(),
              expira
            }
          },
          { upsert: true }
        );
      } catch (e) {
        console.warn('No se pudo guardar cache:', e.message);
      }

      debugLog(`Nombre encontrado: ${nombre}`);
      res.json({ nombre, cache: false });
    } catch (error) {
      console.error('Error en consulta de cédula:', error.message);
      res.status(500).json({ error: 'Error al consultar el servicio externo' });
    }
  }
);

router.delete('/cache/:cedula', requierePermiso('clientes', 'editar'), async (req, res) => {
  try {
    const { cedula } = req.params;
    await req.db.collection('cache_consultas').deleteOne({ _id: `cedula:${cedula}` });
    res.json({ message: 'Cache eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;