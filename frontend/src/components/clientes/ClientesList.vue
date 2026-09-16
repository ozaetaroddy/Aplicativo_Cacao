<template>
  <div class="clientes-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-users"></i></span>
          Clientes
        </h1>
        <p class="page-subtitle">
          Administra tu cartera de clientes y su información de contacto
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="imprimirLista"
          :disabled="loading || imprimiendo || clientesFiltrados.length === 0"
          aria-label="Imprimir lista de clientes"
        >
          <i class="fas fa-print" :class="{ 'fa-spin': imprimiendo }"></i>
          {{ imprimiendo ? 'Generando...' : 'Imprimir' }}
        </button>
        <button
          class="btn-secondary"
          @click="cargar"
          :disabled="loading"
          aria-label="Actualizar listado"
        >
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
          Actualizar
        </button>
        <router-link to="/clientes/nuevo" class="btn-primary">
          <i class="fas fa-plus"></i>
          Nuevo cliente
        </router-link>
      </div>
    </div>

    <!-- STATS -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon azul"><i class="fas fa-users"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ clientes.length }}</div>
          <div class="stat-label">Total clientes</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon verde"><i class="fas fa-building"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ totalEmpresas }}</div>
          <div class="stat-label">Empresas</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon naranja"><i class="fas fa-user"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ totalPersonas }}</div>
          <div class="stat-label">Personas naturales</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon morado"><i class="fas fa-envelope"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ conEmail }}</div>
          <div class="stat-label">Con email</div>
        </div>
      </div>
    </div>

    <!-- SEARCH -->
    <div class="search-bar">
      <div class="search-wrapper">
        <i class="fas fa-search search-icon"></i>
        <input
          type="text"
          class="search-input"
          v-model="search"
          placeholder="Buscar por nombre, RUC, teléfono o email..."
          aria-label="Buscar clientes"
        />
        <button
          v-if="search"
          type="button"
          class="search-clear"
          @click="search = ''"
          aria-label="Limpiar búsqueda"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="search-info">
        <span v-if="search">
          {{ clientesFiltrados.length }} resultado(s) para "{{ search }}"
        </span>
        <span v-else>
          {{ clientes.length }} cliente(s) registrados
        </span>
      </div>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-header">
        <i class="fas fa-list me-2"></i>
        Listado de clientes
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th>Cliente</th>
                <th style="width: 160px;">RUC / Cédula</th>
                <th style="width: 160px;">Teléfono</th>
                <th>Email</th>
                <th style="width: 120px;" class="text-center">Tipo</th>
                <th style="width: 180px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <!-- Skeleton -->
              <template v-if="loading">
                <tr v-for="i in 6" :key="`skel-${i}`" class="skeleton-row">
                  <td>
                    <div class="skeleton-cliente">
                      <div class="skeleton-circle"></div>
                      <div class="skeleton-line w-80"></div>
                    </div>
                  </td>
                  <td><div class="skeleton-line w-80"></div></td>
                  <td><div class="skeleton-line w-60"></div></td>
                  <td><div class="skeleton-line w-100"></div></td>
                  <td><div class="skeleton-line w-60 mx-auto"></div></td>
                  <td><div class="skeleton-line w-80 mx-auto"></div></td>
                </tr>
              </template>

              <!-- Empty (sin datos) -->
              <tr v-else-if="clientes.length === 0">
                <td colspan="6" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <div class="empty-title">Aún no hay clientes</div>
                    <div class="empty-text">
                      Registra tu primer cliente para empezar a facturar
                    </div>
                    <router-link to="/clientes/nuevo" class="empty-action">
                      <i class="fas fa-plus"></i> Nuevo cliente
                    </router-link>
                  </div>
                </td>
              </tr>

              <!-- Empty (con búsqueda) -->
              <tr v-else-if="clientesFiltrados.length === 0">
                <td colspan="6" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <div class="empty-title">Sin resultados</div>
                    <div class="empty-text">
                      No se encontraron clientes que coincidan con "{{ search }}"
                    </div>
                    <button class="empty-action" @click="search = ''">
                      <i class="fas fa-times"></i> Limpiar búsqueda
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Datos -->
              <tr v-else v-for="c in clientesFiltrados" :key="c._id">
                <td>
                  <div class="cliente-cell">
                    <div class="cliente-avatar" :class="`avatar-${c.tipo || 'persona'}`">
                      {{ inicial(c.nombre) }}
                    </div>
                    <div class="cliente-nombre" :title="c.nombre">{{ c.nombre }}</div>
                  </div>
                </td>
                <td>
                  <code class="ruc-badge">{{ c.ruc || '—' }}</code>
                </td>
                <td>
                  <a
                    v-if="c.telefono"
                    :href="`tel:${c.telefono}`"
                    class="contact-link"
                  >
                    <i class="fas fa-phone"></i> {{ c.telefono }}
                  </a>
                  <span v-else class="text-muted">—</span>
                </td>
                <td>
                  <a
                    v-if="c.email"
                    :href="`mailto:${c.email}`"
                    class="contact-link"
                    :title="c.email"
                  >
                    <i class="fas fa-envelope"></i>
                    <span class="email-text">{{ c.email }}</span>
                  </a>
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="text-center">
                  <span class="badge-tipo" :class="`tipo-${c.tipo || 'persona'}`">
                    <i :class="c.tipo === 'empresa' ? 'fas fa-building' : 'fas fa-user'"></i>
                    {{ c.tipo === 'empresa' ? 'Empresa' : 'Persona' }}
                  </span>
                </td>
                <td>
                  <div class="actions-cell">
                    <button
                      class="btn-icon btn-account"
                      @click="verEstadoCuenta(c)"
                      title="Estado de cuenta"
                      :aria-label="`Ver estado de cuenta de ${c.nombre}`"
                    >
                      <i class="fas fa-file-invoice-dollar"></i>
                    </button>
                    <router-link
                      :to="`/clientes/editar/${c._id}`"
                      class="btn-icon btn-edit"
                      title="Editar cliente"
                      :aria-label="`Editar ${c.nombre}`"
                    >
                      <i class="fas fa-edit"></i>
                    </router-link>
                    <button
                      class="btn-icon btn-delete"
                      @click="pedirEliminar(c)"
                      :disabled="eliminandoId === c._id"
                      title="Eliminar cliente"
                      :aria-label="`Eliminar ${c.nombre}`"
                    >
                      <i
                        class="fas fa-trash"
                        :class="{ 'fa-spin': eliminandoId === c._id }"
                      ></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- MODAL CONFIRMACIÓN -->
    <div
      class="modal fade"
      id="modalConfirmCliente"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content modal-content-clean">
          <div class="modal-header" :class="`bg-${confirmState.variante}`">
            <h5 class="modal-title text-white">
              <i :class="confirmState.icono" class="me-2"></i>
              {{ confirmState.titulo }}
            </h5>
            <button
              type="button"
              class="btn-close btn-close-white"
              @click="cancelarConfirm"
              aria-label="Cerrar"
            ></button>
          </div>
          <div class="modal-body">
            <p class="mb-3">{{ confirmState.mensaje }}</p>
            <div v-if="confirmState.detalle" class="alert alert-warning small mb-0">
              <i class="fas fa-exclamation-triangle me-2"></i>
              <span>{{ confirmState.detalle }}</span>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="cancelarConfirm">
              {{ confirmState.textoCancelar }}
            </button>
            <button
              type="button"
              class="btn"
              :class="`btn-${confirmState.variante}`"
              @click="aceptarConfirm"
            >
              {{ confirmState.textoConfirmar }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const toast = useToast()
const router = useRouter()

// ===== STATE =====
const clientes = ref([])
const loading = ref(false)
const imprimiendo = ref(false)
const search = ref('')
const eliminandoId = ref(null)

// Modales
let modalConfirm = null
let unmounted = false

// Confirm state
const confirmState = reactive({
  titulo: '',
  mensaje: '',
  detalle: '',
  textoConfirmar: 'Confirmar',
  textoCancelar: 'Cancelar',
  variante: 'primary',
  icono: 'fas fa-question-circle',
  resolve: null
})

// ===== COMPUTED =====
const clientesFiltrados = computed(() => {
  const q = String(search.value || '').trim().toLowerCase()
  if (!q) return clientes.value
  return clientes.value.filter(c => {
    const nombre = String(c.nombre || '').toLowerCase()
    const ruc = String(c.ruc || '').toLowerCase()
    const tel = String(c.telefono || '').toLowerCase()
    const email = String(c.email || '').toLowerCase()
    return (
      nombre.includes(q) || ruc.includes(q) ||
      tel.includes(q) || email.includes(q)
    )
  })
})

const totalEmpresas = computed(
  () => clientes.value.filter(c => c.tipo === 'empresa').length
)
const totalPersonas = computed(
  () => clientes.value.filter(c => c.tipo !== 'empresa').length
)
const conEmail = computed(
  () => clientes.value.filter(c => Boolean(c.email)).length
)

// ===== HELPERS =====
const inicial = (nombre) => {
  const s = String(nombre || '').trim()
  return s ? s[0].toUpperCase() : '?'
}

/** Sanitiza un valor para usarlo en el PDF (evita XSS vía jsPDF). */
const safe = (v) => (v === null || v === undefined ? '' : String(v))

// ===== CONFIRMACIÓN =====
const pedirConfirmacion = (opts = {}) => {
  return new Promise((resolve) => {
    confirmState.titulo = opts.titulo || 'Confirmar acción'
    confirmState.mensaje = opts.mensaje || '¿Estás seguro?'
    confirmState.detalle = opts.detalle || ''
    confirmState.textoConfirmar = opts.textoConfirmar || 'Confirmar'
    confirmState.textoCancelar = opts.textoCancelar || 'Cancelar'
    confirmState.variante = opts.variante || 'primary'
    confirmState.icono = opts.icono || 'fas fa-question-circle'
    confirmState.resolve = resolve

    if (!modalConfirm) {
      modalConfirm = new Modal(document.getElementById('modalConfirmCliente'), {
        backdrop: 'static'
      })
    }
    modalConfirm.show()
  })
}

const aceptarConfirm = () => {
  const r = confirmState.resolve
  confirmState.resolve = null
  modalConfirm?.hide()
  if (r) r(true)
}

const cancelarConfirm = () => {
  const r = confirmState.resolve
  confirmState.resolve = null
  modalConfirm?.hide()
  if (r) r(false)
}

// ===== CARGA =====
const cargar = async () => {
  if (unmounted) return
  loading.value = true
  try {
    const res = await api.request('/clientes', { method: 'GET', skipLoader: true })
    if (unmounted) return
    clientes.value = Array.isArray(res) ? res : (res?.data || [])
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar clientes: ' + e.message)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== ACCIONES =====
const verEstadoCuenta = (cliente) => {
  router.push({
    path: '/reportes/estado-cuenta',
    query: { clienteId: cliente._id }
  })
}

// ===== ELIMINAR =====
const pedirEliminar = async (cliente) => {
  if (eliminandoId.value === cliente._id) return

  const confirmado = await pedirConfirmacion({
    titulo: 'Eliminar cliente',
    mensaje: `¿Eliminar al cliente "${cliente.nombre}"?`,
    detalle:
      'Esta acción no se puede deshacer. Si el cliente tiene facturas o pagos ' +
      'asociados, el sistema bloqueará la eliminación.',
    textoConfirmar: 'Eliminar',
    textoCancelar: 'Cancelar',
    variante: 'danger',
    icono: 'fas fa-trash'
  })
  if (!confirmado || unmounted) return

  eliminandoId.value = cliente._id
  try {
    await api.request(`/clientes/${cliente._id}`, {
      method: 'DELETE',
      loaderMessage: 'Eliminando...'
    })
    if (unmounted) return
    toast.success('Cliente eliminado correctamente')
    await cargar()
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'CLIENTE_CON_DOCUMENTOS') {
      toast.error(
        e.message ||
          'El cliente tiene documentos (facturas o pagos) asociados y no puede eliminarse'
      )
    } else if (codigo === 'CLIENTE_NOT_FOUND') {
      toast.error('El cliente ya no existe')
      await cargar()
    } else {
      toast.error('Error al eliminar: ' + e.message)
    }
  } finally {
    if (!unmounted) eliminandoId.value = null
  }
}

// ===== IMPRIMIR PDF =====
const imprimirLista = async () => {
  if (imprimiendo.value) return

  const datos = clientesFiltrados.value
  if (datos.length === 0) {
    toast.warning('No hay clientes para imprimir')
    return
  }

  imprimiendo.value = true
  try {
    const pdf = new jsPDF('p', 'mm', 'a4')

    // Header
    pdf.setFontSize(18)
    pdf.setTextColor(41, 128, 185)
    pdf.text('Lista de Clientes', 14, 20)

    pdf.setFontSize(9)
    pdf.setTextColor(120, 120, 120)
    const generado = new Date().toLocaleString('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
    pdf.text(`Generado: ${generado}`, 14, 27)
    pdf.text(`Total: ${datos.length} cliente(s)`, 14, 32)

    // Tabla
    autoTable(pdf, {
      startY: 38,
      head: [['Nombre', 'RUC/Cédula', 'Teléfono', 'Email', 'Tipo']],
      body: datos.map(c => [
        safe(c.nombre) || '—',
        safe(c.ruc) || '—',
        safe(c.telefono) || '—',
        safe(c.email) || '—',
        c.tipo === 'empresa' ? 'Empresa' : 'Persona'
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 248, 251] },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 32 },
        2: { cellWidth: 28 },
        3: { cellWidth: 55 },
        4: { cellWidth: 20 }
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
        // Footer con número de página
        const pageCount = pdf.internal.getNumberOfPages()
        const pageSize = pdf.internal.pageSize
        pdf.setFontSize(8)
        pdf.setTextColor(150, 150, 150)
        pdf.text(
          `Página ${data.pageNumber} de ${pageCount}`,
          pageSize.width - 20,
          pageSize.height - 10,
          { align: 'right' }
        )
      }
    })

    const filename = `clientes_${new Date().toISOString().slice(0, 10)}.pdf`
    pdf.save(filename)
    toast.success(`PDF generado (${datos.length} clientes)`)
  } catch (e) {
    if (!unmounted) toast.error('Error al generar PDF: ' + e.message)
  } finally {
    if (!unmounted) imprimiendo.value = false
  }
}

// ===== LIFECYCLE =====
onMounted(cargar)

onBeforeUnmount(() => {
  unmounted = true
  try { modalConfirm?.hide() } catch { /* noop */ }
  if (confirmState.resolve) {
    confirmState.resolve(false)
    confirmState.resolve = null
  }
})
</script>

<style scoped>
.clientes-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
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
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  box-shadow: 0 6px 16px rgba(52, 152, 219, 0.3);
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
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: #fff;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(52, 152, 219, 0.4);
  color: #fff;
}
.btn-secondary {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-secondary:hover:not(:disabled) { border-color: #3498db; color: #3498db; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

/* STATS */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  transition: all var(--transition);
}
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.stat-icon.azul { background: rgba(52,152,219,0.12); color: #3498db; }
.stat-icon.verde { background: rgba(46,204,113,0.12); color: #27ae60; }
.stat-icon.naranja { background: rgba(243,156,18,0.12); color: #f39c12; }
.stat-icon.morado { background: rgba(142,68,173,0.12); color: #8e44ad; }
.stat-info { flex: 1; min-width: 0; }
.stat-value { font-size: 1.5rem; font-weight: 800; color: var(--text-primary); line-height: 1; }
.stat-label {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 600;
  margin-top: 4px;
}

/* SEARCH */
.search-bar { display: flex; flex-direction: column; gap: 8px; }
.search-wrapper { position: relative; display: flex; align-items: center; }
.search-icon {
  position: absolute;
  left: 16px;
  color: var(--text-muted);
  font-size: 0.9rem;
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 12px 42px 12px 44px;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
  transition: all var(--transition-fast);
}
.search-input:focus {
  border-color: #3498db;
  box-shadow: 0 0 0 4px rgba(52, 152, 219, 0.12);
  background: var(--bg-card);
}
.search-clear {
  position: absolute;
  right: 10px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.search-clear:hover { color: var(--danger); background: var(--bg-table-stripe); }
.search-info {
  font-size: 0.75rem;
  color: var(--text-muted);
  padding-left: 4px;
}

/* TABLA */
.table-modern {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th {
  padding: 14px 12px;
  text-align: left;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 2px solid var(--border-color);
  white-space: nowrap;
}
.table-modern td {
  padding: 14px 12px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }

.cliente-cell { display: flex; align-items: center; gap: 12px; min-width: 0; }
.cliente-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.9rem;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.avatar-persona { background: linear-gradient(135deg, #3498db, #2980b9); }
.avatar-empresa { background: linear-gradient(135deg, #9b59b6, #8e44ad); }
.cliente-nombre {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}

.ruc-badge {
  background: var(--bg-table-stripe);
  padding: 3px 10px;
  border-radius: 6px;
  font-family: var(--font-mono, monospace);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.contact-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.82rem;
  transition: color var(--transition-fast);
}
.contact-link i { color: var(--text-muted); font-size: 0.75rem; }
.contact-link:hover { color: #3498db; }
.contact-link:hover i { color: #3498db; }
.email-text {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge-tipo {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.tipo-persona { background: rgba(52,152,219,0.15); color: #2980b9; }
.tipo-empresa { background: rgba(142,68,173,0.15); color: #8e44ad; }

.actions-cell { display: flex; gap: 6px; justify-content: center; }
.btn-icon {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  transition: all var(--transition-fast);
  text-decoration: none;
}
.btn-account:hover {
  border-color: #f39c12 !important;
  color: #f39c12 !important;
  background: rgba(243,156,18,0.08) !important;
}
.btn-edit:hover {
  border-color: #3498db !important;
  color: #3498db !important;
  background: rgba(52,152,219,0.08) !important;
}
.btn-delete:hover:not(:disabled) {
  border-color: #e74c3c !important;
  color: #e74c3c !important;
  background: rgba(231,76,60,0.08) !important;
}
.btn-icon:disabled { opacity: 0.4; cursor: not-allowed; }

/* EMPTY */
.empty-cell { padding: 0 !important; }
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty-state i { font-size: 3rem; opacity: 0.35; display: block; margin-bottom: 12px; }
.empty-title {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 1rem;
  margin-bottom: 4px;
}
.empty-text { font-size: 0.85rem; margin-bottom: 16px; }
.empty-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(52,152,219,0.1);
  border: 1px solid rgba(52,152,219,0.3);
  border-radius: var(--radius-md);
  color: #2980b9;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: none;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.empty-action:hover { background: #3498db; color: #fff; border-color: #3498db; }

/* SKELETON */
.skeleton-row td { padding: 16px 12px; }
.skeleton-line {
  height: 12px;
  background: linear-gradient(90deg, var(--bg-table-stripe) 25%, var(--border-color) 50%, var(--bg-table-stripe) 75%);
  background-size: 200% 100%;
  border-radius: 6px;
  animation: shimmer 1.4s ease-in-out infinite;
}
.skeleton-line.w-60 { width: 60%; }
.skeleton-line.w-80 { width: 80%; }
.skeleton-line.w-100 { width: 100%; }
.skeleton-cliente { display: flex; align-items: center; gap: 10px; }
.skeleton-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-table-stripe);
  flex-shrink: 0;
}
.mx-auto { margin-left: auto; margin-right: auto; }
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* MODAL */
.modal-content-clean { border-radius: 14px; overflow: hidden; border: none; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .cliente-nombre { max-width: 140px; }
  .email-text { max-width: 120px; }
}
</style>