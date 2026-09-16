<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-user-cog" aria-hidden="true"></i>
      {{ esEdicion ? 'Editar' : 'Nuevo' }} Usuario
    </h4>

    <!-- Loading (solo en modo edición) -->
    <div v-if="cargandoInicial" class="card card-cacao">
      <div class="card-body text-center py-5">
        <i class="fas fa-spinner fa-spin fa-2x text-muted"></i>
        <p class="mt-3 text-muted mb-0">Cargando datos del usuario…</p>
      </div>
    </div>

    <!-- Formulario -->
    <div v-else class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar" novalidate>
          <div class="alert alert-info">
            <i class="fas fa-info-circle" aria-hidden="true"></i>
            {{
              esEdicion
                ? 'Modifica los datos del usuario. Deja la contraseña vacía si no deseas cambiarla.'
                : 'Completa los datos para crear un nuevo usuario.'
            }}
          </div>

          <div class="row g-3">
            <!-- NOMBRE -->
            <div class="col-md-6">
              <label class="form-label" for="u-nombre">
                <span class="text-danger">*</span> Nombre completo
              </label>
              <input
                id="u-nombre"
                type="text"
                class="form-control"
                :class="{ 'is-invalid': mostrarError('nombre') }"
                v-model="form.nombre"
                placeholder="Ej: Juan Pérez"
                maxlength="100"
                autocomplete="name"
                @blur="touched.nombre = true"
              />
              <div v-if="mostrarError('nombre')" class="invalid-feedback">
                {{ errores.nombre }}
              </div>
            </div>

            <!-- EMAIL -->
            <div class="col-md-6">
              <label class="form-label" for="u-email">
                <span class="text-danger">*</span> Email
              </label>
              <input
                id="u-email"
                type="email"
                class="form-control"
                :class="{ 'is-invalid': mostrarError('email') }"
                v-model="form.email"
                placeholder="correo@ejemplo.com"
                maxlength="200"
                autocomplete="email"
                @input="onEmailInput"
                @blur="touched.email = true"
              />
              <div v-if="mostrarError('email')" class="invalid-feedback">
                {{ errores.email }}
              </div>
            </div>

            <!-- TELÉFONO -->
            <div class="col-md-6">
              <label class="form-label" for="u-telefono">Teléfono</label>
              <input
                id="u-telefono"
                type="text"
                class="form-control"
                v-model="form.telefono"
                placeholder="09XXXXXXXX"
                maxlength="50"
                autocomplete="tel"
              />
            </div>

            <!-- ROL -->
            <div class="col-md-6">
              <label class="form-label" for="u-rol">
                <span class="text-danger">*</span> Rol
              </label>
              <select
                id="u-rol"
                class="form-select"
                :class="{ 'is-invalid': mostrarError('rol') }"
                v-model="form.rol"
                @blur="touched.rol = true"
              >
                <option value="">Seleccione un rol…</option>
                <option value="admin">Administrador — Acceso total</option>
                <option value="contador">Contador — Ventas, compras, retenciones, reportes</option>
                <option value="vendedor">Vendedor — Ventas y clientes</option>
                <option value="bodeguero">Bodeguero — Inventario y compras</option>
                <option value="auditor">Auditor — Solo lectura</option>
              </select>
              <div v-if="mostrarError('rol')" class="invalid-feedback">
                {{ errores.rol }}
              </div>
            </div>

            <!-- PASSWORD -->
            <div class="col-md-6">
              <label class="form-label" for="u-password">
                <span v-if="!esEdicion" class="text-danger">*</span>
                Contraseña
                <small v-if="esEdicion" class="text-muted">(dejar vacío para no cambiar)</small>
              </label>
              <div class="input-wrapper">
                <input
                  id="u-password"
                  :type="mostrarPassword ? 'text' : 'password'"
                  class="form-control"
                  :class="{ 'is-invalid': mostrarError('password') }"
                  v-model="form.password"
                  :placeholder="esEdicion ? '••••••••' : 'Mínimo 6 caracteres'"
                  maxlength="200"
                  autocomplete="new-password"
                  @blur="touched.password = true"
                />
                <button
                  type="button"
                  class="toggle-pass"
                  @click="mostrarPassword = !mostrarPassword"
                  :aria-label="mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                  tabindex="-1"
                >
                  <i :class="mostrarPassword ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                </button>
              </div>
              <div v-if="mostrarError('password')" class="invalid-feedback d-block">
                {{ errores.password }}
              </div>
            </div>

            <!-- ACTIVO -->
            <div class="col-md-6">
              <label class="form-label">Estado</label>
              <div class="form-check form-switch mt-2">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="u-activo"
                  v-model="form.activo"
                  :disabled="bloquearToggleActivo"
                />
                <label class="form-check-label" for="u-activo">
                  {{ form.activo ? 'Usuario activo' : 'Usuario inactivo' }}
                </label>
              </div>
              <small v-if="bloquearToggleActivo" class="text-muted d-block mt-1">
                <i class="fas fa-lock me-1"></i>
                No puedes desactivar tu propia cuenta desde aquí.
              </small>
            </div>
          </div>

          <!-- ERROR GENERAL -->
          <div v-if="errorGeneral" class="alert alert-danger mt-3" role="alert">
            <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
            {{ errorGeneral }}
          </div>

          <!-- BOTONES -->
          <div class="mt-4 d-flex gap-2 flex-wrap">
            <button type="submit" class="btn btn-success" :disabled="cargando">
              <i class="fas fa-save" :class="{ 'fa-spin': cargando }" aria-hidden="true"></i>
              {{ cargando ? 'Guardando…' : 'Guardar' }}
            </button>
            <button type="button" class="btn btn-secondary" @click="cancelar">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- INFO DEL ROL SELECCIONADO -->
    <div v-if="form.rol" class="card card-cacao mt-3">
      <div class="card-header">
        <i class="fas fa-info-circle me-2" aria-hidden="true"></i>
        Permisos del rol "{{ getRolLabel(form.rol) }}"
      </div>
      <div class="card-body">
        <div
          v-for="grupo in gruposPermisos"
          :key="grupo.titulo"
          class="permiso-grupo"
        >
          <div class="permiso-grupo-titulo">
            <i :class="grupo.icono" aria-hidden="true"></i>
            {{ grupo.titulo }}
          </div>
          <div class="row g-2">
            <div
              v-for="mod in grupo.modulos"
              :key="mod.clave"
              class="col-md-6 col-lg-4"
            >
              <div class="permiso-item">
                <div class="permiso-modulo">
                  <i :class="mod.icono" aria-hidden="true"></i>
                  {{ mod.label }}
                </div>
                <div class="permiso-badges">
                  <span
                    v-for="accion in accionesAMostrar(mod)"
                    :key="accion.clave"
                    class="permiso-badge"
                    :class="{ 'permiso-active': tieneAccion(mod.clave, accion.clave) }"
                    :title="accion.label"
                  >
                    {{ accion.label }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  reactive,
  onMounted,
  onBeforeUnmount
} from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const route = useRoute()
const router = useRouter()
const toast = useToast()

