<template>
  <div class="gestionar-empresas-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-building"></i></span>
          Mis Empresas
        </h1>
        <p class="page-subtitle">
          Administra las empresas que manejas desde este sistema
        </p>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="btn-secondary"
          @click="cargar"
          :disabled="loading"
        >
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }" aria-hidden="true"></i>
          Actualizar
        </button>
        <button type="button" class="btn-primary" @click="abrirModalCrear">
          <i class="fas fa-plus" aria-hidden="true"></i>
          Nueva empresa
        </button>
      </div>
    </div>

    <!-- Info -->
    <div class="info-card">
      <div class="info-icon"><i class="fas fa-info-circle" aria-hidden="true"></i></div>
      <div class="info-body">
        <strong>¿Cómo funciona?</strong>
        <div class="small">
          Cada empresa tiene sus propios documentos, clientes, productos y
          configuración de facturación electrónica. Puedes alternar entre
          empresas desde el menú superior sin perder tu sesión.
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading && !loaded" class="loading-block">
      <div class="spinner-lg"></div>
      <p>Cargando empresas...</p>
    </div>

    <!-- Empty -->
    <div v-else-if="!tieneEmpresas" class="empty-block">
      <div class="empty-icon"><i class="fas fa-building" aria-hidden="true"></i></div>
      <div class="empty-title">Aún no tienes empresas</div>
      <div class="empty-text">
        Crea tu primera empresa para empezar a emitir comprobantes
        electrónicos.
      </div>
      <button type="button" class="btn-primary-large" @click="abrirModalCrear">
        <i class="fas fa-plus" aria-hidden="true"></i>
        Crear primera empresa
      </button>
    </div>

    <!-- Grid -->
    <div v-else class="empresas-grid">
      <div
        v-for="emp in empresas"
        :key="emp._id"
        class="empresa-row"
        :class="{ 'empresa-row-activa': esActiva(emp) }"
      >
        <div class="empresa-avatar" :style="{ background: colorFor(emp) }">
          {{ inicial(emp) }}
        </div>

        <div class="empresa-info">
          <div class="empresa-nombre">
            {{ emp.nombre_comercial || emp.razon_social || 'Sin nombre' }}
            <span
              v-if="esActiva(emp)"
              class="badge-activa"
              title="Empresa activa"
            >
              <i class="fas fa-check" aria-hidden="true"></i> ACTIVA
            </span>
          </div>
          <div v-if="emp.nombre_comercial && emp.razon_social !== emp.nombre_comercial" class="empresa-razon">
            {{ emp.razon_social }}
          </div>
          <div class="empresa-meta">
            <span><i class="fas fa-id-card" aria-hidden="true"></i> {{ emp.ruc }}</span>
            <span :class="emp.ambiente === '2' ? 'text-success' : 'text-warning'">
              <i :class="emp.ambiente === '2' ? 'fas fa-check-circle' : 'fas fa-flask'" aria-hidden="true"></i>
              {{ emp.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS' }}
            </span>
            <span v-if="emp.email"><i class="fas fa-envelope" aria-hidden="true"></i> {{ emp.email }}</span>
          </div>
        </div>

        <div class="empresa-actions">
          <button
            v-if="!esActiva(emp)"
            type="button"
            class="btn-accion btn-cambiar"
            @click="cambiarA(emp)"
            :disabled="activandoId === emp._id"
          >
            <i
              class="fas fa-exchange-alt"
              :class="{ 'fa-spin': activandoId === emp._id }"
              aria-hidden="true"
            ></i>
            Cambiar a esta
          </button>
          <button
            type="button"
            class="btn-accion btn-editar"
            @click="editar(emp)"
            title="Editar"
          >
            <i class="fas fa-pen" aria-hidden="true"></i>
            Editar
          </button>
          <button
            type="button"
            class="btn-accion btn-eliminar"
            @click="confirmarEliminar(emp)"
            :disabled="empresas.length === 1 && esActiva(emp)"
            :title="empresas.length === 1 ? 'No puedes eliminar la única empresa' : 'Eliminar'"
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal -->
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
import { useConfirmDialog } from '../../composables/useConfirmDialog'
import ModalNuevaEmpresa from './ModalNuevaEmpresa.vue'

const router = useRouter()
const toast = useToast()
const empresasStore = useEmpresasStore()
const { pedirConfirmacion } = useConfirmDialog()

const modalRef = ref(null)
const empresaEditando = ref(null)
const activandoId = ref(null)

let unmounted = false

const empresas = computed(() => empresasStore.empresas)
const loading = computed(() => empresasStore.loading)
const loaded = computed(() => empresasStore.loaded)
const tieneEmpresas = computed(() => empresasStore.tieneEmpresas)

const inicial = (emp) => {
  const s = String(emp?.nombre_comercial || emp?.razon_social || '?').trim()
  return s ? s[0].toUpperCase() : '?'
}

const colorFor = (emp) => {
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
  for (let i = 0; i < ruc.length; i++) hash = (hash * 31 + ruc.charCodeAt(i)) >>> 0
  return paleta[hash % paleta.length]
}

const esActiva = (emp) =>
  String(empresasStore.empresaActivaId) === String(emp._id)

const cargar = async () => {
  try {
    await empresasStore.cargarEmpresas(true)
  } catch { /* error ya está en el store */ }
}

const abrirModalCrear = () => {
  empresaEditando.value = null
  modalRef.value?.abrir()
}

const editar = (emp) => {
  empresaEditando.value = emp
  modalRef.value?.abrir(emp)
}

const cambiarA = async (emp) => {
  if (activandoId.value) return
  activandoId.value = emp._id
  try {
    await empresasStore.activarEmpresa(emp._id)
    if (unmounted) return
    toast.success(`Ahora trabajas en ${emp.nombre_comercial || emp.razon_social}`)
    // Recargar la página para que todo el árbol de componentes
    // se remonte con la nueva empresa (fetch de datos desde cero).
    setTimeout(() => {
      if (!unmounted) window.location.href = '/'
    }, 600)
  } catch (e) {
    if (unmounted) return
    toast.error('No se pudo cambiar: ' + (e?.message || 'error'))
  } finally {
    if (!unmounted) activandoId.value = null
  }
}

const confirmarEliminar = async (emp) => {
  if (empresas.value.length === 1 && esActiva(emp)) {
    toast.warning('No puedes eliminar la única empresa')
    return
  }

  const nombre = emp.nombre_comercial || emp.razon_social || 'esta empresa'
  const esLaActiva = esActiva(emp)

  const ok = await pedirConfirmacion({
    titulo: 'Eliminar empresa',
    mensaje: `¿Eliminar <strong>${escapeHtml(nombre)}</strong> (RUC ${escapeHtml(emp.ruc)})?`,
    detalle: esLaActiva
      ? 'Esta es la empresa ACTIVA. Al eliminarla, se te pedirá elegir otra. Se borrarán TODOS sus documentos.'
      : 'Se borrarán TODOS los documentos asociados a esta empresa: facturas, compras, clientes, productos, kardex, etc.',
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

    // Si eliminamos la activa → recargar para que el guard nos mande al selector
    if (esLaActiva) {
      setTimeout(() => {
        if (!unmounted) window.location.href = '/'
      }, 500)
    }
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'EMPRESA_CON_DOCUMENTOS') {
      toast.error(
        e.message || 'La empresa tiene documentos asociados y no puede eliminarse.'
      )
    } else {
      toast.error('Error: ' + (e?.message || 'error'))
    }
  }
}

const onEmpresaCreada = () => {
  empresaEditando.value = null
}

const onEmpresaActualizada = () => {
  empresaEditando.value = null
}

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

onMounted(cargar)

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.gestionar-empresas-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1100px;
  margin: 0 auto;
}

/* HEADER */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
}
.page-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
  letter-spacing: -0.03em;
}
.title-icon {
  width: 42px; height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
}
.page-subtitle {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
  padding-left: 54px;
}
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn-primary, .btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  border: none;
  text-decoration: none;
}
.btn-primary {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(37, 99, 235, 0.4); }
.btn-secondary {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-secondary:hover:not(:disabled) { border-color: #2563eb; color: #2563eb; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

/* INFO */
.info-card {
  display: flex;
  gap: 14px;
  padding: 16px 20px;
  background: rgba(37, 99, 235, 0.06);
  border: 1px solid rgba(37, 99, 235, 0.2);
  border-left: 4px solid #2563eb;
  border-radius: var(--radius-lg);
}
.info-icon {
  width: 40px; height: 40px;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.15);
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.info-body { flex: 1; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.5; }
.info-body strong { color: var(--text-primary); display: block; margin-bottom: 4px; }

/* LOADING / EMPTY */
.loading-block {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.spinner-lg {
  width: 44px; height: 44px;
  margin: 0 auto 16px;
  border: 4px solid var(--border-color);
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty-block {
  text-align: center;
  padding: 60px 20px;
  background: var(--bg-card);
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-lg);
}
.empty-icon {
  width: 88px; height: 88px;
  border-radius: 50%;
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  margin: 0 auto 18px;
}
.empty-title {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.empty-text {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 22px;
  max-width: 400px;
  margin-left: auto;
  margin-right: auto;
}
.btn-primary-large {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 13px 26px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.35);
  transition: all 0.2s ease;
}
.btn-primary-large:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(37, 99, 235, 0.45);
}

/* GRID */
.empresas-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empresa-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-lg);
  transition: all var(--transition);
}
.empresa-row:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
}
.empresa-row-activa {
  border-color: rgba(37, 99, 235, 0.5);
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.03), transparent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
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
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.empresa-info { flex: 1; min-width: 0; }
.empresa-nombre {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 2px;
  flex-wrap: wrap;
}
.badge-activa {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.15);
  color: #2563eb;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.5px;
}
.empresa-razon {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.empresa-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.empresa-meta span { display: inline-flex; align-items: center; gap: 5px; }
.empresa-meta i { font-size: 0.7rem; }
.text-success { color: #10b981; }
.text-warning { color: #f59e0b; }

.empresa-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
}
.btn-accion {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 1.5px solid;
}
.btn-accion:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-cambiar {
  background: rgba(37, 99, 235, 0.08);
  border-color: rgba(37, 99, 235, 0.3);
  color: #2563eb;
}
.btn-cambiar:hover:not(:disabled) {
  background: #2563eb;
  color: #fff;
}

.btn-editar {
  background: var(--bg-card);
  border-color: var(--border-color);
  color: var(--text-secondary);
}
.btn-editar:hover {
  border-color: #2563eb;
  color: #2563eb;
}

.btn-eliminar {
  width: 36px;
  padding: 8px;
  justify-content: center;
  background: transparent;
  border-color: rgba(239, 68, 68, 0.4);
  color: #ef4444;
}
.btn-eliminar:hover:not(:disabled) {
  background: #ef4444;
  color: #fff;
  border-color: #ef4444;
}

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .empresa-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .empresa-avatar {
    align-self: flex-start;
  }
  .empresa-actions {
    justify-content: stretch;
  }
  .btn-accion {
    flex: 1;
    justify-content: center;
  }
  .btn-eliminar { flex: 0 0 auto; }
}
</style>