<template>
  <nav class="navbar navbar-expand-lg navbar-cacao" ref="navbar">
    <div class="container-fluid px-3">

      <!-- ===== BRAND ===== -->
      <router-link class="navbar-brand" to="/" @click="cerrarTodo">
        <div class="brand-logo">
          <i class="fas fa-calculator"></i>
        </div>
        <div class="brand-text-wrapper">
          <span class="brand-text">Sistema Contable</span>
          <span class="brand-version">v2.0</span>
        </div>
      </router-link>

      <!-- ===== HAMBURGUESA ===== -->
      <button
        class="navbar-toggler"
        type="button"
        @click="toggleNavbar"
        aria-controls="navbarNav"
        :aria-expanded="navbarAbierto"
        aria-label="Toggle navigation"
      >
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
      </button>

      <div class="collapse navbar-collapse" :class="{ show: navbarAbierto }" id="navbarNav">
        <!-- ===== MENÚ PRINCIPAL ===== -->
        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
          <li class="nav-item">
            <router-link class="nav-link" to="/" exact-active-class="active" @click="cerrarTodo">
              <i class="fas fa-home"></i>
              <span class="nav-text">Inicio</span>
            </router-link>
          </li>

          <!-- ===== DOCUMENTOS ===== -->
          <li v-if="puedeVerVentas || puedeVerCompras" class="nav-item dropdown" :class="{ show: dropdowns.documentos }">
            <a class="nav-link dropdown-toggle" href="#" role="button" @click.prevent="toggleDropdown('documentos')">
              <i class="fas fa-file-invoice"></i>
              <span class="nav-text">Documentos</span>
              <i class="fas fa-chevron-down nav-chevron"></i>
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.documentos }">
              <li class="dropdown-header">
                <i class="fas fa-inbox"></i>
                <span>Bandejas</span>
              </li>
              <li v-if="puedeVerVentas">
                <router-link class="dropdown-item" to="/ventas" @click="cerrarTodo">
                  <i class="fas fa-hand-holding-usd"></i>
                  <span>Bandeja de Ventas</span>
                </router-link>
              </li>
              <li v-if="puedeVerCompras">
                <router-link class="dropdown-item" to="/compras" @click="cerrarTodo">
                  <i class="fas fa-inbox"></i>
                  <span>Bandeja de Compras</span>
                </router-link>
              </li>

              <li v-if="puedeCrearVentas" class="dropdown-header">
                <i class="fas fa-plus-circle"></i>
                <span>Crear Documento</span>
              </li>
              <li v-if="puedeCrearVentas">
                <router-link class="dropdown-item" to="/ventas/nuevo?tipo=factura" @click="cerrarTodo">
                  <i class="fas fa-file-invoice"></i>
                  <span>Nueva Factura</span>
                  <span class="dropdown-shortcut">01</span>
                </router-link>
              </li>
              <li v-if="puedeCrearVentas">
                <router-link class="dropdown-item" to="/ventas/nuevo?tipo=guia_remision" @click="cerrarTodo">
                  <i class="fas fa-truck"></i>
                  <span>Guía de Remisión</span>
                  <span class="dropdown-shortcut">06</span>
                </router-link>
              </li>
              <li v-if="puedeCrearVentas">
                <router-link class="dropdown-item" to="/ventas/nuevo?tipo=nota_credito" @click="cerrarTodo">
                  <i class="fas fa-minus-circle"></i>
                  <span>Nota de Crédito</span>
                  <span class="dropdown-shortcut">04</span>
                </router-link>
              </li>
              <li v-if="puedeCrearVentas">
                <router-link class="dropdown-item" to="/ventas/nuevo?tipo=retencion" @click="cerrarTodo">
                  <i class="fas fa-percent"></i>
                  <span>Comprobante Retención</span>
                  <span class="dropdown-shortcut">07</span>
                </router-link>
              </li>

              <li><hr class="dropdown-divider"></li>
              <li>
                <router-link class="dropdown-item dropdown-item-highlight" to="/consultar-documentos" @click="cerrarTodo">
                  <i class="fas fa-search"></i>
                  <span>Consultar Documentos</span>
                </router-link>
              </li>
            </ul>
          </li>

          <!-- ===== BASE DE DATOS ===== -->
          <li v-if="puedeVerClientes || puedeVerProveedores || puedeVerProductos || puedeVerCategorias" class="nav-item dropdown" :class="{ show: dropdowns.maestros }">
            <a class="nav-link dropdown-toggle" href="#" role="button" @click.prevent="toggleDropdown('maestros')">
              <i class="fas fa-database"></i>
              <span class="nav-text">Base de datos</span>
              <i class="fas fa-chevron-down nav-chevron"></i>
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.maestros }">
              <li v-if="puedeVerProductos">
                <router-link class="dropdown-item" to="/productos" @click="cerrarTodo">
                  <i class="fas fa-boxes"></i>
                  <span>Productos</span>
                </router-link>
              </li>
              <li v-if="puedeVerCategorias">
                <router-link class="dropdown-item" to="/categorias" @click="cerrarTodo">
                  <i class="fas fa-tags"></i>
                  <span>Categorías</span>
                </router-link>
              </li>
              <li v-if="puedeVerClientes">
                <router-link class="dropdown-item" to="/clientes" @click="cerrarTodo">
                  <i class="fas fa-users"></i>
                  <span>Clientes</span>
                </router-link>
              </li>
              <li v-if="puedeVerProveedores">
                <router-link class="dropdown-item" to="/proveedores" @click="cerrarTodo">
                  <i class="fas fa-truck-loading"></i>
                  <span>Proveedores</span>
                </router-link>
              </li>
            </ul>
          </li>

          <!-- ===== INVENTARIOS ===== -->
          <li v-if="puedeVerInventario || puedeVerKardex" class="nav-item dropdown" :class="{ show: dropdowns.inventarios }">
            <a class="nav-link dropdown-toggle" href="#" role="button" @click.prevent="toggleDropdown('inventarios')">
              <i class="fas fa-warehouse"></i>
              <span class="nav-text">Inventarios</span>
              <i class="fas fa-chevron-down nav-chevron"></i>
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.inventarios }">
              <li v-if="puedeVerKardex">
                <router-link class="dropdown-item" to="/kardex" @click="cerrarTodo">
                  <i class="fas fa-clipboard-list"></i>
                  <span>Kardex</span>
                </router-link>
              </li>
              <li v-if="puedeVerInventario">
                <router-link class="dropdown-item" to="/inventario/stock" @click="cerrarTodo">
                  <i class="fas fa-boxes"></i>
                  <span>Stock Actual</span>
                </router-link>
              </li>
              <li v-if="puedeVerInventario">
                <router-link class="dropdown-item" to="/inventario/planificacion" @click="cerrarTodo">
                  <i class="fas fa-calendar-alt"></i>
                  <span>Planificación</span>
                </router-link>
              </li>
              <li v-if="puedeVerInventario">
                <router-link class="dropdown-item" to="/inventario/conteo" @click="cerrarTodo">
                  <i class="fas fa-clipboard-check"></i>
                  <span>Conteo Físico</span>
                </router-link>
              </li>
              <li v-if="puedeEditarInventario">
                <router-link class="dropdown-item" to="/inventario/ajustes" @click="cerrarTodo">
                  <i class="fas fa-edit"></i>
                  <span>Ajustes</span>
                </router-link>
              </li>
              <li v-if="puedeVerInventario">
                <router-link class="dropdown-item" to="/inventario/valorizado" @click="cerrarTodo">
                  <i class="fas fa-dollar-sign"></i>
                  <span>Valorizado</span>
                </router-link>
              </li>
            </ul>
          </li>

          <!-- ===== REPORTES ===== -->
          <li v-if="puedeVerReportes" class="nav-item dropdown" :class="{ show: dropdowns.reportes }">
            <a class="nav-link dropdown-toggle" href="#" role="button" @click.prevent="toggleDropdown('reportes')">
              <i class="fas fa-chart-bar"></i>
              <span class="nav-text">Reportes</span>
              <i class="fas fa-chevron-down nav-chevron"></i>
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.reportes }">
              <li class="dropdown-header">
                <i class="fas fa-chart-line"></i>
                <span>Análisis</span>
              </li>
              <li>
                <router-link class="dropdown-item" to="/reportes/ventas" @click="cerrarTodo">
                  <i class="fas fa-arrow-up"></i>
                  <span>Ventas</span>
                </router-link>
              </li>
              <li>
                <router-link class="dropdown-item" to="/reportes/compras" @click="cerrarTodo">
                  <i class="fas fa-arrow-down"></i>
                  <span>Compras</span>
                </router-link>
              </li>
              <li>
                <router-link class="dropdown-item" to="/reportes/mensual" @click="cerrarTodo">
                  <i class="fas fa-file-invoice"></i>
                  <span>Reporte Mensual</span>
                </router-link>
              </li>

              <li class="dropdown-header">
                <i class="fas fa-calculator"></i>
                <span>Contabilidad</span>
              </li>
              <li>
                <router-link class="dropdown-item" to="/reportes/estado-cuenta" @click="cerrarTodo">
                  <i class="fas fa-file-invoice-dollar"></i>
                  <span>Estado de Cuenta</span>
                </router-link>
              </li>
              <li>
                <router-link class="dropdown-item" to="/reportes/cartera" @click="cerrarTodo">
                  <i class="fas fa-chart-pie"></i>
                  <span>Cartera General</span>
                </router-link>
              </li>
              <li>
                <router-link class="dropdown-item" to="/reportes/estados-financieros" @click="cerrarTodo">
                  <i class="fas fa-chart-line"></i>
                  <span>Estados Financieros</span>
                </router-link>
              </li>

              <li class="dropdown-header">
                <i class="fas fa-file-export"></i>
                <span>SRI</span>
              </li>
              <li>
                <router-link class="dropdown-item" to="/reportes/ats" @click="cerrarTodo">
                  <i class="fas fa-file-export"></i>
                  <span>Anexo ATS</span>
                </router-link>
              </li>
              <li>
                <router-link class="dropdown-item" to="/periodos-cerrados" @click="cerrarTodo">
                  <i class="fas fa-lock"></i>
                  <span>Períodos Cerrados</span>
                </router-link>
              </li>
            </ul>
          </li>

          <!-- ===== RETENCIONES ===== -->
          <li v-if="puedeVerRetenciones" class="nav-item dropdown" :class="{ show: dropdowns.retenciones }">
            <a class="nav-link dropdown-toggle" href="#" role="button" @click.prevent="toggleDropdown('retenciones')">
              <i class="fas fa-percent"></i>
              <span class="nav-text">Retenciones</span>
              <i class="fas fa-chevron-down nav-chevron"></i>
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.retenciones }">
              <li>
                <router-link class="dropdown-item" to="/retenciones" @click="cerrarTodo">
                  <i class="fas fa-list"></i>
                  <span>Lista de Retenciones</span>
                </router-link>
              </li>
              <li v-if="puedeCrearRetenciones">
                <router-link class="dropdown-item" to="/retenciones/nuevo" @click="cerrarTodo">
                  <i class="fas fa-plus"></i>
                  <span>Nueva Retención</span>
                </router-link>
              </li>
            </ul>
          </li>

          <!-- ===== ADMINISTRACIÓN ===== -->
          <li v-if="puedeVerAuditoria || puedeVerUsuarios" class="nav-item dropdown" :class="{ show: dropdowns.admin }">
            <a class="nav-link dropdown-toggle" href="#" role="button" @click.prevent="toggleDropdown('admin')">
              <i class="fas fa-cog"></i>
              <span class="nav-text">Administración</span>
              <i class="fas fa-chevron-down nav-chevron"></i>
              <span v-if="certificadoPorVencer" class="nav-badge-warning" title="Certificado próximo a vencer">
                <i class="fas fa-exclamation"></i>
              </span>
              <span v-if="documentosFirmados > 0" class="nav-badge-info" :title="`${documentosFirmados} documentos pendientes de envío al SRI`">
                {{ documentosFirmados > 9 ? '9+' : documentosFirmados }}
              </span>
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.admin }">
              <li v-if="puedeVerUsuarios">
                <router-link class="dropdown-item" to="/diagnostico" @click="cerrarTodo">
                  <i class="fas fa-stethoscope"></i>
                  <span>Diagnóstico del Sistema</span>
                </router-link>
              </li>

              <li v-if="puedeVerUsuarios" class="dropdown-header">
                <i class="fas fa-sliders-h"></i>
                <span>Configuración</span>
              </li>
              <li v-if="puedeVerUsuarios">
                <router-link class="dropdown-item" to="/configuracion-empresa" @click="cerrarTodo">
                  <i class="fas fa-building"></i>
                  <span>Configuración Empresa</span>
                </router-link>
              </li>
              <li v-if="puedeVerUsuarios">
                <router-link class="dropdown-item" to="/certificado-firma" @click="cerrarTodo">
                  <i class="fas fa-shield-alt"></i>
                  <span>Certificado Firma</span>
                  <span v-if="certificadoPorVencer" class="badge bg-warning text-dark ms-auto">
                    {{ certificadoDiasRestantes }}d
                  </span>
                </router-link>
              </li>
              <li v-if="puedeVerUsuarios">
                <router-link class="dropdown-item" to="/envio-sri" @click="cerrarTodo">
                  <i class="fas fa-cloud-upload-alt"></i>
                  <span>Envío al SRI</span>
                  <span v-if="documentosFirmados > 0" class="badge bg-info ms-auto">
                    {{ documentosFirmados }}
                  </span>
                </router-link>
              </li>

              <li class="dropdown-header">
                <i class="fas fa-shield-alt"></i>
                <span>Seguridad</span>
              </li>
              <li v-if="puedeVerUsuarios">
                <router-link class="dropdown-item" to="/usuarios" @click="cerrarTodo">
                  <i class="fas fa-user-cog"></i>
                  <span>Usuarios</span>
                </router-link>
              </li>
              <li v-if="puedeVerAuditoria">
                <router-link class="dropdown-item" to="/auditoria" @click="cerrarTodo">
                  <i class="fas fa-history"></i>
                  <span>Auditoría</span>
                </router-link>
              </li>
              <li v-if="puedeVerUsuarios">
                <router-link class="dropdown-item" to="/backups" @click="cerrarTodo">
                  <i class="fas fa-database"></i>
                  <span>Backups</span>
                </router-link>
              </li>
            </ul>
          </li>
        </ul>

        <!-- ===== CONTROLES DERECHA ===== -->
        <div class="nav-user-controls">

          <!-- Atajo de teclado hint -->
          <div class="kbd-hint d-none d-xxl-flex" title="Presiona Ctrl + K para buscar">
            <kbd>Ctrl</kbd><span>+</span><kbd>K</kbd>
          </div>

          <!-- Buscador -->
          <div class="search-wrapper">
            <SearchBar ref="searchBar" />
          </div>

          <!-- Toggle de tema -->
          <ThemeToggle />

          <!-- Botón de usuario -->
          <div class="dropdown user-dropdown" ref="userDropdown" :class="{ show: userMenuOpen }">
            <button class="user-btn" @click.stop="toggleUserMenu">
              <div class="user-avatar-small" :data-rol="user?.rol">
                {{ getInitials(user?.nombre) }}
              </div>
              <div class="user-info">
                <span class="user-name">{{ user?.nombre?.split(' ')[0] || 'Usuario' }}</span>
                <span v-if="user?.rol" class="user-rol-inline">{{ user.rol }}</span>
              </div>
              <i class="fas fa-chevron-down user-chevron" :class="{ rotated: userMenuOpen }"></i>
            </button>

            <ul class="dropdown-menu dropdown-menu-end user-menu" :class="{ show: userMenuOpen }">
              <!-- Header -->
              <li class="user-menu-header">
                <div class="user-avatar-large" :data-rol="user?.rol">
                  {{ getInitials(user?.nombre) }}
                </div>
                <div class="user-menu-info">
                  <div class="user-menu-name">{{ user?.nombre || 'Usuario' }}</div>
                  <div class="user-menu-email">{{ user?.email }}</div>
                  <span v-if="user?.rol" class="badge-rol-small" :class="`badge-rol-${user.rol}`">
                    {{ user.rol }}
                  </span>
                </div>
              </li>

              <!-- Alertas del sistema -->
              <li v-if="certificadoPorVencer" class="user-menu-alert warning">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                  <div class="alert-title">Certificado por vencer</div>
                  <div class="alert-text">Vence en {{ certificadoDiasRestantes }} días</div>
                </div>
              </li>
              <li v-if="documentosFirmados > 0" class="user-menu-alert info">
                <i class="fas fa-cloud-upload-alt"></i>
                <div>
                  <div class="alert-title">Documentos pendientes</div>
                  <div class="alert-text">{{ documentosFirmados }} firmados sin enviar al SRI</div>
                </div>
              </li>

              <li><hr class="dropdown-divider"></li>

              <!-- Acciones -->
              <li>
                <a class="dropdown-item" href="#" @click.prevent="irPerfil">
                  <i class="fas fa-id-card"></i>
                  <span>Mi Perfil</span>
                  <i class="fas fa-chevron-right ms-auto opacity-50"></i>
                </a>
              </li>
              <li v-if="puedeVerUsuarios">
                <a class="dropdown-item" href="#" @click.prevent="irConfigEmpresa">
                  <i class="fas fa-building"></i>
                  <span>Configuración Empresa</span>
                  <i class="fas fa-chevron-right ms-auto opacity-50"></i>
                </a>
              </li>
              <li v-if="puedeVerUsuarios">
                <a class="dropdown-item" href="#" @click.prevent="irCertificado">
                  <i class="fas fa-shield-alt"></i>
                  <span>Certificado Firma</span>
                  <span v-if="certificadoPorVencer" class="badge bg-warning text-dark ms-auto">⚠</span>
                </a>
              </li>
              <li v-if="puedeVerUsuarios">
                <a class="dropdown-item" href="#" @click.prevent="irEnvioSri">
                  <i class="fas fa-cloud-upload-alt"></i>
                  <span>Envío al SRI</span>
                  <span v-if="documentosFirmados > 0" class="badge bg-info ms-auto">
                    {{ documentosFirmados }}
                  </span>
                </a>
              </li>
              <li v-if="puedeVerAuditoria">
                <a class="dropdown-item" href="#" @click.prevent="irAuditoria">
                  <i class="fas fa-history"></i>
                  <span>Auditoría</span>
                </a>
              </li>
              <li v-if="puedeVerUsuarios">
                <a class="dropdown-item" href="#" @click.prevent="irBackups">
                  <i class="fas fa-database"></i>
                  <span>Backups</span>
                </a>
              </li>

              <li><hr class="dropdown-divider"></li>

              <!-- Footer con versión -->
              <li class="user-menu-footer">
                <span class="version-badge">
                  <i class="fas fa-code-branch"></i>
                  v2.0
                </span>
                <span class="connection-status">
                  <span class="status-dot"></span>
                  En línea
                </span>
              </li>

              <li><hr class="dropdown-divider"></li>

              <!-- Logout -->
              <li>
                <a class="dropdown-item dropdown-item-danger" href="#" @click.prevent="cerrarSesion">
                  <i class="fas fa-sign-out-alt"></i>
                  <span>Cerrar Sesión</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRouter } from 'vue-router'
