// Migraciones nuevas, separadas del baseline histórico.
// Cada una se registra en schema_migrations y es idempotente.
import { query, one } from './db.js';

export async function migrarHardening() {
  console.log('[hardening] inicio');
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    aplicada_en TIMESTAMPTZ DEFAULT now()
  )`);
  const hecha = await one("SELECT id FROM schema_migrations WHERE id = '005_prospectos'");
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
  await query(`CREATE TABLE IF NOT EXISTS prospecto_estados (
    clave TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    color TEXT DEFAULT 'gray',
    orden INTEGER DEFAULT 0,
    activo BOOLEAN DEFAULT TRUE
  )`);
  const estados = [
    ['nuevo', 'Nuevo', 'blue', 10],
    ['contactado', 'Contactado', 'amber', 20],
    ['interesado', 'Interesado', 'purple', 30],
    ['cotizado', 'Cotizado', 'orange', 40],
    ['negociacion', 'Negociación', 'yellow', 50],
    ['ganado', 'Ganado', 'green', 60],
    ['perdido', 'Perdido', 'red', 70],
    ['convertido', 'Convertido a cliente', 'teal', 80],
  ];
  for (const [clave, nombre, color, orden] of estados) {
    await query('INSERT INTO prospecto_estados (clave, nombre, color, orden) VALUES ($1,$2,$3,$4) ON CONFLICT (clave) DO NOTHING', [clave, nombre, color, orden]);
  }
  await query(`CREATE TABLE IF NOT EXISTS prospectos (
    id TEXT PRIMARY KEY,
    empresa TEXT NOT NULL,
    empresa_normalizada TEXT NOT NULL,
    cuit TEXT,
    localidad TEXT,
    direccion TEXT,
    rubro TEXT,
    perfil_redes TEXT,
    contacto_nombre TEXT,
    contacto_cargo TEXT,
    email TEXT,
    telefono TEXT,
    tipo_contacto TEXT,
    estado TEXT NOT NULL DEFAULT 'nuevo',
    observaciones TEXT,
    notas TEXT,
    origen TEXT DEFAULT 'manual',
    origen_id TEXT,
    responsable TEXT,
    proxima_accion TEXT,
    fecha_proxima_accion DATE,
    ultimo_contacto TIMESTAMPTZ,
    email_normalizado TEXT,
    telefono_normalizado TEXT,
    cliente_id TEXT,
    convertido_en TIMESTAMPTZ,
    archivado BOOLEAN DEFAULT FALSE,
    creado_por TEXT,
    actualizado_por TEXT,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_prospectos_estado ON prospectos (estado, archivado, actualizado_en DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_prospectos_empresa ON prospectos (empresa_normalizada)');
  await query('CREATE INDEX IF NOT EXISTS idx_prospectos_email ON prospectos (email_normalizado)');
  await query('CREATE INDEX IF NOT EXISTS idx_prospectos_telefono ON prospectos (telefono_normalizado)');
  await query('CREATE INDEX IF NOT EXISTS idx_prospectos_cuit ON prospectos (cuit)');
  await query(`CREATE TABLE IF NOT EXISTS prospecto_importaciones (
    id TEXT PRIMARY KEY,
    usuario_email TEXT NOT NULL,
    nombre_archivo TEXT,
    filas JSONB NOT NULL,
    resumen JSONB NOT NULL,
    usado BOOLEAN DEFAULT FALSE,
    creado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query("INSERT INTO schema_migrations (id) VALUES ('003_rate_limit_store') ON CONFLICT DO NOTHING");
  await query("INSERT INTO schema_migrations (id) VALUES ('004_adjuntos_campo') ON CONFLICT DO NOTHING");
  await query("INSERT INTO schema_migrations (id) VALUES ('005_prospectos') ON CONFLICT DO NOTHING");
  console.log('[hardening] fin');
}
