module.exports = (err, req, res, next) => {
  console.error('❌ Error global:', err.stack || err.message);
  const status = err.status || 500;
  const message = err.message || 'Error interno del servidor';
  res.status(status).json({ error: message });
};