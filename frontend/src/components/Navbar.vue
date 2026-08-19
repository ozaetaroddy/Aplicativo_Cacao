<template>
  <nav class="navbar navbar-expand-lg navbar-cacao">
    <div class="container-fluid">
      <a class="navbar-brand" href="#"><i class="fas fa-seedling"></i> CacaoConta</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav me-auto">
          <li class="nav-item"><router-link to="/" class="nav-link" active-class="active" exact>Dashboard</router-link></li>
          <li class="nav-item"><router-link to="/compras" class="nav-link" active-class="active">Compras</router-link></li>
          <li class="nav-item"><router-link to="/ventas" class="nav-link" active-class="active">Ventas</router-link></li>
          <li class="nav-item"><router-link to="/reportes" class="nav-link" active-class="active">Reportes</router-link></li>
          <li class="nav-item"><router-link to="/inventario" class="nav-link" active-class="active">Inventario</router-link></li>
        </ul>
        <span class="navbar-text"><i class="fas fa-database me-1"></i> Local</span>
      </div>
    </div>
  </nav>
</template>