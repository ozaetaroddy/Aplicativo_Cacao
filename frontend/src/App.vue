<template>
  <div id="app">
    <Navbar />
    <div class="container main-container">
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
@import './styles.css';
</style>