import SearchBar from './SearchBar.vue'
import ThemeToggle from './ThemeToggle.vue'
import { useAuth } from '../composables/useAuth'
import { usePermisos } from '../composables/usePermisos'
import { api } from '../services/api'

const router = useRouter()
const { user, logout } = useAuth()
const { cargarPermisos, puede } = usePermisos()

// ===== ESTADO =====
const navbarAbierto = ref(false)
const userMenuOpen = ref(false)
const navbar = ref(null)
const userDropdown = ref(null)
const searchBar = ref(null)

const certificadoInfo = ref(null)
const estadoSri = ref(null)

const dropdowns = ref({
  documentos: false,
  maestros: false,
  inventarios: false,
  reportes: false,
  retenciones: false,
  admin: false
})

// ===== PERMISOS =====
const puedeVerVentas = computed(() => puede('ventas', 'ver'))
const puedeCrearVentas = computed(() => puede('ventas', 'crear'))
const puedeVerCompras = computed(() => puede('compras', 'ver'))
const puedeVerClientes = computed(() => puede('clientes', 'ver'))
const puedeVerProveedores = computed(() => puede('proveedores', 'ver'))
const puedeVerProductos = computed(() => puede('productos', 'ver'))
const puedeVerCategorias = computed(() => puede('categorias', 'ver'))
const puedeVerInventario = computed(() => puede('inventario', 'ver'))
const puedeEditarInventario = computed(() => puede('inventario', 'editar'))
const puedeVerKardex = computed(() => puede('kardex', 'ver'))
const puedeVerReportes = computed(() => puede('reportes', 'ver'))
const puedeVerRetenciones = computed(() => puede('retenciones', 'ver'))
const puedeCrearRetenciones = computed(() => puede('retenciones', 'crear'))
const puedeVerAuditoria = computed(() => puede('auditoria', 'ver'))
const puedeVerUsuarios = computed(() => puede('usuarios', 'ver'))

