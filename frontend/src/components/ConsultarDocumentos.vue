<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-search" aria-hidden="true"></i>
      Consultar Documentos
    </h4>

    <!-- ===== FILTROS ===== -->
    <div class="row g-3 mb-3">
      <div class="col-md-3">
        <label class="form-label" for="cd-tipo">Tipo de Documento</label>
        <select
          id="cd-tipo"
          class="form-select"
          v-model="tipoDocumento"
          :disabled="cargando"
        >
          <option value="factura">Factura</option>
          <option value="guia_remision">Guía de Remisión</option>
          <option value="exportacion">Factura de Exportación</option>
          <option value="reembolso">Factura de Reembolso</option>
          <option value="retencion">Comprobante de Retención</option>
          <option value="liquidacion">Liquidación de Compra</option>
          <option value="nota_credito">Nota de Crédito</option>
          <option value="proforma">Proforma</option>
          <option value="compras">Compras</option>
        </select>
      </div>
      <div class="col-md-2">
        <label class="form-label" for="cd-desde">Desde</label>
        <input
          id="cd-desde"
          type="date"
          class="form-control"
          v-model="fechaDesde"
          :disabled="cargando"
        />
      </div>
      <div class="col-md-2">
        <label class="form-label" for="cd-hasta">Hasta</label>
        <input
          id="cd-hasta"
          type="date"
          class="form-control"
          v-model="fechaHasta"
          :disabled="cargando"
        />
      </div>
      <div class="col-md-2 d-flex align-items-end">
        <button
          type="button"
          class="btn btn-primary w-100"
          @click="cargarDatos"
          :disabled="cargando"
        >
          <i class="fas fa-search" :class="{ 'fa-spin': cargando }" aria-hidden="true"></i>
          Buscar
        </button>
      </div>
      <div class="col-md-3 d-flex align-items-end justify-content-end">
        <button
          type="button"
          class="btn btn-outline-secondary"
          @click="limpiarFiltros"
          :disabled="cargando || !hayFiltros"
        >
          <i class="fas fa-undo" aria-hidden="true"></i>
          Limpiar
        </button>
      </div>
    </div>

    <!-- ===== TABLA ===== -->
    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <caption class="visually-hidden">
            Listado de documentos filtrados. Mostrando {{ documentos.length }}
            resultado{{ documentos.length === 1 ? '' : 's' }}.
          </caption>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente / Proveedor / Destinatario</th>
              <th>Nº Documento</th>
              <th>Clave de Acceso</th>
              <th>Estado SRI</th>
              <th>Total</th>
              <th style="width: 200px;">Acciones</th>
            </tr>
          </thead>
          <tbody :aria-busy="cargando ? 'true' : 'false'">
            <tr v-for="doc in documentos" :key="String(doc._id)">
              <td>{{ formatFecha(doc.fecha_emision) }}</td>
              <td>
                <a
                  href="#"
                  @click.prevent="verDocumento(doc)"
                  class="text-primary"
                >
                  {{ nombreContraparte(doc) }}
                </a>
              </td>
              <td class="font-monospace small">
                {{ doc.numero_factura || doc.numero_guia || 'N/A' }}
              </td>
              <td class="font-monospace small">
                <span v-if="doc.clave_acceso" :title="doc.clave_acceso">
                  {{ doc.clave_acceso.substring(0, 15) }}…
                </span>
                <span v-else class="text-muted">—</span>
              </td>
              <td>
                <span class="badge" :class="getEstadoSriClass(doc.estado_sri)">
                  {{ doc.estado_sri || 'N/A' }}
                </span>
              </td>
              <td><strong>{{ formatCurrency(doc.total) }}</strong></td>
              <td>
                <div class="d-flex gap-1 flex-nowrap">
                  <button
                    v-if="!doc.clave_acceso && requiereClave(doc)"
                    type="button"
                    class="btn btn-sm btn-outline-warning"
                    @click="generarClave(doc)"
                    title="Generar clave de acceso"
                    aria-label="Generar clave de acceso"
                  >
                    <i class="fas fa-key" aria-hidden="true"></i>
                  </button>

                  <button
                    type="button"
                    class="btn btn-sm btn-outline-primary"
                    @click="verDocumento(doc)"
                    title="Ver documento"
                    aria-label="Ver documento"
                  >
                    <i class="fas fa-eye" aria-hidden="true"></i>
                  </button>

                  <button
                    type="button"
                    class="btn btn-sm btn-outline-info"
                    @click="abrirModalEmail(doc)"
                    title="Enviar por email"
                    aria-label="Enviar por email"
                  >
                    <i class="fas fa-envelope" aria-hidden="true"></i>
                  </button>

                  <button
                    v-if="doc.clave_acceso"
                    type="button"
                    class="btn btn-sm btn-outline-success"
                    @click="verXml(doc)"
                    title="Ver/Descargar XML"
                    aria-label="Ver XML"
                  >
                    <i class="fas fa-file-code" aria-hidden="true"></i>
                  </button>

                  <button
                    v-if="
                      doc.clave_acceso &&
                      !doc.xml_firmado &&
                      doc.estado_sri !== 'AUTORIZADO' &&
                      doc.estado_sri !== 'FIRMADO'
                    "
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    @click="firmarDocumento(doc)"
                    title="Firmar electrónicamente"
                    aria-label="Firmar electrónicamente"
                  >
                    <i class="fas fa-signature" aria-hidden="true"></i>
                  </button>

                  <button
                    v-if="doc.estado_sri === 'FIRMADO'"
                    type="button"
                    class="btn btn-sm btn-outline-success"
                    @click="enviarSRI(doc)"
                    title="Enviar al SRI"
                    aria-label="Enviar al SRI"
                  >
                    <i class="fas fa-paper-plane" aria-hidden="true"></i>
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="cargando">
              <td colspan="7" class="text-center py-4">
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                <span class="ms-2">Cargando…</span>
              </td>
            </tr>
            <tr v-else-if="documentos.length === 0 && buscado">
              <td colspan="7" class="text-muted text-center py-4">
                <i class="fas fa-inbox me-2" aria-hidden="true"></i>
                No hay documentos que coincidan con los filtros
              </td>
            </tr>
            <tr v-else-if="!buscado && documentos.length === 0">
              <td colspan="7" class="text-muted text-center py-4">
                <i class="fas fa-info-circle me-2" aria-hidden="true"></i>
                Seleccione un tipo y presione Buscar
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ============ MODAL DOCUMENTO (PREVIEW) ============ -->
    <div
      class="modal fade"
      id="modalDocumento"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header modal-header-doc">
            <div class="d-flex align-items-center gap-3">
              <div class="doc-icon">
                <i class="fas fa-file-invoice" aria-hidden="true"></i>
              </div>
              <div>
                <h5 class="modal-title mb-0">
                  {{ getTipoDocLabel(documentoActual?.tipo_documento) }}
                </h5>
                <div class="small text-muted">
                  {{
                    documentoActual?.numero_factura ||
                    documentoActual?.numero_guia ||
                    'Sin número'
                  }}
                </div>
              </div>
            </div>
            <button
              type="button"
              class="btn-close"
              @click="cerrarModal"
              aria-label="Cerrar"
            ></button>
          </div>

          <div class="modal-body modal-body-doc" id="documentoContenido">
            <div v-if="documentoActual" class="documento-preview">
              <!-- ENCABEZADO -->
              <div class="doc-header">
                <div class="doc-header-left">
                  <div class="logo-empresa">
                    <div class="logo-icon">S</div>
                    <div>
                      <div class="empresa-nombre">
                        {{ documentoActual.razon_social_emisor || "System Ozaet's Electronics" }}
                      </div>
                      <div class="empresa-sub">Sistema Contable</div>
                    </div>
                  </div>
                  <div class="empresa-info">
                    <div>
                      <strong>RUC:</strong>
                      {{ documentoActual.ruc_emisor || '1790012345001' }}
                    </div>
                  </div>
                </div>
                <div class="doc-header-center">
                  <div class="doc-tipo-badge">
                    {{ getTipoDocLabel(documentoActual.tipo_documento).toUpperCase() }}
                  </div>
                  <div class="doc-numero-badge">
                    Nº
                    {{
                      documentoActual.numero_factura ||
                      documentoActual.numero_guia ||
                      'N/A'
                    }}
                  </div>
                  <div class="doc-fecha">
                    <i class="far fa-calendar" aria-hidden="true"></i>
                    {{ formatFecha(documentoActual.fecha_emision) }}
                  </div>
                  <div
                    class="ambiente-badge"
                    :class="
                      documentoActual.ambiente_sri === '2'
                        ? 'amb-produccion'
                        : 'amb-pruebas'
                    "
                  >
                    {{
                      documentoActual.ambiente_sri === '2'
                        ? '● PRODUCCIÓN'
                        : '● PRUEBAS'
                    }}
                  </div>
                </div>
                <div class="doc-header-right">
                  <div v-if="qrDataUrl" class="qr-container">
                    <img :src="qrDataUrl" alt="Código QR de verificación SRI" class="qr-img" />
                    <div class="qr-label">Verificar en SRI</div>
                  </div>
                </div>
              </div>

              <!-- CLAVE DE ACCESO -->
              <div v-if="documentoActual.clave_acceso" class="clave-section">
                <div class="clave-left">
                  <div class="clave-label">
                    <i class="fas fa-key me-1" aria-hidden="true"></i>
                    Clave de Acceso
                  </div>
                  <div class="clave-valor">{{ documentoActual.clave_acceso }}</div>
                  <div class="autorizacion-info">
                    <div v-if="documentoActual.numero_autorizacion">
                      <strong>Nº Autorización:</strong>
                      {{ documentoActual.numero_autorizacion }}
                    </div>
                    <div v-if="documentoActual.fecha_autorizacion">
                      <strong>Fecha Autorización:</strong>
                      {{ formatFechaHora(documentoActual.fecha_autorizacion) }}
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="alert alert-warning small mb-3">
                <i class="fas fa-exclamation-triangle me-2" aria-hidden="true"></i>
                Este documento no tiene clave de acceso electrónica.
                <button
                  v-if="requiereClave(documentoActual)"
                  type="button"
                  class="btn btn-sm btn-warning ms-2"
                  @click="generarClave(documentoActual)"
                >
                  <i class="fas fa-key" aria-hidden="true"></i> Generar clave
                </button>
              </div>

              <!-- ====== SECCIÓN CONDICIONAL: GUÍA DE REMISIÓN vs VENTA/COMPRA ====== -->
              <template v-if="esGuiaRemision(documentoActual)">
                <!-- GUÍA: Destinatario + Datos del documento -->
                <div class="cliente-section">
                  <div class="cliente-box">
                    <div class="cliente-box-title">
                      <i class="fas fa-user-check me-1" aria-hidden="true"></i>
                      Datos del Destinatario
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">Razón Social:</span>
                      <span class="cliente-row-value">
                        {{ documentoActual.destinatario_razon_social || documentoActual.cliente?.nombre || '—' }}
                      </span>
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">Identificación:</span>
                      <span class="cliente-row-value font-monospace">
                        {{ documentoActual.destinatario_identificacion || documentoActual.cliente?.ruc || '—' }}
                      </span>
                    </div>
                    <div class="cliente-row" v-if="documentoActual.destinatario_tipo">
                      <span class="cliente-row-label">Tipo ID:</span>
                      <span class="cliente-row-value">
                        {{ getTipoIdentLabel(documentoActual.destinatario_tipo) }}
                      </span>
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">Dir. Destino:</span>
                      <span class="cliente-row-value">
                        {{ documentoActual.destinatario_direccion || '—' }}
                      </span>
                    </div>
                  </div>

                  <div class="cliente-box">
                    <div class="cliente-box-title">
                      <i class="fas fa-info-circle me-1" aria-hidden="true"></i>
                      Datos del Documento
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">Motivo:</span>
                      <span class="cliente-row-value">
                        {{ documentoActual.motivo || '—' }}
                      </span>
                    </div>
                    <div class="cliente-row" v-if="documentoActual.ruta">
                      <span class="cliente-row-label">Ruta:</span>
                      <span class="cliente-row-value">{{ documentoActual.ruta }}</span>
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">Estado:</span>
                      <span class="cliente-row-value">
                        <span class="badge" :class="getEstadoSriClass(documentoActual.estado_sri)">
                          {{ documentoActual.estado_sri || 'N/A' }}
                        </span>
                      </span>
                    </div>
                    <div class="cliente-row" v-if="documentoActual.documento_aduana">
                      <span class="cliente-row-label">Doc. Aduanero:</span>
                      <span class="cliente-row-value font-monospace">
                        {{ documentoActual.documento_aduana }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- GUÍA: Transportista + Traslado -->
                <div class="cliente-section">
                  <div class="cliente-box">
                    <div class="cliente-box-title">
                      <i class="fas fa-truck me-1" aria-hidden="true"></i>
                      Datos del Transportista
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">Razón Social:</span>
                      <span class="cliente-row-value">
                        {{ documentoActual.transportista_razon_social || documentoActual.transportista || '—' }}
                      </span>
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">Identificación:</span>
                      <span class="cliente-row-value font-monospace">
                        {{ documentoActual.transportista_identificacion || '—' }}
                      </span>
                    </div>
                    <div class="cliente-row" v-if="documentoActual.transportista_tipo">
                      <span class="cliente-row-label">Tipo ID:</span>
                      <span class="cliente-row-value">
                        {{ getTipoIdentLabel(documentoActual.transportista_tipo) }}
                      </span>
                    </div>
                    <div class="cliente-row" v-if="documentoActual.transportista_correo">
                      <span class="cliente-row-label">Correo:</span>
                      <span class="cliente-row-value">{{ documentoActual.transportista_correo }}</span>
                    </div>
                  </div>

                  <div class="cliente-box">
                    <div class="cliente-box-title">
                      <i class="fas fa-route me-1" aria-hidden="true"></i>
                      Datos del Traslado
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">Dir. Partida:</span>
                      <span class="cliente-row-value">
                        {{ documentoActual.direccion_partida || '—' }}
                      </span>
                    </div>
                    <div class="cliente-row" v-if="documentoActual.inicio_transporte">
                      <span class="cliente-row-label">Inicio:</span>
                      <span class="cliente-row-value">
                        {{ formatFechaHora(documentoActual.inicio_transporte) }}
                      </span>
                    </div>
                    <div class="cliente-row" v-if="documentoActual.fin_transporte">
                      <span class="cliente-row-label">Fin:</span>
                      <span class="cliente-row-value">
                        {{ formatFechaHora(documentoActual.fin_transporte) }}
                      </span>
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">Placa:</span>
                      <span class="cliente-row-value font-monospace">
                        {{ documentoActual.placa_transporte || documentoActual.placa || '—' }}
                      </span>
                    </div>
                  </div>
                </div>
              </template>

              <!-- VENTA / COMPRA: Cliente o Proveedor + Datos del documento -->
              <template v-else>
                <div class="cliente-section">
                  <div class="cliente-box">
                    <div class="cliente-box-title">
                      <i class="fas fa-user me-1" aria-hidden="true"></i>
                      {{ documentoActual.cliente ? 'Datos del Cliente' : 'Datos del Proveedor' }}
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">Razón Social:</span>
                      <span class="cliente-row-value">
                        {{
                          documentoActual.cliente?.nombre ||
                          documentoActual.proveedor?.nombre ||
                          'Consumidor Final'
                        }}
                      </span>
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">RUC/Cédula:</span>
                      <span class="cliente-row-value font-monospace">
                        {{
                          documentoActual.cliente?.ruc ||
                          documentoActual.proveedor?.ruc ||
                          '9999999999999'
                        }}
                      </span>
                    </div>
                    <div class="cliente-row" v-if="documentoActual.cliente?.direccion || documentoActual.proveedor?.direccion">
                      <span class="cliente-row-label">Dirección:</span>
                      <span class="cliente-row-value">
                        {{ documentoActual.cliente?.direccion || documentoActual.proveedor?.direccion }}
                      </span>
                    </div>
                    <div class="cliente-row" v-if="documentoActual.cliente?.email || documentoActual.proveedor?.email">
                      <span class="cliente-row-label">Email:</span>
                      <span class="cliente-row-value">
                        {{ documentoActual.cliente?.email || documentoActual.proveedor?.email }}
                      </span>
                    </div>
                  </div>
                  <div class="cliente-box">
                    <div class="cliente-box-title">
                      <i class="fas fa-info-circle me-1" aria-hidden="true"></i>
                      Datos del Documento
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">Forma Pago:</span>
                      <span class="cliente-row-value">
                        {{ documentoActual.forma_pago || 'Sin sistema financiero' }}
                      </span>
                    </div>
                    <div class="cliente-row">
                      <span class="cliente-row-label">Estado:</span>
                      <span class="cliente-row-value">
                        <span class="badge" :class="getEstadoSriClass(documentoActual.estado_sri)">
                          {{ documentoActual.estado_sri || 'N/A' }}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </template>

              <!-- DETALLES (común a todos los tipos) -->
              <div class="detalles-section">
                <div class="detalles-title">
                  <template v-if="esGuiaRemision(documentoActual)">
                    Detalle de Productos a Trasladar
                  </template>
                  <template v-else>
                    Detalle de Productos y Servicios
                  </template>
                </div>
                <table class="detalles-table">
                  <thead>
                    <tr>
                      <th style="width: 35px;" class="text-center">#</th>
                      <th>Descripción</th>
                      <th style="width: 75px;" class="text-center">Cant.</th>
                      <template v-if="!esGuiaRemision(documentoActual)">
                        <th style="width: 85px;" class="text-right">P. Unit.</th>
                        <th style="width: 65px;" class="text-center">IVA</th>
                        <th style="width: 95px;" class="text-right">Subtotal</th>
                      </template>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(item, idx) in documentoActual.detalles || []"
                      :key="idx"
                    >
                      <td class="text-center">{{ idx + 1 }}</td>
                      <td>
                        <div class="product-name">
                          {{ item.nombre || obtenerNombreProducto(item.productoId) }}
                        </div>
                        <div v-if="item.codigo" class="product-code">
                          Código: {{ item.codigo }}
                        </div>
                      </td>
                      <td class="text-center">{{ item.cantidad }}</td>
                      <template v-if="!esGuiaRemision(documentoActual)">
                        <td class="text-right font-monospace">
                          ${{
                            Number(
                              item.precio_unitario || item.costo_unitario || 0
                            ).toFixed(2)
                          }}
                        </td>
                        <td class="text-center">
                          <span
                            class="badge-iva"
                            :class="item.aplica_iva !== false ? 'iva-si' : 'iva-no'"
                          >
                            {{ item.aplica_iva !== false ? '15%' : '0%' }}
                          </span>
                        </td>
                        <td class="text-right font-monospace fw-bold">
                          ${{
                            (
                              Number(item.cantidad || 0) *
                              Number(item.precio_unitario || item.costo_unitario || 0)
                            ).toFixed(2)
                          }}
                        </td>
                      </template>
                    </tr>
                    <tr v-if="!(documentoActual.detalles || []).length">
                      <td
                        :colspan="esGuiaRemision(documentoActual) ? 3 : 6"
                        class="text-center text-muted py-3"
                      >
                        Sin detalles registrados
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- TOTALES (no aplica a guía de remisión) -->
              <div v-if="!esGuiaRemision(documentoActual)" class="totales-section">
                <div class="totales-box">
                  <div class="total-row">
                    <span class="label">Subtotal</span>
                    <span class="value">${{ Number(documentoActual.subtotal || 0).toFixed(2) }}</span>
                  </div>
                  <div class="total-row">
                    <span class="label">IVA 15%</span>
                    <span class="value">${{ Number(documentoActual.iva || 0).toFixed(2) }}</span>
                  </div>
                  <div class="total-final">
                    <span class="label">TOTAL A PAGAR</span>
                    <span class="value">${{ Number(documentoActual.total || 0).toFixed(2) }}</span>
                  </div>
                </div>
              </div>

              <div class="doc-footer">
                <div><strong>Documento generado por Sistema Contable</strong></div>
                <div v-if="documentoActual.clave_acceso" class="mt-1">
                  <i class="fas fa-check-circle text-success me-1" aria-hidden="true"></i>
                  Representación impresa de un comprobante electrónico autorizado por el SRI
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer modal-footer-doc">
            <button
              type="button"
              class="btn btn-outline-secondary"
              @click="cerrarModal"
            >
              <i class="fas fa-times me-1" aria-hidden="true"></i> Cerrar
            </button>
            <div class="ms-auto d-flex gap-2 flex-wrap">
              <button type="button" class="btn btn-primary" @click="imprimirModal('A4')">
                <i class="fas fa-print me-1" aria-hidden="true"></i> A4
              </button>
              <button type="button" class="btn btn-primary" @click="imprimirModal('ticket')">
                <i class="fas fa-receipt me-1" aria-hidden="true"></i> Ticket
              </button>
              <button
                type="button"
                class="btn btn-danger"
                @click="guardarPDF"
                :disabled="generandoPdf"
              >
                <i
                  class="fas fa-file-pdf me-1"
                  :class="{ 'fa-spin': generandoPdf }"
                  aria-hidden="true"
                ></i>
                {{ generandoPdf ? 'Generando…' : 'PDF' }}
              </button>
              <button
                type="button"
                class="btn btn-info text-white"
                @click="abrirModalEmail(documentoActual)"
              >
                <i class="fas fa-envelope me-1" aria-hidden="true"></i> Email
              </button>
              <button
                type="button"
                class="btn btn-success"
                @click="verXml(documentoActual)"
                :disabled="!documentoActual?.clave_acceso"
              >
                <i class="fas fa-file-code me-1" aria-hidden="true"></i> XML
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ MODAL XML (TELEPORTADO) ============ -->
    <Teleport to="body">
      <div class="modal fade" id="modalXmlDoc" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                <i class="fas fa-file-code me-2" aria-hidden="true"></i>
                XML del Comprobante
              </h5>
              <button
                type="button"
                class="btn-close"
                data-bs-dismiss="modal"
                aria-label="Cerrar"
              ></button>
            </div>
            <div class="modal-body">
              <div v-if="xmlDoc" class="xml-viewer" ref="xmlViewerRef">
                <pre>{{ xmlDoc }}</pre>
              </div>
              <div v-else class="text-center py-4 text-muted">
                <i class="fas fa-spinner fa-spin fa-2x" aria-hidden="true"></i>
                <p class="mt-2 mb-0">Cargando XML…</p>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                Cerrar
              </button>
              <button
                type="button"
                class="btn btn-primary"
                @click="copiarXml"
                :disabled="!xmlDoc"
              >
                <i class="fas fa-copy me-1" aria-hidden="true"></i> Copiar
              </button>
              <button
                type="button"
                class="btn btn-success"
                @click="descargarXmlActual"
                :disabled="!xmlDoc"
              >
                <i class="fas fa-download me-1" aria-hidden="true"></i> Descargar
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ============ MODAL CONFIRMACIÓN (TELEPORTADO) ============ -->
    <Teleport to="body">
      <div
        class="modal fade"
        id="modalConfirmConsulta"
        tabindex="-1"
        aria-hidden="true"
        data-bs-backdrop="static"
      >
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header" :class="`bg-${confirmState.variante}`">
              <h5
                class="modal-title"
                :class="confirmState.variante === 'warning' ? 'text-dark' : 'text-white'"
              >
                <i :class="confirmState.icono" class="me-2" aria-hidden="true"></i>
                {{ confirmState.titulo }}
              </h5>
              <button
                type="button"
                class="btn-close"
                :class="confirmState.variante === 'warning' ? '' : 'btn-close-white'"
                @click="cancelarConfirm"
                aria-label="Cerrar"
              ></button>
            </div>
            <div class="modal-body">
              <p class="mb-3" v-html="confirmState.mensaje"></p>
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
    </Teleport>

    <!-- ============ MODAL EMAIL ============ -->
    <EnviarEmailModal
      :venta="documentoActual"
      :cliente="documentoActual?.cliente"
      :obtener-nombre-producto="obtenerNombreProducto"
    />
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  watch
} from 'vue'
import { Modal } from 'bootstrap'
import { useToast } from 'vue-toastification'
import { api } from '../services/api'
import { formatCurrency } from '../utils/formatters'
import { printService } from '../services/printService'
import { pdfService } from '../services/pdfService'
import EnviarEmailModal from './ventas/EnviarEmailModal.vue'