// ===== CONSTANTES =====
const PASSWORD_MIN = 6

/**
 * Módulos y acciones por rol — copiado EXACTAMENTE de backend/utils/permisos.js.
 * Si el backend cambia, hay que actualizar acá también.
 */
const PERMISOS_ROL = Object.freeze({
  admin: {
    ventas: ['ver', 'crear', 'editar', 'eliminar', 'anular'],
    compras: ['ver', 'crear', 'editar', 'eliminar', 'anular'],
    clientes: ['ver', 'crear', 'editar', 'eliminar'],
    proveedores: ['ver', 'crear', 'editar', 'eliminar'],
    productos: ['ver', 'crear', 'editar', 'eliminar'],
    categorias: ['ver', 'crear', 'editar', 'eliminar'],
    retenciones: ['ver', 'crear', 'editar', 'eliminar'],
    pagos: ['ver', 'crear', 'eliminar'],
    inventario: ['ver', 'editar', 'ajustar'],
    kardex: ['ver'],
    reportes: ['ver', 'exportar'],
    auditoria: ['ver'],
    usuarios: ['ver', 'crear', 'editar', 'eliminar'],
    backups: ['ver', 'crear', 'restaurar', 'eliminar'],
    configuracion: ['ver', 'editar'],
    certificados: ['ver', 'crear', 'eliminar'],
    sri: ['ver', 'enviar', 'consultar'],
    periodos: ['ver', 'cerrar', 'reabrir'],
    anexos: ['ver', 'generar'],
    email: ['enviar', 'ver']
  },
  contador: {
    ventas: ['ver', 'crear', 'editar', 'anular'],
    compras: ['ver', 'crear', 'editar', 'anular'],
    clientes: ['ver', 'crear', 'editar'],
    proveedores: ['ver', 'crear', 'editar'],
    productos: ['ver'],
    categorias: ['ver'],
    retenciones: ['ver', 'crear', 'editar', 'eliminar'],
    pagos: ['ver', 'crear', 'eliminar'],
    inventario: ['ver'],
    kardex: ['ver'],
    reportes: ['ver', 'exportar'],
    auditoria: ['ver'],
    usuarios: [],
    backups: ['ver'],
    configuracion: ['ver'],
    certificados: ['ver'],
    sri: ['ver', 'enviar', 'consultar'],
    periodos: ['ver', 'cerrar'],
    anexos: ['ver', 'generar'],
    email: ['enviar', 'ver']
  },
  vendedor: {
    ventas: ['ver', 'crear'],
    compras: ['ver'],
    clientes: ['ver', 'crear', 'editar'],
    proveedores: ['ver'],
    productos: ['ver'],
    categorias: ['ver'],
    retenciones: [],
    pagos: ['ver', 'crear'],
    inventario: ['ver'],
    kardex: [],
    reportes: [],
    auditoria: [],
    usuarios: [],
    backups: [],
    configuracion: [],
    certificados: [],
    sri: ['ver'],
    periodos: [],
    anexos: [],
    email: ['enviar']
  },
  bodeguero: {
    ventas: ['ver'],
    compras: ['ver', 'crear', 'editar'],
    clientes: [],
    proveedores: ['ver', 'crear', 'editar'],
    productos: ['ver', 'crear', 'editar'],
    categorias: ['ver', 'crear', 'editar'],
    retenciones: [],
    pagos: [],
    inventario: ['ver', 'editar', 'ajustar'],
    kardex: ['ver'],
    reportes: ['ver'],
    auditoria: [],
    usuarios: [],
    backups: [],
    configuracion: [],
    certificados: [],
    sri: [],
    periodos: [],
    anexos: [],
    email: []
  },
  auditor: {
    ventas: ['ver'],
    compras: ['ver'],
    clientes: ['ver'],
    proveedores: ['ver'],
    productos: ['ver'],
    categorias: ['ver'],
    retenciones: ['ver'],
    pagos: ['ver'],
    inventario: ['ver'],
    kardex: ['ver'],
    reportes: ['ver', 'exportar'],
    auditoria: ['ver'],
    usuarios: [],
    backups: ['ver'],
    configuracion: ['ver'],
    certificados: ['ver'],
    sri: ['ver'],
    periodos: ['ver'],
    anexos: ['ver'],
    email: []
  }
})

