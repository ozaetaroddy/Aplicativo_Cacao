// backend/utils/swagger.js
// Configuración de Swagger UI + JSDoc discovery.
// Los comentarios @openapi se agregan por encima de cada router.

const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const IS_PROD = process.env.NODE_ENV === 'production';

function buildSpec() {
  const options = {
    definition: {
      openapi: '3.0.3',
      info: {
        title: 'Cacao Backend API',
        version: require('../package.json').version,
        description: 'API para sistema contable con facturación electrónica SRI Ecuador'
      },
      servers: [
        { url: '/api', description: 'API base' }
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              codigo: { type: 'string' }
            }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    apis: [
      path.join(__dirname, '..', 'routes', '*.js')
    ]
  };
  return swaggerJsdoc(options);
}

function mountSwagger(app) {
  // ✅ FIX: default false en producción, true en desarrollo.
  const defaultEnabled = IS_PROD ? 'false' : 'true';
  const enabled = String(process.env.SWAGGER_ENABLED ?? defaultEnabled) === 'true';

  if (!enabled) {
    return;
  }

  let swaggerUi;
  try {
    swaggerUi = require('swagger-ui-express');
  } catch (_err) {
    console.warn('⚠️  swagger-ui-express no instalado — /api/docs deshabilitado');
    return;
  }

  const spec = buildSpec();
  app.get('/api/docs.json', (req, res) => res.json(spec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customSiteTitle: 'API — Cacao Backend'
  }));

  console.log('📚 Swagger disponible en /api/docs');
}

module.exports = { buildSpec, mountSwagger };