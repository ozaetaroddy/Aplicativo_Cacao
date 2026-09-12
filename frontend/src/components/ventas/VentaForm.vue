<template>
  <div class="venta-form">
    <!-- ===== HEADER ===== -->
    <div class="form-header">
      <div class="header-left">
        <button type="button" class="btn-back" @click="$router.push('/ventas')">
          <i class="fas fa-arrow-left"></i>
        </button>
        <div>
          <h1 class="form-title">
            <span class="title-icon"><i class="fas fa-file-invoice"></i></span>
            {{ tituloDocumento }}
          </h1>
          <p class="form-subtitle">
            {{ id ? 'Editando documento existente' : 'Complete los datos para crear un nuevo documento' }}
          </p>
        </div>
      </div>
      <div class="header-actions">
        <button type="button" class="btn-ghost" @click="mostrarAyuda = !mostrarAyuda">
          <i class="fas fa-keyboard"></i>
          <span>Atajos</span>
        </button>
      </div>
    </div>

    <!-- Atajos -->
    <transition name="fade">
      <div v-if="mostrarAyuda" class="shortcuts-panel">
        <div class="shortcuts-title">
          <i class="fas fa-bolt"></i>
          Atajos de teclado
        </div>
        <div class="shortcuts-grid">
          <div class="shortcut-item"><kbd>F2</kbd><span>Buscar producto</span></div>
          <div class="shortcut-item"><kbd>F3</kbd><span>Buscar cliente</span></div>
          <div class="shortcut-item"><kbd>Ctrl</kbd><kbd>↵</kbd><span>Guardar</span></div>
          <div class="shortcut-item"><kbd>Esc</kbd><span>Cerrar</span></div>
        </div>
      </div>
    </transition>

    <!-- Alerta periodo cerrado -->
    <AlertaPeriodoCerrado :periodo-cerrado="periodoCerrado" />

    <!-- Alerta configuración -->
    <div v-if="puedeGenerarClave && !configEmpresaOk" class="alert-box alert-danger">
      <div class="alert-icon"><i class="fas fa-exclamation-triangle"></i></div>
      <div class="alert-body">
        <div class="alert-title">Configuración incompleta</div>
        <div class="alert-text">
          No se generará la clave de acceso porque la empresa no tiene un RUC válido (13 dígitos).
        </div>
      </div>
      <router-link to="/configuracion-empresa" class="alert-action">
        Configurar <i class="fas fa-arrow-right"></i>
      </router-link>
    </div>

    <div v-else-if="puedeGenerarClave && configEmpresaOk" class="alert-box alert-success">
      <div class="alert-icon"><i class="fas fa-check-circle"></i></div>
      <div class="alert-body">
        <div class="alert-title">Listo para facturar</div>
        <div class="alert-text">
          RUC <strong>{{ configEmpresa?.ruc }}</strong> ·
          Ambiente <strong>{{ configEmpresa?.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS' }}</strong> ·
          Serie <code>{{ seriePreview }}</code>
        </div>
      </div>
    </div>

    <form @submit.prevent="guardar" novalidate>
      <div class="form-grid">
        <!-- ============ COLUMNA PRINCIPAL ============ -->
        <div class="form-main">

          <!-- SECCIÓN: Datos del documento -->
          <section class="form-section">
            <header class="section-header">
              <div class="section-number">1</div>
              <div>
                <h2 class="section-title">Datos del documento</h2>
                <p class="section-desc">Tipo, número y fecha de emisión</p>
              </div>
            </header>
            <div class="section-body">
              <div class="form-row cols-2-1-1">
                <div class="form-field">
                  <label class="form-label">
                    <span class="required">*</span> Tipo de documento
                  </label>
                  <select class="form-select" v-model="venta.tipo_documento" @change="cambiarTipo">
                    <optgroup label="Documentos de Venta">
                      <option value="factura">01 - Factura</option>
                      <option value="nota_credito">04 - Nota de Crédito</option>
                      <option value="guia_remision">06 - Guía de Remisión</option>
                      <option value="retencion">07 - Comprobante de Retención</option>
                      <option value="liquidacion">03 - Liquidación de Compra</option>
                    </optgroup>
                    <optgroup label="Documentos Especiales">
                      <option value="exportacion">42 - Factura de Exportación</option>
                      <option value="reembolso">41 - Factura de Reembolso</option>
                      <option value="proforma">Proforma (no fiscal)</option>
                    </optgroup>
                  </select>
                </div>
                <div class="form-field">
                  <label class="form-label">Nº documento</label>
                  <input
                    type="text"
                    class="form-control"
                    v-model="venta.numero_factura"
                    placeholder="Automático"
                  />
                </div>
                <div class="form-field">
                  <label class="form-label">
                    <span class="required">*</span> Fecha emisión
                  </label>
                  <input
                    type="date"
                    class="form-control"
                    v-model="venta.fecha_emision"
                    required
                  />
                </div>
              </div>
            </div>
          </section>

          <!-- SECCIÓN: Cliente -->
          <section v-if="venta.tipo_documento !== 'guia_remision'" class="form-section card-with-dropdown">
            <header class="section-header">
              <div class="section-number">2</div>
              <div class="section-header-content">
                <h2 class="section-title">Cliente</h2>
                <p class="section-desc">Selecciona o crea un cliente</p>
              </div>
              <router-link to="/clientes/nuevo" class="btn-new-inline">
                <i class="fas fa-plus"></i>
                <span>Nuevo</span>
              </router-link>
            </header>
            <div class="section-body">
              <!-- Buscador de cliente -->
              <div class="position-relative">
                <div class="search-input-group">
                  <i class="fas fa-search search-icon"></i>
                  <input
                    ref="inputCliente"
                    type="text"
                    class="search-input"
                    placeholder="Escribe nombre, RUC o cédula..."
                    v-model="busquedaCliente"
                    @focus="mostrarListaClientes = true"
                    @input="filtrarClientes"
                    @blur="cerrarListaClientes"
                  />
                  <button
                    v-if="venta.clienteId"
                    class="search-clear"
                    type="button"
                    @click="limpiarCliente"
                    title="Cambiar cliente"
                  >
                    <i class="fas fa-times"></i>
                  </button>
                </div>

                <!-- Dropdown -->
                <transition name="dropdown">
                  <div v-if="mostrarListaClientes && clientesFiltrados.length > 0" class="search-dropdown">
                    <div
                      v-for="c in clientesFiltrados.slice(0, 8)"
                      :key="c._id"
                      class="dropdown-row"
                      @mousedown.prevent="seleccionarCliente(c)"
                    >
                      <div class="row-avatar">{{ getInitials(c.nombre) }}</div>
                      <div class="row-content">
                        <div class="row-title">{{ c.nombre }}</div>
                        <div class="row-meta">
                          <span><i class="fas fa-id-card"></i> {{ c.ruc }}</span>
                          <span v-if="c.telefono"><i class="fas fa-phone"></i> {{ c.telefono }}</span>
                        </div>
                      </div>
                      <i v-if="venta.clienteId === c._id" class="fas fa-check-circle row-check"></i>
                    </div>
                  </div>
                </transition>
              </div>

              <!-- Preview del cliente -->
              <transition name="fade">
                <div v-if="clienteActual" class="cliente-card">
                  <div class="cliente-avatar-large">{{ getInitials(clienteActual.nombre) }}</div>
                  <div class="cliente-details">
                    <div class="cliente-name">{{ clienteActual.nombre }}</div>
                    <div class="cliente-meta-grid">
                      <div><strong>RUC:</strong> {{ clienteActual.ruc }}</div>
                      <div v-if="clienteActual.telefono"><strong>Tel:</strong> {{ clienteActual.telefono }}</div>
                      <div v-if="clienteActual.email"><strong>Email:</strong> {{ clienteActual.email }}</div>
                      <div v-if="clienteActual.direccion"><strong>Dir:</strong> {{ clienteActual.direccion }}</div>
                    </div>
                  </div>
                  <button class="cliente-change" @click="limpiarCliente">
                    <i class="fas fa-exchange-alt"></i>
                  </button>
                </div>
              </transition>
            </div>
          </section>

          <!-- SECCIÓN: Productos -->
          <section class="form-section card-with-dropdown">
            <header class="section-header">
              <div class="section-number">3</div>
              <div class="section-header-content">
                <h2 class="section-title">
                  Productos
                  <span v-if="venta.detalles.length > 0" class="count-badge">{{ venta.detalles.length }}</span>
                </h2>
                <p class="section-desc">Agrega los productos o servicios</p>
              </div>
              <button type="button" class="btn-new-inline btn-new-primary" @click="focusBusquedaProducto">
                <i class="fas fa-search"></i>
                <span>Buscar (F2)</span>
              </button>
            </header>
            <div class="section-body">
              <!-- Buscador de productos -->
              <div class="position-relative">
                <div class="search-input-group search-input-primary">
                  <i class="fas fa-barcode search-icon"></i>
                  <input
                    ref="inputProducto"
                    type="text"
                    class="search-input"
                    placeholder="Busca por nombre o código. Presiona Enter para agregar..."
                    v-model="busquedaProducto"
                    @focus="mostrarListaProductos = true"
                    @input="filtrarProductos"
                    @keydown.enter.prevent="agregarPrimerProducto"
                    @keydown.esc="limpiarBusquedaProducto"
                    @blur="cerrarListaProductos"
                  />
                </div>

                <transition name="dropdown">
                  <div v-if="mostrarListaProductos && productosFiltrados.length > 0" class="search-dropdown">
                    <div
                      v-for="p in productosFiltrados.slice(0, 10)"
                      :key="p._id"
                      class="dropdown-row"
                      @mousedown.prevent="agregarProducto(p)"
                    >
                      <div class="row-avatar row-avatar-product">
                        <i class="fas fa-box"></i>
                      </div>
                      <div class="row-content">
                        <div class="row-title">{{ p.nombre }}</div>
                        <div class="row-meta">
                          <code>{{ p.codigo }}</code>
                          <span :class="p.stock <= 0 ? 'stock-zero' : 'stock-ok'">
                            <i class="fas fa-cube"></i> Stock: {{ p.stock || 0 }}
                          </span>
                        </div>
                      </div>
                      <div class="row-price">
                        <div class="price-value">${{ (p.precio_venta || 0).toFixed(2) }}</div>
                        <div class="price-label">venta</div>
                      </div>
                    </div>
                  </div>
                  <div v-else-if="mostrarListaProductos && busquedaProducto.length > 0" class="search-dropdown search-empty">
                    <i class="fas fa-search"></i>
                    <span>Sin resultados para "{{ busquedaProducto }}"</span>
                  </div>
                </transition>
              </div>

              <!-- Lista de items agregados -->
              <div v-if="venta.detalles.length === 0" class="empty-items">
                <div class="empty-icon"><i class="fas fa-box-open"></i></div>
                <div class="empty-title">No has agregado productos</div>
                <div class="empty-text">Usa el buscador de arriba o presiona <kbd>F2</kbd></div>
              </div>

              <div v-else class="items-list">
                <div v-for="(item, index) in venta.detalles" :key="index" class="item-card">
                  <div class="item-main">
                    <div class="item-icon">
                      <i class="fas fa-box"></i>
                    </div>
                    <div class="item-info">
                      <div class="item-name">{{ item.nombre || 'Producto' }}</div>
                      <div class="item-code">{{ item.codigo || 'Sin código' }}</div>
                      <div v-if="item.stockDisponible !== undefined" class="item-stock">
                        <i class="fas fa-cube"></i>
                        Stock: <strong :class="item.cantidad > item.stockDisponible ? 'text-danger' : ''">
                          {{ item.stockDisponible }}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div class="item-controls">
                    <div class="control-group">
                      <label>Cantidad</label>
                      <div class="qty-control">
                        <button type="button" @click="cambiarCantidad(index, -1)">
                          <i class="fas fa-minus"></i>
                        </button>
                        <input
                          type="number"
                          v-model.number="item.cantidad"
                          min="0.01"
                          step="0.01"
                          @blur="validarCantidad(index)"
                        />
                        <button type="button" @click="cambiarCantidad(index, 1)">
                          <i class="fas fa-plus"></i>
                        </button>
                      </div>
                    </div>

                    <div class="control-group">
                      <label>Precio unit.</label>
                      <div class="price-input">
                        <span>$</span>
                        <input type="number" v-model.number="item.precio_unitario" min="0" step="0.01" />
                      </div>
                    </div>

                    <div class="control-group">
                      <label>IVA</label>
                      <select class="form-select form-select-sm" v-model="item.aplica_iva">
                        <option :value="true">15%</option>
                        <option :value="false">0%</option>
                      </select>
                    </div>

                    <div class="control-group control-subtotal">
                      <label>Subtotal</label>
                      <div class="subtotal-value">
                        ${{ ((item.cantidad || 0) * (item.precio_unitario || 0)).toFixed(2) }}
                      </div>
                    </div>

                    <button class="item-remove" @click="eliminarDetalle(index)" title="Quitar">
                      <i class="fas fa-times"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- SECCIÓN: Guía de Remisión (colapsable) -->
          <section v-if="venta.tipo_documento === 'guia_remision'" class="form-section">
            <header class="section-header section-header-clickable" @click="toggleSeccion('guia')">
              <div class="section-number">4</div>
              <div class="section-header-content">
                <h2 class="section-title">Datos de la Guía de Remisión</h2>
                <p class="section-desc">Información del traslado y transportista</p>
              </div>
              <i class="fas toggle-chevron" :class="seccionesExpandidas.guia ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            </header>
            <transition name="collapse">
              <div v-show="seccionesExpandidas.guia" class="section-body">
                <!-- Sub-sección: Generales -->
                <div class="subsection">
                  <h3 class="subsection-title">
                    <i class="fas fa-store"></i> Datos Generales
                  </h3>
                  <div class="form-row cols-3">
                    <div class="form-field">
                      <label class="form-label"><span class="required">*</span> Establecimiento</label>
                      <input type="text" class="form-control" v-model="venta.establecimiento" />
                    </div>
                    <div class="form-field">
                      <label class="form-label"><span class="required">*</span> Nombre Comercial</label>
                      <input type="text" class="form-control" v-model="venta.nombre_comercial" />
                    </div>
                    <div class="form-field">
                      <label class="form-label"><span class="required">*</span> Punto de Emisión</label>
                      <input type="text" class="form-control" v-model="venta.punto_emision" />
                    </div>
                  </div>
                </div>

                <!-- Sub-sección: Destinatario -->
                <div class="subsection">
                  <h3 class="subsection-title">
                    <i class="fas fa-user"></i> Destinatario
                  </h3>
                  <div class="form-row cols-4">
                    <div class="form-field">
                      <label class="form-label"><span class="required">*</span> Identificación</label>
                      <input type="text" class="form-control" v-model="venta.destinatario_identificacion" />
                    </div>
                    <div class="form-field">
                      <label class="form-label"><span class="required">*</span> Tipo ID</label>
                      <SelectSRI v-model="venta.destinatario_tipo" :lista="catalogos.TIPO_IDENTIFICACION || []" placeholder="Seleccione..." />
                    </div>
                    <div class="form-field">
                      <label class="form-label"><span class="required">*</span> Razón Social</label>
                      <input type="text" class="form-control" v-model="venta.destinatario_razon_social" />
                    </div>
                    <div class="form-field">
                      <label class="form-label"><span class="required">*</span> Dirección Destino</label>
                      <input type="text" class="form-control" v-model="venta.destinatario_direccion" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Ruta</label>
                      <input type="text" class="form-control" v-model="venta.ruta" />
                    </div>
                    <div class="form-field">
                      <label class="form-label"><span class="required">*</span> Motivo</label>
                      <input type="text" class="form-control" v-model="venta.motivo" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Doc. Aduanero</label>
                      <input type="text" class="form-control" v-model="venta.documento_aduana" />
                    </div>
                  </div>
                </div>

                <!-- Sub-sección: Comprobante Sustento -->
                <div class="subsection">
                  <h3 class="subsection-title">
                    <i class="fas fa-file-alt"></i> Comprobante de Sustento
                  </h3>
                  <div class="form-row cols-3">
                    <div class="form-field">
                      <label class="form-label">Tipo Emisión</label>
                      <select class="form-select" v-model="venta.comprobante_tipo_emision">
                        <option value="">Seleccione</option>
                        <option value="Física">Física</option>
                        <option value="Electrónica">Electrónica</option>
                      </select>
                    </div>
                    <div class="form-field">
                      <label class="form-label">Tipo Comprobante</label>
                      <SelectSRI v-model="venta.comprobante_documento" :lista="catalogos.DOCUMENTO_SUSTENTO || []" placeholder="Seleccione..." />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Nº Comprobante</label>
                      <input type="text" class="form-control" v-model="venta.comprobante_numero" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Clave de Acceso</label>
                      <input type="text" class="form-control" v-model="venta.comprobante_clave_acceso" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Nº Autorización</label>
                      <input type="text" class="form-control" v-model="venta.comprobante_numero_autorizacion" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Fecha Emisión</label>
                      <input type="date" class="form-control" v-model="venta.comprobante_fecha_emision" />
                    </div>
                  </div>
                </div>

                <!-- Sub-sección: Transportista -->
                <div class="subsection">
                  <h3 class="subsection-title">
                    <i class="fas fa-truck"></i> Transportista
                  </h3>
                  <div class="form-row cols-4">
                    <div class="form-field">
                      <label class="form-label">Identificación</label>
                      <input type="text" class="form-control" v-model="venta.transportista_identificacion" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Tipo ID</label>
                      <SelectSRI v-model="venta.transportista_tipo" :lista="catalogos.TIPO_IDENTIFICACION || []" placeholder="Seleccione..." />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Razón Social</label>
                      <input type="text" class="form-control" v-model="venta.transportista_razon_social" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Correo</label>
                      <input type="email" class="form-control" v-model="venta.transportista_correo" />
                    </div>
                  </div>
                </div>

                <!-- Sub-sección: Traslado -->
                <div class="subsection">
                  <h3 class="subsection-title">
                    <i class="fas fa-route"></i> Traslado
                  </h3>
                  <div class="form-row cols-4">
                    <div class="form-field">
                      <label class="form-label">Dirección Partida</label>
                      <input type="text" class="form-control" v-model="venta.direccion_partida" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Inicio Transporte</label>
                      <input type="datetime-local" class="form-control" v-model="venta.inicio_transporte" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Fin Transporte</label>
                      <input type="datetime-local" class="form-control" v-model="venta.fin_transporte" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Placa</label>
                      <input type="text" class="form-control" v-model="venta.placa_transporte" />
                    </div>
                  </div>
                </div>
              </div>
            </transition>
          </section>

          <!-- SECCIÓN: Información de Pago -->
          <section v-if="venta.tipo_documento !== 'guia_remision'" class="form-section">
            <header class="section-header section-header-clickable" @click="toggleSeccion('pago')">
              <div class="section-number">
                <i class="fas fa-credit-card"></i>
              </div>
              <div class="section-header-content">
                <h2 class="section-title">Información de Pago</h2>
                <p class="section-desc">Forma, estado y fecha de pago</p>
              </div>
              <i class="fas toggle-chevron" :class="seccionesExpandidas.pago ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            </header>
            <transition name="collapse">
              <div v-show="seccionesExpandidas.pago" class="section-body">
                <div class="form-row cols-3">
                  <div class="form-field">
                    <label class="form-label">Forma de pago</label>
                    <SelectSRI v-model="venta.forma_pago" :lista="catalogos.FORMA_PAGO || []" placeholder="Seleccione..." />
                  </div>
                  <div class="form-field">
                    <label class="form-label">Estado de pago</label>
                    <select class="form-select" v-model="venta.estado_pago">
                      <option value="pendiente">Pendiente</option>
                      <option value="pagado">Pagado</option>
                      <option value="parcial">Pago Parcial</option>
                    </select>
                  </div>
                  <div class="form-field">
                    <label class="form-label">Fecha de pago</label>
                    <input type="date" class="form-control" v-model="venta.fecha_pago" />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-field">
                    <label class="form-label">Observaciones</label>
                    <textarea
                      class="form-control"
                      v-model="venta.observaciones"
                      rows="3"
                      placeholder="Notas adicionales sobre el pago, referencias, etc."
                    ></textarea>
                  </div>
                </div>
              </div>
            </transition>
          </section>
        </div>

        <!-- ============ SIDEBAR RESUMEN ============ -->
        <aside class="form-sidebar">
          <div class="sidebar-sticky">
            <!-- Resumen -->
            <div class="summary-card">
              <div class="summary-header">
                <i class="fas fa-calculator"></i>
                <span>Resumen del documento</span>
              </div>
              <div class="summary-body">
                <div class="summary-row">
                  <span class="summary-label">Productos</span>
                  <span class="summary-value">{{ venta.detalles.length }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Subtotal</span>
                  <span class="summary-value">${{ subtotal.toFixed(2) }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">IVA 15%</span>
                  <span class="summary-value">${{ iva.toFixed(2) }}</span>
                </div>
                <div class="summary-divider"></div>
                <div class="summary-total">
                  <span class="total-label">TOTAL</span>
                  <span class="total-value">${{ total.toFixed(2) }}</span>
                </div>
              </div>
            </div>

            <!-- Estado del formulario -->
            <div class="status-card">
              <div class="status-item" :class="{ complete: venta.clienteId || venta.tipo_documento === 'guia_remision' }">
                <i :class="venta.clienteId || venta.tipo_documento === 'guia_remision' ? 'fas fa-check-circle' : 'far fa-circle'"></i>
                <span>Cliente seleccionado</span>
              </div>
              <div class="status-item" :class="{ complete: venta.detalles.length > 0 }">
                <i :class="venta.detalles.length > 0 ? 'fas fa-check-circle' : 'far fa-circle'"></i>
                <span>Productos agregados</span>
              </div>
              <div class="status-item" :class="{ complete: venta.fecha_emision }">
                <i :class="venta.fecha_emision ? 'fas fa-check-circle' : 'far fa-circle'"></i>
                <span>Fecha establecida</span>
              </div>
            </div>

            <!-- Acciones -->
            <div class="actions-card">
              <button
                type="submit"
                class="btn-save"
                :disabled="cargando || !formularioValido || !!periodoCerrado"
              >
                <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
                <span>{{ cargando ? 'Guardando...' : 'Guardar documento' }}</span>
                <kbd>Ctrl+↵</kbd>
              </button>
              <button type="button" class="btn-cancel" @click="$router.push('/ventas')">
                <i class="fas fa-times"></i>
                <span>Cancelar</span>
              </button>
            </div>

            <!-- Info clave -->
            <div v-if="puedeGenerarClave && configEmpresaOk" class="info-card">
              <i class="fas fa-key"></i>
              <div>
                <div class="info-title">Clave de acceso</div>
                <div class="info-text">
                  Se generarán <strong>49 dígitos</strong> automáticamente al guardar
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <!-- Errores -->
      <transition name="fade">
        <div v-if="errorGeneral" class="error-banner">
          <i class="fas fa-exclamation-circle"></i>
          <span>{{ errorGeneral }}</span>
        </div>
      </transition>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'
import { roundTo2 } from '../../utils/formatters'
import { useToast } from 'vue-toastification'
import { useCatalogosSRI } from '../../composables/useCatalogosSRI'
import SelectSRI from '../shared/SelectSRI.vue'
import AlertaPeriodoCerrado from '../shared/AlertaPeriodoCerrado.vue'
import { api } from '../../services/api'
import Fuse from 'fuse.js'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { find, findById, insertOne, updateOne } = useMongoDB()
const { catalogos, cargarCatalogos } = useCatalogosSRI()

const clientes = ref([])
const productos = ref([])
const cargando = ref(false)
const errorGeneral = ref('')
const periodoCerrado = ref(null)
const configEmpresa = ref(null)

const tipoInicial = route.query.tipo || 'factura'
const id = route.params.id

const inputCliente = ref(null)
const inputProducto = ref(null)
const busquedaCliente = ref('')
const busquedaProducto = ref('')
const mostrarListaClientes = ref(false)
const mostrarListaProductos = ref(false)
const mostrarAyuda = ref(false)
let fuseClientes = null
let fuseProductos = null

const seccionesExpandidas = ref({
  guia: false,
  pago: true
})

const venta = ref({
  clienteId: '',
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  tipo_documento: tipoInicial,
  detalles: [],
  numero_guia: '',
  transportista: '',
  placa: '',
  numero_exportacion: '',
  pais_destino: '',
  numero_retencion: '',
  porcentaje_retencion: 0,
  establecimiento: '',
  nombre_comercial: '',
  punto_emision: '',
  transportista_identificacion: '',
  transportista_tipo: '',
  transportista_razon_social: '',
  transportista_correo: '',
  direccion_partida: '',
  inicio_transporte: '',
  fin_transporte: '',
  placa_transporte: '',
  destinatario_identificacion: '',
  destinatario_tipo: '',
  destinatario_razon_social: '',
  destinatario_direccion: '',
  ruta: '',
  motivo: '',
  documento_aduana: '',
  comprobante_tipo_emision: '',
  comprobante_documento: '',
  comprobante_buscar: '',
  comprobante_clave_acceso: '',
  comprobante_numero_autorizacion: '',
  comprobante_numero: '',
  comprobante_fecha_emision: '',
  forma_pago: '',
  estado_pago: 'pendiente',
  fecha_pago: '',
  observaciones: ''
})

const errores = ref({ cliente: '', detalles: [] })

// ===== CONFIG =====
const configEmpresaOk = computed(() => configEmpresa.value?.ruc && configEmpresa.value.ruc.length === 13)
const seriePreview = computed(() => {
  const est = (configEmpresa.value?.establecimiento || '001').padStart(3, '0')
  const pe = (configEmpresa.value?.punto_emision || '001').padStart(3, '0')
  return `${est}-${pe}`
})

// ===== COMPUTED =====
const tituloDocumento = computed(() => {
  const titulos = {
    factura: 'Nueva Factura',
    guia_remision: 'Guía de Remisión',
    exportacion: 'Factura de Exportación',
    reembolso: 'Factura de Reembolso',
    retencion: 'Comprobante de Retención',
    liquidacion: 'Liquidación de Compra',
    nota_credito: 'Nota de Crédito',
    proforma: 'Proforma'
  }
  const base = titulos[venta.value.tipo_documento] || 'Documento'
  return id ? `Editar ${base}` : base
})

const clienteActual = computed(() => {
  if (!venta.value.clienteId) return null
  if (!Array.isArray(clientes.value)) return null
  return clientes.value.find(c => c._id === venta.value.clienteId) || null
})

const clientesFiltrados = computed(() => {
  try {
    if (!busquedaCliente.value.trim()) {
      return Array.isArray(clientes.value) ? clientes.value.slice(0, 20) : []
    }
    if (!fuseClientes) return []
    return fuseClientes.search(busquedaCliente.value.trim()).map(r => r.item)
  } catch (e) { return [] }
})

const productosFiltrados = computed(() => {
  try {
    if (!busquedaProducto.value.trim()) {
      return Array.isArray(productos.value) ? productos.value.slice(0, 20) : []
    }
    if (!fuseProductos) return []
    return fuseProductos.search(busquedaProducto.value.trim()).map(r => r.item)
  } catch (e) { return [] }
})

const subtotal = computed(() => {
  if (!Array.isArray(venta.value.detalles)) return 0
  return roundTo2(venta.value.detalles.reduce((acc, d) => acc + ((d.cantidad || 0) * (d.precio_unitario || 0)), 0))
})

const iva = computed(() => {
  if (!Array.isArray(venta.value.detalles)) return 0
  let base = 0
  venta.value.detalles.forEach(d => {
    if (d.aplica_iva !== false) base += (d.cantidad || 0) * (d.precio_unitario || 0)
  })
  return roundTo2(base * 0.15)
})

const total = computed(() => roundTo2(subtotal.value + iva.value))

const formularioValido = computed(() => {
  if (venta.value.tipo_documento !== 'guia_remision' && !venta.value.clienteId) return false
  if (!Array.isArray(venta.value.detalles) || venta.value.detalles.length === 0) return false
  return venta.value.detalles.every(d => d.productoId && d.cantidad > 0 && d.precio_unitario >= 0)
})

const puedeGenerarClave = computed(() => {
  return ['factura', 'liquidacion', 'nota_credito', 'guia_remision', 'retencion', 'exportacion', 'reembolso'].includes(venta.value.tipo_documento)
})

// ===== HELPERS =====
const getInitials = (nombre) => {
  if (!nombre) return '?'
  return String(nombre).split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

const generarCodigoLocal = (tipo) => {
  const prefijos = {
    'factura': 'FAC', 'guia_remision': 'GUI', 'exportacion': 'EXP', 'reembolso': 'REB',
    'retencion': 'RET', 'liquidacion': 'LIQ', 'nota_credito': 'NCR', 'proforma': 'PRO'
  }
  const prefijo = prefijos[tipo] || 'DOC'
  return `${prefijo}-${String(Date.now()).slice(-6)}`
}

const toggleSeccion = (nombre) => {
  seccionesExpandidas.value[nombre] = !seccionesExpandidas.value[nombre]
}

// ===== BÚSQUEDA CLIENTES =====
const filtrarClientes = () => { mostrarListaClientes.value = true }
const cerrarListaClientes = () => { setTimeout(() => { mostrarListaClientes.value = false }, 200) }

const seleccionarCliente = (c) => {
  venta.value.clienteId = c._id
  busquedaCliente.value = ''
  mostrarListaClientes.value = false
  errores.value.cliente = ''
}

const limpiarCliente = () => {
  venta.value.clienteId = ''
  busquedaCliente.value = ''
  nextTick(() => inputCliente.value?.focus())
}

// ===== BÚSQUEDA PRODUCTOS =====
const filtrarProductos = () => { mostrarListaProductos.value = true }
const cerrarListaProductos = () => { setTimeout(() => { mostrarListaProductos.value = false }, 200) }
const limpiarBusquedaProducto = () => { busquedaProducto.value = ''; mostrarListaProductos.value = false }
const focusBusquedaProducto = () => { inputProducto.value?.focus() }

const agregarPrimerProducto = () => {
  if (productosFiltrados.value.length > 0) agregarProducto(productosFiltrados.value[0])
}

const agregarProducto = (p) => {
  if (!p || !p._id) return
  const existente = venta.value.detalles.find(d => d.productoId === p._id)
  if (existente) {
    existente.cantidad = (existente.cantidad || 1) + 1
    toast.info(`${p.nombre} aumentado a ${existente.cantidad}`)
  } else {
    venta.value.detalles.push({
      productoId: p._id,
      codigo: p.codigo || '',
      nombre: p.nombre || 'Producto',
      cantidad: 1,
      precio_unitario: roundTo2(p.precio_venta || 0),
      aplica_iva: p.aplica_iva !== undefined ? p.aplica_iva : true,
      stockDisponible: p.stock || 0
    })
    errores.value.detalles.push({ producto: '', cantidad: '', precio: '' })
  }
  busquedaProducto.value = ''
  mostrarListaProductos.value = false
  nextTick(() => inputProducto.value?.focus())
}

const cambiarCantidad = (index, delta) => {
  const item = venta.value.detalles[index]
  const nueva = (item.cantidad || 0) + delta
  if (nueva < 0.01) return
  item.cantidad = roundTo2(nueva)
}

const validarCantidad = (index) => {
  const item = venta.value.detalles[index]
  if (!item.cantidad || item.cantidad <= 0) item.cantidad = 1
}

const eliminarDetalle = (index) => {
  venta.value.detalles.splice(index, 1)
  errores.value.detalles.splice(index, 1)
}

// ===== TIPO =====
const asignarCodigos = () => {
  const tipo = venta.value.tipo_documento
  venta.value.numero_factura = generarCodigoLocal(tipo)
  if (tipo === 'exportacion') venta.value.numero_exportacion = generarCodigoLocal('exportacion')
  if (tipo === 'guia_remision') venta.value.numero_guia = generarCodigoLocal('guia_remision')
  if (tipo === 'retencion') venta.value.numero_retencion = generarCodigoLocal('retencion')
}

const cambiarTipo = () => {
  Object.assign(venta.value, {
    numero_guia: '', transportista: '', placa: '', numero_exportacion: '', pais_destino: '',
    numero_retencion: '', porcentaje_retencion: 0, establecimiento: '', nombre_comercial: '',
    punto_emision: '', transportista_identificacion: '', transportista_tipo: '',
    transportista_razon_social: '', transportista_correo: '', direccion_partida: '',
    inicio_transporte: '', fin_transporte: '', placa_transporte: '',
    destinatario_identificacion: '', destinatario_tipo: '', destinatario_razon_social: '',
    destinatario_direccion: '', ruta: '', motivo: '', documento_aduana: '',
    comprobante_tipo_emision: '', comprobante_documento: '', comprobante_buscar: '',
    comprobante_clave_acceso: '', comprobante_numero_autorizacion: '', comprobante_numero: '',
    comprobante_fecha_emision: ''
  })
  if (!id) asignarCodigos()
}

// ===== PERIODO =====
const verificarPeriodo = async () => {
  if (!venta.value.fecha_emision) { periodoCerrado.value = null; return }
  try {
    const fecha = new Date(venta.value.fecha_emision)
    const res = await api.request(`/periodos/verificar/${fecha.getFullYear()}/${fecha.getMonth() + 1}`, { method: 'GET' })
    periodoCerrado.value = res.cerrado ? res.periodo : null
  } catch (e) { periodoCerrado.value = null }
}

// ===== ATAJOS =====
const handleKeydown = (e) => {
  if (e.key === 'F2') {
    e.preventDefault()
    inputProducto.value?.focus()
  } else if (e.key === 'F3') {
    e.preventDefault()
    inputCliente.value?.focus()
  } else if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault()
    if (formularioValido.value && !cargando.value) guardar()
  }
}

// ===== CARGA INICIAL =====
const cargarConfigEmpresa = async () => {
  try {
    configEmpresa.value = await api.request('/configuracion/empresa', { method: 'GET' })
  } catch (e) { configEmpresa.value = null }
}

onMounted(async () => {
  try {
    try { await cargarCatalogos() } catch (e) { console.warn(e) }
    await cargarConfigEmpresa()

    const [clis, prods] = await Promise.all([find('clientes'), find('productos')])
    clientes.value = Array.isArray(clis) ? clis : []
    productos.value = Array.isArray(prods) ? prods : []

    try {
      if (clientes.value.length > 0) {
        fuseClientes = new Fuse(clientes.value, { keys: ['nombre', 'ruc', 'telefono', 'email'], threshold: 0.3 })
      }
      if (productos.value.length > 0) {
        fuseProductos = new Fuse(productos.value, { keys: ['nombre', 'codigo', 'codigo_barras'], threshold: 0.3 })
      }
    } catch (e) { console.warn(e) }

    if (id) {
      const data = await findById('ventas', id)
      if (data) {
        if (data.detalles) {
          data.detalles = data.detalles.map(d => {
            const prod = productos.value.find(p => p._id === d.productoId)
            return {
              ...d,
              codigo: prod?.codigo || d.codigo || '',
              nombre: prod?.nombre || d.nombre || 'Producto',
              stockDisponible: prod?.stock || 0
            }
          })
        }
        venta.value = { ...venta.value, ...data }
      } else {
        errorGeneral.value = 'No se encontró el documento'
      }
    } else {
      asignarCodigos()
    }

    document.addEventListener('keydown', handleKeydown)
  } catch (e) {
    console.error(e)
    errorGeneral.value = 'Error al cargar datos: ' + e.message
  }
})

onBeforeUnmount(() => { document.removeEventListener('keydown', handleKeydown) })

watch(() => venta.value.fecha_emision, verificarPeriodo, { immediate: true })

// ===== GUARDAR =====
const guardar = async () => {
  if (periodoCerrado.value) {
    toast.error(`No se puede guardar: ${periodoCerrado.value.nombre} está cerrado`)
    return
  }

  if (!formularioValido.value) {
    errorGeneral.value = 'Corrija los errores antes de guardar'
    toast.warning('Verifica los datos')
    return
  }

  if (puedeGenerarClave.value && !configEmpresaOk.value) {
    const confirmar = confirm(
      'La empresa no tiene un RUC válido configurado.\n\n' +
      'El documento se guardará pero NO se generará la clave de acceso.\n\n' +
      '¿Deseas continuar?'
    )
    if (!confirmar) {
      router.push('/configuracion-empresa')
      return
    }
  }

  errorGeneral.value = ''
  cargando.value = true

  try {
    const payload = {
      clienteId: venta.value.clienteId || '',
      numero_factura: venta.value.numero_factura,
      fecha_emision: venta.value.fecha_emision,
      tipo_documento: venta.value.tipo_documento,
      detalles: venta.value.detalles.map(d => ({
        productoId: d.productoId,
        cantidad: roundTo2(d.cantidad),
        precio_unitario: roundTo2(d.precio_unitario),
        aplica_iva: d.aplica_iva
      })),
      subtotal: roundTo2(subtotal.value),
      iva: roundTo2(iva.value),
      total: roundTo2(total.value),
      ...Object.fromEntries([
        'numero_guia', 'transportista', 'placa', 'numero_exportacion', 'pais_destino',
        'numero_retencion', 'porcentaje_retencion', 'establecimiento', 'nombre_comercial',
        'punto_emision', 'transportista_identificacion', 'transportista_tipo',
        'transportista_razon_social', 'transportista_correo', 'direccion_partida',
        'inicio_transporte', 'fin_transporte', 'placa_transporte',
        'destinatario_identificacion', 'destinatario_tipo', 'destinatario_razon_social',
        'destinatario_direccion', 'ruta', 'motivo', 'documento_aduana',
        'comprobante_tipo_emision', 'comprobante_documento', 'comprobante_buscar',
        'comprobante_clave_acceso', 'comprobante_numero_autorizacion', 'comprobante_numero',
        'comprobante_fecha_emision', 'forma_pago', 'estado_pago', 'observaciones'
      ].map(k => [k, venta.value[k] || ''])),
      fecha_pago: venta.value.fecha_pago || null
    }

    if (id) {
      await updateOne('ventas', id, payload)
      toast.success('Documento actualizado correctamente')
    } else {
      const res = await insertOne('ventas', payload)
      if (res?.clave_acceso) {
        toast.success('Documento creado con clave de acceso')
      } else {
        toast.success('Documento creado exitosamente')
      }
    }
    router.push('/ventas')
  } catch (e) {
    errorGeneral.value = 'Error al guardar: ' + e.message
    toast.error('Error: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>

<style scoped>
.venta-form {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 0 40px;
}

/* ============================================================
   HEADER
   ============================================================ */
.form-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}
.btn-back {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  transition: all var(--transition);
  flex-shrink: 0;
}
.btn-back:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  transform: translateX(-3px);
}

.form-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 4px;
}
.title-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  box-shadow: 0 6px 16px rgba(52, 152, 219, 0.3);
}
.form-subtitle {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
  padding-left: 54px;
}

.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}
.btn-ghost:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

/* ============================================================
   ATAJOS
   ============================================================ */
.shortcuts-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  margin-bottom: 20px;
  box-shadow: var(--shadow-sm);
}
.shortcuts-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.shortcuts-title i {
  color: var(--warning);
}
.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.shortcut-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  color: var(--text-muted);
}
kbd {
  background: var(--bg-table-stripe);
  color: var(--text-primary);
  padding: 3px 8px;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  border: 1px solid var(--border-color);
  box-shadow: 0 1px 0 var(--border-strong);
  min-width: 26px;
  text-align: center;
}