const MODULOS_META = Object.freeze({
  ventas:        { label: 'Ventas',        icono: 'fas fa-hand-holding-usd' },
  compras:       { label: 'Compras',       icono: 'fas fa-shopping-cart' },
  clientes:      { label: 'Clientes',      icono: 'fas fa-users' },
  proveedores:   { label: 'Proveedores',   icono: 'fas fa-truck' },
  productos:     { label: 'Productos',     icono: 'fas fa-boxes' },
  categorias:    { label: 'Categorías',    icono: 'fas fa-tags' },
  retenciones:   { label: 'Retenciones',   icono: 'fas fa-percent' },
  pagos:         { label: 'Pagos',         icono: 'fas fa-money-bill-wave' },
  inventario:    { label: 'Inventario',    icono: 'fas fa-warehouse' },
  kardex:        { label: 'Kardex',        icono: 'fas fa-clipboard-list' },
  reportes:      { label: 'Reportes',      icono: 'fas fa-chart-bar' },
  auditoria:     { label: 'Auditoría',     icono: 'fas fa-history' },
  usuarios:      { label: 'Usuarios',      icono: 'fas fa-user-cog' },
  backups:       { label: 'Backups',       icono: 'fas fa-database' },
  configuracion: { label: 'Configuración', icono: 'fas fa-cog' },
  certificados:  { label: 'Certificado',   icono: 'fas fa-shield-alt' },
  sri:           { label: 'SRI',           icono: 'fas fa-cloud-upload-alt' },
  periodos:      { label: 'Períodos',      icono: 'fas fa-calendar-check' },
  anexos:        { label: 'Anexos',        icono: 'fas fa-file-invoice' },
  email:         { label: 'Email',         icono: 'fas fa-envelope' }
})

