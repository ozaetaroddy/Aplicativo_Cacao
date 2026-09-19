<template>
  <nav
    ref="navbar"
    class="navbar-app"
    :class="{ 'navbar-scrolled': scrolled }"
    aria-label="Navegación principal"
  >
    <div class="navbar-inner">
      <!-- ==================================================
           ZONA IZQUIERDA: BRAND + MENÚ
           ================================================== -->
      <div class="navbar-left">
        <!-- BRAND -->
        <router-link
          class="brand"
          to="/"
          @click="cerrarTodo"
          data-tour="brand"
          aria-label="Ir al inicio"
        >
          <div class="brand-logo" aria-hidden="true">
            <i class="fas fa-calculator"></i>
          </div>
          <div class="brand-text">
            <span class="brand-name">Sistema Contable</span>
            <span class="brand-tag">v3.0</span>
          </div>
        </router-link>

        <!-- MENÚ DESKTOP -->
        <ul class="nav-list" role="menubar">
          <!-- INICIO -->
          <li>
            <router-link
              class="nav-item"
              to="/"
              exact-active-class="active"
              @click="cerrarTodo"
            >
              <i class="fas fa-home" aria-hidden="true"></i>
              <span>Inicio</span>
            </router-link>
          </li>

          <!-- DOCUMENTOS -->
          <li
            v-if="puedeVerVentas || puedeVerCompras"
            class="nav-dropdown"
            :class="{ open: dropdowns.documentos }"
            data-tour="documentos"
          >
            <button
              type="button"
              class="nav-item"
              :class="{ active: rutaActiva(['/ventas', '/compras', '/consultar-documentos']) }"
              @click.stop="toggleDropdown('documentos', $event)"
              :aria-expanded="dropdowns.documentos ? 'true' : 'false'"
              aria-haspopup="true"
            >
              <i class="fas fa-file-invoice" aria-hidden="true"></i>
              <span>Documentos</span>
              <i class="fas fa-chevron-down nav-caret" aria-hidden="true"></i>
            </button>
            <transition name="dropdown">
              <ul v-if="dropdowns.documentos" class="dropdown-panel">
                <li class="dropdown-section">Bandejas</li>
                <li v-if="puedeVerVentas">
                  <router-link class="dropdown-link" to="/ventas" @click="cerrarTodo">
                    <i class="fas fa-hand-holding-usd" aria-hidden="true"></i>
                    <span>Bandeja de Ventas</span>
                  </router-link>
                </li>

                <!-- 🆕 RETENCIONES EMITIDAS (filtro dentro de Ventas) -->
                <li v-if="puedeVerVentas">
                  <router-link
                    class="dropdown-link"
                    :to="{ path: '/ventas', query: { tipo_documento: 'retencion' } }"
                    @click="cerrarTodo"
                  >
                    <i class="fas fa-percent" aria-hidden="true"></i>
                    <span>Retenciones emitidas</span>
                  </router-link>
                </li>

                <li v-if="puedeVerCompras">
                  <router-link class="dropdown-link" to="/compras" @click="cerrarTodo">
                    <i class="fas fa-inbox" aria-hidden="true"></i>
                    <span>Bandeja de Compras</span>
                  </router-link>
                </li>

                <template v-if="puedeCrearVentas || puedeCrearCompras">
                  <li class="dropdown-section">Crear documento</li>

                  <li v-if="puedeCrearVentas">
                    <router-link
                      class="dropdown-link"
                      to="/ventas/nuevo?tipo=factura"
                      @click="cerrarTodo"
                    >
                      <i class="fas fa-file-invoice" aria-hidden="true"></i>
                      <span>Nueva Factura</span>
                      <span class="shortcut">01</span>
                    </router-link>
                  </li>

                  <li v-if="puedeCrearCompras">
                    <router-link
                      class="dropdown-link highlight-compra"
                      to="/compras/nuevo"
                      @click="cerrarTodo"
                    >
                      <i class="fas fa-shopping-cart" aria-hidden="true"></i>
                      <span>Nueva Compra</span>
                      <span class="shortcut">C</span>
                    </router-link>
                  </li>

                  <li v-if="puedeCrearVentas">
                    <router-link
                      class="dropdown-link"
                      to="/ventas/nuevo?tipo=guia_remision"
                      @click="cerrarTodo"
                    >
                      <i class="fas fa-truck" aria-hidden="true"></i>
                      <span>Guía de Remisión</span>
                      <span class="shortcut">06</span>
                    </router-link>
                  </li>
                  <li v-if="puedeCrearVentas">
                    <router-link
                      class="dropdown-link"
                      to="/ventas/nuevo?tipo=nota_credito"
                      @click="cerrarTodo"
                    >
                      <i class="fas fa-minus-circle" aria-hidden="true"></i>
                      <span>Nota de Crédito</span>
                      <span class="shortcut">04</span>
                    </router-link>
                  </li>
                  <li v-if="puedeCrearVentas">
                    <router-link
                      class="dropdown-link"
                      to="/ventas/nuevo?tipo=retencion"
                      @click="cerrarTodo"
                    >
                      <i class="fas fa-percent" aria-hidden="true"></i>
                      <span>Retención</span>
                      <span class="shortcut">07</span>
                    </router-link>
                  </li>
                </template>

                <li class="dropdown-divider" aria-hidden="true"></li>
                <li>
                  <router-link
                    class="dropdown-link"
                    to="/consultar-documentos"
                    @click="cerrarTodo"
                  >
                    <i class="fas fa-search" aria-hidden="true"></i>
                    <span>Consultar Documentos</span>
                  </router-link>
                </li>
              </ul>
            </transition>
          </li>

          <!-- BASE DE DATOS -->
          <li
            v-if="puedeVerClientes || puedeVerProveedores || puedeVerProductos || puedeVerCategorias"
            class="nav-dropdown"
            :class="{ open: dropdowns.maestros }"
          >
            <button
              type="button"
              class="nav-item"
              :class="{ active: rutaActiva(['/productos', '/categorias', '/clientes', '/proveedores']) }"
              @click.stop="toggleDropdown('maestros', $event)"
              :aria-expanded="dropdowns.maestros ? 'true' : 'false'"
              aria-haspopup="true"
            >
              <i class="fas fa-database" aria-hidden="true"></i>
              <span>Base de datos</span>
              <i class="fas fa-chevron-down nav-caret" aria-hidden="true"></i>
            </button>
            <transition name="dropdown">
              <ul v-if="dropdowns.maestros" class="dropdown-panel">
                <li v-if="puedeVerProductos">
                  <router-link class="dropdown-link" to="/productos" @click="cerrarTodo">
                    <i class="fas fa-boxes" aria-hidden="true"></i>
                    <span>Productos</span>
                  </router-link>
                </li>
                <li v-if="puedeVerCategorias">
                  <router-link class="dropdown-link" to="/categorias" @click="cerrarTodo">
                    <i class="fas fa-tags" aria-hidden="true"></i>
                    <span>Categorías</span>
                  </router-link>
                </li>
                <li v-if="puedeVerClientes">
                  <router-link class="dropdown-link" to="/clientes" @click="cerrarTodo">
                    <i class="fas fa-users" aria-hidden="true"></i>
                    <span>Clientes</span>
                  </router-link>
                </li>
                <li v-if="puedeVerProveedores">
                  <router-link class="dropdown-link" to="/proveedores" @click="cerrarTodo">
                    <i class="fas fa-truck-loading" aria-hidden="true"></i>
                    <span>Proveedores</span>
                  </router-link>
                </li>
              </ul>
            </transition>
          </li>

          <!-- INVENTARIO -->
          <li
            v-if="puedeVerInventario || puedeVerKardex"
            class="nav-dropdown"
            :class="{ open: dropdowns.inventarios }"
          >
            <button
              type="button"
              class="nav-item"
              :class="{ active: rutaActiva(['/kardex', '/inventario']) }"
              @click.stop="toggleDropdown('inventarios', $event)"
              :aria-expanded="dropdowns.inventarios ? 'true' : 'false'"
              aria-haspopup="true"
            >
              <i class="fas fa-warehouse" aria-hidden="true"></i>
              <span>Inventario</span>
              <i class="fas fa-chevron-down nav-caret" aria-hidden="true"></i>
            </button>
            <transition name="dropdown">
              <ul v-if="dropdowns.inventarios" class="dropdown-panel">
                <li v-if="puedeVerKardex">
                  <router-link class="dropdown-link" to="/kardex" @click="cerrarTodo">
                    <i class="fas fa-clipboard-list" aria-hidden="true"></i>
                    <span>Kardex</span>
                  </router-link>
                </li>
                <li v-if="puedeVerInventario">
                  <router-link class="dropdown-link" to="/inventario/stock" @click="cerrarTodo">
                    <i class="fas fa-boxes" aria-hidden="true"></i>
                    <span>Stock actual</span>
                  </router-link>
                </li>
                <li v-if="puedeVerInventario">
                  <router-link class="dropdown-link" to="/inventario/valorizado" @click="cerrarTodo">
                    <i class="fas fa-dollar-sign" aria-hidden="true"></i>
                    <span>Valorizado</span>
                  </router-link>
                </li>
                <li v-if="puedeVerInventario">
                  <router-link class="dropdown-link" to="/inventario/conteo" @click="cerrarTodo">
                    <i class="fas fa-clipboard-check" aria-hidden="true"></i>
                    <span>Conteo físico</span>
                  </router-link>
                </li>
                <li v-if="puedeEditarInventario">
                  <router-link class="dropdown-link" to="/inventario/ajustes" @click="cerrarTodo">
                    <i class="fas fa-edit" aria-hidden="true"></i>
                    <span>Ajustes</span>
                  </router-link>
                </li>
              </ul>
            </transition>
          </li>

          <!-- REPORTES -->
          <li
            v-if="puedeVerReportes"
            class="nav-dropdown"
            :class="{ open: dropdowns.reportes }"
          >
            <button
              type="button"
              class="nav-item"
              :class="{ active: rutaActiva(['/reportes', '/periodos-cerrados']) }"
              @click.stop="toggleDropdown('reportes', $event)"
              :aria-expanded="dropdowns.reportes ? 'true' : 'false'"
              aria-haspopup="true"
            >
              <i class="fas fa-chart-bar" aria-hidden="true"></i>
              <span>Reportes</span>
              <i class="fas fa-chevron-down nav-caret" aria-hidden="true"></i>
            </button>
            <transition name="dropdown">
              <ul v-if="dropdowns.reportes" class="dropdown-panel dropdown-panel-wide">
                <li class="dropdown-section">Análisis</li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/ventas" @click="cerrarTodo">
                    <i class="fas fa-arrow-up" aria-hidden="true"></i>
                    <span>Ventas</span>
                  </router-link>
                </li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/compras" @click="cerrarTodo">
                    <i class="fas fa-arrow-down" aria-hidden="true"></i>
                    <span>Compras</span>
                  </router-link>
                </li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/mensual" @click="cerrarTodo">
                    <i class="fas fa-calendar-alt" aria-hidden="true"></i>
                    <span>Reporte mensual</span>
                  </router-link>
                </li>

                <li class="dropdown-section">Contabilidad</li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/estado-cuenta" @click="cerrarTodo">
                    <i class="fas fa-file-invoice-dollar" aria-hidden="true"></i>
                    <span>Estado de cuenta</span>
                  </router-link>
                </li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/cartera" @click="cerrarTodo">
                    <i class="fas fa-chart-pie" aria-hidden="true"></i>
                    <span>Cartera general</span>
                  </router-link>
                </li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/estados-financieros" @click="cerrarTodo">
                    <i class="fas fa-chart-line" aria-hidden="true"></i>
                    <span>Estados financieros</span>
                  </router-link>
                </li>

                <li class="dropdown-section">SRI</li>
                <li>
                  <router-link class="dropdown-link" to="/reportes/ats" @click="cerrarTodo">
                    <i class="fas fa-file-export" aria-hidden="true"></i>
                    <span>Anexo ATS</span>
                  </router-link>
                </li>
                <li>
                  <router-link class="dropdown-link" to="/periodos-cerrados" @click="cerrarTodo">
                    <i class="fas fa-lock" aria-hidden="true"></i>
                    <span>Períodos cerrados</span>
                  </router-link>
                </li>
              </ul>
            </transition>
          </li>

          <!-- ADMIN -->
          <li
            v-if="puedeVerUsuarios || puedeVerAuditoria"
            class="nav-dropdown"
            :class="{ open: dropdowns.admin }"
          >
            <button
              type="button"
              class="nav-item"
              :class="{ active: rutaActiva(['/diagnostico', '/configuracion-empresa', '/certificado-firma', '/envio-sri', '/usuarios', '/auditoria', '/backups']) }"
              @click.stop="toggleDropdown('admin', $event)"
              :aria-expanded="dropdowns.admin ? 'true' : 'false'"
              aria-haspopup="true"
            >
              <i class="fas fa-cog" aria-hidden="true"></i>
              <span>Admin</span>
              <i class="fas fa-chevron-down nav-caret" aria-hidden="true"></i>
              <span
                v-if="certificadoPorVencer"
                class="nav-alert-dot warning"
                :title="`Certificado vence en ${certificadoDiasRestantes} días`"
              ></span>
              <span
                v-else-if="documentosFirmados > 0"
                class="nav-alert-dot info"
                :title="`${documentosFirmados} docs pendientes SRI`"
              ></span>
            </button>
            <transition name="dropdown">
              <ul v-if="dropdowns.admin" class="dropdown-panel dropdown-panel-right">
                <li v-if="puedeVerUsuarios">
                  <router-link class="dropdown-link" to="/diagnostico" @click="cerrarTodo">
                    <i class="fas fa-stethoscope" aria-hidden="true"></i>
                    <span>Diagnóstico</span>
                  </router-link>
                </li>
                <li v-if="puedeVerUsuarios" class="dropdown-section">Configuración</li>
                <li v-if="puedeVerUsuarios">
                  <router-link class="dropdown-link" to="/configuracion-empresa" @click="cerrarTodo">
                    <i class="fas fa-building" aria-hidden="true"></i>
                    <span>Empresa</span>
                  </router-link>
                </li>
                <li v-if="puedeVerUsuarios">
                  <router-link class="dropdown-link" to="/certificado-firma" @click="cerrarTodo">
                    <i class="fas fa-shield-alt" aria-hidden="true"></i>
                    <span>Certificado</span>
                    <span v-if="certificadoPorVencer" class="badge-mini warning">
                      {{ certificadoDiasRestantes }}d
                    </span>
                  </router-link>
                </li>
                <li v-if="puedeVerUsuarios">
                  <router-link class="dropdown-link" to="/envio-sri" @click="cerrarTodo">
                    <i class="fas fa-cloud-upload-alt" aria-hidden="true"></i>
                    <span>Envío al SRI</span>
                    <span v-if="documentosFirmados > 0" class="badge-mini info">
                      {{ documentosFirmados }}
                    </span>
                  </router-link>
                </li>
                <li v-if="puedeVerUsuarios" class="dropdown-section">Seguridad</li>
                <li v-if="puedeVerUsuarios">
                  <router-link class="dropdown-link" to="/usuarios" @click="cerrarTodo">
                    <i class="fas fa-user-cog" aria-hidden="true"></i>
                    <span>Usuarios</span>
                  </router-link>
                </li>
                <li v-if="puedeVerAuditoria">
                  <router-link class="dropdown-link" to="/auditoria" @click="cerrarTodo">
                    <i class="fas fa-history" aria-hidden="true"></i>
                    <span>Auditoría</span>
                  </router-link>
                </li>
                <li v-if="puedeVerUsuarios">
                  <router-link class="dropdown-link" to="/backups" @click="cerrarTodo">
                    <i class="fas fa-database" aria-hidden="true"></i>
                    <span>Backups</span>
                  </router-link>
                </li>
              </ul>
            </transition>
          </li>
        </ul>
      </div>

      <!-- ==================================================
           ZONA DERECHA: SEARCH + THEME + USER
           ================================================== -->
      <div class="navbar-right">
        <div class="search-container" data-tour="search">
          <SearchBar ref="searchBar" />
        </div>

        <ThemeToggle />

        <!-- USER MENU -->
        <div class="user-wrapper" data-tour="user-menu">
          <button
            type="button"
            class="user-btn"
            @click.stop="toggleUserMenu"
            :aria-expanded="userMenuOpen ? 'true' : 'false'"
            aria-haspopup="true"
            :title="user?.nombre || 'Usuario'"
          >
            <div class="user-avatar" :data-rol="user?.rol" aria-hidden="true">
              {{ getInitials(user?.nombre) }}
            </div>
            <span class="user-name">
              {{ (user?.nombre || 'Usuario').split(' ')[0] }}
            </span>
            <i
              class="fas fa-chevron-down user-caret"
              :class="{ rotated: userMenuOpen }"
              aria-hidden="true"
            ></i>
          </button>

          <transition name="dropdown">
            <div v-if="userMenuOpen" class="user-panel" @click.stop>
              <!-- Header -->
              <div class="user-panel-header">
                <div class="user-avatar-lg" :data-rol="user?.rol" aria-hidden="true">
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
                <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
                <div>
                  <div class="user-alert-title">Certificado por vencer</div>
                  <div class="user-alert-text">Vence en {{ certificadoDiasRestantes }} días</div>
                </div>
              </div>
              <div v-if="documentosFirmados > 0" class="user-alert info">
                <i class="fas fa-cloud-upload-alt" aria-hidden="true"></i>
                <div>
                  <div class="user-alert-title">Documentos pendientes</div>
                  <div class="user-alert-text">{{ documentosFirmados }} sin enviar al SRI</div>
                </div>
              </div>

              <!-- Acciones -->
              <div class="user-menu-actions">
                <button type="button" class="user-action" @click="irPerfil">
                  <i class="fas fa-id-card" aria-hidden="true"></i>
                  <span>Mi perfil</span>
                </button>
                <button v-if="puedeVerUsuarios" type="button" class="user-action" @click="irConfigEmpresa">
                  <i class="fas fa-building" aria-hidden="true"></i>
                  <span>Configuración empresa</span>
                </button>
                <button v-if="puedeVerUsuarios" type="button" class="user-action" @click="irCertificado">
                  <i class="fas fa-shield-alt" aria-hidden="true"></i>
                  <span>Certificado firma</span>
                  <span v-if="certificadoPorVencer" class="badge-mini warning">⚠</span>
                </button>
                <button v-if="puedeVerUsuarios" type="button" class="user-action" @click="irEnvioSri">
                  <i class="fas fa-cloud-upload-alt" aria-hidden="true"></i>
                  <span>Envío al SRI</span>
                  <span v-if="documentosFirmados > 0" class="badge-mini info">
                    {{ documentosFirmados }}
                  </span>
                </button>

                <div class="user-divider" aria-hidden="true"></div>

                <button type="button" class="user-action" @click="reiniciarTour">
                  <i class="fas fa-question-circle" aria-hidden="true"></i>
                  <span>Ver tour de nuevo</span>
                </button>
              </div>

              <!-- Footer -->
              <div class="user-panel-footer">
                <div class="version-tag">
                  <i class="fas fa-code-branch" aria-hidden="true"></i>
                  v3.0
                </div>
                <div class="status-indicator">
                  <span class="status-dot" aria-hidden="true"></span>
                  En línea
                </div>
              </div>

              <div class="user-divider" aria-hidden="true"></div>

              <button type="button" class="user-action danger" @click="cerrarSesion">
                <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
                <span>Cerrar sesión</span>
              </button>
            </div>
          </transition>
        </div>
      </div>

      <!-- ==================================================
           BURGER MÓVIL
           ================================================== -->
      <button
        class="burger"
        type="button"
        @click="toggleNavbar"
        :aria-expanded="navbarAbierto ? 'true' : 'false'"
        aria-label="Abrir menú"
        aria-controls="main-nav-menu-mobile"
      >
        <span class="burger-line" :class="{ open: navbarAbierto }"></span>
        <span class="burger-line" :class="{ open: navbarAbierto }"></span>
        <span class="burger-line" :class="{ open: navbarAbierto }"></span>
      </button>
    </div>

    <!-- ==================================================
         MENÚ MÓVIL (drawer)
         ================================================== -->
    <transition name="mobile-drawer">
      <div
        v-if="navbarAbierto"
        id="main-nav-menu-mobile"
        class="mobile-menu"
        role="menu"
      >
        <ul class="mobile-nav-list">
          <li>
            <router-link class="mobile-nav-item" to="/" @click="cerrarTodo">
              <i class="fas fa-home" aria-hidden="true"></i>
              <span>Inicio</span>
            </router-link>
          </li>

          <li v-if="puedeVerVentas || puedeVerCompras">
            <button
              type="button"
              class="mobile-nav-item"
              :class="{ open: dropdowns.documentos }"
              @click.stop="toggleDropdown('documentos', $event)"
            >
              <i class="fas fa-file-invoice" aria-hidden="true"></i>
              <span>Documentos</span>
              <i class="fas fa-chevron-down mobile-caret" aria-hidden="true"></i>
            </button>
            <ul v-if="dropdowns.documentos" class="mobile-submenu">
              <li v-if="puedeVerVentas">
                <router-link class="mobile-subitem" to="/ventas" @click="cerrarTodo">
                  Bandeja de Ventas
                </router-link>
              </li>

              <!-- 🆕 RETENCIONES EMITIDAS -->
              <li v-if="puedeVerVentas">
                <router-link
                  class="mobile-subitem"
                  :to="{ path: '/ventas', query: { tipo_documento: 'retencion' } }"
                  @click="cerrarTodo"
                >
                  Retenciones emitidas
                </router-link>
              </li>

              <li v-if="puedeVerCompras">
                <router-link class="mobile-subitem" to="/compras" @click="cerrarTodo">
                  Bandeja de Compras
                </router-link>
              </li>
              <li v-if="puedeCrearVentas">
                <router-link class="mobile-subitem" to="/ventas/nuevo?tipo=factura" @click="cerrarTodo">
                  Nueva Factura
                </router-link>
              </li>

              <li v-if="puedeCrearCompras">
                <router-link class="mobile-subitem mobile-subitem-highlight" to="/compras/nuevo" @click="cerrarTodo">
                  Nueva Compra
                </router-link>
              </li>

              <li v-if="puedeCrearVentas">
                <router-link class="mobile-subitem" to="/ventas/nuevo?tipo=guia_remision" @click="cerrarTodo">
                  Guía de Remisión
                </router-link>
              </li>
              <li v-if="puedeCrearVentas">
                <router-link class="mobile-subitem" to="/ventas/nuevo?tipo=nota_credito" @click="cerrarTodo">
                  Nota de Crédito
                </router-link>
              </li>
              <li>
                <router-link class="mobile-subitem" to="/consultar-documentos" @click="cerrarTodo">
                  Consultar Documentos
                </router-link>
              </li>
            </ul>
          </li>

          <li v-if="puedeVerProductos || puedeVerClientes || puedeVerProveedores">
            <button
              type="button"
              class="mobile-nav-item"
              :class="{ open: dropdowns.maestros }"
              @click.stop="toggleDropdown('maestros', $event)"
            >
              <i class="fas fa-database" aria-hidden="true"></i>
              <span>Base de datos</span>
              <i class="fas fa-chevron-down mobile-caret" aria-hidden="true"></i>
            </button>
            <ul v-if="dropdowns.maestros" class="mobile-submenu">
              <li v-if="puedeVerProductos">
                <router-link class="mobile-subitem" to="/productos" @click="cerrarTodo">Productos</router-link>
              </li>
              <li v-if="puedeVerCategorias">
                <router-link class="mobile-subitem" to="/categorias" @click="cerrarTodo">Categorías</router-link>
              </li>
              <li v-if="puedeVerClientes">
                <router-link class="mobile-subitem" to="/clientes" @click="cerrarTodo">Clientes</router-link>
              </li>
              <li v-if="puedeVerProveedores">
                <router-link class="mobile-subitem" to="/proveedores" @click="cerrarTodo">Proveedores</router-link>
              </li>
            </ul>
          </li>

          <li v-if="puedeVerInventario || puedeVerKardex">
            <button
              type="button"
              class="mobile-nav-item"
              :class="{ open: dropdowns.inventarios }"
              @click.stop="toggleDropdown('inventarios', $event)"
            >
              <i class="fas fa-warehouse" aria-hidden="true"></i>
              <span>Inventario</span>
              <i class="fas fa-chevron-down mobile-caret" aria-hidden="true"></i>
            </button>
            <ul v-if="dropdowns.inventarios" class="mobile-submenu">
              <li v-if="puedeVerKardex">
                <router-link class="mobile-subitem" to="/kardex" @click="cerrarTodo">Kardex</router-link>
              </li>
              <li v-if="puedeVerInventario">
                <router-link class="mobile-subitem" to="/inventario/stock" @click="cerrarTodo">Stock actual</router-link>
              </li>
              <li v-if="puedeVerInventario">
                <router-link class="mobile-subitem" to="/inventario/valorizado" @click="cerrarTodo">Valorizado</router-link>
              </li>
              <li v-if="puedeEditarInventario">
                <router-link class="mobile-subitem" to="/inventario/ajustes" @click="cerrarTodo">Ajustes</router-link>
              </li>
            </ul>
          </li>

          <li v-if="puedeVerReportes">
            <button
              type="button"
              class="mobile-nav-item"
              :class="{ open: dropdowns.reportes }"
              @click.stop="toggleDropdown('reportes', $event)"
            >
              <i class="fas fa-chart-bar" aria-hidden="true"></i>
              <span>Reportes</span>
              <i class="fas fa-chevron-down mobile-caret" aria-hidden="true"></i>
            </button>
            <ul v-if="dropdowns.reportes" class="mobile-submenu">
              <li><router-link class="mobile-subitem" to="/reportes/ventas" @click="cerrarTodo">Ventas</router-link></li>
              <li><router-link class="mobile-subitem" to="/reportes/compras" @click="cerrarTodo">Compras</router-link></li>
              <li><router-link class="mobile-subitem" to="/reportes/estados-financieros" @click="cerrarTodo">Estados financieros</router-link></li>
              <li><router-link class="mobile-subitem" to="/reportes/ats" @click="cerrarTodo">Anexo ATS</router-link></li>
            </ul>
          </li>

          <li v-if="puedeVerUsuarios || puedeVerAuditoria">
            <button
              type="button"
              class="mobile-nav-item"
              :class="{ open: dropdowns.admin }"
              @click.stop="toggleDropdown('admin', $event)"
            >
              <i class="fas fa-cog" aria-hidden="true"></i>
              <span>Admin</span>
              <i class="fas fa-chevron-down mobile-caret" aria-hidden="true"></i>
            </button>
            <ul v-if="dropdowns.admin" class="mobile-submenu">
              <li><router-link class="mobile-subitem" to="/diagnostico" @click="cerrarTodo">Diagnóstico</router-link></li>
              <li><router-link class="mobile-subitem" to="/configuracion-empresa" @click="cerrarTodo">Empresa</router-link></li>
              <li><router-link class="mobile-subitem" to="/certificado-firma" @click="cerrarTodo">Certificado</router-link></li>
              <li><router-link class="mobile-subitem" to="/envio-sri" @click="cerrarTodo">Envío al SRI</router-link></li>
              <li><router-link class="mobile-subitem" to="/usuarios" @click="cerrarTodo">Usuarios</router-link></li>
              <li><router-link class="mobile-subitem" to="/auditoria" @click="cerrarTodo">Auditoría</router-link></li>
              <li><router-link class="mobile-subitem" to="/backups" @click="cerrarTodo">Backups</router-link></li>
            </ul>
          </li>
        </ul>
      </div>
    </transition>
  </nav>
