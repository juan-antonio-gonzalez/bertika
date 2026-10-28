// Politica de contraseñas de Bertika. La usan la API (para validar de verdad)
// y el panel (para mostrar el medidor y generar claves fuertes).
//
// Reglas: 12 caracteres minimo, 72 maximo (limite de bcrypt), al menos 3 de
// 4 clases (minuscula, mayuscula, numero, simbolo) salvo que tenga 16+ y 2
// clases, sin datos personales, sin claves comunes y sin repeticiones largas.

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 72;

const COMUNES = new Set([
  '123456', '12345678', '123456789', '1234567890', 'password', 'password1',
  'qwerty', 'qwerty123', 'abc123', 'admin', 'admin123', 'administrador',
  'bertika', 'bertika123', 'bertika2024', 'bertika2025', 'bertika2026',
  'bateria', 'baterias', 'forbat', 'amsa', 'taller', 'iloveyou', 'welcome',
  'letmein', 'monkey', 'dragon', 'football', 'master', 'sunshine', 'princess',
  'contraseña', 'contrasena', 'clave', 'clave123', 'acceso', 'acceso123',
]);

const SECUENCIAS = ['1234', '12345', '123456', 'abcdef', 'qwerty', 'asdf', 'zxcv', '0000', '1111'];

function normalizar(v) {
  return String(v || '').toLowerCase().replace(/\s+/g, '');
}

// Devuelve un mensaje de error o null si la clave es aceptable.
export function validarPassword(password, { email = '', nombre = '' } = {}) {
  if (typeof password !== 'string' || !password) return 'La contraseña es obligatoria.';
  if (password.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX) return `La contraseña no puede superar los ${PASSWORD_MAX} caracteres.`;

  const p = normalizar(password);
  if (COMUNES.has(p)) return 'Esa contraseña es demasiado común. Elegí otra.';
  if (/(bertika|forbat|amsa|bateria|batería)/i.test(password)) {
    return 'No uses el nombre de la marca ni de la empresa en la contraseña.';
  }
  if (SECUENCIAS.some((s) => p.includes(s))) return 'Evitá secuencias como 1234, abcdef o qwerty.';
  if (/(.)\1{3,}/.test(password)) return 'Evitá cuatro o más caracteres iguales seguidos.';

  const local = normalizar(String(email).split('@')[0]);
  if (local.length >= 3 && p.includes(local)) return 'La contraseña no puede contener tu email.';
  const n = normalizar(nombre);
  if (n.length >= 3 && p.includes(n)) return 'La contraseña no puede contener tu nombre.';

  const clases = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (password.length < 16 && clases < 3) {
    return 'Usá al menos 3 clases: minúsculas, mayúsculas, números o símbolos (o una clave de 16+ caracteres).';
  }
  if (password.length >= 16 && clases < 2) {
    return 'Una clave larga igual necesita al menos dos clases de caracteres.';
  }
  return null;
}

// 0 = muy débil, 4 = muy fuerte. Se usa para la barra del panel.
export function fortalezaPassword(password, { email = '', nombre = '' } = {}) {
  if (!password) return { score: 0, label: 'Vacía', color: 'var(--line)' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  const clases = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (clases >= 3) score += 1;
  if (clases === 4) score += 1;
  if (new Set(password).size >= Math.min(10, password.length)) score += 1;
  if (/(.)\1{3,}/.test(password)) score -= 1;
  if (SECUENCIAS.some((s) => normalizar(password).includes(s))) score -= 2;
  if (validarPassword(password, { email, nombre })) score = Math.min(score, 2);
  score = Math.max(0, Math.min(4, Math.round(score * 4 / 6)));
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'];
  const colors = ['var(--red)', 'var(--orange)', 'var(--amber)', 'var(--blue)', 'var(--green)'];
  return { score, label: labels[score], color: colors[score] };
}

// Genera una clave aleatoria criptograficamente segura y que cumple la politica.
export function generarPasswordSegura(length = 18) {
  const letras = 'abcdefghijkmnopqrstuvwxyz';
  const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numeros = '23456789';
  const simbolos = '!@#$%&*+-=?';
  const todos = letras + mayus + numeros + simbolos;
  const cryptoObj = globalThis.crypto;
  const azar = (max) => {
    if (cryptoObj?.getRandomValues) {
      const a = new Uint32Array(1);
      cryptoObj.getRandomValues(a);
      return a[0] % max;
    }
    return Math.floor(Math.random() * max);
  };
  const pick = (s) => s[azar(s.length)];
  let out = '';
  // Garantiza una de cada clase y completa con el resto.
  out += pick(letras) + pick(mayus) + pick(numeros) + pick(simbolos);
  while (out.length < length) out += pick(todos);
  const chars = out.split('');
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = azar(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
