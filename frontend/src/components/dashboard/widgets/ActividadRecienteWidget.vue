<template>
  <div class="actividad-container">
    <div v-if="actividades.length === 0" class="text-muted text-center py-3">
      No hay actividad reciente
    </div>
    <div v-for="(act, idx) in actividades" :key="idx" class="actividad-item">
      <div class="actividad-icon" :style="{ background: act.color }">
        <i :class="act.icono"></i>
      </div>
      <div class="actividad-info">
        <div class="actividad-descripcion">{{ act.descripcion }}</div>
        <div class="actividad-fecha">{{ act.fecha }}</div>
      </div>
      <div class="actividad-monto" v-if="act.monto">
        ${{ act.monto.toFixed(2) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../../../composables/useMongoDB'

const { find } = useMongoDB()
const actividades = ref([])

const cargarActividadReciente = async () => {
  try {
    const [ventas, compras] = await Promise.all([
      find('ventas'),
      find('compras')
    ])
    const items = [
      ...ventas.map(v => ({
        fechaObj: new Date(v.fecha_emision),
        descripcion: `Factura ${v.numero_factura || 'N/A'} - ${v.cliente?.nombre || 'Sin cliente'}`,
        icono: 'fa-file-invoice',
        color: '#3498db',
        monto: v.total || 0
      })),
      ...compras.map(c => ({
        fechaObj: new Date(c.fecha_emision),
        descripcion: `Compra ${c.numero_factura || 'N/A'} - ${c.proveedor?.nombre || 'Sin proveedor'}`,
        icono: 'fa-shopping-cart',
        color: '#27ae60',
        monto: c.total || 0
      }))
    ]
    items.sort((a, b) => b.fechaObj - a.fechaObj)
    actividades.value = items.slice(0, 10).map(item => ({
      descripcion: item.descripcion,
      fecha: item.fechaObj.toLocaleDateString('es-EC', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }),
      icono: item.icono,
      color: item.color,
      monto: item.monto
    }))
  } catch (e) {
    console.error('Error cargando actividad reciente:', e)
  }
}

onMounted(cargarActividadReciente)
</script>

<style scoped>
.actividad-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
  border-bottom: 1px solid #f0f0f0;
}
.actividad-item:last-child { border-bottom: none; }
.actividad-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.9rem;
  flex-shrink: 0;
}
.actividad-info {
  flex: 1;
  min-width: 0;
}
.actividad-descripcion {
  font-size: 0.85rem;
  font-weight: 500;
  color: #2d2d2d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.actividad-fecha {
  font-size: 0.7rem;
  color: #7f8c8d;
}
.actividad-monto {
  font-weight: 700;
  font-size: 0.85rem;
}
body.dark-mode .actividad-item {
  border-bottom-color: var(--border-color);
}
body.dark-mode .actividad-descripcion {
  color: #e0e0e0;
}
body.dark-mode .actividad-fecha {
  color: #a0aec0;
}
body.dark-mode .actividad-monto {
  color: #e0e0e0;
}
</style>