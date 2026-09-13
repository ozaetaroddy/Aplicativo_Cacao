<template>
  <nav class="navbar-app" ref="navbar" :class="{ 'navbar-scrolled': scrolled }">
    <div class="container navbar-inner">

      <!-- ===== BRAND ===== -->
      <router-link class="brand" to="/" @click="cerrarTodo" data-tour="brand">
        <div class="brand-logo">
          <i class="fas fa-calculator"></i>
        </div>
        <div class="brand-text">
          <span class="brand-name">Sistema Contable</span>
          <span class="brand-tag">v3.0</span>
        </div>
      </router-link>

      <!-- ===== BOTÓN HAMBURGUESA MÓVIL ===== -->
      <button
        class="burger"
        type="button"
        @click="toggleNavbar"
        :aria-expanded="navbarAbierto"
        aria-label="Abrir menú"
      >
        <span class="burger-line" :class="{ open: navbarAbierto }"></span>
        <span class="burger-line" :class="{ open: navbarAbierto }"></span>
        <span class="burger-line" :class="{ open: navbarAbierto }"></span>
      </button>

      <!-- ===== MENÚ ===== -->
      <div class="nav-menu" :class="{ 'nav-menu-open': navbarAbierto }">
        <ul class="nav-list">
          <li>
            <router-link class="nav-item" to="/" exact-active-class="active" @click="cerrarTodo">
              <i class="fas fa-home"></i>
              <span>Inicio</span>
            </router-link>
          </li>

          <!-- ===== DOCUMENTOS ===== -->
          <li
            v-if="puedeVerVentas || puedeVerCompras"
            class="nav-dropdown"
            :class="{ open: dropdowns.documentos }"
            data-tour="documentos"
          >
            <button class="nav-item" @click.stop="toggleDropdown('documentos')">
              <i class="fas fa-file-invoice"></i>
              <span>Documentos</span>
              <i class="fas fa-chevron-down nav-caret"></i>
            </button>
            <transition name="dropdown">
              <ul v-if="dropdowns.documentos" class="dropdown-panel">
                <li class="dropdown-section">Bandejas</li>
                <li v-if="puedeVerVentas">
                  <router-link class="dropdown-link" to="/ventas" @click="cerrarTodo">
                    <i class="fas fa-hand-holding-usd"></i>
                    <span>Bandeja de Ventas</span>
                  </router-link>
                </li>
                <li v-if="puedeVerCompras">
                  <router-link class="dropdown-link" to="/compras" @click="cerrarTodo">
                    <i class="fas fa-inbox"></i>
                    <span>Bandeja de Compras</span>
                  </router-link>
                </li>

                <li v-if="puedeCrearVentas" class="dropdown-section">Crear documento</li>
                <li v-if="puedeCrearVentas">
                  <router-link class="dropdown-link" to="/ventas/nuevo?tipo=factura" @click="cerrarTodo">
                    <i class="fas fa-file-invoice"></i>
                    <span>Nueva Factura</span>
                    <span class="shortcut">01</span>
                  </router-link>
                </li>
                <li v-if="puedeCrearVentas">
                  <router-link class="dropdown-link" to="/ventas/nuevo?tipo=guia_remision" @click="cerrarTodo">
                    <i class="fas fa-truck"></i>
                    <span>Guía de Remisión</span>
                    <span class="shortcut">06</span>
                  </router-link>
                </li>
                <li v-if="puedeCrearVentas">
                  <router-link class="dropdown-link" to="/ventas/nuevo?tipo=nota_credito" @click="cerrarTodo">
                    <i class="fas fa-minus-circle"></i>
                    <span>Nota de Crédito</span>
                    <span class="shortcut">04</span>
                  </router-link>
                </li>
                <li v-if="puedeCrearVentas">
                  <router-link class="dropdown-link" to="/ventas/nuevo?tipo=retencion" @click="cerrarTodo">
                    <i class="fas fa-percent"></i>
                    <span>Retención</span>
                    <span class="shortcut">07</span>
                  </router-link>
                </li>

                <li class="dropdown-divider"></li>
                <li>
                  <router-link class="dropdown-link highlight" to="/consultar-documentos" @click="cerrarTodo">
                    <i class="fas fa-search"></i>
                    <span>Consultar Documentos</span>
                  </router-link>
                </li>
              </ul>
            </transition>
          </li>

          <!-- ===== BASE DE DATOS ===== -->
          <li
            v-if="puedeVerClientes || puedeVerProveedores || puedeVerProductos || puedeVerCategorias"
            class="nav-dropdown"
            :class="{ open: dropdowns.maestros }"
          >
            <button class="nav-item" @click.stop="toggleDropdown('maestros')">
              <i class="fas fa-database"></i>
              <span>Base de datos</span>
              <i class="fas fa-chevron-down nav-caret"></i>
            </button>
            <transition name="dropdown">
              <ul v-if="dropdowns.maestros" class="dropdown-panel">
                <li v-if="puedeVerProductos">
                  <router-link class="dropdown-link" to="/productos" @click="cerrarTodo">
                    <i class="fas fa-boxes"></i>
                    <span>Productos</span>
                  </router-link>
                </li>
                <li v-if="puedeVerCategorias">
                  <router-link class="dropdown-link" to="/categorias" @click="cerrarTodo">
                    <i class="fas fa-tags"></i>
                    <span>Categorías</span>
                  </router-link>
                </li>
                <li v-if="puedeVerClientes">
                  <router-link class="dropdown-link" to="/clientes" @click="cerrarTodo">
                    <i class="fas fa-users"></i>
                    <span>Clientes</span>
                  </router-link>
                </li>
                <li v-if="puedeVerProveedores">
                  <router-link class="dropdown-link" to="/proveedores" @click="cerrarTodo">
                    <i class="fas fa-truck-loading"></i>
                    <span>Proveedores</span>
                  </router-link>
                </li>
              </ul>
            </transition>
          </li>

          <!-- ===== INVENTARIO ===== -->
          <li
            v-if="puedeVerInventario || puedeVerKardex"
            class="nav-dropdown"
            :class="{ open: dropdowns.inventarios }"
          >
            <button class="nav-item" @click.stop="toggleDropdown('inventarios')">
              <i class="fas fa-warehouse"></i>
              <span>Inventario</span>
              <i class="fas fa-chevron-down nav-caret"></i>
            </button>
            <transition name="dropdown">
              <ul v-if="dropdowns.inventarios" class="dropdown-panel">
                <li v-if="puedeVerKardex">
                  <router-link class="dropdown-link" to="/kardex" @click="cerrarTodo">
                    <i class="fas fa-clipboard-list"></i>
                    <span>Kardex</span>
                  </router-link>
                </li>
                <li v-if="puedeVerInventario">
                  <router-link class="dropdown-link" to="/inventario/stock" @click="cerrarTodo">
                    <i class="fas fa-boxes"></i>
                    <span>Stock actual</span>
                  </router-link>
                </li>
                <li v-if="puedeVerInventario">
                  <router-link class="dropdown-link" to="/inventario/valorizado" @click="cerrarTodo">
                    <i class="fas fa-dollar-sign"></i>
                    <span>Valorizado</span>
                  </router-link>
                </li>
                <li v-if="puedeVerInventario">
                  <router-link class="dropdown-link" to="/inventario/conteo" @click="cerrarTodo">
                    <i class="fas fa-clipboard-check"></i>
                    <span>Conteo físico</span>
                  </router-link>
                </li>
                <li v-if="puedeEditarInventario">
                  <router-link class="dropdown-link" to="/inventario/ajustes" @click="cerrarTodo">
                    <i class="fas fa-edit"></i>
                    <span>Ajustes</span>
                  </router-link>
                </li>
              </ul>
            </transition>
          </li>

          <!-- ===== REPORTES ===== -->
          <li
            v-if="puedeVerReportes"
            class="nav-dropdown"
            :class="{ open: dropdowns.reportes }"
          >
            <button class="nav-item" @click.stop="toggleDropdown('reportes')">
              <i class="fas fa-chart-bar"></i>
              <span>Reportes</span>
              <i class="fas fa-chevron-down nav-caret"></i>
            </button>
            <transition name="dropdown">
              <ul v-if="dropdowns.reportes" class="dropdown-panel">
                <li class="dropdown-section">Análisis</li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/ventas" @click="cerrarTodo">
                    <i class="fas fa-arrow-up"></i>
                    <span>Ventas</span>
                  </router-link>
                </li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/compras" @click="cerrarTodo">
                    <i class="fas fa-arrow-down"></i>
                    <span>Compras</span>
                  </router-link>
                </li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/mensual" @click="cerrarTodo">
                    <i class="fas fa-calendar-alt"></i>
                    <span>Reporte mensual</span>
                  </router-link>
                </li>

                <li class="dropdown-section">Contabilidad</li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/estado-cuenta" @click="cerrarTodo">
                    <i class="fas fa-file-invoice-dollar"></i>
                    <span>Estado de cuenta</span>
                  </router-link>
                </li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/cartera" @click="cerrarTodo">
                    <i class="fas fa-chart-pie"></i>
                    <span>Cartera general</span>
                  </router-link>
                </li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/estados-financieros" @click="cerrarTodo">
                    <i class="fas fa-chart-line"></i>
                    <span>Estados financieros</span>
                  </router-link>
                </li>

                <li class="dropdown-section">SRI</li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/ats" @click="cerrarTodo">
                    <i class="fas fa-file-export"></i>
                    <span>Anexo ATS</span>
                  </router-link>
                </li>
                <li>
                  <router-link class="dropdown-link" to="/periodos-cerrados" @click="cerrarTodo">
                    <i class="fas fa-lock"></i>
                    <span>Períodos cerrados</span>
                  </router-link>
                </li>
              </ul>
            </transition>
          </li>

          <!-- ===== RETENCIONES ===== -->
          <li
            v-if="puedeVerRetenciones"
            class="nav-dropdown"
            :class="{ open: dropdowns.retenciones }"
          >
            <button class="nav-item" @click.stop="toggleDropdown('retenciones')">
              <i class="fas fa-percent"></i>
              <span>Retenciones</span>
              <i class="fas fa-chevron-down nav-caret"></i>
            </button>
            <transition name="dropdown">
              <ul v-if="dropdowns.retenciones" class="dropdown-panel">
                <li>
                  <router-link class="dropdown-link" to="/retenciones" @click="cerrarTodo">
                    <i class="fas fa-list"></i>
                    <span>Lista de retenciones</span>
                  </router-link>
                </li>
                <li v-if="puedeCrearRetenciones">
                  <router-link class="dropdown-link" to="/retenciones/nuevo" @click="cerrarTodo">
                    <i class="fas fa-plus"></i>
                    <span>Nueva retención</span>
                  </router-link>
                </li>
              </ul>
            </transition>
          </li>

          <!-- ===== ADMINISTRACIÓN ===== -->
          <li
            v-if="puedeVerUsuarios || puedeVerAuditoria"
            class="nav-dropdown"
            :class="{ open: dropdowns.admin }"
          >
            <button class="nav-item" @click.stop="toggleDropdown('admin')">
              <i class="fas fa-cog"></i>
              <span>Admin</span>
              <i class="fas fa-chevron-down nav-caret"></i>
              <span v-if="certificadoPorVencer" class="nav-alert-dot warning" :title="`Certificado vence en ${certificadoDiasRestantes} días`"></span>
              <span v-else-if="documentosFirmados > 0" class="nav-alert-dot info" :title="`${documentosFirmados} docs pendientes de envío SRI`"></span>
            </button>
            <transition name="dropdown">
              <ul v-if="dropdowns.admin" class="dropdown-panel">
                <li v-if="puedeVerUsuarios">
                  <router-link class="dropdown-link" to="/diagnostico" @click="cerrarTodo">
                    <i class="fas fa-stethoscope"></i>
                    <span>Diagnóstico</span>
                  </router-link>
                </li>

                <li v-if="puedeVerUsuarios" class="dropdown-section">Configuración</li>
                <li v-if="puedeVerUsuarios">
                  <router-link class="dropdown-link" to="/configuracion-empresa" @click="cerrarTodo">
                    <i class="fas fa-building"></i>
                    <span>Empresa</span>
                  </router-link>
                </li>
                <li v-if="puedeVerUsuarios">
                  <router-link class="dropdown-link" to="/certificado-firma" @click="cerrarTodo">
                    <i class="fas fa-shield-alt"></i>
                    <span>Certificado</span>
                    <span v-if="certificadoPorVencer" class="badge-mini warning">
                      {{ certificadoDiasRestantes }}d
                    </span>
                  </router-link>
                </li>
                <li v-if="puedeVerUsuarios">
                  <router-link class="dropdown-link" to="/envio-sri" @click="cerrarTodo">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <span>Envío al SRI</span>
                    <span v-if="documentosFirmados > 0" class="badge-mini info">
                      {{ documentosFirmados }}
                    </span>
                  </router-link>
                </li>

                <li v-if="puedeVerUsuarios" class="dropdown-section">Seguridad</li>
                <li v-if="puedeVerUsuarios">
                  <router-link class="dropdown-link" to="/usuarios" @click="cerrarTodo">
                    <i class="fas fa-user-cog"></i>
                    <span>Usuarios</span>
                  </router-link>
                </li>
                <li v-if="puedeVerAuditoria">
                  <router-link class="dropdown-link" to="/auditoria" @click="cerrarTodo">
                    <i class="fas fa-history"></i>
                    <span>Auditoría</span>
                  </router-link>
                </li>
                <li v-if="puedeVerUsuarios">
                  <router-link class="dropdown-link" to="/backups" @click="cerrarTodo">
                    <i class="fas fa-database"></i>
                    <span>Backups</span>
                  </router-link>
                </li>
              </ul>
            </transition>
          </li>
        </ul>

        <!-- ===== CONTROLES DERECHA ===== -->
        <div class="nav-controls">
          <!-- Buscador -->
          <div class="search-container" data-tour="search">
            <SearchBar ref="searchBar" />
          </div>

          <!-- Toggle tema -->
          <ThemeToggle />

          <!-- ===== USER MENU ===== -->
          <div class="user-wrapper" ref="userDropdown" data-tour="user-menu">
            <button class="user-btn" @click.stop="toggleUserMenu">
              <div class="user-avatar" :data-rol="user?.rol">
                {{ getInitials(user?.nombre) }}
              </div>
              <div class="user-details">
                <span class="user-name">{{ user?.nombre?.split(' ')[0] || 'Usuario' }}</span>
                <span class="user-role">{{ user?.rol || 'user' }}</span>
              </div>
              <i class="fas fa-chevron-down user-caret" :class="{ rotated: userMenuOpen }"></i>
            </button>

            <transition name="dropdown">
              <div v-if="userMenuOpen" class="user-panel" @click.stop>
                <!-- Header -->
                <div class="user-panel-header">
                  <div class="user-avatar-lg" :data-rol="user?.rol">
                    {{ getInitials(user?.nombre) }}
                  </div>
                  <div class="user-panel-info">
                    <div class="user-panel-name">{{ user?.nombre || 'Usuario' }}</div>
                    <div class="user-panel-email">{{ user?.email }}</div>
                    <span class="user-panel-badge" :class="`badge-rol-${user?.rol}`">
                      {{ user?.rol }}
                    </span>
                  </div>
                </div>

                <!-- Alertas -->
                <div v-if="certificadoPorVencer" class="user-alert warning">
                  <i class="fas fa-exclamation-triangle"></i>
                  <div>
                    <div class="user-alert-title">Certificado por vencer</div>
                    <div class="user-alert-text">Vence en {{ certificadoDiasRestantes }} días</div>
                  </div>
                </div>
                <div v-if="documentosFirmados > 0" class="user-alert info">
                  <i class="fas fa-cloud-upload-alt"></i>
                  <div>
                    <div class="user-alert-title">Documentos pendientes</div>
                    <div class="user-alert-text">{{ documentosFirmados }} sin enviar al SRI</div>
                  </div>
                </div>

                <!-- Acciones -->
                <div class="user-menu-actions">
                  <button class="user-action" @click="irPerfil">
                    <i class="fas fa-id-card"></i>
                    <span>Mi perfil</span>
                  </button>
                  <button v-if="puedeVerUsuarios" class="user-action" @click="irConfigEmpresa">
                    <i class="fas fa-building"></i>
                    <span>Configuración empresa</span>
                  </button>
                  <button v-if="puedeVerUsuarios" class="user-action" @click="irCertificado">
                    <i class="fas fa-shield-alt"></i>
                    <span>Certificado firma</span>
                    <span v-if="certificadoPorVencer" class="badge-mini warning">⚠</span>
                  </button>
                  <button v-if="puedeVerUsuarios" class="user-action" @click="irEnvioSri">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <span>Envío al SRI</span>
                    <span v-if="documentosFirmados > 0" class="badge-mini info">{{ documentosFirmados }}</span>
                  </button>

                  <div class="user-divider"></div>

                  <button class="user-action" @click="reiniciarTour">
                    <i class="fas fa-question-circle"></i>
                    <span>Ver tour de nuevo</span>
                  </button>
                </div>

                <!-- Footer -->
                <div class="user-panel-footer">
                  <div class="version-tag">
                    <i class="fas fa-code-branch"></i>
                    v3.0
                  </div>
                  <div class="status-indicator">
                    <span class="status-dot"></span>
                    En línea
                  </div>
                </div>

                <div class="user-divider"></div>

                <button class="user-action danger" @click="cerrarSesion">
                  <i class="fas fa-sign-out-alt"></i>
                  <span>Cerrar sesión</span>
                </button>
              </div>
            </transition>
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

