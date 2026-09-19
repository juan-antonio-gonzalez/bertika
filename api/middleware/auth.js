// Autenticacion JWT para la API.
// expone req.user = { id, email, rol, tecnico_id, cliente_id }
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

// En produccion JWT_SECRET debe estar definido (fail-fast al firmar si no).
// En desarrollo sin .env se genera un secreto efimero: los tokens dejan de
// validar tras reiniciar el proceso, pero nunca se firma con clave vacia.
const ENV_SECRET = process.env.JWT_SECRET;

// En produccion no se admite arrancar sin secreto: falla rapido y claro.
if (!ENV_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET no definido en produccion. Configuralo en /etc/bertika/bertika-api.env');
}

export const SECRET = ENV_SECRET
  || randomBytes(32).toString('hex');

if (!ENV_SECRET) {
  console.warn('[auth] JWT_SECRET no definido: se usa un secreto efimero (solo para desarrollo local).');
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, rol: user.rol, tecnico_id: user.tecnico_id, cliente_id: user.cliente_id },
    SECRET,
    { expiresIn: '12h', issuer: 'bertika-api', audience: 'bertika-web', algorithm: 'HS256' }
  );
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Autenticacion requerida' });
  try {
    const payload = jwt.verify(token, SECRET, { issuer: 'bertika-api', audience: 'bertika-web', algorithms: ['HS256'] });
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