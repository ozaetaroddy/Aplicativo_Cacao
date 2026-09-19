<template>
  <div class="compra-form">
    <!-- HEADER -->
    <div class="form-header">
      <div class="header-left">
        <button
          type="button"
          class="btn-back"
          @click="volver"
          :disabled="cargando"
          aria-label="Volver a compras"
        >
          <i class="fas fa-arrow-left"></i>
        </button>
        <div>
          <h1 class="form-title">
            <span class="title-icon title-icon-orange">
              <i class="fas fa-shopping-cart"></i>
            </span>
            {{ id ? 'Editar Compra' : 'Nueva Compra' }}
          </h1>
          <p class="form-subtitle">
            {{ id ? 'Editando documento existente' : 'Registra una factura de compra o gasto' }}
          </p>
        </div>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="btn-ghost"
          @click="mostrarAyuda = !mostrarAyuda"
          aria-label="Mostrar atajos de teclado"
        >
          <i class="fas fa-keyboard"></i>
          <span>Atajos</span>
        </button>
      </div>
    </div>

    <!-- LOADING INICIAL -->
    <div v-if="cargandoInicial" class="loading-state">
      <div class="spinner-lg"></div>
      <p>Cargando compra...</p>
    </div>

    <template v-else>
      <!-- ATAJOS -->
      <transition name="fade">
        <div v-if="mostrarAyuda" class="shortcuts-panel">
          <div class="shortcuts-title">
            <i class="fas fa-bolt"></i> Atajos de teclado
          </div>
          <div class="shortcuts-grid">
            <div class="shortcut-item"><kbd>F2</kbd><span>Buscar producto</span></div>
            <div class="shortcut-item"><kbd>Ctrl</kbd><kbd>↵</kbd><span>Guardar</span></div>
            <div class="shortcut-item"><kbd>Esc</kbd><span>Limpiar búsqueda</span></div>
          </div>
        </div>
      </transition>

      <AlertaPeriodoCerrado :periodo-cerrado="periodoCerrado" />

      <!-- Aviso: la retención se emitirá automáticamente -->
      <transition name="fade">
        <div v-if="tieneRetencion && !id" class="alert-card alert-info-banner">
          <div class="alert-icon"><i class="fas fa-magic"></i></div>
          <div class="alert-body">
            <strong>Retención automática</strong>
            <div class="small">
              Al guardar, el sistema generará automáticamente el
              <strong>comprobante de retención electrónico</strong> con clave de acceso SRI
              y firma digital (si hay certificado cargado).
            </div>
          </div>
        </div>
      </transition>

      <form @submit.prevent="guardar" novalidate>
        <div class="form-grid">
          <div class="form-main">
            <!-- SECCIÓN 1: Datos -->
            <section class="form-section">
              <header class="section-header">
                <div class="section-number section-number-orange">1</div>
                <div class="section-header-content">
                  <h2 class="section-title">Datos del documento</h2>
                  <p class="section-desc">Tipo, número y fecha de la compra</p>
                </div>
              </header>
              <div class="section-body">
                <div class="form-row cols-2-1-1">
                  <div class="form-field">
                    <label class="form-label" for="cmp-tipo">
                      <span class="required">*</span> Tipo de compra
                    </label>
                    <select
                      id="cmp-tipo"
                      class="form-select"
                      v-model="compra.tipo_compra"
                      :disabled="cargando"
                    >
                      <option value="inventario">Inventario (Cacao, insumos)</option>
                      <option value="gasto">Gasto (Servicios, papelería, honorarios)</option>
                    </select>
                  </div>
                  <div class="form-field">
                    <label class="form-label" for="cmp-numero">Nº Factura</label>
                    <input
                      id="cmp-numero"
                      type="text"
                      class="form-control"
                      v-model="compra.numero_factura"
                      placeholder="Automático"
                      maxlength="50"
                      :disabled="cargando"
                    />
                  </div>
                  <div class="form-field">
                    <label class="form-label" for="cmp-fecha">
                      <span class="required">*</span> Fecha emisión
                    </label>
                    <input
                      id="cmp-fecha"
                      type="date"
                      class="form-control"
                      v-model="compra.fecha_emision"
                      required
                      :disabled="cargando"
                    />
                  </div>
                </div>
              </div>
            </section>

            <!-- SECCIÓN 2: Proveedor -->
            <section class="form-section card-with-dropdown">
              <header class="section-header">
                <div class="section-number section-number-orange">2</div>
                <div class="section-header-content">
                  <h2 class="section-title">Proveedor</h2>
                  <p class="section-desc">Selecciona o crea un proveedor</p>
                </div>
                <router-link to="/proveedores/nuevo" class="btn-new-inline">
                  <i class="fas fa-plus"></i>
                  <span>Nuevo</span>
                </router-link>
              </header>
              <div class="section-body">
                <div class="position-relative">
                  <div class="search-input-group">
                    <i class="fas fa-search search-icon"></i>
                    <input
                      ref="inputProveedor"
                      type="text"
                      class="search-input"
                      placeholder="Escribe nombre, RUC o razón social..."
                      v-model="busquedaProveedor"
                      :disabled="cargando || Boolean(proveedorActual)"
                      @focus="mostrarListaProveedores = true"
                      @input="onProveedorInput"
                      @blur="cerrarListaProveedores"
                    />
                    <button
                      v-if="compra.proveedorId"
                      class="search-clear"
                      type="button"
                      @click="limpiarProveedor"
                      aria-label="Cambiar proveedor"
                    >
                      <i class="fas fa-times"></i>
                    </button>
                  </div>

                  <transition name="dropdown">
                    <div
                      v-if="mostrarListaProveedores && proveedoresFiltrados.length > 0"
                      class="search-dropdown"
                    >
                      <div
                        v-for="p in proveedoresFiltrados.slice(0, 8)"
                        :key="p._id"
                        class="dropdown-row"
                        @mousedown.prevent="seleccionarProveedor(p)"
                      >
                        <div class="row-avatar row-avatar-orange">
                          {{ getInitials(p.nombre) }}
                        </div>
                        <div class="row-content">
                          <div class="row-title">{{ p.nombre }}</div>
                          <div class="row-meta">
                            <span><i class="fas fa-id-card"></i> {{ p.ruc }}</span>
                            <span v-if="p.telefono">
                              <i class="fas fa-phone"></i> {{ p.telefono }}
                            </span>
                          </div>
                        </div>
                        <i
                          v-if="compra.proveedorId === p._id"
                          class="fas fa-check-circle row-check"
                        ></i>
                      </div>
                    </div>
                  </transition>
                </div>

                <transition name="fade">
                  <div v-if="proveedorActual" class="cliente-card cliente-card-orange">
                    <div class="cliente-avatar-large cliente-avatar-orange">
                      {{ getInitials(proveedorActual.nombre) }}
                    </div>
                    <div class="cliente-details">
                      <div class="cliente-name">{{ proveedorActual.nombre }}</div>
                      <div class="cliente-meta-grid">
                        <div><strong>RUC:</strong> {{ proveedorActual.ruc }}</div>
                        <div v-if="proveedorActual.telefono">
                          <strong>Tel:</strong> {{ proveedorActual.telefono }}
                        </div>
                        <div v-if="proveedorActual.email">
                          <strong>Email:</strong> {{ proveedorActual.email }}
                        </div>
                        <div v-if="proveedorActual.direccion">
                          <strong>Dir:</strong> {{ proveedorActual.direccion }}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="cliente-change"
                      @click="limpiarProveedor"
                      aria-label="Cambiar proveedor"
                    >
                      <i class="fas fa-exchange-alt"></i>
                    </button>
                  </div>
                </transition>
              </div>
            </section>

            <!-- SECCIÓN 3: Productos -->
            <section class="form-section card-with-dropdown">
              <header class="section-header">
                <div class="section-number section-number-orange">3</div>
                <div class="section-header-content">
                  <h2 class="section-title">
                    Detalles de compra
                    <span
                      v-if="compra.detalles.length > 0"
                      class="count-badge count-badge-orange"
                    >
                      {{ compra.detalles.length }}
                    </span>
                  </h2>
                  <p class="section-desc">Agrega productos o servicios</p>
                </div>
                <button
                  type="button"
                  class="btn-new-inline btn-new-orange"
                  @click="focusBusquedaProducto"
                  :disabled="cargando"
                >
                  <i class="fas fa-search"></i>
                  <span>Buscar (F2)</span>
                </button>
              </header>
              <div class="section-body">
                <div class="position-relative">
                  <div class="search-input-group search-input-primary">
                    <i class="fas fa-barcode search-icon"></i>
                    <input
                      ref="inputProducto"
                      type="text"
                      class="search-input"
                      placeholder="Busca productos por nombre o código. Enter para agregar..."
                      v-model="busquedaProducto"
                      :disabled="cargando"
                      @focus="mostrarListaProductos = true"
                      @input="onProductoInput"
                      @keydown.enter.prevent="agregarPrimerProducto"
                      @keydown.esc="limpiarBusquedaProducto"
                      @blur="cerrarListaProductos"
                    />
                  </div>

                  <transition name="dropdown">
                    <div
                      v-if="mostrarListaProductos && productosFiltrados.length > 0"
                      class="search-dropdown"
                    >
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
                            <span :class="(p.stock || 0) <= 0 ? 'stock-zero' : 'stock-ok'">
                              <i class="fas fa-cube"></i> Stock: {{ p.stock || 0 }}
                            </span>
                          </div>
                        </div>
                        <div class="row-price">
                          <div class="price-value">
                            ${{ (p.precio_compra || 0).toFixed(2) }}
                          </div>
                          <div class="price-label">compra</div>
                        </div>
                      </div>
                    </div>
                  </transition>
                </div>

                <div v-if="compra.detalles.length === 0" class="empty-items">
                  <div class="empty-icon"><i class="fas fa-box-open"></i></div>
                  <div class="empty-title">No has agregado productos</div>
                  <div class="empty-text">
                    Usa el buscador o presiona <kbd>F2</kbd>
                  </div>
                </div>

                <div v-else class="items-list">
                  <div
                    v-for="(item, index) in compra.detalles"
                    :key="index"
                    class="item-card"
                  >
                    <div class="item-main">
                      <div class="item-icon item-icon-orange">
                        <i class="fas fa-box"></i>
                      </div>
                      <div class="item-info">
                        <div class="item-name">{{ item.nombre || 'Producto' }}</div>
                        <div class="item-code">{{ item.codigo || 'Sin código' }}</div>
                      </div>
                    </div>

                    <div class="item-controls">
                      <div class="control-group">
                        <label>Cantidad</label>
                        <div class="qty-control">
                          <button
                            type="button"
                            @click="cambiarCantidad(index, -1)"
                            :disabled="cargando"
                          >
                            <i class="fas fa-minus"></i>
                          </button>
                          <input
                            type="number"
                            v-model.number="item.cantidad"
                            min="0.01"
                            step="0.01"
                            :disabled="cargando"
                            @blur="validarCantidad(index)"
                          />
                          <button
                            type="button"
                            @click="cambiarCantidad(index, 1)"
                            :disabled="cargando"
                          >
                            <i class="fas fa-plus"></i>
                          </button>
                        </div>
                      </div>

                      <div class="control-group">
                        <label>Costo unit.</label>
                        <div class="price-input">
                          <span>$</span>
                          <input
                            type="number"
                            v-model.number="item.costo_unitario"
                            min="0"
                            step="0.01"
                            :disabled="cargando"
                          />
                        </div>
                      </div>

                      <div class="control-group">
                        <label>IVA</label>
                        <select
                          class="form-select form-select-sm"
                          v-model="item.aplica_iva"
                          :disabled="cargando"
                        >
                          <option :value="true">15%</option>
                          <option :value="false">0%</option>
                        </select>
                      </div>

                      <div class="control-group control-subtotal">
                        <label>Subtotal</label>
                        <div class="subtotal-value">
                          ${{ ((item.cantidad || 0) * (item.costo_unitario || 0)).toFixed(2) }}
                        </div>
                      </div>

                      <button
                        type="button"
                        class="item-remove"
                        @click="eliminarDetalle(index)"
                        :disabled="cargando"
                        :aria-label="`Eliminar ${item.nombre}`"
                      >
                        <i class="fas fa-times"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- SECCIÓN 4: Pago -->
            <section class="form-section">
              <header
                class="section-header section-header-clickable"
                @click="seccionesExpandidas.pago = !seccionesExpandidas.pago"
              >
                <div class="section-number section-number-orange">
                  <i class="fas fa-credit-card"></i>
                </div>
                <div class="section-header-content">
                  <h2 class="section-title">Pago</h2>
                  <p class="section-desc">Forma, estado y fecha de pago</p>
                </div>
                <i
                  class="fas toggle-chevron"
                  :class="seccionesExpandidas.pago ? 'fa-chevron-up' : 'fa-chevron-down'"
                ></i>
              </header>
              <transition name="collapse">
                <div v-show="seccionesExpandidas.pago" class="section-body">
                  <div class="form-row cols-3">
                    <div class="form-field">
                      <label class="form-label" for="cmp-pago-estado">Estado de pago</label>
                      <select
                        id="cmp-pago-estado"
                        class="form-select"
                        v-model="compra.estado_pago"
                        :disabled="cargando"
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="pagado">Pagado</option>
                      </select>
                    </div>
                    <div class="form-field">
                      <label class="form-label">Forma de pago</label>
                      <SelectSRI
                        v-model="compra.forma_pago"
                        :lista="catalogos.FORMA_PAGO || []"
                        placeholder="Seleccione..."
                      />
                    </div>
                    <div class="form-field">
                      <label class="form-label" for="cmp-fecha-pago">Fecha de pago</label>
                      <input
                        id="cmp-fecha-pago"
                        type="date"
                        class="form-control"
                        v-model="compra.fecha_pago"
                        :disabled="cargando"
                      />
                    </div>
                  </div>
                </div>
              </transition>
            </section>

            <!-- SECCIÓN 5: Retención (🆕) -->
            <section class="form-section form-section-retencion">
              <header
                class="section-header section-header-purple section-header-clickable"
                @click="seccionesExpandidas.retencion = !seccionesExpandidas.retencion"
              >
                <div class="section-number section-number-purple">
                  <i class="fas fa-percent"></i>
                </div>
                <div class="section-header-content">
                  <h2 class="section-title">
                    Retención
                    <span
                      v-if="compra.impuestos_retencion.length > 0"
                      class="count-badge count-badge-purple"
                    >
                      {{ compra.impuestos_retencion.length }}
                    </span>
                  </h2>
                  <p class="section-desc">
                    Si aplica retención, se emitirá el comprobante automáticamente
                  </p>
                </div>
                <i
                  class="fas toggle-chevron"
                  :class="seccionesExpandidas.retencion ? 'fa-chevron-up' : 'fa-chevron-down'"
                ></i>
              </header>
              <transition name="collapse">
                <div v-show="seccionesExpandidas.retencion" class="section-body">
                  <!-- Toggle activar retención -->
                  <div class="ret-toggle-row">
                    <label class="ret-toggle">
                      <input
                        type="checkbox"
                        :checked="tieneRetencion"
                        @change="toggleRetencion($event.target.checked)"
                        :disabled="cargando"
                      />
                      <span class="ret-toggle-slider"></span>
                      <span class="ret-toggle-text">
                        <strong>Aplicar retención</strong>
                        <small>
                          Al activar, se emitirá un comprobante de retención electrónico
                          con clave de acceso SRI
                        </small>
                      </span>
                    </label>
                  </div>

                  <!-- Impuestos retenidos -->
                  <template v-if="tieneRetencion">
                    <div class="subsection">
                      <h3 class="subsection-title">
                        <i class="fas fa-calculator"></i>
                        Impuestos Retenidos
                        <span class="badge-hint">
                          Catálogo SRI oficial
                        </span>
                      </h3>

                      <div
                        v-if="compra.impuestos_retencion.length === 0"
                        class="empty-items empty-items-compact"
                      >
                        <div class="empty-icon"><i class="fas fa-percent"></i></div>
                        <div class="empty-title">No hay impuestos retenidos</div>
                        <div class="empty-text">
                          Agrega al menos un impuesto del catálogo SRI
                        </div>
                      </div>

                      <div v-else class="items-list">
                        <div
                          v-for="(imp, idx) in compra.impuestos_retencion"
                          :key="`ret-${idx}`"
                          class="item-card item-card-retencion"
                        >
                          <div class="form-row cols-4" style="width: 100%; margin: 0;">
                            <div class="form-field" style="grid-column: span 2;">
                              <label :for="`ret-codigo-${idx}`" class="form-label">
                                <span class="required">*</span> Código Retención (SRI)
                              </label>
                              <select
                                :id="`ret-codigo-${idx}`"
                                class="form-select"
                                :value="`${imp.impuesto}:${imp.codigoRetencion}`"
                                :disabled="cargando"
                                @change="onCambiarCodigoRetencion(idx, $event.target.value)"
                              >
                                <option value="">— Seleccione del catálogo SRI —</option>
                                <optgroup label="Impuesto a la Renta">
                                  <option
                                    v-for="t in RETENCIONES_RENTA"
                                    :key="`RENTA:${t.codigo}`"
                                    :value="`RENTA:${t.codigo}`"
                                  >
                                    {{ t.codigo }} — {{ t.nombre }} ({{ t.porcentaje }}%)
                                  </option>
                                </optgroup>
                                <optgroup label="IVA">
                                  <option
                                    v-for="t in RETENCIONES_IVA"
                                    :key="`IVA:${t.codigo}`"
                                    :value="`IVA:${t.codigo}`"
                                  >
                                    {{ t.codigo }} — {{ t.nombre }} ({{ t.porcentaje }}%)
                                  </option>
                                </optgroup>
                              </select>
                              <small v-if="imp.concepto" class="form-hint">
                                <i class="fas fa-info-circle"></i>
                                {{ imp.impuesto }} · {{ imp.concepto }}
                              </small>
                            </div>

                            <div class="form-field">
                              <label :for="`ret-base-${idx}`" class="form-label">
                                <span class="required">*</span> Base ($)
                              </label>
                              <input
                                :id="`ret-base-${idx}`"
                                type="number"
                                class="form-control"
                                v-model.number="imp.baseImponible"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                @input="recalcularValorRetencion(idx)"
                              />
                            </div>

                            <div class="form-field">
                              <label :for="`ret-porcentaje-${idx}`" class="form-label">
                                % Retener
                              </label>
                              <input
                                :id="`ret-porcentaje-${idx}`"
                                type="number"
                                class="form-control"
                                v-model.number="imp.porcentajeRetener"
                                min="0"
                                max="100"
                                step="0.01"
                                placeholder="0.00"
                                @input="recalcularValorRetencion(idx)"
                              />
                            </div>
                          </div>

                          <div
                            class="form-row cols-4"
                            style="width: 100%; margin: 12px 0 0;"
                          >
                            <div class="form-field">
                              <label :for="`ret-valor-${idx}`" class="form-label">
                                Valor Retenido ($)
                              </label>
                              <input
  :id="`ret-valor-${idx}`"
  type="number"
  class="form-control input-readonly"
  :value="imp.valorRetenido"
  readonly
