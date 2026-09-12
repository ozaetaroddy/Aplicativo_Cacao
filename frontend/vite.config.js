import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'apple-touch-icon.png',
        'robots.txt'
      ],
      manifest: {
        name: 'Sistema Contable — System Ozaet\'s Electronics',
        short_name: 'Sistema Contable',
        description: 'Sistema contable completo con facturación electrónica SRI para Ecuador',
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
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png'
          }
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
        // No cachear las llamadas a la API (siempre van a la red)
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Cachear catálogos del SRI (raramente cambian)
            urlPattern: /\/api\/catalogos.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'catalogos-sri',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 días
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Cachear catálogos base
            urlPattern: /\/api\/(categorias|productos)\b/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'maestros',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 1 día
              }
            }
          }
        ]
      },
      devOptions: {
        // Habilitar PWA en desarrollo (opcional)
        enabled: false
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      }
    }
  },
  build: {
    outDir: 'dist'
  }
})