const toast = useToast()

// ===== STATE =====
const tipoDocumento = ref('factura')
const fechaDesde = ref('')
const fechaHasta = ref('')
const documentos = ref([])
const cargando = ref(false)
const buscado = ref(false)
const generandoPdf = ref(false)

const modalInstance = ref(null)
const documentoActual = ref(null)
const productosMap = ref({})
const qrDataUrl = ref('')

const xmlDoc = ref('')
const xmlViewerRef = ref(null)

let modalXmlInstance = null
let modalConfirm = null

const reabrirPreviewTrasXml = ref(false)
const abriendoEmail = ref(false)

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

// ===== GUARDS =====
let listAbort = null
let qrAbort = null
let unmounted = false

// ===== COMPUTED =====
const hayFiltros = computed(() =>
  Boolean(
    tipoDocumento.value !== 'factura' ||
    fechaDesde.value ||
    fechaHasta.value
  )
)

// ===== HELPERS =====

/** ¿El documento es una guía de remisión? */
const esGuiaRemision = (doc) =>
  String(doc?.tipo_documento || '').toLowerCase() === 'guia_remision'

/**
 * Nombre a mostrar en la columna "Cliente / Proveedor / Destinatario".
 * Para guías usa el destinatario; para el resto, cliente o proveedor.
 */
