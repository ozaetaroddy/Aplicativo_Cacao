<template>
  <div class="auditoria-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-history"></i></span>
          Auditoría del Sistema
        </h1>
        <p class="page-subtitle">
          Historial completo de acciones realizadas por todos los usuarios
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="exportarCSV"
          :disabled="registros.length === 0 || exportando"
          aria-label="Exportar a CSV"
        >
          <i class="fas fa-file-csv" :class="{ 'fa-spin': exportando }"></i>
          {{ exportando ? 'Exportando...' : 'Exportar CSV' }}
        </button>
        <button
          class="btn-secondary"
          @click="cargarTodo"
          :disabled="loading"
          aria-label="Actualizar listado"
        >
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
          Actualizar
        </button>
      </div>
    </div>

    <!-- STATS CARDS -->
    <div v-if="stats" class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon azul"><i class="fas fa-list"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ (stats.totalRegistros ?? 0).toLocaleString() }}</div>
          <div class="stat-label">Registros totales</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon verde"><i class="fas fa-calendar-week"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ (stats.ultimos7dias ?? 0).toLocaleString() }}</div>
          <div class="stat-label">Últimos 7 días</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon naranja"><i class="fas fa-edit"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ countPorAccion('actualizar') }}</div>
          <div class="stat-label">Actualizaciones</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon rojo"><i class="fas fa-trash-alt"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ countPorAccion('eliminar') }}</div>
          <div class="stat-label">Eliminaciones</div>
        </div>
      </div>
    </div>

    <!-- TOP USUARIOS + ACCIONES -->
    <div v-if="stats" class="analitica-grid">
      <div v-if="stats.topUsuarios?.length > 0" class="card-cacao">
        <div class="card-header">
          <i class="fas fa-users me-2"></i> Top usuarios (7 días)
        </div>
        <div class="card-body p-3">
          <div v-for="(u, idx) in stats.topUsuarios" :key="u._id" class="rank-row">
            <div class="rank-num" :class="`rank-${idx < 3 ? idx + 1 : 'rest'}`">{{ idx + 1 }}</div>
            <div class="rank-label">
              <div class="rank-name">{{ u._id }}</div>
            </div>
            <div class="rank-bar">
              <div
                class="rank-bar-fill"
                :style="{ width: `${(u.total / maxTopUsuarios) * 100}%` }"
              ></div>
            </div>
            <div class="rank-value">{{ u.total }}</div>
          </div>
        </div>
      </div>

      <div v-if="stats.porColeccion?.length > 0" class="card-cacao">
        <div class="card-header">
          <i class="fas fa-folder me-2"></i> Módulos más usados
        </div>
        <div class="card-body p-3">
          <div v-for="c in stats.porColeccion.slice(0, 6)" :key="c._id" class="coleccion-row">
            <span class="coleccion-badge">{{ c._id || 'sistema' }}</span>
            <div class="coleccion-bar">
              <div
                class="coleccion-bar-fill"
                :style="{ width: `${(c.total / maxColeccion) * 100}%` }"
              ></div>
            </div>
            <span class="coleccion-count">{{ c.total }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- FILTROS -->
    <div class="card-cacao">
      <div class="card-header card-header-flex">
        <div><i class="fas fa-filter me-2"></i> Filtros</div>
        <button
          v-if="hayFiltrosActivos"
          class="btn-clear-all"
          @click="limpiarFiltros"
          aria-label="Limpiar todos los filtros"
        >
          <i class="fas fa-times-circle"></i> Limpiar todo
        </button>
      </div>
      <div class="card-body">
        <div class="filters-grid">
          <div class="filter-field search-field">
            <label class="filter-label" for="aud-search">
              <i class="fas fa-search"></i> Buscar
            </label>
            <input
              id="aud-search"
              ref="searchInput"
              type="text"
              class="filter-input"
              v-model="search"
              @input="onSearchInput"
              placeholder="Usuario, número, detalle... (atajo: /)"
            />
          </div>

          <div class="filter-field">
            <label class="filter-label" for="aud-accion">
              <i class="fas fa-bolt"></i> Acción
            </label>
            <select id="aud-accion" class="filter-input" v-model="accion" @change="reload">
              <option value="">Todas</option>
              <option value="crear">Crear</option>
              <option value="actualizar">Actualizar</option>
              <option value="eliminar">Eliminar</option>
              <option value="login">Login</option>
              <option value="login-fallido">Login fallido</option>
              <option value="importar">Importar</option>
              <option value="firmar">Firmar</option>
              <option value="enviar-sri">Enviar SRI</option>
              <option value="cerrar-periodo">Cerrar período</option>
              <option value="reabrir-periodo">Reabrir período</option>
            </select>
          </div>

          <div class="filter-field">
            <label class="filter-label" for="aud-modulo">
              <i class="fas fa-folder"></i> Módulo
            </label>
            <select id="aud-modulo" class="filter-input" v-model="coleccion" @change="reload">
              <option value="">Todos</option>
              <option value="ventas">Ventas</option>
              <option value="compras">Compras</option>
              <option value="clientes">Clientes</option>
              <option value="proveedores">Proveedores</option>
              <option value="productos">Productos</option>
              <option value="categorias">Categorías</option>
              <option value="retenciones">Retenciones</option>
              <option value="usuarios">Usuarios</option>
              <option value="auth">Autenticación</option>
              <option value="certificados">Certificados</option>
              <option value="backups">Backups</option>
              <option value="periodos_cerrados">Períodos</option>
            </select>
          </div>

          <div class="filter-field">
            <label class="filter-label" for="aud-desde">
              <i class="fas fa-calendar"></i> Desde
            </label>
            <input
              id="aud-desde"
              type="date"
              class="filter-input"
              v-model="desde"
              @change="reload"
            />
          </div>

          <div class="filter-field">
            <label class="filter-label" for="aud-hasta">
              <i class="fas fa-calendar"></i> Hasta
            </label>
            <input
              id="aud-hasta"
              type="date"
              class="filter-input"
              v-model="hasta"
              @change="reload"
            />
          </div>

          <div class="filter-field">
            <label class="filter-label">
              <i class="fas fa-exclamation-triangle"></i> Solo errores
            </label>
            <label class="switch-check">
              <input type="checkbox" v-model="soloErrores" @change="reload" />
              <span class="switch-slider"></span>
              <span class="switch-label">{{ soloErrores ? 'Activado' : 'Inactivo' }}</span>
            </label>
          </div>
        </div>

        <!-- CHIPS DE FILTROS ACTIVOS -->
        <transition name="fade">
          <div v-if="hayFiltrosActivos" class="chips-row">
            <span class="chips-label">Filtros activos:</span>
            <span v-if="search" class="chip-filter">
              <i class="fas fa-search"></i> "{{ search }}"
              <button class="chip-x" @click="quitarFiltro('search')" aria-label="Quitar filtro búsqueda">×</button>
            </span>
            <span v-if="accion" class="chip-filter">
              <i class="fas fa-bolt"></i> {{ accion }}
              <button class="chip-x" @click="quitarFiltro('accion')" aria-label="Quitar filtro acción">×</button>
            </span>
            <span v-if="coleccion" class="chip-filter">
              <i class="fas fa-folder"></i> {{ coleccion }}
              <button class="chip-x" @click="quitarFiltro('coleccion')" aria-label="Quitar filtro módulo">×</button>
            </span>
            <span v-if="desde" class="chip-filter">
              <i class="fas fa-calendar"></i> desde {{ desde }}
              <button class="chip-x" @click="quitarFiltro('desde')" aria-label="Quitar filtro desde">×</button>
            </span>
            <span v-if="hasta" class="chip-filter">
              <i class="fas fa-calendar"></i> hasta {{ hasta }}
              <button class="chip-x" @click="quitarFiltro('hasta')" aria-label="Quitar filtro hasta">×</button>
            </span>
            <span v-if="soloErrores" class="chip-filter chip-danger">
              <i class="fas fa-exclamation-triangle"></i> Solo errores
              <button class="chip-x" @click="quitarFiltro('soloErrores')" aria-label="Quitar filtro errores">×</button>
            </span>
          </div>
        </transition>
      </div>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-header card-header-flex">
        <div>
          <i class="fas fa-list me-2"></i>
          Registros ({{ total.toLocaleString() }})
        </div>
        <select
          class="select-sm"
          v-model.number="limit"
          @change="reload"
          aria-label="Registros por página"
        >
          <option :value="20">20 / pág</option>
          <option :value="30">30 / pág</option>
          <option :value="50">50 / pág</option>
          <option :value="100">100 / pág</option>
        </select>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-audit">
            <thead>
              <tr>
                <th style="width:160px;">Fecha</th>
                <th style="width:130px;">Acción</th>
                <th style="width:120px;">Módulo</th>
                <th>Usuario</th>
                <th style="width:140px;">Documento</th>
                <th>Detalle</th>
                <th style="width:130px;">IP</th>
                <th style="width:60px;" class="text-center">Ver</th>
              </tr>
            </thead>
            <tbody>
              <!-- 🆕 Loading skeleton -->
              <template v-if="loading">
                <tr v-for="i in 6" :key="`skel-${i}`" class="skeleton-row">
                  <td><div class="skeleton-line w-80"></div></td>
                  <td><div class="skeleton-line w-60"></div></td>
                  <td><div class="skeleton-line w-60"></div></td>
                  <td>
                    <div class="skeleton-usuario">
                      <div class="skeleton-circle"></div>
                      <div class="skeleton-line w-80"></div>
                    </div>
                  </td>
                  <td><div class="skeleton-line w-60"></div></td>
                  <td><div class="skeleton-line w-100"></div></td>
                  <td><div class="skeleton-line w-60"></div></td>
                  <td><div class="skeleton-line w-40"></div></td>
                </tr>
              </template>
              <tr v-else-if="registros.length === 0">
                <td colspan="8" class="empty-row">
                  <i class="fas fa-inbox"></i>
                  <div>No hay registros de auditoría con estos filtros</div>
                </td>
              </tr>
              <tr v-else v-for="reg in registros" :key="reg._id" class="audit-row">
                <td>
                  <div class="cell-fecha">
                    <div class="fecha-main">{{ formatFecha(reg.fecha) }}</div>
                    <div class="fecha-sub">{{ formatHora(reg.fecha) }}</div>
                  </div>
                </td>
                <td>
                  <span class="badge-accion" :class="badgeClassAccion(reg.accion)">
                    <i :class="iconoAccion(reg.accion)"></i>
                    {{ reg.accion }}
                  </span>
                </td>
                <td>
                  <span class="badge-modulo">
                    {{ reg.coleccion || 'sistema' }}
                  </span>
                </td>
                <td>
                  <div class="usuario-cell">
                    <div class="usuario-avatar" :class="`avatar-${reg.usuarioRol || 'user'}`">
                      {{ iniciales(reg.usuarioNombre || reg.usuarioEmail) }}
                    </div>
                    <div class="usuario-info">
                      <div class="usuario-nombre">{{ reg.usuarioNombre || reg.usuarioEmail }}</div>
                      <div class="usuario-meta">
                        <span v-if="reg.usuarioRol" class="rol-mini">{{ reg.usuarioRol }}</span>
                        <span class="text-muted">{{ reg.usuarioEmail }}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <code v-if="reg.documentoNumero" class="doc-badge">{{ reg.documentoNumero }}</code>
                  <span v-else class="text-muted">—</span>
                </td>
                <td>
                  <div class="detalle-cell" :title="reg.detalle">{{ reg.detalle || '—' }}</div>
                </td>
                <td>
                  <code class="ip-cell">{{ reg.ip || '—' }}</code>
                </td>
                <td class="text-center">
                  <button
                    class="btn-icon-view"
                    @click="verDetalle(reg)"
                    title="Ver detalle"
                    :aria-label="`Ver detalle del registro ${reg._id}`"
                  >
                    <i class="fas fa-eye"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- PAGINACIÓN -->
      <div class="table-footer">
        <div class="footer-info">
          Mostrando <strong>{{ startIndex.toLocaleString() }}</strong> -
          <strong>{{ endIndex.toLocaleString() }}</strong>
          de <strong>{{ total.toLocaleString() }}</strong>
        </div>
        <div class="pagination-controls">
          <button
            class="page-btn"
            :disabled="page === 1"
            @click="goToPage(1)"
            title="Primera página"
            aria-label="Primera página"
          >
            <i class="fas fa-angle-double-left"></i>
          </button>
          <button
            class="page-btn"
            :disabled="page === 1"
            @click="goToPage(page - 1)"
            title="Anterior (Alt+←)"
            aria-label="Página anterior"
          >
            <i class="fas fa-angle-left"></i>
          </button>
          <span class="page-info">Página {{ page }} / {{ totalPages || 1 }}</span>
          <button
            class="page-btn"
            :disabled="page >= totalPages"
            @click="goToPage(page + 1)"
            title="Siguiente (Alt+→)"
            aria-label="Página siguiente"
          >
            <i class="fas fa-angle-right"></i>
          </button>
          <button
            class="page-btn"
            :disabled="page >= totalPages"
            @click="goToPage(totalPages)"
            title="Última página"
            aria-label="Última página"
          >
            <i class="fas fa-angle-double-right"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 🆕 MODAL CONFIRMACIÓN CSV -->
    <div
      class="modal fade"
      id="modalExportCsv"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content modal-content-clean">
          <div class="modal-header bg-primary">
            <h5 class="modal-title text-white">
              <i class="fas fa-file-csv me-2"></i>
              Exportar auditoría
            </h5>
            <button
              type="button"
              class="btn-close btn-close-white"
              @click="cancelarExport"
              aria-label="Cerrar"
            ></button>
          </div>
          <div class="modal-body">
            <p class="mb-3">¿Qué querés exportar?</p>
            <div class="alert alert-info small mb-0">
              <i class="fas fa-info-circle me-2"></i>
              <strong>Página actual:</strong> {{ registros.length }} registros.<br />
              <strong>Todo filtrado:</strong> {{ total.toLocaleString() }} registros
              (puede tardar unos segundos).
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="cancelarExport">
              Cancelar
            </button>
            <button type="button" class="btn btn-outline-primary" @click="exportarPaginaActual">
              Solo página ({{ registros.length }})
            </button>
            <button type="button" class="btn btn-primary" @click="exportarTodoFiltrado">
              Todo filtrado ({{ total.toLocaleString() }})
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL DETALLE -->
    <div class="modal fade" id="modalAuditoria" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content modal-content-clean">
          <div class="modal-header modal-header-dark">
            <div class="modal-header-content">
              <div class="modal-header-icon">
                <i class="fas fa-history"></i>
              </div>
              <div>
                <h5 class="modal-title">Detalle del registro</h5>
                <div class="modal-subtitle">
                  ID: <code>{{ registroActual?._id }}</code>
                </div>
              </div>
            </div>
            <button
              type="button"
              class="btn-close btn-close-white"
              data-bs-dismiss="modal"
              @click="registroActual = null"
              aria-label="Cerrar"
            ></button>
          </div>

          <div class="modal-body" v-if="registroActual">
            <!-- METADATA -->
            <div class="meta-grid">
              <div class="meta-item">
                <label>Acción</label>
                <span class="badge-accion" :class="badgeClassAccion(registroActual.accion)">
                  <i :class="iconoAccion(registroActual.accion)"></i>
                  {{ registroActual.accion }}
                </span>
              </div>
              <div class="meta-item">
                <label>Fecha y hora</label>
                <span>{{ formatFechaHora(registroActual.fecha) }}</span>
              </div>
              <div class="meta-item">
                <label>Usuario</label>
                <div class="usuario-cell">
                  <div
                    class="usuario-avatar"
                    :class="`avatar-${registroActual.usuarioRol || 'user'}`"
                  >
                    {{ iniciales(registroActual.usuarioNombre || registroActual.usuarioEmail) }}
                  </div>
                  <div>
                    <div class="fw-bold">
                      {{ registroActual.usuarioNombre || registroActual.usuarioEmail }}
                    </div>
                    <div class="small text-muted">{{ registroActual.usuarioEmail }}</div>
                  </div>
                </div>
              </div>
              <div class="meta-item">
                <label>Rol</label>
                <span
                  v-if="registroActual.usuarioRol"
                  class="badge-rol"
                  :class="`rol-${registroActual.usuarioRol}`"
                >
                  {{ registroActual.usuarioRol }}
                </span>
                <span v-else class="text-muted">—</span>
              </div>
              <div class="meta-item">
                <label>Módulo</label>
                <span class="badge-modulo">{{ registroActual.coleccion || 'sistema' }}</span>
              </div>
              <div class="meta-item">
                <label>Documento</label>
                <code v-if="registroActual.documentoNumero">{{ registroActual.documentoNumero }}</code>
                <span v-else class="text-muted">—</span>
              </div>
              <div class="meta-item">
                <label>IP</label>
                <code>{{ registroActual.ip || '—' }}</code>
              </div>
              <div class="meta-item full">
                <label>User Agent</label>
                <div class="user-agent">{{ registroActual.userAgent || '—' }}</div>
              </div>
              <div v-if="registroActual.detalle" class="meta-item full">
                <label>Detalle</label>
                <div class="detalle-full">{{ registroActual.detalle }}</div>
              </div>
            </div>

            <!-- COMPARACIÓN ANTES/DESPUÉS -->
            <div v-if="registroActual.datosAnteriores || registroActual.datosNuevos" class="diff-section">
              <div class="diff-header">
                <h6><i class="fas fa-exchange-alt"></i> Cambios</h6>
                <div class="diff-tabs">
                  <button
                    class="diff-tab"
                    :class="{ active: vistaDiff === 'lado' }"
                    @click="vistaDiff = 'lado'"
                  >
                    <i class="fas fa-columns"></i> Lado a lado
                  </button>
                  <button
                    class="diff-tab"
                    :class="{ active: vistaDiff === 'cambios' }"
                    @click="vistaDiff = 'cambios'"
                  >
                    <i class="fas fa-list"></i> Solo cambios
                  </button>
                </div>
              </div>

              <!-- VISTA LADO A LADO -->
              <div v-if="vistaDiff === 'lado'" class="diff-lado-a-lado">
                <div class="diff-panel diff-before">
                  <div class="diff-panel-header">
                    <i class="fas fa-undo"></i>
                    <span>Antes</span>
                    <button
                      class="btn-copy-mini"
                      @click="copiarJson(registroActual.datosAnteriores)"
                      title="Copiar JSON"
                      aria-label="Copiar JSON antes"
                    >
                      <i class="fas fa-copy"></i>
                    </button>
                  </div>
                  <pre class="json-viewer">{{ prettyJson(registroActual.datosAnteriores) }}</pre>
                </div>

                <div class="diff-panel diff-after">
                  <div class="diff-panel-header">
                    <i class="fas fa-redo"></i>
                    <span>Después</span>
                    <button
                      class="btn-copy-mini"
                      @click="copiarJson(registroActual.datosNuevos)"
                      title="Copiar JSON"
                      aria-label="Copiar JSON después"
                    >
                      <i class="fas fa-copy"></i>
                    </button>
                  </div>
                  <pre class="json-viewer">{{ prettyJson(registroActual.datosNuevos) }}</pre>
                </div>
              </div>

              <!-- VISTA SOLO CAMBIOS -->
              <div v-else class="diff-cambios">
                <div v-if="cambios.length === 0" class="no-cambios">
                  <i class="fas fa-equals"></i> Sin cambios detectados en los campos registrados
                </div>
                <table v-else class="tabla-cambios">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Antes</th>
                      <th>Después</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in cambios" :key="c.campo">
                      <td><code>{{ c.campo }}</code></td>
                      <td class="valor-antes">{{ c.antes }}</td>
                      <td class="valor-despues">{{ c.despues }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              Cerrar
            </button>
            <button
              type="button"
              class="btn btn-primary"
              @click="copiarJson(registroActual)"
            >
              <i class="fas fa-copy me-1"></i> Copiar registro completo
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

// ===== CONSTANTES =====
const SEARCH_DEBOUNCE_MS = 400
const EXPORT_MAX_ROWS = 10_000
const CAMPOS_IGNORADOS_DIFF = new Set(['_id', 'createdAt', 'updatedAt', '__v'])

// ===== STATE =====
const registros = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(30)
const totalPages = ref(1)
const loading = ref(false)
const exportando = ref(false)
const stats = ref(null)

// Filtros
const search = ref('')
const accion = ref('')
const coleccion = ref('')
const desde = ref('')
const hasta = ref('')
const soloErrores = ref(false)

// Modales
const modalInstance = ref(null)
const registroActual = ref(null)
const vistaDiff = ref('lado')
const searchInput = ref(null)

// 🆕 Confirmación export CSV
let modalExport = null
const exportState = { resolve: null }

// 🆕 Timers y flags
let searchTimer = null
let unmounted = false
// 🆕 Request ID para descartar respuestas viejas
let currentRequestId = 0

// ===== COMPUTED =====
const startIndex = computed(() => (total.value === 0 ? 0 : (page.value - 1) * limit.value + 1))
const endIndex = computed(() => Math.min(page.value * limit.value, total.value))

const hayFiltrosActivos = computed(
  () =>
    Boolean(
      search.value ||
        accion.value ||
        coleccion.value ||
        desde.value ||
        hasta.value ||
        soloErrores.value
    )
)

const maxTopUsuarios = computed(() => {
  if (!stats.value?.topUsuarios?.length) return 1
  return Math.max(...stats.value.topUsuarios.map(u => u.total))
})

const maxColeccion = computed(() => {
  if (!stats.value?.porColeccion?.length) return 1
  return Math.max(...stats.value.porColeccion.map(c => c.total))
})

// Comparación de campos
const cambios = computed(() => {
  if (!registroActual.value) return []
  const { datosAnteriores, datosNuevos } = registroActual.value
  if (!datosAnteriores || !datosNuevos) return []

  const cambiosArr = []
  const todosLosCampos = new Set([
    ...Object.keys(datosAnteriores || {}),
    ...Object.keys(datosNuevos || {})
  ])

  todosLosCampos.forEach(campo => {
    if (CAMPOS_IGNORADOS_DIFF.has(campo)) return
    const antes = stringify(datosAnteriores?.[campo])
    const despues = stringify(datosNuevos?.[campo])
    if (antes !== despues) {
      cambiosArr.push({
        campo,
        antes: antes || '(vacío)',
        despues: despues || '(vacío)'
      })
    }
  })

  return cambiosArr
})

// ===== HELPERS =====
const esString = (v) => typeof v === 'string' && v.length > 0

/** 🐛 BUG FIX: try/catch para fechas inválidas */
const formatFecha = (fecha) => {
  if (!fecha) return '—'
  try {
    return new Date(fecha).toLocaleDateString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  } catch {
    return '—'
  }
}

const formatHora = (fecha) => {
  if (!fecha) return ''
  try {
    return new Date(fecha).toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return ''
  }
}

const formatFechaHora = (fecha) => {
  if (!fecha) return '—'
  try {
    return new Date(fecha).toLocaleString('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'medium'
    })
  } catch {
    return '—'
  }
}

const iniciales = (texto) => {
  if (!texto) return '?'
  return String(texto)
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(x => x[0])
    .join('')
    .toUpperCase()
}

const stringify = (val) => {
  if (val === undefined || val === null) return ''
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }
  return String(val)
}