/* ============================================================
   ALERT BOXES
   ============================================================ */
.alert-box {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: var(--radius-lg);
  margin-bottom: 20px;
  border: 1px solid;
}
.alert-box.alert-danger {
  background: var(--danger-bg);
  border-color: rgba(231, 76, 60, 0.3);
}
.alert-box.alert-success {
  background: var(--success-bg);
  border-color: rgba(39, 174, 96, 0.3);
}
.alert-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.alert-danger .alert-icon {
  background: rgba(231, 76, 60, 0.15);
  color: var(--danger);
}
.alert-success .alert-icon {
  background: rgba(39, 174, 96, 0.15);
  color: var(--success);
}
.alert-body { flex: 1; min-width: 0; }
.alert-title {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.alert-text {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.4;
}
.alert-text code {
  background: var(--bg-table-stripe);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--primary-color);
}
.alert-action {
  padding: 8px 16px;
  background: var(--danger);
  color: #fff;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.82rem;
  text-decoration: none;
  transition: all var(--transition);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.alert-action:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(231, 76, 60, 0.35);
  color: #fff;
}

/* ============================================================
   FORM LAYOUT
   ============================================================ */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 24px;
  align-items: start;
}

.form-main {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

/* ============================================================
   SECCIONES
   ============================================================ */
.form-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all var(--transition);
}
.form-section.card-with-dropdown {
  overflow: visible;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-light);
  background: linear-gradient(135deg, var(--bg-table-stripe), var(--bg-card));
}
.section-header-clickable {
  cursor: pointer;
  user-select: none;
}
.section-header-clickable:hover {
  background: var(--bg-table-stripe);
}

