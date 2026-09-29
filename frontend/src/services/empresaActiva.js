// services/empresaActiva.js
// ============================================================
// Singleton plano (NO reactivo) con la empresa activa.
// ------------------------------------------------------------
// api.js necesita leer la empresa activa SIN depender de Pinia
// (evita dependencia circular api.js ↔ empresasStore.js).
//
// El store `empresasStore` es el encargado de llamar a `setActiva()`
// cada vez que cambia la empresa activa.
// ============================================================
'use strict'

const STORAGE_KEY = 'empresa_activa_id'

let _empresaId = null

// Hidratar desde localStorage al cargar el módulo
try {
  _empresaId = localStorage.getItem(STORAGE_KEY) || null
} catch { /* noop */ }

/**
 * Devuelve el id de la empresa activa o `null`.
 * @returns {string|null}
 */
export function getEmpresaId() {
  return _empresaId
}

/**
 * Setea la empresa activa y la persiste en localStorage.
 * @param {string|null} id
 */
export function setEmpresaId(id) {
  _empresaId = id ? String(id) : null
  try {
    if (_empresaId) {
      localStorage.setItem(STORAGE_KEY, _empresaId)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch { /* noop */ }
}

/**
 * Limpia la empresa activa. Útil en logout.
 */
export function clearEmpresaId() {
  setEmpresaId(null)
}