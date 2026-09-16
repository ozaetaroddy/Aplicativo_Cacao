// backend/utils/circuitBreaker.js
// ============================================================
// Circuit Breaker (in-memory)
// ------------------------------------------------------------
// Protege llamadas a servicios externos que fallan seguido
// (scraping, APIs de terceros). Aprende del comportamiento y
// deja de insistir hasta que el servicio se recupere.
//
// Estados:
//   CLOSED    → pasa la llamada, cuenta fallos consecutivos.
//   OPEN      → rechaza inmediatamente durante `cooldownMs`.
//   HALF_OPEN → permite EXACTAMENTE 1 llamada de prueba tras
//               el cooldown. Si pasa → CLOSED. Si falla → OPEN.
//
// Uso básico:
//   const cb = new CircuitBreaker({ nombre: 'mi-api', umbralFallos: 5 });
//   const data = await cb.ejecutar(() => fetch('...'));
//
// Uso con registro compartido:
//   const cb = getBreaker('mi-api', { umbralFallos: 5 });
//   const data = await cb.ejecutar(() => fetch('...'));
//
// Compatibilidad:
//   - La API original (métodos y propiedades) se mantiene intacta.
//   - Los nuevos campos de `stats()` son adicionales.
// ============================================================
'use strict';

// ============================================================
// ESTADOS
// ============================================================
const ESTADOS = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
});

// ============================================================
// EVENTOS
// ============================================================
const EVENTOS = Object.freeze({
  OPEN: 'open',
  CLOSE: 'close',
  HALF_OPEN: 'half-open',
  REJECT: 'reject',
  SUCCESS: 'success',
  FAILURE: 'failure',
  TIMEOUT: 'timeout',
  RESET: 'reset'
});

// ============================================================
// CONFIGURACIÓN (env-driven)
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  umbralFallosDefault: envNum('CB_UMBRAL_FALLOS', 5),
  cooldownMsDefault:   envNum('CB_COOLDOWN_MS', 10 * 60 * 1000),
  timeoutMsDefault:    envNum('CB_TIMEOUT_MS', 15_000),

  /**
   * Jitter aplicado al cooldown: cooldown * (1 ± jitterRatio).
   * Evita que múltiples workers reabran a la vez.
   */
  jitterRatio: 0.2,

  /** Máx. duración de una ejecución (sanity check). */
  duracionMaximaMs: 10 * 60 * 1000
});

// ============================================================
// HELPERS INTERNOS
// ============================================================

/** Valida que un valor sea entero >= min (con fallback si `undefined`). */
function validarEnteroPositivo(valor, nombre, min = 1) {
  if (valor === undefined || valor === null) return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min) {
    throw new TypeError(`${nombre} debe ser un entero >= ${min} (recibido: ${valor})`);
  }
  return n;
}

/** Genera un error tipado para "circuito abierto". */
function crearErrorCircuitoAbierto(nombre, segundosRestantes) {
  const err = new Error(
    `Circuito abierto para "${nombre}". Reintente en ${segundosRestantes}s.`
  );
  err.codigo = 'CIRCUIT_OPEN';
  err.retryAfter = segundosRestantes;
  err.circuitBreaker = nombre;
  return err;
}

/** Genera un error tipado para "timeout". */
function crearErrorTimeout(nombre, ms) {
  const err = new Error(
    `Timeout en "${nombre}" después de ${ms}ms`
  );
  err.codigo = 'CIRCUIT_TIMEOUT';
  err.timeoutMs = ms;
  err.circuitBreaker = nombre;
  return err;
}