.section-number {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.9rem;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.25);
}
.section-number i {
  font-size: 0.95rem;
}

.section-header-content {
  flex: 1;
  min-width: 0;
}
.section-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 2px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-desc {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}

.count-badge {
  background: var(--primary-color);
  color: #fff;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 700;
}

.btn-new-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.78rem;
  text-decoration: none;
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
  font-family: inherit;
}
.btn-new-inline:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}
.btn-new-inline.btn-new-primary {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}
.btn-new-inline.btn-new-primary:hover {
  background: var(--primary-hover);
  color: #fff;
}

.toggle-chevron {
  color: var(--text-muted);
  transition: transform var(--transition);
}

.section-body {
  padding: 24px;
}

/* ============================================================
   SUBSECCIONES
   ============================================================ */
.subsection {
  margin-bottom: 24px;
}
.subsection:last-child {
  margin-bottom: 0;
}
.subsection-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border-light);
}
.subsection-title i {
  color: var(--primary-color);
}

/* ============================================================
   FORM FIELDS
   ============================================================ */
.form-row {
  display: grid;
  gap: 16px;
  margin-bottom: 16px;
}
.form-row:last-child { margin-bottom: 0; }
.form-row.cols-3 { grid-template-columns: repeat(3, 1fr); }
.form-row.cols-4 { grid-template-columns: repeat(4, 1fr); }
.form-row.cols-2-1-1 { grid-template-columns: 2fr 1fr 1fr; }

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.form-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.1px;
}
.form-label .required {
  color: var(--danger);
  margin-right: 2px;
}

