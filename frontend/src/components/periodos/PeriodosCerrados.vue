<template>
  <div class="periodos-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-red"><i class="fas fa-lock"></i></span>
          Períodos Cerrados
        </h1>
        <p class="page-subtitle">
          Bloquea meses contables para impedir modificaciones retroactivas
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="cargar"
          :disabled="loading"
          aria-label="Actualizar listado"
        >
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
          Actualizar
        </button>
        <button
          class="btn-primary"
          @click="abrirModalCierre"
          :disabled="cargando"
          aria-label="Cerrar período"
        >
          <i class="fas fa-lock"></i>
          Cerrar período
        </button>
      </div>
    </div>

    <!-- AVISO -->
    <div class="info-card">
      <div class="info-icon"><i class="fas fa-info-circle"></i></div>
      <div class="info-body">
        <strong>¿Cómo funciona el cierre de períodos?</strong>
        <div class="small">
          Una vez cerrado un período, <strong>no se podrán crear, editar ni
          eliminar</strong> documentos (facturas, compras, retenciones) con
          fecha dentro de ese mes. Solo los administradores pueden reabrir un
          período, y toda acción queda registrada en auditoría.
        </div>
      </div>
    </div>

    <!-- STATS -->
    <div v-if="!loading && periodos.length > 0" class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon rojo"><i class="fas fa-lock"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ periodos.length }}</div>
          <div class="stat-label">Períodos cerrados</div>
        </div>
      </div>
      <div class="stat-card stat-card-info">
        <div class="stat-icon azul"><i class="fas fa-calendar-check"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ cerradosEsteAnio }}</div>
          <div class="stat-label">Este año ({{ anioActual }})</div>
        </div>
      </div>
      <div class="stat-card" :class="faltantesEsteAnio > 0 ? 'stat-card-warning' : 'stat-card-success'">
        <div class="stat-icon naranja"><i class="fas fa-hourglass-half"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ faltantesEsteAnio }}</div>
          <div class="stat-label">Sin cerrar ({{ anioActual }})</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon morado"><i class="fas fa-clock"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ etiquetaUltimoCierre }}</div>
          <div class="stat-label">Último cierre</div>
        </div>
      </div>
    </div>

    <!-- CALENDARIO DE PERÍODOS -->
    <div class="anios-grid">
      <div v-for="anio in aniosDisponibles" :key="anio" class="card-cacao">
        <div class="card-header card-header-flex">
          <div>
            <i class="fas fa-calendar-alt me-2"></i>
            Año {{ anio }}
          </div>
          <span class="header-badge" :class="contarCerrados(anio) > 0 ? 'badge-rojo' : ''">
            {{ contarCerrados(anio) }}/12 cerrados
          </span>
        </div>
        <div class="card-body">
          <div class="meses-grid">
            <button
              v-for="(nombre, idx) in MESES"
              :key="idx"
              type="button"
              class="mes-cell"
              :class="{
                'mes-cerrado': estaCerrado(anio, idx + 1),
                'mes-actual': esMesActual(anio, idx + 1),
                'mes-futuro': esMesFuturo(anio, idx + 1),
                'mes-hoy': esMesActual(anio, idx + 1) && !estaCerrado(anio, idx + 1)
              }"
              :disabled="cargando"
              :title="
                estaCerrado(anio, idx + 1)
                  ? `${nombre} ${anio} — cerrado`
                  : esMesFuturo(anio, idx + 1)
                    ? `${nombre} ${anio} — no se puede cerrar un período futuro`
                    : `Cerrar ${nombre} ${anio}`
              "
              @click="abrirModalCierreCon(anio, idx + 1)"
            >
              <span class="mes-nombre">{{ nombre.substring(0, 3) }}</span>
              <i
                v-if="estaCerrado(anio, idx + 1)"
                class="fas fa-lock mes-lock"
              ></i>
              <i
                v-else-if="esMesActual(anio, idx + 1)"
                class="fas fa-dot-circle mes-actual-dot"
              ></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- HISTORIAL -->
    <div class="card-cacao">
      <div class="card-header card-header-flex">
        <div>
          <i class="fas fa-list me-2"></i>
          Historial de cierres
          <span v-if="!loading" class="header-count">{{ periodos.length }}</span>
        </div>
        <select
          v-if="!loading && periodos.length > 0"
          class="select-sm"
          v-model.number="filtroAnio"
          aria-label="Filtrar por año"
        >
          <option :value="0">Todos los años</option>
          <option v-for="a in aniosConCierres" :key="a" :value="a">{{ a }}</option>
        </select>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="min-width:160px;">Período</th>
                <th style="min-width:170px;">Fecha de cierre</th>
                <th style="min-width:180px;">Cerrado por</th>
                <th>Observaciones</th>
                <th style="width:140px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <!-- Skeleton -->
              <template v-if="loading">
                <tr v-for="i in 4" :key="`sk-${i}`" class="skeleton-row">
                  <td><div class="skeleton-line w-60"></div></td>
                  <td><div class="skeleton-line w-80"></div></td>
                  <td><div class="skeleton-line w-80"></div></td>
                  <td><div class="skeleton-line w-100"></div></td>
                  <td><div class="skeleton-line w-60 mx-auto"></div></td>
                </tr>
              </template>

              <!-- Empty -->
              <tr v-else-if="periodos.length === 0">
                <td colspan="5" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-unlock"></i>
                    <div class="empty-title">No hay períodos cerrados</div>
                    <div class="empty-text">
                      Todos los períodos están abiertos. Cierra un mes cuando
                      hayas terminado de registrar sus documentos.
                    </div>
                    <button class="empty-action" @click="abrirModalCierre">
                      <i class="fas fa-lock"></i> Cerrar mi primer período
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Sin resultados por filtro -->
              <tr v-else-if="periodosFiltrados.length === 0">
                <td colspan="5" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-filter"></i>
                    <div class="empty-title">Sin resultados</div>
                    <div class="empty-text">
                      No hay cierres registrados en {{ filtroAnio }}.
                    </div>
                    <button class="empty-action" @click="filtroAnio = 0">
                      <i class="fas fa-times"></i> Ver todos
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Datos -->
              <tr v-else v-for="p in periodosFiltrados" :key="p._id">
                <td>
                  <span class="badge-periodo">
                    <i class="fas fa-lock"></i>
                    {{ p.nombre || nombrePeriodo(p.anio, p.mes) }}
                  </span>
                </td>
                <td>
                  <div class="fecha-cell">
                    <div class="fecha-main">{{ formatFecha(p.fecha_cierre) }}</div>
                    <div class="fecha-sub">{{ formatHora(p.fecha_cierre) }}</div>
                  </div>
                </td>
                <td>
                  <div class="usuario-cell">
                    <div class="usuario-avatar">{{ iniciales(p.cerrado_por) }}</div>
                    <div class="usuario-email">{{ p.cerrado_por || 'Sistema' }}</div>
                  </div>
                </td>
                <td>
                  <div
                    class="observaciones-text"
                    :title="p.observaciones"
                  >
                    {{ p.observaciones || '—' }}
                  </div>
                </td>
                <td class="text-center">
                  <button
                    v-if="puedeReabrir"
                    type="button"
                    class="btn-reabrir"
                    @click="pedirReabrir(p)"
                    :disabled="reabriendoId === p._id"
                    :title="`Reabrir ${p.nombre}`"
                    :aria-label="`Reabrir período ${p.nombre}`"
                  >
                    <i
                      class="fas fa-unlock"
                      :class="{ 'fa-spin': reabriendoId === p._id }"
                    ></i>
                    Reabrir
                  </button>
                  <span v-else class="text-muted small">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- MODAL CERRAR PERÍODO -->
    <div
      class="modal fade"
      id="modalCerrarPeriodo"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content modal-content-clean">
          <div class="modal-header bg-warning">
            <h5 class="modal-title text-dark">
              <i class="fas fa-lock me-2"></i>
              Cerrar período
            </h5>
            <button
              type="button"
              class="btn-close"
              @click="cerrarModalCierre"
              :disabled="cargando"
              aria-label="Cerrar"
            ></button>
          </div>
          <div class="modal-body">
            <div class="alert-box alert-box-warning">
              <i class="fas fa-exclamation-triangle"></i>
              <div>
                <strong>Antes de continuar</strong>
                <div class="small">
                  Al cerrar un período, <strong>no podrás modificar</strong>
                  documentos de ese mes. Asegúrate de que todas las facturas,
                  compras y retenciones estén correctas.
                </div>
              </div>
            </div>

            <div class="form-grid">
              <div class="form-field">
                <label class="form-label" for="per-anio">
                  <span class="required">*</span> Año
                </label>
                <input
                  id="per-anio"
                  type="number"
                  class="form-input"
                  v-model.number="form.anio"
                  min="2020"
                  max="2100"
                  :disabled="cargando"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="per-mes">
                  <span class="required">*</span> Mes
                </label>
                <select
                  id="per-mes"
                  class="form-input"
                  v-model.number="form.mes"
                  :disabled="cargando"
                >
                  <option v-for="(nombre, idx) in MESES" :key="idx" :value="idx + 1">
                    {{ nombre }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Preview del período a cerrar -->
            <div v-if="previewPeriodo" class="preview-periodo" :class="{ 'preview-warn': !puedeCerrarse }">
              <div class="preview-icon">
                <i :class="puedeCerrarse ? 'fas fa-check-circle' : 'fas fa-times-circle'"></i>
              </div>
              <div class="preview-body">
                <div class="preview-title">{{ previewPeriodo }}</div>
                <div class="preview-detail">
                  {{ previewMensaje }}
                </div>
              </div>
            </div>

            <div class="form-field form-field-full">
              <label class="form-label" for="per-obs">Observaciones</label>
              <textarea
                id="per-obs"
                class="form-input"
                v-model="form.observaciones"
                rows="3"
                maxlength="1000"
                placeholder="Ej: Declaración de IVA presentada, Formulario 104 enviado..."
                :disabled="cargando"
              ></textarea>
              <small class="form-hint">
                {{ (form.observaciones || '').length }} / 1000 caracteres
              </small>
            </div>

            <transition name="fade">
              <div v-if="errorModal" class="error-banner">
                <i class="fas fa-exclamation-circle"></i>
                <span>{{ errorModal }}</span>
              </div>
            </transition>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              @click="cerrarModalCierre"
              :disabled="cargando"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="btn btn-warning text-dark"
              @click="confirmarCierre"
              :disabled="cargando || !puedeCerrarse"
            >
              <i class="fas fa-lock" :class="{ 'fa-spin': cargando }"></i>
              {{ cargando ? 'Cerrando...' : 'Cerrar período' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL CONFIRMACIÓN REABRIR -->
    <div
      class="modal fade"
      id="modalConfirmReabrir"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content modal-content-clean">
          <div class="modal-header bg-danger">
            <h5 class="modal-title text-white">
              <i class="fas fa-unlock me-2"></i>
              Reabrir período
            </h5>
            <button
              type="button"
              class="btn-close btn-close-white"
              @click="cancelarReabrir"
              aria-label="Cerrar"
            ></button>
          </div>
          <div class="modal-body">
            <p class="mb-3">
              ¿Estás seguro de reabrir el período
              <strong>{{ periodoAReabrir?.nombre }}</strong>?
            </p>
            <div class="alert-box alert-box-danger">
              <i class="fas fa-exclamation-triangle"></i>
              <div>
                <strong>Esto permitirá modificar documentos de ese mes</strong>
                <div class="small">
                  Esta acción queda registrada en auditoría con tu usuario,
                  IP y fecha. Úsala solo cuando sea estrictamente necesario.
                </div>
              </div>
            </div>

            <!-- Confirmación textual opcional (según env backend) -->
            <div v-if="requiereConfirmacionTexto" class="form-field form-field-full mt-3">
              <label class="form-label">
                Escribe <code>{{ TEXTO_CONFIRMAR_REABRIR }}</code> para continuar:
              </label>
              <input
                type="text"
                class="form-input"
                :class="{
                  'is-invalid': textoConfirmar && textoConfirmar !== TEXTO_CONFIRMAR_REABRIR,
                  'is-valid': textoConfirmar === TEXTO_CONFIRMAR_REABRIR
                }"
                v-model="textoConfirmar"
                :placeholder="TEXTO_CONFIRMAR_REABRIR"
                autocomplete="off"
                :disabled="reabriendo"
              />
            </div>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              @click="cancelarReabrir"
              :disabled="reabriendo"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="btn btn-danger"
              @click="confirmarReabrir"
              :disabled="reabriendo || !puedeConfirmarReabrir"
            >
              <i class="fas fa-unlock" :class="{ 'fa-spin': reabriendo }"></i>
              {{ reabriendo ? 'Reabriendo...' : 'Reabrir período' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

// ===== CONSTANTES =====
const MESES = Object.freeze([
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
])
const TEXTO_CONFIRMAR_REABRIR = 'REABRIR PERIODO'

// ¿El backend requiere confirmación textual para reabrir?
// Es opcional según PERIODOS_REQUIRE_CONFIRMATION del backend.
// Aquí asumimos false por defecto; si el backend responde con
// CONFIRMACION_REQUERIDA, mostraremos el campo automáticamente.
const requiereConfirmacionTexto = ref(false)

// ===== STATE =====
const periodos = ref([])
const loading = ref(false)
const cargando = ref(false)
const reabriendo = ref(false)
const reabriendoId = ref(null)
const errorModal = ref('')

const filtroAnio = ref(0)

const form = ref({
  anio: new Date().getFullYear(),
  mes: new Date().getMonth() + 1,
  observaciones: ''
})

const periodoAReabrir = ref(null)
const textoConfirmar = ref('')

// Modales
let modalCierre = null
let modalConfirmReabrir = null
let unmounted = false

// ===== PERMISOS =====
// Nota: usamos `permisos` desde el endpoint de auth para no depender de
// composable externo. Si ya tenés usePermisos bien configurado con
// 'periodos:reabrir', podés reemplazar esto.
const permisosUsuario = ref(null)

const puedeReabrir = computed(() => {
  if (!permisosUsuario.value) return false
  const periodoPerms = permisosUsuario.value.periodos || []
  return periodoPerms.includes('reabrir')
})

const puedeConfirmarReabrir = computed(() => {
  if (!requiereConfirmacionTexto.value) return true
  return textoConfirmar.value === TEXTO_CONFIRMAR_REABRIR
})

// ===== COMPUTED =====
const anioActual = new Date().getFullYear()

const aniosDisponibles = computed(() => [
  anioActual - 1,
  anioActual,
  anioActual + 1
])

const aniosConCierres = computed(() => {
  const set = new Set(periodos.value.map(p => p.anio))
  return [...set].sort((a, b) => b - a)
})

const periodosFiltrados = computed(() => {
  if (!filtroAnio.value) return periodos.value
  return periodos.value.filter(p => p.anio === filtroAnio.value)
})

const cerradosEsteAnio = computed(() =>
  periodos.value.filter(p => p.anio === anioActual).length
)

const faltantesEsteAnio = computed(() => {
  const mesesCerrados = new Set(
    periodos.value.filter(p => p.anio === anioActual).map(p => p.mes)
  )
  const mesActual = new Date().getMonth() + 1
  let faltantes = 0
  for (let m = 1; m <= mesActual; m++) {
    if (!mesCerrados.has(m)) faltantes++
  }
  return faltantes
})

const etiquetaUltimoCierre = computed(() => {
  if (periodos.value.length === 0) return '—'
  const ultimo = periodos.value[0] // asumimos ordenado descendente
  return ultimo.nombre || nombrePeriodo(ultimo.anio, ultimo.mes)
})

/** Preview dinámico del período a cerrar en el modal */
const previewPeriodo = computed(() => {
  if (!form.value.anio || !form.value.mes) return null
  return nombrePeriodo(form.value.anio, form.value.mes)
})

const puedeCerrarse = computed(() => {
  if (!form.value.anio || !form.value.mes) return false
  // No permitir cerrar un mes futuro
  if (esMesFuturo(form.value.anio, form.value.mes)) return false
  // No permitir cerrar dos veces
  if (estaCerrado(form.value.anio, form.value.mes)) return false
  return true
})

const previewMensaje = computed(() => {
  if (!form.value.anio || !form.value.mes) return ''
  if (esMesFuturo(form.value.anio, form.value.mes)) {
    return 'No se puede cerrar un período futuro'
  }
  if (estaCerrado(form.value.anio, form.value.mes)) {
    return 'Este período ya está cerrado'
  }
  return 'Listo para cerrar'
})

// ===== HELPERS =====
const nombrePeriodo = (anio, mes) => {
  const idx = Number(mes) - 1
  const nombre = MESES[idx] || `Mes ${mes}`
  return `${nombre} ${anio}`
}

const estaCerrado = (anio, mes) =>
  periodos.value.some(p => p.anio === anio && p.mes === mes)

const contarCerrados = (anio) =>
  periodos.value.filter(p => p.anio === anio).length

const esMesActual = (anio, mes) => {
  const hoy = new Date()
  return anio === hoy.getFullYear() && mes === hoy.getMonth() + 1
}

const esMesFuturo = (anio, mes) => {
  const hoy = new Date()
  const fecha = new Date(anio, mes - 1, 1)
  const primerDiaMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  return fecha > primerDiaMesActual
}

const formatFecha = (f) => {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
  } catch { return '—' }
}

const formatHora = (f) => {
  if (!f) return ''
  try {
    return new Date(f).toLocaleTimeString('es-EC', {
      hour: '2-digit', minute: '2-digit'
    })
  } catch { return '' }
}

const iniciales = (email) => {
  const s = String(email || 'S').trim()
  return s[0].toUpperCase()
}

// ===== CARGA =====
const cargar = async () => {
  if (unmounted) return
  loading.value = true
  try {
    const res = await api.request('/periodos', { method: 'GET', skipLoader: true })
    if (unmounted) return
    const data = Array.isArray(res) ? res : (res?.data || [])
    // Ordenar descendente por fecha de cierre (más recientes primero)
    periodos.value = data.sort((a, b) => {
      const ta = new Date(a.fecha_cierre || 0).getTime()
      const tb = new Date(b.fecha_cierre || 0).getTime()
      return tb - ta
    })
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar períodos: ' + e.message)
  } finally {
    if (!unmounted) loading.value = false
  }
}

const cargarPermisos = async () => {
  try {
    const res = await api.request('/auth/permisos', { method: 'GET', skipLoader: true })
    if (unmounted) return
    permisosUsuario.value = res?.permisos || {}
  } catch {
    permisosUsuario.value = {}
  }
}

// ===== MODAL CIERRE =====
const abrirModalCierre = () => {
  const hoy = new Date()
  form.value = {
    anio: hoy.getFullYear(),
    mes: hoy.getMonth() + 1,
    observaciones: ''
  }
  errorModal.value = ''
  if (!modalCierre) {
    modalCierre = new Modal(document.getElementById('modalCerrarPeriodo'), {
      backdrop: 'static'
    })
  }
  modalCierre.show()
}

const abrirModalCierreCon = (anio, mes) => {
  if (estaCerrado(anio, mes)) {
    toast.info(`${nombrePeriodo(anio, mes)} ya está cerrado`)
    return
  }
  if (esMesFuturo(anio, mes)) {
    toast.warning('No se puede cerrar un período futuro')
    return
  }
  form.value = { anio, mes, observaciones: '' }
  errorModal.value = ''
  if (!modalCierre) {
    modalCierre = new Modal(document.getElementById('modalCerrarPeriodo'), {
      backdrop: 'static'
    })
  }
  modalCierre.show()
}

const cerrarModalCierre = () => {
  if (cargando.value) return
  modalCierre?.hide()
  errorModal.value = ''
}

const confirmarCierre = async () => {
  if (!puedeCerrarse.value) return
  if (cargando.value) return

  cargando.value = true
  errorModal.value = ''

  try {
    const res = await api.request('/periodos', {
      method: 'POST',
      body: JSON.stringify({
        anio: form.value.anio,
        mes: form.value.mes,
        observaciones: String(form.value.observaciones || '').trim()
      }),
      loaderMessage: 'Cerrando período...'
    })
    if (unmounted) return

    toast.success(`Período ${res?.nombre || previewPeriodo.value} cerrado correctamente`)

    if (res?.advertencia) {
      toast.warning(res.advertencia, { timeout: 8000 })
    }

    modalCierre?.hide()
    await cargar()
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code

    if (codigo === 'PERIODO_YA_CERRADO') {
      errorModal.value = 'Este período ya fue cerrado previamente'
    } else if (codigo === 'PERIODO_FUTURO') {
      errorModal.value = 'No se puede cerrar un período futuro'
    } else if (codigo === 'VALIDACION') {
      errorModal.value = e.message || 'Datos inválidos'
    } else {
      errorModal.value = e.message || 'Error al cerrar el período'
    }
    toast.error(errorModal.value)
  } finally {
    if (!unmounted) cargando.value = false
  }
}

// ===== REABRIR =====
const pedirReabrir = (p) => {
  periodoAReabrir.value = p
  textoConfirmar.value = ''
  requiereConfirmacionTexto.value = false

  if (!modalConfirmReabrir) {
    modalConfirmReabrir = new Modal(document.getElementById('modalConfirmReabrir'), {
      backdrop: 'static'
    })
  }
  modalConfirmReabrir.show()
}

const cancelarReabrir = () => {
  if (reabriendo.value) return
  modalConfirmReabrir?.hide()
  periodoAReabrir.value = null
  textoConfirmar.value = ''
}

const confirmarReabrir = async () => {
  if (!periodoAReabrir.value || reabriendo.value) return
  if (!puedeConfirmarReabrir.value) return

  reabriendo.value = true
  reabriendoId.value = periodoAReabrir.value._id

  try {
    const body = requiereConfirmacionTexto.value
      ? JSON.stringify({ confirmacion: TEXTO_CONFIRMAR_REABRIR })
      : undefined

    await api.request(`/periodos/${periodoAReabrir.value._id}`, {
      method: 'DELETE',
      body,
      loaderMessage: 'Reabriendo período...'
    })
    if (unmounted) return

    toast.success(`Período ${periodoAReabrir.value.nombre} reabierto correctamente`)
    modalConfirmReabrir?.hide()
    periodoAReabrir.value = null
    textoConfirmar.value = ''
    await cargar()
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code

    if (codigo === 'CONFIRMACION_REQUERIDA') {
      // El backend pide confirmación textual → mostrar campo y reintentar
      requiereConfirmacionTexto.value = true
      toast.warning('Debes escribir el texto de confirmación')
    } else if (codigo === 'PERIODO_NOT_FOUND') {
      toast.error('El período ya no existe')
      await cargar()
      modalConfirmReabrir?.hide()
    } else {
      toast.error('Error al reabrir: ' + e.message)
    }
  } finally {
    if (!unmounted) {
      reabriendo.value = false
      reabriendoId.value = null
    }
  }
}

// Watch para el preview cuando cambia el año/mes
watch(
  () => [form.value.anio, form.value.mes],
  () => { errorModal.value = '' }
)

// ===== LIFECYCLE =====
onMounted(async () => {
  await Promise.all([cargar(), cargarPermisos()])
})

onBeforeUnmount(() => {
  unmounted = true
  try { modalCierre?.hide() } catch { /* noop */ }
  try { modalConfirmReabrir?.hide() } catch { /* noop */ }
})
</script>

<style scoped>
.periodos-page { display: flex; flex-direction: column; gap: 20px; }

/* HEADER */
.page-header {
  display: flex; justify-content: space-between;
  align-items: flex-start; flex-wrap: wrap; gap: 16px;
}
.page-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800; color: var(--text-primary);
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 4px; letter-spacing: -0.03em;
}
.title-icon {
  width: 42px; height: 42px; border-radius: 12px;
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 1.15rem;
}
.title-icon-red {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  box-shadow: 0 6px 16px rgba(231,76,60,0.3);
}
.page-subtitle {
  color: var(--text-muted); font-size: 0.85rem;
  margin: 0; padding-left: 54px;
}
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn-primary, .btn-secondary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: var(--radius-md);
  font-weight: 600; font-size: 0.85rem; cursor: pointer;
  transition: all var(--transition); font-family: inherit; border: none;
}
.btn-primary {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: #fff; box-shadow: 0 4px 12px rgba(231,76,60,0.3);
}
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(231,76,60,0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-secondary {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-secondary:hover:not(:disabled) { border-color: #e74c3c; color: #e74c3c; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

/* INFO */
.info-card {
  display: flex; gap: 14px; padding: 16px 20px;
  background: rgba(52,152,219,0.06);
  border: 1px solid rgba(52,152,219,0.25);
  border-left: 4px solid #3498db;
  border-radius: var(--radius-lg);
}
.info-icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(52,152,219,0.15); color: #3498db;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem; flex-shrink: 0;
}
.info-body { flex: 1; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.5; }
.info-body strong { color: var(--text-primary); display: block; margin-bottom: 4px; }

/* STATS */
.stats-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.stat-card {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 18px; background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  border-left: 4px solid transparent;
  transition: all var(--transition);
}
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-card-info { border-left-color: #3498db; }
.stat-card-warning { border-left-color: #f39c12; background: rgba(243,156,18,0.04); }
.stat-card-success { border-left-color: #27ae60; background: rgba(39,174,96,0.04); }

.stat-icon {
  width: 46px; height: 46px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem; flex-shrink: 0;
}
.stat-icon.rojo { background: rgba(231,76,60,0.12); color: #e74c3c; }
.stat-icon.azul { background: rgba(52,152,219,0.12); color: #3498db; }
.stat-icon.naranja { background: rgba(243,156,18,0.12); color: #f39c12; }
.stat-icon.morado { background: rgba(142,68,173,0.12); color: #8e44ad; }

.stat-info { flex: 1; min-width: 0; }
.stat-value {
  font-size: 1.4rem; font-weight: 800; color: var(--text-primary);
  line-height: 1.15; font-variant-numeric: tabular-nums;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.stat-label {
  font-size: 0.7rem; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.4px;
  font-weight: 600; margin-top: 4px;
}

/* AÑOS */
.anios-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}
.card-header-flex {
  display: flex; justify-content: space-between;
  align-items: center; gap: 12px; flex-wrap: wrap;
}
.header-badge {
  padding: 3px 10px; background: var(--bg-table-stripe);
  border-radius: var(--radius-full);
  font-size: 0.72rem; font-weight: 700; color: var(--text-muted);
}
.badge-rojo { background: rgba(231,76,60,0.15); color: #c0392b; }
.header-count {
  margin-left: 6px; padding: 2px 10px;
  background: rgba(231,76,60,0.15); color: #c0392b;
  border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 800;
}

/* MESES */
.meses-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
}
.mes-cell {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 10px; border-radius: 8px;
  background: var(--bg-table-stripe);
  border: 1.5px solid transparent;
  font-size: 0.78rem; font-weight: 700;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
  position: relative;
}
.mes-cell:hover:not(:disabled) {
  border-color: #e74c3c;
  background: rgba(231,76,60,0.06);
  color: #c0392b;
  transform: translateY(-1px);
}
.mes-cell:disabled { opacity: 0.6; cursor: not-allowed; }
.mes-nombre { text-transform: capitalize; }
.mes-lock { font-size: 0.7rem; }

.mes-cerrado {
  background: linear-gradient(135deg, rgba(231,76,60,0.15), rgba(231,76,60,0.08));
  color: #c0392b;
  border-color: rgba(231,76,60,0.3);
}
.mes-cerrado:hover:not(:disabled) {
  border-color: #c0392b;
  background: rgba(231,76,60,0.2);
}
.mes-actual {
  background: linear-gradient(135deg, rgba(52,152,219,0.12), rgba(52,152,219,0.04));
  color: #2980b9;
  border-color: rgba(52,152,219,0.3);
}
.mes-actual:hover:not(:disabled) {
  border-color: #3498db;
  color: #2980b9;
}
.mes-actual-dot { font-size: 0.55rem; color: #3498db; }
.mes-hoy {
  box-shadow: 0 0 0 2px rgba(52,152,219,0.15);
}
.mes-futuro {
  opacity: 0.45;
  cursor: not-allowed;
}
.mes-futuro:hover { transform: none; }

/* HISTORIAL */
.select-sm {
  padding: 6px 12px; background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.8rem; font-family: inherit; cursor: pointer;
}

.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th {
  padding: 14px 12px; text-align: left;
  font-size: 0.7rem; font-weight: 700;
  color: var(--text-muted); text-transform: uppercase;
  letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color);
  white-space: nowrap;
}
.table-modern td {
  padding: 14px 12px; border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }

.badge-periodo {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: var(--radius-full);
  background: rgba(231,76,60,0.12);
  color: #c0392b; font-weight: 700; font-size: 0.78rem;
}

.fecha-cell .fecha-main {
  font-weight: 600; color: var(--text-primary); font-size: 0.85rem;
}
.fecha-cell .fecha-sub {
  font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;
}

.usuario-cell { display: flex; align-items: center; gap: 10px; }
.usuario-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 0.75rem; flex-shrink: 0;
}
.usuario-email {
  font-size: 0.82rem; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 180px;
}

.observaciones-text {
  font-size: 0.82rem; color: var(--text-secondary);
  max-width: 320px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}

.btn-reabrir {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: var(--radius-md);
  background: rgba(231,76,60,0.1);
  border: 1.5px solid rgba(231,76,60,0.4);
  color: #c0392b; font-weight: 700; font-size: 0.78rem;
  cursor: pointer; transition: all var(--transition-fast);
  font-family: inherit;
}
.btn-reabrir:hover:not(:disabled) {
  background: #e74c3c; color: #fff; border-color: #e74c3c;
  transform: translateY(-1px);
}
.btn-reabrir:disabled { opacity: 0.5; cursor: not-allowed; }

/* EMPTY / SKELETON */
.empty-cell { padding: 0 !important; }
.empty-state {
  text-align: center; padding: 60px 20px; color: var(--text-muted);
}
.empty-state i {
  font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 12px;
}
.empty-title {
  font-weight: 700; color: var(--text-primary);
  font-size: 1rem; margin-bottom: 4px;
}
.empty-text { font-size: 0.85rem; margin-bottom: 16px; max-width: 460px; margin-left: auto; margin-right: auto; }
.empty-action {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px;
  background: rgba(231,76,60,0.1);
  border: 1px solid rgba(231,76,60,0.3);
  border-radius: var(--radius-md);
  color: #c0392b; font-weight: 600; font-size: 0.82rem;
  cursor: pointer; transition: all var(--transition-fast); font-family: inherit;
}
.empty-action:hover { background: #e74c3c; color: #fff; }

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
.mx-auto { margin-left: auto; margin-right: auto; }
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* MODALES */
.modal-content-clean { border-radius: 14px; overflow: hidden; border: none; }

.alert-box {
  display: flex; gap: 12px; padding: 14px 16px;
  border-radius: var(--radius-md); border-left: 4px solid;
  margin-bottom: 16px;
}
.alert-box-warning {
  background: rgba(243,156,18,0.08);
  border-color: #f39c12;
  color: #d68910;
}
.alert-box-danger {
  background: rgba(231,76,60,0.08);
  border-color: #e74c3c;
  color: #c0392b;
}
.alert-box > i { font-size: 1.2rem; flex-shrink: 0; margin-top: 2px; }
.alert-box strong { display: block; color: var(--text-primary); margin-bottom: 4px; font-size: 0.9rem; }
.alert-box .small { font-size: 0.78rem; line-height: 1.5; }

.form-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
}
.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-field-full { grid-column: 1 / -1; }
.form-label {
  font-size: 0.82rem; font-weight: 600; color: var(--text-primary);
}
.form-label .required { color: var(--danger); margin-right: 2px; }
.form-label code {
  background: rgba(231,76,60,0.1);
  padding: 2px 6px; border-radius: 4px;
  color: #c0392b; font-weight: 700; font-size: 0.85em;
}
.form-hint { font-size: 0.72rem; color: var(--text-muted); }

.form-input {
  width: 100%; padding: 11px 14px;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.9rem; font-family: inherit;
  outline: none; transition: all var(--transition-fast);
}
.form-input:focus {
  border-color: #e74c3c;
  box-shadow: 0 0 0 4px rgba(231,76,60,0.12);
  background: var(--bg-card);
}
.form-input:disabled { opacity: 0.6; cursor: not-allowed; }
.form-input.is-invalid { border-color: var(--danger); }
.form-input.is-valid { border-color: var(--success); }

.preview-periodo {
  display: flex; gap: 12px; align-items: center;
  padding: 12px 16px; margin: 12px 0;
  background: rgba(39,174,96,0.06);
  border: 1px solid rgba(39,174,96,0.25);
  border-left: 4px solid #27ae60;
  border-radius: var(--radius-md);
  color: #1e8449;
}
.preview-periodo.preview-warn {
  background: rgba(231,76,60,0.06);
  border-color: rgba(231,76,60,0.25);
  border-left-color: #e74c3c;
  color: #c0392b;
}
.preview-icon {
  width: 36px; height: 36px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; flex-shrink: 0;
}
.preview-periodo:not(.preview-warn) .preview-icon { background: rgba(39,174,96,0.15); }
.preview-periodo.preview-warn .preview-icon { background: rgba(231,76,60,0.15); }
.preview-body { flex: 1; min-width: 0; }
.preview-title {
  font-weight: 700; color: var(--text-primary);
  font-size: 0.92rem; margin-bottom: 2px;
}
.preview-detail { font-size: 0.78rem; }

.error-banner {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; margin-top: 12px;
  background: var(--danger-bg);
  border: 1px solid rgba(231,76,60,0.3);
  border-left: 4px solid var(--danger);
  border-radius: var(--radius-md);
  color: var(--danger);
  font-weight: 500; font-size: 0.85rem;
}

/* TRANSITIONS */
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .meses-grid { grid-template-columns: repeat(3, 1fr); }
  .form-grid { grid-template-columns: 1fr; }
  .usuario-email { max-width: 120px; }
}
</style>