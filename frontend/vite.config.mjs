// frontend/vite.config.mjs
// ============================================================
// Configuración de Vite
// ------------------------------------------------------------
// - Plugins: Vue 3 SFC + PWA.
// - Dev server: proxy /api → backend local.
// - Build: code-splitting agresivo, sin sourcemaps, sin console.
// - PWA: autoUpdate, runtimeCaching para catálogos SRI.
// ============================================================

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProd = mode === 'production'
  const devBackend = env.VITE_DEV_BACKEND || 'http://localhost:5000'

  return {
    base: '/',

    plugins: [
      vue(),

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
          navigateFallbackDenylist: [/^\/api/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: /\/api\/catalogos.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'catalogos-sri',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
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

    server: {
      port: 5173,
      strictPort: false,
      host: true,
      proxy: {
        '/api': {
          target: devBackend,
          changeOrigin: true,
          ws: true
        }
      }
    },

    optimizeDeps: {
      include: [
        'vue',
        'vue-router',
        'pinia',
        // ⚠️ 'axios' eliminado: NO está en package.json
        //    (usás fetch nativo en services/api.js)
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

    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 800,
      target: 'es2020',
      cssCodeSplit: true,
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return

            if (
              id.includes('/vue/') ||
              id.includes('/@vue/') ||
              id.includes('/vue-router/') ||
              id.includes('/pinia/')
            ) {
              return 'vue-core'
            }

            if (id.includes('/chart.js/') || id.includes('/chartjs-')) {
              return 'charts'
            }

            if (
              id.includes('/jspdf') ||
              id.includes('/html2canvas/') ||
              id.includes('/dompurify/')
            ) {
              return 'pdf'
            }

            if (id.includes('/xlsx/')) return 'xlsx'
            if (id.includes('/@fortawesome/')) return 'fontawesome'
            if (id.includes('/bootstrap/') || id.includes('/@popperjs/')) return 'bootstrap'
            if (id.includes('/vee-validate/') || id.includes('/yup/')) return 'validation'
            if (id.includes('/fuse.js/')) return 'search'
            if (id.includes('/vue-draggable-next/')) return 'dnd'

            return 'vendor'
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      },
      minify: 'esbuild'
    },

    esbuild: isProd
      ? {
          drop: ['console', 'debugger'],
          legalComments: 'none'
        }
      : undefined,

    css: {
      devSourcemap: true,
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ['legacy-js-api', 'import']
        }
      }
    },

    define: {
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
    }
  }
})