// ===== CERTIFICADO =====
const certificadoPorVencer = computed(() => certificadoInfo.value?.cargado && certificadoInfo.value?.por_vencer)
const certificadoDiasRestantes = computed(() => certificadoInfo.value?.dias_restantes || 0)
const documentosFirmados = computed(() => estadoSri.value?.documentos?.firmados || 0)

const cargarInfoSistema = async () => {
  if (!puedeVerUsuarios.value) return
  try {
    const [cert, sri] = await Promise.all([
      api.request('/certificado/info', { method: 'GET' }).catch(() => null),
      api.request('/sri/estado', { method: 'GET' }).catch(() => null)
    ])
    certificadoInfo.value = cert
    estadoSri.value = sri
  } catch (e) {}
}

// ===== TOGGLES =====
const toggleNavbar = () => {
  navbarAbierto.value = !navbarAbierto.value
  if (!navbarAbierto.value) {
    Object.keys(dropdowns.value).forEach(key => dropdowns.value[key] = false)
  }
}

const toggleDropdown = (nombre) => {
  if (navbarAbierto.value) {
    dropdowns.value[nombre] = !dropdowns.value[nombre]
    return
  }
  Object.keys(dropdowns.value).forEach(key => {
    dropdowns.value[key] = (key === nombre) ? !dropdowns.value[nombre] : false
  })
  // Cerrar user menu si se abre un dropdown
  if (userMenuOpen.value) userMenuOpen.value = false
}