// ============================================================
// CLASE PRINCIPAL
// ============================================================
class CircuitBreaker {
  /**
   * @param {object} opts
   * @param {string} [opts.nombre='sin-nombre']
   * @param {number} [opts.umbralFallos=5]     Fallos consecutivos antes de OPEN.
   * @param {number} [opts.cooldownMs=600000]  Tiempo en OPEN antes de HALF_OPEN.
   * @param {number} [opts.timeoutMs=15000]    Timeout por llamada (0 = sin límite).
   * @param {(evento: object) => void} [opts.onEvent]  Callback de eventos.
   */
  constructor({ nombre, umbralFallos, cooldownMs, timeoutMs, onEvent } = {}) {
    // Validaciones (solo si se pasaron explícitamente).
    const nombreFinal = (nombre === undefined || nombre === null)
      ? 'sin-nombre'
      : String(nombre).trim();
    if (!nombreFinal) {
      throw new TypeError('nombre debe ser un string no vacío');
    }

    const umbral = validarEnteroPositivo(umbralFallos, 'umbralFallos', 1)
      ?? CONFIG.umbralFallosDefault;
    const cooldown = validarEnteroPositivo(cooldownMs, 'cooldownMs', 1)
      ?? CONFIG.cooldownMsDefault;

    let timeout = CONFIG.timeoutMsDefault;
    if (timeoutMs !== undefined && timeoutMs !== null) {
      const n = Number(timeoutMs);
      if (!Number.isFinite(n) || n < 0) {
        throw new TypeError('timeoutMs debe ser un número >= 0');
      }
      timeout = Math.floor(n);
    }

    // ---- Propiedades públicas (compat con la versión anterior) ----
    this.nombre = nombreFinal;
    this.umbralFallos = umbral;
    this.cooldownMs = cooldown;
    this.timeoutMs = timeout;

    this.estado = ESTADOS.CLOSED;
    this.fallosConsecutivos = 0;
    this.abiertoDesde = null;
    this.ultimoError = null;

    // ---- Estado interno ----
    this._cooldownActualMs = null;       // cooldown con jitter vigente
    this.probeEnCurso = false;           // HALF_OPEN con 1 probe en vuelo
    this._listeners = [];                // suscriptores de eventos

    this._metricas = {
      llamadas: 0,
      exitos: 0,
      fallos: 0,
      rechazos: 0,
      aperturas: 0,
      ultimoExitoEn: null,
      ultimoFalloEn: null,
      ultimaAperturaEn: null,
      ultimaDuracionMs: null
    };

    // Registrar `onEvent` inicial si se pasó.
    if (typeof onEvent === 'function') {
      this.on(onEvent);
    }
  }

  // ==========================================================
  // SUSCRIPCIÓN DE EVENTOS
  // ==========================================================
  /**
   * Suscribe un callback a los eventos del breaker.
   * @param {(evento: object) => void} callback
   * @returns {() => void} función para desuscribirse
   */
  on(callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }
    this._listeners.push(callback);
    return () => {
      const idx = this._listeners.indexOf(callback);
      if (idx >= 0) this._listeners.splice(idx, 1);
    };
  }

  /**
   * Emite un evento a todos los suscriptores.
   * NUNCA rompe el flujo principal.
   * @private
   */
  _emit(evento, info = {}) {
    if (this._listeners.length === 0) return;
    const payload = {
      evento,
      nombre: this.nombre,
      estado: this.estado,
      fallosConsecutivos: this.fallosConsecutivos,
      ...info
    };
    for (const cb of this._listeners) {
      try { cb(payload); } catch { /* nunca romper por un listener defectuoso */ }
    }
  }

  // ==========================================================
  // TRANSICIÓN DE ESTADO
  // ==========================================================
  /**
   * Transiciona al nuevo estado (si es distinto) y emite el evento.
   * @private
   */
  _transicionar(nuevoEstado) {
    if (this.estado === nuevoEstado) return;

    const estadoAnterior = this.estado;
    this.estado = nuevoEstado;

    if (nuevoEstado === ESTADOS.OPEN) {
      this.abiertoDesde = Date.now();
      this._cooldownActualMs = this._cooldownEfectivo();
      this._metricas.aperturas++;
      this._metricas.ultimaAperturaEn = this.abiertoDesde;
      this._emit(EVENTOS.OPEN, { estadoAnterior });
    } else if (nuevoEstado === ESTADOS.HALF_OPEN) {
      this._emit(EVENTOS.HALF_OPEN, { estadoAnterior });
    } else if (nuevoEstado === ESTADOS.CLOSED) {
      this.abiertoDesde = null;
      this._cooldownActualMs = null;
      this._emit(EVENTOS.CLOSE, { estadoAnterior });
    }
  }

  /**
   * Cooldown efectivo con jitter aleatorio.
   * @private
   */
  _cooldownEfectivo() {
    const jitter = (Math.random() * 2 - 1) * CONFIG.jitterRatio;
    return Math.round(this.cooldownMs * (1 + jitter));
  }

  // ==========================================================
  // CONSULTA DE ESTADO
  // ==========================================================
  /**
   * Indica si se puede intentar una llamada.
   *
   * ⚠️  Este método puede MUTAR el estado (OPEN → HALF_OPEN cuando
   *     el cooldown expira). Para consultar sin mutar, usar el
   *     getter `estadoActual`.
   *
   * @returns {boolean}
   */
  puedeIntentar() {
    if (this.estado === ESTADOS.CLOSED) return true;

    if (this.estado === ESTADOS.OPEN) {
      const cooldownActual = this._cooldownActualMs || this.cooldownMs;
      const transcurrido = Date.now() - (this.abiertoDesde || 0);
      if (transcurrido >= cooldownActual) {
        this._transicionar(ESTADOS.HALF_OPEN);
        return true;
      }
      return false;
    }

    // HALF_OPEN: solo 1 probe a la vez.
    return !this.probeEnCurso;
  }

  /**
 * Segundos restantes hasta poder reintentar (null si no aplica).
 *
 * ⚠️  Reportamos el cooldown **nominal**, no el jittered. El jitter
 *     interno puede alargar/acortar el tiempo real, pero para el
 *     usuario mostramos un valor estable y predecible.
 *
 * @returns {number|null}
 */
