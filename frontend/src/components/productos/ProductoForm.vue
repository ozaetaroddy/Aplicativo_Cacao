<template>
  <div class="entity-form entity-form-wide">
    <!-- HEADER -->
    <div class="form-header">
      <div class="header-left">
        <button type="button" class="btn-back" @click="$router.push('/productos')">
          <i class="fas fa-arrow-left"></i>
        </button>
        <div>
          <h1 class="form-title">
            <span class="title-icon" :class="id ? 'title-icon-edit' : 'title-icon-amber'">
              <i :class="id ? 'fas fa-box-open' : 'fas fa-box'"></i>
            </span>
            {{ id ? 'Editar Producto' : 'Nuevo Producto' }}
          </h1>
          <p class="form-subtitle">
            {{ id ? 'Modifica los datos del producto' : 'Registra un nuevo producto en el catálogo' }}
          </p>
        </div>
      </div>
      <div class="header-actions">
        <div class="header-status" :class="{ complete: formularioValido }">
          <i :class="formularioValido ? 'fas fa-check-circle' : 'fas fa-circle'"></i>
          <span>{{ formularioValido ? 'Listo para guardar' : 'Complete los campos' }}</span>
        </div>
      </div>
    </div>

    <form @submit.prevent="guardar" novalidate>
      <div class="form-single">

        <!-- SECCIÓN: Identificación -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number section-number-amber">1</div>
            <div class="section-header-content">
              <h2 class="section-title">Identificación</h2>
              <p class="section-desc">Código y nombre del producto</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row cols-1-3">
              <div class="form-field">
                <label class="form-label">Código</label>
                <div class="input-with-icon">
                  <i class="fas fa-barcode input-icon"></i>
                  <input type="text" class="form-control" v-model="form.codigo" readonly />
                </div>
              </div>
              <div class="form-field">
                <label class="form-label"><span class="required">*</span> Nombre</label>
                <input
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errores.nombre }"
                  v-model="form.nombre"
                  @input="validarNombre"
                  placeholder="Ej: Aceite 15W40 1Gal"
                />
                <div v-if="errores.nombre" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.nombre }}
                </div>
              </div>
            </div>

            <div class="form-row cols-2">
              <div class="form-field">
                <label class="form-label">Categoría</label>
                <div class="d-flex gap-2">
                  <select class="form-select" v-model="form.categoriaId">
                    <option value="">Sin categoría</option>
                    <option v-for="cat in categorias" :key="cat._id" :value="cat._id">{{ cat.nombre }}</option>
                  </select>
                  <button type="button" class="btn-icon-outline" @click="abrirModalCategoria" title="Nueva categoría">
                    <i class="fas fa-plus"></i>
                  </button>
                </div>
              </div>
              <div class="form-field">
                <label class="form-label">Código de barras</label>
                <div class="input-with-icon">
                  <i class="fas fa-barcode input-icon"></i>
                  <input type="text" class="form-control" v-model="form.codigo_barras" placeholder="Opcional" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- SECCIÓN: Precios -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number section-number-amber">2</div>
            <div class="section-header-content">
              <h2 class="section-title">Precios y Stock</h2>
              <p class="section-desc">Precios de compra, venta y control de inventario</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row cols-3">
              <div class="form-field">
                <label class="form-label">Precio compra</label>
                <div class="price-input-lg">
                  <span>$</span>
                  <input
                    type="number" step="0.01" min="0"
                    class="form-control"
                    :class="{ 'is-invalid': errores.precio_compra }"
                    v-model.number="form.precio_compra"
                    @input="validarPrecioCompra"
                    placeholder="0.00"
                  />
                </div>
                <div v-if="errores.precio_compra" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.precio_compra }}
                </div>
              </div>
              <div class="form-field">
                <label class="form-label">Precio venta</label>
                <div class="price-input-lg">
                  <span>$</span>
                  <input
                    type="number" step="0.01" min="0"
                    class="form-control"
                    :class="{ 'is-invalid': errores.precio_venta }"
                    v-model.number="form.precio_venta"
                    @input="validarPrecioVenta"
                    placeholder="0.00"
                  />
                </div>
                <div v-if="errores.precio_venta" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.precio_venta }}
                </div>
              </div>
              <div class="form-field">
                <label class="form-label">Stock mínimo</label>
                <div class="input-with-icon">
                  <i class="fas fa-cube input-icon"></i>
                  <input
                    type="number" min="0"
                    class="form-control"
                    :class="{ 'is-invalid': errores.stock_minimo }"
                    v-model.number="form.stock_minimo"
                    @input="validarStockMinimo"
                    placeholder="0"
                  />
                </div>
                <div v-if="errores.stock_minimo" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.stock_minimo }}
                </div>
              </div>
            </div>

            <!-- Cálculo del margen -->
            <div v-if="margenGanancia > 0" class="margin-info">
              <i class="fas fa-chart-line"></i>
              <span>Margen de ganancia: <strong>{{ margenGanancia.toFixed(2) }}%</strong></span>
            </div>
          </div>
        </section>

        <!-- SECCIÓN: Medidas e IVA -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number section-number-amber">3</div>
            <div class="section-header-content">
              <h2 class="section-title">Medida e IVA</h2>
              <p class="section-desc">Unidades y configuración tributaria</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row cols-3">
              <div class="form-field">
                <label class="form-label">Unidad de medida</label>
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
              <div class="form-field">
                <label class="form-label">Tipo de medida</label>
                <select class="form-select" v-model="form.tipo_medida">
                  <option value="unidad">Unidad (sin decimales)</option>
                  <option value="peso">Peso (con decimales)</option>
                  <option value="volumen">Volumen (con decimales)</option>
                  <option value="longitud">Longitud (con decimales)</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label">Aplica IVA</label>
                <div class="checkbox-switch-large">
                  <input class="form-check-input" type="checkbox" v-model="form.aplica_iva" id="aplicaIVA" />
                  <label for="aplicaIVA">
                    <i :class="form.aplica_iva ? 'fas fa-check-circle' : 'fas fa-times-circle'"></i>
                    {{ form.aplica_iva ? 'Sí aplica IVA 15%' : 'No aplica IVA' }}
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- SECCIÓN: Adicional -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number section-number-amber">4</div>
            <div class="section-header-content">
              <h2 class="section-title">Información adicional</h2>
              <p class="section-desc">Foto, descripción y notas</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row cols-2">
              <div class="form-field">
                <label class="form-label">URL de la foto</label>
                <div class="input-with-icon">
                  <i class="fas fa-image input-icon"></i>
                  <input type="text" class="form-control" v-model="form.foto" placeholder="https://..." />
                </div>
              </div>
              <div class="form-field">
                <label class="form-label">Descripción</label>
                <input type="text" class="form-control" v-model="form.descripcion" placeholder="Descripción breve" />
              </div>
            </div>

            <!-- Preview de foto -->
            <transition name="fade">
              <div v-if="form.foto" class="photo-preview">
                <img :src="form.foto" alt="Preview" @error="fotoError = true" @load="fotoError = false" />
                <div v-if="fotoError" class="photo-error">
                  <i class="fas fa-exclamation-triangle"></i>
                  No se pudo cargar la imagen
                </div>
              </div>
            </transition>

            <div class="form-row">
              <div class="form-field">
                <label class="form-label">Observaciones</label>
                <textarea class="form-control" v-model="form.observaciones" rows="3" placeholder="Notas internas..."></textarea>
              </div>
            </div>
          </div>
        </section>

        <transition name="fade">
          <div v-if="errorGeneral" class="error-banner">
            <i class="fas fa-exclamation-circle"></i>
            <span>{{ errorGeneral }}</span>
          </div>
        </transition>

        <div class="form-actions-footer">
          <button type="submit" class="btn-save btn-save-amber" :disabled="cargando || !formularioValido">
            <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
            <span>{{ cargando ? 'Guardando...' : (id ? 'Guardar cambios' : 'Crear producto') }}</span>
          </button>
          <router-link to="/productos" class="btn-cancel">
            <i class="fas fa-times"></i>
            <span>Cancelar</span>
          </router-link>
        </div>
      </div>
    </form>

    <!-- MODAL NUEVA CATEGORÍA -->
    <div class="modal fade" id="modalCategoria" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header modal-header-cat">
            <h5 class="modal-title"><i class="fas fa-tag"></i> Nueva Categoría</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="guardarCategoria">
              <div class="form-field mb-3">
                <label class="form-label"><span class="required">*</span> Nombre</label>
                <input type="text" class="form-control" v-model="nuevaCategoria.nombre" required />
              </div>
              <div class="form-field">
                <label class="form-label">Descripción</label>
                <input type="text" class="form-control" v-model="nuevaCategoria.descripcion" />
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn-save-modal" @click="guardarCategoria" :disabled="cargandoCategoria">
              <i class="fas fa-save" :class="{ 'fa-spin': cargandoCategoria }"></i>
              {{ cargandoCategoria ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
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
const cargando = ref(false)
const errorGeneral = ref('')
const fotoError = ref(false)

const form = ref({
  codigo: '', nombre: '', categoriaId: '', descripcion: '',
  precio_compra: 0, precio_venta: 0, stock_minimo: 0,
  unidad_medida: 'unidad', codigo_barras: '', foto: '',
  observaciones: '', aplica_iva: true, tipo_medida: 'unidad'
})

const errores = ref({ nombre: '', precio_compra: '', precio_venta: '', stock_minimo: '' })

const margenGanancia = computed(() => {
  const pc = form.value.precio_compra || 0
  const pv = form.value.precio_venta || 0
  if (pc <= 0 || pv <= pc) return 0
  return ((pv - pc) / pc) * 100
})

const validarNombre = () => {
  const n = form.value.nombre?.trim() || ''
  if (!n) { errores.value.nombre = 'El nombre es obligatorio'; return false }
  if (n.length < 3) { errores.value.nombre = 'Mínimo 3 caracteres'; return false }
  errores.value.nombre = ''
  return true
}

const validarPrecioCompra = () => {
  const v = form.value.precio_compra
  if (v === undefined || v === null || isNaN(v) || v < 0) { errores.value.precio_compra = 'Debe ser positivo'; return false }
  errores.value.precio_compra = ''
  return true
}

const validarPrecioVenta = () => {
  const v = form.value.precio_venta
  if (v === undefined || v === null || isNaN(v) || v < 0) { errores.value.precio_venta = 'Debe ser positivo'; return false }
  errores.value.precio_venta = ''
  return true
}

const validarStockMinimo = () => {
  const v = form.value.stock_minimo
  if (v === undefined || v === null || isNaN(v) || v < 0) { errores.value.stock_minimo = 'Debe ser >= 0'; return false }
  errores.value.stock_minimo = ''
  return true
}

const formularioValido = computed(() => {
  return validarNombre() && validarPrecioCompra() && validarPrecioVenta() && validarStockMinimo()
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
    toast.warning('El nombre es obligatorio')
    return
  }
  cargandoCategoria.value = true
  try {
    const result = await insertOne('categorias', {
      nombre: nuevaCategoria.value.nombre.trim(),
      descripcion: nuevaCategoria.value.descripcion?.trim() || ''
    })
    categorias.value = await find('categorias')
    form.value.categoriaId = result._id
    modalInstance.hide()
    toast.success('Categoría creada')
  } catch (e) {
    toast.error('Error: ' + e.message)
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
    categorias.value = await find('categorias')
    if (id) {
      const prod = await findById('productos', id)
      if (prod) {
        form.value = prod
        validarNombre(); validarPrecioCompra(); validarPrecioVenta(); validarStockMinimo()
      }
    } else {
      form.value.codigo = generarCodigoProducto()
    }
  } catch (e) {
    toast.error('Error al cargar: ' + e.message)
  }
})

const guardar = async () => {
  if (!formularioValido.value) {
    errorGeneral.value = 'Corrija los errores marcados'
    toast.warning('Verifica los datos')
    return
  }
  errorGeneral.value = ''
  cargando.value = true

  try {
    if (id) {
      await updateOne('productos', id, form.value)
      toast.success('Producto actualizado')
    } else {
      await insertOne('productos', form.value)
      toast.success('Producto creado')
    }
    router.push('/productos')
  } catch (e) {
    errorGeneral.value = 'Error al guardar: ' + e.message
    toast.error('Error: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>

<style scoped>
/* Base: idéntico a ClienteForm pero con tonos ámbar */

.entity-form-wide { max-width: 1000px; }

.form-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
.header-left { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }
.btn-back {
  width: 44px; height: 44px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; transition: all var(--transition); flex-shrink: 0;
}
.btn-back:hover { border-color: #f39c12; color: #f39c12; transform: translateX(-3px); }

.form-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800; color: var(--text-primary);
  letter-spacing: -0.03em; display: flex; align-items: center;
  gap: 12px; margin: 0 0 4px;
}
.title-icon {
  width: 42px; height: 42px; border-radius: 12px;
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 1.15rem;
}
.title-icon-amber {
  background: linear-gradient(135deg, #f39c12, #d68910);
  box-shadow: 0 6px 16px rgba(243, 156, 18, 0.3);
}
.title-icon-edit {
  background: linear-gradient(135deg, #3498db, #2980b9);
  box-shadow: 0 6px 16px rgba(52, 152, 219, 0.3);
}
.form-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }

.header-status {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: var(--radius-full);
  background: var(--bg-table-stripe); color: var(--text-muted);
  font-size: 0.78rem; font-weight: 600;
}
.header-status i { font-size: 0.65rem; }
.header-status.complete { background: var(--success-bg); color: var(--success); }

.form-single { display: flex; flex-direction: column; gap: 20px; }

.form-section {
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--radius-lg); overflow: hidden;
}

.section-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 24px;
  background: linear-gradient(135deg, var(--bg-table-stripe), var(--bg-card));
  border-bottom: 1px solid var(--border-light);
}
.section-number {
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 0.9rem; flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(243, 156, 18, 0.25);
}
.section-number-amber { background: linear-gradient(135deg, #f39c12, #d68910); }
.section-header-content { flex: 1; }
.section-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 2px; }
.section-desc { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
.section-body { padding: 24px; }

.form-row { display: grid; gap: 16px; margin-bottom: 16px; }
.form-row:last-child { margin-bottom: 0; }
.form-row.cols-2 { grid-template-columns: 1fr 1fr; }
.form-row.cols-3 { grid-template-columns: repeat(3, 1fr); }
.form-row.cols-1-3 { grid-template-columns: 1fr 3fr; }

.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label .required { color: var(--danger); margin-right: 2px; }

.form-control, .form-select {
  width: 100%; padding: 12px 16px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-input);
  color: var(--text-primary); font-size: 0.9rem; font-family: inherit;
  transition: all var(--transition-fast); outline: none;
}
.form-control:focus, .form-select:focus {
  border-color: #f39c12; box-shadow: 0 0 0 4px rgba(243, 156, 18, 0.15);
  background: var(--bg-card);
}
.form-control.is-invalid { border-color: var(--danger); }

.input-with-icon { position: relative; }
.input-icon {
  position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
  color: var(--text-muted); font-size: 0.85rem; pointer-events: none;
}
.input-with-icon .form-control { padding-left: 42px; }

.price-input-lg { position: relative; }
.price-input-lg span {
  position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
  color: var(--text-muted); font-weight: 700; font-size: 1rem;
}
.price-input-lg .form-control { padding-left: 32px; font-weight: 700; }

.field-error, .field-success {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.75rem; font-weight: 500; margin-top: 2px;
}
.field-error { color: var(--danger); }
.field-success { color: var(--success); }

.btn-icon-outline {
  width: 46px; height: 46px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition-fast);
}
.btn-icon-outline:hover { border-color: #f39c12; color: #f39c12; background: rgba(243, 156, 18, 0.08); }

.margin-info {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; background: rgba(39, 174, 96, 0.08);
  border-left: 4px solid var(--success); border-radius: var(--radius-md);
  font-size: 0.85rem; color: var(--text-secondary);
}
.margin-info i { color: var(--success); font-size: 1rem; }
.margin-info strong { color: var(--success); font-weight: 800; font-size: 0.95rem; }

.checkbox-switch-large {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; background: var(--bg-table-stripe);
  border-radius: var(--radius-md); cursor: pointer;
  border: 1.5px solid var(--border-color); transition: all var(--transition-fast);
  height: 46px;
}
.checkbox-switch-large:hover { border-color: #f39c12; }
.checkbox-switch-large input { width: 18px; height: 18px; cursor: pointer; }
.checkbox-switch-large label {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.85rem; font-weight: 600; cursor: pointer;
  color: var(--text-primary); margin: 0;
}
.checkbox-switch-large label i { color: var(--success); }

.photo-preview {
  max-width: 200px; margin-top: 12px;
  border-radius: var(--radius-md); overflow: hidden;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}
.photo-preview img { width: 100%; height: auto; display: block; }
.photo-error {
  padding: 20px; text-align: center; color: var(--danger);
  font-size: 0.8rem;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.photo-error i { font-size: 1.4rem; }

.error-banner {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; background: var(--danger-bg);
  border: 1px solid rgba(231, 76, 60, 0.3); border-left: 4px solid var(--danger);
  border-radius: var(--radius-md); color: var(--danger);
  font-weight: 500; font-size: 0.88rem;
}

.form-actions-footer {
  display: flex; gap: 12px; justify-content: flex-end;
  padding: 20px; background: var(--bg-card);
  border: 1px solid var(--border-color); border-radius: var(--radius-lg);
}

.btn-save {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 12px 28px; background: linear-gradient(135deg, var(--success), #1e8449);
  color: #fff; border: none; border-radius: var(--radius-md);
  font-weight: 700; font-size: 0.92rem; cursor: pointer;
  transition: all var(--transition);
  box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3); font-family: inherit;
}
.btn-save-amber { background: linear-gradient(135deg, #f39c12, #d68910); box-shadow: 0 4px 12px rgba(243, 156, 18, 0.3); }
.btn-save-amber:hover:not(:disabled) { box-shadow: 0 8px 20px rgba(243, 156, 18, 0.4); }
.btn-save:hover:not(:disabled) { transform: translateY(-2px); }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.btn-cancel {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 24px; background: var(--bg-card);
  border: 1.5px solid var(--border-color); color: var(--text-secondary);
  border-radius: var(--radius-md); font-weight: 600; font-size: 0.88rem;
  text-decoration: none; transition: all var(--transition);
}
.btn-cancel:hover { border-color: var(--danger); color: var(--danger); background: var(--danger-bg); }

.modal-header-cat {
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff;
}
.modal-header-cat .modal-title { color: #fff; display: flex; align-items: center; gap: 8px; }
.btn-save-modal {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 18px; background: #f39c12; color: #fff;
  border: none; border-radius: var(--radius-md); font-weight: 600;
  font-size: 0.85rem; cursor: pointer; transition: all var(--transition-fast);
  font-family: inherit;
}
.btn-save-modal:hover:not(:disabled) { background: #d68910; }
.btn-save-modal:disabled { opacity: 0.6; cursor: not-allowed; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .form-row.cols-2, .form-row.cols-3, .form-row.cols-1-3 { grid-template-columns: 1fr; }
}

@media (max-width: 576px) {
  .form-title { font-size: 1.2rem; }
  .form-subtitle { padding-left: 0; }
  .section-header { padding: 16px 18px; }
  .section-body { padding: 18px; }
  .form-actions-footer { flex-direction: column-reverse; }
  .btn-save, .btn-cancel { width: 100%; justify-content: center; }
}
</style>