const ACCIONES_META = Object.freeze({
  ver:       { label: 'Ver',       icono: 'fas fa-eye' },
  crear:     { label: 'Crear',     icono: 'fas fa-plus' },
  editar:    { label: 'Editar',    icono: 'fas fa-edit' },
  eliminar:  { label: 'Eliminar',  icono: 'fas fa-trash' },
  anular:    { label: 'Anular',    icono: 'fas fa-ban' },
  ajustar:   { label: 'Ajustar',   icono: 'fas fa-sliders-h' },
  exportar:  { label: 'Exportar',  icono: 'fas fa-download' },
  enviar:    { label: 'Enviar',    icono: 'fas fa-paper-plane' },
  consultar: { label: 'Consultar', icono: 'fas fa-search' },
  generar:   { label: 'Generar',   icono: 'fas fa-magic' },
  cerrar:    { label: 'Cerrar',    icono: 'fas fa-lock' },
  reabrir:   { label: 'Reabrir',   icono: 'fas fa-lock-open' },
  restaurar: { label: 'Restaurar', icono: 'fas fa-undo' }
})

/**
 * Órden de grupos para mostrar los permisos de forma legible.
 */
const GRUPOS = Object.freeze([
  {
    titulo: 'Ventas y clientes',
    icono: 'fas fa-hand-holding-usd',
    modulos: ['ventas', 'clientes', 'pagos', 'retenciones', 'email']
  },
  {
    titulo: 'Compras e inventario',
    icono: 'fas fa-boxes',
    modulos: ['compras', 'proveedores', 'productos', 'categorias', 'inventario', 'kardex']
  },
  {
    titulo: 'Facturación electrónica',
    icono: 'fas fa-cloud-upload-alt',
    modulos: ['sri', 'certificados', 'anexos']
  },
  {
    titulo: 'Reportes y control',
    icono: 'fas fa-chart-bar',
    modulos: ['reportes', 'auditoria', 'periodos']
  },
  {
    titulo: 'Administración',
    icono: 'fas fa-user-shield',
    modulos: ['usuarios', 'configuracion', 'backups']
  }
])

// ===== STATE =====
const cargandoInicial = ref(false)
const cargando = ref(false)
const errorGeneral = ref('')
const mostrarPassword = ref(false)

const form = ref({
  nombre: '',
  email: '',
  telefono: '',
  rol: '',
  password: '',
  activo: true
})

// Snapshot inicial para detectar cambios sin guardar
let snapshotInicial = null

const errores = ref({ nombre: '', email: '', rol: '', password: '' })
const touched = reactive({ nombre: false, email: false, rol: false, password: false })

// ===== ROUTE =====
// Computed → reacciona a cambios de ruta (mismo componente, otra id)
const userId = computed(() => {
  const raw = route.params?.id
  return raw ? String(raw) : null
})
const esEdicion = computed(() => Boolean(userId.value))

// ===== GUARDS =====
let unmounted = false

// ===== COMPUTED =====
const currentUserId = computed(() => {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null')
    return u?.id ? String(u.id) : null
  } catch {
    return null
  }
})

const bloquearToggleActivo = computed(() => {
  if (!esEdicion.value) return false
  return currentUserId.value && userId.value === currentUserId.value
})

/**
 * Grupos de permisos con módulos resueltos y acciones a mostrar
 * (unión de todas las acciones usadas en algún rol, o las propias del módulo).
 */