get segundosHastaRetry() {
  if (this.estado !== ESTADOS.OPEN) return null;
  if (!this.abiertoDesde) return null;
  const transcurrido = Date.now() - this.abiertoDesde;
  const restante = this.cooldownMs - transcurrido;
  return Math.max(0, Math.ceil(restante / 1000));
}

  /**
   * Estado actual sin mutar (refleja OPEN→HALF_OPEN si ya expiró).
   * @returns {string}
   */
  get estadoActual() {
    if (this.estado === ESTADOS.OPEN && this.segundosHastaRetry === 0) {
      return ESTADOS.HALF_OPEN;
    }
    return this.estado;
  }

  // ==========================================================
  // REGISTRO DE RESULTADOS
  // ==========================================================
  /**
   * Registra un éxito. Cierra el circuito si estaba abierto.
   */
  registrarExito() {
    this.fallosConsecutivos = 0;
    this.ultimoError = null;
    if (this.estado !== ESTADOS.CLOSED) {
      this._transicionar(ESTADOS.CLOSED);
    }
  }

  /**
   * Registra un fallo. Abre el circuito si se supera el umbral.
   * @param {Error|*} err
   */
  registrarFallo(err) {
    this.fallosConsecutivos++;
    this.ultimoError = err?.message || String(err);
    this._metricas.ultimoFalloEn = Date.now();

    // HALF_OPEN: cualquier fallo reabre inmediatamente.
    if (this.estado === ESTADOS.HALF_OPEN) {
      this._transicionar(ESTADOS.OPEN);
      return;
    }

    // CLOSED: abrir si se supera el umbral.
    if (this.fallosConsecutivos >= this.umbralFallos) {
      this._transicionar(ESTADOS.OPEN);
    }
  }

  // ==========================================================
  // RESET MANUAL
  // ==========================================================
  /**
   * Fuerza el circuito a CLOSED y limpia contadores.
   * Útil para endpoints de administración.
   */
  reset() {
    this.fallosConsecutivos = 0;
    this.ultimoError = null;
    this.probeEnCurso = false;
    this._transicionar(ESTADOS.CLOSED);
    this._emit(EVENTOS.RESET);
  }

  // ==========================================================
  // EJECUCIÓN PROTEGIDA
  // ==========================================================
  /**
   * Ejecuta `fn` protegido por el circuito.
   *
   * @template T
   * @param {() => T | Promise<T>} fn
   * @returns {Promise<T>}
   * @throws {Error} con `codigo='CIRCUIT_OPEN'` si el circuito está abierto.
   * @throws {Error} el error original de `fn` si falla.
   * @throws {Error} con `codigo='CIRCUIT_TIMEOUT'` si excede `timeoutMs`.
   */
  async ejecutar(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('ejecutar espera una función');
    }

    // 1. ¿Podemos intentar?
    if (!this.puedeIntentar()) {
      this._metricas.rechazos++;
      this._emit(EVENTOS.REJECT, { retryAfter: this.segundosHastaRetry });
      throw crearErrorCircuitoAbierto(this.nombre, this.segundosHastaRetry || 0);
    }

    // 2. Marcar probe si estamos en HALF_OPEN.
    const esProbe = this.estado === ESTADOS.HALF_OPEN;
    if (esProbe) this.probeEnCurso = true;

    this._metricas.llamadas++;
    const inicio = Date.now();

    try {
      // 3. Invocar `fn` (soporta sync y async) con timeout opcional.
      const promesa = Promise.resolve().then(() => fn());
      const resultado = this.timeoutMs > 0
        ? await this._conTimeout(promesa, this.timeoutMs)
        : await promesa;

      // 4. Éxito.
      const duracionMs = Date.now() - inicio;
      this._metricas.exitos++;
      this._metricas.ultimoExitoEn = Date.now();
      this._metricas.ultimaDuracionMs = duracionMs;
      this._emit(EVENTOS.SUCCESS, { duracionMs });
      this.registrarExito();

      return resultado;
    } catch (err) {
      // 5. Fallo.
      const duracionMs = Date.now() - inicio;
      this._metricas.fallos++;
      this._metricas.ultimaDuracionMs = duracionMs;

      const esTimeout = err && err.codigo === 'CIRCUIT_TIMEOUT';
      if (esTimeout) {
        this._emit(EVENTOS.TIMEOUT, { duracionMs });
      }
      this._emit(EVENTOS.FAILURE, {
        duracionMs,
        err: err?.message || String(err)
      });

      this.registrarFallo(err);
      throw err;
    } finally {
      // 6. Siempre limpiar el flag de probe.
      if (esProbe) this.probeEnCurso = false;
    }
  }

  /**
   * Envuelve una promesa con timeout.
   * La promesa original sigue corriendo en background pero su
   * rechazo queda atrapado (no hay unhandled rejection).
   * @private
   */
  _conTimeout(promesa, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(crearErrorTimeout(this.nombre, ms));
      }, ms);
      if (timer.unref) timer.unref();

      Promise.resolve(promesa).then(
        v => { clearTimeout(timer); resolve(v); },
        e => { clearTimeout(timer); reject(e); }
      );
    });
  }

  // ==========================================================
  // ESTADÍSTICAS
  // ==========================================================
  /**
   * Snapshot del estado actual.
   * Mantiene el shape de la versión anterior + campos nuevos.
   */
  stats() {
    return {
      // ---- Campos originales ----
      nombre: this.nombre,
      estado: this.estado,
      fallosConsecutivos: this.fallosConsecutivos,
      umbralFallos: this.umbralFallos,
      abiertoDesde: this.abiertoDesde,
      ultimoError: this.ultimoError,

      // ---- Extendidos ----
      estadoActual: this.estadoActual,
      cooldownMs: this.cooldownMs,
      timeoutMs: this.timeoutMs,
      probeEnCurso: this.probeEnCurso,
      segundosHastaRetry: this.segundosHastaRetry,
      metricas: { ...this._metricas }
    };
  }
}