const nombreContraparte = (doc) => {
  if (!doc) return 'N/A'
  if (esGuiaRemision(doc)) {
    return (
      doc.destinatario_razon_social ||
      doc.cliente?.nombre ||
      'Destinatario'
    )
  }
  return doc.cliente?.nombre || doc.proveedor?.nombre || 'N/A'
}

/** Etiqueta legible del tipo de identificación SRI. */
const getTipoIdentLabel = (codigo) => {
  const s = String(codigo || '').trim()
  return (
    {
      '04': 'RUC',
      '05': 'Cédula',
      '06': 'Pasaporte',
      '07': 'Consumidor Final',
      '08': 'Identificación Exterior',
      '09': 'Placa'
    }[s] || s || '—'
  )
}

const obtenerNombreProducto = (id) => {
  if (!id) return 'Producto eliminado'
  return productosMap.value[String(id)]?.nombre || 'Producto eliminado'
}

const getTipoDocLabel = (tipo) =>
  ({
    factura: 'Factura',
    guia_remision: 'Guía de Remisión',
    exportacion: 'Factura de Exportación',
    reembolso: 'Factura de Reembolso',
    retencion: 'Comprobante de Retención',
    liquidacion: 'Liquidación de Compra',
    nota_credito: 'Nota de Crédito',
    proforma: 'Proforma',
    compras: 'Compra'
  }[tipo] || tipo || 'Documento')