/>
                            </div>
                            <div class="form-field">
                              <label :for="`ret-doc-codigo-${idx}`" class="form-label">
                                Código Doc. Sustento
                              </label>
                              <input
                                :id="`ret-doc-codigo-${idx}`"
                                type="text"
                                class="form-control"
                                v-model="imp.codigoDocumento"
                                placeholder="01"
                                maxlength="3"
                              />
                            </div>
                            <div class="form-field">
                              <label :for="`ret-doc-numero-${idx}`" class="form-label">
                                Nº Doc. Sustento
                              </label>
                              <input
                                :id="`ret-doc-numero-${idx}`"
                                type="text"
                                class="form-control"
                                v-model="imp.numeroDocumento"
                                :placeholder="compra.numero_factura || '001-001-000000001'"
                              />
                            </div>
                            <div class="form-field">
                              <label :for="`ret-doc-fecha-${idx}`" class="form-label">
                                Fecha Doc. Sustento
                              </label>
                              <input
                                :id="`ret-doc-fecha-${idx}`"
                                type="date"
                                class="form-control"
                                v-model="imp.fechaEmisionDocSustento"
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            class="item-remove"
                            @click="eliminarImpuestoRetencion(idx)"
                            title="Quitar impuesto"
                            aria-label="Quitar impuesto"
                          >
                            <i class="fas fa-times"></i>
                          </button>
                        </div>
                      </div>

                      <div
                        v-if="compra.impuestos_retencion.length > 0"
                        class="ret-total"
                      >
                        <span>
                          <i class="fas fa-calculator"></i>
                          Total retenido:
                        </span>
                        <strong>${{ totalRetenido.toFixed(2) }}</strong>
                      </div>

                      <button
                        type="button"
                        class="btn-new-inline btn-new-purple"
                        @click="agregarImpuestoRetencion"
                        style="margin-top: 12px;"
                        :disabled="cargando"
                      >
                        <i class="fas fa-plus"></i>
                        <span>Agregar impuesto</span>
                      </button>
                    </div>

                    <!-- Advertencia de equivalencia -->
                    <div
                      v-if="compra.impuestos_retencion.length > 0 && !coincideRetencionManual"
                      class="advertencia-box"
                    >
                      <i class="fas fa-info-circle"></i>
                      <span>
                        El monto de los impuestos (<strong>${{ totalRetenido.toFixed(2) }}</strong>)
                        se usará como retención oficial. Si querías solo un valor aproximado,
                        ajusta los impuestos o desactiva la retención.
                      </span>
                    </div>
                  </template>

                  <!-- Ayuda cuando está desactivado -->
                  <div v-else class="ret-help">
                    <div class="ret-help-icon">
                      <i class="fas fa-info-circle"></i>
                    </div>
                    <div>
                      <strong>¿Cuándo aplicar retención?</strong>
                      <ul>
                        <li>Cuando el proveedor es contribuyente especial o presta servicios profesionales.</li>
                        <li>Cuando la compra supera el umbral del SRI según el tipo de bien/servicio.</li>
                        <li>La retención se calcula según el <strong>catálogo oficial del SRI</strong>.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </transition>
            </section>

            <!-- SECCIÓN 6: Observaciones -->
            <section class="form-section">
              <header class="section-header">
                <div class="section-number section-number-orange">
                  <i class="fas fa-comment-alt"></i>
                </div>
                <div class="section-header-content">
                  <h2 class="section-title">Observaciones</h2>
                  <p class="section-desc">Notas internas sobre esta compra</p>
                </div>
              </header>
              <div class="section-body">
                <div class="form-field">
                  <textarea
                    class="form-control"
                    v-model="compra.observaciones"
                    rows="3"
                    placeholder="Notas adicionales..."
                    maxlength="1000"
                    :disabled="cargando"
                  ></textarea>
                  <small class="form-hint">
                    {{ (compra.observaciones || '').length }} / 1000 caracteres
                  </small>
                </div>
              </div>
            </section>
          </div>

          <!-- SIDEBAR -->
          <aside class="form-sidebar">
            <div class="sidebar-sticky">
              <div class="summary-card summary-card-orange">
                <div class="summary-header summary-header-orange">
                  <i class="fas fa-calculator"></i>
                  <span>Resumen de compra</span>
                </div>
                <div class="summary-body">
                  <div class="summary-row">
                    <span class="summary-label">Productos</span>
                    <span class="summary-value">{{ compra.detalles.length }}</span>
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
                  <div class="summary-total summary-total-orange">
                    <span class="total-label">TOTAL COMPRA</span>
                    <span class="total-value total-value-orange">
                      ${{ total.toFixed(2) }}
                    </span>
                  </div>

                  <!-- Retención en el resumen -->
                  <template v-if="tieneRetencion">
                    <div class="summary-divider"></div>
                    <div class="summary-row">
                      <span class="summary-label">Retención</span>
                      <span class="summary-value summary-value-purple">
                        -${{ totalRetenido.toFixed(2) }}
                      </span>
                    </div>
                    <div class="summary-row">
                      <span class="summary-label">A pagar al proveedor</span>
                      <span class="summary-value">
                        ${{ (total - totalRetenido).toFixed(2) }}
                      </span>
                    </div>
                  </template>
                </div>
              </div>

              <div class="status-card">
                <div class="status-item" :class="{ complete: compra.proveedorId }">
                  <i :class="compra.proveedorId ? 'fas fa-check-circle' : 'far fa-circle'"></i>
                  <span>Proveedor seleccionado</span>
                </div>
                <div
                  class="status-item"
                  :class="{ complete: compra.detalles.length > 0 }"
                >
                  <i
                    :class="compra.detalles.length > 0 ? 'fas fa-check-circle' : 'far fa-circle'"
                  ></i>
                  <span>Productos agregados</span>
                </div>
                <div
                  class="status-item"
                  :class="{ complete: Boolean(compra.fecha_emision) }"
                >
                  <i
                    :class="compra.fecha_emision ? 'fas fa-check-circle' : 'far fa-circle'"
                  ></i>
                  <span>Fecha establecida</span>
                </div>
                <div
                  v-if="tieneRetencion"
                  class="status-item"
                  :class="{ complete: retencionValida }"
                >
                  <i
                    :class="retencionValida ? 'fas fa-check-circle' : 'far fa-circle'"
                  ></i>
                  <span>Impuestos de retención</span>
                </div>
              </div>

              <div class="actions-card">
                <button
                  type="submit"
                  class="btn-save btn-save-orange"
                  :disabled="cargando || !formularioValido || Boolean(periodoCerrado)"
                >
                  <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
                  <span>{{ cargando ? 'Guardando...' : 'Guardar compra' }}</span>
                  <kbd>Ctrl+↵</kbd>
                </button>
                <button type="button" class="btn-cancel" @click="volver" :disabled="cargando">
                  <i class="fas fa-times"></i>
                  <span>Cancelar</span>
                </button>
              </div>

              <div v-if="tieneRetencion && !id" class="info-card info-card-purple">
                <i class="fas fa-magic"></i>
                <div>
                  <div class="info-title">Retención automática</div>
                  <div class="info-text">
                    Se generará un comprobante de retención electrónico al guardar
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <transition name="fade">
          <div v-if="errorGeneral" class="error-banner">
            <i class="fas fa-exclamation-circle"></i>
            <span>{{ errorGeneral }}</span>
          </div>
        </transition>
      </form>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../services/api'
