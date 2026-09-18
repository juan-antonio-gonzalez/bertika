// Generacion secuencial de IDs con prefijo usando la tabla contadores.
// Uso: const id = await nextId('ord') // -> 'ord_100', incrementa a 101
import { tx } from './db.js';

export async function nextId(prefix) {
  return tx(async (client) => {
    const r = await client.query(
      `INSERT INTO contadores (nombre, valor) VALUES ($1, 100)
       ON CONFLICT (nombre) DO UPDATE SET valor = contadores.valor + 1
       RETURNING valor`,
      [prefix]
    );
    return `${prefix}_${r.rows[0].valor}`;
  });
}