.form-control,
.form-select {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.88rem;
  font-family: inherit;
  transition: all var(--transition-fast);
  outline: none;
}
.form-control:focus,
.form-select:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 4px var(--shadow-focus);
  background: var(--bg-card);
}
.form-control::placeholder {
  color: var(--text-muted);
}

/* ============================================================
   SEARCH INPUT
   ============================================================ */
.search-input-group {
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 16px;
  color: var(--text-muted);
  font-size: 0.9rem;
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 14px 50px 14px 46px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  transition: all var(--transition-fast);
  outline: none;
}
.search-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 4px var(--shadow-focus);
  background: var(--bg-card);
}
.search-input-primary .search-icon {
  color: var(--primary-color);
}
.search-input-primary .search-input:focus {
  border-color: var(--primary-color);
}
.search-clear {
  position: absolute;
  right: 12px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 8px;
  border-radius: var(--radius-xs);
  transition: all var(--transition-fast);
}
.search-clear:hover {
  color: var(--danger);
  background: var(--danger-bg);
}

/* ============================================================
   SEARCH DROPDOWN
   ============================================================ */
.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  max-height: 400px;
  overflow-y: auto;
  padding: 6px;
}
.search-empty {
  text-align: center;
  padding: 24px 16px;
  color: var(--text-muted);
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.dropdown-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.dropdown-row:hover {
  background: var(--bg-table-stripe);
}

.row-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.75rem;
  flex-shrink: 0;
}
.row-avatar-product {
  background: linear-gradient(135deg, #f39c12, #d68910);
  font-size: 0.9rem;
}

.row-content {
  flex: 1;
  min-width: 0;
}
.row-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.88rem;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.72rem;
  color: var(--text-muted);
  flex-wrap: wrap;
}
.row-meta code {
  background: var(--bg-table-stripe);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  color: var(--primary-color);
}
.stock-ok {
  color: var(--success);
}
.stock-zero {
  color: var(--danger);
}

