// Store de rate limit compartido en PostgreSQL.
//
// Se usa solo si RATE_LIMIT_STORE=postgres. Así varias instancias de la API
// comparten el mismo contador sin agregar Redis como dependencia obligatoria.
// El modo por defecto sigue siendo memoria (una sola instancia).
import { query } from './db.js';

export class PostgresRateLimitStore {
  constructor(prefijo = 'rl:') {
    this.prefijo = prefijo;
    this.windowMs = 60000;
    this.limpiador = null;
  }

  init(options) {
    this.windowMs = Number(options?.windowMs) || 60000;
    if (this.limpiador) clearInterval(this.limpiador);
    this.limpiador = setInterval(() => {
      query('DELETE FROM rate_limit_hits WHERE expira < now()').catch(() => {});
    }, Math.max(this.windowMs, 60000));
    this.limpiador.unref?.();
  }

  async increment(key) {
    const clave = `${this.prefijo}${key}`;
    const expira = new Date(Date.now() + this.windowMs);
    const filas = await query(
      `INSERT INTO rate_limit_hits (clave, conteo, expira)
       VALUES ($1, 1, $2)
       ON CONFLICT (clave) DO UPDATE SET
         conteo = CASE WHEN rate_limit_hits.expira <= now() THEN 1 ELSE rate_limit_hits.conteo + 1 END,
         expira = CASE WHEN rate_limit_hits.expira <= now() THEN EXCLUDED.expira ELSE rate_limit_hits.expira END
       RETURNING conteo, expira`,
      [clave, expira]
    );
    const fila = filas[0];
    return { totalHits: Number(fila.conteo), resetTime: new Date(fila.expira) };
  }

  async decrement(key) {
    await query(
      `UPDATE rate_limit_hits SET conteo = GREATEST(0, conteo - 1)
        WHERE clave = $1 AND expira > now()`,
      [`${this.prefijo}${key}`]
    );
  }

  async resetKey(key) {
    await query('DELETE FROM rate_limit_hits WHERE clave = $1', [`${this.prefijo}${key}`]);
  }

  async get(key) {
    const filas = await query(
      'SELECT conteo, expira FROM rate_limit_hits WHERE clave = $1 AND expira > now()',
      [`${this.prefijo}${key}`]
    );
    if (!filas[0]) return undefined;
    return { totalHits: Number(filas[0].conteo), resetTime: new Date(filas[0].expira) };
  }
}

export function crearStoreRateLimit(prefijo) {
  return process.env.RATE_LIMIT_STORE === 'postgres'
    ? new PostgresRateLimitStore(prefijo)
    : undefined;
}
