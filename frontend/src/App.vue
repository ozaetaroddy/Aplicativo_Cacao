<template>
  <div id="app">
    <Navbar />
    <div class="container main-container">
      <div class="alert alert-info alert-dismissible fade show config-alert" role="alert">
        <i class="fas fa-info-circle me-2"></i>
        <strong>Bienvenido</strong> al Sistema Global de Gestión Empresarial.
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
      <router-view />
    </div>
    <Footer />
  </div>
</template>

<script setup>
import Navbar from './components/Navbar.vue'
import Footer from './components/Footer.vue'
</script>

<style>
/* Los estilos están en styles.css */
</style>