/** 🐛 BUG FIX: case-insensitive + guard de string */
const badgeClassAccion = (accRaw) => {
  if (!esString(accRaw)) return 'accion-otro'
  const acc = accRaw.toLowerCase()
  if (acc === 'crear') return 'accion-crear'
  if (acc === 'actualizar') return 'accion-actualizar'
  if (acc === 'eliminar') return 'accion-eliminar'
  if (acc === 'login') return 'accion-login'
  if (acc.includes('fallido') || acc.includes('error') || acc.includes('rechaz')) return 'accion-error'
  if (acc.includes('import')) return 'accion-importar'
  if (acc.includes('firm')) return 'accion-firmar'
  if (acc.includes('sri')) return 'accion-sri'
  if (acc.includes('periodo')) return 'accion-periodo'
  return 'accion-otro'
}

const iconoAccion = (accRaw) => {
  if (!esString(accRaw)) return 'fas fa-circle'
  const acc = accRaw.toLowerCase()
  if (acc === 'crear') return 'fas fa-plus'
  if (acc === 'actualizar') return 'fas fa-edit'
  if (acc === 'eliminar') return 'fas fa-trash'
  if (acc === 'login') return 'fas fa-sign-in-alt'
  if (acc.includes('fallido')) return 'fas fa-user-times'
  if (acc.includes('error') || acc.includes('rechaz')) return 'fas fa-exclamation-circle'
  if (acc.includes('import')) return 'fas fa-file-import'
  if (acc.includes('firm')) return 'fas fa-signature'
  if (acc.includes('sri')) return 'fas fa-cloud-upload-alt'
  if (acc.includes('periodo')) return 'fas fa-lock'
  if (acc.includes('backup')) return 'fas fa-database'
  return 'fas fa-circle'
}

