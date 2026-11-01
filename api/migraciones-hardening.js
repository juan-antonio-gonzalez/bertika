// Migraciones nuevas, separadas del baseline histórico.
// Cada una se registra en schema_migrations y es idempotente.
import { query, one } from './db.js';

export async function migrarHardening() {
  console.log('[hardening] inicio');
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    aplicada_en TIMESTAMPTZ DEFAULT now()
  )`);
  const hecha = await one("SELECT id FROM schema_migrations WHERE id = '004_adjuntos_campo'");
  if (hecha) return;
  await query('ALTER TABLE lista_adjuntos ADD COLUMN IF NOT EXISTS campo_id TEXT');
  await query('ALTER TABLE lista_adjuntos ADD COLUMN IF NOT EXISTS registro_id TEXT');
  await query('CREATE INDEX IF NOT EXISTS idx_lista_adjuntos_registro ON lista_adjuntos (registro_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_lista_adjuntos_campo ON lista_adjuntos (campo_id)');
  await query(`CREATE TABLE IF NOT EXISTS rate_limit_hits (
    clave TEXT PRIMARY KEY,
    conteo INTEGER NOT NULL DEFAULT 0,
    expira TIMESTAMPTZ NOT NULL
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_rate_limit_expira ON rate_limit_hits (expira)');
  await query("INSERT INTO schema_migrations (id) VALUES ('003_rate_limit_store') ON CONFLICT DO NOTHING");
  await query("INSERT INTO schema_migrations (id) VALUES ('004_adjuntos_campo') ON CONFLICT DO NOTHING");
  console.log('[hardening] fin');
}
