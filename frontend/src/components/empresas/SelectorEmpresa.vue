<template>
  <div class="selector-page">
    <!-- Fondo decorativo -->
    <div class="selector-bg" aria-hidden="true">
      <div class="bg-shape bg-shape-1"></div>
      <div class="bg-shape bg-shape-2"></div>
    </div>

    <div class="selector-content">
      <!-- Header -->
      <div class="selector-header">
        <div class="selector-brand">
          <div class="brand-logo" aria-hidden="true">
            <i class="fas fa-calculator"></i>
          </div>
          <div>
            <div class="brand-name">Sistema Contable</div>
            <div class="brand-sub">System Ozaet's Electronics</div>
          </div>
        </div>

        <button
          type="button"
          class="btn-logout"
          @click="cerrarSesion"
          :disabled="cerrando"
        >
          <i
            class="fas fa-sign-out-alt"
            :class="{ 'fa-spin': cerrando }"
            aria-hidden="true"
          ></i>
          Cerrar sesión
        </button>
      </div>

      <!-- Bienvenida -->
      <div class="selector-hero">
        <div class="hero-greeting">
          <i class="fas fa-hand-sparkles" aria-hidden="true"></i>
          <span>Hola, <strong>{{ nombreUsuario }}</strong></span>
        </div>
        <h1 class="hero-title">
          {{ tieneEmpresas ? '¿Con qué empresa vas a trabajar?' : 'Empecemos creando tu primera empresa' }}
        </h1>
        <p class="hero-subtitle">
          {{
            tieneEmpresas
              ? 'Selecciona la empresa para cargar sus datos, facturas y comprobantes.'
              : 'Registra los datos fiscales de la empresa para poder emitir comprobantes electrónicos al SRI.'
          }}
        </p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="selector-loading">
        <div class="spinner-lg"></div>
        <p>Cargando tus empresas...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="selector-error">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <div>
          <strong>No pudimos cargar tus empresas</strong>
          <div class="small">{{ error }}</div>
        </div>
        <button type="button" class="btn-retry" @click="recargar" :disabled="loading">
          <i class="fas fa-sync" aria-hidden="true"></i> Reintentar
        </button>
      </div>

      <!-- Empty -->
      <div v-else-if="!tieneEmpresas" class="selector-empty">
        <div class="empty-icon">
          <i class="fas fa-building" aria-hidden="true"></i>
        </div>
        <div class="empty-title">Aún no tienes empresas</div>
        <div class="empty-text">
          Crea tu primera empresa para empezar a facturar electrónicamente.
        </div>
        <button type="button" class="btn-crear-empty" @click="abrirModalCrear">
          <i class="fas fa-plus" aria-hidden="true"></i>
          Crear primera empresa
        </button>
      </div>

      <!-- Grid de empresas -->
      <div v-else class="empresas-grid">
        <button
          v-for="emp in empresas"
          :key="emp._id"
          type="button"
          class="empresa-card"
          :class="{ 'empresa-activa': esActiva(emp) }"
          @click="seleccionar(emp)"
          :disabled="activandoId === emp._id"
        >
          <div class="empresa-card-header">
            <div class="empresa-avatar" :style="{ background: colorFor(emp) }">
              {{ inicial(emp) }}
            </div>
            <div class="empresa-ambiente" :class="emp.ambiente === '2' ? 'amb-prod' : 'amb-test'">
              <i :class="emp.ambiente === '2' ? 'fas fa-check-circle' : 'fas fa-flask'" aria-hidden="true"></i>
              {{ emp.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS' }}
            </div>
          </div>

          <div class="empresa-info">
            <div class="empresa-nombre" :title="emp.nombre_comercial || emp.razon_social">
              {{ emp.nombre_comercial || emp.razon_social || 'Empresa sin nombre' }}
            </div>
            <div v-if="emp.nombre_comercial && emp.razon_social !== emp.nombre_comercial" class="empresa-razon">
              {{ emp.razon_social }}
            </div>
            <div class="empresa-ruc">
              <i class="fas fa-id-card" aria-hidden="true"></i>
              {{ emp.ruc }}
            </div>
          </div>

          <div class="empresa-actions">
            <button
              type="button"
              class="btn-icon-edit"
              @click.stop="editar(emp)"
              title="Editar"
              aria-label="Editar empresa"
            >
              <i class="fas fa-pen" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="btn-icon-delete"
              @click.stop="confirmarEliminar(emp)"
              title="Eliminar"
              aria-label="Eliminar empresa"
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </div>

          <div v-if="activandoId === emp._id" class="empresa-overlay">
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            <span>Cargando...</span>
          </div>

          <div v-else-if="esActiva(emp)" class="empresa-badge-activa">
            <i class="fas fa-check-circle" aria-hidden="true"></i>
            Última activa
          </div>
        </button>

        <!-- Card "Nueva empresa" -->
        <button
          type="button"
          class="empresa-card empresa-card-new"
          @click="abrirModalCrear"
        >
          <div class="new-icon">
            <i class="fas fa-plus" aria-hidden="true"></i>
          </div>
          <div class="new-title">Nueva empresa</div>
          <div class="new-text">Registrar otro RUC</div>
        </button>
      </div>
    </div>

    <!-- Modal crear/editar -->
    <ModalNuevaEmpresa
      ref="modalRef"
      :empresa-a-editar="empresaEditando"
      @creada="onEmpresaCreada"
      @actualizada="onEmpresaActualizada"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import { useEmpresasStore } from '../../stores/empresasStore'
import { useAuth } from '../../composables/useAuth'
import { useConfirmDialog } from '../../composables/useConfirmDialog'
import ModalNuevaEmpresa from './ModalNuevaEmpresa.vue'

const router = useRouter()
const toast = useToast()
const empresasStore = useEmpresasStore()
const { user, logout } = useAuth()
const { pedirConfirmacion } = useConfirmDialog()

const modalRef = ref(null)
const empresaEditando = ref(null)
const activandoId = ref(null)
const cerrando = ref(false)

let unmounted = false

const empresas = computed(() => empresasStore.empresas)
const loading = computed(() => empresasStore.loading && !empresasStore.loaded)
const error = computed(() => empresasStore.error)
const tieneEmpresas = computed(() => empresasStore.tieneEmpresas)

const nombreUsuario = computed(() => {
  const n = user.value?.nombre
  if (!n || typeof n !== 'string') return 'Usuario'
  return n.split(/\s+/)[0] || 'Usuario'
})

// ===== HELPERS VISUALES =====
const inicial = (emp) => {
  const s = String(emp?.nombre_comercial || emp?.razon_social || '?').trim()
  return s ? s[0].toUpperCase() : '?'
}

const colorFor = (emp) => {
  // Hash simple del RUC → color de la paleta
  const paleta = [
    'linear-gradient(135deg, #2563eb, #1d4ed8)',
    'linear-gradient(135deg, #10b981, #059669)',
    'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    'linear-gradient(135deg, #f59e0b, #d97706)',
    'linear-gradient(135deg, #ef4444, #dc2626)',
    'linear-gradient(135deg, #06b6d4, #0891b2)'
  ]
  const ruc = String(emp?.ruc || '0')
  let hash = 0
  for (let i = 0; i < ruc.length; i++) {
    hash = (hash * 31 + ruc.charCodeAt(i)) >>> 0
  }
  return paleta[hash % paleta.length]
}

const esActiva = (emp) =>
  String(empresasStore.empresaActivaId) === String(emp._id)

// ===== CARGA =====
const recargar = async () => {
  try {
    await empresasStore.cargarEmpresas(true)
    if (unmounted) return
    // Si después de recargar solo queda 1 empresa, auto-entrar
    autoEntrarSiUna()
  } catch { /* el error ya está en el store */ }
}

const autoEntrarSiUna = () => {
  if (empresas.value.length === 1) {
    // Auto-activar y entrar directo
    seleccionar(empresas.value[0])
  }
}

// ===== SELECCIÓN =====
const seleccionar = async (emp) => {
  if (!emp?._id || activandoId.value) return
  if (esActiva(emp) && empresasStore.empresaActivaId) {
    // Ya está activa → entrar directo
    router.push('/')
    return
  }

  activandoId.value = emp._id
  try {
    await empresasStore.activarEmpresa(emp._id)
    if (unmounted) return
    toast.success(`Cargando ${emp.nombre_comercial || emp.razon_social}...`)
    router.push('/')
  } catch (e) {
    if (unmounted) return
    toast.error('No se pudo activar la empresa: ' + (e?.message || 'error'))
  } finally {
    if (!unmounted) activandoId.value = null
  }
}

// ===== CREAR / EDITAR =====
const abrirModalCrear = () => {
  empresaEditando.value = null
  modalRef.value?.abrir()
}

const editar = (emp) => {
  empresaEditando.value = emp
  modalRef.value?.abrir(emp)
}

const onEmpresaCreada = (nuevaEmpresa) => {
  // Auto-seleccionar la empresa recién creada
  if (nuevaEmpresa?._id) {
    seleccionar(nuevaEmpresa)
  }
}

const onEmpresaActualizada = () => {
  empresaEditando.value = null
}

// ===== ELIMINAR =====
const confirmarEliminar = async (emp) => {
  const nombre = emp.nombre_comercial || emp.razon_social || 'esta empresa'

  const ok = await pedirConfirmacion({
    titulo: 'Eliminar empresa',
    mensaje: `¿Eliminar <strong>${escapeHtml(nombre)}</strong> (RUC ${escapeHtml(emp.ruc)})?`,
    detalle:
      'Esta acción es irreversible. Se eliminarán TODOS los documentos asociados: facturas, compras, clientes, productos, kardex, etc.',
    textoConfirmar: 'Sí, eliminar todo',
    textoCancelar: 'Cancelar',
    variante: 'danger',
    icono: 'fas fa-trash'
  })
  if (!ok) return

  try {
    await empresasStore.eliminarEmpresa(emp._id)
    if (unmounted) return
    toast.success('Empresa eliminada')
    // Si era la activa, redirigir a selector (ya estará vacío)
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'EMPRESA_CON_DOCUMENTOS') {
      toast.error(
        e.message ||
          'La empresa tiene documentos asociados. No se puede eliminar.'
      )
    } else {
      toast.error('Error: ' + (e?.message || 'error'))
    }
  }
}

// ===== LOGOUT =====
const cerrarSesion = async () => {
  if (cerrando.value) return
  cerrando.value = true
  try {
    await logout()
    // `logout()` ya redirige a /login
  } finally {
    if (!unmounted) cerrando.value = false
  }
}

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// ===== LIFECYCLE =====
onMounted(async () => {
  try {
    await empresasStore.cargarEmpresas(true)
    if (unmounted) return
    // Si ya tiene empresa activa y solo una → entrar directo
    if (empresasStore.empresaActivaId && empresas.value.length === 1) {
      router.replace('/')
      return
    }
    autoEntrarSiUna()
  } catch { /* error ya manejado */ }
})

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.selector-page {
  min-height: 100vh;
  position: relative;
  background: linear-gradient(135deg, #0f1626 0%, #1a2332 50%, #2c3e50 100%);
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

/* Fondo decorativo */
.selector-bg {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.bg-shape {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.35;
  animation: floatShape 20s ease-in-out infinite;
}
.bg-shape-1 {
  width: 500px; height: 500px;
  background: radial-gradient(circle, #2563eb, transparent);
  top: -15%; left: -10%;
}
.bg-shape-2 {
  width: 400px; height: 400px;
  background: radial-gradient(circle, #f59e0b, transparent);
  bottom: -10%; right: -10%;
  animation-delay: -10s;
  opacity: 0.2;
}
@keyframes floatShape {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(30px, -30px) scale(1.05); }
}

.selector-content {
  position: relative;
  z-index: 1;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 24px 60px;
  flex: 1;
}

/* Header */
.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 48px;
}
.selector-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.brand-logo {
  width: 44px; height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  box-shadow: 0 8px 20px rgba(52, 152, 219, 0.4);
}
.brand-name {
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
}
.brand-sub {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.72rem;
  margin-top: 2px;
}
.btn-logout {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 10px;
  border: 1.5px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.85);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(8px);
}
.btn-logout:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}
.btn-logout:disabled { opacity: 0.6; cursor: not-allowed; }

/* Hero */
.selector-hero {
  text-align: center;
  margin-bottom: 40px;
}
.hero-greeting {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 16px;
  backdrop-filter: blur(8px);
}
.hero-greeting i { color: #fbbf24; }
.hero-greeting strong { color: #fff; }

.hero-title {
  font-size: clamp(1.5rem, 3.5vw, 2rem);
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.03em;
  margin: 0 0 10px;
  line-height: 1.15;
}
.hero-subtitle {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.65);
  max-width: 560px;
  margin: 0 auto;
  line-height: 1.55;
}

/* Loading / Error */
.selector-loading,
.selector-error {
  text-align: center;
  padding: 60px 20px;
  color: rgba(255, 255, 255, 0.7);
}
.selector-loading .spinner-lg {
  width: 44px; height: 44px;
  margin: 0 auto 16px;
  border: 4px solid rgba(255, 255, 255, 0.15);
  border-top-color: #3498db;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.selector-error {
  display: flex;
  align-items: center;
  gap: 14px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 14px;
  padding: 20px 24px;
  text-align: left;
  color: #fca5a5;
  max-width: 560px;
  margin: 0 auto;
}
.selector-error > i { font-size: 1.6rem; flex-shrink: 0; }
.selector-error > div { flex: 1; min-width: 0; }
.selector-error strong { color: #fff; display: block; margin-bottom: 2px; }
.selector-error .small { font-size: 0.78rem; opacity: 0.9; }
.btn-retry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}
.btn-retry:hover:not(:disabled) { background: rgba(255, 255, 255, 0.15); }
.btn-retry:disabled { opacity: 0.5; cursor: not-allowed; }

/* Empty */
.selector-empty {
  text-align: center;
  padding: 60px 20px;
  max-width: 480px;
  margin: 0 auto;
}
.empty-icon {
  width: 96px; height: 96px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.4rem;
  margin: 0 auto 24px;
}
.empty-title {
  color: #fff;
  font-weight: 700;
  font-size: 1.25rem;
  margin-bottom: 8px;
}
.empty-text {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.9rem;
  margin-bottom: 28px;
  line-height: 1.5;
}
.btn-crear-empty {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 28px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.4);
  transition: all 0.2s ease;
}
.btn-crear-empty:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(37, 99, 235, 0.5);
}

/* Grid */
.empresas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.empresa-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  background: rgba(20, 30, 48, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1.5px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: all 0.25s ease;
  overflow: hidden;
}
.empresa-card:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(30, 45, 70, 0.85);
  transform: translateY(-4px);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
}
.empresa-card:disabled { cursor: wait; opacity: 0.85; }

.empresa-card.empresa-activa {
  border-color: rgba(37, 99, 235, 0.5);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.15);
}

