<template>
  <div class="proveedores-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-orange"><i class="fas fa-truck"></i></span>
          Proveedores
        </h1>
        <p class="page-subtitle">
          Administra tu cartera de proveedores y su información de contacto
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="imprimirLista"
          :disabled="loading || imprimiendo || proveedoresFiltrados.length === 0"
          aria-label="Imprimir lista de proveedores"
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
        <router-link to="/proveedores/nuevo" class="btn-primary">
          <i class="fas fa-plus"></i>
          Nuevo proveedor
        </router-link>
      </div>
    </div>

    <!-- STATS -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon azul"><i class="fas fa-truck"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ proveedores.length }}</div>
          <div class="stat-label">Total proveedores</div>
        </div>
      </div>
      <div class="stat-card stat-card-success">
        <div class="stat-icon verde"><i class="fas fa-building"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ totalEmpresas }}</div>
          <div class="stat-label">Con RUC (empresa)</div>
        </div>
      </div>
      <div class="stat-card stat-card-info">
        <div class="stat-icon cyan"><i class="fas fa-user"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ totalPersonas }}</div>
          <div class="stat-label">Con cédula</div>
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
          aria-label="Buscar proveedores"
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
          {{ proveedoresFiltrados.length }} resultado(s) para "{{ search }}"
        </span>
        <span v-else>
          {{ proveedores.length }} proveedor(es) registrados
        </span>
      </div>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-header">
        <i class="fas fa-list me-2"></i>
        Listado de proveedores
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th style="width: 160px;">RUC / Cédula</th>
                <th style="width: 160px;">Teléfono</th>
                <th>Email</th>
                <th>Dirección</th>
                <th style="width: 130px;" class="text-center">Acciones</th>
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
                  <td><div class="skeleton-line w-100"></div></td>
                  <td><div class="skeleton-line w-80 mx-auto"></div></td>
                </tr>
              </template>

              <!-- Empty (sin datos) -->
              <tr v-else-if="proveedores.length === 0">
                <td colspan="6" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-truck"></i>
                    <div class="empty-title">Aún no hay proveedores</div>
                    <div class="empty-text">
                      Registra tu primer proveedor para empezar a gestionar compras
                    </div>
                    <router-link to="/proveedores/nuevo" class="empty-action">
                      <i class="fas fa-plus"></i> Nuevo proveedor
                    </router-link>
                  </div>
                </td>
              </tr>

              <!-- Empty (con búsqueda) -->
              <tr v-else-if="proveedoresFiltrados.length === 0">
                <td colspan="6" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <div class="empty-title">Sin resultados</div>
                    <div class="empty-text">
                      No se encontraron proveedores que coincidan con "{{ search }}"
                    </div>
                    <button class="empty-action" @click="search = ''">
                      <i class="fas fa-times"></i> Limpiar búsqueda
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Datos -->
              <tr v-else v-for="p in proveedoresFiltrados" :key="p._id">
                <td>
                  <div class="cliente-cell">
                    <div class="cliente-avatar">{{ inicial(p.nombre) }}</div>
                    <div class="cliente-nombre" :title="p.nombre">{{ p.nombre }}</div>
                  </div>
                </td>
                <td>
                  <code class="ruc-badge">{{ p.ruc || '—' }}</code>
                </td>
                <td>
                  <a
                    v-if="p.telefono"
                    :href="`tel:${p.telefono}`"
                    class="contact-link"
                  >
                    <i class="fas fa-phone"></i> {{ p.telefono }}
                  </a>
                  <span v-else class="text-muted">—</span>
                </td>
                <td>
                  <a
                    v-if="p.email"
                    :href="`mailto:${p.email}`"
                    class="contact-link"
                    :title="p.email"
                  >
                    <i class="fas fa-envelope"></i>
                    <span class="email-text">{{ p.email }}</span>
                  </a>
                  <span v-else class="text-muted">—</span>
                </td>
                <td>
                  <div class="direccion-text" :title="p.direccion">
                    {{ p.direccion || '—' }}
                  </div>
                </td>
                <td>
                  <div class="actions-cell">
                    <router-link
                      :to="`/proveedores/editar/${p._id}`"
                      class="btn-icon btn-edit"
                      title="Editar proveedor"
                      :aria-label="`Editar ${p.nombre}`"
                    >
                      <i class="fas fa-edit"></i>
                    </router-link>
                    <button
                      class="btn-icon btn-delete"
                      @click="pedirEliminar(p)"
                      :disabled="eliminandoId === p._id"
                      title="Eliminar proveedor"
                      :aria-label="`Eliminar ${p.nombre}`"
                    >
                      <i
                        class="fas fa-trash"
                        :class="{ 'fa-spin': eliminandoId === p._id }"
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
      id="modalConfirmProveedor"
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
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const toast = useToast()

// ===== STATE =====
const proveedores = ref([])
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
const proveedoresFiltrados = computed(() => {
  const q = String(search.value || '').trim().toLowerCase()
  if (!q) return proveedores.value
  return proveedores.value.filter(p => {
    const nombre = String(p.nombre || '').toLowerCase()
    const ruc = String(p.ruc || '').toLowerCase()
    const tel = String(p.telefono || '').toLowerCase()
    const email = String(p.email || '').toLowerCase()
    const dir = String(p.direccion || '').toLowerCase()
    return (
      nombre.includes(q) || ruc.includes(q) ||
      tel.includes(q) || email.includes(q) || dir.includes(q)
    )
  })
})