const getEstadoSriClass = (estado) => {
  switch (estado) {
    case 'AUTORIZADO': return 'bg-success'
    case 'FIRMADO': return 'bg-info'
    case 'PENDIENTE':
    case 'RECIBIDA': return 'bg-warning text-dark'
    case 'RECHAZADA':
    case 'DEVUELTA': return 'bg-danger'
    default: return 'bg-secondary'
  }
}

const formatFecha = (f) => {
  if (!f) return ''
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  } catch {
    return ''
  }
}

const formatFechaHora = (f) => {
  if (!f) return ''
  try {
    return new Date(f).toLocaleString('es-EC')
  } catch {
    return ''
  }
}

const requiereClave = (doc) =>
  [
    'factura',
    'liquidacion',
    'nota_credito',
    'guia_remision',
    'retencion',
    'exportacion',
    'reembolso'
  ].includes(doc?.tipo_documento)

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// ===== CONFIRMACIÓN =====
const pedirConfirmacion = (opts = {}) =>
  new Promise((resolve) => {
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
        document.getElementById('modalConfirmConsulta'),
        { backdrop: 'static' }
      )
    }
    modalConfirm.show()
  })

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

// ===== CARGA (vía API) =====
const cargarDatos = async () => {
  if (listAbort) {
    try { listAbort.abort() } catch { /* noop */ }
  }
  listAbort = new AbortController()

  cargando.value = true
  buscado.value = true

  try {
    if (Object.keys(productosMap.value).length === 0) {
      try {
        const resProd = await api.request('/productos?limit=5000', {
          method: 'GET',
          skipLoader: true,
          signal: listAbort.signal
        })
        const arr = Array.isArray(resProd) ? resProd : resProd?.data || []
        const map = {}
        for (const p of arr) map[String(p._id)] = p
        productosMap.value = map
      } catch (e) {
        const esAbort = e?.name === 'AbortError' || /aborted/i.test(e?.message || '')
        if (!esAbort) console.warn('No se pudieron cargar productos:', e?.message)
      }
    }

    const params = new URLSearchParams()
    params.set('limit', '500')
    if (fechaDesde.value) params.set('desde', fechaDesde.value)
    if (fechaHasta.value) params.set('hasta', fechaHasta.value)

    let endpoint
    if (tipoDocumento.value === 'compras') {
      endpoint = `/compras?${params.toString()}`
    } else {
      params.set('tipo_documento', tipoDocumento.value)
      params.set('sortBy', 'fecha_emision')
      params.set('sortDir', 'desc')
      endpoint = `/ventas?${params.toString()}`
    }

    const res = await api.request(endpoint, {
      method: 'GET',
      signal: listAbort.signal
    })

    if (unmounted) return

    documentos.value = Array.isArray(res) ? res : res?.data || []
  } catch (e) {
    const esAbort = e?.name === 'AbortError' || /aborted/i.test(e?.message || '')
    if (unmounted || esAbort) return
    console.error('Error cargando documentos:', e)
    toast.error('Error al cargar: ' + (e?.message || 'desconocido'))
    documentos.value = []
  } finally {
    if (!unmounted) cargando.value = false
  }
}