const navbarAbierto = ref(false)
const userMenuOpen = ref(false)
const scrolled = ref(false)
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
      api.request('/certificado/info', { method: 'GET', skipLoader: true }).catch(() => null),
      api.request('/sri/estado', { method: 'GET', skipLoader: true }).catch(() => null)
    ])
    certificadoInfo.value = cert
    estadoSri.value = sri
  } catch (e) {}
}

// ===== TOGGLES =====
const toggleNavbar = () => {
  navbarAbierto.value = !navbarAbierto.value
  if (!navbarAbierto.value) {
    Object.keys(dropdowns.value).forEach(k => dropdowns.value[k] = false)
  }
}

const toggleDropdown = (nombre) => {
  if (navbarAbierto.value) {
    dropdowns.value[nombre] = !dropdowns.value[nombre]
    return
  }
  Object.keys(dropdowns.value).forEach(k => {
    dropdowns.value[k] = (k === nombre) ? !dropdowns.value[nombre] : false
  })
  if (userMenuOpen.value) userMenuOpen.value = false
}

const toggleUserMenu = () => {
  userMenuOpen.value = !userMenuOpen.value
  if (userMenuOpen.value) {
    Object.keys(dropdowns.value).forEach(k => dropdowns.value[k] = false)
  }
}

const cerrarTodo = () => {
  navbarAbierto.value = false
  Object.keys(dropdowns.value).forEach(k => dropdowns.value[k] = false)
  userMenuOpen.value = false
}

