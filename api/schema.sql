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
  creado_en TIMESTAMPTZ DEFAULT now()
);

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
  empresa TEXT DEFAULT ''
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
  garantia JSONB,
  cotizacion JSONB,
  insumos_utilizados JSONB DEFAULT '[]',
  prueba_final JSONB DEFAULT '{"estado":"pending"}',
  diagnostico JSONB,
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