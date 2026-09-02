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
      <div class="card-body table-responsive">
        <table class="table table-cacao" id="tablaProveedores">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>RUC/Cédula</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Dirección</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in proveedores" :key="p._id">
              <td>{{ p.nombre }}</td>
              <td>{{ p.ruc }}</td>
              <td>{{ p.telefono }}</td>
              <td>{{ p.email }}</td>
              <td>{{ p.direccion }}</td>
              <td>
                <router-link :to="`/proveedores/editar/${p._id}`" class="btn btn-sm btn-outline-primary me-1">
                  <i class="fas fa-edit"></i>
                </router-link>
                <button class="btn btn-sm btn-outline-danger" @click="eliminar(p._id)">
                  <i class="fas fa-trash"></i>
                </button>
              </td>
            </tr>
            <tr v-if="proveedores.length === 0">
              <td colspan="6" class="text-muted text-center">No hay proveedores registrados</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { useToast } from 'vue-toastification'

const toast = useToast()
const { find, deleteOne } = useMongoDB()
const proveedores = ref([])

const cargar = async () => {
  try {
    proveedores.value = await find('proveedores')
  } catch (e) {
    console.error(e)
    toast.error('Error al cargar proveedores: ' + e.message)
  }
}

const eliminar = async (id) => {
  if (confirm('¿Eliminar este proveedor?')) {
    try {
      await deleteOne('proveedores', id)
      await cargar()
      toast.success('Proveedor eliminado correctamente')
    } catch (e) {
      toast.error('Error al eliminar: ' + e.message)
    }
  }
}

const imprimirLista = () => {
  if (proveedores.value.length === 0) {
    toast.warning('No hay proveedores para imprimir')
    return
  }

  const pdf = new jsPDF('p', 'mm', 'a4')
  pdf.setFontSize(16)
  pdf.text('Lista de Proveedores', 14, 20)
  pdf.setFontSize(10)
  pdf.text(`Generado: ${new Date().toLocaleString()}`, 14, 28)

  const tableData = proveedores.value.map(p => [
    p.nombre || 'N/A',
    p.ruc || 'N/A',
    p.telefono || 'N/A',
    p.email || 'N/A',
    p.direccion || 'N/A'
  ])

  pdf.autoTable({
    startY: 35,
    head: [['Nombre', 'RUC/Cédula', 'Teléfono', 'Email', 'Dirección']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
    styles: { fontSize: 9 }
  })

  pdf.save('lista_proveedores.pdf')
  toast.success('PDF generado correctamente')
}

onMounted(cargar)
</script>