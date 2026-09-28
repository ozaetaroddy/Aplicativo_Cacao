// stores/confirmDialogStore.js
// ============================================================
// Sistema de confirmación global.
// Un solo modal reutilizable en TODA la app.
// ------------------------------------------------------------
// La Promise se resuelve con `true` (confirmar) o `false` (cancelar).
// El resolver se guarda FUERA del state de Pinia porque las
// funciones dentro del state se vuelven proxys y dan problemas.
// ============================================================
'use strict'

import { defineStore } from 'pinia'

// Resolver actual (fuera del state → no reactivo, sin overhead)
let _resolver = null

export const useConfirmDialogStore = defineStore('confirmDialog', {
  state: () => ({
    visible: false,
    titulo: '',
    mensaje: '',
    detalle: '',
    textoConfirmar: 'Confirmar',
    textoCancelar: 'Cancelar',
    variante: 'primary',
    icono: 'fas fa-question-circle'
  }),

  actions: {
    /**
     * Muestra el modal y devuelve una Promise<boolean>.
     * @param {object} opts
     * @returns {Promise<boolean>}
     */
    show(opts = {}) {
      return new Promise((resolve) => {
        // Si ya había uno pendiente, lo rechazamos con `false`
        // para no dejar Promises colgadas.
        if (_resolver) {
          const prev = _resolver
          _resolver = null
          prev(false)
        }

        this.titulo = opts.titulo || 'Confirmar acción'
        this.mensaje = opts.mensaje || '¿Estás seguro?'
        this.detalle = opts.detalle || ''
        this.textoConfirmar = opts.textoConfirmar || 'Confirmar'
        this.textoCancelar = opts.textoCancelar || 'Cancelar'
        this.variante = opts.variante || 'primary'
        this.icono = opts.icono || 'fas fa-question-circle'

        _resolver = resolve
        this.visible = true
      })
    },

    accept() {
      const r = _resolver
      _resolver = null
      this.visible = false
      if (r) r(true)
    },

    cancel() {
      const r = _resolver
      _resolver = null
      this.visible = false
      if (r) r(false)
    },

    /**
     * Rechaza cualquier confirmación pendiente. Se llama en
     * `onBeforeUnmount` del host para no dejar Promises colgadas.
     */
    rejectPending() {
      const r = _resolver
      _resolver = null
      this.visible = false
      if (r) r(false)
    }
  }
})