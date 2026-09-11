<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-user-cog"></i> {{ id ? 'Editar' : 'Nuevo' }} Usuario
    </h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar" novalidate>
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i>
            {{ id ? 'Modifique los datos del usuario. Deje la contraseña vacía si no desea cambiarla.' : 'Complete los datos para crear un nuevo usuario.' }}
          </div>

          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Nombre completo</label>
              <input
                type="text"
                class="form-control"
                :class="{ 'is-invalid': errores.nombre }"
                v-model="form.nombre"
                placeholder="Ej: Juan Pérez"
                required
              />
              <div v-if="errores.nombre" class="invalid-feedback">{{ errores.nombre }}</div>
            </div>

            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Email</label>
              <input
                type="email"
                class="form-control"
                :class="{ 'is-invalid': errores.email }"
                v-model="form.email"
                placeholder="correo@ejemplo.com"
                required
              />
              <div v-if="errores.email" class="invalid-feedback">{{ errores.email }}</div>
            </div>

            <div class="col-md-6">
              <label class="form-label">Teléfono</label>
              <input
                type="text"
                class="form-control"
                v-model="form.telefono"
                placeholder="09XXXXXXXX"
              />
            </div>

            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Rol</label>
              <select
                class="form-select"
                :class="{ 'is-invalid': errores.rol }"
                v-model="form.rol"
                required
              >
                <option value="">Seleccione un rol...</option>
                <option value="admin">Administrador — Acceso total</option>
                <option value="contador">Contador — Ventas, compras, retenciones, reportes</option>
                <option value="vendedor">Vendedor — Ventas y clientes</option>
                <option value="bodeguero">Bodeguero — Inventario y compras</option>
                <option value="auditor">Auditor — Solo lectura</option>
              </select>
              <div v-if="errores.rol" class="invalid-feedback">{{ errores.rol }}</div>
            </div>

            <div class="col-md-6">
              <label class="form-label">
                <span class="text-danger" v-if="!id">*</span>
                Contraseña
                <small v-if="id" class="text-muted">(dejar vacío para no cambiar)</small>
              </label>
              <input
                type="password"
                class="form-control"
                :class="{ 'is-invalid': errores.password }"
                v-model="form.password"
                :placeholder="id ? '••••••••' : 'Mínimo 6 caracteres'"
                :required="!id"
                autocomplete="new-password"
              />
              <div v-if="errores.password" class="invalid-feedback">{{ errores.password }}</div>
            </div>

            <div class="col-md-6">
              <label class="form-label">Estado</label>
              <div class="form-check form-switch mt-2">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="activoSwitch"
                  v-model="form.activo"
                />
                <label class="form-check-label" for="activoSwitch">
                  {{ form.activo ? 'Usuario activo' : 'Usuario inactivo' }}
                </label>
              </div>
            </div>
          </div>

          <div v-if="errorGeneral" class="alert alert-danger mt-3">
            <i class="fas fa-exclamation-circle"></i> {{ errorGeneral }}
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-success me-2" :disabled="cargando">
              <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
              {{ cargando ? 'Guardando...' : 'Guardar' }}
            </button>
            <router-link to="/usuarios" class="btn btn-secondary">Cancelar</router-link>
          </div>
        </form>
      </div>
    </div>

    <!-- Info del rol seleccionado -->
    <div v-if="form.rol" class="card card-cacao mt-3">
      <div class="card-header">
        <i class="fas fa-info-circle me-2"></i> Permisos del rol "{{ getRolLabel(form.rol) }}"
      </div>
      <div class="card-body">
        <div class="row g-2">
          <div v-for="(permisos, modulo) in getPermisosRol(form.rol)" :key="modulo" class="col-md-4">
            <div class="permiso-item">
              <div class="permiso-modulo">
                <i :class="getModuloIcon(modulo)"></i> {{ getModuloLabel(modulo) }}
              </div>
              <div class="permiso-badges">
                <span v-for="p in ['ver', 'crear', 'editar', 'eliminar']" :key="p"
                      class="permiso-badge"
                      :class="{ 'permiso-active': permisos.includes(p) }">
                  {{ p }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = route.params.id

const cargando = ref(false)
const errorGeneral = ref('')

const form = ref({
  nombre: '',
  email: '',
  telefono: '',
  rol: '',
  password: '',
  activo: true
})

const errores = ref({
  nombre: '',
  email: '',
  rol: '',
  password: ''
})

// ===== PERMISOS POR ROL (para mostrar info) =====
const PERMISOS_ROL = {
  admin: {
    ventas: ['ver', 'crear', 'editar', 'eliminar'],
    compras: ['ver', 'crear', 'editar', 'eliminar'],
    clientes: ['ver', 'crear', 'editar', 'eliminar'],
    proveedores: ['ver', 'crear', 'editar', 'eliminar'],
    productos: ['ver', 'crear', 'editar', 'eliminar'],
    categorias: ['ver', 'crear', 'editar', 'eliminar'],
    retenciones: ['ver', 'crear', 'editar', 'eliminar'],
    inventario: ['ver', 'editar'],
    kardex: ['ver'],
    reportes: ['ver'],
    auditoria: ['ver'],
    usuarios: ['ver', 'crear', 'editar', 'eliminar']
  },
  contador: {
    ventas: ['ver', 'crear', 'editar'],
    compras: ['ver', 'crear', 'editar'],
    clientes: ['ver', 'crear', 'editar'],
    proveedores: ['ver', 'crear', 'editar'],
    productos: ['ver'],
    categorias: ['ver'],
    retenciones: ['ver', 'crear', 'editar', 'eliminar'],
    inventario: ['ver'],
    kardex: ['ver'],
    reportes: ['ver'],
    auditoria: ['ver'],
    usuarios: []
  },
  vendedor: {
    ventas: ['ver', 'crear'],
    compras: ['ver'],
    clientes: ['ver', 'crear', 'editar'],
    proveedores: ['ver'],
    productos: ['ver'],
    categorias: ['ver'],
    retenciones: [],
    inventario: ['ver'],
    kardex: [],
    reportes: [],
    auditoria: [],
    usuarios: []
  },
  bodeguero: {
    ventas: [],
    compras: ['ver', 'crear'],
    clientes: [],
    proveedores: ['ver'],
    productos: ['ver', 'crear', 'editar'],
    categorias: ['ver'],
    retenciones: [],
    inventario: ['ver', 'editar'],
    kardex: ['ver'],
    reportes: [],
    auditoria: [],
    usuarios: []
  },
  auditor: {
    ventas: ['ver'],
    compras: ['ver'],
    clientes: ['ver'],
    proveedores: ['ver'],
    productos: ['ver'],
    categorias: ['ver'],
    retenciones: ['ver'],
    inventario: ['ver'],
    kardex: ['ver'],
    reportes: ['ver'],
    auditoria: ['ver'],
    usuarios: []
  }
}

const getPermisosRol = (rol) => PERMISOS_ROL[rol] || {}

const getRolLabel = (rol) => {
  const labels = {
    admin: 'Administrador',
    contador: 'Contador',
    vendedor: 'Vendedor',
    bodeguero: 'Bodeguero',
    auditor: 'Auditor'
  }
  return labels[rol] || rol
}

const getModuloLabel = (modulo) => {
  const labels = {
    ventas: 'Ventas',
    compras: 'Compras',
    clientes: 'Clientes',
    proveedores: 'Proveedores',
    productos: 'Productos',
    categorias: 'Categorías',
    retenciones: 'Retenciones',
    inventario: 'Inventario',
    kardex: 'Kardex',
    reportes: 'Reportes',
    auditoria: 'Auditoría',
    usuarios: 'Usuarios'
  }
  return labels[modulo] || modulo
}

const getModuloIcon = (modulo) => {
  const icons = {
    ventas: 'fas fa-hand-holding-usd',
    compras: 'fas fa-shopping-cart',
    clientes: 'fas fa-users',
    proveedores: 'fas fa-truck',
    productos: 'fas fa-boxes',
    categorias: 'fas fa-tags',
    retenciones: 'fas fa-percent',
    inventario: 'fas fa-warehouse',
    kardex: 'fas fa-clipboard-list',
    reportes: 'fas fa-chart-bar',
    auditoria: 'fas fa-history',
    usuarios: 'fas fa-user-cog'
  }
  return icons[modulo] || 'fas fa-circle'
}

// ===== VALIDACIONES =====
const validar = () => {
  let valido = true
  errores.value = { nombre: '', email: '', rol: '', password: '' }

  if (!form.value.nombre || form.value.nombre.trim().length < 3) {
    errores.value.nombre = 'El nombre debe tener al menos 3 caracteres'
    valido = false
  }
  if (!form.value.email) {
    errores.value.email = 'El email es obligatorio'
    valido = false
  } else if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(form.value.email)) {
    errores.value.email = 'Email inválido'
    valido = false
  }
  if (!form.value.rol) {
    errores.value.rol = 'Debe seleccionar un rol'
    valido = false
  }
  if (!id && (!form.value.password || form.value.password.length < 6)) {
    errores.value.password = 'La contraseña debe tener al menos 6 caracteres'
    valido = false
  }
  if (id && form.value.password && form.value.password.length < 6) {
    errores.value.password = 'La contraseña debe tener al menos 6 caracteres'
    valido = false
  }

  return valido
}