const prettyJson = (obj) => {
  if (obj === null || obj === undefined) return '(vacío)'
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

const countPorAccion = (accionObjetivo) => {
  if (!stats.value?.porAccion || !Array.isArray(stats.value.porAccion)) return 0
  const target = String(accionObjetivo).toLowerCase()
  return stats.value.porAccion
    .filter(a => String(a._id || '').toLowerCase() === target)
    .reduce((sum, a) => sum + (a.total || 0), 0)
}

// ===== CARGA =====
const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    page.value = 1
    cargar()
  }, SEARCH_DEBOUNCE_MS)
}

const goToPage = (p) => {
  const target = Math.max(1, Math.min(totalPages.value || 1, p))
  if (target === page.value) return
  page.value = target
  cargar()
}

const reload = () => {
  page.value = 1
  cargar()
}

const quitarFiltro = (campo) => {
  switch (campo) {
    case 'search': search.value = ''; break
    case 'accion': accion.value = ''; break
    case 'coleccion': coleccion.value = ''; break
    case 'desde': desde.value = ''; break
    case 'hasta': hasta.value = ''; break
    case 'soloErrores': soloErrores.value = false; break
  }
  reload()
}

const limpiarFiltros = () => {
  search.value = ''
  accion.value = ''
  coleccion.value = ''
  desde.value = ''
  hasta.value = ''
  soloErrores.value = false
  page.value = 1
  cargar()
}