// ===== CLICK FUERA =====
const handleClickOutside = (e) => {
  if (navbar.value && navbar.value.contains(e.target)) return
  cerrarTodo()
}

// ===== SCROLL =====
const handleScroll = () => {
  scrolled.value = window.scrollY > 8
}

// ===== ATAJOS =====
const handleKeyboard = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    if (searchBar.value?.$el) {
      const input = searchBar.value.$el.querySelector('input')
      if (input) input.focus()
    }
  }
  if (e.key === 'Escape') cerrarTodo()
  if (e.altKey && /^[1-9]$/.test(e.key)) {
    e.preventDefault()
    const shortcuts = {
      '1': '/', '2': '/ventas', '3': '/compras',
      '4': '/clientes', '5': '/productos', '6': '/consultar-documentos',
      '7': '/reportes/ventas', '8': '/kardex', '9': '/auditoria'
    }
    if (shortcuts[e.key]) router.push(shortcuts[e.key])
  }
}

// ===== NAVEGACIÓN =====
const irPerfil = () => { cerrarTodo(); router.push('/mi-perfil') }
const irConfigEmpresa = () => { cerrarTodo(); router.push('/configuracion-empresa') }
const irCertificado = () => { cerrarTodo(); router.push('/certificado-firma') }
const irEnvioSri = () => { cerrarTodo(); router.push('/envio-sri') }
const cerrarSesion = () => { cerrarTodo(); logout() }