const toggleUserMenu = () => {
  userMenuOpen.value = !userMenuOpen.value
  if (userMenuOpen.value) {
    Object.keys(dropdowns.value).forEach(key => dropdowns.value[key] = false)
  }
}

const cerrarTodo = () => {
  navbarAbierto.value = false
  Object.keys(dropdowns.value).forEach(key => dropdowns.value[key] = false)
  userMenuOpen.value = false
}

// ===== CLICK FUERA =====
const handleClickOutside = (event) => {
  if (navbar.value && navbar.value.contains(event.target)) return
  if (searchBar.value && searchBar.value.$el && searchBar.value.$el.contains(event.target)) return
  cerrarTodo()
}

// ===== ATAJOS DE TECLADO =====
const handleKeyboard = (e) => {
  // Ctrl/Cmd + K → enfocar buscador
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    if (searchBar.value && searchBar.value.$el) {
      const input = searchBar.value.$el.querySelector('.search-input')
      if (input) input.focus()
    }
  }
  // Esc → cerrar todo
  if (e.key === 'Escape') {
    cerrarTodo()
  }
  // Alt + 1-9 → navegación rápida
  if (e.altKey && /^[1-9]$/.test(e.key)) {
    e.preventDefault()
    const shortcuts = {
      '1': '/',
      '2': '/ventas',
      '3': '/compras',
      '4': '/clientes',
      '5': '/productos',
      '6': '/consultar-documentos',
      '7': '/reportes/ventas',
      '8': '/kardex',
      '9': '/auditoria'
    }
    if (shortcuts[e.key]) router.push(shortcuts[e.key])
  }
}

