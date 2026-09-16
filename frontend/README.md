# Sistema Contable — Frontend

Frontend Vue 3 + Vite del sistema contable con facturación electrónica SRI (Ecuador).

## 🧱 Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Vue 3 (`<script setup>`) |
| Estado | Pinia |
| Router | Vue Router 4 |
| Build | Vite |
| UI base | Bootstrap 5 + FontAwesome |
| Charts | Chart.js |
| PDF / Excel | jsPDF + AutoTable + xlsx |
| Validación | Vee-Validate + Yup |
| Búsqueda | Fuse.js |
| Notificaciones | vue-toastification |
| WebSocket | socket.io-client |
| PWA | vite-plugin-pwa |

## 🚀 Inicio rápido

### Requisitos
- **Node ≥ 20**
- **npm ≥ 10**
- Backend corriendo (por defecto en `http://localhost:5000`)

### Instalación

```bash
npm install
cp .env.example .env
```

Edita `.env` si tu backend no está en `http://localhost:5000`.

### Desarrollo

```bash
npm run dev
```

Abre http://localhost:5173. Vite proxea `/api` → `http://localhost:5000`, así que no necesitas CORS en dev.

### Producción

```bash
npm run build       # genera dist/
npm run preview     # sirve dist/ localmente para probar
```

## 🔧 Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Build de producción → `dist/` |
| `npm run preview` | Sirve `dist/` con host accesible |
| `npm run clean` | Borra `dist` y cache de Vite |

## 🌐 Variables de entorno

Todas las variables deben empezar con `VITE_` para estar disponibles en el bundle.

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Base URL de la API | `/api` (prod) o `http://localhost:5000/api` (dev) |
| `VITE_SOCKET_URL` | URL del servidor Socket.IO (solo si no se puede derivar) | `https://aplicativo-cacao.onrender.com` |
| `VITE_COMPANY_NAME` | Fallback del nombre de empresa | `System Ozaet's Electronics` |
| `VITE_IVA_PERCENTAGE` | IVA por defecto | `15` |
| `VITE_COMPANY_RUC` | RUC de fallback | `1234567890001` |

Ver `.env.example` para la lista completa.

## 🚢 Deployment

### Vercel (recomendado)

El proyecto incluye `vercel.json` con:
- **Rewrites** `/api/*` → backend en Render (evita CORS).
- **Security headers** (CSP, HSTS, X-Frame-Options, etc.).
- **Cache headers** para assets hasheados y el Service Worker.

**Pasos:**
1. Conecta el repo a Vercel.
2. Framework preset: **Vite**.
3. Build command: `npm run build`.
4. Output dir: `dist`.
5. Variables de entorno:
   - `VITE_API_BASE_URL=/api`
   - `VITE_SOCKET_URL=https://aplicativo-cacao.onrender.com`

> ⚠️ **Importante sobre WebSocket**: Vercel **NO** soporta rewrites de WebSocket. El cliente conecta directo al backend en Render. Eso significa que la CSP debe permitir `wss://aplicativo-cacao.onrender.com`.

## 🧩 Estructura

```
src/
├── assets/          # imágenes, fuentes
├── components/      # componentes reutilizables
├── composables/     # lógica reutilizable (composition API)
├── layouts/         # layouts de página
├── router/          # configuración de rutas
├── services/        # clientes HTTP / API
├── stores/          # Pinia stores
├── utils/           # helpers puros (formatters, validators, etc.)
├── views/           # páginas por ruta
├── App.vue
├── main.js
└── styles.css
```

## 🔐 Seguridad

- **Autenticación por cookies httpOnly**: el JWT nunca toca `localStorage`.
- **CSRF**: el cliente envía `X-Requested-With: XMLHttpRequest` en cada request mutante.
- **CSP**: configurada vía `vercel.json` headers (no meta tag).
- **PWA Service Worker**: solo en producción, con `autoUpdate`.

## 🐛 Debug

- **Charts no renderizan**: verifica que `Chart.register(...registerables)` se ejecute antes del primer `<canvas>`.
- **WebSocket no conecta en prod**: revisa que `VITE_SOCKET_URL` apunte al backend **sin** `/api` al final.
- **Cookies no viajan**: en cross-site, el backend debe usar `SameSite=None; Secure` (ver `COOKIE_CROSS_SITE=true` en el backend).

## 📄 Licencia

UNLICENSED — uso interno.