import { roundTo2 } from '../../utils/formatters'
import { useToast } from 'vue-toastification'
import { useCatalogosSRI } from '../../composables/useCatalogosSRI'
import SelectSRI from '../shared/SelectSRI.vue'
import AlertaPeriodoCerrado from '../shared/AlertaPeriodoCerrado.vue'
import Fuse from 'fuse.js'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { catalogos, cargarCatalogos } = useCatalogosSRI()

// ===== CONSTANTES =====
const CODIGO_IMPUESTO_RETENCION = Object.freeze({ RENTA: '1', IVA: '2' })

// ===== STATE =====
const id = route.params.id || null
const proveedores = ref([])
const productos = ref([])
const cargandoInicial = ref(Boolean(id))
const cargando = ref(false)
const errorGeneral = ref('')
const periodoCerrado = ref(null)

const inputProveedor = ref(null)
const inputProducto = ref(null)
const busquedaProveedor = ref('')
const busquedaProducto = ref('')
const mostrarListaProveedores = ref(false)
const mostrarListaProductos = ref(false)
const mostrarAyuda = ref(false)

const seccionesExpandidas = ref({ pago: true, retencion: true })

let fuseProveedores = null
let fuseProductos = null

const compra = ref({
  proveedorId: '',
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  detalles: [],
  subtotal: 0,
  iva: 0,
  total: 0,
  tipo_compra: 'inventario',
  estado_pago: 'pendiente',
  forma_pago: '',
  fecha_pago: '',
  observaciones: '',
  // 🆕 Impuestos de retención
  impuestos_retencion: []
})
const formOriginal = ref(null)

