// Migraciones nuevas, separadas del baseline histórico.
// Cada una se registra en schema_migrations y es idempotente.
import { randomUUID } from 'node:crypto';
import { query, one } from './db.js';

export async function migrarHardening() {
  console.log('[hardening] inicio');
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    aplicada_en TIMESTAMPTZ DEFAULT now()
  )`);
  const hecha = await one("SELECT id FROM schema_migrations WHERE id = '009_prospectos_documento_obligatorio'");
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
  await query('ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS prospecto_id TEXT');
  await query('CREATE INDEX IF NOT EXISTS idx_oportunidades_prospecto ON oportunidades (prospecto_id)');
  // La lista dinámica Ventas → Prospectos es la fuente única. Se retiran las
  // tablas físicas que se habían creado por error para no duplicar datos.
  const listaProspectos = await one(`SELECT l.id FROM listas l JOIN areas a ON a.id=l.area_id
    WHERE a.slug='ventas' AND lower(l.nombre) LIKE '%prospect%' AND l.archivada=false ORDER BY l.creado_en LIMIT 1`);
  if (listaProspectos) {
    const extra = [
      ['Zona / Localidad', 'texto'], ['Dirección / Ubicación', 'texto'],
      ['Rubro / Equipamiento Principal', 'texto'], ['Perfil Redes Sociales', 'texto'],
      ['Contacto', 'texto'], ['Cargo', 'texto'], ['Tipo de Contacto Directo', 'texto'],
      ['Observaciones / Foco Comercial', 'texto_largo'], ['CUIT', 'texto'],
      ['ID Origen', 'texto'], ['Emails adicionales', 'texto'], ['Cliente convertido', 'texto'],
    ];
    const actuales = await query('SELECT lower(nombre) AS nombre FROM lista_campos WHERE lista_id=$1 AND activo=true', [listaProspectos.id]);
    const tiene = new Set(actuales.map((x) => x.nombre));
    let orden = Number((await one('SELECT COALESCE(MAX(orden),0)::int AS n FROM lista_campos WHERE lista_id=$1', [listaProspectos.id])).n) || 0;
    for (const [nombre, tipo] of extra) {
      if (tiene.has(nombre.toLowerCase())) continue;
      orden += 10;
      await query('INSERT INTO lista_campos (id,lista_id,nombre,tipo,config,requerido,unico,oculto_categorias,orden) VALUES ($1,$2,$3,$4,$5::jsonb,false,false,$6::jsonb,$7)', [`cam_${randomUUID()}`, listaProspectos.id, nombre, tipo, '{}', '[]', orden]);
    }
    const campoDocumento = await one("SELECT id FROM lista_campos WHERE lista_id=$1 AND lower(nombre) IN ('cuit','cuil','dni','documento') AND activo=true ORDER BY orden LIMIT 1", [listaProspectos.id]);
    if (campoDocumento) {
      const expr = `regexp_replace(COALESCE(datos->>'${campoDocumento.id}', ''), '\\D', '', 'g')`;
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_prospectos_documento ON lista_registros ((${expr}))
        WHERE lista_id = '${listaProspectos.id}' AND archivado = false AND ${expr} <> ''`);
    }
    if (campoDocumento) await query('UPDATE lista_campos SET requerido=true WHERE id=$1', [campoDocumento.id]);
    const campoEstado = await one("SELECT id, config FROM lista_campos WHERE lista_id=$1 AND lower(nombre)='estado' AND activo=true", [listaProspectos.id]);
    if (campoEstado) {
      const opciones = ['Nuevo', 'Contactado', 'Interesado', 'Cotizado', 'Negociación', 'Ganado', 'Perdido', 'Convertido a cliente'];
      await query('UPDATE lista_campos SET config=$2::jsonb WHERE id=$1', [campoEstado.id, JSON.stringify({ ...campoEstado.config, opciones })]);
    }
    const campoOrigen = await one("SELECT id, config FROM lista_campos WHERE lista_id=$1 AND lower(nombre)='origen' AND activo=true", [listaProspectos.id]);
    if (campoOrigen) {
      const actuales = Array.isArray(campoOrigen.config?.opciones) ? campoOrigen.config.opciones : [];
      const opciones = [...new Set([...actuales, 'Manual', 'Excel'])];
      await query('UPDATE lista_campos SET config=$2::jsonb WHERE id=$1', [campoOrigen.id, JSON.stringify({ ...campoOrigen.config, opciones })]);
    }
  }
  await query('DROP TABLE IF EXISTS prospectos');
  await query('DROP TABLE IF EXISTS prospecto_estados');
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
  await query("INSERT INTO schema_migrations (id) VALUES ('006_prospecto_oportunidad') ON CONFLICT DO NOTHING");
  await query("INSERT INTO schema_migrations (id) VALUES ('007_prospectos_lista_unica') ON CONFLICT DO NOTHING");
  await query("INSERT INTO schema_migrations (id) VALUES ('008_prospectos_documento_unico') ON CONFLICT DO NOTHING");
  await query("INSERT INTO schema_migrations (id) VALUES ('009_prospectos_documento_obligatorio') ON CONFLICT DO NOTHING");
  console.log('[hardening] fin');
}
