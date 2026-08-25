<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-boxes"></i> {{ id ? 'Editar' : 'Nuevo' }} Producto
    </h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar" novalidate>
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Código</label>
              <input type="text" class="form-control" v-model="form.codigo" required>
            </div>
            <div class="col-md-8">
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
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Precio Compra</label>
              <input type="number" step="0.01" class="form-control" v-model.number="form.precio_compra" required>
            </div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Precio Venta</label>
              <input type="number" step="0.01" class="form-control" v-model.number="form.precio_venta" required>
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
            <div class="col-md-6">
              <label class="form-label">Descripción</label>
              <textarea class="form-control" v-model="form.descripcion" rows="2"></textarea>
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
const { findById, insertOne, updateOne, find } = useMongoDB()
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
  unidad_medida: 'unidad'
})

// ===== CARGAR DATOS SI ES EDICIÓN (CORREGIDO) =====
onMounted(async () => {
  try {
    const cats = await find('categorias')
    categorias.value = cats

    if (id) {
      const data = await findById('productos', id)
      if (data) {
        form.value.codigo = data.codigo || ''
        form.value.nombre = data.nombre || ''
        form.value.categoriaId = data.categoriaId || ''
        form.value.descripcion = data.descripcion || ''
        form.value.precio_compra = data.precio_compra || 0
        form.value.precio_venta = data.precio_venta || 0
        form.value.stock_minimo = data.stock_minimo || 0
        form.value.unidad_medida = data.unidad_medida || 'unidad'
      }
    }
  } catch (e) {
    console.error('Error al cargar datos:', e)
  }
})

const guardar = async () => {
  if (!form.value.codigo || !form.value.nombre) {
    alert('Código y nombre son obligatorios')
    return
  }

  try {
    const datosGuardar = {
      codigo: form.value.codigo.trim(),
      nombre: form.value.nombre.trim(),
      categoriaId: form.value.categoriaId || null,
      descripcion: form.value.descripcion?.trim() || '',
      precio_compra: form.value.precio_compra || 0,
      precio_venta: form.value.precio_venta || 0,
      stock_minimo: form.value.stock_minimo || 0,
      unidad_medida: form.value.unidad_medida || 'unidad'
    }

    if (id) {
      await updateOne('productos', id, datosGuardar)
    } else {
      await insertOne('productos', datosGuardar)
    }
    router.push('/productos')
  } catch (e) {
    console.error('Error al guardar:', e)
    alert('Error al guardar: ' + e.message)
  }
}
</script>