</template>

<script setup>
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  nextTick,
  watch
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SearchBar from './SearchBar.vue'
import ThemeToggle from './ThemeToggle.vue'
import { useAuth } from '../composables/useAuth'
import { usePermisos } from '../composables/usePermisos'
import { api } from '../services/api'

const router = useRouter()
const route = useRoute()

const { user, logout } = useAuth()
const { cargarPermisos, puede } = usePermisos()

// ===== STATE =====
const navbarAbierto = ref(false)
const userMenuOpen = ref(false)
const scrolled = ref(false)

const navbar = ref(null)
const searchBar = ref(null)

const certificadoInfo = ref(null)
const estadoSri = ref(null)

// 🔧 Refactor: ya NO existe la key `retenciones`
const dropdowns = ref({
  documentos: false,
  maestros: false,
  inventarios: false,
  reportes: false,
  admin: false
})

// ===== GUARDS =====
let unmounted = false
let infoAbort = null
let infoRefreshTimer = null
let scrollRafId = null
let visibilityHandler = null

// ===== PERMISOS =====
const puedeVerVentas = computed(() => puede('ventas', 'ver'))
const puedeCrearVentas = computed(() => puede('ventas', 'crear'))
const puedeVerCompras = computed(() => puede('compras', 'ver'))
const puedeCrearCompras = computed(() => puede('compras', 'crear'))
const puedeVerClientes = computed(() => puede('clientes', 'ver'))
const puedeVerProveedores = computed(() => puede('proveedores', 'ver'))
const puedeVerProductos = computed(() => puede('productos', 'ver'))
const puedeVerCategorias = computed(() => puede('categorias', 'ver'))
const puedeVerInventario = computed(() => puede('inventario', 'ver'))
const puedeEditarInventario = computed(() => puede('inventario', 'editar'))
const puedeVerKardex = computed(() => puede('kardex', 'ver'))
const puedeVerReportes = computed(() => puede('reportes', 'ver'))
const puedeVerAuditoria = computed(() => puede('auditoria', 'ver'))
const puedeVerUsuarios = computed(() => puede('usuarios', 'ver'))