const reiniciarTour = () => {
  cerrarTodo()
  if (typeof window.__reiniciarTour__ === 'function') {
    window.__reiniciarTour__()
  }
}

const getInitials = (nombre) => {
  if (!nombre) return '?'
  return String(nombre).split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

// ===== CICLO =====
onMounted(async () => {
  try { await cargarPermisos() } catch (e) {}
  await cargarInfoSistema()
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeyboard)
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeyboard)
  window.removeEventListener('scroll', handleScroll)
})
</script>

<style scoped>
/* ============================================================
   NAVBAR BASE
   ============================================================ */
.navbar-app {
  position: sticky;
  top: 0;
  z-index: 900;
  background: var(--bg-navbar);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  transition: all var(--transition);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.navbar-app.navbar-scrolled {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
}

.navbar-inner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 10px;
  padding-bottom: 10px;
  min-height: 64px;
}

/* ============================================================
   BRAND
   ============================================================ */
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  transition: all var(--transition);
  text-decoration: none;
  flex-shrink: 0;
}
.brand:hover { background: rgba(255, 255, 255, 0.08); }

.brand-logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.15));
  border: 1.5px solid rgba(245, 158, 11, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-color);
  font-size: 1.15rem;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.15);
  transition: all var(--transition);
  flex-shrink: 0;
}
.brand:hover .brand-logo {
  transform: rotate(-6deg) scale(1.06);
  box-shadow: 0 8px 20px rgba(245, 158, 11, 0.35);
}

