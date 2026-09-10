// composables/useCatalogosSRI.js
import { ref } from 'vue'
import { api } from '../services/api'

// Cache a nivel de módulo (persiste mientras la app está abierta)
let catalogosCache = null
let promesaCarga = null

export function useCatalogosSRI() {
  const catalogos = ref(catalogosCache || {})
  const loading = ref(false)
  const error = ref(null)

  const cargarCatalogos = async (forzar = false) => {
    // Si ya están en cache y no se fuerza, devolverlos
    if (catalogosCache && !forzar) {
      catalogos.value = catalogosCache
      return catalogosCache
    }

    // Si ya hay una petición en curso, esperar la misma promesa
    if (promesaCarga) {
      return promesaCarga
    }

    loading.value = true
    error.value = null

    promesaCarga = api.request('/catalogos', {
      method: 'GET',
      loaderMessage: 'Cargando catálogos SRI...'
    })
      .then(data => {
        catalogosCache = data
        catalogos.value = data
        return data
      })
      .catch(err => {
        error.value = err.message
        throw err
      })
      .finally(() => {
        loading.value = false
        promesaCarga = null
      })

    return promesaCarga
  }

  // Helpers para obtener nombres
  const getNombre = (lista, codigo) => {
    if (!lista || !codigo) return codigo
    const item = lista.find(x => x.codigo === codigo)
    return item ? item.nombre : codigo
  }

  const getCodigo = (lista, nombre) => {
    if (!lista || !nombre) return null
    const item = lista.find(x => x.nombre === nombre)
    return item ? item.codigo : null
  }

  const getPorcentajeIVA = (tarifa) => {
    if (!catalogos.value.TARIFA_IVA) return 0
    const item = catalogos.value.TARIFA_IVA.find(x => x.codigo === tarifa)
    return item ? item.porcentaje : 0
  }

  return {
    catalogos,
    loading,
    error,
    cargarCatalogos,
    getNombre,
    getCodigo,
    getPorcentajeIVA
  }
}