// ===== CARGAR DATOS SI ES EDICIÓN =====
onMounted(async () => {
  if (id) {
    try {
      const data = await api.request(`/usuarios/${id}`, { method: 'GET' })
      form.value = {
        nombre: data.nombre || '',
        email: data.email || '',
        telefono: data.telefono || '',
        rol: data.rol || '',
        password: '',
        activo: data.activo !== undefined ? data.activo : true
      }
    } catch (e) {
      console.error('Error cargando usuario:', e)
      errorGeneral.value = 'Error al cargar el usuario: ' + e.message
      toast.error('Error al cargar el usuario')
    }
  }
})

// ===== GUARDAR =====
const guardar = async () => {
  if (!validar()) {
    errorGeneral.value = 'Corrija los errores marcados en rojo'
    toast.warning('Corrija los errores antes de guardar')
    return
  }

  errorGeneral.value = ''
  cargando.value = true

  try {
    const payload = {
      nombre: form.value.nombre.trim(),
      email: form.value.email.trim(),
      telefono: form.value.telefono?.trim() || '',
      rol: form.value.rol,
      activo: form.value.activo
    }
    if (form.value.password) {
      payload.password = form.value.password
    }

    if (id) {
      await api.request(`/usuarios/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
        loaderMessage: 'Actualizando usuario...'
      })
      toast.success('Usuario actualizado correctamente')
    } else {
      await api.request('/usuarios', {
        method: 'POST',
        body: JSON.stringify(payload),
        loaderMessage: 'Creando usuario...'
      })
      toast.success('Usuario creado correctamente')
    }
    router.push('/usuarios')
  } catch (e) {
    errorGeneral.value = 'Error al guardar: ' + e.message
    toast.error('Error al guardar: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>

<style scoped>
.permiso-item {
  background: var(--bg-table-stripe);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  transition: var(--transition);
}
.permiso-item:hover {
  border-color: var(--primary-color);
}
.permiso-modulo {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.permiso-modulo i {
  color: var(--primary-color);
  margin-right: 6px;
}
.permiso-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.permiso-badge {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(0,0,0,0.05);
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.3px;
}
.permiso-active {
  background: rgba(46,204,113,0.15);
  color: #27ae60;
}
</style>