// ===== RUTA ACTIVA =====
const rutaActiva = (prefijos) => {
  const lista = Array.isArray(prefijos) ? prefijos : [prefijos]
  const path = route.path || ''
  return lista.some((p) => path === p || path.startsWith(p + '/'))
}

// ===== CERTIFICADO =====
const certificadoPorVencer = computed(
  () => certificadoInfo.value?.cargado && certificadoInfo.value?.por_vencer
)
const certificadoDiasRestantes = computed(
  () => Number(certificadoInfo.value?.dias_restantes) || 0
)
const documentosFirmados = computed(
  () => Number(estadoSri.value?.documentos?.firmados) || 0
)

// ===== INFO DEL SISTEMA =====
const cargarInfoSistema = async () => {
  if (!puedeVerUsuarios.value) return
  if (unmounted) return

  if (infoAbort) {
    try {
      infoAbort.abort()
    } catch {
      /* noop */
    }
  }
  infoAbort = new AbortController()

  try {
    const [cert, sri] = await Promise.allSettled([
      api.request('/certificado/info', {
        method: 'GET',
        skipLoader: true,
        signal: infoAbort.signal
      }),
      api.request('/sri/estado', {
        method: 'GET',
        skipLoader: true,
        signal: infoAbort.signal
      })
    ])

    if (unmounted) return

    if (cert.status === 'fulfilled') certificadoInfo.value = cert.value
    if (sri.status === 'fulfilled') estadoSri.value = sri.value
  } catch {
    /* silencioso */
  }
}

