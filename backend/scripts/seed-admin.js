// backend/scripts/seed-admin.js
// ============================================================
// Crea el primer usuario admin en una instalación limpia.
// ------------------------------------------------------------
// Uso:
//   node scripts/seed-admin.js --email=admin@miempresa.com --password=MiPass123 --nombre="Admin"
//   node scripts/seed-admin.js    (modo interactivo)
//   node scripts/seed-admin.js --force    (sobrescribe si ya existe)
//
// Si ya existe un admin en la BD, aborta (salvo --force).
// ============================================================
'use strict';

const bcrypt = require('bcryptjs');
const { run, log, ok, warn, err, preguntar, confirmar, auditar } = require('./_utils');

function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const BCRYPT_ROUNDS = envNum('BCRYPT_ROUNDS', 12);
const MIN_PASSWORD_LEN = envNum('MIN_PASSWORD_LENGTH', 8);
const ROLES_VALIDOS = ['admin', 'vendedor', 'contador'];

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(String(email || '').trim());
}

async function pedirDatos() {
  const nombre = (await preguntar('Nombre: ')).trim();
  const email = (await preguntar('Email: ')).trim().toLowerCase();
  const password = (await preguntar('Contraseña (mín ' + MIN_PASSWORD_LEN + '): ')).trim();

  return { nombre, email, password, rol: 'admin' };
}

async function main({ db, args }) {
  const { kv, dryRun, confirmado } = args;

  const nombre = kv.nombre || null;
  const email = kv.email || null;
  const password = kv.password || null;
  const rol = kv.rol || 'admin';
  const force = args.flags.has('force');

  // Modo interactivo si faltan datos críticos.
  let datos;
  if (!nombre || !email || !password) {
    log('🖊️  Modo interactivo');
    datos = await pedirDatos();
  } else {
    datos = {
      nombre: String(nombre).trim(),
      email: String(email).trim().toLowerCase(),
      password: String(password),
      rol
    };
  }

  // Validaciones
  if (!datos.nombre || datos.nombre.length < 2) {
    err('Nombre inválido (mín 2 caracteres)');
    process.exitCode = 1;
    return;
  }
  if (!validarEmail(datos.email)) {
    err(`Email inválido: ${datos.email}`);
    process.exitCode = 1;
    return;
  }
  if (datos.password.length < MIN_PASSWORD_LEN) {
    err(`Contraseña demasiado corta (mín ${MIN_PASSWORD_LEN})`);
    process.exitCode = 1;
    return;
  }
  if (!ROLES_VALIDOS.includes(datos.rol)) {
    err(`Rol inválido: ${datos.rol}. Válidos: ${ROLES_VALIDOS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const colUsuarios = db.collection('usuarios');

  // ¿Ya existe un admin?
  const adminsExistentes = await colUsuarios.countDocuments({ rol: 'admin', activo: true });
  if (adminsExistentes > 0 && !force) {
    err(`Ya existe(n) ${adminsExistentes} admin(s) activo(s) en la BD.`);
    err('Usa --force para crear otro de todas formas, o pasa por la UI de administración.');
    process.exitCode = 1;
    return;
  }

  // ¿Email ya usado?
  const existeEmail = await colUsuarios.findOne({ email: datos.email });
  if (existeEmail) {
    err(`El email ${datos.email} ya está registrado (id ${existeEmail._id}).`);
    process.exitCode = 1;
    return;
  }

  // Vista previa
  log('');
  log('─────────────────────────────────────────────');
  log(`👤 Nombre:    ${datos.nombre}`);
  log(`📧 Email:     ${datos.email}`);
  log(`🎭 Rol:       ${datos.rol}`);
  log(`🔑 Password:  ${'•'.repeat(datos.password.length)}`);
  log('─────────────────────────────────────────────');

  if (dryRun) {
    warn('Dry-run: no se creará el usuario');
    return;
  }

  const confirmadoFinal = await confirmar('¿Crear este usuario?', { confirmado });
  if (!confirmadoFinal) {
    warn('Cancelado por el usuario');
    return;
  }

  const hash = await bcrypt.hash(datos.password, BCRYPT_ROUNDS);
  const ahora = new Date();

  const doc = {
    nombre: datos.nombre,
    email: datos.email,
    password: hash,
    rol: datos.rol,
    telefono: '',
    activo: true,
    password_changed_at: ahora,
    createdAt: ahora,
    updatedAt: ahora
  };

  try {
    const r = await colUsuarios.insertOne(doc);
    ok(`Usuario creado con _id ${r.insertedId}`);

    await auditar(db, {
      accion: 'seed-admin',
      detalle: `Admin sembrado: ${datos.email}`,
      meta: { userId: r.insertedId, email: datos.email, rol: datos.rol }
    });

    log('');
    log('🎉 Ya puedes iniciar sesión con estas credenciales.');
    warn('Cambia la contraseña tras el primer login.');
  } catch (e) {
    if (e.code === 11000) {
      err('Ya existe un usuario con ese email (race condition).');
    } else {
      err(`Error: ${e.message}`);
    }
    process.exitCode = 1;
  }
}

run(main).catch(err => { console.error('❌ Error fatal:', err); process.exit(1); });