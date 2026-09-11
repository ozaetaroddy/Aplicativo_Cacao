<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-truck"></i> Proveedores</h4>
      <div>
        <button class="btn btn-primary me-2" @click="imprimirLista">
          <i class="fas fa-print"></i> Imprimir Lista
        </button>
        <router-link to="/proveedores/nuevo" class="btn btn-success">
          <i class="fas fa-plus"></i> Nuevo Proveedor
        </router-link>
      </div>
    </div>

    <div class="card card-cacao">
      <div class="card-body">
        <DataTablePaged
          ref="tablaRef"
          endpoint="/proveedores"
          :columns="columnas"
          :actions="acciones"
          :default-limit="20"
          default-sort="nombre"
          default-sort-dir="asc"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'
import DataTablePaged from '../shared/DataTablePaged.vue'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { useToast } from 'vue-toastification'
import { api } from '../../services/api'

const router = useRouter()
const toast = useToast()
const { deleteOne } = useMongoDB()
const tablaRef = ref(null)

const columnas = [
  { key: 'nombre', label: 'Nombre', sortable: true },
  { key: 'ruc', label: 'RUC/Cédula', sortable: true },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'email', label: 'Email' },
  { key: 'direccion', label: 'Dirección' }
]

const acciones = [
  {
    key: 'edit',
    icon: 'fas fa-edit',
    class: 'btn-outline-primary',
    title: 'Editar',
    handler: (row) => router.push(`/proveedores/editar/${row._id}`)
  },
  {
    key: 'delete',
    icon: 'fas fa-trash',
    class: 'btn-outline-danger',
    title: 'Eliminar',
    handler: async (row) => {
      if (!confirm('¿Eliminar este proveedor?')) return
      try {
        await deleteOne('proveedores', row._id)
        tablaRef.value?.reload()
        toast.success('Proveedor eliminado correctamente')
      } catch (e) {
        toast.error('Error al eliminar: ' + e.message)
      }
    }
  }
]

const imprimirLista = async () => {
  try {
    const datos = await api.request('/proveedores', { method: 'GET' })
    if (!Array.isArray(datos) || datos.length === 0) {
      toast.warning('No hay proveedores para imprimir')
      return
    }
    const pdf = new jsPDF('p', 'mm', 'a4')
    pdf.setFontSize(16)
    pdf.text('Lista de Proveedores', 14, 20)
    pdf.setFontSize(10)
    pdf.text(`Generado: ${new Date().toLocaleString()}`, 14, 28)

    pdf.autoTable({
      startY: 35,
      head: [['Nombre', 'RUC/Cédula', 'Teléfono', 'Email', 'Dirección']],
      body: datos.map(p => [
        p.nombre || 'N/A',
        p.ruc || 'N/A',
        p.telefono || 'N/A',
        p.email || 'N/A',
        p.direccion || 'N/A'
      ]),
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 8 }
    })

    pdf.save('lista_proveedores.pdf')
    toast.success('PDF generado correctamente')
  } catch (e) {
    toast.error('Error al generar PDF: ' + e.message)
  }
}
</script>