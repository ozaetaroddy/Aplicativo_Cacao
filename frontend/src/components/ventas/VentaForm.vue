<template>
  <div class="venta-form">
    <!-- ===== HEADER ===== -->
    <div class="form-header">
      <div class="header-left">
        <button
          type="button"
          class="btn-back"
          @click="cancelar"
          title="Volver"
          aria-label="Volver al listado"
        >
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
        </button>
        <div>
          <h1 class="form-title">
            <span class="title-icon"><i class="fas fa-file-invoice" aria-hidden="true"></i></span>
            {{ tituloDocumento }}
          </h1>
          <p class="form-subtitle">
            {{
              esEdicion
                ? 'Editando documento existente'
                : 'Complete los datos para crear un nuevo documento'
            }}
          </p>
        </div>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="btn-ghost"
          @click="mostrarAyuda = !mostrarAyuda"
          :aria-expanded="mostrarAyuda ? 'true' : 'false'"
          aria-label="Mostrar atajos de teclado"
        >
          <i class="fas fa-keyboard" aria-hidden="true"></i>
          <span>Atajos</span>
        </button>
      </div>
    </div>

    <!-- Atajos -->
    <transition name="fade">
      <div v-if="mostrarAyuda" class="shortcuts-panel">
        <div class="shortcuts-title">
          <i class="fas fa-bolt" aria-hidden="true"></i>
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
      <div class="alert-icon"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i></div>
      <div class="alert-body">
        <div class="alert-title">Configuración incompleta</div>
        <div class="alert-text">
          No se generará la clave de acceso porque la empresa no tiene un RUC válido (13 dígitos).
        </div>
      </div>
      <router-link to="/configuracion-empresa" class="alert-action">
        Configurar <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </router-link>
    </div>

    <div v-else-if="puedeGenerarClave && configEmpresaOk" class="alert-box alert-success">
      <div class="alert-icon"><i class="fas fa-check-circle" aria-hidden="true"></i></div>
      <div class="alert-body">
        <div class="alert-title">Listo para facturar</div>
        <div class="alert-text">
          RUC <strong>{{ configEmpresa?.ruc }}</strong> ·
          Ambiente
          <strong>{{ configEmpresa?.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS' }}</strong> ·
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
                  <label class="form-label" for="vf-tipo">
                    <span class="required">*</span> Tipo de documento
                  </label>
                  <select
                    id="vf-tipo"
                    class="form-select"
                    v-model="venta.tipo_documento"
                    @change="cambiarTipo"
                    :disabled="cargando"
                  >
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
                  <label class="form-label" for="vf-numero">Nº documento</label>
                  <input
                    id="vf-numero"
                    type="text"
                    class="form-control"
                    v-model="venta.numero_factura"
                    placeholder="Automático"
                    maxlength="50"
                    :disabled="cargando"
                  />
                </div>
                <div class="form-field">
                  <label class="form-label" for="vf-fecha">
                    <span class="required">*</span> Fecha emisión
                  </label>
                  <input
                    id="vf-fecha"
                    type="date"
                    class="form-control"
                    v-model="venta.fecha_emision"
                    required
                    :disabled="cargando"
                  />
                </div>
              </div>
            </div>
          </section>

          <!-- SECCIÓN: Cliente -->
          <section
            v-if="venta.tipo_documento !== 'guia_remision'"
            class="form-section card-with-dropdown"
          >
            <header class="section-header">
              <div class="section-number">2</div>
              <div class="section-header-content">
                <h2 class="section-title">Cliente</h2>
                <p class="section-desc">Selecciona o crea un cliente</p>
              </div>
              <router-link to="/clientes/nuevo" class="btn-new-inline">
                <i class="fas fa-plus" aria-hidden="true"></i>
                <span>Nuevo</span>
              </router-link>
            </header>
            <div class="section-body">
              <!-- Buscador de cliente -->
              <div class="position-relative">
                <div class="search-input-group">
                  <i class="fas fa-search search-icon" aria-hidden="true"></i>
                  <input
                    ref="inputCliente"
                    type="text"
                    class="search-input"
                    placeholder="Escribe nombre, RUC o cédula…"
                    v-model="busquedaCliente"
                    @focus="mostrarListaClientes = true"
                    @input="filtrarClientes"
                    @blur="cerrarListaClientes"
                    aria-label="Buscar cliente"
                    autocomplete="off"
                    :disabled="cargando"
                  />
                  <button
                    v-if="venta.clienteId"
                    class="search-clear"
                    type="button"
                    @click="limpiarCliente"
                    title="Cambiar cliente"
                    aria-label="Cambiar cliente"
                  >
                    <i class="fas fa-times" aria-hidden="true"></i>
                  </button>
                </div>

                <!-- Dropdown -->
                <transition name="dropdown">
                  <div
                    v-if="mostrarListaClientes && clientesFiltrados.length > 0"
                    class="search-dropdown"
                  >
                    <div
                      v-for="c in clientesFiltrados.slice(0, 8)"
                      :key="String(c._id)"
                      class="dropdown-row"
                      @mousedown.prevent="seleccionarCliente(c)"
                    >
                      <div class="row-avatar">{{ getInitials(c.nombre) }}</div>
                      <div class="row-content">
                        <div class="row-title">{{ c.nombre }}</div>
                        <div class="row-meta">
                          <span><i class="fas fa-id-card" aria-hidden="true"></i> {{ c.ruc }}</span>
                          <span v-if="c.telefono">
                            <i class="fas fa-phone" aria-hidden="true"></i> {{ c.telefono }}
                          </span>
                        </div>
                      </div>
                      <i
                        v-if="String(venta.clienteId) === String(c._id)"
                        class="fas fa-check-circle row-check"
                        aria-hidden="true"
                      ></i>
                    </div>
                  </div>
                  <div
                    v-else-if="mostrarListaClientes && busquedaCliente.length > 0"
                    class="search-dropdown search-empty"
                  >
                    <i class="fas fa-search" aria-hidden="true"></i>
                    <span>Sin resultados para "{{ busquedaCliente }}"</span>
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
                      <div><strong>RUC:</strong> {{ clienteActual.ruc || '—' }}</div>
                      <div v-if="clienteActual.telefono">
                        <strong>Tel:</strong> {{ clienteActual.telefono }}
                      </div>
                      <div v-if="clienteActual.email">
                        <strong>Email:</strong> {{ clienteActual.email }}
                      </div>
                      <div v-if="clienteActual.direccion">
                        <strong>Dir:</strong> {{ clienteActual.direccion }}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="cliente-change"
                    @click="limpiarCliente"
                    title="Cambiar cliente"
                    aria-label="Cambiar cliente"
                  >
                    <i class="fas fa-exchange-alt" aria-hidden="true"></i>
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
                  <span v-if="venta.detalles.length > 0" class="count-badge">
                    {{ venta.detalles.length }}
                  </span>
                </h2>
                <p class="section-desc">Agrega los productos o servicios</p>
              </div>
              <button
                type="button"
                class="btn-new-inline btn-new-primary"
                @click="focusBusquedaProducto"
              >
                <i class="fas fa-search" aria-hidden="true"></i>
                <span>Buscar (F2)</span>
              </button>
            </header>
            <div class="section-body">
              <!-- Buscador de productos -->
              <div class="position-relative">
                <div class="search-input-group search-input-primary">
                  <i class="fas fa-barcode search-icon" aria-hidden="true"></i>
                  <input
                    ref="inputProducto"
                    type="text"
                    class="search-input"
                    placeholder="Busca por nombre o código. Presiona Enter para agregar…"
                    v-model="busquedaProducto"
                    @focus="mostrarListaProductos = true"
                    @input="filtrarProductos"
                    @keydown.enter.prevent="agregarPrimerProducto"
                    @keydown.esc="limpiarBusquedaProducto"
                    @blur="cerrarListaProductos"
                    aria-label="Buscar producto"
                    autocomplete="off"
                    :disabled="cargando"
                  />
                </div>

                <transition name="dropdown">
                  <div
                    v-if="mostrarListaProductos && productosFiltrados.length > 0"
                    class="search-dropdown"
                  >
                    <div
                      v-for="p in productosFiltrados.slice(0, 10)"
                      :key="String(p._id)"
                      class="dropdown-row"
                      @mousedown.prevent="agregarProducto(p)"
                    >
                      <div class="row-avatar row-avatar-product">
                        <i class="fas fa-box" aria-hidden="true"></i>
                      </div>
                      <div class="row-content">
                        <div class="row-title">{{ p.nombre }}</div>
                        <div class="row-meta">
                          <code>{{ p.codigo }}</code>
                          <span :class="Number(p.stock) <= 0 ? 'stock-zero' : 'stock-ok'">
                            <i class="fas fa-cube" aria-hidden="true"></i>
                            Stock: {{ p.stock || 0 }}
                          </span>
                        </div>
                      </div>
                      <div class="row-price">
                        <div class="price-value">${{ formatMonto(p.precio_venta) }}</div>
                        <div class="price-label">venta</div>
                      </div>
                    </div>
                  </div>
                  <div
                    v-else-if="mostrarListaProductos && busquedaProducto.length > 0"
                    class="search-dropdown search-empty"
                  >
                    <i class="fas fa-search" aria-hidden="true"></i>
                    <span>Sin resultados para "{{ busquedaProducto }}"</span>
                  </div>
                </transition>
              </div>

              <!-- Lista de items agregados -->
              <div v-if="venta.detalles.length === 0" class="empty-items">
                <div class="empty-icon"><i class="fas fa-box-open" aria-hidden="true"></i></div>
                <div class="empty-title">No has agregado productos</div>
                <div class="empty-text">
                  Usa el buscador de arriba o presiona <kbd>F2</kbd>
                </div>
              </div>

              <div v-else class="items-list">
                <div
                  v-for="(item, index) in venta.detalles"
                  :key="`item-${index}-${item.productoId}`"
                  class="item-card"
                >
                  <div class="item-main">
                    <div class="item-icon">
                      <i class="fas fa-box" aria-hidden="true"></i>
                    </div>
                    <div class="item-info">
                      <div class="item-name">{{ item.nombre || 'Producto' }}</div>
                      <div class="item-code">{{ item.codigo || 'Sin código' }}</div>
                      <div v-if="item.stockDisponible !== undefined" class="item-stock">
                        <i class="fas fa-cube" aria-hidden="true"></i>
                        Stock:
                        <strong
                          :class="item.cantidad > item.stockDisponible ? 'text-danger' : ''"
                        >
                          {{ item.stockDisponible }}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div class="item-controls">
                    <div class="control-group">
                      <label :for="`qty-${index}`">Cantidad</label>
                      <div class="qty-control">
                        <button
                          type="button"
                          @click="cambiarCantidad(index, -1)"
                          aria-label="Disminuir cantidad"
                        >
                          <i class="fas fa-minus" aria-hidden="true"></i>
                        </button>
                        <input
                          :id="`qty-${index}`"
                          type="number"
                          v-model.number="item.cantidad"
                          min="0.01"
                          step="0.01"
                          @blur="validarCantidad(index)"
                        />
                        <button
                          type="button"
                          @click="cambiarCantidad(index, 1)"
                          aria-label="Aumentar cantidad"
                        >
                          <i class="fas fa-plus" aria-hidden="true"></i>
                        </button>
                      </div>
                    </div>

                    <div class="control-group">
                      <label :for="`price-${index}`">Precio unit.</label>
                      <div class="price-input">
                        <span>$</span>
                        <input
                          :id="`price-${index}`"
                          type="number"
                          v-model.number="item.precio_unitario"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>

                    <div class="control-group">
                      <label :for="`iva-${index}`">IVA</label>
                      <select
                        :id="`iva-${index}`"
                        class="form-select form-select-sm"
                        v-model="item.aplica_iva"
                      >
                        <option :value="true">15%</option>
                        <option :value="false">0%</option>
                      </select>
                    </div>

                    <div class="control-group control-subtotal">
                      <label>Subtotal</label>
                      <div class="subtotal-value">
                        ${{ formatMonto((item.cantidad || 0) * (item.precio_unitario || 0)) }}
                      </div>
                    </div>

                    <button
                      type="button"
                      class="item-remove"
                      @click="eliminarDetalle(index)"
                      title="Quitar producto"
                      aria-label="Quitar producto"
                    >
                      <i class="fas fa-times" aria-hidden="true"></i>
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
              <i
                class="fas toggle-chevron"
                :class="seccionesExpandidas.guia ? 'fa-chevron-up' : 'fa-chevron-down'"
                aria-hidden="true"
              ></i>
            </header>
            <transition name="collapse">
              <div v-show="seccionesExpandidas.guia" class="section-body">
                <!-- Sub-sección: Generales -->
                <div class="subsection">
                  <h3 class="subsection-title">
                    <i class="fas fa-store" aria-hidden="true"></i> Datos Generales
                  </h3>
                  <div class="form-row cols-3">
                    <div class="form-field">
                      <label class="form-label" for="g-estab">
                        <span class="required">*</span> Establecimiento
                      </label>
                      <input
                        id="g-estab"
                        type="text"
                        class="form-control"
                        v-model="venta.establecimiento"
                        maxlength="3"
                        inputmode="numeric"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-nombre-comercial">
                        <span class="required">*</span> Nombre Comercial
                      </label>
                      <input
                        id="g-nombre-comercial"
                        type="text"
                        class="form-control"
                        v-model="venta.nombre_comercial"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-punto-emision">
                        <span class="required">*</span> Punto de Emisión
                      </label>
                      <input
                        id="g-punto-emision"
                        type="text"
                        class="form-control"
                        v-model="venta.punto_emision"
                        maxlength="3"
                        inputmode="numeric"
                      />
                    </div>
                  </div>
                </div>

                <!-- Sub-sección: Destinatario -->
                <div class="subsection">
                  <h3 class="subsection-title">
                    <i class="fas fa-user" aria-hidden="true"></i> Destinatario
                  </h3>
                  <div class="form-row cols-4">
                    <div class="form-field">
                      <label class="form-label" for="g-dest-id">
                        <span class="required">*</span> Identificación
                      </label>
                      <input
                        id="g-dest-id"
                        type="text"
                        class="form-control"
                        v-model="venta.destinatario_identificacion"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label">
                        <span class="required">*</span> Tipo ID
                      </label>
                      <SelectSRI
                        v-model="venta.destinatario_tipo"
                        :lista="catalogos.TIPO_IDENTIFICACION || []"
                        placeholder="Seleccione…"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-dest-razon">
                        <span class="required">*</span> Razón Social
                      </label>
                      <input
                        id="g-dest-razon"
                        type="text"
                        class="form-control"
                        v-model="venta.destinatario_razon_social"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-dest-dir">
                        <span class="required">*</span> Dirección Destino
                      </label>
                      <input
                        id="g-dest-dir"
                        type="text"
                        class="form-control"
                        v-model="venta.destinatario_direccion"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-ruta">Ruta</label>
                      <input id="g-ruta" type="text" class="form-control" v-model="venta.ruta" />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-motivo">
                        <span class="required">*</span> Motivo
                      </label>
                      <input
                        id="g-motivo"
                        type="text"
                        class="form-control"
                        v-model="venta.motivo"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-aduana">Doc. Aduanero</label>
                      <input
                        id="g-aduana"
                        type="text"
                        class="form-control"
                        v-model="venta.documento_aduana"
                      />
                    </div>
                  </div>
                </div>

                <!-- Sub-sección: Comprobante Sustento -->
                <div class="subsection">
                  <h3 class="subsection-title">
                    <i class="fas fa-file-alt" aria-hidden="true"></i> Comprobante de Sustento
                  </h3>
                  <div class="form-row cols-3">
                    <div class="form-field">
                      <label class="form-label" for="g-comp-tipo-emision">Tipo Emisión</label>
                      <select
                        id="g-comp-tipo-emision"
                        class="form-select"
                        v-model="venta.comprobante_tipo_emision"
                      >
                        <option value="">Seleccione</option>
                        <option value="Física">Física</option>
                        <option value="Electrónica">Electrónica</option>
                      </select>
                    </div>
                    <div class="form-field">
                      <label class="form-label">Tipo Comprobante</label>
                      <SelectSRI
                        v-model="venta.comprobante_documento"
                        :lista="catalogos.DOCUMENTO_SUSTENTO || []"
                        placeholder="Seleccione…"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-comp-numero">Nº Comprobante</label>
                      <input
                        id="g-comp-numero"
                        type="text"
                        class="form-control"
                        v-model="venta.comprobante_numero"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-comp-clave">Clave de Acceso</label>
                      <input
                        id="g-comp-clave"
                        type="text"
                        class="form-control"
                        v-model="venta.comprobante_clave_acceso"
                        maxlength="49"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-comp-aut">Nº Autorización</label>
                      <input
                        id="g-comp-aut"
                        type="text"
                        class="form-control"
                        v-model="venta.comprobante_numero_autorizacion"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-comp-fecha">Fecha Emisión</label>
                      <input
                        id="g-comp-fecha"
                        type="date"
                        class="form-control"
                        v-model="venta.comprobante_fecha_emision"
                      />
                    </div>
                  </div>
                </div>

                <!-- Sub-sección: Transportista -->
                <div class="subsection">
                  <h3 class="subsection-title">
                    <i class="fas fa-truck" aria-hidden="true"></i> Transportista
                  </h3>
                  <div class="form-row cols-4">
                    <div class="form-field">
                      <label class="form-label" for="g-trans-id">Identificación</label>
                      <input
                        id="g-trans-id"
                        type="text"
                        class="form-control"
                        v-model="venta.transportista_identificacion"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label">Tipo ID</label>
                      <SelectSRI
                        v-model="venta.transportista_tipo"
                        :lista="catalogos.TIPO_IDENTIFICACION || []"
                        placeholder="Seleccione…"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-trans-razon">Razón Social</label>
                      <input
                        id="g-trans-razon"
                        type="text"
                        class="form-control"
                        v-model="venta.transportista_razon_social"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-trans-correo">Correo</label>
                      <input
                        id="g-trans-correo"
                        type="email"
                        class="form-control"
                        v-model="venta.transportista_correo"
                      />
                    </div>
                  </div>
                </div>

                <!-- Sub-sección: Traslado -->
                <div class="subsection">
                  <h3 class="subsection-title">
                    <i class="fas fa-route" aria-hidden="true"></i> Traslado
                  </h3>
                  <div class="form-row cols-4">
                    <div class="form-field">
                      <label class="form-label" for="g-partida">Dirección Partida</label>
                      <input
                        id="g-partida"
                        type="text"
                        class="form-control"
                        v-model="venta.direccion_partida"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-inicio">Inicio Transporte</label>
                      <input
                        id="g-inicio"
                        type="datetime-local"
                        class="form-control"
                        v-model="venta.inicio_transporte"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-fin">Fin Transporte</label>
                      <input
                        id="g-fin"
                        type="datetime-local"
                        class="form-control"
                        v-model="venta.fin_transporte"
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="g-placa">Placa</label>
                      <input
                        id="g-placa"
                        type="text"
                        class="form-control"
                        v-model="venta.placa_transporte"
                        maxlength="10"
                      />
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
                <i class="fas fa-credit-card" aria-hidden="true"></i>
              </div>
              <div class="section-header-content">
                <h2 class="section-title">Información de Pago</h2>
                <p class="section-desc">Forma, estado y fecha de pago</p>
              </div>
              <i
                class="fas toggle-chevron"
                :class="seccionesExpandidas.pago ? 'fa-chevron-up' : 'fa-chevron-down'"
                aria-hidden="true"
              ></i>
            </header>
            <transition name="collapse">
              <div v-show="seccionesExpandidas.pago" class="section-body">
                <div class="form-row cols-3">
                  <div class="form-field">
                    <label class="form-label">Forma de pago</label>
                    <SelectSRI
                      v-model="venta.forma_pago"
                      :lista="catalogos.FORMA_PAGO || []"
                      placeholder="Seleccione…"
                    />
                  </div>
                  <div class="form-field">
                    <label class="form-label" for="vf-estado-pago">Estado de pago</label>
                    <select
                      id="vf-estado-pago"
                      class="form-select"
                      v-model="venta.estado_pago"
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="pagado">Pagado</option>
                      <option value="parcial">Pago Parcial</option>
                    </select>
                  </div>
                  <div class="form-field">
                    <label class="form-label" for="vf-fecha-pago">Fecha de pago</label>
                    <input
                      id="vf-fecha-pago"
                      type="date"
                      class="form-control"
                      v-model="venta.fecha_pago"
                    />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-field">
                    <label class="form-label" for="vf-obs">Observaciones</label>
                    <textarea
                      id="vf-obs"
                      class="form-control"
                      v-model="venta.observaciones"
                      rows="3"
                      maxlength="1000"
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
                <i class="fas fa-calculator" aria-hidden="true"></i>
                <span>Resumen del documento</span>
              </div>
              <div class="summary-body">
                <div class="summary-row">
                  <span class="summary-label">Productos</span>
                  <span class="summary-value">{{ venta.detalles.length }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Subtotal</span>
                  <span class="summary-value">${{ formatMonto(subtotal) }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">IVA</span>
                  <span class="summary-value">${{ formatMonto(iva) }}</span>
                </div>
                <div class="summary-divider"></div>
                <div class="summary-total">
                  <span class="total-label">TOTAL</span>
                  <span class="total-value">${{ formatMonto(total) }}</span>
                </div>
              </div>
            </div>

            <!-- Estado del formulario -->
            <div class="status-card">
              <div
                class="status-item"
                :class="{
                  complete: venta.clienteId || venta.tipo_documento === 'guia_remision'
                }"
              >
                <i
                  :class="
                    venta.clienteId || venta.tipo_documento === 'guia_remision'
                      ? 'fas fa-check-circle'
                      : 'far fa-circle'
                  "
                  aria-hidden="true"
                ></i>
                <span>Cliente seleccionado</span>
              </div>
              <div class="status-item" :class="{ complete: venta.detalles.length > 0 }">
                <i
                  :class="venta.detalles.length > 0 ? 'fas fa-check-circle' : 'far fa-circle'"
                  aria-hidden="true"
                ></i>
                <span>Productos agregados</span>
              </div>
              <div class="status-item" :class="{ complete: venta.fecha_emision }">
                <i
                  :class="venta.fecha_emision ? 'fas fa-check-circle' : 'far fa-circle'"
                  aria-hidden="true"
                ></i>
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
                <i class="fas fa-save" :class="{ 'fa-spin': cargando }" aria-hidden="true"></i>
                <span>{{ cargando ? 'Guardando…' : 'Guardar documento' }}</span>
                <kbd>Ctrl+↵</kbd>
              </button>
              <button type="button" class="btn-cancel" @click="cancelar">
                <i class="fas fa-times" aria-hidden="true"></i>
                <span>Cancelar</span>
              </button>
            </div>

            <!-- Info clave -->
            <div v-if="puedeGenerarClave && configEmpresaOk" class="info-card">
              <i class="fas fa-key" aria-hidden="true"></i>
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
        <div v-if="errorGeneral" class="error-banner" role="alert">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
          <span>{{ errorGeneral }}</span>
        </div>
      </transition>
    </form>

    <!-- ===== MODAL CONFIRMACIÓN ===== -->
    <div
      class="modal fade"
      id="modalConfirmVentaForm"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content modal-content-clean">
          <div class="modal-header" :class="`bg-${confirmState.variante}`">
            <h5 class="modal-title text-white">
              <i :class="confirmState.icono" class="me-2" aria-hidden="true"></i>
              {{ confirmState.titulo }}
            </h5>
            <button
              type="button"
              class="btn-close btn-close-white"
              @click="cancelarConfirm"
              aria-label="Cerrar"
            ></button>
          </div>
          <div class="modal-body">
            <p class="mb-3">{{ confirmState.mensaje }}</p>
            <div v-if="confirmState.detalle" class="alert alert-warning small mb-0">
              <i class="fas fa-exclamation-triangle me-2" aria-hidden="true"></i>
              <span>{{ confirmState.detalle }}</span>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="cancelarConfirm">
              {{ confirmState.textoCancelar }}
            </button>
            <button
              type="button"
              class="btn"
              :class="`btn-${confirmState.variante}`"
              @click="aceptarConfirm"
            >
              {{ confirmState.textoConfirmar }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
  nextTick
} from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { roundTo2 } from '../../utils/formatters'
import { useToast } from 'vue-toastification'
import { useCatalogosSRI } from '../../composables/useCatalogosSRI'
import SelectSRI from '../shared/SelectSRI.vue'
import AlertaPeriodoCerrado from '../shared/AlertaPeriodoCerrado.vue'
import { api } from '../../services/api'
import { Modal } from 'bootstrap'
import Fuse from 'fuse.js'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { catalogos, cargarCatalogos } = useCatalogosSRI()

// ===== CONSTANTES =====
const STOCK_BLOCK = true
const FUSE_LIMIT = 20
const IVA_DEFAULT = 15
const TIPOS_CON_CLAVE = Object.freeze([
  'factura',
  'liquidacion',
  'nota_credito',
  'nota_debito',
  'guia_remision',
  'retencion',
  'exportacion',
  'reembolso'
])

// ===== HELPERS DE FECHA =====
/**
 * Devuelve la fecha de HOY en formato YYYY-MM-DD según TZ Ecuador (UTC-5).
 * Evita el bug de `toISOString().split('T')[0]` que devuelve la fecha UTC
 * (un día adelante después de las 19:00 EC).
 */
function hoyECISO() {
  try {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guayaquil',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date())
    const get = (t) => partes.find((p) => p.type === t)?.value
    const year = get('year')
    const month = get('month')
    const day = get('day')
    if (year && month && day) return `${year}-${month}-${day}`
  } catch {
    /* cae al fallback */
  }
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

/** Formato 2 decimales con guard. */
const formatMonto = (n) => {
  const v = Number(n)
  return Number.isFinite(v) ? v.toFixed(2) : '0.00'
}

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// ===== ROUTE (reactivo) =====
const id = computed(() => (route.params.id ? String(route.params.id) : null))
const esEdicion = computed(() => Boolean(id.value))
const tipoInicial = computed(() => route.query.tipo || 'factura')

// ===== STATE =====
const clientes = ref([])
const productos = ref([])
const cargando = ref(false)
const cargandoInicial = ref(false)
const errorGeneral = ref('')
const periodoCerrado = ref(null)
const configEmpresa = ref(null)

const inputCliente = ref(null)
const inputProducto = ref(null)
const busquedaCliente = ref('')
const busquedaProducto = ref('')
const mostrarListaClientes = ref(false)
const mostrarListaProductos = ref(false)
const mostrarAyuda = ref(false)

let fuseClientes = null
let fuseProductos = null

const seccionesExpandidas = ref({ guia: false, pago: true })

// Snapshot para detectar cambios sin guardar
let snapshotInicial = null

// Confirmación reactiva
const confirmState = reactive({
  titulo: '',
  mensaje: '',
  detalle: '',
  textoConfirmar: 'Confirmar',
  textoCancelar: 'Cancelar',
  variante: 'primary',
  icono: 'fas fa-question-circle',
  resolve: null
})

let modalConfirm = null

// ===== FORM =====
const venta = ref({
  clienteId: '',
  numero_factura: '',
  fecha_emision: hoyECISO(),
  tipo_documento: tipoInicial.value,
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

// ===== GUARDS =====
let unmounted = false
let periodoAbort = null

// ===== CONFIG =====
const configEmpresaOk = computed(
  () => configEmpresa.value?.ruc && String(configEmpresa.value.ruc).length === 13
)

const seriePreview = computed(() => {
  const est = String(configEmpresa.value?.establecimiento || '001').padStart(3, '0')
  const pe = String(configEmpresa.value?.punto_emision || '001').padStart(3, '0')
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
  return esEdicion.value ? `Editar ${base}` : base
})

const clienteActual = computed(() => {
  if (!venta.value.clienteId) return null
  if (!Array.isArray(clientes.value)) return null
  return (
    clientes.value.find((c) => String(c._id) === String(venta.value.clienteId)) || null
  )
})

const clientesFiltrados = computed(() => {
  try {
    if (!Array.isArray(clientes.value)) return []
    const q = busquedaCliente.value.trim()
    if (!q) return clientes.value.slice(0, FUSE_LIMIT)
    if (!fuseClientes) {
      const qLow = q.toLowerCase()
      return clientes.value
        .filter(
          (c) =>
            String(c.nombre || '').toLowerCase().includes(qLow) ||
            String(c.ruc || '').includes(q) ||
            String(c.email || '').toLowerCase().includes(qLow)
        )
        .slice(0, FUSE_LIMIT)
    }
    return fuseClientes.search(q).map((r) => r.item).slice(0, FUSE_LIMIT)
  } catch {
    return []
  }
})

const productosFiltrados = computed(() => {
  try {
    if (!Array.isArray(productos.value)) return []
    const q = busquedaProducto.value.trim()
    if (!q) return productos.value.slice(0, FUSE_LIMIT)
    if (!fuseProductos) {
      const qLow = q.toLowerCase()
      return productos.value
        .filter(
          (p) =>
            String(p.nombre || '').toLowerCase().includes(qLow) ||
            String(p.codigo || '').toLowerCase().includes(qLow) ||
            String(p.codigo_barras || '').includes(q)
        )
        .slice(0, FUSE_LIMIT)
    }
    return fuseProductos.search(q).map((r) => r.item).slice(0, FUSE_LIMIT)
  } catch {
    return []
  }
})

const subtotal = computed(() => {
  if (!Array.isArray(venta.value.detalles)) return 0
  return roundTo2(
    venta.value.detalles.reduce(
      (acc, d) => acc + (Number(d.cantidad) || 0) * (Number(d.precio_unitario) || 0),
      0
    )
  )
})

const iva = computed(() => {
  if (!Array.isArray(venta.value.detalles)) return 0
  let totalIva = 0
  for (const d of venta.value.detalles) {
    if (d.aplica_iva === false) continue
    const tarifa = Number(d.tarifa_iva ?? IVA_DEFAULT) || 0
    totalIva +=
      (Number(d.cantidad) || 0) * (Number(d.precio_unitario) || 0) * (tarifa / 100)
  }
  return roundTo2(totalIva)
})

const total = computed(() => roundTo2(subtotal.value + iva.value))

const formularioValido = computed(() => {
  if (
    venta.value.tipo_documento !== 'guia_remision' &&
    !venta.value.clienteId
  ) {
    return false
  }
  if (!Array.isArray(venta.value.detalles) || venta.value.detalles.length === 0) return false
  if (!venta.value.fecha_emision) return false
  return venta.value.detalles.every(
    (d) =>
      d.productoId &&
      Number(d.cantidad) > 0 &&
      Number(d.precio_unitario) >= 0
  )
})

const puedeGenerarClave = computed(() =>
  TIPOS_CON_CLAVE.includes(venta.value.tipo_documento)
)

const hayCambios = computed(() => {
  if (!snapshotInicial) return false
  return JSON.stringify(venta.value) !== JSON.stringify(snapshotInicial)
})

// ===== HELPERS =====
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

const generarCodigoLocal = (tipo) => {
  const prefijos = {
    factura: 'FAC',
    guia_remision: 'GUI',
    exportacion: 'EXP',
    reembolso: 'REB',
    retencion: 'RET',
    liquidacion: 'LIQ',
    nota_credito: 'NCR',
    proforma: 'PRO'
  }
  const prefijo = prefijos[tipo] || 'DOC'
  return `${prefijo}-${String(Date.now()).slice(-6)}`
}

const toggleSeccion = (nombre) => {
  seccionesExpandidas.value[nombre] = !seccionesExpandidas.value[nombre]
}

// ===== CONFIRMACIÓN =====
const pedirConfirmacion = (opts = {}) => {
  return new Promise((resolve) => {
    confirmState.titulo = opts.titulo || 'Confirmar acción'
    confirmState.mensaje = opts.mensaje || '¿Estás seguro?'
    confirmState.detalle = opts.detalle || ''
    confirmState.textoConfirmar = opts.textoConfirmar || 'Confirmar'
    confirmState.textoCancelar = opts.textoCancelar || 'Cancelar'
    confirmState.variante = opts.variante || 'primary'
    confirmState.icono = opts.icono || 'fas fa-question-circle'
    confirmState.resolve = resolve

    if (!modalConfirm) {
      modalConfirm = new Modal(
        document.getElementById('modalConfirmVentaForm'),
        { backdrop: 'static' }
      )
    }
    modalConfirm.show()
  })
}

const aceptarConfirm = () => {
  const r = confirmState.resolve
  confirmState.resolve = null
  modalConfirm?.hide()
  if (r) r(true)
}

const cancelarConfirm = () => {
  const r = confirmState.resolve
  confirmState.resolve = null
  modalConfirm?.hide()
  if (r) r(false)
}

// ===== BÚSQUEDA CLIENTES =====
const filtrarClientes = () => {
  mostrarListaClientes.value = true
}
const cerrarListaClientes = () => {
  setTimeout(() => {
    if (unmounted) return
    mostrarListaClientes.value = false
  }, 200)
}

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
const filtrarProductos = () => {
  mostrarListaProductos.value = true
}
const cerrarListaProductos = () => {
  setTimeout(() => {
    if (unmounted) return
    mostrarListaProductos.value = false
    // Limpiar la búsqueda al cerrar sin selección
    busquedaProducto.value = ''
  }, 200)
}
const limpiarBusquedaProducto = () => {
  busquedaProducto.value = ''
  mostrarListaProductos.value = false
}
const focusBusquedaProducto = () => {
  inputProducto.value?.focus()
}

const agregarPrimerProducto = () => {
  if (productosFiltrados.value.length > 0) agregarProducto(productosFiltrados.value[0])
}

const agregarProducto = (p) => {
  if (!p || !p._id) return

  const existente = venta.value.detalles.find(
    (d) => String(d.productoId) === String(p._id)
  )
  if (existente) {
    existente.cantidad = roundTo2((Number(existente.cantidad) || 1) + 1)
    toast.info(`${p.nombre} → ${existente.cantidad}`)
  } else {
    venta.value.detalles.push({
      productoId: p._id,
      codigo: p.codigo || '',
      nombre: p.nombre || 'Producto',
      cantidad: 1,
      precio_unitario: roundTo2(p.precio_venta || 0),
      aplica_iva: p.aplica_iva !== undefined ? Boolean(p.aplica_iva) : true,
      tarifa_iva: Number(p.tarifa_iva ?? IVA_DEFAULT),
      stockDisponible: Number(p.stock || 0)
    })
    errores.value.detalles.push({ producto: '', cantidad: '', precio: '' })
  }
  busquedaProducto.value = ''
  mostrarListaProductos.value = false
  nextTick(() => inputProducto.value?.focus())
}

const cambiarCantidad = (index, delta) => {
  const item = venta.value.detalles[index]
  if (!item) return
  const nueva = roundTo2((Number(item.cantidad) || 0) + delta)
  if (nueva < 0.01) return
  item.cantidad = nueva
}

const validarCantidad = (index) => {
  const item = venta.value.detalles[index]
  if (!item) return
  if (!item.cantidad || Number(item.cantidad) <= 0) item.cantidad = 1
  // Clamp a stock disponible (si aplica)
  if (
    STOCK_BLOCK &&
    item.stockDisponible !== undefined &&
    item.stockDisponible > 0 &&
    Number(item.cantidad) > item.stockDisponible
  ) {
    item.cantidad = item.stockDisponible
    toast.warning(`Cantidad ajustada al stock disponible (${item.stockDisponible})`)
  }
}

const eliminarDetalle = (index) => {
  venta.value.detalles.splice(index, 1)
  errores.value.detalles.splice(index, 1)
}

// ===== TIPO DE DOCUMENTO =====
const asignarCodigos = () => {
  const tipo = venta.value.tipo_documento
  venta.value.numero_factura = generarCodigoLocal(tipo)
  if (tipo === 'exportacion')
    venta.value.numero_exportacion = generarCodigoLocal('exportacion')
  if (tipo === 'guia_remision')
    venta.value.numero_guia = generarCodigoLocal('guia_remision')
  if (tipo === 'retencion')
    venta.value.numero_retencion = generarCodigoLocal('retencion')
}

const cambiarTipo = () => {
  Object.assign(venta.value, {
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
    comprobante_fecha_emision: ''
  })
  if (!esEdicion.value) asignarCodigos()
}

// ===== PERÍODO =====
const verificarPeriodo = async () => {
  if (periodoAbort) {
    try {
      periodoAbort.abort()
    } catch {
      /* noop */
    }
  }
  periodoAbort = new AbortController()

  if (!venta.value.fecha_emision) {
    periodoCerrado.value = null
    return
  }
  try {
    const d = new Date(venta.value.fecha_emision)
    if (Number.isNaN(d.getTime())) {
      periodoCerrado.value = null
      return
    }
    const res = await api.request(
      `/periodos/verificar/${d.getFullYear()}/${d.getMonth() + 1}`,
      { method: 'GET', skipLoader: true, signal: periodoAbort.signal }
    )
    if (unmounted) return
    periodoCerrado.value = res?.cerrado ? res.periodo : null
  } catch (e) {
    const esAbort = e?.name === 'AbortError' || /aborted/i.test(e?.message || '')
    if (unmounted || esAbort) return
    periodoCerrado.value = null
  }
}

// ===== ATAJOS =====
const handleKeydown = (e) => {
  const tag = (e.target?.tagName || '').toLowerCase()
  const esInput = tag === 'input' || tag === 'textarea' || tag === 'select'
  const esBuscadorInterno =
    e.target === inputProducto.value || e.target === inputCliente.value

  if (e.key === 'F2') {
    e.preventDefault()
    inputProducto.value?.focus()
    return
  }
  if (e.key === 'F3') {
    e.preventDefault()
    inputCliente.value?.focus()
    return
  }
  if (e.ctrlKey && e.key === 'Enter') {
    // Solo dispara si NO está en un input ajeno
    if (esInput && !esBuscadorInterno) return
    e.preventDefault()
    if (formularioValido.value && !cargando.value && !periodoCerrado.value) guardar()
  }
}

// ===== CARGA =====
const cargarConfigEmpresa = async () => {
  try {
    configEmpresa.value = await api.request('/configuracion/empresa', {
      method: 'GET',
      skipLoader: true
    })
  } catch {
    configEmpresa.value = null
  }
}

const cargarClientesYProductos = async () => {
  try {
    const [clis, prods] = await Promise.all([
      api.request('/clientes', { method: 'GET', skipLoader: true }).catch(() => []),
      api.request('/productos', { method: 'GET', skipLoader: true }).catch(() => [])
    ])

    clientes.value = Array.isArray(clis) ? clis : clis?.data || []
    productos.value = Array.isArray(prods) ? prods : prods?.data || []

    if (clientes.value.length > 0) {
      fuseClientes = new Fuse(clientes.value, {
        keys: [
          { name: 'ruc', weight: 3 },
          { name: 'nombre', weight: 2 },
          { name: 'email', weight: 1 },
          { name: 'telefono', weight: 1 }
        ],
        threshold: 0.35,
        ignoreLocation: true
      })
    }
    if (productos.value.length > 0) {
      fuseProductos = new Fuse(productos.value, {
        keys: [
          { name: 'codigo', weight: 3 },
          { name: 'codigo_barras', weight: 3 },
          { name: 'nombre', weight: 2 }
        ],
        threshold: 0.35,
        ignoreLocation: true
      })
    }
  } catch (e) {
    console.warn('Error cargando catálogos de apoyo:', e?.message)
  }
}

const cargarVenta = async (ventaId) => {
  try {
    const data = await api.request(`/ventas/${ventaId}`, { method: 'GET' })
    if (unmounted || !data) return

    if (Array.isArray(data.detalles)) {
      data.detalles = data.detalles.map((d) => {
        const prod = productos.value.find((p) => String(p._id) === String(d.productoId))
        return {
          ...d,
          codigo: prod?.codigo || d.codigo || '',
          nombre: prod?.nombre || d.nombre || 'Producto',
          stockDisponible: Number(prod?.stock || 0),
          tarifa_iva: Number(d.tarifa_iva ?? IVA_DEFAULT)
        }
      })
    }

    venta.value = { ...venta.value, ...data }
    snapshotInicial = JSON.parse(JSON.stringify(venta.value))
  } catch (e) {
    if (unmounted) return
    errorGeneral.value = 'Error al cargar el documento: ' + (e?.message || 'desconocido')
    toast.error('No se pudo cargar el documento')
  }
}

// ===== GUARDAR =====
const guardar = async () => {
  if (cargando.value) return

  if (periodoCerrado.value) {
    toast.error(`No se puede guardar: ${periodoCerrado.value.nombre} está cerrado`)
    return
  }

  if (!formularioValido.value) {
    errorGeneral.value = 'Corrige los errores antes de guardar'
    toast.warning('Verifica los datos')
    return
  }

  // Confirmar si la empresa no tiene RUC válido y el documento requiere clave
  if (puedeGenerarClave.value && !configEmpresaOk.value) {
    const ok = await pedirConfirmacion({
      titulo: 'Configuración incompleta',
      mensaje: 'La empresa no tiene un RUC válido configurado.',
      detalle:
        'El documento se guardará pero NO se generará la clave de acceso ni el XML.',
      textoConfirmar: 'Continuar de todos modos',
      textoCancelar: 'Ir a configurar',
      variante: 'warning',
      icono: 'fas fa-exclamation-triangle'
    })
    if (!ok) {
      router.push('/configuracion-empresa')
      return
    }
  }

  errorGeneral.value = ''
  cargando.value = true

  try {
    // Payload exacto al contrato del backend
    const payload = {
      clienteId: venta.value.clienteId || undefined,
      numero_factura: venta.value.numero_factura || undefined,
      fecha_emision: venta.value.fecha_emision,
      tipo_documento: venta.value.tipo_documento,
      detalles: venta.value.detalles.map((d) => ({
        productoId: d.productoId,
        cantidad: roundTo2(d.cantidad),
        precio_unitario: roundTo2(d.precio_unitario),
        aplica_iva: Boolean(d.aplica_iva)
      })),
      subtotal: roundTo2(subtotal.value),
      iva: roundTo2(iva.value),
      total: roundTo2(total.value),
      ...(() => {
        const extras = {}
        const campos = [
          'numero_guia',
          'transportista',
          'placa',
          'numero_exportacion',
          'pais_destino',
          'numero_retencion',
          'establecimiento',
          'nombre_comercial',
          'punto_emision',
          'transportista_identificacion',
          'transportista_tipo',
          'transportista_razon_social',
          'transportista_correo',
          'direccion_partida',
          'inicio_transporte',
          'fin_transporte',
          'placa_transporte',
          'destinatario_identificacion',
          'destinatario_tipo',
          'destinatario_razon_social',
          'destinatario_direccion',
          'ruta',
          'motivo',
          'documento_aduana',
          'comprobante_tipo_emision',
          'comprobante_documento',
          'comprobante_clave_acceso',
          'comprobante_numero_autorizacion',
          'comprobante_numero',
          'comprobante_fecha_emision',
          'forma_pago',
          'estado_pago',
          'observaciones'
        ]
        for (const k of campos) {
          const v = venta.value[k]
          if (v !== undefined && v !== null && v !== '') extras[k] = v
        }
        if (venta.value.fecha_pago) extras.fecha_pago = venta.value.fecha_pago
        if (Number(venta.value.porcentaje_retencion) > 0) {
          extras.porcentaje_retencion = Number(venta.value.porcentaje_retencion)
        }
        return extras
      })()
    }

    // CRÍTICO: pasa por el backend (clave, XML, firma, kardex, auditoría, WS)
    let res
    if (esEdicion.value) {
      res = await api.request(`/ventas/${id.value}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
        loaderMessage: 'Actualizando documento…'
      })
      if (!unmounted) toast.success('Documento actualizado')
    } else {
      res = await api.request('/ventas', {
        method: 'POST',
        body: JSON.stringify(payload),
        loaderMessage: 'Creando documento…'
      })
      if (!unmounted) {
        if (res?.clave_acceso) toast.success('Documento creado con clave de acceso')
        else toast.success('Documento creado')

        if (res?._advertencia) {
          toast.warning(res._advertencia, { timeout: 10000 })
        }
      }
    }

    // Marcar como guardado
    snapshotInicial = JSON.parse(JSON.stringify(venta.value))

    if (!unmounted) router.push('/ventas')
  } catch (e) {
    if (unmounted) return

    // Mensajes de error del backend: { error, codigo, detalles }
    const codigo = e?.codigo || e?.code
    const msg = e?.message || 'Error desconocido'

    // Códigos especiales con acción sugerida
    let msgMostrar = msg
    if (codigo === 'STOCK_INSUFICIENTE') {
      msgMostrar =
        msg ||
        'Stock insuficiente: otro usuario consumió el stock mientras ingresabas el documento. Recargá e intentá de nuevo.'
    } else if (codigo === 'NUMERO_DUPLICADO') {
      msgMostrar = msg || 'Ya existe un comprobante con ese número.'
    } else if (codigo === 'PERIODO_CERRADO') {
      msgMostrar = msg || 'El período está cerrado. No se puede guardar.'
    }

    errorGeneral.value = 'Error al guardar: ' + msgMostrar
    toast.error('Error: ' + msgMostrar)
  } finally {
    if (!unmounted) cargando.value = false
  }
}

// ===== CANCELAR =====
const cancelar = async () => {
  if (hayCambios.value) {
    const ok = await pedirConfirmacion({
      titulo: 'Salir sin guardar',
      mensaje: 'Tienes cambios sin guardar en este documento.',
      detalle: 'Si sales ahora, perderás todo lo que ingresaste.',
      textoConfirmar: 'Salir sin guardar',
      textoCancelar: 'Seguir editando',
      variante: 'danger',
      icono: 'fas fa-exclamation-triangle'
    })
    if (!ok) return
    snapshotInicial = JSON.parse(JSON.stringify(venta.value))
  }
  router.push('/ventas')
}

// ===== GUARDS DE NAVEGACIÓN =====
const beforeUnloadHandler = (e) => {
  if (hayCambios.value && !cargando.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onBeforeRouteLeave(async (to, from, next) => {
  if (!hayCambios.value || cargando.value) return next()
  const ok = await pedirConfirmacion({
    titulo: 'Salir sin guardar',
    mensaje: 'Tienes cambios sin guardar.',
    detalle: 'Si sales ahora, perderás los cambios.',
    textoConfirmar: 'Salir',
    textoCancelar: 'Quedarme',
    variante: 'warning',
    icono: 'fas fa-exclamation-triangle'
  })
  if (ok) {
    snapshotInicial = JSON.parse(JSON.stringify(venta.value))
    next()
  } else {
    next(false)
  }
})

// ===== LIFECYCLE =====
onMounted(async () => {
  cargandoInicial.value = true
  try {
    await Promise.all([cargarCatalogos().catch(() => {}), cargarConfigEmpresa()])
    await cargarClientesYProductos()

    if (esEdicion.value) {
      await cargarVenta(id.value)
    } else {
      asignarCodigos()
      snapshotInicial = JSON.parse(JSON.stringify(venta.value))
    }

    await verificarPeriodo()

    if (!unmounted) {
      document.addEventListener('keydown', handleKeydown)
      window.addEventListener('beforeunload', beforeUnloadHandler)
    }
  } catch (e) {
    if (!unmounted) {
      console.error('Error inicial:', e)
      errorGeneral.value = 'Error al cargar datos: ' + (e?.message || 'desconocido')
    }
  } finally {
    if (!unmounted) cargandoInicial.value = false
  }
})

onBeforeUnmount(() => {
  unmounted = true
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('beforeunload', beforeUnloadHandler)

  if (periodoAbort) {
    try {
      periodoAbort.abort()
    } catch {
      /* noop */
    }
    periodoAbort = null
  }

  try {
    modalConfirm?.hide()
  } catch {
    /* noop */
  }

  if (confirmState.resolve) {
    confirmState.resolve(false)
    confirmState.resolve = null
  }
})

// ===== WATCH =====
watch(() => venta.value.fecha_emision, verificarPeriodo, { immediate: false })
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
  font-family: var(--font-mono, monospace);
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
.alert-body {
  flex: 1;
  min-width: 0;
}
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
  font-family: var(--font-mono, monospace);
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
.form-row:last-child {
  margin-bottom: 0;
}
.form-row.cols-3 {
  grid-template-columns: repeat(3, 1fr);
}
.form-row.cols-4 {
  grid-template-columns: repeat(4, 1fr);
}
.form-row.cols-2-1-1 {
  grid-template-columns: 2fr 1fr 1fr;
}

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
.form-control:disabled,
.form-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
.search-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
  border-radius: var(--radius-xs, 4px);
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
  font-family: var(--font-mono, monospace);
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
  background: linear-gradient(
    135deg,
    rgba(52, 152, 219, 0.05),
    rgba(52, 152, 219, 0.02)
  );
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
.cliente-details {
  flex: 1;
  min-width: 0;
}
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
.item-info {
  min-width: 0;
  flex: 1;
}
.item-name {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 0.9rem;
  margin-bottom: 2px;
}
.item-code {
  font-family: var(--font-mono, monospace);
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
  color: var(--accent-color, #f1c40f);
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
  background: linear-gradient(
    135deg,
    rgba(241, 196, 15, 0.08),
    rgba(230, 126, 34, 0.04)
  );
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
   MODAL
   ============================================================ */
.modal-content-clean {
  border-radius: 14px;
  overflow: hidden;
  border: none;
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
  transition: all 0.2s ease-out;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s ease-out;
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
  .btn-back {
    width: 38px;
    height: 38px;
  }
  .title-icon {
    width: 36px;
    height: 36px;
    font-size: 1rem;
  }
  .form-title {
    font-size: 1.2rem;
  }
  .form-subtitle {
    padding-left: 0;
    font-size: 0.78rem;
  }
  .section-header {
    padding: 16px 18px;
  }
  .section-body {
    padding: 18px;
  }
  .form-row.cols-3,
  .form-row.cols-4,
  .form-row.cols-2-1-1 {
    grid-template-columns: 1fr;
  }
  .total-value {
    font-size: 1.4rem;
  }
  .item-card {
    padding: 12px;
  }
  .item-main {
    min-width: 0;
  }
}
</style>