.empresa-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.empresa-avatar {
  width: 52px; height: 52px;
  border-radius: 14px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.35rem;
  flex-shrink: 0;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
}

.empresa-ambiente {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}
.amb-prod {
  background: rgba(16, 185, 129, 0.18);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.amb-test {
  background: rgba(245, 158, 11, 0.18);
  color: #fcd34d;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.empresa-info { flex: 1; min-width: 0; }
.empresa-nombre {
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empresa-razon {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.75rem;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empresa-ruc {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.8rem;
  font-family: 'JetBrains Mono', monospace;
  display: flex;
  align-items: center;
  gap: 6px;
}
.empresa-ruc i { color: #60a5fa; font-size: 0.72rem; }

.empresa-actions {
  display: flex;
  gap: 6px;
  position: absolute;
  top: 16px;
  right: 16px;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.empresa-card:hover .empresa-actions { opacity: 1; }
.btn-icon-edit,
.btn-icon-delete {
  width: 32px; height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.3);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  backdrop-filter: blur(8px);
  transition: all 0.15s ease;
}
.btn-icon-edit:hover {
  background: rgba(37, 99, 235, 0.5);
  border-color: rgba(37, 99, 235, 0.8);
}
.btn-icon-delete:hover {
  background: rgba(239, 68, 68, 0.5);
  border-color: rgba(239, 68, 68, 0.8);
}

.empresa-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #fff;
  font-weight: 600;
  font-size: 0.9rem;
}
.empresa-overlay i { font-size: 1.5rem; }

.empresa-badge-activa {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: rgba(37, 99, 235, 0.2);
  border: 1px solid rgba(37, 99, 235, 0.5);
  border-radius: 999px;
  color: #93c5fd;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Card nueva */
.empresa-card-new {
  border-style: dashed;
  background: rgba(20, 30, 48, 0.4);
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 180px;
}
.empresa-card-new:hover {
  border-color: rgba(37, 99, 235, 0.5);
  background: rgba(37, 99, 235, 0.08);
}
.new-icon {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: rgba(37, 99, 235, 0.15);
  border: 1.5px solid rgba(37, 99, 235, 0.4);
  color: #60a5fa;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  margin-bottom: 4px;
}
.new-title {
  color: #fff;
  font-weight: 700;
  font-size: 0.95rem;
}
.new-text {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.78rem;
}

/* Responsive */
@media (max-width: 640px) {
  .selector-content { padding: 20px 16px 40px; }
  .selector-header { margin-bottom: 32px; }
  .brand-sub { display: none; }
  .empresas-grid { grid-template-columns: 1fr; gap: 14px; }
}

@media (prefers-reduced-motion: reduce) {
  .bg-shape { animation: none; }
  .empresa-card, .btn-crear-empty, .btn-logout { transition: none; }
}
</style>