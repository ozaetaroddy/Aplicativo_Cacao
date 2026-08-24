const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

router.get('/cedula/:cedula', async (req, res) => {
  try {
    const { cedula } = req.params;

    if (!cedula || cedula.length !== 10 || !/^\d+$/.test(cedula)) {
      return res.status(400).json({ error: 'Cédula inválida (debe tener 10 dígitos)' });
    }

    console.log(`🔍 Consultando cédula: ${cedula}`);

    const response = await axios.post(
      'https://www.ecuadorlegalonline.com/consultar-nombre-cedula/',
      new URLSearchParams({ cedula }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      }
    );

    const html = response.data;
    const $ = cheerio.load(html);

    let nombre = null;

    // Estrategia 1: Buscar en la tabla de resultados (clase específica)
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

    // Estrategia 2: Buscar cualquier texto que parezca un nombre completo
    if (!nombre) {
      const texto = $('body').text();
      // Patrón: dos o más palabras con mayúscula inicial
      const match = texto.match(/([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,})/);
      if (match) {
        nombre = match[0].trim();
      }
    }

    // Estrategia 3: Buscar después de "Nombre:" o "Cédula:"
    if (!nombre) {
      const texto = $('body').text();
      const regex = /(?:Nombre|NOMBRE|Apellidos|APELLIDOS)\s*:\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]+)/;
      const match = texto.match(regex);
      if (match && match[1]) {
        nombre = match[1].trim();
      }
    }

    if (!nombre) {
      console.log(`❌ No se encontró nombre para la cédula ${cedula}`);
      return res.status(404).json({ error: 'No se encontró información para esta cédula' });
    }

    console.log(`✅ Nombre encontrado: ${nombre}`);
    res.json({ nombre });

  } catch (error) {
    console.error('❌ Error en scraping:', error.message);
    res.status(500).json({ error: 'Error al consultar el servicio externo' });
  }
});

module.exports = router;