const construirParams = (pagina = page.value, limite = limit.value) => {
  const params = new URLSearchParams()
  params.set('page', pagina)
  params.set('limit', limite)
  if (search.value) params.set('search', search.value)
  if (accion.value) params.set('accion', accion.value)
  if (coleccion.value) params.set('coleccion', coleccion.value)
  if (desde.value) params.set('desde', desde.value)
  if (hasta.value) params.set('hasta', hasta.value)
  if (soloErrores.value) params.set('soloErrores', 'true')
  return params
}

const cargar = async () => {
  // 🆕 Request ID: descartar respuestas obsoletas
  const requestId = ++currentRequestId
  loading.value = true

  try {
    const params = construirParams()
    const response = await api.request(`/auditoria?${params.toString()}`, {
      method: 'GET',
      skipLoader: true
    })

    // 🐛 BUG FIX: si hay una request más nueva, ignorar esta respuesta
    if (requestId !== currentRequestId || unmounted) return

    const data = Array.isArray(response?.data) ? response.data : []
    const totalResp = Number(response?.total) || 0
    const totalPagesResp = Number(response?.totalPages) || 1

    registros.value = data
    total.value = totalResp
    totalPages.value = totalPagesResp

    // 🐛 BUG FIX: si la página actual excede totalPages, retroceder
    if (page.value > totalPagesResp && totalPagesResp > 0) {
      page.value = totalPagesResp
      return cargar()
    }
  } catch (e) {
    if (requestId !== currentRequestId || unmounted) return
    console.error('Error cargando auditoría:', e)
    toast.error('Error al cargar auditoría: ' + e.message)
  } finally {
    if (requestId === currentRequestId && !unmounted) loading.value = false
  }
}

