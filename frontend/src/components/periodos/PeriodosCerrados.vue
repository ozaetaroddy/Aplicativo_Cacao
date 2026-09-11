<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title"><i class="fas fa-lock"></i> Períodos Cerrados</h4>
      <button class="btn btn-primary" @click="abrirModalCierre">
        <i class="fas fa-plus"></i> Cerrar Período
      </button>
    </div>

    <div class="alert alert-info">
      <i class="fas fa-info-circle me-2"></i>
      Una vez cerrado un período, <strong>no se podrán crear, editar ni eliminar</strong> facturas o compras con fecha dentro de ese mes.
      Solo administradores pueden reabrir un período.
    </div>

    <div class="row g-3 mb-4">
      <div class="col-md-4" v-for="anio in aniosDisponibles" :key="anio">
        <div class="card card-cacao">
          <div class="card-header">
            <i class="fas fa-calendar me-2"></i> Año {{ anio }}
          </div>
          <div class="card-body">
            <div class="meses-grid">
              <div
                v-for="(nombre, idx) in MESES"
                :key="idx"
                class="mes-cell"
                :class="{ 'mes-cerrado': estaCerrado(anio, idx + 1) }"
              >
                <span>{{ nombre.substring(0, 3) }}</span>
                <i v-if="estaCerrado(anio, idx + 1)" class="fas fa-lock mes-lock"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card card-cacao">
      <div class="card-header">
        <i class="fas fa-list me-2"></i> Historial de cierres
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-cacao">
            <thead>
              <tr>
                <th>Período</th>
                <th>Fecha de cierre</th>
                <th>Cerrado por</th>
                <th>Observaciones</th>
                <th style="width:120px;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="5" class="text-center py-4">
                  <i class="fas fa-spinner fa-spin"></i> Cargando...
                </td>
              </tr>
              <tr v-else-if="periodos.length === 0">
                <td colspan="5" class="text-center text-muted py-4">
                  No hay períodos cerrados
                </td>
              </tr>
              <tr v-else v-for="p in periodos" :key="p._id">
                <td>
                  <span class="badge-periodo">
                    <i class="fas fa-lock me-1"></i> {{ p.nombre }}
                  </span>
                </td>
                <td class="small">
                  {{ p.fecha_cierre ? new Date(p.fecha_cierre).toLocaleString('es-EC') : 'N/A' }}
                </td>
                <td class="small">{{ p.cerrado_por || 'N/A' }}</td>
                <td class="small text-muted">{{ p.observaciones || '—' }}</td>
                <td>
                  <button
                    v-if="puedeReabrir"
                    class="btn btn-sm btn-outline-danger"
                    @click="reabrir(p)"
                    title="Reabrir período"
                  >
                    <i class="fas fa-unlock"></i> Reabrir
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="modal fade" id="modalCerrarPeriodo" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="fas fa-lock me-2"></i> Cerrar Período</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-warning">
              <i class="fas fa-exclamation-triangle me-2"></i>
              Al cerrar un período, <strong>no podrá modificar documentos</strong> de ese mes.
              Asegúrese de que todas las facturas y compras están correctas antes de continuar.
            </div>

            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label"><span class="text-danger">*</span> Año</label>
                <input type="number" class="form-control" v-model.number="form.anio" min="2020" max="2100" />
              </div>
              <div class="col-md-6">
                <label class="form-label"><span class="text-danger">*</span> Mes</label>
                <select class="form-select" v-model.number="form.mes">
                  <option v-for="(nombre, idx) in MESES" :key="idx" :value="idx + 1">
                    {{ nombre }}
                  </option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label">Observaciones</label>
                <textarea class="form-control" v-model="form.observaciones" rows="2" placeholder="Motivo del cierre, número de declaración, etc."></textarea>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-danger" @click="cerrarPeriodo" :disabled="cargando">
              <i class="fas fa-lock" :class="{ 'fa-spin': cargando }"></i>
              {{ cargando ? 'Cerrando...' : 'Cerrar período' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { usePermisos } from '../../composables/usePermisos'

const toast = useToast()
const { puede } = usePermisos()

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const periodos = ref([])
const loading = ref(false)
const cargando = ref(false)
const modalInstance = ref(null)

const form = ref({
  anio: new Date().getFullYear(),
  mes: new Date().getMonth() + 1,
  observaciones: ''
})

const puedeReabrir = computed(() => puede('usuarios', 'ver'))

const aniosDisponibles = computed(() => {
  const actual = new Date().getFullYear()
  return [actual - 1, actual, actual + 1]
})

const estaCerrado = (anio, mes) => {
  return periodos.value.some(p => p.anio === anio && p.mes === mes)
}

const cargar = async () => {
  loading.value = true
  try {
    periodos.value = await api.request('/periodos', { method: 'GET' })
  } catch (e) {
    console.error('Error cargando períodos:', e)
    toast.error('Error al cargar períodos: ' + e.message)
  } finally {
    loading.value = false
  }
}

const abrirModalCierre = () => {
  form.value = {
    anio: new Date().getFullYear(),
    mes: new Date().getMonth() + 1,
    observaciones: ''
  }
  if (!modalInstance.value) {
    const modalEl = document.getElementById('modalCerrarPeriodo')
    modalInstance.value = new Modal(modalEl)
  }
  modalInstance.value.show()
}

const cerrarPeriodo = async () => {
  if (!form.value.anio || !form.value.mes) {
    toast.warning('Complete año y mes')
    return
  }
  cargando.value = true
  try {
    await api.request('/periodos', {
      method: 'POST',
      body: JSON.stringify(form.value),
      loaderMessage: 'Cerrando período...'
    })
    toast.success('Período cerrado correctamente')
    modalInstance.value?.hide()
    cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    cargando.value = false
  }
}

const reabrir = async (p) => {
  if (!confirm(`¿Está seguro de reabrir el período ${p.nombre}?\n\nDespués de esto, se podrán modificar documentos de ese mes.`)) return
  try {
    await api.request(`/periodos/${p._id}`, {
      method: 'DELETE',
      loaderMessage: 'Reabriendo período...'
    })
    toast.success('Período reabierto correctamente')
    cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

onMounted(cargar)
</script>

<style scoped>
.meses-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.mes-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--bg-table-stripe);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  transition: var(--transition);
}
.mes-cerrado {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
  border: 1px solid rgba(231, 76, 60, 0.3);
}
.mes-lock {
  font-size: 0.7rem;
}

.badge-periodo {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 20px;
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
  font-weight: 700;
  font-size: 0.8rem;
}
</style>