<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-boxes"></i> {{ id ? 'Editar' : 'Nuevo' }} Producto
    </h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Código</label>
              <input type="text" class="form-control" v-model="form.codigo" placeholder="Código automático" readonly>
            </div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Nombre</label>
              <input type="text" class="form-control" v-model="form.nombre" required>
            </div>
            <div class="col-md-4">
              <label class="form-label">Categoría</label>
              <select class="form-select" v-model="form.categoriaId">
                <option value="">Sin categoría</option>
                <option v-for="cat in categorias" :key="cat._id" :value="cat._id">{{ cat.nombre }}</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Precio Compra</label>
              <input type="number" step="0.01" class="form-control" v-model.number="form.precio_compra">
            </div>
            <div class="col-md-3">
              <label class="form-label">Precio Venta</label>
              <input type="number" step="0.01" class="form-control" v-model.number="form.precio_venta">
            </div>
            <div class="col-md-3">
              <label class="form-label">Stock Mínimo</label>
              <input type="number" class="form-control" v-model.number="form.stock_minimo">
            </div>
            <div class="col-md-3">
              <label class="form-label">Unidad de Medida</label>
              <select class="form-select" v-model="form.unidad_medida">
                <option value="unidad">Unidad</option>
                <option value="kg">Kilogramo (kg)</option>
                <option value="g">Gramo (g)</option>
                <option value="lb">Libra (lb)</option>
                <option value="caja">Caja</option>
                <option value="paquete">Paquete</option>
                <option value="litro">Litro (L)</option>
                <option value="ml">Mililitro (ml)</option>
                <option value="metro">Metro (m)</option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label">Código de Barras</label>
              <input type="text" class="form-control" v-model="form.codigo_barras">
            </div>
            <div class="col-md-4">
              <label class="form-label">URL de la Foto</label>
              <input type="text" class="form-control" v-model="form.foto">
            </div>
            <div class="col-md-12">
              <label class="form-label">Observaciones</label>
              <textarea class="form-control" v-model="form.observaciones" rows="2"></textarea>
            </div>
          </div>
          <div class="mt-4">
            <button type="submit" class="btn btn-success me-2"><i class="fas fa-save"></i> Guardar</button>
            <router-link to="/productos" class="btn btn-secondary">Cancelar</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'

const route = useRoute()
const router = useRouter()
const { find, findById, insertOne, updateOne } = useMongoDB()
const id = route.params.id
const categorias = ref([])

const form = ref({
  codigo: '',
  nombre: '',
  categoriaId: '',
  descripcion: '',
  precio_compra: 0,
  precio_venta: 0,
  stock_minimo: 0,
  unidad_medida: 'unidad',
  codigo_barras: '',
  foto: '',
  observaciones: ''
})

// Generar código automático para producto
const generarCodigoProducto = () => {
  const ahora = new Date()
  const año = ahora.getFullYear().toString().slice(-2)
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  const aleatorio = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `PROD-${año}${mes}${dia}-${aleatorio}`
}

onMounted(async () => {
  try {
    const cats = await find('categorias')
    categorias.value = cats

    if (id) {
      const prod = await findById('productos', id)
      if (prod) form.value = prod
    } else {
      // Nuevo producto: asignar código automático (editable)
      form.value.codigo = generarCodigoProducto()
    }
  } catch (e) {
    console.error(e)
  }
})

const guardar = async () => {
  try {
    if (id) {
      await updateOne('productos', id, form.value)
    } else {
      await insertOne('productos', form.value)
    }
    router.push('/productos')
  } catch (e) {
    alert('Error al guardar: ' + e.message)
  }
}
</script>