// ============================================================
// EVENTO GLOBAL: cerrar dropdowns
// ============================================================
const ORIGEN = 'navbar'

function emitirCierreGlobal() {
  try {
    window.dispatchEvent(
      new CustomEvent('app:cerrar-dropdowns', { detail: { origen: ORIGEN } })
    )
  } catch {
    /* noop */
  }
}

function onCierreGlobal(e) {
  if (e?.detail?.origen === ORIGEN) return
  cerrarTodoInterno()
}

// ============================================================
// TOGGLES
// ============================================================
const toggleNavbar = () => {
  navbarAbierto.value = !navbarAbierto.value
  if (!navbarAbierto.value) {
    for (const k of Object.keys(dropdowns.value)) dropdowns.value[k] = false
  }
}

const toggleDropdown = async (nombre, event) => {
  const abriendo = !dropdowns.value[nombre]

  if (abriendo) {
    for (const k of Object.keys(dropdowns.value)) {
      dropdowns.value[k] = k === nombre ? true : false
    }
    if (userMenuOpen.value) userMenuOpen.value = false
    emitirCierreGlobal()
  } else {
    dropdowns.value[nombre] = false
    return
  }

  await nextTick()

  const wrapper = event?.currentTarget?.closest('.nav-dropdown')
  const panel = wrapper?.querySelector('.dropdown-panel')
  if (panel) {
    panel.classList.remove('dropdown-panel--right')
    const rect = panel.getBoundingClientRect()
    const margen = 12
    if (rect.right > window.innerWidth - margen) {
      panel.classList.add('dropdown-panel--right')
    }
    const first = panel.querySelector('a, button')
    first?.focus?.()
  }
}

