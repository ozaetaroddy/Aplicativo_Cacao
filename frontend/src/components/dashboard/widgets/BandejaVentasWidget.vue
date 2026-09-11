<template>
  <div class="bandeja-widget">
    <div class="bandeja-header">
      <div class="d-flex align-items-center gap-2">
        <span class="badge-count">{{ totalPendientes }}</span>
        <span class="text-muted small">pendientes</span>
      </div>
      <router-link to="/ventas" class="btn-ver-todas">
        Ver todas <i class="fas fa-arrow-right ms-1"></i>
      </router-link>
    </div>

    <div v-if="loading" class="text-center py-4">
      <i class="fas fa-spinner fa-spin"></i>
    </div>

    <div v-else-if="ventas.length === 0" class="text-muted text-center py-4">
      <i class="fas fa-inbox fa-2x mb-2 d-block opacity-50"></i>
      No hay ventas recientes
    </div>

    <div v-else class="bandeja-lista">
      <div
        v-for="venta in ventas"
        :key="venta._id"
        class="bandeja-item"
        @click="verDocumento(venta)"
      >
        <div class="bandeja-icon" :class="venta.estado_pago === 'pagado' ? 'icon-success' : 'icon-warning'">
          <i class="fas fa-file-invoice"></i>
        </div>
        <div class="bandeja-info">
          <div class="bandeja-titulo">
            {{ venta.numero_factura || 'Sin número' }}
          </div>
          <div class="bandeja-subtitulo">
            {{ venta.cliente?.nombre || 'Cliente no asignado' }}
          </div>
        </div>
        <div class="bandeja-monto">
          <div class="monto">${{ (venta.total || 0).toFixed(2) }}</div>
          <span
            class="badge-estado"
            :class="venta.estado_pago === 'pagado' ? 'badge-pagado' : 'badge-pendiente'"
          >
            {{ venta.estado_pago === 'pagado' ? 'Pagado' : 'Pendiente' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../../services/api'

const router = useRouter()
const ventas = ref([])
const totalPendientes = ref(0)
const loading = ref(true)

const cargarVentas = async () => {
  loading.value = true
  try {
    const response = await api.request('/ventas?page=1&limit=8&sortBy=fecha_emision&sortDir=desc', {
      method: 'GET'
    })
    const datos = Array.isArray(response) ? response : (response.data || [])
    ventas.value = datos

    // Contar pendientes del resultado (si quieres el total real, haz otra petición)
    totalPendientes.value = datos.filter(v => v.estado_pago !== 'pagado').length
  } catch (e) {
    console.error('Error cargando ventas:', e)
  } finally {
    loading.value = false
  }
}

const verDocumento = (venta) => {
  router.push(`/consultar-documentos?tipo=venta&id=${venta._id}`)
}

onMounted(cargarVentas)
</script>

<style scoped>
.bandeja-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.bandeja-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}

.badge-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 8px;
  border-radius: 13px;
  background: var(--primary-color);
  color: #fff;
  font-weight: 700;
  font-size: 0.8rem;
}

.btn-ver-todas {
  font-size: 0.8rem;
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;
  transition: var(--transition);
}
.btn-ver-todas:hover {
  color: var(--primary-dark);
  text-decoration: underline;
}

.bandeja-lista {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 380px;
  overflow-y: auto;
}

.bandeja-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: var(--transition);
}
.bandeja-item:hover {
  background: var(--bg-table-stripe);
  transform: translateX(3px);
}

.bandeja-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  font-size: 0.95rem;
}
.icon-success { background: linear-gradient(135deg, #27ae60, #1e8449); }
.icon-warning { background: linear-gradient(135deg, #f39c12, #d68910); }

.bandeja-info {
  flex: 1;
  min-width: 0;
}
.bandeja-titulo {
  font-weight: 600;
  font-size: 0.88rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bandeja-subtitulo {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bandeja-monto {
  text-align: right;
  flex-shrink: 0;
}
.monto {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.badge-estado {
  display: inline-block;
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.badge-pagado {
  background: rgba(39, 174, 96, 0.15);
  color: #27ae60;
}
.badge-pendiente {
  background: rgba(243, 156, 18, 0.15);
  color: #d68910;
}

body.dark-mode .badge-pagado {
  background: rgba(39, 174, 96, 0.25);
  color: #58d68d;
}
body.dark-mode .badge-pendiente {
  background: rgba(243, 156, 18, 0.25);
  color: #f7b731;
}
</style>