// Debounce
const debounceTimers = {}
let unmounted = false

// ===== COMPUTED =====
const proveedorActual = computed(() => {
  if (!compra.value.proveedorId) return null
  return proveedores.value.find(p => p._id === compra.value.proveedorId) || null
})

const proveedoresFiltrados = computed(() => {
  if (!busquedaProveedor.value.trim()) return proveedores.value.slice(0, 20)
  if (!fuseProveedores) return []
  try {
    return fuseProveedores.search(busquedaProveedor.value.trim()).map(r => r.item)
  } catch {
    return []
  }
})

const productosFiltrados = computed(() => {
  if (!busquedaProducto.value.trim()) return productos.value.slice(0, 20)
  if (!fuseProductos) return []
  try {
    return fuseProductos.search(busquedaProducto.value.trim()).map(r => r.item)
  } catch {
    return []
  }
})

// 🆕 Catálogos de retención desde useCatalogosSRI
const RETENCIONES_RENTA = computed(() => {
  const arr = catalogos.value?.TIPO_RETENCION || []
  return arr.filter(t => t.impuesto === 'RENTA')
})

const RETENCIONES_IVA = computed(() => {
  const arr = catalogos.value?.TIPO_RETENCION || []
  return arr.filter(t => t.impuesto === 'IVA')
})

const subtotal = computed(() =>
  roundTo2(
    compra.value.detalles.reduce(
      (acc, d) => acc + (Number(d.cantidad) || 0) * (Number(d.costo_unitario) || 0),
      0
    )
  )
)

const iva = computed(() => {
  let base = 0
  for (const d of compra.value.detalles) {
    if (d.aplica_iva !== false) {
      base += (Number(d.cantidad) || 0) * (Number(d.costo_unitario) || 0)
    }
  }
  return roundTo2(base * 0.15)
})

const total = computed(() => roundTo2(subtotal.value + iva.value))

// 🆕 Retención
const tieneRetencion = computed(() => {
  return Array.isArray(compra.value.impuestos_retencion)
    && compra.value.impuestos_retencion.length > 0
})

const totalRetenido = computed(() => {
  if (!tieneRetencion.value) return 0
  return roundTo2(
    compra.value.impuestos_retencion.reduce(
      (s, x) => s + (Number(x.valorRetenido) || 0),
      0
    )
  )
})

const retencionValida = computed(() => {
  if (!tieneRetencion.value) return true
  return compra.value.impuestos_retencion.every(
    imp =>
      imp.codigoRetencion &&
      Number(imp.baseImponible) >= 0 &&
      Number(imp.porcentajeRetener) > 0 &&
      Number(imp.valorRetenido) > 0
  )
})

/**
 * ¿El total retenido coincide con lo que el usuario esperaría?
 * Se usa solo para mostrar advertencia informativa.
 */
const coincideRetencionManual = computed(() => {
  if (!tieneRetencion.value) return true
  return true // ya no hay campo "retencion_valor" separado, siempre coincide
})

const formularioValido = computed(() => {
  if (!compra.value.proveedorId) return false
  if (!Array.isArray(compra.value.detalles) || compra.value.detalles.length === 0) return false
  const detallesOk = compra.value.detalles.every(
    d => d.productoId && Number(d.cantidad) > 0 && Number(d.costo_unitario) >= 0
  )
  if (!detallesOk) return false
  if (!retencionValida.value) return false
  return true
})

const hayCambios = computed(() => {
  if (!formOriginal.value) return false
  return JSON.stringify(compra.value) !== JSON.stringify(formOriginal.value)
})

// ===== HELPERS =====
const getInitials = (nombre) => {
  if (!nombre) return '?'
  return String(nombre)
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const generarCodigoCompra = () => `COM-${String(Date.now()).slice(-6)}`

const debounce = (key, fn, ms = 300) => {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key])
  debounceTimers[key] = setTimeout(() => {
    delete debounceTimers[key]
    fn()
  }, ms)
}

// ===== BÚSQUEDA PROVEEDOR =====
const onProveedorInput = () => {
  mostrarListaProveedores.value = true
}

const cerrarListaProveedores = () => {
  setTimeout(() => {
    mostrarListaProveedores.value = false
  }, 200)
}

const seleccionarProveedor = (p) => {
  compra.value.proveedorId = p._id
  busquedaProveedor.value = ''
  mostrarListaProveedores.value = false
}

const limpiarProveedor = () => {
  compra.value.proveedorId = ''
  busquedaProveedor.value = ''
  nextTick(() => inputProveedor.value?.focus())
}

// ===== BÚSQUEDA PRODUCTO =====
const onProductoInput = () => {
  mostrarListaProductos.value = true
}

