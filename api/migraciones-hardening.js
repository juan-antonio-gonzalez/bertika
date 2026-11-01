// Migraciones nuevas, separadas del baseline histórico.
// Cada una se registra en schema_migrations y es idempotente.
import { query, one } from './db.js';

export async function migrarHardening() {
  console.log('[hardening] inicio');
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    aplicada_en TIMESTAMPTZ DEFAULT now()
  )`);
  const hecha = await one("SELECT id FROM schema_migrations WHERE id = '003_rate_limit_store'");
  if (hecha) return;
  await query(`CREATE TABLE IF NOT EXISTS rate_limit_hits (
    clave TEXT PRIMARY KEY,
    conteo INTEGER NOT NULL DEFAULT 0,
    expira TIMESTAMPTZ NOT NULL
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_rate_limit_expira ON rate_limit_hits (expira)');
  await query("INSERT INTO schema_migrations (id) VALUES ('003_rate_limit_store') ON CONFLICT DO NOTHING");
  console.log('[hardening] fin');
}
