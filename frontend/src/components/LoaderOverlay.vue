<template>
  <div v-if="loaderStore.isLoading" class="loader-overlay">
    <div class="loader-container">
      <div class="loader-spinner"></div>
      <div class="loader-message">{{ loaderStore.message }}</div>
    </div>
  </div>
</template>

<script setup>
import { useLoaderStore } from '../stores/loaderStore'

const loaderStore = useLoaderStore()
</script>

<style scoped>
.loader-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  animation: fadeIn 0.3s ease;
}

.loader-container {
  background: var(--bg-card, #fff);
  padding: 30px 40px;
  border-radius: var(--radius, 16px);
  box-shadow: 0 20px 60px var(--shadow-hover, rgba(0,0,0,0.3));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-width: 200px;
  border: 1px solid var(--border-color, #e0e0e0);
}

.loader-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--border-color, #e0e0e0);
  border-top: 4px solid var(--primary-color, #3498db);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loader-message {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary, #2d2d2d);
  text-align: center;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Modo oscuro: ya se adapta gracias a las variables */
[data-theme="dark"] .loader-container {
  background: var(--bg-card);
  border-color: var(--border-color);
}
[data-theme="dark"] .loader-message {
  color: var(--text-primary);
}
</style>