const limpiarFiltros = () => {
  tipoDocumento.value = 'factura'
  fechaDesde.value = ''
  fechaHasta.value = ''
  documentos.value = []
  buscado.value = false
}

// ===== VER DOCUMENTO =====
const verDocumento = async (doc) => {
  documentoActual.value = doc
  qrDataUrl.value = ''

  if (doc.clave_acceso && doc._id && doc.tipo_documento !== 'compras') {
    if (qrAbort) {
      try { qrAbort.abort() } catch { /* noop */ }
    }
    qrAbort = new AbortController()

    try {
      const res = await api.request(`/ventas/${doc._id}/qr`, {
        method: 'GET',
        skipLoader: true,
        signal: qrAbort.signal
      })
      if (unmounted) return
      qrDataUrl.value = res?.qr || ''
    } catch (e) {
      const esAbort = e?.name === 'AbortError' || /aborted/i.test(e?.message || '')
      if (!esAbort) console.warn('QR no disponible:', e?.message)
    }
  }

  abrirModal()
}

const limpiarDocumentoActual = () => {
  documentoActual.value = null
  qrDataUrl.value = ''
  reabrirPreviewTrasXml.value = false
  abriendoEmail.value = false
}

const abrirModal = () => {
  if (!modalInstance.value) {
    const modalEl = document.getElementById('modalDocumento')
    modalInstance.value = new Modal(modalEl, {
      backdrop: 'static',
      keyboard: false
    })
  }
  modalInstance.value.show()
}

