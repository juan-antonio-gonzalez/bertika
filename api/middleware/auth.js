// Autenticacion JWT para la API.
// expone req.user = { id, email, rol, tecnico_id, cliente_id }
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, rol: user.rol, tecnico_id: user.tecnico_id, cliente_id: user.cliente_id },
    SECRET,
    { expiresIn: '12h' }
  );
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Autenticacion requerida' });
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

export function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Autenticacion requerida' });
    if (!roles.includes(req.user.rol)) return res.status(403).json({ error: 'Sin permisos para esta accion' });
    return next();
  };
}