const toggleUserMenu = () => {
  const abriendo = !userMenuOpen.value
  userMenuOpen.value = abriendo

  if (abriendo) {
    for (const k of Object.keys(dropdowns.value)) dropdowns.value[k] = false
    emitirCierreGlobal()
  }
}

function cerrarTodoInterno() {
  navbarAbierto.value = false
  for (const k of Object.keys(dropdowns.value)) dropdowns.value[k] = false
  userMenuOpen.value = false
}

const cerrarTodo = () => {
  cerrarTodoInterno()
  emitirCierreGlobal()
}

// ============================================================
// CLICK FUERA
// ============================================================
const handleClickOutside = (e) => {
  if (navbar.value && navbar.value.contains(e.target)) return
  cerrarTodoInterno()
}

// ============================================================
// SCROLL
// ============================================================
const handleScroll = () => {
  if (scrollRafId) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null
    if (unmounted) return
    const y = window.scrollY || window.pageYOffset || 0
    const nuevo = y > 8
    if (nuevo !== scrolled.value) scrolled.value = nuevo
  })
}

// ============================================================
// ATAJOS
// ============================================================
const esMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '')

const handleKeyboard = (e) => {
  if (!e.isTrusted) return

  const tag = String(e.target?.tagName || '').toLowerCase()
  const esInput =
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    e.target?.isContentEditable === true

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (typeof searchBar.value?.focus === 'function') {
      searchBar.value.focus()
    } else if (searchBar.value?.$el) {
      const input = searchBar.value.$el.querySelector('input')
      input?.focus?.()
      input?.select?.()
    }
    return
  }

  if (e.key === 'Escape') {
    if (navbarAbierto.value || userMenuOpen.value) {
      cerrarTodo()
      return
    }
    const anyDropdownOpen = Object.values(dropdowns.value).some(Boolean)
    if (anyDropdownOpen) cerrarTodo()
    return
  }

  if (
    e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    !esMac &&
    !esInput &&
    /^[1-9]$/.test(e.key)
  ) {
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
    const to = shortcuts[e.key]
    if (to) {
      cerrarTodo()
      router.push(to)
    }
  }
}