const cargarStats = async () => {
  try {
    const res = await api.request('/auditoria/stats', { method: 'GET', skipLoader: true })
    if (!unmounted) stats.value = res
  } catch (e) {
    if (!unmounted) console.error('Error cargando stats:', e)
  }
}

const cargarTodo = async () => {
  await Promise.all([cargar(), cargarStats()])
}

// ===== EXPORTAR CSV =====
const exportarCSV = () => {
  if (registros.value.length === 0) {
    toast.warning('No hay datos para exportar')
    return
  }
  if (!modalExport) {
    modalExport = new Modal(document.getElementById('modalExportCsv'), { backdrop: 'static' })
  }
  modalExport.show()
}

const cancelarExport = () => {
  modalExport?.hide()
}

const exportarPaginaActual = () => {
  modalExport?.hide()
  ejecutarDescargaCSV(registros.value, 'pagina')
}

const exportarTodoFiltrado = async () => {
  modalExport?.hide()
  exportando.value = true

  try {
    // Traemos todos los registros filtrados en un solo request (hasta el cap).
    const params = construirParams(1, EXPORT_MAX_ROWS)
    const response = await api.request(`/auditoria?${params.toString()}`, {
      method: 'GET',
      loaderMessage: 'Exportando registros...'
    })
    if (unmounted) return

    const data = Array.isArray(response?.data) ? response.data : []
    if (data.length === 0) {
      toast.warning('No hay registros con los filtros actuales')
      return
    }
    if (total.value > EXPORT_MAX_ROWS) {
      toast.warning(
        `Se exportaron los primeros ${EXPORT_MAX_ROWS} de ${total.value} registros. ` +
          'Refiná los filtros para exportar todos.'
      )
    }
    ejecutarDescargaCSV(data, 'filtrado')
  } catch (e) {
    if (!unmounted) toast.error('Error al exportar: ' + e.message)
  } finally {
    if (!unmounted) exportando.value = false
  }
}

