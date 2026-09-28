// composables/useConfirmDialog.js
// ============================================================
// Wrapper del store de confirmación. Devuelve una función
// `pedirConfirmacion(opts)` que devuelve Promise<boolean>.
// ============================================================
'use strict'

import { useConfirmDialogStore } from '../stores/confirmDialogStore'

export function useConfirmDialog() {
  const store = useConfirmDialogStore()

  /**
   * @param {object} opts
   * @param {string} [opts.titulo]
   * @param {string} [opts.mensaje]   Acepta HTML
   * @param {string} [opts.detalle]
   * @param {string} [opts.textoConfirmar]
   * @param {string} [opts.textoCancelar]
   * @param {string} [opts.variante]  primary | danger | warning | success | info
   * @param {string} [opts.icono]     clase FontAwesome
   * @returns {Promise<boolean>}
   */
  const pedirConfirmacion = (opts = {}) => store.show(opts)

  return { pedirConfirmacion }
}