// ===== NAVEGACIÓN =====
const irPerfil = () => { cerrarTodo(); router.push('/mi-perfil') }
const irAuditoria = () => { cerrarTodo(); router.push('/auditoria') }
const irUsuarios = () => { cerrarTodo(); router.push('/usuarios') }
const irBackups = () => { cerrarTodo(); router.push('/backups') }
const irConfigEmpresa = () => { cerrarTodo(); router.push('/configuracion-empresa') }
const irCertificado = () => { cerrarTodo(); router.push('/certificado-firma') }
const irEnvioSri = () => { cerrarTodo(); router.push('/envio-sri') }
const cerrarSesion = () => { cerrarTodo(); logout() }

// ===== HELPERS =====
const getInitials = (nombre) => {
  if (!nombre) return '?'
  return String(nombre).split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

// ===== CICLO DE VIDA =====
onMounted(async () => {
  try { await cargarPermisos() } catch (e) { console.warn(e) }
  await cargarInfoSistema()
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeyboard)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeyboard)
})
</script>

<style scoped>
/* ============================================================
   NAVBAR PRINCIPAL
   ============================================================ */
.navbar-cacao {
  padding: 10px 0;
  background: var(--bg-navbar) !important;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.15);
  transition: all var(--transition);
  position: sticky;
  top: 0;
  z-index: 1000;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

/* ============================================================
   BRAND
   ============================================================ */
.navbar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  transition: all var(--transition);
  margin-right: 24px;
  text-decoration: none;
  color: #fff !important;
}
.navbar-brand:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-1px);
}

.brand-logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(241, 196, 15, 0.2), rgba(230, 126, 34, 0.15));
  border: 1.5px solid rgba(241, 196, 15, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-color);
  font-size: 1.3rem;
  box-shadow: 0 4px 12px rgba(241, 196, 15, 0.15);
  transition: all var(--transition);
  flex-shrink: 0;
}
.navbar-brand:hover .brand-logo {
  transform: rotate(-8deg) scale(1.08);
  box-shadow: 0 8px 20px rgba(241, 196, 15, 0.3);
}

