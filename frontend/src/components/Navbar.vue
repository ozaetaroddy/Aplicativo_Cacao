<template>
  <nav class="navbar navbar-expand-lg navbar-cacao" ref="navbar">
    <div class="container-fluid px-3">

      <!-- ===== BRAND ===== -->
      <router-link class="navbar-brand" to="/">
        <i class="fas fa-calculator"></i>
        <span class="brand-text">Sistema Contable</span>
        <span class="brand-version">v2.0</span>
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
        <span class="navbar-toggler-icon" style="filter: invert(1);"></span>
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
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.documentos }">
              <li v-if="puedeVerVentas"><router-link class="dropdown-item" to="/ventas" @click="cerrarTodo"><i class="fas fa-hand-holding-usd"></i> Bandeja de Ventas</router-link></li>
              <li v-if="puedeVerCompras"><router-link class="dropdown-item" to="/compras" @click="cerrarTodo"><i class="fas fa-inbox"></i> Bandeja de Compras</router-link></li>
              <li v-if="puedeCrearVentas || puedeVerCompras"><hr class="dropdown-divider"></li>
              <li v-if="puedeCrearVentas"><router-link class="dropdown-item" to="/ventas/nuevo?tipo=factura" @click="cerrarTodo"><i class="fas fa-plus-circle"></i> Nueva Factura</router-link></li>
              <li v-if="puedeCrearVentas"><router-link class="dropdown-item" to="/ventas/nuevo?tipo=guia_remision" @click="cerrarTodo"><i class="fas fa-truck"></i> Guía de Remisión</router-link></li>
              <li v-if="puedeCrearVentas"><router-link class="dropdown-item" to="/ventas/nuevo?tipo=exportacion" @click="cerrarTodo"><i class="fas fa-plane-departure"></i> Factura Exportación</router-link></li>
              <li v-if="puedeCrearVentas"><router-link class="dropdown-item" to="/ventas/nuevo?tipo=reembolso" @click="cerrarTodo"><i class="fas fa-undo"></i> Factura Reembolso</router-link></li>
              <li v-if="puedeCrearVentas"><router-link class="dropdown-item" to="/ventas/nuevo?tipo=retencion" @click="cerrarTodo"><i class="fas fa-percent"></i> Comprobante Retención</router-link></li>
              <li v-if="puedeCrearVentas"><router-link class="dropdown-item" to="/ventas/nuevo?tipo=liquidacion" @click="cerrarTodo"><i class="fas fa-file-signature"></i> Liquidación Compra</router-link></li>
              <li v-if="puedeCrearVentas"><hr class="dropdown-divider"></li>
              <li v-if="puedeCrearVentas"><router-link class="dropdown-item" to="/ventas/nuevo?tipo=nota_credito" @click="cerrarTodo"><i class="fas fa-minus-circle"></i> Nota de Crédito</router-link></li>
              <li v-if="puedeVerVentas || puedeVerCompras"><hr class="dropdown-divider"></li>
              <li><router-link class="dropdown-item" to="/consultar-documentos" @click="cerrarTodo"><i class="fas fa-search"></i> Consultar Documentos</router-link></li>
            </ul>
          </li>

          <!-- ===== BASE DE DATOS ===== -->
          <li v-if="puedeVerClientes || puedeVerProveedores || puedeVerProductos || puedeVerCategorias" class="nav-item dropdown" :class="{ show: dropdowns.maestros }">
            <a class="nav-link dropdown-toggle" href="#" role="button" @click.prevent="toggleDropdown('maestros')">
              <i class="fas fa-database"></i>
              <span class="nav-text">Base de datos</span>
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.maestros }">
              <li v-if="puedeVerProductos"><router-link class="dropdown-item" to="/productos" @click="cerrarTodo"><i class="fas fa-boxes"></i> Productos</router-link></li>
              <li v-if="puedeVerCategorias"><router-link class="dropdown-item" to="/categorias" @click="cerrarTodo"><i class="fas fa-tags"></i> Categorías</router-link></li>
              <li v-if="puedeVerClientes"><router-link class="dropdown-item" to="/clientes" @click="cerrarTodo"><i class="fas fa-users"></i> Clientes</router-link></li>
              <li v-if="puedeVerProveedores"><router-link class="dropdown-item" to="/proveedores" @click="cerrarTodo"><i class="fas fa-truck-loading"></i> Proveedores</router-link></li>
            </ul>
          </li>

          <!-- ===== INVENTARIOS ===== -->
          <li v-if="puedeVerInventario || puedeVerKardex" class="nav-item dropdown" :class="{ show: dropdowns.inventarios }">
            <a class="nav-link dropdown-toggle" href="#" role="button" @click.prevent="toggleDropdown('inventarios')">
              <i class="fas fa-warehouse"></i>
              <span class="nav-text">Inventarios</span>
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.inventarios }">
              <li v-if="puedeVerKardex"><router-link class="dropdown-item" to="/kardex" @click="cerrarTodo"><i class="fas fa-clipboard-list"></i> Kardex</router-link></li>
              <li v-if="puedeVerInventario"><router-link class="dropdown-item" to="/inventario/planificacion" @click="cerrarTodo"><i class="fas fa-calendar-alt"></i> Planificación</router-link></li>
              <li v-if="puedeVerInventario"><router-link class="dropdown-item" to="/inventario/stock" @click="cerrarTodo"><i class="fas fa-boxes"></i> Stock Actual</router-link></li>
              <li v-if="puedeVerInventario"><router-link class="dropdown-item" to="/inventario/conteo" @click="cerrarTodo"><i class="fas fa-clipboard-check"></i> Conteo Físico</router-link></li>
              <li v-if="puedeEditarInventario"><router-link class="dropdown-item" to="/inventario/ajustes" @click="cerrarTodo"><i class="fas fa-edit"></i> Ajustes</router-link></li>
              <li v-if="puedeVerInventario"><router-link class="dropdown-item" to="/inventario/valorizado" @click="cerrarTodo"><i class="fas fa-dollar-sign"></i> Valorizado</router-link></li>
            </ul>
          </li>

          <!-- ===== REPORTES ===== -->
          <li v-if="puedeVerReportes" class="nav-item dropdown" :class="{ show: dropdowns.reportes }">
            <a class="nav-link dropdown-toggle" href="#" role="button" @click.prevent="toggleDropdown('reportes')">
              <i class="fas fa-chart-bar"></i>
              <span class="nav-text">Reportes</span>
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.reportes }">
              <li><router-link class="dropdown-item" to="/reportes/ventas" @click="cerrarTodo"><i class="fas fa-arrow-up"></i> Ventas</router-link></li>
              <li><router-link class="dropdown-item" to="/reportes/compras" @click="cerrarTodo"><i class="fas fa-arrow-down"></i> Compras</router-link></li>
              <li><router-link class="dropdown-item" to="/reportes/mensual" @click="cerrarTodo"><i class="fas fa-file-invoice"></i> Reporte Mensual</router-link></li>
              <li><hr class="dropdown-divider"></li>
              <li><router-link class="dropdown-item" to="/reportes/estado-cuenta" @click="cerrarTodo"><i class="fas fa-file-invoice-dollar"></i> Estado de Cuenta</router-link></li>
              <li><router-link class="dropdown-item" to="/reportes/cartera" @click="cerrarTodo"><i class="fas fa-chart-pie"></i> Cartera General</router-link></li>
              <li><router-link class="dropdown-item" to="/reportes/estados-financieros" @click="cerrarTodo"><i class="fas fa-chart-line"></i> Estados Financieros</router-link></li>
              <li><hr class="dropdown-divider"></li>
              <li><router-link class="dropdown-item" to="/reportes/ats" @click="cerrarTodo"><i class="fas fa-file-export"></i> Anexo ATS</router-link></li>
              <li><router-link class="dropdown-item" to="/periodos-cerrados" @click="cerrarTodo"><i class="fas fa-lock"></i> Períodos Cerrados</router-link></li>
            </ul>
          </li>

          <!-- ===== RETENCIONES ===== -->
          <li v-if="puedeVerRetenciones" class="nav-item dropdown" :class="{ show: dropdowns.retenciones }">
            <a class="nav-link dropdown-toggle" href="#" role="button" @click.prevent="toggleDropdown('retenciones')">
              <i class="fas fa-percent"></i>
              <span class="nav-text">Retenciones</span>
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.retenciones }">
              <li><router-link class="dropdown-item" to="/retenciones" @click="cerrarTodo"><i class="fas fa-list"></i> Lista de Retenciones</router-link></li>
              <li v-if="puedeCrearRetenciones"><router-link class="dropdown-item" to="/retenciones/nuevo" @click="cerrarTodo"><i class="fas fa-plus"></i> Nueva Retención</router-link></li>
            </ul>
          </li>

          <!-- ===== ADMINISTRACIÓN ===== -->
          <li v-if="puedeVerAuditoria || puedeVerUsuarios" class="nav-item dropdown" :class="{ show: dropdowns.admin }">
            <a class="nav-link dropdown-toggle" href="#" role="button" @click.prevent="toggleDropdown('admin')">
              <i class="fas fa-cog"></i>
              <span class="nav-text">Administración</span>
              <!-- Badge de advertencia si certificado por vencer -->
              <span v-if="certificadoPorVencer" class="nav-badge-warning" title="Certificado próximo a vencer">
                <i class="fas fa-exclamation"></i>
              </span>
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.admin }">
              <li v-if="puedeVerUsuarios">
                <router-link class="dropdown-item" to="/configuracion-empresa" @click="cerrarTodo">
                  <i class="fas fa-building"></i> Configuración Empresa
                </router-link>
              </li>
              <li v-if="puedeVerUsuarios">
                <router-link class="dropdown-item" to="/certificado-firma" @click="cerrarTodo">
                  <i class="fas fa-shield-alt"></i> Certificado Firma
                  <span v-if="certificadoPorVencer" class="badge bg-warning text-dark ms-auto small">
                    {{ certificadoDiasRestantes }}d
                  </span>
                </router-link>
              </li>
              <li v-if="puedeVerUsuarios"><router-link class="dropdown-item" to="/usuarios" @click="cerrarTodo"><i class="fas fa-user-cog"></i> Usuarios</router-link></li>
              <li v-if="puedeVerAuditoria"><router-link class="dropdown-item" to="/auditoria" @click="cerrarTodo"><i class="fas fa-history"></i> Auditoría</router-link></li>
              <li v-if="puedeVerUsuarios"><router-link class="dropdown-item" to="/backups" @click="cerrarTodo"><i class="fas fa-database"></i> Backups</router-link></li>
            </ul>
          </li>
        </ul>

        <!-- ===== BARRA DE BÚSQUEDA Y USUARIO ===== -->
        <div class="nav-user-controls d-flex align-items-center gap-2 flex-wrap">
          <SearchBar class="search-bar-nav" ref="searchBar" />
          <ThemeToggle />

          <!-- Botón de usuario -->
          <div class="dropdown user-dropdown" ref="userDropdown" :class="{ show: userMenuOpen }">
            <button class="user-btn dropdown-toggle" @click="toggleUserMenu">
              <div class="user-avatar-small">{{ getInitials(user?.nombre) }}</div>
              <span class="user-name">{{ user?.nombre || 'Usuario' }}</span>
              <span v-if="user?.rol" class="user-rol-badge">{{ user.rol }}</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end user-menu" :class="{ show: userMenuOpen }">
              <li class="user-menu-header">
                <div class="user-avatar-large">{{ getInitials(user?.nombre) }}</div>
                <div>
                  <div class="fw-bold">{{ user?.nombre || 'Usuario' }}</div>
                  <div class="small text-muted">{{ user?.email }}</div>
                  <span v-if="user?.rol" class="badge-rol-small" :class="`badge-rol-${user.rol}`">{{ user.rol }}</span>
                </div>
              </li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item" href="#" @click.prevent="irPerfil"><i class="fas fa-id-card"></i> Mi Perfil</a></li>
              <li v-if="puedeVerUsuarios"><a class="dropdown-item" href="#" @click.prevent="irConfigEmpresa"><i class="fas fa-building"></i> Configuración Empresa</a></li>
              <li v-if="puedeVerUsuarios">
                <a class="dropdown-item" href="#" @click.prevent="irCertificado">
                  <i class="fas fa-shield-alt"></i> Certificado Firma
                  <span v-if="certificadoPorVencer" class="badge bg-warning text-dark ms-auto small">
                    ⚠
                  </span>
                </a>
              </li>
              <li v-if="puedeVerUsuarios"><a class="dropdown-item" href="#" @click.prevent="irUsuarios"><i class="fas fa-user-cog"></i> Gestionar Usuarios</a></li>
              <li v-if="puedeVerAuditoria"><a class="dropdown-item" href="#" @click.prevent="irAuditoria"><i class="fas fa-history"></i> Auditoría</a></li>
              <li v-if="puedeVerUsuarios"><a class="dropdown-item" href="#" @click.prevent="irBackups"><i class="fas fa-database"></i> Backups</a></li>
              <li><hr class="dropdown-divider"></li>
              <li>
                <a class="dropdown-item text-muted small" href="#" @click.prevent>
                  <i class="fas fa-info-circle"></i>
                  Sistema Contable v2.0
                </a>
              </li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger" href="#" @click.prevent="cerrarSesion"><i class="fas fa-sign-out-alt"></i> Cerrar Sesión</a></li>
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
const certificadoPorVencer = computed(() => {
  return certificadoInfo.value?.cargado && certificadoInfo.value?.por_vencer
})
const certificadoDiasRestantes = computed(() => {
  return certificadoInfo.value?.dias_restantes || 0
})

