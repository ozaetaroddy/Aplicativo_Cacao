<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-users"></i> Clientes</h4>
      <div>
        <button class="btn btn-primary me-2" @click="imprimirLista">
          <i class="fas fa-print"></i> Imprimir Lista
        </button>
        <router-link to="/clientes/nuevo" class="btn btn-success">
          <i class="fas fa-plus"></i> Nuevo Cliente
        </router-link>
      </div>
    </div>

    <div class="card card-cacao">
      <div class="card-body">
        <DataTablePaged
          ref="tablaRef"
          endpoint="/clientes"
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
  { key: 'email', label: 'Email' }
]

const acciones = [
  {
    key: 'edit',
    icon: 'fas fa-edit',
    class: 'btn-outline-primary',
    title: 'Editar',
    handler: (row) => router.push(`/clientes/editar/${row._id}`)
  },
  {
    key: 'delete',
    icon: 'fas fa-trash',
    class: 'btn-outline-danger',
    title: 'Eliminar',
    handler: async (row) => {
      if (!confirm('¿Eliminar este cliente?')) return
      try {
        await deleteOne('clientes', row._id)
        tablaRef.value?.reload()
        toast.success('Cliente eliminado correctamente')
      } catch (e) {
        toast.error('Error al eliminar: ' + e.message)
      }
    }
  }
]

// Imprime TODOS los clientes (no solo la página actual)
const imprimirLista = async () => {
  try {
    const datos = await api.request('/clientes', { method: 'GET' })
    if (!Array.isArray(datos) || datos.length === 0) {
      toast.warning('No hay clientes para imprimir')
      return
    }
    const pdf = new jsPDF('p', 'mm', 'a4')
    pdf.setFontSize(16)
    pdf.text('Lista de Clientes', 14, 20)
    pdf.setFontSize(10)
    pdf.text(`Generado: ${new Date().toLocaleString()}`, 14, 28)

    pdf.autoTable({
      startY: 35,
      head: [['Nombre', 'RUC/Cédula', 'Teléfono', 'Email']],
      body: datos.map(c => [
        c.nombre || 'N/A',
        c.ruc || 'N/A',
        c.telefono || 'N/A',
        c.email || 'N/A'
      ]),
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 9 }
    })

    pdf.save('lista_clientes.pdf')
    toast.success('PDF generado correctamente')
  } catch (e) {
    toast.error('Error al generar PDF: ' + e.message)
  }
}
</script>