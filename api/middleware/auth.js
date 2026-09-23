// Autenticacion JWT para la API.
// expone req.user = { id, email, rol, tecnico_id, cliente_id }
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { one } from '../db.js';
import { permisosEfectivos, tienePermiso } from '../../src/data/permisos.js';

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

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Autenticacion requerida' });
  let payload;
  try {
    payload = jwt.verify(token, SECRET, { issuer: 'bertika-api', audience: 'bertika-web', algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
  // El token por si solo no alcanza: se relee el usuario para que una baja o un
  // cambio de permisos tenga efecto en el acto (y no 12 h despues).
  try {
    const u = await one('SELECT activo, rol, permisos, tecnico_id, cliente_id FROM usuarios WHERE id = $1', [payload.sub]);
    if (!u || u.activo !== true) {
      return res.status(401).json({ error: 'Tu acceso fue desactivado. Pedile al administrador que lo reactive.' });
    }
    // Se resuelven los permisos EFECTIVOS (plantilla del rol + lo que el
    // administrador haya marcado) en cada request: asi un cambio de permisos
    // rige al instante y no hay que esperar a que venza el token.
    req.user = {
      ...payload,
      rol: u.rol,
      tecnico_id: u.tecnico_id,
      cliente_id: u.cliente_id,
      permisos: permisosEfectivos({ rol: u.rol, permisos: u.permisos }),
    };
  } catch (e) {
    console.error('[auth] no se pudo verificar el usuario:', e.message);
    return res.status(503).json({ error: 'No se pudo verificar el acceso. Probá de nuevo en unos segundos.' });
  }
  return next();
}

export function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Autenticacion requerida' });
    if (!roles.includes(req.user.rol)) return res.status(403).json({ error: 'Sin permisos para esta accion' });
    return next();
  };
}

// Exige un permiso del catalogo (ver src/data/permisos.js). Se puede pasar mas
// de una clave: alcanza con tener una.
//
// El administrador siempre pasa (sus permisos efectivos son todos true), asi no
// se puede auto-bloquear ni dejar el sistema sin administracion.
export function permisoRequerido(...claves) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Autenticacion requerida' });
    if (!claves.some((c) => tienePermiso(req.user.permisos, c))) {
      return res.status(403).json({
        error: 'Tu usuario no tiene permiso para esta acción. Pedile al administrador que te lo habilite.',
      });
    }
    return next();
  };
}