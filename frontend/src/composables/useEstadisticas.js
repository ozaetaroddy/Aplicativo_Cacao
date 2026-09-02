import { ref } from 'vue'
import { useMongoDB } from './useMongoDB'

export function useEstadisticas() {
  const { find } = useMongoDB()
  const ventasHoy = ref(0)
  const ventasMes = ref(0)
  const comprasHoy = ref(0)
  const comprasMes = ref(0)
  const ventasDiarias = ref([])
  const comprasDiarias = ref([])
  const dias = ref([])
  const topProductos = ref([])
  const loading = ref(false)

  const formatearFecha = (fecha) => {
    const d = new Date(fecha)
    return d.toISOString().split('T')[0]
  }

  const obtenerUltimos7Dias = () => {
    const fechas = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      fechas.push(d.toISOString().split('T')[0])
    }
    return fechas
  }

  const cargarEstadisticas = async () => {
    loading.value = true
    try {
      const hoy = formatearFecha(new Date())
      const inicioMes = new Date()
      inicioMes.setDate(1)
      const inicioMesStr = formatearFecha(inicioMes)

      // Obtener todos los datos en paralelo
      const [ventas, compras] = await Promise.all([
        find('ventas'),
        find('compras')
      ])

      // Ventas de hoy y del mes
      ventasHoy.value = ventas
        .filter(v => v.fecha_emision && v.fecha_emision.startsWith(hoy))
        .reduce((sum, v) => sum + (v.total || 0), 0)

      ventasMes.value = ventas
        .filter(v => v.fecha_emision && v.fecha_emision >= inicioMesStr)
        .reduce((sum, v) => sum + (v.total || 0), 0)

      // Compras de hoy y del mes
      comprasHoy.value = compras
        .filter(c => c.fecha_emision && c.fecha_emision.startsWith(hoy))
        .reduce((sum, c) => sum + (c.total || 0), 0)

      comprasMes.value = compras
        .filter(c => c.fecha_emision && c.fecha_emision >= inicioMesStr)
        .reduce((sum, c) => sum + (c.total || 0), 0)

      // Ventas diarias de los últimos 7 días
      const ultimos7 = obtenerUltimos7Dias()
      dias.value = ultimos7.map(d => new Date(d).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' }))

      ventasDiarias.value = ultimos7.map(d => {
        return ventas
          .filter(v => v.fecha_emision && v.fecha_emision.startsWith(d))
          .reduce((sum, v) => sum + (v.total || 0), 0)
      })

      comprasDiarias.value = ultimos7.map(d => {
        return compras
          .filter(c => c.fecha_emision && c.fecha_emision.startsWith(d))
          .reduce((sum, c) => sum + (c.total || 0), 0)
      })

      // Top 5 productos más vendidos
      const productosVendidos = {}
      ventas.forEach(v => {
        if (v.detalles) {
          v.detalles.forEach(d => {
            const id = d.productoId
            if (!productosVendidos[id]) productosVendidos[id] = 0
            productosVendidos[id] += d.cantidad || 0
          })
        }
      })
      const sorted = Object.entries(productosVendidos)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
      topProductos.value = sorted

    } catch (e) {
      console.error('Error cargando estadísticas:', e)
    } finally {
      loading.value = false
    }
  }

  return {
    ventasHoy,
    ventasMes,
    comprasHoy,
    comprasMes,
    ventasDiarias,
    comprasDiarias,
    dias,
    topProductos,
    loading,
    cargarEstadisticas
  }
}