const ejecutarDescargaCSV = (filas, sufijo) => {
  const headers = [
    'Fecha',
    'Acción',
    'Módulo',
    'Usuario',
    'Email',
    'Rol',
    'Documento',
    'Detalle',
    'IP'
  ]

  const escapar = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`

  const rows = filas.map(r => [
    formatFechaHora(r.fecha),
    r.accion || '',
    r.coleccion || '',
    r.usuarioNombre || '',
    r.usuarioEmail || '',
    r.usuarioRol || '',
    r.documentoNumero || '',
    (r.detalle || '').replace(/[\r\n;]/g, ' '),
    r.ip || ''
  ])

  const csv = [
    headers.map(escapar).join(','),
    ...rows.map(row => row.map(escapar).join(','))
  ].join('\n')

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const fecha = new Date().toISOString().slice(0, 10)
  a.download = `auditoria_${sufijo}_${fecha}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  toast.success(`CSV exportado (${filas.length} registros)`)
}

// ===== DETALLE =====
const verDetalle = (reg) => {
  registroActual.value = reg
  vistaDiff.value = 'lado'
  if (!modalInstance.value) {
    modalInstance.value = new Modal(document.getElementById('modalAuditoria'))
  }
  modalInstance.value.show()
}

// ===== COPIAR (con fallback para HTTP) =====
const copiarJson = async (obj) => {
  const texto = prettyJson(obj)

  // 🐛 BUG FIX: fallback si navigator.clipboard no está disponible (HTTP sin HTTPS)
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(texto)
      toast.success('Copiado al portapapeles')
      return
    }
    throw new Error('clipboard no disponible')
  } catch {
    // Fallback: crear textarea temporal y usar execCommand
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) toast.success('Copiado al portapapeles')
      else toast.error('No se pudo copiar')
    } catch {
      toast.error('No se pudo copiar')
    }
  }
}

// ===== ATAJOS DE TECLADO =====
/** 🐛 BUG FIX: respetar contenteditable */
const estaEscribiendo = () => {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

const handleKeyboard = (e) => {
  // '/' → focus búsqueda
  if (e.key === '/' && !estaEscribiendo()) {
    e.preventDefault()
    searchInput.value?.focus()
    return
  }
  // 'r' → refresh
  if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !estaEscribiendo()) {
    e.preventDefault()
    cargarTodo()
    return
  }
  // Alt+← / Alt+→ → paginación
  if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault()
    goToPage(page.value - 1)
    return
  }
  if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault()
    goToPage(page.value + 1)
    return
  }
  // Esc → cerrar modales abiertos
  if (e.key === 'Escape') {
    try { modalInstance.value?.hide() } catch { /* noop */ }
    try { modalExport?.hide() } catch { /* noop */ }
  }
}

// ===== LIFECYCLE =====
onMounted(() => {
  cargarTodo()
  document.addEventListener('keydown', handleKeyboard)
})

onBeforeUnmount(() => {
  unmounted = true
  document.removeEventListener('keydown', handleKeyboard)

  // 🐛 BUG FIX: limpiar timers
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }

  // 🐛 BUG FIX: cerrar modales
  try { modalInstance.value?.hide() } catch { /* noop */ }
  try { modalExport?.hide() } catch { /* noop */ }

  // Liberar referencias
  registroActual.value = null
  currentRequestId = 0
})
</script>

<style scoped>
.auditoria-page { display: flex; flex-direction: column; gap: 20px; }

