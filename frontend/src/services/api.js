import { useToast } from 'vue-toastification'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
const toast = useToast()

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`
  console.log('📡 Petición a:', url, options)

  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    })

    // Si la respuesta no es ok, intentamos leer el error
    if (!response.ok) {
      let errorMsg = `Error ${response.status}`
      try {
        const errData = await response.json()
        errorMsg = errData.error || errData.message || errorMsg
      } catch (e) {
        // Si no se puede leer JSON, usamos el texto de estado
        errorMsg = response.statusText || errorMsg
      }
      throw new Error(errorMsg)
    }

    const data = await response.json()
    console.log('✅ Datos recibidos:', data)
    return data
  } catch (err) {
    console.error('❌ Error en request:', err)
    // Mostrar toast de error (excepto si es un error 404 de ruta, que manejamos aparte)
    if (err.message && !err.message.includes('404')) {
      toast.error(`Error: ${err.message}`)
    }
    throw err
  }
}

// En services/api.js, agrega:
export const request = requestFunction // (la función que definiste)
export const api = {
  request,
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
}