.row-price {
  text-align: right;
  flex-shrink: 0;
}
.price-value {
  font-weight: 800;
  color: var(--primary-color);
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
}
.price-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
}
.row-check {
  color: var(--primary-color);
  font-size: 1rem;
  flex-shrink: 0;
}

/* ============================================================
   CLIENTE CARD
   ============================================================ */
.cliente-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  margin-top: 16px;
  background: linear-gradient(135deg, rgba(52, 152, 219, 0.05), rgba(52, 152, 219, 0.02));
  border: 1px solid rgba(52, 152, 219, 0.2);
  border-radius: var(--radius-md);
  border-left: 4px solid var(--primary-color);
}
.cliente-avatar-large {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1rem;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
}
.cliente-details { flex: 1; min-width: 0; }
.cliente-name {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 1rem;
  margin-bottom: 6px;
}
.cliente-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px 16px;
  font-size: 0.78rem;
  color: var(--text-secondary);
}
.cliente-meta-grid strong {
  color: var(--text-muted);
  font-weight: 600;
  margin-right: 4px;
}
.cliente-change {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
.cliente-change:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--info-bg);
}

/* ============================================================
   ITEMS
   ============================================================ */
.empty-items {
  text-align: center;
  padding: 48px 20px;
}
.empty-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--bg-table-stripe);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 1.8rem;
  margin: 0 auto 14px;
}
.empty-title {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 0.95rem;
  margin-bottom: 4px;
}
.empty-text {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  background: var(--bg-table-stripe);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
  flex-wrap: wrap;
}
.item-card:hover {
  border-color: var(--primary-color);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.item-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 200px;
}
.item-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.item-info { min-width: 0; flex: 1; }
.item-name {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 0.9rem;
  margin-bottom: 2px;
}
.item-code {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
}
.item-stock {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.item-controls {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.control-group label {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.qty-control {
  display: flex;
  align-items: center;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.qty-control button {
  width: 32px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: 0.75rem;
}
.qty-control button:hover {
  background: var(--info-bg);
  color: var(--primary-color);
}
.qty-control input {
  width: 60px;
  height: 36px;
  border: none;
  text-align: center;
  font-weight: 700;
  font-size: 0.9rem;
  background: transparent;
  color: var(--text-primary);
  outline: none;
  font-family: inherit;
}
.qty-control input::-webkit-outer-spin-button,
.qty-control input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.price-input {
  display: flex;
  align-items: center;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
  height: 36px;
}
.price-input span {
  padding: 0 8px;
  color: var(--text-muted);
  font-weight: 700;
  font-size: 0.85rem;
}
.price-input input {
  width: 80px;
  height: 100%;
  border: none;
  background: transparent;
  padding: 0 10px 0 0;
  font-weight: 700;
  font-size: 0.88rem;
  color: var(--text-primary);
  outline: none;
  font-family: inherit;
}

.control-subtotal {
  min-width: 100px;
}
.subtotal-value {
  padding: 9px 12px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-weight: 800;
  color: var(--primary-color);
  font-size: 0.9rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.item-remove {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: 0.85rem;
}
.item-remove:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: var(--danger-bg);
}

/* ============================================================
   SIDEBAR
   ============================================================ */
.form-sidebar {
  position: relative;
}
.sidebar-sticky {
  position: sticky;
  top: 90px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.summary-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.summary-header {
  padding: 14px 20px;
  background: linear-gradient(135deg, var(--primary-dark), #1a2a3a);
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 10px;
}
.summary-header i {
  color: var(--accent-color);
}
.summary-body {
  padding: 20px;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  font-size: 0.88rem;
}
.summary-label {
  color: var(--text-muted);
  font-weight: 500;
}
.summary-value {
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.summary-divider {
  height: 1px;
  background: var(--border-light);
  margin: 8px 0;
}
.summary-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0 4px;
  border-top: 2px solid var(--primary-color);
}
.total-label {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}
.total-value {
  font-size: 1.65rem;
  font-weight: 800;
  color: var(--primary-color);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
}

.status-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.status-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.82rem;
  color: var(--text-muted);
  transition: color var(--transition-fast);
}
.status-item i {
  font-size: 0.95rem;
  color: var(--border-strong);
  transition: color var(--transition-fast);
}
.status-item.complete {
  color: var(--text-primary);
  font-weight: 500;
}
.status-item.complete i {
  color: var(--success);
}

.actions-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.btn-save {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 20px;
  background: linear-gradient(135deg, var(--success), #1e8449);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
  font-family: inherit;
  position: relative;
}
.btn-save:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(39, 174, 96, 0.4);
}
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
.btn-save kbd {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
  box-shadow: none;
  padding: 2px 6px;
  font-size: 0.65rem;
}

.btn-cancel {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}
.btn-cancel:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: var(--danger-bg);
}

.info-card {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(241, 196, 15, 0.08), rgba(230, 126, 34, 0.04));
  border: 1px solid rgba(241, 196, 15, 0.25);
  border-radius: var(--radius-lg);
}
.info-card > i {
  color: var(--warning);
  font-size: 1.15rem;
  flex-shrink: 0;
  margin-top: 2px;
}
.info-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.info-text {
  font-size: 0.75rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* ============================================================
   ERROR BANNER
   ============================================================ */
.error-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: var(--danger-bg);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-left: 4px solid var(--danger);
  border-radius: var(--radius-md);
  color: var(--danger);
  font-weight: 500;
  font-size: 0.88rem;
  margin-top: 20px;
}
.error-banner i {
  font-size: 1.1rem;
}

/* ============================================================
   TRANSICIONES
   ============================================================ */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s var(--ease-out);
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s var(--ease-out);
  overflow: hidden;
}
.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
}
.collapse-enter-to,
.collapse-leave-from {
  max-height: 2000px;
  opacity: 1;
}

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (max-width: 1200px) {
  .form-grid {
    grid-template-columns: 1fr 300px;
  }
}

@media (max-width: 992px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .sidebar-sticky {
    position: static;
  }
  .form-row.cols-3,
  .form-row.cols-4,
  .form-row.cols-2-1-1 {
    grid-template-columns: 1fr 1fr;
  }
  .cliente-meta-grid {
    grid-template-columns: 1fr;
  }
  .item-controls {
    width: 100%;
  }
}

@media (max-width: 576px) {
  .form-header {
    gap: 12px;
  }
  .btn-back { width: 38px; height: 38px; }
  .title-icon { width: 36px; height: 36px; font-size: 1rem; }
  .form-title { font-size: 1.2rem; }
  .form-subtitle { padding-left: 0; font-size: 0.78rem; }
  .section-header { padding: 16px 18px; }
  .section-body { padding: 18px; }
  .form-row.cols-3,
  .form-row.cols-4,
  .form-row.cols-2-1-1 {
    grid-template-columns: 1fr;
  }
  .total-value { font-size: 1.4rem; }
  .item-card { padding: 12px; }
  .item-main { min-width: 0; }
}
</style>