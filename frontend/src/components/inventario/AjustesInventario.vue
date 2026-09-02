<template>
  <div>
    <h4 class="section-title"><i class="fas fa-edit"></i> Ajustes de Inventario</h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardarAjuste">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Producto</label>
              <select class="form-select" v-model="ajuste.productoId" required>
                <option value="">Seleccionar</option>
                <option v-for="p in productos" :key="p._id" :value="p._id">{{ p.nombre }} (Stock: {{ p.stock }})</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Cantidad</label>
              <input type="number" class="form-control" v-model.number="ajuste.cantidad" required>
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Tipo</label>
              <select class="form-select" v-model="ajuste.tipo" required>
                <option value="">Seleccionar</option>
                <option value="sumar">Sumar (Ingreso)</option>
                <option value="restar">Restar (Salida)</option>
                <option value="corregir">Corregir (Asignar valor exacto)</option>
              </select>
            </div>
            <div class="col-md-2 d-flex align-items-end">
              <button type="submit" class="btn btn-primary w-100"><i class="fas fa-save"></i> Aplicar</button>
            </div>
          </div>
          <div class="mt-3">
            <label class="form-label">Motivo del ajuste</label>
            <textarea class="form-control" v-model="ajuste.motivo" rows="2" placeholder="Describa el motivo del ajuste"></textarea>
          </div>
        </form>
      </div>
    </div>

    <div class="card card-cacao mt-3">
      <div class="card-header"><i class="fas fa-history"></i> Historial de Ajustes</div>
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(adj, idx) in historial" :key="idx">
              <td>{{ adj.fecha || 'N/A' }}</td>
              <td>{{ adj.productoNombre || 'N/A' }}</td>
              <td><span class="badge" :class="adj.tipo === 'sumar' ? 'bg-success' : adj.tipo === 'restar' ? 'bg-danger' : 'bg-warning'">{{ adj.tipo }}</span></td>
              <td>{{ adj.cantidad }}</td>
              <td>{{ adj.motivo || 'Sin motivo' }}</td>
            </tr>
            <tr v-if="historial.length === 0">
              <td colspan="5" class="text-center text-muted">No hay ajustes registrados</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'

const toast = useToast()
const { find, updateOne } = useMongoDB()
const productos = ref([])
const historial = ref([])

const ajuste = ref({
  productoId: '',
  cantidad: 0,
  tipo: '',
  motivo: ''
})

const guardarAjuste = async () => {
  if (!ajuste.value.productoId || !ajuste.value.cantidad || !ajuste.value.tipo) {
    toast.warning('Complete todos los campos obligatorios')
    return
  }

  const producto = productos.value.find(p => p._id === ajuste.value.productoId)
  if (!producto) {
    toast.warning('Producto no encontrado')
    return
  }

  let nuevaCantidad = producto.stock
  if (ajuste.value.tipo === 'sumar') {
    nuevaCantidad += ajuste.value.cantidad
  } else if (ajuste.value.tipo === 'restar') {
    nuevaCantidad -= ajuste.value.cantidad
  } else if (ajuste.value.tipo === 'corregir') {
    nuevaCantidad = ajuste.value.cantidad
  }

  if (nuevaCantidad < 0) {
    toast.warning('La cantidad no puede ser negativa')
    return
  }

  try {
    await updateOne('productos', producto._id, { stock: nuevaCantidad })
    historial.value.unshift({
      fecha: new Date().toLocaleString(),
      productoNombre: producto.nombre,
      tipo: ajuste.value.tipo,
      cantidad: ajuste.value.cantidad,
      motivo: ajuste.value.motivo
    })
    productos.value = await find('productos')
    ajuste.value = { productoId: '', cantidad: 0, tipo: '', motivo: '' }
    toast.success('Ajuste aplicado correctamente')
  } catch (e) {
    toast.error('Error al aplicar ajuste: ' + e.message)
  }
}

onMounted(async () => {
  try {
    productos.value = await find('productos')
  } catch (e) {
    console.error(e)
    toast.error('Error al cargar productos: ' + e.message)
  }
})
</script>