.brand-text { display: flex; align-items: center; gap: 8px; }
.brand-name {
  font-size: 1.05rem;
  font-weight: var(--fw-extrabold);
  color: #fff;
  letter-spacing: var(--ls-tight);
  white-space: nowrap;
}
.brand-tag {
  font-size: 0.6rem;
  font-weight: var(--fw-bold);
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: rgba(245, 158, 11, 0.18);
  color: var(--accent-color);
  letter-spacing: var(--ls-wider);
  border: 1px solid rgba(245, 158, 11, 0.28);
}

/* ============================================================
   BURGER (móvil)
   ============================================================ */
.burger {
  display: none;
  width: 42px;
  height: 42px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  cursor: pointer;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  transition: all var(--transition);
  padding: 0;
}
.burger:hover { background: rgba(255, 255, 255, 0.15); }

.burger-line {
  width: 20px;
  height: 2px;
  background: #fff;
  border-radius: 2px;
  transition: all var(--transition);
}
.burger-line.open:nth-child(1) { transform: translateY(6px) rotate(45deg); }
.burger-line.open:nth-child(2) { opacity: 0; }
.burger-line.open:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

/* ============================================================
   MENÚ
   ============================================================ */
.nav-menu {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  justify-content: space-between;
}

.nav-list {
  display: flex;
  align-items: center;
  gap: 2px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px;
  border-radius: var(--radius-full);
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: var(--fw-medium);
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
  text-decoration: none;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.nav-item.active {
  background: var(--primary-color);
  color: #fff;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
}

.nav-item > i:first-child { font-size: 0.9rem; }

.nav-caret {
  font-size: 0.6rem;
  opacity: 0.6;
  margin-left: 2px;
  transition: transform var(--transition);
}
.nav-dropdown.open .nav-caret {
  transform: rotate(180deg);
  opacity: 1;
}

.nav-alert-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 4px;
  animation: pulse-dot 2s infinite;
}
.nav-alert-dot.warning { background: var(--warning); }
.nav-alert-dot.info { background: var(--info); }