const cargarInfoCertificado = async () => {
  if (!puedeVerUsuarios.value) return
  try {
    certificadoInfo.value = await api.request('/certificado/info', { method: 'GET' })
  } catch (e) {
    // Silencioso: el certificado puede no estar configurado aún
  }
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
}

const toggleUserMenu = () => {
  userMenuOpen.value = !userMenuOpen.value
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
  // Ctrl + K para enfocar el buscador
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    if (searchBar.value && searchBar.value.$el) {
      const input = searchBar.value.$el.querySelector('.search-input')
      if (input) input.focus()
    }
  }
  // Esc cierra todo
  if (e.key === 'Escape') {
    cerrarTodo()
  }
}

// ===== NAVEGACIÓN =====
const irPerfil = () => { cerrarTodo(); router.push('/mi-perfil') }
const irAuditoria = () => { cerrarTodo(); router.push('/auditoria') }
const irUsuarios = () => { cerrarTodo(); router.push('/usuarios') }
const irBackups = () => { cerrarTodo(); router.push('/backups') }
const irConfigEmpresa = () => { cerrarTodo(); router.push('/configuracion-empresa') }
const irCertificado = () => { cerrarTodo(); router.push('/certificado-firma') }
const cerrarSesion = () => { cerrarTodo(); logout() }