// RUC = 13 dígitos, Cédula = 10 dígitos
const totalEmpresas = computed(
  () => proveedores.value.filter(p => String(p.ruc || '').length === 13).length
)
const totalPersonas = computed(
  () => proveedores.value.filter(p => String(p.ruc || '').length === 10).length
)
const conEmail = computed(
  () => proveedores.value.filter(p => Boolean(p.email)).length
)

// ===== HELPERS =====
const inicial = (nombre) => {
  const s = String(nombre || '').trim()
  return s ? s[0].toUpperCase() : '?'
}

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
      modalConfirm = new Modal(document.getElementById('modalConfirmProveedor'), {
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
    const res = await api.request('/proveedores', { method: 'GET', skipLoader: true })
    if (unmounted) return
    proveedores.value = Array.isArray(res) ? res : (res?.data || [])
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar proveedores: ' + e.message)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== ELIMINAR =====
const pedirEliminar = async (proveedor) => {
  if (eliminandoId.value === proveedor._id) return

  const confirmado = await pedirConfirmacion({
    titulo: 'Eliminar proveedor',
    mensaje: `¿Eliminar al proveedor "${proveedor.nombre}"?`,
    detalle:
      'Esta acción no se puede deshacer. Si el proveedor tiene compras o ' +
      'pagos asociados, el sistema bloqueará la eliminación.',
    textoConfirmar: 'Eliminar',
    textoCancelar: 'Cancelar',
    variante: 'danger',
    icono: 'fas fa-trash'
  })
  if (!confirmado || unmounted) return

  eliminandoId.value = proveedor._id
  try {
    await api.request(`/proveedores/${proveedor._id}`, {
      method: 'DELETE',
      loaderMessage: 'Eliminando...'
    })
    if (unmounted) return
    toast.success('Proveedor eliminado correctamente')
    await cargar()
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'PROVEEDOR_CON_DOCUMENTOS') {
      toast.error(
        e.message ||
          'El proveedor tiene documentos (compras o pagos) asociados y no puede eliminarse'
      )
    } else if (codigo === 'PROVEEDOR_NOT_FOUND') {
      toast.error('El proveedor ya no existe')
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

  const datos = proveedoresFiltrados.value
  if (datos.length === 0) {
    toast.warning('No hay proveedores para imprimir')
    return
  }

  imprimiendo.value = true
  try {
    const pdf = new jsPDF('p', 'mm', 'a4')

    // Header
    pdf.setFontSize(18)
    pdf.setTextColor(230, 126, 34)
    pdf.text('Lista de Proveedores', 14, 20)

    pdf.setFontSize(9)
    pdf.setTextColor(120, 120, 120)
    const generado = new Date().toLocaleString('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
    pdf.text(`Generado: ${generado}`, 14, 27)
    pdf.text(`Total: ${datos.length} proveedor(es)`, 14, 32)

    // Tabla
    autoTable(pdf, {
      startY: 38,
      head: [['Nombre', 'RUC/Cédula', 'Teléfono', 'Email', 'Dirección']],
      body: datos.map(p => [
        safe(p.nombre) || '—',
        safe(p.ruc) || '—',
        safe(p.telefono) || '—',
        safe(p.email) || '—',
        safe(p.direccion) || '—'
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [230, 126, 34],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [253, 246, 238] },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 28 },
        2: { cellWidth: 26 },
        3: { cellWidth: 45 },
        4: { cellWidth: 45 }
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
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

    const filename = `proveedores_${new Date().toISOString().slice(0, 10)}.pdf`
    pdf.save(filename)
    toast.success(`PDF generado (${datos.length} proveedores)`)
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
.proveedores-page {
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
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
}
.title-icon-orange {
  background: linear-gradient(135deg, #e67e22, #d35400);
  box-shadow: 0 6px 16px rgba(230,126,34,0.3);
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
  background: linear-gradient(135deg, #e67e22, #d35400);
  color: #fff;
  box-shadow: 0 4px 12px rgba(230,126,34,0.3);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(230,126,34,0.4);
  color: #fff;
}
.btn-secondary {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-secondary:hover:not(:disabled) { border-color: #e67e22; color: #e67e22; }
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
.stat-card-success { border-left: 4px solid #27ae60; }
.stat-card-info { border-left: 4px solid #17a2b8; }
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
.stat-icon.cyan { background: rgba(23,162,184,0.12); color: #17a2b8; }
.stat-icon.morado { background: rgba(142,68,173,0.12); color: #8e44ad; }

.stat-info { flex: 1; min-width: 0; }
.stat-value {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
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
  border-color: #e67e22;
  box-shadow: 0 0 0 4px rgba(230,126,34,0.12);
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
.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
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
  background: linear-gradient(135deg, #e67e22, #d35400);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.9rem;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(230,126,34,0.25);
}
.cliente-nombre {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
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
.contact-link:hover { color: #e67e22; }
.contact-link:hover i { color: #e67e22; }
.email-text {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.direccion-text {
  font-size: 0.82rem;
  color: var(--text-secondary);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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
  background: rgba(230,126,34,0.1);
  border: 1px solid rgba(230,126,34,0.3);
  border-radius: var(--radius-md);
  color: #d35400;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: none;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.empty-action:hover { background: #e67e22; color: #fff; border-color: #e67e22; }

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