@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
  50% { box-shadow: 0 0 0 4px transparent; opacity: 0.7; }
}

/* ============================================================
   DROPDOWN
   ============================================================ */
.nav-dropdown { position: relative; }

.dropdown-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 260px;
  background: rgba(20, 30, 48, 0.98);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-lg);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
  padding: 8px;
  list-style: none;
  margin: 0;
  z-index: 100;
  animation: dropdown-in 0.2s var(--ease-out);
}

@keyframes dropdown-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.dropdown-section {
  font-size: 0.65rem;
  font-weight: var(--fw-bold);
  color: rgba(245, 158, 11, 0.9);
  text-transform: uppercase;
  letter-spacing: var(--ls-widest);
  padding: 10px 14px 6px;
  pointer-events: none;
}

.dropdown-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  color: rgba(255, 255, 255, 0.88);
  text-decoration: none;
  font-size: 0.86rem;
  font-weight: var(--fw-medium);
  transition: all var(--transition-fast);
}
.dropdown-link > i {
  width: 18px;
  color: var(--accent-color);
  font-size: 0.88rem;
  transition: all var(--transition-fast);
}
.dropdown-link > span:first-of-type { flex: 1; }
.dropdown-link:hover {
  background: var(--primary-color);
  color: #fff;
  transform: translateX(4px);
}
.dropdown-link:hover > i { color: #fff; transform: scale(1.1); }

.dropdown-link.highlight {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
}
.dropdown-link.highlight:hover { background: var(--accent-color); color: #1a2a3a; }

.shortcut {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  background: rgba(245, 158, 11, 0.15);
  color: var(--accent-color);
  font-family: var(--font-mono);
  font-weight: var(--fw-bold);
  letter-spacing: 0.3px;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.badge-mini {
  font-size: 0.65rem;
  font-weight: var(--fw-bold);
  padding: 2px 7px;
  border-radius: var(--radius-full);
  min-width: 22px;
  text-align: center;
}
.badge-mini.info { background: var(--info-bg); color: var(--info); }
.badge-mini.warning { background: var(--warning-bg); color: var(--warning-hover); }

.dropdown-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 6px 8px;
  list-style: none;
}

/* ============================================================
   CONTROLES DERECHA
   ============================================================ */
.nav-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-container {
  width: 260px;
  flex-shrink: 0;
}

/* ============================================================
   USER BUTTON
   ============================================================ */
.user-wrapper { position: relative; }

.user-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 12px 5px 5px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-full);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition);
  max-width: 240px;
}
.user-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--fw-extrabold);
  font-size: 0.72rem;
  color: #1a2a3a;
  flex-shrink: 0;
  letter-spacing: 0.3px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);
}
.user-avatar[data-rol="admin"] { background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35); }
.user-avatar[data-rol="contador"] { background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; box-shadow: 0 2px 8px rgba(59, 130, 246, 0.35); }
.user-avatar[data-rol="vendedor"] { background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35); }
.user-avatar[data-rol="bodeguero"] { background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35); }
.user-avatar[data-rol="auditor"] { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: #fff; box-shadow: 0 2px 8px rgba(139, 92, 246, 0.35); }

.user-details {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
}
.user-name {
  font-size: 0.82rem;
  font-weight: var(--fw-bold);
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 110px;
  line-height: 1.1;
}
.user-role {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: var(--ls-wider);
  color: rgba(245, 158, 11, 0.9);
  font-weight: var(--fw-bold);
}

.user-caret {
  font-size: 0.65rem;
  opacity: 0.6;
  transition: transform var(--transition);
  flex-shrink: 0;
}
.user-caret.rotated { transform: rotate(180deg); opacity: 1; }

/* ============================================================
   USER PANEL
   ============================================================ */
.user-panel {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  min-width: 320px;
  background: rgba(20, 30, 48, 0.99);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-lg);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  z-index: 100;
  animation: dropdown-in 0.2s var(--ease-out);
}

