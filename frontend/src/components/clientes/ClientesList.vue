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
      <div class="card-body table-responsive">
        <table class="table table-cacao" id="tablaClientes">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>RUC/Cédula</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in clientes" :key="c._id">
              <td>{{ c.nombre }}</td>
              <td>{{ c.ruc }}</td>
              <td>{{ c.telefono }}</td>
              <td>{{ c.email }}</td>
              <td>
                <router-link :to="`/clientes/editar/${c._id}`" class="btn btn-sm btn-outline-primary me-1">
                  <i class="fas fa-edit"></i>
                </router-link>
                <button class="btn btn-sm btn-outline-danger" @click="eliminar(c._id)">
                  <i class="fas fa-trash"></i>
                </button>
              </td>
            </tr>
            <tr v-if="clientes.length === 0">
              <td colspan="5" class="text-muted text-center">No hay clientes registrados</td>
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

const { find, deleteOne } = useMongoDB()
const clientes = ref([])

const cargar = async () => {
  try {
    clientes.value = await find('clientes')
  } catch (e) {
    console.error(e)
  }
}

const eliminar = async (id) => {
  if (confirm('¿Eliminar este cliente?')) {
    try {
      await deleteOne('clientes', id)
      await cargar()
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }
}

const imprimirLista = () => {
  if (clientes.value.length === 0) {
    alert('No hay clientes para imprimir')
    return
  }

  const pdf = new jsPDF('p', 'mm', 'a4')
  pdf.setFontSize(16)
  pdf.text('Lista de Clientes', 14, 20)
  pdf.setFontSize(10)
  pdf.text(`Generado: ${new Date().toLocaleString()}`, 14, 28)

  const tableData = clientes.value.map(c => [
    c.nombre || 'N/A',
    c.ruc || 'N/A',
    c.telefono || 'N/A',
    c.email || 'N/A'
  ])

  pdf.autoTable({
    startY: 35,
    head: [['Nombre', 'RUC/Cédula', 'Teléfono', 'Email']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
    styles: { fontSize: 9 }
  })

  pdf.save('lista_clientes.pdf')
}

onMounted(cargar)
</script>