// ============================================================
// NAVEGACIÓN
// ============================================================
const irPerfil = () => {
  cerrarTodo()
  router.push('/mi-perfil')
}
const irConfigEmpresa = () => {
  cerrarTodo()
  router.push('/configuracion-empresa')
}
const irCertificado = () => {
  cerrarTodo()
  router.push('/certificado-firma')
}
const irEnvioSri = () => {
  cerrarTodo()
  router.push('/envio-sri')
}

const cerrarSesion = async () => {
  cerrarTodo()
  await logout()
}

const reiniciarTour = () => {
  cerrarTodo()
  if (typeof window.__reiniciarTour__ === 'function') {
    window.__reiniciarTour__()
  }
}

// ============================================================
// HELPERS
// ============================================================
const getInitials = (nombre) => {
  if (!nombre || typeof nombre !== 'string') return '?'
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

const iniciarPolling = () => {
  if (infoRefreshTimer || unmounted) return
  infoRefreshTimer = setInterval(() => {
    if (unmounted) return
    cargarInfoSistema()
  }, 5 * 60 * 1000)
}

const detenerPolling = () => {
  if (infoRefreshTimer) {
    clearInterval(infoRefreshTimer)
    infoRefreshTimer = null
  }
}

// ============================================================
// WATCH
// ============================================================
watch(
  () => route.path,
  () => {
    cerrarTodoInterno()
  }
)

// ============================================================
// LIFECYCLE
// ============================================================
onMounted(async () => {
  try {
    await cargarPermisos()
  } catch {
    /* noop */
  }

  await cargarInfoSistema()
  iniciarPolling()

  visibilityHandler = () => {
    if (document.hidden) {
      detenerPolling()
    } else {
      cargarInfoSistema()
      iniciarPolling()
    }
  }
  document.addEventListener('visibilitychange', visibilityHandler)

  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('keydown', handleKeyboard)
  window.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('app:cerrar-dropdowns', onCierreGlobal)

  handleScroll()
})

onBeforeUnmount(() => {
  unmounted = true

  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('keydown', handleKeyboard)
  window.removeEventListener('app:cerrar-dropdowns', onCierreGlobal)
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
  }
  window.removeEventListener('scroll', handleScroll)

  if (scrollRafId) {
    cancelAnimationFrame(scrollRafId)
    scrollRafId = null
  }
  if (infoAbort) {
    try {
      infoAbort.abort()
    } catch {
      /* noop */
    }
    infoAbort = null
  }
  detenerPolling()
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
  background: var(--bg-navbar, linear-gradient(135deg, #0f1e35 0%, #1e3a5f 55%, #24467a 100%));
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  transition: box-shadow 0.25s ease;
}

.navbar-app.navbar-scrolled {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
}

.navbar-inner {
  max-width: 1600px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  height: 64px;
}

/* ============================================================
   ZONA IZQUIERDA
   ============================================================ */
.navbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: visible;
}

/* ============================================================
   ZONA DERECHA
   ============================================================ */
.navbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* ============================================================
   BRAND
   ============================================================ */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 12px;
  text-decoration: none;
  transition: background 0.2s ease;
  flex-shrink: 0;
}
.brand:hover {
  background: rgba(255, 255, 255, 0.08);
}

.brand-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.15));
  border: 1.5px solid rgba(245, 158, 11, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f59e0b;
  font-size: 1.05rem;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.15);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  flex-shrink: 0;
}
.brand:hover .brand-logo {
  transform: rotate(-6deg) scale(1.06);
  box-shadow: 0 8px 20px rgba(245, 158, 11, 0.35);
}

.brand-text {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.brand-name {
  font-size: 1rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.02em;
  white-space: nowrap;
}
.brand-tag {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.18);
  color: #f59e0b;
  letter-spacing: 0.08em;
  border: 1px solid rgba(245, 158, 11, 0.28);
  white-space: nowrap;
}

/* ============================================================
   NAV LIST (desktop)
   ============================================================ */
.nav-list {
  display: flex;
  align-items: center;
  gap: 4px;
  list-style: none;
  margin: 0 0 0 8px;
  padding: 0;
  min-width: 0;
}

