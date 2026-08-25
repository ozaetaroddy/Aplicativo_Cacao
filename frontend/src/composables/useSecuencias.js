const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

export function useSecuencias() {
  async function generarCodigo(tipo) {
    try {
      const response = await fetch(`${API_BASE_URL}/secuencias/${tipo}`)
      if (!response.ok) throw new Error('Error al generar código')
      const data = await response.json()
      return data.codigo || data.numero
    } catch (e) {
      console.error('Error generando código:', e)
      return null
    }
  }

  return {
    generarCodigo
  }
}