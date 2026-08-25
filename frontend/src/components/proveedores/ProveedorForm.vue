<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-truck"></i> {{ id ? 'Editar' : 'Nuevo' }} Proveedor
    </h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar" novalidate>
          <!-- ... (igual que antes) ... -->
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'

const route = useRoute()
const router = useRouter()
const { findById, insertOne, updateOne } = useMongoDB()
const id = route.params.id
const buscando = ref(false)

const form = ref({
  ruc: '',
  nombre: '',
  telefono: '',
  email: '',
  direccion: ''
})

const errores = ref({
  ruc: '',
  nombre: '',
  telefono: '',
  email: ''
})

const validarRuc = () => {
  const ruc = form.value.ruc?.trim() || ''
  if (!ruc) { errores.value.ruc = 'El RUC/Cédula es obligatorio'; return false }
  if (ruc.length !== 10 || !/^\d+$/.test(ruc)) {
    errores.value.ruc = 'Debe tener 10 dígitos numéricos'
    return false
  }
  errores.value.ruc = ''
  return true
}

const validarNombre = () => {
  const nombre = form.value.nombre?.trim() || ''
  if (!nombre) { errores.value.nombre = 'El nombre es obligatorio'; return false }
  if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ\s.]+$/.test(nombre)) {
    errores.value.nombre = 'Solo letras, espacios y puntos'
    return false
  }
  errores.value.nombre = ''
  return true
}

const validarTelefono = () => {
  const telefono = form.value.telefono?.trim() || ''
  if (!telefono) { errores.value.telefono = 'El teléfono es obligatorio'; return false }
  if (!/^09\d{8}$/.test(telefono)) {
    errores.value.telefono = 'Debe comenzar con 09 y tener 10 dígitos'
    return false
  }
  errores.value.telefono = ''
  return true
}

const validarEmail = () => {
  const email = form.value.email?.trim() || ''
  if (!email) { errores.value.email = 'El email es obligatorio'; return false }
  if (!/^[^\s@]+@[^\s@]+\.(com|es|ec|org|net|edu|info)$/i.test(email)) {
    errores.value.email = 'Email inválido. Debe terminar en .com, .es, .ec, etc.'
    return false
  }
  errores.value.email = ''
  return true
}

const formularioValido = computed(() => {
  return validarRuc() && validarNombre() && validarTelefono() && validarEmail()
})

// ===== CARGAR DATOS SI ES EDICIÓN (CORREGIDO) =====
onMounted(async () => {
  if (id) {
    try {
      const data = await findById('proveedores', id)
      if (data) {
        form.value.ruc = data.ruc || ''
        form.value.nombre = data.nombre || ''
        form.value.telefono = data.telefono || ''
        form.value.email = data.email || ''
        form.value.direccion = data.direccion || ''
      }
    } catch (e) {
      console.error('Error al cargar datos:', e)
      alert('Error al cargar los datos del proveedor')
    }
  }
})

const buscarPorIdentificacion = async () => {
  if (!validarRuc()) return
  buscando.value = true
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/consultas/cedula/${form.value.ruc.trim()}`)
    if (!response.ok) throw new Error('No se encontraron datos')
    const data = await response.json()
    if (data.nombre) form.value.nombre = data.nombre
  } catch (error) {
    alert('Error al consultar: ' + error.message)
  } finally {
    buscando.value = false
  }
}

const guardar = async () => {
  if (!formularioValido.value) {
    validarRuc()
    validarNombre()
    validarTelefono()
    validarEmail()
    alert('Corrija los errores antes de guardar')
    return
  }

  try {
    const datosGuardar = {
      ruc: form.value.ruc.trim(),
      nombre: form.value.nombre.trim(),
      telefono: form.value.telefono.trim(),
      email: form.value.email.trim().toLowerCase(),
      direccion: form.value.direccion?.trim() || ''
    }

    if (id) {
      await updateOne('proveedores', id, datosGuardar)
    } else {
      await insertOne('proveedores', datosGuardar)
    }
    router.push('/proveedores')
  } catch (e) {
    console.error('Error al guardar:', e)
    alert('Error al guardar: ' + e.message)
  }
}
</script>