<template>
  <nav v-if="crumbs.length > 0" aria-label="Migas de pan" class="breadcrumb-nav">
    <ol class="breadcrumb">
      <li class="breadcrumb-item">
        <router-link to="/" aria-label="Ir al inicio">
          <i class="fas fa-home" aria-hidden="true"></i>
          <span class="crumb-home-label">Inicio</span>
        </router-link>
      </li>
      <li
        v-for="(crumb, index) in crumbs"
        :key="crumb.path + ':' + index"
        class="breadcrumb-item"
        :class="{ active: index === crumbs.length - 1 }"
      >
        <span
          v-if="index === crumbs.length - 1"
          aria-current="page"
          :title="crumb.label"
        >
          {{ truncated(crumb.label) }}
        </span>
        <router-link v-else :to="crumb.path" :title="crumb.label">
          {{ truncated(crumb.label) }}
        </router-link>
      </li>
    </ol>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// ===== CONFIGURACIÓN =====
const MAX_LABEL_LEN = 30

/** Nombres legibles por segmento. */
const SEGMENT_LABELS = Object.freeze({
  // Principales
  ventas: 'Ventas',
  compras: 'Compras',
  productos: 'Productos',
  categorias: 'Categorías',
  clientes: 'Clientes',
  proveedores: 'Proveedores',
  kardex: 'Kardex',
  inventario: 'Inventario',
  reportes: 'Reportes',
  retenciones: 'Retenciones',
  pagos: 'Pagos',
  auditoria: 'Auditoría',
  usuarios: 'Usuarios',
  backups: 'Backups',
  periodos: 'Períodos cerrados',
  'periodos-cerrados': 'Períodos cerrados',
  diagnostico: 'Diagnóstico',
  configuracion: 'Configuración',
  'configuracion-empresa': 'Empresa',
  'certificado-firma': 'Certificado Firma',
  'envio-sri': 'Envío al SRI',
  'consultar-documentos': 'Consultar Documentos',
  'mi-perfil': 'Mi perfil',
  'anexos': 'Anexos',

  // Sub-secciones
  stock: 'Stock actual',
  valorizado: 'Valorizado',
  conteo: 'Conteo físico',
  ajustes: 'Ajustes',
  planificacion: 'Planificación',
  mensual: 'Reporte mensual',
  'estado-cuenta': 'Estado de cuenta',
  cartera: 'Cartera general',
  'estados-financieros': 'Estados financieros',
  ats: 'Anexo ATS',

  // Acciones
  nuevo: 'Nuevo',
  editar: 'Editar',

  // Tipos de documento
  factura: 'Factura',
  'guia-remision': 'Guía de Remisión',
  guia_remision: 'Guía de Remisión',
  exportacion: 'Factura de Exportación',
  reembolso: 'Factura de Reembolso',
  retencion: 'Comprobante de Retención',
  liquidacion: 'Liquidación de Compra',
  'nota-credito': 'Nota de Crédito',
  nota_credito: 'Nota de Crédito',
  proforma: 'Proforma'
})

/** Etiquetas para query params (?tipo=X) que aplican al último crumb. */
const LABELS_POR_QUERY = Object.freeze({
  factura: 'Factura',
  guia_remision: 'Guía de Remisión',
  exportacion: 'Factura de Exportación',
  reembolso: 'Factura de Reembolso',
  retencion: 'Comprobante de Retención',
  liquidacion: 'Liquidación de Compra',
  nota_credito: 'Nota de Crédito',
  proforma: 'Proforma'
})

// ===== HELPERS =====
const esObjectId = (s) => /^[a-fA-F0-9]{24}$/.test(String(s))
const esUuid = (s) =>
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(
    String(s)
  )

const esId = (s) => esObjectId(s) || esUuid(s)

/**
 * Convierte un segmento de URL en una etiqueta legible.
 * - Si está en SEGMENT_LABELS, lo usa.
 * - Si es un ID, devuelve "(detalle)".
 * - Sino, capitaliza el segmento.
 */
const labelDe = (segment) => {
  const key = String(segment || '').toLowerCase()
  if (SEGMENT_LABELS[key]) return SEGMENT_LABELS[key]
  if (esId(segment)) return 'Detalle'
  // Fallback: capitalizar y reemplazar guiones
  return key
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ')
}

const truncated = (label) => {
  const s = String(label || '')
  if (s.length <= MAX_LABEL_LEN) return s
  return s.slice(0, MAX_LABEL_LEN - 1) + '…'
}

// ===== COMPUTED =====
const crumbs = computed(() => {
  const path = String(route.path || '/')
  const parts = path.split('/').filter(Boolean)

  if (parts.length === 0) return []

  const out = []
  let accumulated = ''

  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i]
    accumulated += '/' + segment

    // Saltar ObjectIds / UUIDs intermedios (no navegables)
    if (esId(segment)) {
      out.push({
        label: 'Detalle',
        path: accumulated,
        clickable: false
      })
      continue
    }

    out.push({
      label: labelDe(segment),
      path: accumulated,
      clickable: true
    })
  }

  // Caso especial: /ventas/nuevo?tipo=guia_remision → último crumb
  // se reemplaza por el tipo específico del documento.
  const ultimo = out[out.length - 1]
  if (ultimo && ultimo.label === 'Nuevo') {
    const tipo = String(route.query.tipo || '').trim()
    if (tipo && LABELS_POR_QUERY[tipo]) {
      ultimo.label = `Nueva ${LABELS_POR_QUERY[tipo]}`
    } else {
      // Fallback: usar el segmento anterior si existe
      const anterior = out[out.length - 2]
      if (anterior) {
        ultimo.label = `Nuevo ${anterior.label.toLowerCase().replace(/s$/, '')}`
      }
    }
  }

  return out
})
</script>

<style scoped>
.breadcrumb-nav {
  padding: 8px 0 16px 0;
  font-size: 0.9rem;
}

.breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  list-style: none;
  padding: 0;
  margin: 0;
  background: transparent;
}

.breadcrumb-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.breadcrumb-item a {
  color: var(--primary-color);
  text-decoration: none;
  transition: var(--transition-fast, 0.15s ease);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.breadcrumb-item a:hover,
.breadcrumb-item a:focus-visible {
  color: var(--primary-dark, #1d4ed8);
  text-decoration: underline;
  outline: none;
}

.breadcrumb-item.active {
  color: var(--text-muted);
  font-weight: 500;
  min-width: 0;
}

.crumb-home-label {
  display: inline;
}

/* Separador */
.breadcrumb-item + .breadcrumb-item::before {
  content: '›';
  font-size: 1.2rem;
  color: var(--text-muted);
  margin: 0 6px;
  line-height: 1;
  font-weight: 300;
}

@media (max-width: 576px) {
  .crumb-home-label {
    display: none;
  }
  .breadcrumb-item a {
    max-width: 120px;
  }
}
</style>