.user-panel-header {
  display: flex;
  gap: 14px;
  padding: 20px;
  align-items: center;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(245, 158, 11, 0.05));
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.user-avatar-lg {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--fw-extrabold);
  font-size: 1.05rem;
  color: #1a2a3a;
  flex-shrink: 0;
  letter-spacing: 0.5px;
  box-shadow: 0 6px 16px rgba(245, 158, 11, 0.35);
  background: linear-gradient(135deg, #f59e0b, #d97706);
}
.user-avatar-lg[data-rol="admin"] { background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; }
.user-avatar-lg[data-rol="contador"] { background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; }
.user-avatar-lg[data-rol="vendedor"] { background: linear-gradient(135deg, #10b981, #059669); color: #fff; }
.user-avatar-lg[data-rol="bodeguero"] { background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; }
.user-avatar-lg[data-rol="auditor"] { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: #fff; }

.user-panel-info { flex: 1; min-width: 0; }
.user-panel-name {
  font-size: 0.95rem;
  font-weight: var(--fw-bold);
  color: #fff;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-panel-email {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-panel-badge {
  display: inline-block;
  font-size: 0.62rem;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: var(--ls-wider);
}
.badge-rol-admin { background: rgba(239, 68, 68, 0.25); color: #fca5a5; }
.badge-rol-contador { background: rgba(59, 130, 246, 0.25); color: #93c5fd; }
.badge-rol-vendedor { background: rgba(16, 185, 129, 0.25); color: #6ee7b7; }
.badge-rol-bodeguero { background: rgba(245, 158, 11, 0.25); color: #fbbf24; }
.badge-rol-auditor { background: rgba(139, 92, 246, 0.25); color: #c4b5fd; }

.user-alert {
  display: flex;
  gap: 12px;
  padding: 12px 20px;
  font-size: 0.78rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  align-items: flex-start;
}
.user-alert.warning { background: rgba(245, 158, 11, 0.08); }
.user-alert.warning > i { color: var(--warning); }
.user-alert.info { background: rgba(14, 165, 233, 0.08); }
.user-alert.info > i { color: var(--info); }
.user-alert > i { font-size: 1rem; margin-top: 2px; flex-shrink: 0; }
.user-alert-title { font-weight: var(--fw-bold); color: #fff; margin-bottom: 2px; font-size: 0.78rem; }
.user-alert-text { color: rgba(255, 255, 255, 0.55); font-size: 0.72rem; }

.user-menu-actions { padding: 8px; }

.user-action {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 14px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.88);
  font-family: inherit;
  font-size: 0.86rem;
  font-weight: var(--fw-medium);
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.user-action > i {
  width: 18px;
  color: var(--accent-color);
  font-size: 0.9rem;
  transition: all var(--transition-fast);
}
.user-action > span:first-of-type { flex: 1; }
.user-action:hover { background: rgba(255, 255, 255, 0.06); }
.user-action:hover > i { color: var(--accent-color); transform: scale(1.1); }
.user-action.danger { color: #fca5a5; }
.user-action.danger > i { color: #ef4444; }
.user-action.danger:hover { background: rgba(239, 68, 68, 0.15); }

.user-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 6px 0;
}

.user-panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  font-size: 0.7rem;
}
.version-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: var(--radius-full);
  color: var(--accent-color);
  font-weight: var(--fw-bold);
  font-size: 0.65rem;
}
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: var(--fw-semibold);
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  animation: pulse-status 2s infinite;
}
@keyframes pulse-status {
  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

/* ============================================================
   TRANSICIONES
   ============================================================ */
.dropdown-enter-active, .dropdown-leave-active {
  transition: all 0.2s var(--ease-out);
}
.dropdown-enter-from, .dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (max-width: 1280px) {
  .search-container { width: 200px; }
  .user-details { display: none; }
  .user-btn { padding: 4px; }
}

@media (max-width: 992px) {
  .burger { display: flex; }

  .nav-menu {
    display: none;
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: rgba(15, 22, 38, 0.99);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    padding: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.4);
    max-height: calc(100vh - 80px);
    overflow-y: auto;
  }

  .nav-menu.nav-menu-open { display: flex; }

  .nav-list {
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    width: 100%;
  }

  .nav-dropdown { width: 100%; }

  .nav-item {
    justify-content: space-between;
    padding: 14px 16px;
    font-size: 0.95rem;
    border-radius: var(--radius-sm);
  }

  .nav-item.active { box-shadow: none; }

  .nav-caret { opacity: 1; }

  .dropdown-panel {
    position: static;
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

  .dropdown-link { padding: 10px 14px; font-size: 0.86rem; }
  .dropdown-link:hover { transform: none; }

  .nav-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .search-container { width: 100%; order: -1; }

  .user-btn {
    width: 100%;
    justify-content: center;
    padding: 12px 16px;
    border-radius: var(--radius-md);
  }
  .user-details { display: flex; }

  .user-panel {
    position: relative;
    top: 12px;
    right: 0;
    left: 0;
    min-width: 0;
    width: 100%;
  }
}

@media (max-width: 576px) {
  .brand-name { font-size: 0.95rem; }
  .brand-tag { display: none; }
  .navbar-inner { padding-top: 8px; padding-bottom: 8px; min-height: 58px; }
}
</style>