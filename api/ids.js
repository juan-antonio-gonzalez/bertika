// Generacion secuencial de IDs con prefijo usando la tabla contadores.
//
// Uso suelto:      const id = await nextId('ord')              -> 'ord_100'
// Dentro de una tx: const id = await nextId('ord', client)     -> reutiliza la conexion
//
// El segundo parametro existe para NO abrir una segunda conexion del pool
// dentro de una transaccion abierta: con el pool en 10 conexiones, varias
// operaciones simultaneas se quedaban sin conexiones y el servicio se colgaba.
import { tx } from './db.js';

const SQL = `INSERT INTO contadores (nombre, valor) VALUES ($1, 100)
   ON CONFLICT (nombre) DO UPDATE SET valor = contadores.valor + 1
   RETURNING valor`;

export async function nextId(prefix, client = null) {
  if (client && typeof client.query === 'function') {
    const r = await client.query(SQL, [prefix]);
    return `${prefix}_${r.rows[0].valor}`;
  }
  return tx(async (c) => {
    const r = await c.query(SQL, [prefix]);
    return `${prefix}_${r.rows[0].valor}`;
  });
}