.brand-text-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-text {
  font-size: 1.15rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.brand-version {
  font-size: 0.62rem;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: rgba(241, 196, 15, 0.18);
  color: var(--accent-color);
  font-weight: 700;
  letter-spacing: 0.5px;
  border: 1px solid rgba(241, 196, 15, 0.25);
}

/* ============================================================
   HAMBURGUESA
   ============================================================ */
.navbar-toggler {
  border: none;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  transition: all var(--transition);
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.navbar-toggler:hover {
  background: rgba(255, 255, 255, 0.15);
}
.navbar-toggler:focus {
  box-shadow: none;
  outline: 2px solid rgba(241, 196, 15, 0.5);
  outline-offset: 2px;
}

.hamburger-line {
  width: 22px;
  height: 2px;
  background: #fff;
  border-radius: 2px;
  transition: all var(--transition);
}

/* ============================================================
   MENÚ PRINCIPAL
   ============================================================ */
.navbar-cacao .navbar-nav {
  gap: 2px;
}

.navbar-cacao .nav-link {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px !important;
  border-radius: var(--radius-full);
  color: rgba(255, 255, 255, 0.85) !important;
  font-weight: 500;
  font-size: 0.88rem;
  transition: all var(--transition);
  position: relative;
  white-space: nowrap;
  cursor: pointer;
}

.navbar-cacao .nav-link > i:not(.nav-chevron):not(.fa-chevron-down) {
  font-size: 0.95rem;
  transition: transform var(--transition);
}

.navbar-cacao .nav-link:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff !important;
}
.navbar-cacao .nav-link:hover > i:not(.nav-chevron):not(.fa-chevron-down) {
  transform: scale(1.15);
}

.navbar-cacao .nav-link.active {
  background: var(--primary-color);
  color: #fff !important;
  box-shadow: 0 4px 14px rgba(52, 152, 219, 0.45);
}

/* Chevron indicador */
.nav-chevron,
.navbar-cacao .nav-link .fa-chevron-down {
  font-size: 0.65rem;
  opacity: 0.6;
  margin-left: 2px;
  transition: transform var(--transition);
}
.navbar-cacao .nav-item.dropdown.show .nav-chevron,
.navbar-cacao .nav-item.dropdown.show .fa-chevron-down {
  transform: rotate(180deg);
  opacity: 1;
}

/* ============================================================
   BADGES EN NAVBAR
   ============================================================ */
.nav-badge-warning {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #f39c12;
  color: #fff;
  font-size: 0.6rem;
  margin-left: 4px;
  animation: pulse-warning 2s infinite;
  box-shadow: 0 2px 8px rgba(243, 156, 18, 0.5);
}
@keyframes pulse-warning {
  0%, 100% { box-shadow: 0 0 0 0 rgba(243, 156, 18, 0.7); }
  50% { box-shadow: 0 0 0 6px rgba(243, 156, 18, 0); }
}

.nav-badge-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background: var(--info);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  margin-left: 4px;
  box-shadow: 0 2px 8px rgba(52, 152, 219, 0.5);
}

/* ============================================================
   DROPDOWNS
   ============================================================ */
.navbar-cacao .dropdown-menu {
  background: rgba(30, 42, 61, 0.98);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-lg);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
  padding: 8px;
  margin-top: 10px;
  animation: dropdownIn 0.2s var(--ease-out);
  min-width: 260px;
}

@keyframes dropdownIn {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 6px;
  font-size: 0.68rem;
  font-weight: 700;
  color: rgba(241, 196, 15, 0.9);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  pointer-events: none;
}
.dropdown-header i {
  font-size: 0.75rem;
}

.navbar-cacao .dropdown-item {
  color: rgba(255, 255, 255, 0.85) !important;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.86rem;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}

.navbar-cacao .dropdown-item > i {
  width: 18px;
  color: var(--accent-color);
  transition: all var(--transition-fast);
  font-size: 0.9rem;
}

.navbar-cacao .dropdown-item span:not(.dropdown-shortcut):not(.badge) {
  flex: 1;
}

.navbar-cacao .dropdown-item:hover {
  background: var(--primary-color);
  color: #fff !important;
  transform: translateX(4px);
}
.navbar-cacao .dropdown-item:hover > i {
  color: #fff;
  transform: scale(1.15);
}

.dropdown-item-highlight {
  background: rgba(241, 196, 15, 0.08);
  border: 1px solid rgba(241, 196, 15, 0.2);
}
.dropdown-item-highlight > i {
  color: var(--accent-color) !important;
}
.dropdown-item-highlight:hover {
  background: var(--accent-color) !important;
  color: #1a2a3a !important;
}
.dropdown-item-highlight:hover > i {
  color: #1a2a3a !important;
}

.dropdown-item-danger {
  color: rgba(231, 76, 60, 0.9) !important;
}
.dropdown-item-danger > i {
  color: #e74c3c !important;
}
.dropdown-item-danger:hover {
  background: var(--danger) !important;
  color: #fff !important;
}
.dropdown-item-danger:hover > i {
  color: #fff !important;
}

