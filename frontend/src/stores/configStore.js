import { defineStore } from 'pinia'

export const useConfigStore = defineStore('config', {
  state: () => ({
    companyName: import.meta.env.VITE_COMPANY_NAME || 'System Ozaet\'s Electronics',
    ivaPercentage: parseFloat(import.meta.env.VITE_IVA_PERCENTAGE) || 15,
    ruc: import.meta.env.VITE_COMPANY_RUC || '1234567890001',
    phone: import.meta.env.VITE_COMPANY_PHONE || '0999999999',
    address: import.meta.env.VITE_COMPANY_ADDRESS || 'Quito, Ecuador',
    email: import.meta.env.VITE_COMPANY_EMAIL || 'info@ozaet.com'
  }),
  getters: {
    // Ejemplo de getter para formatear
    companyInfo: (state) => ({
      name: state.companyName,
      ruc: state.ruc,
      phone: state.phone,
      address: state.address,
      email: state.email
    })
  },
  actions: {
    // Puedes agregar acciones si necesitas actualizar la configuración desde la UI
    updateConfig(payload) {
      Object.assign(this.$state, payload)
    }
  }
})