.nav-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  font-family: inherit;
  font-size: 0.86rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
  white-space: nowrap;
  text-decoration: none;
  line-height: 1;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.nav-item.active {
  background: var(--primary-color, #2563eb);
  color: #fff;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
}

.nav-item > i:first-child {
  font-size: 0.88rem;
}

.nav-caret {
  font-size: 0.58rem;
  opacity: 0.6;
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.nav-dropdown.open .nav-caret {
  transform: rotate(180deg);
  opacity: 1;
}

.nav-alert-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-left: 2px;
  animation: pulse-dot 2s infinite;
}
.nav-alert-dot.warning {
  background: #f59e0b;
}
.nav-alert-dot.info {
  background: #0ea5e9;
}

@keyframes pulse-dot {
  0%,
  100% {
    box-shadow: 0 0 0 0 currentColor;
    opacity: 1;
  }
  50% {
    box-shadow: 0 0 0 4px transparent;
    opacity: 0.7;
  }
}

/* ============================================================
   DROPDOWN PANEL
   ============================================================ */
.nav-dropdown {
  position: relative;
  overflow: visible;
}

.dropdown-panel {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  min-width: 260px;
  max-width: min(360px, calc(100vw - 24px));
  background: rgba(20, 30, 48, 0.98);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
  padding: 8px;
  list-style: none;
  margin: 0;
  z-index: 1000;
  animation: dropdown-in 0.2s ease-out;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
  overflow-x: visible;
}

.dropdown-panel.dropdown-panel--right {
  left: auto;
  right: 0;
}
.dropdown-panel.dropdown-panel-right {
  left: auto;
  right: 0;
}
.dropdown-panel.dropdown-panel-wide {
  min-width: 300px;
}

@keyframes dropdown-in {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.dropdown-section {
  font-size: 0.65rem;
  font-weight: 700;
  color: rgba(245, 158, 11, 0.9);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  padding: 10px 14px 6px;
  pointer-events: none;
}

.dropdown-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.88);
  text-decoration: none;
  font-size: 0.86rem;
  font-weight: 500;
  transition: background 0.15s ease, color 0.15s ease;
}
.dropdown-link > i {
  width: 18px;
  color: #f59e0b;
  font-size: 0.88rem;
  text-align: center;
  transition: transform 0.15s ease;
}
.dropdown-link > span:first-of-type {
  flex: 1;
}
.dropdown-link:hover {
  background: var(--primary-color, #2563eb);
  color: #fff;
}
.dropdown-link:hover > i {
  color: #fff;
  transform: scale(1.1);
}

.dropdown-link.highlight-compra {
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.2);
}
.dropdown-link.highlight-compra > i {
  color: #a78bfa;
}
.dropdown-link.highlight-compra:hover {
  background: #7c3aed;
  color: #fff;
}
.dropdown-link.highlight-compra:hover > i {
  color: #fff;
}

.shortcut {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  font-family: monospace;
  font-weight: 700;
  letter-spacing: 0.3px;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.badge-mini {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  min-width: 22px;
  text-align: center;
}
.badge-mini.info {
  background: rgba(14, 165, 233, 0.15);
  color: #0ea5e9;
}
.badge-mini.warning {
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
}

.dropdown-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 6px 8px;
  list-style: none;
}

/* ============================================================
   SEARCH
   ============================================================ */
.search-container {
  width: clamp(180px, 18vw, 280px);
  flex-shrink: 0;
  position: relative;
  z-index: 5;
}

/* ============================================================
   USER
   ============================================================ */
.user-wrapper {
  position: relative;
  flex-shrink: 0;
}

.user-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
  height: 38px;
  max-width: 180px;
}
.user-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
}

.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.7rem;
  flex-shrink: 0;
  letter-spacing: 0.3px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  background: linear-gradient(135deg, var(--rol-c1, #f59e0b), var(--rol-c2, #d97706));
  color: #fff;
}

[data-rol='admin'] {
  --rol-c1: #ef4444;
  --rol-c2: #dc2626;
}
[data-rol='contador'] {
  --rol-c1: #3b82f6;
  --rol-c2: #2563eb;
}
[data-rol='vendedor'] {
  --rol-c1: #10b981;
  --rol-c2: #059669;
}
[data-rol='bodeguero'] {
  --rol-c1: #f59e0b;
  --rol-c2: #d97706;
}
[data-rol='auditor'] {
  --rol-c1: #8b5cf6;
  --rol-c2: #7c3aed;
}

.user-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
}

.user-caret {
  font-size: 0.6rem;
  opacity: 0.6;
  transition: transform 0.2s ease, opacity 0.2s ease;
  flex-shrink: 0;
}
.user-caret.rotated {
  transform: rotate(180deg);
  opacity: 1;
}

/* ============================================================
   USER PANEL
   ============================================================ */
.user-panel {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  min-width: 300px;
  max-width: min(360px, calc(100vw - 24px));
  max-height: calc(100vh - 100px);
  background: rgba(20, 30, 48, 0.99);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  overflow-x: hidden;
  overflow-y: auto;
  z-index: 1000;
  animation: dropdown-in 0.2s ease-out;
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
  font-weight: 800;
  font-size: 1.05rem;
  flex-shrink: 0;
  letter-spacing: 0.5px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
  background: linear-gradient(135deg, var(--rol-c1, #f59e0b), var(--rol-c2, #d97706));
  color: #fff;
}

.user-panel-info {
  flex: 1;
  min-width: 0;
}
.user-panel-name {
  font-size: 0.95rem;
  font-weight: 700;
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
  border-radius: 999px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.badge-rol-admin {
  background: rgba(239, 68, 68, 0.25);
  color: #fca5a5;
}
.badge-rol-contador {
  background: rgba(59, 130, 246, 0.25);
  color: #93c5fd;
}
.badge-rol-vendedor {
  background: rgba(16, 185, 129, 0.25);
  color: #6ee7b7;
}
.badge-rol-bodeguero {
  background: rgba(245, 158, 11, 0.25);
  color: #fbbf24;
}
.badge-rol-auditor {
  background: rgba(139, 92, 246, 0.25);
  color: #c4b5fd;
}

.user-alert {
  display: flex;
  gap: 12px;
  padding: 12px 20px;
  font-size: 0.78rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  align-items: flex-start;
}
.user-alert.warning {
  background: rgba(245, 158, 11, 0.08);
}
.user-alert.warning > i {
  color: #f59e0b;
}
.user-alert.info {
  background: rgba(14, 165, 233, 0.08);
}
.user-alert.info > i {
  color: #0ea5e9;
}
.user-alert > i {
  font-size: 1rem;
  margin-top: 2px;
  flex-shrink: 0;
}
.user-alert-title {
  font-weight: 700;
  color: #fff;
  margin-bottom: 2px;
  font-size: 0.78rem;
}
.user-alert-text {
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.72rem;
}

.user-menu-actions {
  padding: 8px;
}

.user-action {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 14px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.88);
  font-family: inherit;
  font-size: 0.86rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}
.user-action > i {
  width: 18px;
  color: #f59e0b;
  font-size: 0.9rem;
  text-align: center;
}
.user-action > span:first-of-type {
  flex: 1;
}
.user-action:hover {
  background: rgba(255, 255, 255, 0.06);
}
.user-action.danger {
  color: #fca5a5;
}
.user-action.danger > i {
  color: #ef4444;
}
.user-action.danger:hover {
  background: rgba(239, 68, 68, 0.15);
}

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
  border-radius: 999px;
  color: #f59e0b;
  font-weight: 700;
  font-size: 0.65rem;
}
.status-indicator {
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
  background: #10b981;
  animation: pulse-status 2s infinite;
}
@keyframes pulse-status {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
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
  border-radius: 10px;
  cursor: pointer;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
  padding: 0;
  flex-shrink: 0;
}
.burger:hover {
  background: rgba(255, 255, 255, 0.15);
}

.burger-line {
  width: 20px;
  height: 2px;
  background: #fff;
  border-radius: 2px;
  transition: all 0.25s ease;
}
.burger-line.open:nth-child(1) {
  transform: translateY(6px) rotate(45deg);
}
.burger-line.open:nth-child(2) {
  opacity: 0;
}
.burger-line.open:nth-child(3) {
  transform: translateY(-6px) rotate(-45deg);
}

/* ============================================================
   MENÚ MÓVIL
   ============================================================ */
.mobile-menu {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: rgba(15, 22, 38, 0.99);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  padding: 16px 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.4);
  max-height: calc(100vh - 64px);
  overflow-y: auto;
}