.dropdown-shortcut {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  background: rgba(241, 196, 15, 0.15);
  color: var(--accent-color);
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: 0.3px;
  border: 1px solid rgba(241, 196, 15, 0.2);
}

.navbar-cacao .dropdown-divider {
  border-color: rgba(255, 255, 255, 0.08);
  margin: 6px 8px;
}

/* ============================================================
   CONTROLES DERECHA
   ============================================================ */
.nav-user-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* Hint de atajo */
.kbd-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
}
.kbd-hint kbd {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
}
.kbd-hint span {
  opacity: 0.5;
}

.search-wrapper {
  width: 260px;
}

/* ============================================================
   BOTÓN DE USUARIO
   ============================================================ */
.user-dropdown {
  position: relative;
}

.user-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fff;
  padding: 5px 12px 5px 5px;
  border-radius: var(--radius-full);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition);
  max-width: 240px;
  font-family: inherit;
}
.user-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.user-avatar-small {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-color), #e67e22);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.72rem;
  color: #1a2a3a;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(241, 196, 15, 0.3);
  letter-spacing: 0.3px;
}
.user-avatar-small[data-rol="admin"] {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: #fff;
  box-shadow: 0 2px 8px rgba(231, 76, 60, 0.3);
}
.user-avatar-small[data-rol="contador"] {
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: #fff;
  box-shadow: 0 2px 8px rgba(52, 152, 219, 0.3);
}
.user-avatar-small[data-rol="vendedor"] {
  background: linear-gradient(135deg, #27ae60, #1e8449);
  color: #fff;
  box-shadow: 0 2px 8px rgba(39, 174, 96, 0.3);
}
.user-avatar-small[data-rol="bodeguero"] {
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff;
  box-shadow: 0 2px 8px rgba(243, 156, 18, 0.3);
}
.user-avatar-small[data-rol="auditor"] {
  background: linear-gradient(135deg, #8e44ad, #6c3483);
  color: #fff;
  box-shadow: 0 2px 8px rgba(155, 89, 182, 0.3);
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
}

.user-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 110px;
  line-height: 1.1;
}

.user-rol-inline {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: rgba(241, 196, 15, 0.9);
  font-weight: 700;
}

.user-chevron {
  font-size: 0.65rem;
  opacity: 0.6;
  transition: transform var(--transition);
  flex-shrink: 0;
}
.user-chevron.rotated {
  transform: rotate(180deg);
  opacity: 1;
}

/* ============================================================
   MENÚ DE USUARIO
   ============================================================ */
.user-menu {
  min-width: 320px !important;
  padding: 0 !important;
  overflow: hidden;
}

.user-menu-header {
  display: flex;
  gap: 14px;
  padding: 20px 20px 16px;
  align-items: center;
  background: linear-gradient(135deg, rgba(52, 152, 219, 0.08), rgba(241, 196, 15, 0.04));
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.user-avatar-large {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-color), #e67e22);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.1rem;
  color: #1a2a3a;
  flex-shrink: 0;
  box-shadow: 0 6px 16px rgba(241, 196, 15, 0.35);
  letter-spacing: 0.5px;
}
.user-avatar-large[data-rol="admin"] {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: #fff;
}
.user-avatar-large[data-rol="contador"] {
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: #fff;
}
.user-avatar-large[data-rol="vendedor"] {
  background: linear-gradient(135deg, #27ae60, #1e8449);
  color: #fff;
}
.user-avatar-large[data-rol="bodeguero"] {
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff;
}
.user-avatar-large[data-rol="auditor"] {
  background: linear-gradient(135deg, #8e44ad, #6c3483);
  color: #fff;
}

.user-menu-info {
  flex: 1;
  min-width: 0;
}
.user-menu-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-menu-email {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge-rol-small {
  display: inline-block;
  font-size: 0.62rem;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.badge-rol-admin { background: rgba(231,76,60,0.25); color: #ff9585; }
.badge-rol-contador { background: rgba(52,152,219,0.25); color: #63b4e0; }
.badge-rol-vendedor { background: rgba(39,174,96,0.25); color: #58d68d; }
.badge-rol-bodeguero { background: rgba(243,156,18,0.25); color: #f7b731; }
.badge-rol-auditor { background: rgba(155,89,182,0.25); color: #c39bd3; }

/* Alertas dentro del menú de usuario */
.user-menu-alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 20px;
  font-size: 0.78rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.user-menu-alert i {
  font-size: 1rem;
  margin-top: 2px;
  flex-shrink: 0;
}
.user-menu-alert .alert-title {
  font-weight: 700;
  color: #fff;
  margin-bottom: 2px;
  font-size: 0.78rem;
}
.user-menu-alert .alert-text {
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.72rem;
  line-height: 1.3;
}
.user-menu-alert.warning {
  background: rgba(243, 156, 18, 0.08);
}
.user-menu-alert.warning i {
  color: #f39c12;
}
.user-menu-alert.info {
  background: rgba(52, 152, 219, 0.08);
}
.user-menu-alert.info i {
  color: #3498db;
}

/* Footer del menú */
.user-menu-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  font-size: 0.7rem;
}
.version-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: rgba(241, 196, 15, 0.1);
  border: 1px solid rgba(241, 196, 15, 0.2);
  border-radius: var(--radius-full);
  color: var(--accent-color);
  font-weight: 700;
  font-size: 0.65rem;
}
.connection-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 600;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #27ae60;
  box-shadow: 0 0 0 0 rgba(39, 174, 96, 0.7);
  animation: pulse-status 2s infinite;
}
@keyframes pulse-status {
  0% { box-shadow: 0 0 0 0 rgba(39, 174, 96, 0.7); }
  70% { box-shadow: 0 0 0 6px rgba(39, 174, 96, 0); }
  100% { box-shadow: 0 0 0 0 rgba(39, 174, 96, 0); }
}

/* Items del menú dentro del user menu */
.user-menu .dropdown-item {
  padding: 10px 20px;
  border-radius: 0;
}
.user-menu .dropdown-item:hover {
  transform: none;
  padding-left: 24px;
}
.user-menu .dropdown-divider {
  margin: 0;
  border-color: rgba(255, 255, 255, 0.05);
}

/* ============================================================
   RESPONSIVE
   ============================================================ */

/* Tablets y pantallas medianas */
@media (max-width: 1300px) {
  .search-wrapper {
    width: 200px;
  }
}

@media (max-width: 1200px) {
  .nav-text { display: none; }
  .user-info { display: none; }
  .kbd-hint { display: none; }
  .navbar-cacao .nav-link {
    padding: 10px 12px !important;
  }
  .brand-text { font-size: 1rem; }
  .search-wrapper { width: 180px; }
}

/* Móvil */
@media (max-width: 992px) {
  .navbar-cacao {
    padding: 8px 0;
  }

  .navbar-cacao .navbar-collapse {
    max-height: calc(100vh - 80px);
    overflow-y: auto;
    background: rgba(15, 22, 38, 0.98);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    padding: 16px;
    border-radius: var(--radius-lg);
    margin-top: 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.4);
  }

  .nav-text { display: inline !important; }

  .navbar-cacao .navbar-nav {
    gap: 0;
    width: 100%;
  }

  .navbar-cacao .nav-item {
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .navbar-cacao .nav-item:last-child {
    border-bottom: none;
  }

  .navbar-cacao .nav-link {
    padding: 14px 16px !important;
    border-radius: var(--radius-sm);
    font-size: 0.95rem;
    justify-content: space-between;
    margin: 2px 0;
  }
  .navbar-cacao .nav-link.active {
    box-shadow: none;
  }

  .navbar-cacao .nav-item.dropdown.show .nav-chevron,
  .navbar-cacao .nav-item.dropdown.show .fa-chevron-down {
    transform: rotate(180deg);
  }

  /* Dropdowns colapsables como acordeón */
  .navbar-cacao .dropdown-menu {
    position: static !important;
    background: rgba(0, 0, 0, 0.2) !important;
    border: none;
    box-shadow: none;
    margin: 0;
    padding: 0 0 8px 20px !important;
    border-radius: 0;
    border-left: 2px solid var(--primary-color);
    margin-left: 16px;
    margin-bottom: 8px;
    animation: none;
    min-width: 0;
  }

  .navbar-cacao .dropdown-menu.show {
    display: block !important;
  }

  .navbar-cacao .dropdown-item {
    padding: 10px 14px;
    font-size: 0.85rem;
    border-radius: var(--radius-sm);
  }
  .navbar-cacao .dropdown-item:hover {
    transform: none;
  }

  .dropdown-header {
    padding: 8px 14px 4px;
    font-size: 0.65rem;
  }

  /* Controles de usuario apilados */
  .nav-user-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    width: 100%;
  }

  .search-wrapper {
    width: 100%;
    order: -1;
  }

  .user-btn {
    width: 100%;
    justify-content: center;
    padding: 10px 16px;
    border-radius: var(--radius-md);
  }

  .user-info { display: flex !important; }

  .user-menu {
    position: absolute !important;
    right: 0;
    left: auto;
    min-width: 300px !important;
  }
}

@media (max-width: 576px) {
  .brand-text { font-size: 0.9rem; }
  .brand-version { display: none; }
  .navbar-brand { gap: 8px; margin-right: 8px; }
  .brand-logo {
    width: 36px;
    height: 36px;
    font-size: 1.1rem;
  }
  .navbar-cacao .nav-link {
    padding: 12px 14px !important;
    font-size: 0.9rem;
  }
  .user-menu {
    min-width: 280px !important;
    right: 0;
    left: auto;
  }
}

/* Pantallas grandes: mejor espaciado */
@media (min-width: 1400px) {
  .navbar-cacao .nav-link {
    padding: 9px 16px !important;
  }
  .search-wrapper {
    width: 300px;
  }
}

/* ============================================================
   MODO OSCURO
   ============================================================ */
body.dark-mode .navbar-cacao {
  border-bottom-color: rgba(255, 255, 255, 0.04);
}
body.dark-mode .navbar-cacao .navbar-collapse {
  background: rgba(10, 14, 26, 0.98);
}
body.dark-mode .navbar-cacao .dropdown-menu {
  background: rgba(20, 28, 45, 0.98);
}
body.dark-mode .navbar-cacao .dropdown-menu {
  background: rgba(20, 28, 45, 0.98);
}
body.dark-mode .user-menu-header {
  background: linear-gradient(135deg, rgba(52, 152, 219, 0.12), rgba(241, 196, 15, 0.06));
}
</style>