/* HEADER */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.35rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 12px; margin-bottom: 4px; letter-spacing: -0.02em; }
.title-icon { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #8e44ad, #6c3483); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; box-shadow: 0 6px 16px rgba(142,68,173,0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-secondary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: var(--radius-md);
  font-weight: 600; font-size: 0.85rem; cursor: pointer;
  transition: all var(--transition); font-family: inherit;
  background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-secondary);
}
.btn-secondary:hover:not(:disabled) { border-color: #8e44ad; color: #8e44ad; transform: translateY(-1px); }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

/* STATS */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); transition: all var(--transition); }
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-icon { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; flex-shrink: 0; }
.stat-icon.azul { background: rgba(52,152,219,0.12); color: #3498db; }
.stat-icon.verde { background: rgba(46,204,113,0.12); color: #27ae60; }
.stat-icon.naranja { background: rgba(243,156,18,0.12); color: #f39c12; }
.stat-icon.rojo { background: rgba(231,76,60,0.12); color: #e74c3c; }
.stat-info { flex: 1; min-width: 0; }
.stat-value { font-size: 1.5rem; font-weight: 800; color: var(--text-primary); line-height: 1; }
.stat-label { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-top: 4px; }

/* ANALÍTICA */
.analitica-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.rank-row, .coleccion-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--border-light); font-size: 0.85rem; }
.rank-row:last-child, .coleccion-row:last-child { border-bottom: none; }
.rank-num { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.72rem; flex-shrink: 0; background: var(--bg-table-stripe); color: var(--text-muted); }
.rank-1 { background: linear-gradient(135deg, #f1c40f, #f39c12); color: #fff; }
.rank-2 { background: linear-gradient(135deg, #bdc3c7, #95a5a6); color: #fff; }
.rank-3 { background: linear-gradient(135deg, #cd7f32, #a0522d); color: #fff; }
.rank-label { min-width: 100px; max-width: 180px; }
.rank-name { font-weight: 600; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rank-bar, .coleccion-bar { flex: 1; height: 6px; background: var(--bg-table-stripe); border-radius: var(--radius-full); overflow: hidden; }
.rank-bar-fill { height: 100%; background: linear-gradient(90deg, #8e44ad, #6c3483); border-radius: inherit; transition: width 0.6s ease; }
.coleccion-bar-fill { height: 100%; background: linear-gradient(90deg, #3498db, #2980b9); border-radius: inherit; transition: width 0.6s ease; }
.rank-value, .coleccion-count { font-weight: 800; font-size: 0.82rem; color: var(--text-primary); min-width: 40px; text-align: right; }
.coleccion-badge { padding: 3px 10px; border-radius: var(--radius-full); background: var(--bg-table-stripe); color: var(--text-secondary); font-size: 0.72rem; font-weight: 700; min-width: 100px; text-align: center; }

/* FILTROS */
.card-header-flex { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.btn-clear-all { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(231,76,60,0.1); border: 1px solid rgba(231,76,60,0.3); border-radius: var(--radius-md); color: #e74c3c; font-weight: 600; font-size: 0.78rem; cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }
.btn-clear-all:hover { background: #e74c3c; color: #fff; }
.filters-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.filter-field { display: flex; flex-direction: column; gap: 6px; }
.filter-field.search-field { grid-column: span 2; }
@media (max-width: 900px) { .filter-field.search-field { grid-column: 1 / -1; } }
.filter-label { font-size: 0.72rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; display: flex; align-items: center; gap: 6px; }
.filter-label i { color: var(--primary-color); }
.filter-input { padding: 9px 12px; border: 1.5px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-input); color: var(--text-primary); font-size: 0.85rem; font-family: inherit; transition: all var(--transition-fast); outline: none; width: 100%; }
.filter-input:focus { border-color: #8e44ad; box-shadow: 0 0 0 4px rgba(142,68,173,0.12); background: var(--bg-card); }

.switch-check { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 8px 0; }
.switch-check input { display: none; }
.switch-slider { position: relative; width: 42px; height: 22px; background: var(--border-color); border-radius: 22px; transition: 0.3s; flex-shrink: 0; }
.switch-slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s; }
.switch-check input:checked + .switch-slider { background: #e74c3c; }
.switch-check input:checked + .switch-slider::before { transform: translateX(20px); }
.switch-label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); }

/* CHIPS */
.chips-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px dashed var(--border-light); }
.chips-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
.chip-filter { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: rgba(142,68,173,0.1); border: 1px solid rgba(142,68,173,0.25); border-radius: var(--radius-full); font-size: 0.78rem; color: #6c3483; font-weight: 600; }
.chip-filter.chip-danger { background: rgba(231,76,60,0.1); border-color: rgba(231,76,60,0.25); color: #c0392b; }
.chip-x { background: transparent; border: none; color: inherit; cursor: pointer; padding: 0 2px; font-size: 1.1rem; line-height: 1; font-weight: 700; opacity: 0.7; }
.chip-x:hover { opacity: 1; }

/* TABLA */
.table-audit { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-audit thead { background: var(--bg-table-stripe); }
.table-audit th { padding: 14px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); white-space: nowrap; }
.table-audit td { padding: 12px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.audit-row:hover { background: var(--bg-table-stripe); }
.empty-row { text-align: center; padding: 50px 20px !important; color: var(--text-muted); }
.empty-row i { font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 12px; }

/* 🆕 Skeleton */
.skeleton-row td { padding: 14px 12px; }
.skeleton-line {
  height: 12px;
  background: linear-gradient(90deg, var(--bg-table-stripe) 25%, var(--border-color) 50%, var(--bg-table-stripe) 75%);
  background-size: 200% 100%;
  border-radius: 6px;
  animation: shimmer 1.4s ease-in-out infinite;
}
.skeleton-line.w-40 { width: 40%; }
.skeleton-line.w-60 { width: 60%; }
.skeleton-line.w-80 { width: 80%; }
.skeleton-line.w-100 { width: 100%; }
.skeleton-circle { width: 34px; height: 34px; border-radius: 50%; background: var(--bg-table-stripe); flex-shrink: 0; }
.skeleton-usuario { display: flex; align-items: center; gap: 10px; }
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.cell-fecha .fecha-main { font-weight: 600; font-size: 0.82rem; color: var(--text-primary); }
.cell-fecha .fecha-sub { font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; font-family: var(--font-mono, monospace); }

.badge-accion { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: var(--radius-full); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
.accion-crear { background: rgba(39,174,96,0.15); color: #27ae60; }
.accion-actualizar { background: rgba(243,156,18,0.15); color: #d68910; }
.accion-eliminar { background: rgba(231,76,60,0.15); color: #e74c3c; }
.accion-login { background: rgba(52,152,219,0.15); color: #3498db; }
.accion-importar { background: rgba(155,89,182,0.15); color: #8e44ad; }
.accion-firmar { background: rgba(41,128,185,0.15); color: #2874a6; }
.accion-sri { background: rgba(26,188,156,0.15); color: #16a085; }
.accion-periodo { background: rgba(127,140,141,0.15); color: #7f8c8d; }
.accion-error { background: rgba(192,57,43,0.15); color: #c0392b; }
.accion-otro { background: var(--bg-table-stripe); color: var(--text-muted); }

.badge-modulo { padding: 3px 10px; border-radius: var(--radius-full); background: var(--bg-table-stripe); color: var(--text-secondary); font-size: 0.72rem; font-weight: 700; border: 1px solid var(--border-color); }

.usuario-cell { display: flex; align-items: center; gap: 10px; }
.usuario-avatar { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.7rem; color: #fff; flex-shrink: 0; background: linear-gradient(135deg, #7f8c8d, #95a5a6); }
.avatar-admin { background: linear-gradient(135deg, #e74c3c, #c0392b); }
.avatar-contador { background: linear-gradient(135deg, #3498db, #2980b9); }
.avatar-vendedor { background: linear-gradient(135deg, #27ae60, #1e8449); }
.avatar-bodeguero { background: linear-gradient(135deg, #f39c12, #d68910); }
.avatar-auditor { background: linear-gradient(135deg, #8e44ad, #6c3483); }
.usuario-info { min-width: 0; flex: 1; }
.usuario-nombre { font-weight: 600; font-size: 0.82rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.usuario-meta { font-size: 0.7rem; color: var(--text-muted); display: flex; gap: 6px; align-items: center; }
.rol-mini { padding: 1px 6px; border-radius: 4px; background: rgba(52,152,219,0.15); color: #3498db; font-weight: 700; text-transform: uppercase; font-size: 0.6rem; }

.doc-badge { background: var(--bg-table-stripe); padding: 3px 8px; border-radius: 4px; font-family: var(--font-mono, monospace); font-size: 0.75rem; font-weight: 600; }
.detalle-cell { font-size: 0.8rem; color: var(--text-secondary); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ip-cell { background: var(--bg-table-stripe); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono, monospace); font-size: 0.72rem; color: var(--text-muted); }

.btn-icon-view { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; transition: all var(--transition-fast); }
.btn-icon-view:hover { border-color: #8e44ad; color: #8e44ad; background: rgba(142,68,173,0.08); }

/* PAGINACIÓN */
.table-footer { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-top: 1px solid var(--border-color); background: var(--bg-table-stripe); flex-wrap: wrap; gap: 12px; }
.footer-info { font-size: 0.82rem; color: var(--text-muted); }
.footer-info strong { color: var(--text-primary); }
.pagination-controls { display: flex; align-items: center; gap: 6px; }
.page-btn { width: 34px; height: 34px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; transition: all var(--transition-fast); }
.page-btn:hover:not(:disabled) { border-color: #8e44ad; color: #8e44ad; background: rgba(142,68,173,0.08); }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { padding: 0 10px; font-size: 0.82rem; font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.select-sm { padding: 6px 12px; border: 1.5px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-card); color: var(--text-primary); font-size: 0.8rem; font-family: inherit; cursor: pointer; }

/* MODAL */
.modal-content-clean { border-radius: 14px; overflow: hidden; border: none; }
.modal-header-dark { background: linear-gradient(135deg, #2c3e50, #1a2a3a); color: #fff; border: none; }
.modal-header-content { display: flex; align-items: center; gap: 14px; }
.modal-header-icon { width: 44px; height: 44px; border-radius: 12px; background: rgba(142,68,173,0.25); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: #d7bde2; flex-shrink: 0; }
.modal-title { font-size: 1rem; font-weight: 700; margin: 0; }
.modal-subtitle { font-size: 0.72rem; color: rgba(255,255,255,0.6); margin-top: 2px; }
.modal-subtitle code { background: rgba(255,255,255,0.1); color: #e0e0e0; padding: 1px 6px; border-radius: 4px; font-size: 0.68rem; }

.meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
.meta-item { min-width: 0; }
.meta-item.full { grid-column: 1 / -1; }
.meta-item > label { display: block; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px; }
.meta-item > span, .meta-item > code, .meta-item > div { font-size: 0.85rem; color: var(--text-primary); word-break: break-word; }
.user-agent { font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono, monospace); word-break: break-all; line-height: 1.4; }
.detalle-full { font-size: 0.85rem; color: var(--text-primary); padding: 10px 14px; background: var(--bg-table-stripe); border-radius: var(--radius-md); border-left: 3px solid #8e44ad; }

.badge-rol { padding: 4px 12px; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
.rol-admin { background: rgba(231,76,60,0.15); color: #e74c3c; }
.rol-contador { background: rgba(52,152,219,0.15); color: #3498db; }
.rol-vendedor { background: rgba(39,174,96,0.15); color: #27ae60; }
.rol-bodeguero { background: rgba(243,156,18,0.15); color: #d68910; }
.rol-auditor { background: rgba(142,68,173,0.15); color: #8e44ad; }

/* DIFF */
.diff-section { padding-top: 20px; border-top: 1px solid var(--border-light); }
.diff-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.diff-header h6 { display: flex; align-items: center; gap: 8px; font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin: 0; }
.diff-header h6 i { color: #8e44ad; }
.diff-tabs { display: flex; gap: 4px; padding: 3px; background: var(--bg-table-stripe); border-radius: var(--radius-md); }
.diff-tab { padding: 6px 14px; border-radius: var(--radius-sm); border: none; background: transparent; color: var(--text-muted); font-weight: 600; font-size: 0.78rem; cursor: pointer; transition: all var(--transition-fast); font-family: inherit; display: inline-flex; align-items: center; gap: 6px; }
.diff-tab.active { background: var(--bg-card); color: #8e44ad; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }

.diff-lado-a-lado { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 768px) { .diff-lado-a-lado { grid-template-columns: 1fr; } }
.diff-panel { border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-color); }
.diff-before { border-left: 4px solid #e74c3c; }
.diff-after { border-left: 4px solid #27ae60; }
.diff-panel-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--bg-table-stripe); font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); }
.diff-before .diff-panel-header i { color: #e74c3c; }
.diff-after .diff-panel-header i { color: #27ae60; }
.btn-copy-mini { margin-left: auto; background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all var(--transition-fast); }
.btn-copy-mini:hover { background: var(--bg-card); color: #8e44ad; }

.json-viewer { background: #f8f9fa; padding: 14px; font-size: 0.72rem; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; font-family: var(--font-mono, monospace); margin: 0; line-height: 1.55; color: #2c3e50; }

.diff-cambios { border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; }
.no-cambios { padding: 30px; text-align: center; color: var(--text-muted); font-size: 0.85rem; }
.no-cambios i { font-size: 1.5rem; display: block; margin-bottom: 8px; opacity: 0.4; }
.tabla-cambios { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.tabla-cambios thead { background: var(--bg-table-stripe); }
.tabla-cambios th { padding: 10px 14px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; }
.tabla-cambios td { padding: 10px 14px; border-top: 1px solid var(--border-light); vertical-align: top; }
.tabla-cambios code { background: rgba(142,68,173,0.1); color: #6c3483; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; }
.valor-antes { color: #c0392b; font-family: var(--font-mono, monospace); font-size: 0.72rem; background: rgba(231,76,60,0.05); }
.valor-despues { color: #1e8449; font-family: var(--font-mono, monospace); font-size: 0.72rem; background: rgba(39,174,96,0.05); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .filters-grid { grid-template-columns: 1fr; }
}
</style>