.mobile-nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mobile-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.9);
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  width: 100%;
  transition: background 0.15s ease;
}
.mobile-nav-item:hover,
.mobile-nav-item.open {
  background: rgba(255, 255, 255, 0.08);
}
.mobile-nav-item > i:first-child {
  width: 20px;
  color: #f59e0b;
  text-align: center;
}
.mobile-nav-item > span {
  flex: 1;
}

.mobile-caret {
  font-size: 0.7rem;
  opacity: 0.6;
  transition: transform 0.2s ease;
}
.mobile-nav-item.open .mobile-caret {
  transform: rotate(180deg);
  opacity: 1;
}

.mobile-submenu {
  list-style: none;
  margin: 2px 0 8px 0;
  padding: 0 0 0 20px;
  border-left: 2px solid var(--primary-color, #2563eb);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mobile-subitem {
  display: block;
  padding: 9px 14px;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.86rem;
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;
}
.mobile-subitem:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.mobile-subitem-highlight {
  color: #c4b5fd;
  font-weight: 600;
}
.mobile-subitem-highlight::before {
  content: '+ ';
  color: #a78bfa;
  font-weight: 800;
}

/* ============================================================
   TRANSICIONES
   ============================================================ */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.mobile-drawer-enter-active,
.mobile-drawer-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.mobile-drawer-enter-from,
.mobile-drawer-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

/* ============================================================
   FOCUS
   ============================================================ */
.nav-item:focus-visible,
.user-btn:focus-visible,
.dropdown-link:focus-visible,
.user-action:focus-visible,
.burger:focus-visible,
.mobile-nav-item:focus-visible,
.mobile-subitem:focus-visible {
  outline: 2px solid #f59e0b;
  outline-offset: 2px;
  border-radius: inherit;
}

/* ============================================================
   RESPONSIVE
   ============================================================ */

@media (max-width: 1500px) {
  .navbar-inner {
    padding: 0 16px;
    gap: 12px;
  }
  .navbar-left {
    gap: 6px;
  }
  .nav-item {
    padding: 8px 12px;
    font-size: 0.84rem;
  }
  .search-container {
    width: clamp(160px, 15vw, 240px);
  }
  .user-name {
    max-width: 80px;
  }
}

@media (max-width: 1300px) {
  .nav-list {
    margin-left: 4px;
  }
  .nav-item {
    padding: 8px 10px;
    gap: 6px;
    font-size: 0.83rem;
  }
  .nav-item > i:first-child {
    font-size: 0.85rem;
  }
  .brand-name {
    font-size: 0.95rem;
  }
  .search-container {
    width: 200px;
  }
  .user-name {
    display: none;
  }
  .user-btn {
    padding: 4px;
    max-width: 40px;
  }
  .user-caret {
    display: none;
  }
}

@media (max-width: 1150px) {
  .nav-item > span:not(.shortcut):not(.badge-mini):not(.nav-alert-dot) {
    display: none;
  }
  .nav-item.active > span:not(.shortcut):not(.badge-mini):not(.nav-alert-dot) {
    display: inline;
  }
  .nav-caret {
    display: none;
  }
  .nav-item {
    padding: 9px 11px;
    gap: 0;
  }
  .nav-alert-dot {
    margin-left: 2px;
  }
  .dropdown-panel {
    left: auto;
    right: 0;
  }
}

@media (max-width: 992px) {
  .navbar-inner {
    gap: 10px;
  }
  .navbar-left {
    flex: 0 1 auto;
    overflow: visible;
  }
  .nav-list {
    display: none;
  }
  .burger {
    display: flex;
  }
  .mobile-menu {
    display: block;
  }

  .search-container {
    width: 200px;
  }

  .user-name {
    display: inline;
    max-width: 90px;
  }
  .user-btn {
    padding: 4px 10px 4px 4px;
    max-width: 180px;
  }
  .user-caret {
    display: inline;
  }
}

@media (max-width: 720px) {
  .navbar-inner {
    padding: 0 12px;
    gap: 8px;
  }

  .search-container {
    width: 40px;
    min-width: 40px;
    max-width: 40px;
    transition: max-width 0.28s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }
  .search-container:focus-within {
    max-width: min(240px, 55vw);
  }

  .search-container :deep(.search-input) {
    padding: 0;
    color: transparent;
    text-align: center;
    cursor: pointer;
  }
  .search-container :deep(.search-input::placeholder) {
    color: transparent;
  }
  .search-container:focus-within :deep(.search-input) {
    padding: 10px 36px 10px 40px;
    color: var(--text-primary);
    text-align: left;
    cursor: text;
  }
  .search-container:focus-within :deep(.search-input::placeholder) {
    color: var(--text-muted);
  }

  .search-container :deep(.search-icon) {
    left: 50%;
    transform: translateX(-50%);
    transition: left 0.28s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
      transform 0.28s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }
  .search-container:focus-within :deep(.search-icon) {
    left: 14px;
    transform: none;
  }

  .search-container :deep(.search-kbd) {
    display: none !important;
  }
  .search-container:not(:focus-within) :deep(.clear-btn) {
    display: none !important;
  }

  .user-name {
    display: none;
  }
  .user-btn {
    padding: 4px;
    max-width: 40px;
  }
  .user-caret {
    display: none;
  }
  .brand-name {
    display: none;
  }
  .brand-tag {
    display: none;
  }
}

@media (max-width: 480px) {
  .navbar-inner {
    min-height: 58px;
    height: 58px;
    padding: 0 10px;
  }
  .brand {
    padding: 4px;
  }
  .brand-logo {
    width: 34px;
    height: 34px;
    font-size: 0.95rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nav-alert-dot,
  .status-dot {
    animation: none;
  }
  .dropdown-panel,
  .user-panel,
  .mobile-menu {
    animation: none;
  }
  .brand:hover .brand-logo {
    transform: none;
  }
  .dropdown-enter-active,
  .dropdown-leave-active,
  .mobile-drawer-enter-active,
  .mobile-drawer-leave-active {
    transition: none;
  }
}
</style>