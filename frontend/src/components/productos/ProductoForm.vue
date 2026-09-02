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
              <input type="text" class="form-control" v-model="form.codigo" placeholder="Automático" readonly>
            </div>

            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Nombre</label>
              <input type="text" class="form-control" v-model="form.nombre" required>
            </div>

            <div class="col-md-4">
              <label class="form-label">Categoría</label>
              <div class="d-flex gap-1">
                <select class="form-select" v-model="form.categoriaId">
                  <option value="">Sin categoría</option>
                  <option v-for="cat in categorias" :key="cat._id" :value="cat._id">{{ cat.nombre }}</option>
                </select>
                <button type="button" class="btn btn-primary" @click="abrirModalCategoria" title="Nueva Categoría">
                  <i class="fas fa-plus"></i>
                </button>
              </div>
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

            <div class="col-md-3">
              <label class="form-label">Tipo de Medida</label>
              <select class="form-select" v-model="form.tipo_medida">
                <option value="unidad">Unidad (sin decimales)</option>
                <option value="peso">Peso (permite decimales)</option>
                <option value="volumen">Volumen (permite decimales)</option>
                <option value="longitud">Longitud (permite decimales)</option>
              </select>
            </div>

            <div class="col-md-3 d-flex align-items-center">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" v-model="form.aplica_iva" id="aplicaIVA">
                <label class="form-check-label" for="aplicaIVA">
                  Aplica IVA
                </label>
              </div>
            </div>

            <div class="col-md-4">
              <label class="form-label">Código de Barras</label>
              <input type="text" class="form-control" v-model="form.codigo_barras">
            </div>
            <div class="col-md-4">
              <label class="form-label">URL de la Foto</label>
              <input type="text" class="form-control" v-model="form.foto" placeholder="https://ejemplo.com/foto.jpg">
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

    <!-- Modal para nueva categoría -->
    <div class="modal fade" id="modalCategoria" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="fas fa-tag"></i> Nueva Categoría</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="guardarCategoria">
              <div class="mb-3">
                <label class="form-label"><span class="text-danger">*</span> Nombre</label>
                <input type="text" class="form-control" v-model="nuevaCategoria.nombre" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Descripción</label>
                <input type="text" class="form-control" v-model="nuevaCategoria.descripcion">
              </div>
              <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="submit" class="btn btn-primary" :disabled="cargandoCategoria">
                  <i class="fas fa-save" :class="{ 'fa-spin': cargandoCategoria }"></i>
                  {{ cargandoCategoria ? 'Guardando...' : 'Guardar Categoría' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'
import { Modal } from 'bootstrap'
import { useToast } from 'vue-toastification'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { find, findById, insertOne, updateOne } = useMongoDB()
const id = route.params.id
const categorias = ref([])
const cargandoCategoria = ref(false)

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
  observaciones: '',
  aplica_iva: true,
  tipo_medida: 'unidad'
})

const nuevaCategoria = ref({ nombre: '', descripcion: '' })
let modalInstance = null

const abrirModalCategoria = () => {
  nuevaCategoria.value = { nombre: '', descripcion: '' }
  if (!modalInstance) {
    const modalEl = document.getElementById('modalCategoria')
    modalInstance = new Modal(modalEl)
  }
  modalInstance.show()
}

const guardarCategoria = async () => {
  if (!nuevaCategoria.value.nombre) {
    toast.warning('El nombre de la categoría es obligatorio')
    return
  }
  cargandoCategoria.value = true
  try {
    const nueva = {
      nombre: nuevaCategoria.value.nombre.trim(),
      descripcion: nuevaCategoria.value.descripcion?.trim() || ''
    }
    const result = await insertOne('categorias', nueva)
    categorias.value = await find('categorias')
    form.value.categoriaId = result._id
    modalInstance.hide()
    toast.success('Categoría creada exitosamente')
  } catch (e) {
    toast.error('Error al crear categoría: ' + e.message)
  } finally {
    cargandoCategoria.value = false
  }
}

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
      form.value.codigo = generarCodigoProducto()
    }
  } catch (e) {
    console.error(e)
    toast.error('Error al cargar datos: ' + e.message)
  }
})

const guardar = async () => {
  if (!form.value.nombre) {
    toast.warning('El nombre es obligatorio')
    return
  }
  try {
    if (id) {
      await updateOne('productos', id, form.value)
      toast.success('Producto actualizado correctamente')
    } else {
      await insertOne('productos', form.value)
      toast.success('Producto creado correctamente')
    }
    router.push('/productos')
  } catch (e) {
    toast.error('Error al guardar: ' + e.message)
  }
}
</script>