// ===== HELPERS =====
const getInitials = (nombre) => {
  if (!nombre) return '?'
  return nombre.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

// ===== CICLO DE VIDA =====
onMounted(async () => {
  try { await cargarPermisos() } catch (e) { console.warn(e) }
  await cargarInfoCertificado()
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeyboard)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeyboard)
})
</script>

<style scoped>
/* ============================================
   NAVBAR BASE
   ============================================ */
.navbar-cacao {
  padding: 10px 0;
}

/* ===== BRAND ===== */
.navbar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff !important;
  padding: 6px 12px;
  border-radius: 10px;
  transition: all 0.25s ease;
  margin-right: 20px;
}
.navbar-brand:hover {
  background: rgba(255,255,255,0.08);
}
.navbar-brand i {
  font-size: 1.5rem;
  color: var(--accent-color);
}
.brand-text {
  letter-spacing: 0.3px;
}
.brand-version {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 10px;
  background: rgba(241,196,15,0.2);
  color: var(--accent-color);
  font-weight: 700;
  letter-spacing: 0.5px;
  margin-left: 4px;
}

/* ===== NAV LINKS ===== */
.navbar-cacao .navbar-nav .nav-item {
  margin: 0 2px;
}
.navbar-cacao .nav-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px !important;
  border-radius: 30px;
  color: rgba(255,255,255,0.9) !important;
  font-weight: 500;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  white-space: nowrap;
  position: relative;
}
.navbar-cacao .nav-link i {
  font-size: 0.95rem;
  opacity: 0.9;
}
.navbar-cacao .nav-link:hover {
  background: rgba(255,255,255,0.1);
  color: #fff !important;
}
.navbar-cacao .nav-link.active {
  background: var(--primary-color);
  color: #fff !important;
  box-shadow: 0 2px 10px rgba(52,152,219,0.4);
}
.navbar-cacao .nav-link.active::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  width: 20px;
  height: 2px;
  background: var(--accent-color);
  border-radius: 2px;
  transform: translateX(-50%);
}