const cerrarModal = () => {
  modalInstance.value?.hide()
}

// ===== IMPRIMIR =====
const imprimirModal = (formato) => {
  if (!documentoActual.value) return
  try {
    printService.printDocument(
      documentoActual.value,
      formato,
      obtenerNombreProducto
    )
  } catch (e) {
    toast.error('Error al imprimir: ' + (e?.message || 'desconocido'))
  }
}

// ===== PDF =====
const guardarPDF = async () => {
  const doc = documentoActual.value
  if (!doc || generandoPdf.value) return

  generandoPdf.value = true
  try {
    await pdfService.descargarRIDE(doc, {
      qrDataUrl: qrDataUrl.value || null,
      obtenerNombreProducto
    })
    if (!unmounted) toast.success('PDF generado')
  } catch (e) {
    if (!unmounted) {
      console.error('Error generando PDF:', e)
      toast.error('Error al generar PDF: ' + (e?.message || 'desconocido'))
    }
  } finally {
    if (!unmounted) generandoPdf.value = false
  }
}

// ===== GENERAR CLAVE =====
const generarClave = async (doc) => {
  const confirmado = await pedirConfirmacion({
    titulo: 'Generar clave de acceso',
    mensaje: `¿Generar clave de acceso para <strong>${escapeHtml(
      doc.numero_factura || doc.numero_guia || 'este documento'
    )}</strong>?`,
    detalle:
      'Se generará la clave de 49 dígitos y se intentará firmar automáticamente.',
    textoConfirmar: 'Generar',
    variante: 'warning',
    icono: 'fas fa-key'
  })
  if (!confirmado) return

  try {
    const res = await api.request(`/ventas/${doc._id}/generar-clave`, {
      method: 'POST',
      loaderMessage: 'Generando clave…'
    })
    if (unmounted) return

    toast.success(
      `✅ Clave generada${res?.firmado ? ' y documento firmado' : ''}`
    )

    await cargarDatos()

    if (documentoActual.value?._id === doc._id) {
      try {
        const actualizado = await api.request(`/ventas/${doc._id}`, {
          method: 'GET'
        })
        if (!unmounted) documentoActual.value = actualizado
      } catch {
        /* noop */
      }
    }
  } catch (e) {
    if (unmounted) return
    const msg = e?.message || 'desconocido'
    if (/RUC/i.test(msg)) {
      toast.error(
        'Debes configurar el RUC primero en Administración → Configuración Empresa',
        { timeout: 8000 }
      )
    } else if (/autorizado/i.test(msg)) {
      toast.warning('Este documento ya está autorizado por el SRI')
    } else {
      toast.error('Error: ' + msg)
    }
  }
}

// ===== FIRMAR =====
const firmarDocumento = async (doc) => {
  const confirmado = await pedirConfirmacion({
    titulo: 'Firmar documento',
    mensaje: `¿Firmar electrónicamente <strong>${escapeHtml(
      doc.numero_factura || doc.numero_guia || ''
    )}</strong>?`,
    detalle: 'Se usará el certificado configurado actualmente.',
    textoConfirmar: 'Firmar',
    variante: 'warning',
    icono: 'fas fa-signature'
  })
  if (!confirmado) return

  try {
    await api.request(`/ventas/${doc._id}/firmar`, {
      method: 'POST',
      loaderMessage: 'Firmando…'
    })
    if (unmounted) return
    toast.success('Documento firmado')
    await cargarDatos()
  } catch (e) {
    if (unmounted) return
    const msg = e?.message || 'desconocido'
    if (/certificado/i.test(msg)) {
      toast.error(
        'Debes subir un certificado primero en Administración → Certificado Firma',
        { timeout: 8000 }
      )
    } else {
      toast.error('Error: ' + msg)
    }
  }
}

// ===== ENVIAR AL SRI =====
const enviarSRI = async (doc) => {
  const confirmado = await pedirConfirmacion({
    titulo: 'Enviar al SRI',
    mensaje: `¿Enviar <strong>${escapeHtml(
      doc.numero_factura || doc.numero_guia || ''
    )}</strong> al SRI?`,
    detalle: 'Esta acción puede tardar hasta 30 segundos.',
    textoConfirmar: 'Enviar',
    variante: 'success',
    icono: 'fas fa-paper-plane'
  })
  if (!confirmado) return

  try {
    const res = await api.request(`/sri/enviar/${doc._id}`, {
      method: 'POST',
      loaderMessage: 'Enviando al SRI…'
    })
    if (unmounted) return

    if (res?.success) {
      toast.success(`✅ Autorizado: ${res.numero_autorizacion || 'S/N'}`)
    } else {
      toast.warning(`Estado: ${res?.estado || 'desconocido'}`)
    }

    await cargarDatos()
  } catch (e) {
    if (!unmounted) toast.error('Error: ' + (e?.message || 'desconocido'))
  }
}

