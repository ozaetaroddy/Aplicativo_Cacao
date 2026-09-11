<template>
  <div class="bandeja-widget">
    <div class="bandeja-header">
      <div class="d-flex align-items-center gap-2">
        <span class="badge-count badge-count-compras">{{ totalPendientes }}</span>
        <span class="text-muted small">pendientes</span>
      </div>
      <router-link to="/compras" class="btn-ver-todas">
        Ver todas <i class="fas fa-arrow-right ms-1"></i>
      </router-link>
    </div>

    <div v-if="loading" class="text-center py-4">
      <i class="fas fa-spinner fa-spin"></i>
    </div>

    <div v-else-if="compras.length === 0" class="text-muted text-center py-4">
      <i class="fas fa-inbox fa-2x mb-2 d-block opacity-50"></i>
      No hay compras recientes
    </div>

    <div v-else class="bandeja-lista">
      <div
        v-for="compra in compras"
        :key="compra._id"
        class="bandeja-item"
        @click="verCompra(compra)"
      >
        <div class="bandeja-icon" :class="compra.estado_pago === 'pagado' ? 'icon-success' : 'icon-danger'">
          <i class="fas fa-shopping-cart"></i>
        </div>
        <div class="bandeja-info">
          <div class="bandeja-titulo">
            {{ compra.numero_factura || 'Sin número' }}
          </div>
          <div class="bandeja-subtitulo">
            {{ compra.proveedor?.nombre || 'Proveedor no asignado' }}
          </div>
        </div>
        <div class="bandeja-monto">
          <div class="monto">${{ (compra.total || 0).toFixed(2) }}</div>
          <span
            class="badge-estado"
            :class="compra.estado_pago === 'pagado' ? 'badge-pagado' : 'badge-pendiente'"
          >
            {{ compra.estado_pago === 'pagado' ? 'Pagado' : 'Pendiente' }}
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
const compras = ref([])
const totalPendientes = ref(0)
const loading = ref(true)

const cargarCompras = async () => {
  loading.value = true
  try {
    const response = await api.request('/compras?page=1&limit=8&sortBy=fecha_emision&sortDir=desc', {
      method: 'GET'
    })
    const datos = Array.isArray(response) ? response : (response.data || [])
    compras.value = datos

    totalPendientes.value = datos.filter(c => c.estado_pago !== 'pagado').length
  } catch (e) {
    console.error('Error cargando compras:', e)
  } finally {
    loading.value = false
  }
}

const verCompra = (compra) => {
  // Por ahora, redirige a consultar documentos
  router.push(`/consultar-documentos?tipo=compra&id=${compra._id}`)
}

onMounted(cargarCompras)
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
.badge-count-compras {
  background: #e67e22;
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
.icon-danger { background: linear-gradient(135deg, #e74c3c, #c0392b); }

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
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
}

body.dark-mode .badge-pagado {
  background: rgba(39, 174, 96, 0.25);
  color: #58d68d;
}
body.dark-mode .badge-pendiente {
  background: rgba(231, 76, 60, 0.25);
  color: #ec7063;
}
</style>