/* ===== BADGE DE ADVERTENCIA ===== */
.nav-badge-warning {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #f39c12;
  color: #fff;
  font-size: 0.6rem;
  margin-left: 4px;
  animation: pulse-warning 2s infinite;
}
@keyframes pulse-warning {
  0%, 100% { box-shadow: 0 0 0 0 rgba(243,156,18,0.7); }
  50% { box-shadow: 0 0 0 6px rgba(243,156,18,0); }
}

/* ===== DROPDOWNS ===== */
.navbar-cacao .dropdown-menu {
  background: #2c3e50;
  border: none;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.25);
  padding: 8px;
  margin-top: 8px;
}
.navbar-cacao .dropdown-item {
  color: rgba(255,255,255,0.9) !important;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.88rem;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 10px;
}
.navbar-cacao .dropdown-item i {
  width: 16px;
  opacity: 0.9;
  color: var(--accent-color);
}
.navbar-cacao .dropdown-item:hover {
  background: var(--primary-color);
  color: #fff !important;
  transform: translateX(3px);
}
.navbar-cacao .dropdown-item:hover i {
  color: #fff;
}
.navbar-cacao .dropdown-divider {
  border-color: rgba(255,255,255,0.1);
  margin: 6px 4px;
}

/* ===== CONTROLES DERECHA ===== */
.nav-user-controls {
  gap: 10px;
}
.search-bar-nav {
  max-width: 260px;
}

