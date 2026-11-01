-- Bertika - Esquema PostgreSQL
-- Entidades: usuarios, tecnicos, clientes, baterias, insumos, ordenes, bajas, notificaciones, contadores

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin','tecnico','cliente')),
  tecnico_id TEXT,
  cliente_id TEXT,
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMPTZ DEFAULT now(),
  permisos JSONB,
  categoria_id TEXT,
  twofa_email BOOLEAN DEFAULT FALSE,
  token_version INTEGER DEFAULT 0,
  ultimo_acceso TIMESTAMPTZ,
  intentos_fallidos INTEGER DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS categorias_acceso (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  permisos JSONB NOT NULL DEFAULT '{}'::jsonb,
  areas JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en TIMESTAMPTZ DEFAULT now(),
  actualizado_en TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS categorias_acceso_nombre_uniq ON categorias_acceso (lower(nombre));
ALTER TABLE categorias_acceso ADD COLUMN IF NOT EXISTS areas JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS login_2fa (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  codigo_hash TEXT NOT NULL,
  expira_en TIMESTAMPTZ NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  consumido BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ DEFAULT now(),
  ip TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_2fa_usuario ON login_2fa (usuario_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expira_en TIMESTAMPTZ NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ DEFAULT now(),
  ip TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_password_resets_usuario ON password_resets (usuario_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON password_resets (token_hash);

CREATE TABLE IF NOT EXISTS password_history (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_history_usuario ON password_history (usuario_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS tecnicos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  especialidad TEXT NOT NULL,
  certificaciones JSONB DEFAULT '[]',
  activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT DEFAULT 'particular',
  telefono TEXT DEFAULT '',
  contacto TEXT DEFAULT '',
  email TEXT DEFAULT '',
  empresa TEXT DEFAULT '',
  wa_optin BOOLEAN DEFAULT FALSE,
  wa_optin_fecha TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS baterias (
  id TEXT PRIMARY KEY,
  numero_serie TEXT UNIQUE NOT NULL,
  tipo TEXT DEFAULT 'Plomo-Acido',
  voltaje TEXT DEFAULT '12V',
  capacidad NUMERIC DEFAULT 0,
  aplicacion TEXT DEFAULT 'Automotriz',
  marca TEXT DEFAULT '',
  modelo TEXT DEFAULT '',
  equipo TEXT DEFAULT '',
  fecha_fabricacion DATE,
  cliente_id TEXT REFERENCES clientes(id),
  ciclos_estimados INTEGER DEFAULT 0,
  estado_vida TEXT DEFAULT 'activa'
);

CREATE TABLE IF NOT EXISTS insumos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria TEXT DEFAULT '',
  stock INTEGER DEFAULT 0,
  precio NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ordenes (
  id TEXT PRIMARY KEY,
  codigo_seguimiento TEXT UNIQUE,
  bateria_serie TEXT,
  cliente_id TEXT REFERENCES clientes(id),
  tecnico_id TEXT,
  falla TEXT,
  motivo TEXT,
  estado TEXT NOT NULL DEFAULT 'received',
  estado_cotizacion TEXT,
  fecha_ingreso TIMESTAMPTZ DEFAULT now(),
  hora_entrega TIMESTAMPTZ,
  fecha_entrega TIMESTAMPTZ,
  monto_cobrado NUMERIC,
  medio_pago TEXT,
  garantia JSONB,
  cotizacion JSONB,
  insumos_utilizados JSONB DEFAULT '[]',
  prueba_final JSONB DEFAULT '{"estado":"pending"}',
  diagnostico JSONB,
  consentimiento_id TEXT,
  origen TEXT,
  oportunidad_id TEXT,
  eventos JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS bajas (
  id TEXT PRIMARY KEY,
  bateria_id TEXT,
  serie TEXT,
  fecha TIMESTAMPTZ DEFAULT now(),
  motivo TEXT,
  disposicion TEXT,
  reciclada BOOLEAN DEFAULT FALSE,
  fecha_reciclaje TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id TEXT PRIMARY KEY,
  orden_id TEXT,
  mensaje TEXT,
  canal TEXT,
  fecha TIMESTAMPTZ DEFAULT now(),
  leida BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS contadores (
  nombre TEXT PRIMARY KEY,
  valor INTEGER NOT NULL
);

-- Auditoria: versiones de cotizacion (quien cotizo que, cuando y por cuanto).
CREATE TABLE IF NOT EXISTS cotizaciones_historial (
  id TEXT PRIMARY KEY,
  orden_id TEXT,
  fecha TIMESTAMPTZ DEFAULT now(),
  monto NUMERIC,
  detalle JSONB,
  usuario JSONB
);

-- Auditoria de inventario: todo movimiento de stock con motivo y autor.
CREATE TABLE IF NOT EXISTS insumos_movimientos (
  id TEXT PRIMARY KEY,
  insumo_id TEXT,
  tipo TEXT,
  cantidad NUMERIC,
  stock_resultante INTEGER,
  motivo TEXT,
  orden_id TEXT,
  usuario JSONB,
  fecha TIMESTAMPTZ DEFAULT now()
);

-- Cotizador de visitas: estimaciones guardadas con su codigo y su cotizacion
-- del dolar del momento (asi el mail a ventas lleva los importes completos).
CREATE TABLE IF NOT EXISTS cotizaciones_visita (
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
  config_actualizado TIMESTAMPTZ,
  viaticos NUMERIC,
  viaticos_dias INTEGER,
  modo TEXT DEFAULT 'sitio'
);

-- Embudo del cotizador (abre / interactua / solicita / whatsapp / imprime).
CREATE TABLE IF NOT EXISTS cotizador_eventos (
  id TEXT PRIMARY KEY,
  fecha TIMESTAMPTZ DEFAULT now(),
  tipo TEXT,
  sesion TEXT,
  modo TEXT,
  km NUMERIC,
  total NUMERIC,
  codigo TEXT
);

-- Configuracion editable del cotizador de visitas + historial de cambios.
CREATE TABLE IF NOT EXISTS cotizador_config (
  id TEXT PRIMARY KEY,
  config JSONB NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now(),
  actualizado_por TEXT
);

CREATE TABLE IF NOT EXISTS cotizador_config_historial (
  id TEXT PRIMARY KEY,
  fecha TIMESTAMPTZ DEFAULT now(),
  config JSONB,
  usuario JSONB
);

-- WhatsApp: bandeja de conversaciones y mensajes (entrantes y salientes).
CREATE TABLE IF NOT EXISTS wa_conversaciones (
  id TEXT PRIMARY KEY,
  telefono TEXT UNIQUE,
  cliente_id TEXT,
  nombre_perfil TEXT,
  ultimo_texto TEXT,
  ultima_fecha TIMESTAMPTZ,
  no_leidos INTEGER DEFAULT 0,
  estado TEXT DEFAULT 'abierta',
  asignado_a TEXT
);

CREATE TABLE IF NOT EXISTS wa_mensajes (
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
);

-- Areas de trabajo y motor de listas dinamicas.
CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  icono TEXT DEFAULT 'clipboard',
  orden INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMPTZ DEFAULT now()
);

INSERT INTO areas (id, slug, nombre, descripcion, icono, orden)
VALUES
  ('area_taller', 'taller', 'Taller', 'Operación, inventario, materiales y herramientas del taller.', 'tools', 10),
  ('area_ventas', 'ventas', 'Ventas', 'Prospectos, oportunidades y actividades comerciales.', 'dollar', 20),
  ('area_admin', 'administracion', 'Administración', 'Listas de gestión interna y administración.', 'gear', 30)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS listas (
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
  archivada_por TEXT,
  permiso_filas TEXT DEFAULT 'todos',
  permiso_campo TEXT,
  ver_filas TEXT DEFAULT 'todos',
  ver_campo TEXT,
  requiere_aprobacion BOOLEAN DEFAULT FALSE,
  acceso_categorias JSONB DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_listas_area ON listas (area_id, archivada, orden);
CREATE UNIQUE INDEX IF NOT EXISTS listas_area_nombre_uniq ON listas (area_id, lower(nombre)) WHERE archivada = false;

CREATE TABLE IF NOT EXISTS lista_campos (
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
);
CREATE INDEX IF NOT EXISTS idx_lista_campos_lista ON lista_campos (lista_id, activo, orden);
CREATE UNIQUE INDEX IF NOT EXISTS lista_campos_nombre_uniq ON lista_campos (lista_id, lower(nombre)) WHERE activo = true;

CREATE TABLE IF NOT EXISTS lista_registros (
  id TEXT PRIMARY KEY,
  lista_id TEXT NOT NULL,
  datos JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_por TEXT,
  actualizado_por TEXT,
  creado_en TIMESTAMPTZ DEFAULT now(),
  actualizado_en TIMESTAMPTZ,
  archivado BOOLEAN DEFAULT FALSE,
  archivado_en TIMESTAMPTZ,
  archivado_por TEXT,
  aprobacion_estado TEXT DEFAULT 'no_requiere'
);
CREATE INDEX IF NOT EXISTS idx_lista_registros_lista ON lista_registros (lista_id, archivado, creado_en DESC);

CREATE TABLE IF NOT EXISTS lista_vistas (
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
);
CREATE INDEX IF NOT EXISTS idx_lista_vistas_lista ON lista_vistas (lista_id, creado_en);

-- Fase 2: comentarios, historial y reglas de las listas dinámicas.
CREATE TABLE IF NOT EXISTS lista_comentarios (
  id TEXT PRIMARY KEY,
  lista_id TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  autor TEXT,
  texto TEXT NOT NULL,
  menciones JSONB DEFAULT '[]'::jsonb,
  creado_en TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lista_comentarios_registro ON lista_comentarios (registro_id, creado_en);

CREATE TABLE IF NOT EXISTS lista_registros_historial (
  id TEXT PRIMARY KEY,
  lista_id TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  datos JSONB NOT NULL DEFAULT '{}'::jsonb,
  usuario TEXT,
  accion TEXT DEFAULT 'editar',
  creado_en TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lista_historial_registro ON lista_registros_historial (registro_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS lista_reglas (
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
  accion TEXT DEFAULT 'email',
  campo_destino TEXT,
  mensaje TEXT,
  creada_por TEXT,
  creado_en TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lista_reglas_lista ON lista_reglas (lista_id, activo);


-- Fase 3: formularios públicos por lista.
CREATE TABLE IF NOT EXISTS lista_formularios (
  id TEXT PRIMARY KEY,
  lista_id TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  titulo TEXT,
  descripcion TEXT,
  campos JSONB DEFAULT '[]'::jsonb,
  activo BOOLEAN DEFAULT TRUE,
  confirmar_email BOOLEAN DEFAULT FALSE,
  creado_por TEXT,
  creado_en TIMESTAMPTZ DEFAULT now(),
  actualizado_en TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lista_formularios_token ON lista_formularios (token);


-- Fase 3: aprobaciones de registros.
CREATE TABLE IF NOT EXISTS lista_aprobaciones (
  id TEXT PRIMARY KEY,
  lista_id TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  estado TEXT DEFAULT 'pendiente',
  solicitado_por TEXT,
  decidido_por TEXT,
  comentario TEXT,
  decidido_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lista_aprobaciones_registro ON lista_aprobaciones (registro_id, creado_en DESC);


-- Fase 3: notificaciones internas de listas.
CREATE TABLE IF NOT EXISTS lista_notificaciones (
  id TEXT PRIMARY KEY,
  usuario_email TEXT NOT NULL,
  titulo TEXT,
  mensaje TEXT,
  link TEXT,
  tipo TEXT DEFAULT 'lista',
  leida BOOLEAN DEFAULT FALSE,
  creado_en TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lista_notificaciones_usuario ON lista_notificaciones (usuario_email, leida, creado_en DESC);


-- Adjuntos privados de listas (se descargan con autenticación).
CREATE TABLE IF NOT EXISTS lista_adjuntos (
  id TEXT PRIMARY KEY,
  lista_id TEXT NOT NULL,
  archivo TEXT NOT NULL,
  nombre TEXT,
  mime TEXT,
  size INTEGER DEFAULT 0,
  subido_por TEXT,
  creado_en TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lista_adjuntos_lista ON lista_adjuntos (lista_id, creado_en DESC);