const gruposPermisos = computed(() => {
  // Pre-calcular acciones por módulo (todas las que existen en cualquier rol)
  const accionesPorModulo = {}
  for (const rol in PERMISOS_ROL) {
    for (const mod in PERMISOS_ROL[rol]) {
      if (!accionesPorModulo[mod]) accionesPorModulo[mod] = new Set()
      for (const acc of PERMISOS_ROL[rol][mod]) {
        accionesPorModulo[mod].add(acc)
      }
    }
  }

  return GRUPOS.map(g => ({
    titulo: g.titulo,
    icono: g.icono,
    modulos: g.modulos.map(clave => ({
      clave,
      label: MODULOS_META[clave]?.label || clave,
      icono: MODULOS_META[clave]?.icono || 'fas fa-circle',
      acciones: [...(accionesPorModulo[clave] || [])]
    }))
  }))
})

// ===== HELPERS =====
const mostrarError = (campo) => Boolean(touched[campo] && errores.value[campo])

const getRolLabel = (rol) => ({
  admin: 'Administrador',
  contador: 'Contador',
  vendedor: 'Vendedor',
  bodeguero: 'Bodeguero',
  auditor: 'Auditor'
}[rol] || rol)

const getPermisosRol = (rol) => PERMISOS_ROL[rol] || {}

const tieneAccion = (modulo, accion) => {
  const permisos = getPermisosRol(form.value.rol)
  return Array.isArray(permisos[modulo]) && permisos[modulo].includes(accion)
}

const accionesAMostrar = (mod) =>
  mod.acciones.map(acc => ({
    clave: acc,
    label: ACCIONES_META[acc]?.label || acc
  }))

const onEmailInput = () => {
  form.value.email = String(form.value.email || '').toLowerCase().trim()
}

// ===== VALIDACIÓN =====
const validarNombre = () => {
  const v = String(form.value.nombre || '').trim()
  if (!v) {
    errores.value.nombre = 'El nombre es obligatorio'
    return false
  }
  if (v.length < 3) {
    errores.value.nombre = 'Mínimo 3 caracteres'
    return false
  }
  if (v.length > 100) {
    errores.value.nombre = 'Máximo 100 caracteres'
    return false
  }
  errores.value.nombre = ''
  return true
}

const validarEmail = () => {
  const v = String(form.value.email || '').trim()
  if (!v) {
    errores.value.email = 'El email es obligatorio'
    return false
  }
  if (v.length > 200) {
    errores.value.email = 'Email demasiado largo'
    return false
  }
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v)) {
    errores.value.email = 'Email inválido'
    return false
  }
  errores.value.email = ''
  return true
}

const validarRol = () => {
  const v = String(form.value.rol || '').trim()
  if (!v) {
    errores.value.rol = 'Debe seleccionar un rol'
    return false
  }
  if (!PERMISOS_ROL[v]) {
    errores.value.rol = 'Rol desconocido'
    return false
  }
  errores.value.rol = ''
  return true
}

const validarPassword = () => {
  const p = String(form.value.password || '')
  // En edición el password vacío es válido
  if (!esEdicion.value && !p) {
    errores.value.password = 'La contraseña es obligatoria'
    return false
  }
  if (p && p.length < PASSWORD_MIN) {
    errores.value.password = `Mínimo ${PASSWORD_MIN} caracteres`
    return false
  }
  if (p && p.length > 200) {
    errores.value.password = 'Contraseña demasiado larga'
    return false
  }
  errores.value.password = ''
  return true
}

const validar = () => {
  const okNombre = validarNombre()
  const okEmail = validarEmail()
  const okRol = validarRol()
  const okPass = validarPassword()
  return okNombre && okEmail && okRol && okPass
}

// ===== DETECTAR CAMBIOS =====
const hayCambios = computed(() => {
  if (!snapshotInicial) return false
  return JSON.stringify(form.value) !== JSON.stringify(snapshotInicial)
})

// ===== CARGA (edición) =====
const cargarUsuario = async (id) => {
  cargandoInicial.value = true
  try {
    const data = await api.request(`/usuarios/${id}`, { method: 'GET' })
    if (unmounted) return

    form.value = {
      nombre: data?.nombre || '',
      email: (data?.email || '').toLowerCase(),
      telefono: data?.telefono || '',
      rol: data?.rol || '',
      password: '',
      activo: data?.activo !== undefined ? Boolean(data.activo) : true
    }
    snapshotInicial = JSON.parse(JSON.stringify(form.value))
  } catch (e) {
    if (unmounted) return
    errorGeneral.value = 'Error al cargar el usuario: ' + (e?.message || 'desconocido')
    toast.error('Error al cargar el usuario')
  } finally {
    if (!unmounted) cargandoInicial.value = false
  }
}

