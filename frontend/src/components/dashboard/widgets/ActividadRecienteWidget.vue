<template>
  <div style="max-height:220px; overflow-y:auto;">
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

const cargarActividad = async () => {
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
        monto: v.total || 0,
        fecha: new Date(v.fecha_emision).toLocaleDateString('es-EC', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      })),
      ...compras.map(c => ({
        fechaObj: new Date(c.fecha_emision),
        descripcion: `Compra ${c.numero_factura || 'N/A'} - ${c.proveedor?.nombre || 'Sin proveedor'}`,
        icono: 'fa-shopping-cart',
        color: '#27ae60',
        monto: c.total || 0,
        fecha: new Date(c.fecha_emision).toLocaleDateString('es-EC', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      }))
    ]
    items.sort((a, b) => b.fechaObj - a.fechaObj)
    actividades.value = items.slice(0, 10)
  } catch (e) { console.error(e) }
}

onMounted(cargarActividad)
</script>

<style scoped>
.actividad-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}
.actividad-item:last-child { border-bottom: none; }
.actividad-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.8rem;
  flex-shrink: 0;
}
.actividad-info {
  flex: 1;
  min-width: 0;
}
.actividad-descripcion {
  font-size: 0.8rem;
  font-weight: 500;
  color: #2d2d2d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.actividad-fecha {
  font-size: 0.65rem;
  color: #7f8c8d;
}
.actividad-monto {
  font-weight: 600;
  color: #1a2a3a;
  font-size: 0.8rem;
  white-space: nowrap;
}
body.dark-mode .actividad-item { border-bottom-color: var(--border-color); }
body.dark-mode .actividad-descripcion { color: #e0e0e0; }
body.dark-mode .actividad-monto { color: #e0e0e0; }
</style>