// ===== EMAIL =====
const abrirModalEmail = (doc) => {
  if (!doc) return
  documentoActual.value = doc

  const previewEl = document.getElementById('modalDocumento')
  const emailEl = document.getElementById('modalEnviarEmail')
  if (!emailEl) return

  let yaAbierto = false
  const abrirEmail = () => {
    if (yaAbierto) return
    yaAbierto = true
    abriendoEmail.value = false
    if (unmounted) return
    Modal.getOrCreateInstance(emailEl).show()
  }

  const previewAbierto = previewEl?.classList.contains('show')
  if (!previewAbierto) {
    abrirEmail()
    return
  }

  abriendoEmail.value = true
  const onHidden = () => {
    previewEl.removeEventListener('hidden.bs.modal', onHidden)
    abrirEmail()
  }
  previewEl.addEventListener('hidden.bs.modal', onHidden, { once: true })
  modalInstance.value?.hide()

  setTimeout(() => {
    if (!yaAbierto) {
      previewEl.removeEventListener('hidden.bs.modal', onHidden)
      abrirEmail()
    }
  }, 600)
}

// ===== XML =====
const verXml = async (doc) => {
  if (!doc?._id) return
  xmlDoc.value = ''

  const previewEl = document.getElementById('modalDocumento')
  const previewAbierto = previewEl?.classList.contains('show')

  if (previewAbierto) {
    reabrirPreviewTrasXml.value = true
    await new Promise((resolve) => {
      const onHidden = () => {
        previewEl.removeEventListener('hidden.bs.modal', onHidden)
        resolve()
      }
      previewEl.addEventListener('hidden.bs.modal', onHidden, { once: true })
      modalInstance.value?.hide()

      setTimeout(resolve, 600)
    })
    if (unmounted) return
  }

  if (!modalXmlInstance) {
    modalXmlInstance = new Modal(document.getElementById('modalXmlDoc'))
  }
  modalXmlInstance.show()

  try {
    const res = await api.request(`/ventas/${doc._id}/xml-preview`, {
      method: 'GET',
      skipLoader: true
    })
    if (unmounted) return
    xmlDoc.value = res?.xml || ''

    await nextTick()
    if (xmlViewerRef.value) xmlViewerRef.value.scrollTop = 0
  } catch (e) {
    if (unmounted) return
    const msg = e?.message || 'desconocido'
    toast.error('Error al cargar XML: ' + msg)
    xmlDoc.value = 'Error: ' + msg
  }
}

const copiarXml = async () => {
  if (!xmlDoc.value) return

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(xmlDoc.value)
      toast.success('XML copiado')
      return
    } catch {
      /* fallback */
    }
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = xmlDoc.value
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) toast.success('XML copiado')
    else toast.error('No se pudo copiar')
  } catch {
    toast.error('No se pudo copiar')
  }
}

const descargarXmlActual = async () => {
  const doc = documentoActual.value
  if (!doc?.clave_acceso) return
  try {
    const endpoint = doc.xml_firmado
      ? `/ventas/${doc._id}/xml-firmado`
      : `/ventas/${doc._id}/xml`
    const nombreArchivo = `${doc.clave_acceso}${
      doc.xml_firmado ? '_firmado' : ''
    }.xml`

    await api.download(endpoint, nombreArchivo)
    if (!unmounted) toast.success('XML descargado')
  } catch (e) {
    if (!unmounted) toast.error('Error: ' + (e?.message || 'desconocido'))
  }
}

// ===== WATCH =====
watch(tipoDocumento, () => {
  if (buscado.value) cargarDatos()
})

// ===== LIFECYCLE =====
onMounted(() => {
  const modalEl = document.getElementById('modalDocumento')
  if (modalEl) {
    modalInstance.value = new Modal(modalEl, {
      backdrop: 'static',
      keyboard: false
    })

    modalEl.addEventListener('hidden.bs.modal', () => {
      if (reabrirPreviewTrasXml.value || abriendoEmail.value) return
      limpiarDocumentoActual()
    })
  }

  const modalXmlEl = document.getElementById('modalXmlDoc')
  if (modalXmlEl) {
    modalXmlInstance = new Modal(modalXmlEl)
    modalXmlEl.addEventListener('hidden.bs.modal', () => {
      if (unmounted) return
      if (reabrirPreviewTrasXml.value && documentoActual.value) {
        reabrirPreviewTrasXml.value = false
        modalInstance.value?.show()
      }
    })
  }

  cargarDatos()
})

onBeforeUnmount(() => {
  unmounted = true

  if (listAbort) {
    try { listAbort.abort() } catch { /* noop */ }
    listAbort = null
  }
  if (qrAbort) {
    try { qrAbort.abort() } catch { /* noop */ }
    qrAbort = null
  }

  try { modalInstance.value?.hide() } catch { /* noop */ }
  try { modalXmlInstance?.hide() } catch { /* noop */ }
  try { modalConfirm?.hide() } catch { /* noop */ }

  if (confirmState.resolve) {
    confirmState.resolve(false)
    confirmState.resolve = null
  }

  reabrirPreviewTrasXml.value = false
  abriendoEmail.value = false
})
</script>

<style scoped>
/* ============================================================
   MODAL DOCUMENTO
   ============================================================ */
