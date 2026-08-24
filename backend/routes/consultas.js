const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

// Endpoint para consultar cédula en EcuadorLegal
router.get('/cedula/:cedula', async (req, res) => {
  try {
    const { cedula } = req.params;

    // Validar que tenga 10 dígitos
    if (!cedula || cedula.length !== 10 || !/^\d+$/.test(cedula)) {
      return res.status(400).json({ error: 'Cédula inválida (debe tener 10 dígitos)' });
    }

    // Hacer la petición POST a EcuadorLegal
    const response = await axios.post(
      'https://www.ecuadorlegalonline.com/consultar-nombre-cedula/',
      new URLSearchParams({ cedula }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    );

    const html = response.data;
    const $ = cheerio.load(html);

    // Buscar el nombre en el HTML
    // EcuadorLegal muestra el nombre en un <td> dentro de la tabla de resultados
    let nombre = null;

    // Opción 1: Buscar la fila de la tabla que contiene el nombre
    $('table tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        // Asumiendo que el nombre está en la segunda celda
        const texto = $(cells[1]).text().trim();
        if (texto && texto.length > 2) {
          nombre = texto;
          return false; // salir del each
        }
      }
    });

    // Si no se encontró con la opción 1, buscar cualquier texto que parezca un nombre
    if (!nombre) {
      const textoPagina = $('body').text();
      // Buscar patrones de nombres (al menos dos palabras con mayúsculas)
      const match = textoPagina.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+/);
      if (match) {
        nombre = match[0];
      }
    }

    if (!nombre) {
      return res.status(404).json({ error: 'No se encontró información para esta cédula' });
    }

    res.json({ nombre });
  } catch (error) {
    console.error('Error consultando EcuadorLegal:', error.message);
    res.status(500).json({ error: 'Error al consultar el servicio externo' });
  }
});

module.exports = router;