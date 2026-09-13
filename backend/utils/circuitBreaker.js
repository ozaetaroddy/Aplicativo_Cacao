// backend/utils/circuitBreaker.js
// Circuit breaker simple en memoria para proteger llamadas a servicios externos
// que fallan seguido (scraping, APIs de terceros).
//
// Estados:
//   CLOSED    → pasa la llamada, cuenta fallos
//   OPEN      → rechaza inmediatamente durante `cooldownMs`
//   HALF_OPEN → permite 1 llamada de prueba tras el cooldown

const ESTADOS = Object.freeze({ CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' });

class CircuitBreaker {
  constructor({ nombre, umbralFallos = 5, cooldownMs = 10 * 60 * 1000 } = {}) {
    this.nombre = nombre || 'sin-nombre';
    this.umbralFallos = umbralFallos;
    this.cooldownMs = cooldownMs;

    this.estado = ESTADOS.CLOSED;
    this.fallosConsecutivos = 0;
    this.abiertoDesde = null;
    this.ultimoError = null;
  }

  puedeIntentar() {
    if (this.estado === ESTADOS.CLOSED) return true;

    if (this.estado === ESTADOS.OPEN) {
      const transcurrido = Date.now() - this.abiertoDesde;
      if (transcurrido >= this.cooldownMs) {
        this.estado = ESTADOS.HALF_OPEN;
        return true;
      }
      return false;
    }

    // HALF_OPEN: solo una llamada de prueba a la vez
    return true;
  }

  registrarExito() {
    this.fallosConsecutivos = 0;
    this.estado = ESTADOS.CLOSED;
    this.abiertoDesde = null;
    this.ultimoError = null;
  }

  registrarFallo(err) {
    this.fallosConsecutivos++;
    this.ultimoError = err?.message || String(err);

    if (this.fallosConsecutivos >= this.umbralFallos) {
      this.estado = ESTADOS.OPEN;
      this.abiertoDesde = Date.now();
    } else if (this.estado === ESTADOS.HALF_OPEN) {
      // Falló la prueba, vuelve a OPEN
      this.estado = ESTADOS.OPEN;
      this.abiertoDesde = Date.now();
    }
  }

  async ejecutar(fn) {
    if (!this.puedeIntentar()) {
      const segRestantes = Math.ceil((this.cooldownMs - (Date.now() - this.abiertoDesde)) / 1000);
      const err = new Error(
        `Circuito abierto para "${this.nombre}". Reintente en ${segRestantes}s.`
      );
      err.codigo = 'CIRCUIT_OPEN';
      err.retryAfter = segRestantes;
      throw err;
    }

    try {
      const resultado = await fn();
      this.registrarExito();
      return resultado;
    } catch (err) {
      this.registrarFallo(err);
      throw err;
    }
  }

  stats() {
    return {
      nombre: this.nombre,
      estado: this.estado,
      fallosConsecutivos: this.fallosConsecutivos,
      umbralFallos: this.umbralFallos,
      abiertoDesde: this.abiertoDesde,
      ultimoError: this.ultimoError
    };
  }
}

module.exports = { CircuitBreaker, ESTADOS };