onMounted(async () => {
  if (esEdicion.value) {
    await cargarUsuario(userId.value)
  } else {
    snapshotInicial = JSON.parse(JSON.stringify(form.value))
  }
})

// ===== GUARDAR =====
const guardar = async () => {
  // Marca todos los campos como tocados para mostrar errores
  for (const k of Object.keys(touched)) touched[k] = true

  if (!validar()) {
    errorGeneral.value = 'Corrige los errores marcados en rojo'
    toast.warning('Corrige los errores antes de guardar')
    return
  }

  errorGeneral.value = ''
  cargando.value = true

  try {
    const payload = {
      nombre: String(form.value.nombre || '').trim(),
      email: String(form.value.email || '').trim().toLowerCase(),
      telefono: String(form.value.telefono || '').trim(),
      rol: form.value.rol,
      activo: Boolean(form.value.activo)
    }
    if (form.value.password) {
      payload.password = form.value.password
    }

    if (esEdicion.value) {
      await api.request(`/usuarios/${userId.value}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
        loaderMessage: 'Actualizando usuario…'
      })
      if (!unmounted) toast.success('Usuario actualizado')
    } else {
      await api.request('/usuarios', {
        method: 'POST',
        body: JSON.stringify(payload),
        loaderMessage: 'Creando usuario…'
      })
      if (!unmounted) toast.success('Usuario creado')
    }

    // Actualizar snapshot para evitar el guard de salida
    snapshotInicial = JSON.parse(JSON.stringify(form.value))

    if (!unmounted) router.push('/usuarios')
  } catch (e) {
    if (!unmounted) {
      errorGeneral.value = 'Error al guardar: ' + (e?.message || 'desconocido')
      toast.error('Error al guardar: ' + (e?.message || 'desconocido'))
    }
  } finally {
    if (!unmounted) cargando.value = false
  }
}

// ===== CANCELAR =====
const cancelar = async () => {
  if (hayCambios.value) {
    const ok = window.confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')
    if (!ok) return
    snapshotInicial = JSON.parse(JSON.stringify(form.value))
  }
  router.push('/usuarios')
}

// ===== GUARDS DE NAVEGACIÓN =====
const beforeUnloadHandler = (e) => {
  if (hayCambios.value && !cargando.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onBeforeRouteLeave(() => {
  if (!hayCambios.value || cargando.value) return true
  return window.confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')
})

// ===== LIFECYCLE =====
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnloadHandler)
})

onBeforeUnmount(() => {
  unmounted = true
  window.removeEventListener('beforeunload', beforeUnloadHandler)
  // Limpiar campos sensibles
  form.value.password = ''
})
</script>

<style scoped>
/* ===== Password con toggle ===== */
.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}
.input-wrapper .form-control {
  padding-right: 42px;
}
.toggle-pass {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-sm, 6px);
  transition: color var(--transition-fast);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.toggle-pass:hover {
  color: var(--primary-color);
  background: var(--bg-table-stripe);
}

/* ===== Permisos por grupos ===== */
.permiso-grupo {
  margin-bottom: 20px;
}
.permiso-grupo:last-child {
  margin-bottom: 0;
}
.permiso-grupo-titulo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--border-color);
}
.permiso-grupo-titulo i {
  color: var(--primary-color);
}

.permiso-item {
  background: var(--bg-table-stripe);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  transition: var(--transition);
  height: 100%;
}
.permiso-item:hover {
  border-color: var(--primary-color);
}
.permiso-modulo {
  font-weight: 600;
  font-size: 0.83rem;
  color: var(--text-primary);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.permiso-modulo i {
  color: var(--primary-color);
  font-size: 0.85rem;
}
.permiso-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.permiso-badge {
  font-size: 0.62rem;
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.3px;
  opacity: 0.55;
}
.permiso-active {
  background: rgba(46, 204, 113, 0.15);
  color: #27ae60;
  opacity: 1;
}
</style>