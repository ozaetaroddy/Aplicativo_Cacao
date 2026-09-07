// Guard para rutas que requieren autenticación
export const authGuard = (to, from, next) => {
  const token = localStorage.getItem('token');
  if (!token) {
    next('/login');
  } else {
    next();
  }
};

// Guard para administradores
export const adminGuard = (to, from, next) => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!token || user.rol !== 'admin') {
    next('/unauthorized');
  } else {
    next();
  }
};