/* ===== BOTÓN DE USUARIO ===== */
.user-dropdown {
  position: relative;
}
.user-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  color: #fff;
  padding: 5px 12px 5px 5px;
  border-radius: 50px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: default;
  transition: all 0.25s ease;
  max-width: 220px;
}
.user-btn:hover {
  background: rgba(255,255,255,0.15);
  border-color: rgba(255,255,255,0.25);
}
.user-avatar-small {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.75rem;
  color: #fff;
  flex-shrink: 0;
}
.user-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 110px;
}
.user-rol-badge {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 20px;
  background: rgba(241,196,15,0.2);
  color: var(--accent-color);
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.3px;
}

/* ===== MENÚ DE USUARIO ===== */
.user-menu {
  min-width: 280px;
}
.user-menu-header {
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  align-items: flex-start;
}
.user-avatar-large {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
  color: #fff;
  flex-shrink: 0;
}
.badge-rol-small {
  display: inline-block;
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 700;
  text-transform: uppercase;
  margin-top: 4px;
  letter-spacing: 0.3px;
}
.badge-rol-admin { background: rgba(231,76,60,0.2); color: #ff7b6b; }
.badge-rol-contador { background: rgba(52,152,219,0.2); color: #63b4e0; }
.badge-rol-vendedor { background: rgba(39,174,96,0.2); color: #58d68d; }
.badge-rol-bodeguero { background: rgba(243,156,18,0.2); color: #f7b731; }
.badge-rol-auditor { background: rgba(155,89,182,0.2); color: #c39bd3; }

/* ============================================
   RESPONSIVE
   ============================================ */

/* Tablets y pantallas medianas */
@media (max-width: 1200px) {
  .nav-text { display: none; }
  .navbar-cacao .nav-link { padding: 8px 12px !important; }
  .user-name { display: none; }
  .user-rol-badge { display: none; }
  .search-bar-nav { max-width: 180px; }
}

/* Móvil */
@media (max-width: 992px) {
  .navbar-cacao .navbar-collapse {
    max-height: 80vh;
    overflow-y: auto;
    background: var(--bg-navbar);
    padding: 12px;
    border-radius: 12px;
    margin-top: 10px;
  }
  .navbar-cacao .navbar-nav { width: 100%; }
  .nav-text { display: inline !important; }

  .navbar-cacao .nav-item {
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .navbar-cacao .nav-item:last-child {
    border-bottom: none;
  }

  .navbar-cacao .nav-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px !important;
    border-radius: 8px;
    font-size: 0.95rem;
  }
  .navbar-cacao .nav-link.active::after { display: none; }

  .navbar-cacao .dropdown-menu {
    position: static !important;
    float: none !important;
    width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    display: none !important;
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease;
  }
  .navbar-cacao .dropdown-menu.show {
    display: block !important;
    max-height: 800px;
    padding: 6px 0 10px 20px !important;
    border-left: 2px solid var(--primary-color) !important;
    margin-left: 16px !important;
  }
  .navbar-cacao .dropdown-item {
    color: rgba(255,255,255,0.75) !important;
    padding: 10px 14px !important;
    font-size: 0.85rem !important;
  }
  .navbar-cacao .dropdown-item:hover {
    background: rgba(255,255,255,0.08) !important;
  }
  .navbar-cacao .dropdown-item i {
    color: var(--accent-color);
  }

  .nav-user-controls {
    flex-direction: column;
    align-items: stretch !important;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(255,255,255,0.1);
    width: 100%;
  }
  .search-bar-nav { max-width: 100%; }
  .user-btn { width: 100%; justify-content: center; }
  .user-name { display: inline !important; }
  .user-rol-badge { display: inline-block !important; }
}

/* Móviles pequeños */
@media (max-width: 576px) {
  .navbar-brand { font-size: 1rem; }
  .navbar-brand i { font-size: 1.2rem; }
  .brand-version { font-size: 0.55rem; }
  .navbar-cacao .nav-link { font-size: 0.9rem; }
}

/* ============================================
   MODO OSCURO
   ============================================ */
body.dark-mode .navbar-cacao .navbar-collapse {
  background: #1a1a2e;
}
body.dark-mode .navbar-cacao .dropdown-menu {
  background: #1e2a4a;
}
body.dark-mode .navbar-cacao .user-btn {
  background: rgba(255,255,255,0.05);
}
body.dark-mode .navbar-cacao .nav-item {
  border-bottom-color: rgba(255,255,255,0.05);
}
</style>