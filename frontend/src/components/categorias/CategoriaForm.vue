<template>
  <div class="entity-form entity-form-narrow">
    <div class="form-header">
      <div class="header-left">
        <button type="button" class="btn-back" @click="$router.push('/categorias')">
          <i class="fas fa-arrow-left"></i>
        </button>
        <div>
          <h1 class="form-title">
            <span class="title-icon title-icon-purple">
              <i class="fas fa-tag"></i>
            </span>
            {{ id ? 'Editar Categoría' : 'Nueva Categoría' }}
          </h1>
          <p class="form-subtitle">
            {{ id ? 'Modifica los datos de la categoría' : 'Agrupa productos por categoría' }}
          </p>
        </div>
      </div>
    </div>

    <form @submit.prevent="guardar" novalidate>
      <div class="form-single">
        <section class="form-section">
          <header class="section-header">
            <div class="section-number section-number-purple">
              <i class="fas fa-tag"></i>
            </div>
            <div class="section-header-content">
              <h2 class="section-title">Datos de la categoría</h2>
              <p class="section-desc">Nombre y descripción</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row">
              <div class="form-field">
                <label class="form-label"><span class="required">*</span> Nombre</label>
                <input
                  type="text"
                  class="form-control form-control-lg"
                  :class="{ 'is-invalid': errores.nombre }"
                  v-model="form.nombre"
                  @input="validarNombre"
                  placeholder="Ej: Bebidas, Alimentos, Aceites..."
                  autofocus
                />
                <div v-if="errores.nombre" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.nombre }}
                </div>
              </div>
            </div>
            <div class="form-row">
              <div class="form-field">
                <label class="form-label">Descripción</label>
                <textarea
                  class="form-control"
                  v-model="form.descripcion"
                  rows="3"
                  placeholder="Descripción opcional de la categoría..."
                ></textarea>
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
          <button type="submit" class="btn-save btn-save-purple" :disabled="cargando || !form.nombre.trim()">
            <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
            <span>{{ cargando ? 'Guardando...' : (id ? 'Guardar cambios' : 'Crear categoría') }}</span>
          </button>
          <router-link to="/categorias" class="btn-cancel">
            <i class="fas fa-times"></i>
            <span>Cancelar</span>
          </router-link>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { findById, insertOne, updateOne } = useMongoDB()

const id = route.params.id
const cargando = ref(false)
const errorGeneral = ref('')
const errores = ref({ nombre: '' })

const form = ref({ nombre: '', descripcion: '' })

const validarNombre = () => {
  const n = form.value.nombre?.trim() || ''
  if (!n) { errores.value.nombre = 'El nombre es obligatorio'; return false }
  if (n.length < 2) { errores.value.nombre = 'Mínimo 2 caracteres'; return false }
  errores.value.nombre = ''
  return true
}

onMounted(async () => {
  if (id) {
    try {
      const data = await findById('categorias', id)
      if (data) form.value = data
      else errorGeneral.value = 'No se encontró la categoría'
    } catch (e) {
      errorGeneral.value = 'Error al cargar: ' + e.message
    }
  }
})

const guardar = async () => {
  if (!validarNombre()) return
  errorGeneral.value = ''
  cargando.value = true

  try {
    const datos = {
      nombre: form.value.nombre.trim(),
      descripcion: form.value.descripcion?.trim() || ''
    }
    if (id) {
      await updateOne('categorias', id, datos)
      toast.success('Categoría actualizada')
    } else {
      await insertOne('categorias', datos)
      toast.success('Categoría creada')
    }
    router.push('/categorias')
  } catch (e) {
    errorGeneral.value = 'Error al guardar: ' + e.message
    toast.error('Error: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>

<style scoped>
.entity-form-narrow { max-width: 700px; margin: 0 auto; padding: 0 0 40px; }

.form-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
.header-left { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }
.btn-back {
  width: 44px; height: 44px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; transition: all var(--transition); flex-shrink: 0;
}
.btn-back:hover { border-color: #8e44ad; color: #8e44ad; transform: translateX(-3px); }

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
.title-icon-purple {
  background: linear-gradient(135deg, #8e44ad, #6c3483);
  box-shadow: 0 6px 16px rgba(142, 68, 173, 0.3);
}
.form-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }

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
  background: linear-gradient(135deg, #8e44ad, #6c3483);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 0.95rem; flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(142, 68, 173, 0.25);
}
.section-number-purple { background: linear-gradient(135deg, #8e44ad, #6c3483); }
.section-header-content { flex: 1; }
.section-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 2px; }
.section-desc { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
.section-body { padding: 24px; }

.form-row { margin-bottom: 16px; }
.form-row:last-child { margin-bottom: 0; }
.form-field { display: flex; flex-direction: column; gap: 6px; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label .required { color: var(--danger); margin-right: 2px; }

.form-control, .form-select {
  width: 100%; padding: 12px 16px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-input);
  color: var(--text-primary); font-size: 0.9rem; font-family: inherit;
  transition: all var(--transition-fast); outline: none;
}
.form-control-lg { padding: 14px 18px; font-size: 1rem; font-weight: 600; }
.form-control:focus {
  border-color: #8e44ad;
  box-shadow: 0 0 0 4px rgba(142, 68, 173, 0.15);
  background: var(--bg-card);
}
.form-control.is-invalid { border-color: var(--danger); }

.field-error {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.75rem; font-weight: 500;
  color: var(--danger); margin-top: 2px;
}

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
.btn-save-purple { background: linear-gradient(135deg, #8e44ad, #6c3483); box-shadow: 0 4px 12px rgba(142, 68, 173, 0.3); }
.btn-save-purple:hover:not(:disabled) { box-shadow: 0 8px 20px rgba(142, 68, 173, 0.4); }
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

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 576px) {
  .form-title { font-size: 1.2rem; }
  .form-subtitle { padding-left: 0; }
  .section-header { padding: 16px 18px; }
  .section-body { padding: 18px; }
  .form-actions-footer { flex-direction: column-reverse; }
  .btn-save, .btn-cancel { width: 100%; justify-content: center; }
}
</style>