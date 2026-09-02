<template>
  <div>
    <h4 class="section-title"><i class="fas fa-edit"></i> Ajustes de Inventario</h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="realizarAjuste">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Producto</label>
              <select class="form-select" v-model="ajuste.productoId" required>
                <option value="">Seleccionar</option>
                <option v-for="p in productos" :key="p._id" :value="p._id">{{ p.nombre }}</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Cantidad Ajuste</label>
              <input type="number" class="form-control" v-model.number="ajuste.cantidad" step="0.01" required>
            </div>
            <div class="col-md-3">
              <label class="form-label">Tipo</label>
              <select class="form-select" v-model="ajuste.tipo">
                <option value="sumar">Sumar (Ingreso)</option>
                <option value="restar">Restar (Salida)</option>
              </select>
            </div>
            <div class="col-md-2 d-flex align-items-end">
              <button type="submit" class="btn btn-primary w-100">Aplicar Ajuste</button>
            </div>
          </div>
          <div class="row g-3 mt-2">
            <div class="col-md-12">
              <label class="form-label">Motivo</label>
              <input type="text" class="form-control" v-model="ajuste.motivo" placeholder="Motivo del ajuste (opcional)">
            </div>
          </div>
        </form>
      </div>
    </div>

    <div v-if="mensaje" class="alert alert-success mt-3">{{ mensaje }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'

const { find, updateOne } = useMongoDB()
const productos = ref([])
const ajuste = ref({
  productoId: '',
  cantidad: 0,
  tipo: 'sumar',
  motivo: ''
})
const mensaje = ref('')

onMounted(async () => {
  try {
    productos.value = await find('productos')
  } catch (e) {
    console.error(e)
  }
})

const realizarAjuste = async () => {
  if (!ajuste.value.productoId || !ajuste.value.cantidad) {
    alert('Seleccione un producto y una cantidad')
    return
  }

  try {
    const producto = await find('productos', { _id: ajuste.value.productoId })
    if (!producto.length) {
      alert('Producto no encontrado')
      return
    }

    let nuevoStock = producto[0].stock
    if (ajuste.value.tipo === 'sumar') {
      nuevoStock += ajuste.value.cantidad
    } else {
      nuevoStock -= ajuste.value.cantidad
      if (nuevoStock < 0) nuevoStock = 0
    }

    await updateOne('productos', ajuste.value.productoId, { stock: nuevoStock })
    mensaje.value = `Ajuste aplicado correctamente. Nuevo stock: ${nuevoStock}`

    // Actualizar lista de productos para reflejar cambio
    productos.value = await find('productos')
    ajuste.value.productoId = ''
    ajuste.value.cantidad = 0
  } catch (e) {
    alert('Error al aplicar ajuste: ' + e.message)
  }
}
</script>