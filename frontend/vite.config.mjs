// frontend/vite.config.mjs
// ============================================================
// Configuración de Vite
// ------------------------------------------------------------
// - Plugins: Vue 3 SFC + PWA.
// - Dev server: proxy /api → backend local.
// - Build: code-splitting agresivo, sin sourcemaps, sin console.
// - PWA: autoUpdate, runtimeCaching para catálogos SRI.
//
// ⚠️  Este archivo es .mjs (módulo ESM nativo). El comentario
//     original decía "vite.config.js" pero el archivo es .mjs.
// ============================================================

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  // Carga .env, .env.local, .env.[mode], .env.[mode].local
  const env = loadEnv(mode, process.cwd(), '')
  const isProd = mode === 'production'

  // Proxy del backend en dev (configurable vía VITE_DEV_BACKEND).
  const devBackend = env.VITE_DEV_BACKEND || 'http://localhost:5000'

  return {
    // Si despliegas en un subpath, cámbialo aquí (ej. '/app/').
    base: '/',

    plugins: [
      vue(),

      // ======================================================
      // PWA
      // ======================================================
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: [
          'favicon.ico',
          'favicon.svg',
          'apple-touch-icon.png',
          'robots.txt'
        ],
        manifest: {
          name: "Sistema Contable — System Ozaet's Electronics",
          short_name: 'Sistema Contable',
          description:
            'Sistema contable completo con facturación electrónica SRI para Ecuador',
          theme_color: '#1a3a5c',
          background_color: '#1a3a5c',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          lang: 'es-EC',
          dir: 'ltr',
          categories: ['business', 'finance', 'productivity'],
          icons: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
          ],
          shortcuts: [
            {
              name: 'Nueva Factura',
              short_name: 'Factura',
              description: 'Crear nueva factura electrónica',
              url: '/ventas/nuevo?tipo=factura',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
            },
            {
              name: 'Consultar Documentos',
              short_name: 'Consultar',
              description: 'Buscar comprobantes emitidos',
              url: '/consultar-documentos',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
            },
            {
              name: 'Bandeja de Ventas',
              short_name: 'Ventas',
              description: 'Ver todas las ventas',
              url: '/ventas',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // No interceptar /api (deja pasar al network y al rewrite de Vercel).
          navigateFallbackDenylist: [/^\/api/],
          // Limpia caches antiguos al activar la nueva versión.
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              // Catálogos SRI: inmutables → CacheFirst con TTL largo.
              urlPattern: /\/api\/catalogos.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'catalogos-sri',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              // Maestros (categorías/productos): NetworkFirst con fallback.
              urlPattern: /\/api\/(categorias|productos)\b/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'maestros',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ]
        },
        devOptions: { enabled: false }
      })
    ],

    // ======================================================
    // DEV SERVER
    // ======================================================
    server: {
      port: 5173,
      strictPort: false,
      host: true, // permite acceso desde móvil en la misma red
      proxy: {
        '/api': {
          target: devBackend,
          changeOrigin: true,
          // WebSocket también por el proxy (socket.io en dev).
          ws: true
          // No rewrite: el backend espera /api/*
        }
      }
    },

    // ======================================================
    // OPTIMIZACIÓN DE DEPENDENCIAS
    // ======================================================
    optimizeDeps: {
      include: [
        'vue',
        'vue-router',
        'pinia',
        'axios',
        'socket.io-client',
        'chart.js',
        'chart.js/auto',
        'jspdf',
        'jspdf-autotable',
        'xlsx',
        'fuse.js',
        'vue-toastification'
      ]
    },

    // ======================================================
    // BUILD
    // ======================================================
    build: {
      outDir: 'dist',
      sourcemap: false,
      // Avisar a partir de 800 KB (en vez de 1200) para detectar chunks
      // que crezcan sin control — el manualChunks de abajo debería
      // mantenernos por debajo.
      chunkSizeWarningLimit: 800,
      target: 'es2020',
      cssCodeSplit: true,
      reportCompressedSize: false, // build más rápido
      rollupOptions: {
        output: {
          // ================================================
          // MANUAL CHUNKS — separa vendors grandes
          // ================================================
          manualChunks(id) {
            if (!id.includes('node_modules')) return

            // Vue core + router + estado
            if (
              id.includes('/vue/') ||
              id.includes('/@vue/') ||
              id.includes('/vue-router/') ||
              id.includes('/pinia/')
            ) {
              return 'vue-core'
            }

            // Gráficas (Chart.js es pesado)
            if (id.includes('/chart.js/') || id.includes('/chartjs-')) {
              return 'charts'
            }

            // PDFs (jsPDF + html2canvas son MUY pesados ~500 KB)
            if (
              id.includes('/jspdf') ||
              id.includes('/html2canvas/') ||
              id.includes('/dompurify/')
            ) {
              return 'pdf'
            }

            // Excel (xlsx ~400 KB)
            if (id.includes('/xlsx/')) {
              return 'xlsx'
            }

            // Iconos FontAwesome
            if (id.includes('/@fortawesome/')) {
              return 'fontawesome'
            }

            // Bootstrap + Popper
            if (
              id.includes('/bootstrap/') ||
              id.includes('/@popperjs/')
            ) {
              return 'bootstrap'
            }

            // Validación
            if (id.includes('/vee-validate/') || id.includes('/yup/')) {
              return 'validation'
            }

            // Búsqueda y drag&drop
            if (id.includes('/fuse.js/')) return 'search'
            if (id.includes('/vue-draggable-next/')) return 'dnd'

            // Resto de vendors → chunk compartido
            return 'vendor'
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      },
      // Elimina console/debugger en prod (Vite usa esbuild)
      minify: 'esbuild'
    },

    esbuild: isProd
      ? {
          drop: ['console', 'debugger'],
          legalComments: 'none'
        }
      : undefined,

    // ======================================================
    // CSS
    // ======================================================
    css: {
      devSourcemap: true,
      preprocessorOptions: {
        scss: {
          // Silencia deprecaciones de Sass que rompen la consola.
          silenceDeprecations: ['legacy-js-api', 'import']
        }
      }
    },

    // ======================================================
    // DEFINES GLOBALES
    // ======================================================
    define: {
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
    }
  }
})