.modal-header-doc {
  background: linear-gradient(135deg, #1a3a5c, #2c3e50);
  color: #fff;
  border-bottom: 3px solid var(--accent-color, #f1c40f);
}
.modal-header-doc .btn-close {
  filter: invert(1);
}
.doc-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(241, 196, 15, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-color, #f1c40f);
  font-size: 1.3rem;
}
.modal-body-doc {
  padding: 24px;
  background: #f4f6f9;
}
.modal-footer-doc {
  border-top: 1px solid var(--border-color);
  padding: 12px 20px;
}

/* ============================================================
   PREVIEW DEL DOCUMENTO
   ============================================================ */
.documento-preview {
  background: #fff;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.85rem;
  color: #1a1a1a;
  max-width: 950px;
  margin: 0 auto;
}

.doc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  padding-bottom: 14px;
  border-bottom: 3px double #1a3a5c;
  margin-bottom: 14px;
}
.doc-header-left { flex: 1; }
.doc-header-center { flex: 1.2; text-align: center; }
.doc-header-right { flex: 0.6; text-align: right; }

.logo-empresa {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.logo-icon {
  width: 44px;
  height: 44px;
  background: #1a3a5c;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f1c40f;
  font-size: 1.4rem;
  font-weight: 800;
}
.empresa-nombre {
  font-size: 1.1rem;
  font-weight: 800;
  color: #1a3a5c;
  line-height: 1.1;
}
.empresa-sub { font-size: 0.7rem; color: #666; }
.empresa-info { font-size: 0.78rem; color: #333; margin-top: 6px; }

.doc-tipo-badge {
  display: inline-block;
  padding: 8px 20px;
  background: #1a3a5c;
  color: #fff;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 1.5px;
  margin-bottom: 6px;
}
.doc-numero-badge {
  font-size: 1rem;
  font-weight: 700;
  color: #c0392b;
  margin-bottom: 4px;
  font-family: monospace;
}
.doc-fecha { font-size: 0.8rem; color: #555; margin-bottom: 6px; }
.ambiente-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #fff;
}
.amb-produccion { background: #27ae60; }
.amb-pruebas { background: #e67e22; }

.qr-container { text-align: center; }
.qr-img {
  width: 90px;
  height: 90px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 4px;
}
.qr-label { font-size: 0.65rem; color: #666; margin-top: 4px; }

.clave-section {
  display: flex;
  gap: 15px;
  align-items: center;
  padding: 12px 14px;
  background: #f8f9fa;
  border-left: 4px solid #1a3a5c;
  border-radius: 6px;
  margin-bottom: 14px;
}
.clave-left { flex: 1; min-width: 0; }
.clave-label {
  font-size: 0.7rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
  margin-bottom: 4px;
}
.clave-valor {
  font-family: 'Courier New', monospace;
  font-size: 0.72rem;
  color: #1a3a5c;
  font-weight: 700;
  word-break: break-all;
  line-height: 1.4;
  margin-bottom: 6px;
}
.autorizacion-info { font-size: 0.7rem; color: #555; line-height: 1.5; }
.autorizacion-info strong { color: #1a3a5c; }

.cliente-section { display: flex; gap: 12px; margin-bottom: 14px; }
.cliente-box {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #d5dbe0;
  border-radius: 6px;
  background: #fafbfc;
}
.cliente-box-title {
  font-size: 0.7rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px dashed #d5dbe0;
}
.cliente-row { display: flex; font-size: 0.78rem; margin: 3px 0; line-height: 1.3; }
.cliente-row-label { min-width: 95px; color: #666; font-weight: 600; }
.cliente-row-value { flex: 1; color: #1a1a1a; font-weight: 500; word-break: break-word; }

.detalles-section { margin-bottom: 14px; }
.detalles-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: #1a3a5c;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 0;
  border-bottom: 2px solid #1a3a5c;
}
.detalles-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.detalles-table thead { background: #1a3a5c; color: #fff; }
.detalles-table thead th {
  padding: 8px;
  text-align: left;
  font-size: 0.72rem;
  text-transform: uppercase;
}
.detalles-table tbody td { padding: 10px 8px; border-bottom: 1px solid #e9ecef; }
.detalles-table tbody tr:nth-child(even) { background: #f8f9fa; }
.product-name { font-weight: 600; color: #1a1a1a; margin-bottom: 2px; }
.product-code { font-size: 0.72rem; color: #888; font-family: monospace; }
.badge-iva {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 700;
}
.iva-si { background: rgba(52, 152, 219, 0.15); color: #2980b9; }
.iva-no { background: rgba(127, 140, 141, 0.15); color: #7f8c8d; }

.totales-section { display: flex; justify-content: flex-end; margin-bottom: 14px; }
.totales-box {
  width: 100%;
  max-width: 340px;
  border: 1px solid #d5dbe0;
  border-radius: 6px;
  overflow: hidden;
}
.total-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 14px;
  font-size: 0.85rem;
  border-bottom: 1px solid #e9ecef;
}
.total-row:last-child { border-bottom: none; }
.total-row .label { color: #555; font-weight: 500; }
.total-row .value { color: #1a1a1a; font-weight: 600; font-family: monospace; }
.total-final {
  display: flex;
  justify-content: space-between;
  padding: 14px;
  background: linear-gradient(135deg, #1a3a5c, #2c3e50);
  color: #fff;
  font-size: 1.05rem;
  font-weight: 800;
}
.total-final .value { font-family: monospace; }

.doc-footer {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 2px solid #1a3a5c;
  text-align: center;
  font-size: 0.72rem;
  color: #666;
  line-height: 1.7;
}

/* ============================================================
   MODAL XML
   ============================================================ */
.xml-viewer {
  background: #1e1e1e;
  border-radius: 10px;
  padding: 16px;
  max-height: 65vh;
  overflow: auto;
}
.xml-viewer pre {
  color: #d4d4d4;
  font-size: 0.78rem;
  line-height: 1.6;
  margin: 0;
  font-family: 'Consolas', 'Monaco', 'Menlo', monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ============================================================
   UTILIDADES
   ============================================================ */
.font-monospace { font-family: 'JetBrains Mono', 'Courier New', monospace; }
.text-end, .text-right { text-align: right; }

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (max-width: 768px) {
  .documento-preview { padding: 16px; font-size: 0.78rem; }
  .doc-header { flex-direction: column; gap: 12px; }
  .doc-header-center,
  .doc-header-right { text-align: left; }
  .cliente-section { flex-direction: column; }
  .detalles-table { font-size: 0.75rem; }
}
</style>