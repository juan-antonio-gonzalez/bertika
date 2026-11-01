// Migraciones históricas de Bertika.
//
// Se ejecutan una sola vez por base (baseline 000_legacy_baseline). A partir de
// acá, todo cambio nuevo debe ir en una migración versionada separada; no se
// agrega DDL nuevo a este archivo.
import { query, one } from './db.js';
import { generarCodigoUnico } from './codigo.js';
import { sembrarListasVentas, sembrarListasTaller } from './listas-seed.js';
import { RESPUESTAS_EJEMPLO, colorDePaleta } from '../src/data/respuestas.js';

const limStr = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max).replace(/\u0000/g, '') : '');

export async function migrarLegacy() {
  console.log('[legacy] inicio');
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    aplicada_en TIMESTAMPTZ DEFAULT now()
  )`);
  const baseline = await one("SELECT id FROM schema_migrations WHERE id = '000_legacy_baseline'");
  if (baseline) return;
  await query('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS codigo_seguimiento TEXT');
  await query('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS medio_pago TEXT');
  // Aceptacion que origino la orden cuando entra por el formulario web.
  await query('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS consentimiento_id TEXT');
  // Origen del ingreso: permite saber si la orden nació en el taller o desde
  // una oportunidad de Ventas (y evitar convertir dos veces el mismo registro).
  await query('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS origen TEXT');
  await query('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS oportunidad_id TEXT');
  await query('CREATE INDEX IF NOT EXISTS idx_ordenes_oportunidad ON ordenes (oportunidad_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_ordenes_consentimiento ON ordenes (consentimiento_id)');
  // Trazabilidad: versiones de cotizacion (quien cotizo que y cuando).
  await query(`CREATE TABLE IF NOT EXISTS cotizaciones_historial (
    id TEXT PRIMARY KEY,
    orden_id TEXT,
    fecha TIMESTAMPTZ DEFAULT now(),
    monto NUMERIC,
    detalle JSONB,
    usuario JSONB
  )`);
  // Trazabilidad de inventario: todo movimiento de stock con su motivo y autor.
  await query(`CREATE TABLE IF NOT EXISTS insumos_movimientos (
    id TEXT PRIMARY KEY,
    insumo_id TEXT,
    tipo TEXT,
    cantidad NUMERIC,
    stock_resultante INTEGER,
    motivo TEXT,
    orden_id TEXT,
    usuario JSONB,
    fecha TIMESTAMPTZ DEFAULT now()
  )`);
  // Cotizador de visitas: estimaciones guardadas con su codigo y su cotizacion
  // del dolar del momento (asi el mail a ventas lleva los importes completos).
  await query(`CREATE TABLE IF NOT EXISTS cotizaciones_visita (
    id TEXT PRIMARY KEY,
    fecha TIMESTAMPTZ DEFAULT now(),
    km NUMERIC,
    zona TEXT,
    renglones JSONB,
    extras JSONB,
    urgencia TEXT,
    turno TEXT,
    subtotal NUMERIC,
    descuento NUMERIC,
    recargos NUMERIC,
    iva NUMERIC,
    total NUMERIC,
    moneda TEXT DEFAULT 'USD',
    dolar JSONB,
    nombre TEXT,
    empresa TEXT,
    email TEXT,
    telefono TEXT,
    fecha_preferida DATE,
    estado TEXT DEFAULT 'estimada',
    resumen TEXT,
    config_actualizado TIMESTAMPTZ
  )`);
  await query('ALTER TABLE cotizaciones_visita ADD COLUMN IF NOT EXISTS config_actualizado TIMESTAMPTZ');
  await query('ALTER TABLE cotizaciones_visita ADD COLUMN IF NOT EXISTS viaticos NUMERIC');
  await query('ALTER TABLE cotizaciones_visita ADD COLUMN IF NOT EXISTS viaticos_dias INTEGER');
  await query('ALTER TABLE cotizaciones_visita ADD COLUMN IF NOT EXISTS modo TEXT DEFAULT \'sitio\'');
  // Embudo del cotizador: abre / interactua / solicita / whatsapp / imprime.
  // Sin datos personales: sesion anonima + numeros de la estimacion.
  await query(`CREATE TABLE IF NOT EXISTS cotizador_eventos (
    id TEXT PRIMARY KEY,
    fecha TIMESTAMPTZ DEFAULT now(),
    tipo TEXT,
    sesion TEXT,
    modo TEXT,
    km NUMERIC,
    total NUMERIC,
    codigo TEXT
  )`);
  // WhatsApp: bandeja de conversaciones y mensajes (entrantes y salientes).
  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS wa_optin BOOLEAN DEFAULT FALSE');
  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS wa_optin_fecha TIMESTAMPTZ');
  // Papelera (baja logica) y datos comerciales editables del cliente.
  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS notas TEXT');
  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS deleted_by TEXT');
  // Datos comerciales de la ficha (CRM): se cargan al alta y se pueden editar.
  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion TEXT');
  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS localidad TEXT');
  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cuit TEXT');
  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS condicion_pago TEXT');
  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS canal_origen TEXT');
  await query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS vendedor TEXT');
  // Umbral de stock critico por insumo (antes estaba fijo en 3 en la UI).
  await query('ALTER TABLE insumos ADD COLUMN IF NOT EXISTS stock_minimo INTEGER DEFAULT 3');
  await query(`CREATE TABLE IF NOT EXISTS wa_conversaciones (
    id TEXT PRIMARY KEY,
    telefono TEXT UNIQUE,
    cliente_id TEXT,
    nombre_perfil TEXT,
    ultimo_texto TEXT,
    ultima_fecha TIMESTAMPTZ,
    no_leidos INTEGER DEFAULT 0,
    estado TEXT DEFAULT 'abierta',
    asignado_a TEXT
  )`);
  await query(`CREATE TABLE IF NOT EXISTS wa_mensajes (
    id TEXT PRIMARY KEY,
    conversacion_id TEXT,
    wa_message_id TEXT,
    direccion TEXT,
    telefono TEXT,
    tipo TEXT,
    texto TEXT,
    plantilla TEXT,
    estado TEXT,
    error TEXT,
    fecha TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_wa_mensajes_conv ON wa_mensajes (conversacion_id, fecha DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_wa_mensajes_wamid ON wa_mensajes (wa_message_id)');
  // Consentimiento de WhatsApp: quien pidio la baja (BAJA/STOP) no recibe mas
  // mensajes nuestros, y queda registrado con fecha y motivo.
  await query(`CREATE TABLE IF NOT EXISTS wa_consentimiento (
    telefono TEXT PRIMARY KEY,
    estado TEXT DEFAULT 'alta',
    motivo TEXT,
    fuente TEXT,
    actualizado TIMESTAMPTZ DEFAULT now(),
    usuario TEXT
  )`);
  // Registro de exportaciones (quien se llevo los datos y cuando).
  await query(`CREATE TABLE IF NOT EXISTS wa_export_log (
    id TEXT PRIMARY KEY,
    usuario TEXT,
    desde TIMESTAMPTZ,
    hasta TIMESTAMPTZ,
    filas INTEGER,
    fecha TIMESTAMPTZ DEFAULT now()
  )`);

  // Archivos del chat (fotos y documentos): se guardan como los de diagnostico.
  await query('ALTER TABLE wa_mensajes ADD COLUMN IF NOT EXISTS media_url TEXT');
  await query('ALTER TABLE wa_mensajes ADD COLUMN IF NOT EXISTS media_tipo TEXT');
  await query('ALTER TABLE wa_mensajes ADD COLUMN IF NOT EXISTS media_nombre TEXT');
  // CRM de la bandeja: etiquetas por conversacion y notas internas del taller.
  await query('ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS etiquetas TEXT');
  // Catalogo de etiquetas (antes eran texto libre: se duplicaban y no se podian
  // renombrar ni sacar) y respuestas rapidas para el compositor de la bandeja.
  await query(`CREATE TABLE IF NOT EXISTS wa_etiquetas (
    id TEXT PRIMARY KEY,
    nombre TEXT UNIQUE,
    color TEXT DEFAULT '#d98e00',
    orden INTEGER DEFAULT 100,
    activo BOOLEAN DEFAULT TRUE,
    creada_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS wa_respuestas (
    id TEXT PRIMARY KEY,
    atajo TEXT UNIQUE,
    texto TEXT,
    activo BOOLEAN DEFAULT TRUE,
    creada_en TIMESTAMPTZ DEFAULT now()
  )`);
  // Catalogo inicial, solo si la tabla esta vacia (no pisa lo que ya cargó el taller).
  await query(`INSERT INTO wa_etiquetas (id, nombre, color, orden)
    SELECT v.id, v.nombre, v.color, v.orden FROM (VALUES
      ('wet_presupuesto', 'Presupuesto', '#d98e00', 10),
      ('wet_garantia', 'Garantía', '#2f9e44', 20),
      ('wet_urgente', 'Urgente', '#e03131', 30),
      ('wet_repuesto', 'Esperando repuesto', '#1c7ed6', 40),
      ('wet_flotilla', 'Flotilla', '#7048e8', 50)
    ) AS v(id, nombre, color, orden)
    WHERE NOT EXISTS (SELECT 1 FROM wa_etiquetas)`);
  await query('ALTER TABLE wa_etiquetas ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0');
  await query('ALTER TABLE wa_etiquetas ALTER COLUMN orden SET DEFAULT 0');
  await query('ALTER TABLE wa_respuestas ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0');
  // Respuestas de ejemplo (solo si la tabla esta vacia).
  const ejemplos = RESPUESTAS_EJEMPLO
    .map((r, i) => `('war_${r.atajo}', '${r.atajo}', '${String(r.texto).replace(/'/g, "''")}', ${(i + 1) * 10})`)
    .join(',\n      ');
  await query(`INSERT INTO wa_respuestas (id, atajo, texto, orden)
    SELECT v.id, v.atajo, v.texto, v.orden FROM (VALUES
      ${ejemplos}
    ) AS v(id, atajo, texto, orden)
    WHERE NOT EXISTS (SELECT 1 FROM wa_respuestas)`);
  // Las etiquetas que ya estaban escritas a mano en las conversaciones pasan al
  // catalogo (una sola vez): asi tienen color y se pueden renombrar sin perderlas.
  const sueltas = await query(`SELECT DISTINCT trim(t) AS nombre FROM wa_conversaciones,
      unnest(string_to_array(COALESCE(etiquetas, ''), ',')) AS t WHERE trim(t) <> ''`);
  const yaEnCatalogo = new Set((await query('SELECT lower(nombre) AS n FROM wa_etiquetas')).map((r) => r.n));
  let ordenMigracion = 100;
  for (const fila of sueltas) {
    const nombre = limStr(fila.nombre, 24);
    if (!nombre || yaEnCatalogo.has(nombre.toLowerCase())) continue;
    await query('INSERT INTO wa_etiquetas (id, nombre, color, orden) VALUES ($1,$2,$3,$4) ON CONFLICT (nombre) DO NOTHING',
      [`wet_mig_${ordenMigracion}`, nombre, colorDePaleta(ordenMigracion), ordenMigracion]);
    yaEnCatalogo.add(nombre.toLowerCase());
    ordenMigracion += 1;
  }
  // Busqueda en mensajes: si la base tiene pg_trgm se usa un indice (mucho mas
  // rapido con historial largo); si no se puede, se sigue con ILIKE simple.
  try {
    await query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await query('CREATE INDEX IF NOT EXISTS idx_wa_mensajes_texto_trgm ON wa_mensajes USING gin (texto gin_trgm_ops)');
  } catch (e) {
    console.warn('[migracion] pg_trgm no disponible, la busqueda usa ILIKE simple:', e.message);
  }
  // Embudo comercial: etapa y monto estimado de la oportunidad.
  // Permisos por usuario (mapa plano de booleanos: que ve y que puede hacer).
  // NULL = plantilla del rol, asi ningun usuario existente cambia de comportamiento.
  await query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permisos JSONB');
  // Si la columna habia quedado como TEXT (version anterior), se convierte.
  await query(`DO $$
    BEGIN
      IF (SELECT data_type FROM information_schema.columns
           WHERE table_name = 'usuarios' AND column_name = 'permisos') = 'text' THEN
        ALTER TABLE usuarios ALTER COLUMN permisos TYPE JSONB USING NULLIF(permisos, '')::jsonb;
      END IF;
    END $$`);
  // Categorias de acceso: nombre + mapa de permisos reutilizable. El usuario
  // guarda su categoria y, ademas, su mapa efectivo (permite personalizar).
  await query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS categoria_id TEXT');
  await query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS twofa_email BOOLEAN DEFAULT FALSE');
  await query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0');
  await query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMPTZ');
  await query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER DEFAULT 0');
  await query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ');
  await query(`CREATE TABLE IF NOT EXISTS password_history (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_password_history_usuario ON password_history (usuario_id, creado_en DESC)');
  await query(`CREATE TABLE IF NOT EXISTS categorias_acceso (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    permisos JSONB NOT NULL DEFAULT '{}'::jsonb,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ
  )`);
  await query('CREATE UNIQUE INDEX IF NOT EXISTS categorias_acceso_nombre_uniq ON categorias_acceso (lower(nombre))');
  await query('ALTER TABLE categorias_acceso ADD COLUMN IF NOT EXISTS areas JSONB DEFAULT \'{}\'::jsonb');
  // Areas de trabajo y motor de listas dinamicas. Las listas no crean tablas
  // SQL: su definicion vive en lista_campos y sus filas en lista_registros.
  await query(`CREATE TABLE IF NOT EXISTS areas (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    icono TEXT DEFAULT 'clipboard',
    orden INTEGER DEFAULT 0,
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query(`INSERT INTO areas (id, slug, nombre, descripcion, icono, orden)
    VALUES
      ('area_taller', 'taller', 'Taller', 'Operación, inventario, materiales y herramientas del taller.', 'tools', 10),
      ('area_ventas', 'ventas', 'Ventas', 'Prospectos, oportunidades y actividades comerciales.', 'dollar', 20),
      ('area_admin', 'administracion', 'Administración', 'Listas de gestión interna y administración.', 'gear', 30)
    ON CONFLICT (id) DO NOTHING`);
  await query(`CREATE TABLE IF NOT EXISTS listas (
    id TEXT PRIMARY KEY,
    area_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    icono TEXT DEFAULT 'clipboard',
    orden INTEGER DEFAULT 0,
    creada_por TEXT,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ,
    archivada BOOLEAN DEFAULT FALSE,
    archivada_en TIMESTAMPTZ,
    archivada_por TEXT
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_listas_area ON listas (area_id, archivada, orden)');
  await query("CREATE UNIQUE INDEX IF NOT EXISTS listas_area_nombre_uniq ON listas (area_id, lower(nombre)) WHERE archivada = false");
  await query(`CREATE TABLE IF NOT EXISTS lista_campos (
    id TEXT PRIMARY KEY,
    lista_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    requerido BOOLEAN DEFAULT FALSE,
    unico BOOLEAN DEFAULT FALSE,
    orden INTEGER DEFAULT 0,
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_lista_campos_lista ON lista_campos (lista_id, activo, orden)');
  await query("CREATE UNIQUE INDEX IF NOT EXISTS lista_campos_nombre_uniq ON lista_campos (lista_id, lower(nombre)) WHERE activo = true");
  await query(`CREATE TABLE IF NOT EXISTS lista_registros (
    id TEXT PRIMARY KEY,
    lista_id TEXT NOT NULL,
    datos JSONB NOT NULL DEFAULT '{}'::jsonb,
    creado_por TEXT,
    actualizado_por TEXT,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ,
    archivado BOOLEAN DEFAULT FALSE,
    archivado_en TIMESTAMPTZ,
    archivado_por TEXT
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_lista_registros_lista ON lista_registros (lista_id, archivado, creado_en DESC)');
  await query(`CREATE TABLE IF NOT EXISTS lista_vistas (
    id TEXT PRIMARY KEY,
    lista_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    tipo TEXT DEFAULT 'grid',
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    visibilidad TEXT DEFAULT 'compartida',
    creada_por TEXT,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ,
    predeterminada BOOLEAN DEFAULT FALSE
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_lista_vistas_lista ON lista_vistas (lista_id, creado_en)');
  // Fase 2: comentarios con menciones, historial de versiones y reglas/avisos.
  await query(`CREATE TABLE IF NOT EXISTS lista_comentarios (
    id TEXT PRIMARY KEY,
    lista_id TEXT NOT NULL,
    registro_id TEXT NOT NULL,
    autor TEXT,
    texto TEXT NOT NULL,
    menciones JSONB DEFAULT '[]'::jsonb,
    creado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_lista_comentarios_registro ON lista_comentarios (registro_id, creado_en)');
  await query(`CREATE TABLE IF NOT EXISTS lista_registros_historial (
    id TEXT PRIMARY KEY,
    lista_id TEXT NOT NULL,
    registro_id TEXT NOT NULL,
    datos JSONB NOT NULL DEFAULT '{}'::jsonb,
    usuario TEXT,
    accion TEXT DEFAULT 'editar',
    creado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_lista_historial_registro ON lista_registros_historial (registro_id, creado_en DESC)');
  await query(`CREATE TABLE IF NOT EXISTS lista_reglas (
    id TEXT PRIMARY KEY,
    lista_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    evento TEXT DEFAULT 'ambos',
    campo TEXT,
    op TEXT DEFAULT 'igual',
    valor TEXT,
    destinatario TEXT,
    asunto TEXT,
    creada_por TEXT,
    creado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_lista_reglas_lista ON lista_reglas (lista_id, activo)');
  // Fase 3: permisos a nivel de fila.
  await query("ALTER TABLE listas ADD COLUMN IF NOT EXISTS permiso_filas TEXT DEFAULT 'todos'");
  await query('ALTER TABLE listas ADD COLUMN IF NOT EXISTS permiso_campo TEXT');
  await query("ALTER TABLE listas ADD COLUMN IF NOT EXISTS ver_filas TEXT DEFAULT 'todos'");
  await query('ALTER TABLE listas ADD COLUMN IF NOT EXISTS ver_campo TEXT');
  await query('ALTER TABLE listas ADD COLUMN IF NOT EXISTS requiere_aprobacion BOOLEAN DEFAULT FALSE');
  await query("ALTER TABLE lista_registros ADD COLUMN IF NOT EXISTS aprobacion_estado TEXT DEFAULT 'no_requiere'");
  await query("ALTER TABLE listas ADD COLUMN IF NOT EXISTS acceso_categorias JSONB DEFAULT '[]'::jsonb");
  await query('ALTER TABLE listas ADD COLUMN IF NOT EXISTS aprobador_email TEXT');
  await query('ALTER TABLE listas ADD COLUMN IF NOT EXISTS aprobacion_dias INTEGER DEFAULT 3');
  await query("ALTER TABLE listas ADD COLUMN IF NOT EXISTS acceso_solo_lectura JSONB DEFAULT '[]'::jsonb");
  await query("ALTER TABLE lista_campos ADD COLUMN IF NOT EXISTS oculto_categorias JSONB DEFAULT '[]'::jsonb");
  await query("ALTER TABLE listas ADD COLUMN IF NOT EXISTS aprobadores JSONB DEFAULT '[]'::jsonb");
  await query("ALTER TABLE listas ADD COLUMN IF NOT EXISTS permisos_categorias JSONB DEFAULT '{}'::jsonb");
  await query('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS activo_id TEXT');
  await query('ALTER TABLE lista_reglas ADD COLUMN IF NOT EXISTS campo_serie TEXT');
  await query('ALTER TABLE lista_aprobaciones ADD COLUMN IF NOT EXISTS paso INTEGER DEFAULT 0');
  await query('ALTER TABLE lista_aprobaciones ADD COLUMN IF NOT EXISTS aprobador TEXT');
  await query('ALTER TABLE lista_aprobaciones ADD COLUMN IF NOT EXISTS fecha_limite TIMESTAMPTZ');
  // Fase 3: formularios públicos por lista (token no adivinable).
  await query(`CREATE TABLE IF NOT EXISTS lista_formularios (
    id TEXT PRIMARY KEY,
    lista_id TEXT NOT NULL UNIQUE,
    token TEXT NOT NULL UNIQUE,
    titulo TEXT,
    descripcion TEXT,
    campos JSONB DEFAULT '[]'::jsonb,
    activo BOOLEAN DEFAULT TRUE,
    creado_por TEXT,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_lista_formularios_token ON lista_formularios (token)');
  await query('ALTER TABLE lista_formularios ADD COLUMN IF NOT EXISTS confirmar_email BOOLEAN DEFAULT FALSE');
  await query(`CREATE TABLE IF NOT EXISTS lista_aprobaciones (
    id TEXT PRIMARY KEY,
    lista_id TEXT NOT NULL,
    registro_id TEXT NOT NULL,
    estado TEXT DEFAULT 'pendiente',
    solicitado_por TEXT,
    decidido_por TEXT,
    comentario TEXT,
    decidido_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_lista_aprobaciones_registro ON lista_aprobaciones (registro_id, creado_en DESC)');
  await query(`CREATE TABLE IF NOT EXISTS lista_notificaciones (
    id TEXT PRIMARY KEY,
    usuario_email TEXT NOT NULL,
    titulo TEXT,
    mensaje TEXT,
    link TEXT,
    tipo TEXT DEFAULT 'lista',
    leida BOOLEAN DEFAULT FALSE,
    creado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_lista_notificaciones_usuario ON lista_notificaciones (usuario_email, leida, creado_en DESC)');
  await query(`CREATE TABLE IF NOT EXISTS activos (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL,
    tipo TEXT DEFAULT 'equipo',
    nombre TEXT NOT NULL,
    serie TEXT,
    estado TEXT DEFAULT 'activo',
    notas TEXT,
    archivado BOOLEAN DEFAULT FALSE,
    creado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_activos_cliente ON activos (cliente_id, archivado)');

  await query(`CREATE TABLE IF NOT EXISTS lista_adjuntos (
    id TEXT PRIMARY KEY,
    lista_id TEXT NOT NULL,
    archivo TEXT NOT NULL,
    nombre TEXT,
    mime TEXT,
    size INTEGER DEFAULT 0,
    subido_por TEXT,
    creado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_lista_adjuntos_lista ON lista_adjuntos (lista_id, creado_en DESC)');
  await query(`CREATE TABLE IF NOT EXISTS oportunidades (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    cliente_id TEXT,
    prospecto_nombre TEXT,
    prospecto_telefono TEXT,
    prospecto_email TEXT,
    etapa TEXT DEFAULT 'nuevo',
    monto_estimado NUMERIC,
    probabilidad INTEGER DEFAULT 10,
    cierre_estimado DATE,
    responsable TEXT,
    origen TEXT,
    canal TEXT,
    conversacion_id TEXT,
    serie TEXT,
    activo_id TEXT,
    proxima_accion TEXT,
    fecha_proxima_accion DATE,
    motivo_perdida TEXT,
    cotizacion_actual_id TEXT,
    orden_id TEXT,
    notas TEXT,
    origen_dato TEXT,
    origen_id TEXT,
    etapa_desde TIMESTAMPTZ DEFAULT now(),
    creado_por TEXT,
    actualizado_por TEXT,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now(),
    archivada BOOLEAN DEFAULT FALSE
  )`);
  await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_oportunidades_origen ON oportunidades (origen_dato, origen_id) WHERE origen_id IS NOT NULL");
  await query('CREATE INDEX IF NOT EXISTS idx_oportunidades_etapa ON oportunidades (etapa, archivada, actualizado_en DESC)');
  await query(`CREATE TABLE IF NOT EXISTS cotizaciones (
    id TEXT PRIMARY KEY,
    oportunidad_id TEXT NOT NULL,
    cliente_id TEXT,
    version INTEGER DEFAULT 1,
    estado TEXT DEFAULT 'borrador',
    moneda TEXT DEFAULT 'ARS',
    subtotal NUMERIC DEFAULT 0,
    descuento NUMERIC DEFAULT 0,
    iva_pct NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0,
    validez_dias INTEGER DEFAULT 15,
    token TEXT UNIQUE,
    enviada_en TIMESTAMPTZ,
    vista_en TIMESTAMPTZ,
    decidida_en TIMESTAMPTZ,
    motivo_rechazo TEXT,
    creada_por TEXT,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_cotizaciones_oportunidad ON cotizaciones (oportunidad_id, version DESC)');
  await query(`CREATE TABLE IF NOT EXISTS cotizacion_items (
    id TEXT PRIMARY KEY,
    cotizacion_id TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    cantidad NUMERIC DEFAULT 1,
    precio_unitario NUMERIC DEFAULT 0,
    descuento NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0,
    orden INTEGER DEFAULT 0
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_cotizacion_items_cotizacion ON cotizacion_items (cotizacion_id, orden)');
  await query(`CREATE TABLE IF NOT EXISTS oportunidad_eventos (
    id TEXT PRIMARY KEY,
    oportunidad_id TEXT NOT NULL,
    tipo TEXT,
    detalle TEXT,
    usuario TEXT,
    creado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_oportunidad_eventos ON oportunidad_eventos (oportunidad_id, creado_en DESC)');
  await query('ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS oportunidad_id TEXT');
  await query('ALTER TABLE wa_tareas ADD COLUMN IF NOT EXISTS oportunidad_id TEXT');
  await query('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS oportunidad_id TEXT');
  await query('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS cotizacion_id TEXT');
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    aplicada_en TIMESTAMPTZ DEFAULT now()
  )`);
  const hardening = await one("SELECT id FROM schema_migrations WHERE id = '001_ventas_hardening'");
  if (!hardening) {
    await query('CREATE INDEX IF NOT EXISTS idx_oportunidades_responsable ON oportunidades (responsable, etapa, archivada)');
    await query('CREATE INDEX IF NOT EXISTS idx_oportunidades_cierre ON oportunidades (cierre_estimado)');
    await query('CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado ON cotizaciones (estado, enviada_en)');
    await query('CREATE INDEX IF NOT EXISTS idx_ordenes_oportunidad ON ordenes (oportunidad_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_lista_registros_datos_gin ON lista_registros USING gin (datos jsonb_path_ops)');
    try {
      await query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      await query('CREATE INDEX IF NOT EXISTS idx_lista_registros_datos_trgm ON lista_registros USING gin ((datos::text) gin_trgm_ops)');
    } catch (e) { console.warn('[migracion] pg_trgm para listas no disponible:', e.message); }
    await query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_cliente_fk') THEN
        ALTER TABLE oportunidades ADD CONSTRAINT oportunidades_cliente_fk FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cotizaciones_oportunidad_fk') THEN
        ALTER TABLE cotizaciones ADD CONSTRAINT cotizaciones_oportunidad_fk FOREIGN KEY (oportunidad_id) REFERENCES oportunidades(id) ON DELETE CASCADE NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cotizacion_items_cotizacion_fk') THEN
        ALTER TABLE cotizacion_items ADD CONSTRAINT cotizacion_items_cotizacion_fk FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidad_eventos_oportunidad_fk') THEN
        ALTER TABLE oportunidad_eventos ADD CONSTRAINT oportunidad_eventos_oportunidad_fk FOREIGN KEY (oportunidad_id) REFERENCES oportunidades(id) ON DELETE CASCADE NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_oportunidad_fk') THEN
        ALTER TABLE ordenes ADD CONSTRAINT ordenes_oportunidad_fk FOREIGN KEY (oportunidad_id) REFERENCES oportunidades(id) ON DELETE SET NULL NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_cotizacion_fk') THEN
        ALTER TABLE ordenes ADD CONSTRAINT ordenes_cotizacion_fk FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE SET NULL NOT VALID;
      END IF;
    END $$`);
    await query("INSERT INTO schema_migrations (id) VALUES ('001_ventas_hardening') ON CONFLICT DO NOTHING");
  }
  // Segunda migración: el índice trigram puede fallar si el rol todavía no
  // puede instalar la extensión. Se reintenta sin marcar la migración hasta
  // que la extensión y el índice existan.
  const trgm = await one("SELECT id FROM schema_migrations WHERE id = '002_listas_trgm'");
  if (!trgm) {
    try {
      await query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      await query('CREATE INDEX IF NOT EXISTS idx_lista_registros_datos_trgm ON lista_registros USING gin ((datos::text) gin_trgm_ops)');
      await query("INSERT INTO schema_migrations (id) VALUES ('002_listas_trgm') ON CONFLICT DO NOTHING");
    } catch (e) { console.warn('[migracion] pg_trgm para listas no disponible:', e.message); }
  }
  await query(`CREATE TABLE IF NOT EXISTS menu_favoritos (
    usuario_email TEXT NOT NULL,
    path TEXT NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (usuario_email, path)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS lista_plantillas_usuario (
    id TEXT PRIMARY KEY,
    area_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    icono TEXT DEFAULT 'clipboard',
    campos JSONB NOT NULL DEFAULT '[]'::jsonb,
    vistas JSONB NOT NULL DEFAULT '[]'::jsonb,
    creada_por TEXT,
    creado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_lista_plantillas_area ON lista_plantillas_usuario (area_id, creado_en DESC)');
  await query("ALTER TABLE lista_reglas ADD COLUMN IF NOT EXISTS accion TEXT DEFAULT 'email'");
  await query('ALTER TABLE lista_reglas ADD COLUMN IF NOT EXISTS campo_destino TEXT');
  await query('ALTER TABLE lista_reglas ADD COLUMN IF NOT EXISTS mensaje TEXT');
  // Siembra inicial del área Ventas (solo si todavía no tiene listas).
  await sembrarListasVentas();
  await sembrarListasTaller();
  await query(`CREATE TABLE IF NOT EXISTS login_2fa (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    codigo_hash TEXT NOT NULL,
    expira_en TIMESTAMPTZ NOT NULL,
    intentos INTEGER NOT NULL DEFAULT 0,
    consumido BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en TIMESTAMPTZ DEFAULT now(),
    ip TEXT,
    user_agent TEXT
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_login_2fa_usuario ON login_2fa (usuario_id, creado_en DESC)');
  await query(`CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expira_en TIMESTAMPTZ NOT NULL,
    usado BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en TIMESTAMPTZ DEFAULT now(),
    ip TEXT,
    user_agent TEXT
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_password_resets_usuario ON password_resets (usuario_id, creado_en DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON password_resets (token_hash)');
  await query("DELETE FROM login_2fa WHERE expira_en < now() - interval '7 days'");
  await query("DELETE FROM password_resets WHERE expira_en < now() - interval '30 days'");
  await query('ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS etapa TEXT');
  await query('ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS monto_estimado NUMERIC');
  // Orden vinculada a la oportunidad: cierra el circulo chat -> cotizacion -> orden.
  await query('ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS orden_id TEXT');
  await query('CREATE INDEX IF NOT EXISTS idx_wa_conversaciones_orden ON wa_conversaciones (orden_id)');
  await query(`CREATE TABLE IF NOT EXISTS wa_notas (
    id TEXT PRIMARY KEY,
    conversacion_id TEXT,
    autor TEXT,
    texto TEXT,
    fecha TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_wa_notas_conv ON wa_notas (conversacion_id, fecha DESC)');
  // Embudo comercial: historial de cambios de etapa. Es lo que permite medir la
  // conversion entre etapas, el tiempo en cada una y los motivos de perdida.
  await query(`CREATE TABLE IF NOT EXISTS wa_etapa_historial (
    id TEXT PRIMARY KEY,
    conversacion_id TEXT,
    anterior TEXT,
    nueva TEXT,
    monto NUMERIC,
    motivo TEXT,
    usuario TEXT,
    fecha TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_wa_etapa_conv ON wa_etapa_historial (conversacion_id, fecha DESC)');
  // Tareas / recordatorios del CRM: con vencimiento y responsable.
  await query(`CREATE TABLE IF NOT EXISTS wa_tareas (
    id TEXT PRIMARY KEY,
    conversacion_id TEXT,
    orden_id TEXT,
    cliente_id TEXT,
    titulo TEXT,
    vence TIMESTAMPTZ,
    asignado_a TEXT,
    estado TEXT DEFAULT 'pendiente',
    creada_por TEXT,
    creada_en TIMESTAMPTZ DEFAULT now(),
    cerrada_en TIMESTAMPTZ
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_wa_tareas_vence ON wa_tareas (estado, vence)');
  // Indice para medir SLA sin recorrer toda la tabla de mensajes.
  await query('CREATE INDEX IF NOT EXISTS idx_wa_mensajes_dir ON wa_mensajes (conversacion_id, direccion, fecha DESC)');
  // Automatizaciones de seguimiento: reglas prendidas y umbral en dias.
  await query(`CREATE TABLE IF NOT EXISTS wa_automatizaciones (
    clave TEXT PRIMARY KEY,
    activo BOOLEAN DEFAULT TRUE,
    dias INTEGER DEFAULT 2,
    actualizado_en TIMESTAMPTZ DEFAULT now()
  )`);
  // Idempotencia: una regla no crea dos tareas para la misma oportunidad/orden.
  await query(`CREATE TABLE IF NOT EXISTS wa_automatizaciones_log (
    id TEXT PRIMARY KEY,
    clave TEXT NOT NULL,
    referencia TEXT NOT NULL,
    tarea_id TEXT,
    detalle TEXT,
    fecha TIMESTAMPTZ DEFAULT now(),
    UNIQUE (clave, referencia)
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_wa_auto_fecha ON wa_automatizaciones_log (clave, fecha DESC)');
  // Reglas por defecto (prendidas, con el umbral del catalogo).
  await query(`INSERT INTO wa_automatizaciones (clave, activo, dias) VALUES
      ('seguimiento_presupuesto', true, 2),
      ('retiro_pendiente', true, 3)
    ON CONFLICT (clave) DO NOTHING`);
  // Avisos automaticos: que avisos estan prendidos y cuales ya se mandaron
  // (la clave (orden, plantilla) evita mandar dos veces el mismo aviso).
  await query('CREATE TABLE IF NOT EXISTS wa_avisos_config (evento TEXT PRIMARY KEY, activo BOOLEAN DEFAULT TRUE)');
  await query(`CREATE TABLE IF NOT EXISTS wa_avisos_log (
    orden_id TEXT,
    plantilla TEXT,
    estado TEXT,
    error TEXT,
    fecha TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (orden_id, plantilla)
  )`);
  // Auditoria generica: quien cambio que, cuando, desde que IP y con que
  // request-id. `antes`/`despues` guardan solo los campos modificados.
  await query(`CREATE TABLE IF NOT EXISTS auditoria (
    id TEXT PRIMARY KEY,
    fecha TIMESTAMPTZ DEFAULT now(),
    actor TEXT,
    actor_id TEXT,
    rol TEXT,
    ip TEXT,
    tabla TEXT NOT NULL,
    registro_id TEXT,
    accion TEXT NOT NULL,
    campos TEXT,
    antes JSONB,
    despues JSONB,
    detalle TEXT,
    request_id TEXT
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria (fecha DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_auditoria_registro ON auditoria (tabla, registro_id, fecha DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_auditoria_actor ON auditoria (actor, fecha DESC)');
  // Consentimientos: prueba de qué texto aceptó cada persona y qué cookies
  // autorizó. El hash HMAC permite detectar si alguien alteró la fila.
  await query(`CREATE TABLE IF NOT EXISTS consentimientos (
    id TEXT PRIMARY KEY,
    creado_en TIMESTAMPTZ DEFAULT now(),
    tipo TEXT NOT NULL,
    nombre TEXT,
    email TEXT,
    ip TEXT,
    user_agent TEXT,
    origen TEXT,
    pagina TEXT,
    acepta_terminos BOOLEAN DEFAULT FALSE,
    terminos_version TEXT,
    terminos_url TEXT,
    terminos_hash TEXT,
    acepta_privacidad BOOLEAN DEFAULT FALSE,
    privacidad_version TEXT,
    privacidad_url TEXT,
    privacidad_hash TEXT,
    cookies_necesarias BOOLEAN DEFAULT FALSE,
    cookies_analiticas BOOLEAN DEFAULT FALSE,
    cookies_marketing BOOLEAN DEFAULT FALSE,
    cookies_version TEXT,
    accion TEXT,
    canal TEXT,
    motivo TEXT,
    idempotency_key TEXT,
    hash_version INTEGER DEFAULT 2,
    hash TEXT NOT NULL,
    hash_legal TEXT,
    anonimizado_en TIMESTAMPTZ
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_consent_fecha ON consentimientos (creado_en DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_consent_email ON consentimientos (LOWER(email))');
  await query('CREATE INDEX IF NOT EXISTS idx_consent_tipo ON consentimientos (tipo, creado_en DESC)');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_consent_idem ON consentimientos (idempotency_key) WHERE idempotency_key IS NOT NULL');
  await query('ALTER TABLE consentimientos ADD COLUMN IF NOT EXISTS hash_legal TEXT');
  // Outbox de WhatsApp: el mensaje se guarda antes de mandarse y se reintenta
  // solo si el error es transitorio. Ver api/outbox.js.
  await query(`CREATE TABLE IF NOT EXISTS wa_outbox (
    id TEXT PRIMARY KEY,
    conversacion_id TEXT,
    telefono TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'texto',
    texto TEXT,
    plantilla TEXT,
    idioma TEXT,
    parametros JSONB DEFAULT '[]',
    media_path TEXT,
    media_mime TEXT,
    media_nombre TEXT,
    mensaje_id TEXT,
    aviso_orden_id TEXT,
    aviso_plantilla TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    intentos INTEGER NOT NULL DEFAULT 0,
    proximo_intento TIMESTAMPTZ DEFAULT now(),
    ultimo_error TEXT,
    wa_message_id TEXT,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_wa_outbox_cola ON wa_outbox (estado, proximo_intento)');
  await query('CREATE INDEX IF NOT EXISTS idx_wa_outbox_fecha ON wa_outbox (creado_en DESC)');
  // Un aviso (orden + plantilla) no puede estar dos veces vivo en la cola.
  try {
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_outbox_aviso
      ON wa_outbox (aviso_orden_id, aviso_plantilla)
      WHERE aviso_orden_id IS NOT NULL AND estado IN ('pendiente', 'enviando', 'incierto')`);
  } catch (e) { console.error(`[migracion] indice unico de avisos en cola: ${e.message}`); }
  // Alertas del sistema: se guarda cada envio para no repetir la misma alerta
  // cada 30 segundos (el worker de monitoreo las espacia en el tiempo).
  await query(`CREATE TABLE IF NOT EXISTS alertas_log (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    mensaje TEXT,
    canal TEXT,
    destino TEXT,
    ok BOOLEAN,
    fecha TIMESTAMPTZ DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_alertas_tipo ON alertas_log (tipo, fecha DESC)');
  // Configuración editable del cotizador (tarifas, franjas, descuentos, IVA) +
  // historial de cambios para saber quién tocó los precios y cuándo.
  await query(`CREATE TABLE IF NOT EXISTS cotizador_config (
    id TEXT PRIMARY KEY,
    config JSONB NOT NULL,
    actualizado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_por TEXT
  )`);
  await query(`CREATE TABLE IF NOT EXISTS cotizador_config_historial (
    id TEXT PRIMARY KEY,
    fecha TIMESTAMPTZ DEFAULT now(),
    config JSONB,
    usuario JSONB
  )`);
  // Reparacion de contadores: si la fila 'cfg' falta (o quedo atras) pero ya
  // hay historial cfg_100..., el siguiente nextId volvia a generar cfg_100 y
  // fallaba con duplicate key. Se alinea el contador con el historial real.
  await query(`INSERT INTO contadores (nombre, valor)
    SELECT 'cfg', COALESCE(MAX(SUBSTRING(id FROM 5)::int), 99)
    FROM cotizador_config_historial
    WHERE id ~ '^cfg_[0-9]+$'
    ON CONFLICT (nombre) DO UPDATE SET valor = GREATEST(contadores.valor, EXCLUDED.valor)`);
  const faltantes = await query("SELECT id FROM ordenes WHERE codigo_seguimiento IS NULL OR codigo_seguimiento = ''");
  for (const o of faltantes) {
    const c = await generarCodigoUnico(async (cod) => {
      const r = await query('SELECT 1 FROM ordenes WHERE codigo_seguimiento = $1', [cod]);
      return r.length > 0;
    });
    await query('UPDATE ordenes SET codigo_seguimiento = $2 WHERE id = $1', [o.id, c]);
  }
  try {
    await query('ALTER TABLE ordenes ADD CONSTRAINT uq_ordenes_codigo UNIQUE (codigo_seguimiento)');
  } catch { /* ya existe */ }
  // Integridad (fase 2): indices unicos que impiden duplicados reales.
  // Van en try/catch (mismo criterio que uq_ordenes_codigo) para que un dato
  // viejo duplicado no impida que arranque el servicio; los chequeos de la
  // aplicacion siguen evitando los duplicados aunque un indice no se cree.
  try {
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_email_lower ON clientes (LOWER(email))');
  } catch (e) { console.error(`[migracion] indice unico de clientes: ${e.message}`); }
  try {
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_bajas_bateria ON bajas (bateria_id)');
  } catch (e) { console.error(`[migracion] indice unico de bajas: ${e.message}`); }
  try {
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_mensajes_wamid ON wa_mensajes (wa_message_id) WHERE wa_message_id IS NOT NULL');
  } catch (e) { console.error(`[migracion] indice unico de mensajes: ${e.message}`); }
  // Catalogo del CRM: nombre de etiqueta y atajo de respuesta no se repiten,
  // ni cambiando mayusculas (el chequeo de la aplicacion queda igual).
  try {
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_etiquetas_nombre ON wa_etiquetas (LOWER(nombre))');
  } catch (e) { console.error(`[migracion] indice unico de etiquetas: ${e.message}`); }
  try {
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_respuestas_atajo ON wa_respuestas (LOWER(atajo))');
  } catch (e) { console.error(`[migracion] indice unico de respuestas: ${e.message}`); }
  console.log('[migracion] esquema asegurado (codigos, medio de pago, historial de cotizaciones, movimientos de insumos, cotizador configurable, whatsapp, crm de whatsapp, avisos automaticos, embudo comercial, integridad, papelera de clientes)');
  await query("INSERT INTO schema_migrations (id) VALUES ('000_legacy_baseline') ON CONFLICT DO NOTHING");
  console.log('[legacy] fin');
}