// ============================================================
// REGISTRO GLOBAL
// ------------------------------------------------------------
// Permite compartir instancias entre módulos sin acoplarlos.
// ============================================================
const _registro = new Map();

/**
 * Devuelve (o crea) el breaker registrado bajo `nombre`.
 * Si ya existe, se devuelve el mismo, IGNORANDO `opts`.
 *
 * @param {string} nombre
 * @param {object} [opts]
 * @returns {CircuitBreaker}
 */
function getBreaker(nombre, opts = {}) {
  const key = String(nombre || '').trim();
  if (!key) throw new TypeError('getBreaker requiere un nombre');

  if (_registro.has(key)) return _registro.get(key);

  const cb = new CircuitBreaker({ nombre: key, ...opts });
  _registro.set(key, cb);
  return cb;
}

/** Snapshot de todos los breakers registrados. */
function getAllStats() {
  return [..._registro.values()].map(cb => cb.stats());
}

/** Resetea todos los breakers registrados. */
function resetAll() {
  for (const cb of _registro.values()) {
    try { cb.reset(); } catch { /* noop */ }
  }
}

/** Elimina un breaker del registro (útil en tests). */
function removeBreaker(nombre) {
  return _registro.delete(String(nombre || ''));
}

/** Elimina TODOS los breakers del registro (útil en tests). */
function clearRegistry() {
  _registro.clear();
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  CircuitBreaker,
  ESTADOS,
  EVENTOS,
  getBreaker,
  getAllStats,
  resetAll,
  removeBreaker,
  clearRegistry
};

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._validarEnteroPositivo = validarEnteroPositivo;
module.exports._crearErrorCircuitoAbierto = crearErrorCircuitoAbierto;
module.exports._crearErrorTimeout = crearErrorTimeout;