<template>
  <div class="export-import-container">
    <div class="d-flex gap-2 flex-wrap">
      <button class="btn btn-success" @click="exportarExcel('productos')">
        <i class="fas fa-file-excel"></i> Exportar Productos
      </button>
      <button class="btn btn-success" @click="exportarExcel('clientes')">
        <i class="fas fa-file-excel"></i> Exportar Clientes
      </button>
      <button class="btn btn-success" @click="exportarExcel('proveedores')">
        <i class="fas fa-file-excel"></i> Exportar Proveedores
      </button>
      <button class="btn btn-success" @click="exportarExcel('ventas')">
        <i class="fas fa-file-excel"></i> Exportar Ventas
      </button>
      <button class="btn btn-success" @click="exportarExcel('compras')">
        <i class="fas fa-file-excel"></i> Exportar Compras
      </button>

      <label class="btn btn-primary" for="fileInput">
        <i class="fas fa-file-import"></i> Importar Productos
        <input type="file" id="fileInput" accept=".xlsx,.xls,.csv" style="display:none" @change="importarProductos" />
      </label>
    </div>
  </div>
</template>

<script setup>
import * as XLSX from 'xlsx'
import { useMongoDB } from '../composables/useMongoDB'
import { useToast } from 'vue-toastification'

const { find, insertOne } = useMongoDB()
const toast = useToast()

const exportarExcel = async (coleccion) => {
  try {
    const data = await find(coleccion)
    if (!data || data.length === 0) {
      toast.warning('No hay datos para exportar')
      return
    }
    // Formatear datos para mejor legibilidad
    const formatted = data.map(item => {
      const obj = { ...item }
      delete obj._id
      delete obj.createdAt
      delete obj.updatedAt
      return obj
    })
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(formatted)
    XLSX.utils.book_append_sheet(wb, ws, coleccion)
    XLSX.writeFile(wb, `${coleccion}_${new Date().toISOString().slice(0,10)}.xlsx`)
    toast.success(`Exportación de ${coleccion} completada`)
  } catch (e) {
    toast.error('Error al exportar: ' + e.message)
  }
}

const importarProductos = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  try {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(firstSheet)
      
      let count = 0
      for (const row of jsonData) {
        // Mapear columnas del Excel a campos de la base de datos
        const producto = {
          nombre: row.nombre || row.Nombre || row['Nombre'] || '',
          codigo: row.codigo || row.Codigo || row['Código'] || `PROD-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          categoriaId: null,
          descripcion: row.descripcion || row.Descripcion || '',
          precio_compra: parseFloat(row.precio_compra || row.PrecioCompra || 0),
          precio_venta: parseFloat(row.precio_venta || row.PrecioVenta || 0),
          stock: parseFloat(row.stock || row.Stock || 0),
          stock_minimo: parseFloat(row.stock_minimo || row.StockMinimo || 0),
          unidad_medida: row.unidad_medida || row.UnidadMedida || 'unidad',
          aplica_iva: row.aplica_iva !== undefined ? Boolean(row.aplica_iva) : true,
          tipo_medida: row.tipo_medida || row.TipoMedida || 'unidad'
        }
        if (!producto.nombre) continue
        await insertOne('productos', producto)
        count++
      }
      toast.success(`Importados ${count} productos correctamente`)
    }
    reader.readAsArrayBuffer(file)
    // Resetear input
    event.target.value = ''
  } catch (e) {
    toast.error('Error al importar: ' + e.message)
  }
}
</script>

<style scoped>
.export-import-container {
  padding: 10px 0;
}
</style>