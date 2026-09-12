<template>
  <footer class="footer-modern">
    <div class="footer-bg-pattern"></div>

    <div class="container">
      <div class="footer-main">
        <!-- Columna 1: Brand -->
        <div class="footer-col footer-col-brand">
          <div class="footer-logo">
            <div class="logo-icon">
              <i class="fas fa-calculator"></i>
            </div>
            <div>
              <div class="logo-title">System Ozaet's Electronics</div>
              <div class="logo-sub">Sistema Contable v2.0</div>
            </div>
          </div>
          <p class="footer-description">
            Plataforma integral para gestión contable con facturación electrónica certificada por el SRI Ecuador.
          </p>
          <div class="footer-badges">
            <span class="badge-pill">
              <i class="fas fa-shield-alt"></i> SRI Certified
            </span>
            <span class="badge-pill">
              <i class="fas fa-lock"></i> Seguro
            </span>
          </div>
        </div>

        <!-- Columna 2: Enlaces rápidos -->
        <div class="footer-col">
          <h4 class="footer-heading">Enlaces Rápidos</h4>
          <ul class="footer-links">
            <li><router-link to="/"><i class="fas fa-chevron-right"></i> Inicio</router-link></li>
            <li><router-link to="/ventas"><i class="fas fa-chevron-right"></i> Ventas</router-link></li>
            <li><router-link to="/compras"><i class="fas fa-chevron-right"></i> Compras</router-link></li>
            <li><router-link to="/reportes/ventas"><i class="fas fa-chevron-right"></i> Reportes</router-link></li>
          </ul>
        </div>

        <!-- Columna 3: Módulos -->
        <div class="footer-col">
          <h4 class="footer-heading">Módulos</h4>
          <ul class="footer-links">
            <li><router-link to="/inventario/stock"><i class="fas fa-chevron-right"></i> Inventario</router-link></li>
            <li><router-link to="/reportes/ats"><i class="fas fa-chevron-right"></i> Anexo ATS</router-link></li>
            <li><router-link to="/retenciones"><i class="fas fa-chevron-right"></i> Retenciones</router-link></li>
            <li><router-link to="/auditoria"><i class="fas fa-chevron-right"></i> Auditoría</router-link></li>
          </ul>
        </div>

        <!-- Columna 4: Contacto -->
        <div class="footer-col">
          <h4 class="footer-heading">Contacto</h4>
          <ul class="footer-contact">
            <li>
              <div class="contact-icon"><i class="fas fa-user"></i></div>
              <div>
                <div class="contact-name">Roddy Ismael Ozaeta Cedeño</div>
                <div class="contact-role">Desarrollador</div>
              </div>
            </li>
            <li>
              <a href="tel:+593996434076" class="contact-link">
                <div class="contact-icon"><i class="fas fa-phone-alt"></i></div>
                <span>+593 996 434 076</span>
              </a>
            </li>
            <li>
              <a href="mailto:ozaetaroddy@gmail.com" class="contact-link">
                <div class="contact-icon"><i class="fas fa-envelope"></i></div>
                <span>ozaetaroddy@gmail.com</span>
              </a>
            </li>
          </ul>
        </div>
      </div>

      <!-- Divider -->
      <div class="footer-divider"></div>

      <!-- Footer bottom -->
      <div class="footer-bottom">
        <div class="footer-copy">
          <i class="far fa-copyright"></i>
          {{ year }} <strong>System Ozaet's Electronics</strong>. Todos los derechos reservados.
        </div>
        <div class="footer-location">
          <i class="fas fa-map-marker-alt"></i>
          Sistema de Gestión Empresarial — Ecuador
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { computed } from 'vue'

const year = computed(() => new Date().getFullYear())
</script>

<style scoped>
.footer-modern {
  background: linear-gradient(135deg, #0f1626 0%, #1a2332 50%, #2c3e50 100%);
  color: #ecf0f1;
  padding: 60px 0 24px;
  margin-top: 80px;
  position: relative;
  overflow: hidden;
  border-top: 4px solid var(--accent-color);
}

.footer-bg-pattern {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 20% 20%, rgba(52, 152, 219, 0.06) 0%, transparent 40%),
    radial-gradient(circle at 80% 80%, rgba(241, 196, 15, 0.04) 0%, transparent 40%);
  pointer-events: none;
}

.footer-main {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.5fr;
  gap: 40px;
  position: relative;
  z-index: 1;
}

/* ===== COLUMNAS ===== */
.footer-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.footer-col-brand {
  gap: 20px;
}

/* ===== BRAND ===== */
.footer-logo {
  display: flex;
  align-items: center;
  gap: 14px;
}
.logo-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 1.5rem;
  box-shadow: 0 8px 20px rgba(52, 152, 219, 0.3);
  flex-shrink: 0;
}
.logo-title {
  font-size: 1rem;
  font-weight: 800;
  color: #f1c40f;
  letter-spacing: 0.3px;
}
.logo-sub {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

.footer-description {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.6;
  margin: 0;
}

.footer-badges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.badge-pill {
  padding: 5px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  backdrop-filter: blur(6px);
}
.badge-pill i {
  color: #f1c40f;
}

/* ===== HEADINGS Y LINKS ===== */
.footer-heading {
  font-size: 0.85rem;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 4px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.footer-links li a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.65);
  text-decoration: none;
  transition: all var(--transition-fast);
}
.footer-links li a i {
  font-size: 0.65rem;
  color: #f1c40f;
  opacity: 0;
  transform: translateX(-4px);
  transition: all var(--transition-fast);
}
.footer-links li a:hover {
  color: #fff;
  padding-left: 4px;
}
.footer-links li a:hover i {
  opacity: 1;
  transform: translateX(0);
}

/* ===== CONTACTO ===== */
.footer-contact {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.footer-contact li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.contact-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(241, 196, 15, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f1c40f;
  font-size: 0.8rem;
  flex-shrink: 0;
}
.contact-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
}
.contact-role {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
}
.contact-link {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  text-decoration: none;
  transition: color var(--transition-fast);
}
.contact-link:hover {
  color: #f1c40f;
}

/* ===== DIVIDER Y BOTTOM ===== */
.footer-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  margin: 40px 0 20px;
}

.footer-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.4);
  position: relative;
  z-index: 1;
}
.footer-copy strong {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 600;
}
.footer-copy i,
.footer-location i {
  color: #f1c40f;
  margin-right: 4px;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 992px) {
  .footer-main {
    grid-template-columns: 1fr 1fr;
    gap: 32px;
  }
}

@media (max-width: 576px) {
  .footer-modern {
    padding: 40px 0 20px;
    margin-top: 40px;
  }
  .footer-main {
    grid-template-columns: 1fr;
    gap: 28px;
  }
  .footer-bottom {
    flex-direction: column;
    text-align: center;
  }
}
</style>