const cerrarListaProductos = () => {
  setTimeout(() => {
    mostrarListaProductos.value = false
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
  if (productosFiltrados.value.length > 0) {
    agregarProducto(productosFiltrados.value[0])
  }
}

const agregarProducto = (p) => {
  if (!p || !p._id) return

  const existente = compra.value.detalles.find(d => d.productoId === p._id)
  if (existente) {
    existente.cantidad = roundTo2((Number(existente.cantidad) || 0) + 1)
    toast.info(`${p.nombre} aumentado a ${existente.cantidad}`)
  } else {
    compra.value.detalles.push({
      productoId: p._id,
      codigo: p.codigo || '',
      nombre: p.nombre || 'Producto',
      cantidad: 1,
      costo_unitario: roundTo2(p.precio_compra || 0),
      aplica_iva: p.aplica_iva !== undefined ? Boolean(p.aplica_iva) : true
    })
  }

  busquedaProducto.value = ''
  mostrarListaProductos.value = false
  nextTick(() => inputProducto.value?.focus())
}

const cambiarCantidad = (index, delta) => {
  const item = compra.value.detalles[index]
  if (!item) return
  const nueva = (Number(item.cantidad) || 0) + delta
  if (nueva < 0.01) return
  item.cantidad = roundTo2(nueva)
}

const validarCantidad = (index) => {
  const item = compra.value.detalles[index]
  if (!item) return
  if (!Number(item.cantidad) || Number(item.cantidad) <= 0) {
    item.cantidad = 1
  }
}

const eliminarDetalle = (index) => {
  compra.value.detalles.splice(index, 1)
}

// ============================================================
// 🆕 RETENCIÓN — Helpers
// ============================================================

const buscarRetencionLocal = (codigo, impuesto) => {
  if (!codigo || !impuesto) return null
  const arr = catalogos.value?.TIPO_RETENCION || []
  return arr.find(t => t.codigo === codigo && t.impuesto === impuesto) || null
}

const toggleRetencion = (activar) => {
  if (activar) {
    if (compra.value.impuestos_retencion.length === 0) {
      agregarImpuestoRetencion()
    }
  } else {
    compra.value.impuestos_retencion = []
  }
}

const agregarImpuestoRetencion = () => {
  // Sugerir base según el subtotal y código IVA 30% (más común)
  const baseSugerida = subtotal.value > 0 ? subtotal.value : 0
  const ivaSugerido = iva.value > 0 ? iva.value : 0

  compra.value.impuestos_retencion.push({
    codigo: '',
    codigoRetencion: '',
    impuesto: '',
    concepto: '',
    baseImponible: baseSugerida,
    porcentajeRetener: 0,
    valorRetenido: 0,
    codigoDocumento: '01',
    numeroDocumento: compra.value.numero_factura || '',
    fechaEmisionDocSustento: compra.value.fecha_emision || ''
  })

  // Si hay IVA en la compra, sugerir el código de retención IVA 30%
  if (ivaSugerido > 0) {
    const ivaDefault = buscarRetencionLocal('721', 'IVA')
    if (ivaDefault) {
      const idx = compra.value.impuestos_retencion.length - 1
      compra.value.impuestos_retencion[idx].codigoRetencion = '721'
      compra.value.impuestos_retencion[idx].impuesto = 'IVA'
      compra.value.impuestos_retencion[idx].codigo = '2'
      compra.value.impuestos_retencion[idx].concepto = ivaDefault.nombre
      compra.value.impuestos_retencion[idx].porcentajeRetener = ivaDefault.porcentaje
      compra.value.impuestos_retencion[idx].baseImponible = ivaSugerido
      recalcularValorRetencion(idx)
    }
  }
}

const eliminarImpuestoRetencion = (index) => {
  compra.value.impuestos_retencion.splice(index, 1)
}

const onCambiarCodigoRetencion = (idx, value) => {
  const imp = compra.value.impuestos_retencion[idx]
  if (!imp) return

  if (!value) {
    imp.codigoRetencion = ''
    imp.impuesto = ''
    imp.codigo = ''
    imp.concepto = ''
    imp.porcentajeRetener = 0
    imp.valorRetenido = 0
    return
  }

  const [impuesto, codigo] = String(value).split(':')
  if (!impuesto || !codigo) return

  imp.impuesto = impuesto
  imp.codigoRetencion = codigo
  imp.codigo = CODIGO_IMPUESTO_RETENCION[impuesto] || '1'

  const cat = buscarRetencionLocal(codigo, impuesto)
  if (cat) {
    imp.concepto = cat.nombre
    imp.porcentajeRetener = cat.porcentaje
  }

  recalcularValorRetencion(idx)
}

const recalcularValorRetencion = (idx) => {
  const imp = compra.value.impuestos_retencion[idx]
  if (!imp) return
  const base = Number(imp.baseImponible) || 0
  const pct = Number(imp.porcentajeRetener) || 0
  imp.valorRetenido = roundTo2(base * (pct / 100))
}

// ===== PERIODO =====
const verificarPeriodo = async () => {
  if (!compra.value.fecha_emision) {
    periodoCerrado.value = null
    return
  }
  try {
    const fecha = new Date(compra.value.fecha_emision)
    const res = await api.request(
      `/periodos/verificar/${fecha.getFullYear()}/${fecha.getMonth() + 1}`,
      { method: 'GET', skipLoader: true }
    )
    if (unmounted) return
    periodoCerrado.value = res?.cerrado ? res.periodo : null
  } catch {
    if (!unmounted) periodoCerrado.value = null
  }
}

// ===== ATAJOS =====
const handleKeydown = (e) => {
  if (e.key === 'F2') {
    e.preventDefault()
    inputProducto.value?.focus()
  } else if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault()
    if (formularioValido.value && !cargando.value && !periodoCerrado.value) {
      guardar()
    }
  }
}

// ===== NAVEGACIÓN =====
const volver = () => {
  if (cargando.value) return
  if (hayCambios.value) {
    if (!window.confirm('Hay cambios sin guardar. ¿Salir de todas formas?')) return
  }
  router.push('/compras')
}

// ===== CARGA INICIAL =====
const cargarDatos = async () => {
  cargandoInicial.value = true
  try {
    cargarCatalogos().catch(() => {})

    const [provsRes, prodsRes] = await Promise.all([
      api.request('/proveedores?limit=2000', { method: 'GET', skipLoader: true }),
      api.request('/productos?limit=5000', { method: 'GET', skipLoader: true })
    ])
    if (unmounted) return

    proveedores.value = Array.isArray(provsRes) ? provsRes : (provsRes?.data || [])
    productos.value = Array.isArray(prodsRes) ? prodsRes : (prodsRes?.data || [])

    try {
      if (proveedores.value.length > 0) {
        fuseProveedores = new Fuse(proveedores.value, {
          keys: ['nombre', 'ruc', 'telefono', 'email'],
          threshold: 0.3
        })
      }
      if (productos.value.length > 0) {
        fuseProductos = new Fuse(productos.value, {
          keys: ['nombre', 'codigo', 'codigo_barras'],
          threshold: 0.3
        })
      }
    } catch { /* Fuse opcional */ }

    if (id) {
      const data = await api.request(`/compras/${id}`, {
        method: 'GET',
        loaderMessage: 'Cargando compra...'
      })
      if (unmounted) return

      if (!data || !data._id) {
        errorGeneral.value = 'Compra no encontrada'
        return
      }

      const detalles = Array.isArray(data.detalles)
        ? data.detalles.map(d => {
            const prod = productos.value.find(p => p._id === d.productoId)
            return {
              ...d,
              codigo: prod?.codigo || d.codigo || '',
              nombre: prod?.nombre || d.nombre || 'Producto'
            }
          })
        : []

      // 🆕 Normalizar impuestos de retención existentes
      const impuestos = Array.isArray(data.impuestos_retencion)
        ? data.impuestos_retencion.map(imp => ({
            codigo: imp.codigo || (imp.impuesto === 'IVA' ? '2' : '1'),
            codigoRetencion: imp.codigoRetencion || imp.tipo_retencion || '',
            impuesto: imp.impuesto || imp.impuesto_retencion || '',
            concepto: imp.concepto || '',
            baseImponible: Number(imp.baseImponible) || 0,
            porcentajeRetener: Number(imp.porcentajeRetener) || 0,
            valorRetenido: Number(imp.valorRetenido) || 0,
            codigoDocumento: imp.codigoDocumento || '01',
            numeroDocumento: imp.numeroDocumento || data.numero_factura || '',
            fechaEmisionDocSustento:
              imp.fechaEmisionDocSustento || (data.fecha_emision
                ? new Date(data.fecha_emision).toISOString().split('T')[0]
                : '')
          }))
        : []

      compra.value = {
        proveedorId: data.proveedorId || '',
        numero_factura: data.numero_factura || '',
        fecha_emision: data.fecha_emision
          ? new Date(data.fecha_emision).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        detalles,
        subtotal: data.subtotal || 0,
        iva: data.iva || 0,
        total: data.total || 0,
        tipo_compra: data.tipo_compra || 'inventario',
        estado_pago: data.estado_pago || 'pendiente',
        forma_pago: data.forma_pago || '',
        fecha_pago: data.fecha_pago
          ? new Date(data.fecha_pago).toISOString().split('T')[0]
          : '',
        observaciones: data.observaciones || '',
        impuestos_retencion: impuestos
      }
    } else {
      compra.value.numero_factura = generarCodigoCompra()
    }

    formOriginal.value = JSON.parse(JSON.stringify(compra.value))
  } catch (e) {
    if (!unmounted) {
      const codigo = e?.codigo || e?.code
      if (codigo === 'COMPRA_NOT_FOUND' || codigo === 'ID_INVALIDO') {
        errorGeneral.value = 'Compra no encontrada'
      } else {
        errorGeneral.value = 'Error al cargar datos: ' + e.message
      }
    }
  } finally {
    if (!unmounted) cargandoInicial.value = false
  }
}

// ===== GUARDAR =====
const guardar = async () => {
  if (periodoCerrado.value) {
    toast.error(`No se puede guardar: ${periodoCerrado.value.nombre} está cerrado`)
    return
  }
  if (!formularioValido.value) {
    errorGeneral.value = 'Completa el proveedor, productos y verifica los impuestos de retención'
    toast.warning('Verifica los datos')
    return
  }
  if (cargando.value) return

  errorGeneral.value = ''
  cargando.value = true

  try {
    // 🆕 Filtrar impuestos con código válido
    const impuestosValidos = compra.value.impuestos_retencion
      .filter(imp => imp.codigoRetencion)
      .map(imp => ({
        codigo: imp.codigo || (imp.impuesto === 'IVA' ? '2' : '1'),
        codigoRetencion: String(imp.codigoRetencion).trim(),
        impuesto: imp.impuesto || '',
        concepto: imp.concepto || '',
        baseImponible: roundTo2(Number(imp.baseImponible) || 0),
        porcentajeRetener: roundTo2(Number(imp.porcentajeRetener) || 0),
        valorRetenido: roundTo2(Number(imp.valorRetenido) || 0),
        codigoDocumento: imp.codigoDocumento || '01',
        numeroDocumento: imp.numeroDocumento || compra.value.numero_factura || '',
        fechaEmisionDocSustento: imp.fechaEmisionDocSustento || compra.value.fecha_emision
      }))

    const payload = {
      proveedorId: compra.value.proveedorId,
      numero_factura: compra.value.numero_factura,
      fecha_emision: compra.value.fecha_emision,
      detalles: compra.value.detalles.map(d => ({
        productoId: d.productoId,
        cantidad: roundTo2(d.cantidad),
        costo_unitario: roundTo2(d.costo_unitario),
        aplica_iva: d.aplica_iva !== false
      })),
      subtotal: subtotal.value,
      iva: iva.value,
      total: total.value,
      tipo_compra: compra.value.tipo_compra,
      estado_pago: compra.value.estado_pago,
      forma_pago: compra.value.forma_pago || '',
      fecha_pago: compra.value.fecha_pago || null,
      // 🆕 retención
      retencion_valor: totalRetenido.value,
      retencion_porcentaje: 0,
      impuestos_retencion: impuestosValidos.length > 0 ? impuestosValidos : undefined,
      observaciones: compra.value.observaciones || ''
    }

    let response
    if (id) {
      response = await api.request(`/compras/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
        loaderMessage: 'Guardando cambios...'
      })
      if (unmounted) return

      if (response?._retencion_creada) {
        toast.success(
          `Compra actualizada · Retención ${response._retencion_creada.numero} generada`,
          { timeout: 6000 }
        )
      } else {
        toast.success('Compra actualizada')
      }

      if (response?._advertencia) {
        toast.warning(response._advertencia, { timeout: 8000 })
      }
    } else {
      response = await api.request('/compras', {
        method: 'POST',
        body: JSON.stringify(payload),
        loaderMessage: 'Creando compra...'
      })
      if (unmounted) return

      if (response?._retencion_creada) {
        toast.success(
          `Compra creada · Retención ${response._retencion_creada.numero} generada automáticamente`,
          { timeout: 6000 }
        )
      } else {
        toast.success('Compra creada exitosamente')
      }

      if (response?._advertencia) {
        toast.warning(response._advertencia, { timeout: 10000 })
      }

      if (Array.isArray(response?._advertencias_retencion)) {
        for (const adv of response._advertencias_retencion) {
          toast.info(adv, { timeout: 8000 })
        }
      }
    }

    formOriginal.value = JSON.parse(JSON.stringify(compra.value))
    router.push('/compras')
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code

    if (codigo === 'TOTALES_INCONSISTENTES') {
      errorGeneral.value = 'Los totales no coinciden con los detalles'
      toast.error('Los totales no coinciden')
    } else if (codigo === 'PERIODO_CERRADO') {
      errorGeneral.value = e.message || 'El período está cerrado'
      toast.error('El período está cerrado')
    } else if (codigo === 'STOCK_INSUFICIENTE') {
      errorGeneral.value = e.message || 'Stock insuficiente'
      toast.error('Stock insuficiente')
    } else if (codigo === 'PROVEEDOR_NO_EXISTE') {
      errorGeneral.value = 'El proveedor no existe'
      toast.error('El proveedor no existe')
    } else if (codigo === 'PRODUCTO_NO_EXISTE') {
      errorGeneral.value = 'Uno de los productos no existe'
      toast.error('Uno de los productos no existe')
    } else if (codigo === 'FECHA_INVALIDA') {
      errorGeneral.value = 'Fecha inválida'
      toast.error('Fecha inválida')
    } else if (codigo === 'RETENCION_INVALIDA' || codigo === 'RETENCION_SIN_IMPUESTOS') {
      errorGeneral.value = e.message || 'Retención inválida'
      toast.error('Revisa los impuestos de retención')
    } else if (codigo === 'RUC_INVALIDO') {
      errorGeneral.value =
        'La empresa no tiene RUC válido configurado. La retención no se pudo emitir.'
      toast.error('Configura el RUC de la empresa')
    } else if (codigo === 'VALIDACION') {
      errorGeneral.value = e.message || 'Datos inválidos'
      toast.error(e.message || 'Datos inválidos')
    } else {
      errorGeneral.value = 'Error al guardar: ' + e.message
      toast.error('Error: ' + e.message)
    }
  } finally {
    if (!unmounted) cargando.value = false
  }
}

// ===== WATCHERS =====
watch(
  () => compra.value.fecha_emision,
  () => {
    debounce('periodo', verificarPeriodo, 400)
  },
  { immediate: true }
)

// Autocompletar el N° de doc. sustento en los impuestos de retención
watch(
  () => compra.value.numero_factura,
  (nuevo) => {
    for (const imp of compra.value.impuestos_retencion) {
      if (!imp.numeroDocumento) imp.numeroDocumento = nuevo || ''
    }
  }
)

watch(
  () => compra.value.fecha_emision,
  (nuevo) => {
    for (const imp of compra.value.impuestos_retencion) {
      if (!imp.fechaEmisionDocSustento) imp.fechaEmisionDocSustento = nuevo || ''
    }
  }
)

// ===== PREVENIR SALIDA =====
const beforeUnloadHandler = (e) => {
  if (hayCambios.value && !cargando.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

// ===== LIFECYCLE =====
onMounted(async () => {
  await cargarDatos()
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('beforeunload', beforeUnloadHandler)
})

onBeforeUnmount(() => {
  unmounted = true
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('beforeunload', beforeUnloadHandler)

  for (const k of Object.keys(debounceTimers)) {
    clearTimeout(debounceTimers[k])
    delete debounceTimers[k]
  }
})
</script>

<style scoped>
.compra-form { max-width: 1400px; margin: 0 auto; padding: 0 0 40px; }

/* HEADER */
.form-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
.header-left { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }
.btn-back {
  width: 44px; height: 44px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; transition: all var(--transition); flex-shrink: 0;
}
.btn-back:hover:not(:disabled) { border-color: #e67e22; color: #e67e22; transform: translateX(-3px); }
.btn-back:disabled { opacity: 0.5; cursor: not-allowed; }

.form-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800; color: var(--text-primary);
  letter-spacing: -0.03em; display: flex; align-items: center;
  gap: 12px; margin: 0 0 4px;
}
.title-icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 1.15rem; box-shadow: 0 6px 16px rgba(52, 152, 219, 0.3);
}
.title-icon-orange {
  background: linear-gradient(135deg, #e67e22, #d35400);
  box-shadow: 0 6px 16px rgba(230, 126, 34, 0.3);
}
.form-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }

.btn-ghost {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); font-weight: 600; font-size: 0.85rem;
  cursor: pointer; transition: all var(--transition); font-family: inherit;
}
.btn-ghost:hover { border-color: #e67e22; color: #e67e22; }

/* LOADING */
.loading-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.spinner-lg {
  width: 44px; height: 44px; margin: 0 auto 14px;
  border: 4px solid var(--border-color); border-top-color: #e67e22;
  border-radius: 50%; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* SHORTCUTS */
.shortcuts-panel {
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--radius-lg); padding: 16px 20px; margin-bottom: 20px;
}
.shortcuts-title {
  font-size: 0.85rem; font-weight: 700; color: var(--text-primary);
  display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
}
.shortcuts-title i { color: #e67e22; }
.shortcuts-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.shortcut-item { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--text-muted); }
kbd {
  background: var(--bg-table-stripe); color: var(--text-primary);
  padding: 3px 8px; border-radius: 6px;
  font-family: var(--font-mono, monospace);
  font-size: 0.7rem; font-weight: 700;
  border: 1px solid var(--border-color);
  min-width: 26px; text-align: center;
}

/* ALERT BANNER */
.alert-card {
  display: flex; gap: 14px;
  padding: 14px 18px;
  border-radius: var(--radius-lg);
  border: 1px solid;
  margin-bottom: 20px;
}
.alert-info-banner {
  background: linear-gradient(135deg, rgba(142, 68, 173, 0.08), rgba(142, 68, 173, 0.03));
  border-color: rgba(142, 68, 173, 0.25);
}
.alert-info-banner .alert-icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(142, 68, 173, 0.15); color: #8e44ad;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem; flex-shrink: 0;
}
.alert-info-banner .alert-body { flex: 1; font-size: 0.85rem; color: var(--text-secondary); }
.alert-info-banner .alert-body strong { color: #8e44ad; display: block; margin-bottom: 4px; }
.alert-info-banner .alert-body .small { font-size: 0.78rem; line-height: 1.5; }

/* LAYOUT */
.form-grid { display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start; }
.form-main { display: flex; flex-direction: column; gap: 20px; min-width: 0; }

.form-section { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; }
.form-section.card-with-dropdown { overflow: visible; }
.form-section-retencion { border-color: rgba(142, 68, 173, 0.2); }

.section-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 24px; border-bottom: 1px solid var(--border-light);
  background: linear-gradient(135deg, var(--bg-table-stripe), var(--bg-card));
}
.section-header-purple {
  background: linear-gradient(135deg, rgba(142, 68, 173, 0.08), rgba(142, 68, 173, 0.02));
  border-bottom-color: rgba(142, 68, 173, 0.15);
}
.section-header-clickable { cursor: pointer; user-select: none; }
.section-header-clickable:hover { background: var(--bg-table-stripe); }
.section-number {
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 0.9rem; flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.25);
}
.section-number-orange {
  background: linear-gradient(135deg, #e67e22, #d35400);
  box-shadow: 0 4px 12px rgba(230, 126, 34, 0.25);
}
.section-number-purple {
  background: linear-gradient(135deg, #8e44ad, #6c3483);
  box-shadow: 0 4px 12px rgba(142, 68, 173, 0.3);
}
.section-header-content { flex: 1; min-width: 0; }
.section-title {
  font-size: 1rem; font-weight: 700; color: var(--text-primary);
  margin: 0 0 2px; display: flex; align-items: center; gap: 8px;
}
.section-desc { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
.count-badge {
  background: var(--primary-color); color: #fff;
  padding: 2px 10px; border-radius: var(--radius-full);
  font-size: 0.7rem; font-weight: 700;
}
.count-badge-orange { background: #e67e22; }
.count-badge-purple { background: #8e44ad; }

.btn-new-inline {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); font-weight: 600; font-size: 0.78rem;
  text-decoration: none; cursor: pointer; transition: all var(--transition-fast);
  flex-shrink: 0; font-family: inherit;
}
.btn-new-inline:hover:not(:disabled) { border-color: #e67e22; color: #e67e22; }
.btn-new-inline:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-new-orange { background: #e67e22; border-color: #e67e22; color: #fff; }
.btn-new-orange:hover:not(:disabled) { background: #d35400; color: #fff; border-color: #d35400; }
.btn-new-purple { background: #8e44ad; border-color: #8e44ad; color: #fff; }
.btn-new-purple:hover:not(:disabled) { background: #6c3483; color: #fff; border-color: #6c3483; }

.toggle-chevron { color: var(--text-muted); transition: transform var(--transition); }
.section-body { padding: 24px; }

.form-row { display: grid; gap: 16px; margin-bottom: 16px; }
.form-row:last-child { margin-bottom: 0; }
.form-row.cols-2-1-1 { grid-template-columns: 2fr 1fr 1fr; }
.form-row.cols-3 { grid-template-columns: repeat(3, 1fr); }
.form-row.cols-4 { grid-template-columns: repeat(4, 1fr); }

.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label .required { color: var(--danger); margin-right: 2px; }

.form-control, .form-select {
  width: 100%; padding: 10px 14px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-input);
  color: var(--text-primary); font-size: 0.88rem;
  font-family: inherit; transition: all var(--transition-fast); outline: none;
}
.form-control:focus, .form-select:focus {
  border-color: #e67e22;
  box-shadow: 0 0 0 4px rgba(230, 126, 34, 0.15);
  background: var(--bg-card);
}
.form-control:disabled, .form-select:disabled { opacity: 0.6; cursor: not-allowed; }
.input-readonly {
  background: var(--bg-table-stripe) !important;
  cursor: not-allowed;
  font-weight: 800;
  color: #8e44ad !important;
}
.form-hint { font-size: 0.72rem; color: var(--text-muted); margin-top: 4px; }

/* SEARCH */
.search-input-group { position: relative; display: flex; align-items: center; }
.search-icon {
  position: absolute; left: 16px; color: var(--text-muted);
  font-size: 0.9rem; pointer-events: none;
}
.search-input {
  width: 100%; padding: 14px 50px 14px 46px;
  border-radius: var(--radius-md); border: 1.5px solid var(--border-color);
  background: var(--bg-input); color: var(--text-primary);
  font-size: 0.9rem; font-family: inherit;
  transition: all var(--transition-fast); outline: none;
}
.search-input:focus { border-color: #e67e22; box-shadow: 0 0 0 4px rgba(230, 126, 34, 0.15); background: var(--bg-card); }
.search-input:disabled { opacity: 0.6; cursor: not-allowed; }
.search-clear {
  position: absolute; right: 12px; background: transparent; border: none;
  color: var(--text-muted); cursor: pointer; padding: 8px;
  border-radius: var(--radius-xs); transition: all var(--transition-fast);
}
.search-clear:hover { color: var(--danger); background: var(--danger-bg); }

.search-dropdown {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0;
  z-index: 100; background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--radius-lg); box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  max-height: 400px; overflow-y: auto; padding: 6px;
}
.dropdown-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: var(--radius-md);
  cursor: pointer; transition: background var(--transition-fast);
}
.dropdown-row:hover { background: var(--bg-table-stripe); }
.row-avatar {
  width: 38px; height: 38px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 0.75rem; flex-shrink: 0;
}
.row-avatar-orange { background: linear-gradient(135deg, #e67e22, #d35400); }
.row-avatar-product { background: linear-gradient(135deg, #f39c12, #d68910); font-size: 0.9rem; }
.row-content { flex: 1; min-width: 0; }
.row-title {
  font-weight: 600; color: var(--text-primary); font-size: 0.88rem;
  margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.row-meta { display: flex; align-items: center; gap: 12px; font-size: 0.72rem; color: var(--text-muted); flex-wrap: wrap; }
.row-meta code { background: var(--bg-table-stripe); padding: 1px 6px; border-radius: 4px; font-family: var(--font-mono, monospace); color: #e67e22; }
.stock-ok { color: var(--success); }
.stock-zero { color: var(--danger); }
.row-price { text-align: right; flex-shrink: 0; }
.price-value { font-weight: 800; color: #e67e22; font-size: 0.95rem; font-variant-numeric: tabular-nums; }
.price-label { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; }
.row-check { color: #e67e22; font-size: 1rem; }

/* PROVEEDOR CARD */
.cliente-card {
  display: flex; align-items: center; gap: 14px;
  padding: 16px; margin-top: 16px;
  background: linear-gradient(135deg, rgba(52, 152, 219, 0.05), rgba(52, 152, 219, 0.02));
  border: 1px solid rgba(52, 152, 219, 0.2);
  border-radius: var(--radius-md); border-left: 4px solid var(--primary-color);
}
.cliente-card-orange {
  background: linear-gradient(135deg, rgba(230, 126, 34, 0.05), rgba(230, 126, 34, 0.02));
  border-color: rgba(230, 126, 34, 0.2);
  border-left-color: #e67e22;
}
.cliente-avatar-large {
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 1rem; flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
}
.cliente-avatar-orange {
  background: linear-gradient(135deg, #e67e22, #d35400);
  box-shadow: 0 4px 12px rgba(230, 126, 34, 0.3);
}
.cliente-details { flex: 1; min-width: 0; }
.cliente-name { font-weight: 700; color: var(--text-primary); font-size: 1rem; margin-bottom: 6px; }
.cliente-meta-grid {
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: 4px 16px; font-size: 0.78rem; color: var(--text-secondary);
}
.cliente-meta-grid strong { color: var(--text-muted); font-weight: 600; margin-right: 4px; }
.cliente-change {
  width: 36px; height: 36px; border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-muted); cursor: pointer; transition: all var(--transition-fast);
}
.cliente-change:hover { border-color: #e67e22; color: #e67e22; background: rgba(230, 126, 34, 0.08); }

/* EMPTY ITEMS */
.empty-items { text-align: center; padding: 48px 20px; }
.empty-items-compact { padding: 24px 20px; }
.empty-icon {
  width: 72px; height: 72px; border-radius: 50%;
  background: var(--bg-table-stripe); display: flex; align-items: center;
  justify-content: center; color: var(--text-muted); font-size: 1.8rem; margin: 0 auto 14px;
}
.empty-title { font-weight: 700; color: var(--text-primary); font-size: 0.95rem; margin-bottom: 4px; }
.empty-text { font-size: 0.82rem; color: var(--text-muted); }

/* ITEMS */
.items-list { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.item-card {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 14px 16px;
  background: var(--bg-table-stripe); border: 1px solid var(--border-light);
  border-radius: var(--radius-md); transition: all var(--transition-fast); flex-wrap: wrap;
}
.item-card:hover { border-color: #e67e22; background: var(--bg-card); box-shadow: var(--shadow-sm); }
.item-card-retencion {
  border-left: 4px solid #8e44ad;
  background: linear-gradient(135deg, rgba(142, 68, 173, 0.04), rgba(142, 68, 173, 0.01));
  align-items: flex-start;
  flex-direction: column;
}
.item-card-retencion:hover {
  border-color: rgba(142, 68, 173, 0.4);
  border-left-color: #8e44ad;
}
.item-main { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 200px; }
.item-icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.item-icon-orange { background: linear-gradient(135deg, #e67e22, #d35400); }
.item-info { min-width: 0; flex: 1; }
.item-name { font-weight: 700; color: var(--text-primary); font-size: 0.9rem; margin-bottom: 2px; }
.item-code { font-family: var(--font-mono, monospace); font-size: 0.72rem; color: var(--text-muted); }

.item-controls { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.control-group { display: flex; flex-direction: column; gap: 4px; }
.control-group label {
  font-size: 0.68rem; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.3px;
}

.qty-control {
  display: flex; align-items: center; background: var(--bg-card);
  border: 1.5px solid var(--border-color); border-radius: var(--radius-sm); overflow: hidden;
}
.qty-control button {
  width: 32px; height: 36px; border: none; background: transparent;
  color: var(--text-secondary); cursor: pointer;
  transition: all var(--transition-fast); font-size: 0.75rem;
}
.qty-control button:hover:not(:disabled) { background: rgba(230, 126, 34, 0.08); color: #e67e22; }
.qty-control button:disabled { opacity: 0.5; cursor: not-allowed; }
.qty-control input {
  width: 60px; height: 36px; border: none; text-align: center;
  font-weight: 700; font-size: 0.9rem; background: transparent;
  color: var(--text-primary); outline: none; font-family: inherit;
}

.price-input {
  display: flex; align-items: center; background: var(--bg-card);
  border: 1.5px solid var(--border-color); border-radius: var(--radius-sm);
  overflow: hidden; height: 36px;
}
.price-input span { padding: 0 8px; color: var(--text-muted); font-weight: 700; font-size: 0.85rem; }
.price-input input {
  width: 80px; height: 100%; border: none; background: transparent;
  padding: 0 10px 0 0; font-weight: 700; font-size: 0.88rem;
  color: var(--text-primary); outline: none; font-family: inherit;
}

.control-subtotal { min-width: 100px; }
.subtotal-value {
  padding: 9px 12px; background: var(--bg-card);
  border: 1.5px solid var(--border-color); border-radius: var(--radius-sm);
  font-weight: 800; color: #e67e22; font-size: 0.9rem;
  text-align: right; font-variant-numeric: tabular-nums;
}

.item-remove {
  width: 36px; height: 36px; border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-muted); cursor: pointer; transition: all var(--transition-fast);
}
.item-remove:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); background: var(--danger-bg); }
.item-remove:disabled { opacity: 0.5; cursor: not-allowed; }

/* RETENCIÓN — Toggle */
.ret-toggle-row {
  padding: 16px 18px;
  background: linear-gradient(135deg, rgba(142, 68, 173, 0.05), rgba(142, 68, 173, 0.02));
  border: 1.5px solid rgba(142, 68, 173, 0.2);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}
.ret-toggle {
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  user-select: none;
}
.ret-toggle input { display: none; }
.ret-toggle-slider {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--border-color);
  border-radius: 999px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.ret-toggle-slider::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: 50%;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}
.ret-toggle input:checked + .ret-toggle-slider {
  background: #8e44ad;
}
.ret-toggle input:checked + .ret-toggle-slider::before {
  transform: translateX(20px);
}
.ret-toggle-text { display: flex; flex-direction: column; gap: 2px; }
.ret-toggle-text strong { color: var(--text-primary); font-size: 0.9rem; }
.ret-toggle-text small { color: var(--text-muted); font-size: 0.75rem; }

/* RETENCIÓN — Section */
.subsection { margin-bottom: 16px; }
.subsection:last-child { margin-bottom: 0; }
.subsection-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: #6c3483;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(142, 68, 173, 0.2);
}
.subsection-title i { color: #8e44ad; }

.badge-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0.3px;
  background: rgba(142, 68, 173, 0.12);
  color: #6c3483;
  border: 1px solid rgba(142, 68, 173, 0.25);
  margin-left: 6px;
}

.ret-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding: 12px 16px;
  background: linear-gradient(135deg, rgba(142, 68, 173, 0.08), rgba(142, 68, 173, 0.03));
  border: 1px solid rgba(142, 68, 173, 0.25);
  border-left: 4px solid #8e44ad;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.ret-total span {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.ret-total span i { color: #8e44ad; }
.ret-total strong {
  font-size: 1.15rem;
  color: #8e44ad;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
}

.ret-help {
  display: flex;
  gap: 14px;
  padding: 16px 18px;
  background: rgba(52, 152, 219, 0.05);
  border: 1px solid rgba(52, 152, 219, 0.2);
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  color: var(--text-secondary);
}
.ret-help-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(52, 152, 219, 0.15);
  color: #3498db;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  flex-shrink: 0;
}
.ret-help strong { color: var(--text-primary); display: block; margin-bottom: 6px; }
.ret-help ul { margin: 0; padding-left: 18px; line-height: 1.7; }
.ret-help li { font-size: 0.78rem; }

.advertencia-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  margin-top: 12px;
  background: rgba(52, 152, 219, 0.08);
  border: 1px solid rgba(52, 152, 219, 0.3);
  border-radius: var(--radius-md);
  color: #2980b9;
  font-size: 0.8rem;
  line-height: 1.5;
}
.advertencia-box i { margin-top: 2px; flex-shrink: 0; }

/* SIDEBAR */
.form-sidebar { position: relative; }
.sidebar-sticky { position: sticky; top: 90px; display: flex; flex-direction: column; gap: 16px; }

.summary-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; }
.summary-header {
  padding: 14px 20px; background: linear-gradient(135deg, var(--primary-dark), #1a2a3a);
  color: #fff; font-weight: 700; font-size: 0.9rem;
  display: flex; align-items: center; gap: 10px;
}
.summary-header-orange { background: linear-gradient(135deg, #d35400, #a04000); }
.summary-header i { color: var(--accent-color); }
.summary-body { padding: 20px; }
.summary-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; font-size: 0.88rem; }
.summary-label { color: var(--text-muted); font-weight: 500; }
.summary-value { font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.summary-value-purple { color: #8e44ad; font-weight: 800; }
.summary-divider { height: 1px; background: var(--border-light); margin: 8px 0; }
.summary-total { display: flex; justify-content: space-between; align-items: center; padding: 12px 0 4px; border-top: 2px solid var(--primary-color); }
.summary-total-orange { border-top-color: #e67e22; }
.total-label { font-size: 0.85rem; font-weight: 800; color: var(--text-primary); letter-spacing: 0.5px; }
.total-value { font-size: 1.65rem; font-weight: 800; color: var(--primary-color); font-variant-numeric: tabular-nums; letter-spacing: -0.03em; }
.total-value-orange { color: #e67e22; }

.status-card {
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--radius-lg); padding: 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.status-item {
  display: flex; align-items: center; gap: 10px;
  font-size: 0.82rem; color: var(--text-muted);
  transition: color var(--transition-fast);
}
.status-item i { font-size: 0.95rem; color: var(--border-strong); }
.status-item.complete { color: var(--text-primary); font-weight: 500; }
.status-item.complete i { color: var(--success); }

.actions-card { display: flex; flex-direction: column; gap: 10px; }
.btn-save {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 14px 20px;
  background: linear-gradient(135deg, var(--success), #1e8449);
  color: #fff; border: none; border-radius: var(--radius-md);
  font-weight: 700; font-size: 0.92rem; cursor: pointer;
  transition: all var(--transition);
  box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
  font-family: inherit;
}
.btn-save-orange {
  background: linear-gradient(135deg, #e67e22, #d35400);
  box-shadow: 0 4px 12px rgba(230, 126, 34, 0.3);
}
.btn-save-orange:hover:not(:disabled) { box-shadow: 0 8px 24px rgba(230, 126, 34, 0.4); }
.btn-save:hover:not(:disabled) { transform: translateY(-2px); }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-save kbd {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff; padding: 2px 6px; font-size: 0.65rem;
}

.btn-cancel {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 20px; background: var(--bg-card);
  border: 1.5px solid var(--border-color); color: var(--text-secondary);
  border-radius: var(--radius-md); font-weight: 600; font-size: 0.88rem;
  cursor: pointer; transition: all var(--transition); font-family: inherit;
}
.btn-cancel:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); background: var(--danger-bg); }
.btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }

.info-card {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(142, 68, 173, 0.08), rgba(142, 68, 173, 0.03));
  border: 1px solid rgba(142, 68, 173, 0.25);
  border-radius: var(--radius-lg);
}
.info-card-purple > i { color: #8e44ad; font-size: 1.15rem; flex-shrink: 0; margin-top: 2px; }
.info-title { font-size: 0.82rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.info-text { font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4; }

.error-banner {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; background: var(--danger-bg);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-left: 4px solid var(--danger);
  border-radius: var(--radius-md); color: var(--danger);
  font-weight: 500; font-size: 0.88rem; margin-top: 20px;
}

/* TRANSICIONES */
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.dropdown-enter-active, .dropdown-leave-active { transition: all 0.2s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }
.collapse-enter-active, .collapse-leave-active { transition: all 0.3s ease; overflow: hidden; }
.collapse-enter-from, .collapse-leave-to { max-height: 0; opacity: 0; }
.collapse-enter-to, .collapse-leave-from { max-height: 2000px; opacity: 1; }

@media (max-width: 992px) {
  .form-grid { grid-template-columns: 1fr; }
  .sidebar-sticky { position: static; }
  .form-row.cols-2-1-1, .form-row.cols-4 { grid-template-columns: 1fr 1fr; }
  .cliente-meta-grid { grid-template-columns: 1fr; }
}

@media (max-width: 576px) {
  .form-row.cols-2-1-1, .form-row.cols-4, .form-row.cols-3 { grid-template-columns: 1fr; }
  .form-title { font-size: 1.2rem; }
  .form-subtitle { padding-left: 0; }
  .section-header { padding: 16px 18px; }
  .section-body { padding: 18px; }
  .ret-toggle-text small { display: none; }
}
</style>