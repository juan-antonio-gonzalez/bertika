import 'dotenv/config';
import path from 'node:path';
import { createReadStream, readdirSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHmac, createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query, one, tx } from './db.js';
import { nextId } from './ids.js';
import { signToken, authRequired, requireRol, permisoRequerido, SECRET } from './middleware/auth.js';
import { PERMISOS, COLUMNAS, agruparPermisos, permisosPorDefecto, normalizarPermisos, permisosEfectivos, puedeVer, tienePermiso } from './permisos.js';
import { canTransition, ORDEN_ESTADOS, ESTADO_LABEL, MIN_CAPACIDAD_PCT, esEstadoCerrado , puedeTrabajarEnOrden } from './reglas.js';
import { obtenerDolar } from './dolar.js';
import { calcularVisita, normalizarConfig, CONFIG_DEFAULT, textoFueraCobertura } from '../src/data/cotizadorVisita.js';
import {
  enviarTexto, configPublicaWhatsApp, normalizarTelefono, normalizarEtiquetas, verificarFirma, ESTADO_ENTREGA,
  descargarMedia, pideBaja,
} from './whatsapp.js';
import { EVENTOS as EVENTOS_AVISO, PLANTILLA_POR_ESTADO, PLANTILLA_GARANTIA, normalizarAvisos, parametrosAviso, resumenAviso, debeAvisarGarantia, parametrosGarantia } from './avisos.js';
import {
  normalizarEtapa, normalizarMonto, normalizarTipoCliente, faltaMotivoPerdida,
  calcularMetricas, normalizarEstadoTarea,
} from './crm.js';
import { generarCodigoUnico, digitar, formatearCodigo } from './codigo.js';
import { normalizarBooleano } from './validaciones.js';
import { RESPUESTAS_EJEMPLO, colorDePaleta, normalizarAtajo, fragmentoConTexto } from '../src/data/respuestas.js';
import {
  AUTOMATIZACIONES, normalizarAutomatizaciones, debeSeguirPresupuesto, debePedirRetiro,
  tituloSeguimiento, tituloRetiro,
} from '../src/data/automatizaciones.js';
import { resumenSla } from '../src/data/sla.js';
import { filasCsv } from '../src/data/csv.js';
import { auditar, listarAuditoria } from './auditoria.js';
import { LEGAL_DOCS, LEGAL_META, textoLegalCanonico } from '../src/data/legal.js';
import { hashConsentimiento, hashLegalConsentimiento, verificarConsentimiento } from './privacidad-hash.js';
import {
  encolar, procesarEnvio, procesarPendientes, reintentarEnvio, listarEnvios, resumenOutbox, iniciarOutbox,
} from './outbox.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:5173';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || PUBLIC_URL).split(',').map((s) => s.trim());
const VERSION = (() => {
  try { return JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version || '1.0.0'; } catch { return '1.0.0'; }
})();
const BACKUP_DIR = process.env.BACKUP_DIR || '/var/backups/bertika';
// Errores 500 en memoria (ventana corta) para que el monitoreo avise si hay
// una racha. No se guardan en la base: si la base falla, esto igual funciona.
const errores5xx = [];

const app = express();
// Detras de nginx (1 proxy) req.ip debe ser la IP real del cliente para que
// el rate limiting sea por usuario y no uno compartido para todo el sitio.
app.set('trust proxy', 1);
app.use(helmet({ referrerPolicy: { policy: 'no-referrer' } }));
app.disable('x-powered-by');
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
// Se guarda el cuerpo crudo: la firma del webhook de WhatsApp se calcula sobre
// los bytes exactos que mando Meta, no sobre el JSON re-serializado.
app.use(express.json({
  limit: '2mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

// ---------- Correlacion de pedidos ----------
// Cada request lleva un id que se devuelve en la respuesta y se guarda en la
// auditoria. Cuando el cliente dice "me dio error", con ese id se encuentra la
// linea exacta en el log (antes solo habia console.log sin contexto).
app.use((req, res, next) => {
  const recibido = String(req.get('x-request-id') || '').slice(0, 80);
  req.requestId = recibido || randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
});

// Log estructurado solo de lo que importa: errores (4xx/5xx) y pedidos lentos.
// No se loguean los 200 normales para no llenar el disco.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const inicio = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - inicio;
    if (res.statusCode < 400 && ms < 2000) return;
    const linea = {
      nivel: res.statusCode >= 500 ? 'error' : (ms >= 2000 ? 'warn' : 'info'),
      fecha: new Date().toISOString(),
      reqId: req.requestId,
      metodo: req.method,
      ruta: req.path,
      status: res.statusCode,
      ms,
      ip: req.ip,
      usuario: req.user?.email || null,
    };
    const texto = JSON.stringify(linea);
    if (res.statusCode >= 500) {
      errores5xx.push(Date.now());
      const corte = Date.now() - 10 * 60 * 1000;
      while (errores5xx.length && errores5xx[0] < corte) errores5xx.shift();
      console.error(texto);
    } else console.warn(texto);
  });
  next();
});

// ---------- Rate limiting ----------
// Login: contiene el brute-force de credenciales.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Espera unos minutos y reintenta.' },
});

// Endpoints publicos: evitan abuso de consultas/seguimiento.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas. Intenta de nuevo en unos minutos.' },
});

// Contacto: limite estricto (anti-spam de ordenes/correos).
const contactoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite de envios alcanzado. Intenta de nuevo mas tarde.' },
});

export { PUBLIC_URL };

// ---------- helpers ----------
const fmtARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const nowIso = () => new Date().toISOString();

// ---------- validacion de entrada (hardening) ----------
const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const limStr = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max).replace(/\u0000/g, '') : '');
const validEmail = (e) => typeof e === 'string' && e.length <= 254 && EMAIL_RE.test(e);
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 72;
const arrBounded = (v, max = 50) => Array.isArray(v) && v.length <= max;
// Numero escrito a mano ("12,4") dentro de un rango fisico, o null si no sirve.
const numEnRango = (v, min, max) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// ---------- Correo (consultas del sitio -> ventas) ----------
const MAIL_TO = process.env.MAIL_TO || 'ventas@bertika.com';
const MAIL_FROM = process.env.MAIL_FROM || process.env.MAIL_USER || 'admin@bertika.com';

const mailer = (process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS)
  ? nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 465),
      secure: String(process.env.MAIL_SECURE ?? 'true') === 'true',
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    })
  : null;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Migraciones leves al arrancar (idempotentes): no requieren correr un script
// aparte ni recrear la base. Cada bloque es seguro de repetir.
// Indice unico de wa_message_id disponible (lo setea la migracion): con el se
// puede reservar el mensaje entrante de forma atomica sin carrera.
let indiceWamid = false;

async function asegurarCodigos() {
  await query('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS codigo_seguimiento TEXT');
  await query('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS medio_pago TEXT');
  // Aceptacion que origino la orden cuando entra por el formulario web.
  await query('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS consentimiento_id TEXT');
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
    indiceWamid = true;
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
}

async function enviarMailContacto(d) {
  const filas = [
    ['Nombre', d.nombre], ['Empresa', d.empresa], ['Email', d.email], ['Teléfono', d.telefono],
    ['Asunto', d.asunto], ['N° de serie', d.serie], ['Código de seguimiento', d.codigo],
    ['Cotización de visita', d.cotizacionDetalle], ['Mensaje', d.mensaje],
  ].filter(([, v]) => v && String(v).trim());
  const text = filas.map(([k, v]) => `${k}: ${v}`).join('\n');
  const asunto = `[Web Bertika] ${d.asunto || 'Consulta'} — ${d.nombre}${d.serie ? ` (serie ${d.serie})` : ''}`;
  const html = `<h2 style="font-family:Arial,sans-serif;color:#0a1740">Nueva consulta desde el sitio web</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
      ${filas.map(([k, v]) => `<tr><td style="background:#f2f4f8;font-weight:bold;vertical-align:top">${esc(k)}</td><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}
    </table>
    ${d.codigo ? `<p style="font-family:Arial,sans-serif;font-size:14px">El cliente puede seguir su reparación en tiempo real en <a href="https://www.bertika.com/seguimiento">bertika.com/seguimiento</a> con este código: <b style="letter-spacing:1px">${esc(d.codigo)}</b>.</p>` : ''}
    <p style="color:#888;font-size:12px;font-family:Arial,sans-serif">Enviado automáticamente por el formulario de contacto de bertika.com</p>`;
  if (!mailer) {
    console.warn('[mail] SMTP no configurado; la consulta NO se envió por correo:\n' + text);
    return { ok: false, skipped: true };
  }
  try {
    await mailer.sendMail({ from: MAIL_FROM, to: MAIL_TO, replyTo: d.email, subject: asunto, text, html });
    return { ok: true };
  } catch (err) {
    console.error('[mail] error al enviar:', err.message);
    return { ok: false, error: err.message };
  }
}

// ---------- autorizacion (RBAC + ownership) ----------
const esAdmin = (req) => req.user.rol === 'admin';
const esTecnico = (req) => req.user.rol === 'tecnico';
const esCliente = (req) => req.user.rol === 'cliente';

function puedeLeerOrden(req, orden) {
  if (esAdmin(req)) return true;
  // Regla del taller: NO hay cartera de clientes asignada. Cualquier tecnico
  // trabaja con cualquier orden (de cualquier cliente): la asignacion
  // (tecnico_id) es solo informativa, para saber quien la esta haciendo.
  if (esTecnico(req)) return puedeTrabajarEnOrden(req.user?.rol);
  if (esCliente(req)) return orden.cliente_id === req.user.cliente_id;
  return false;
}

function puedeEscribirOrden(req, _orden) {
  if (esAdmin(req)) return true;
  // Mismo criterio: cualquier tecnico puede cargar diagnostico, cotizacion,
  // insumos y prueba final en cualquier orden. Lo que sigue reservado al admin
  // es entregar, cancelar y dar de baja (y las guardias de estado impiden tocar
  // ordenes ya entregadas o canceladas).
  if (esTecnico(req)) return puedeTrabajarEnOrden(req.user?.rol);
  return false;
}

// Las ordenes cerradas (entregadas o canceladas) no se modifican: cotizar,
// mover insumos o sacar fotos sobre una orden ya cobrada rompia el stock, los
// montos y la trazabilidad. Devuelve true si ya respondio (la ruta hace return).
function rechazarSiCerrada(orden, res) {
  if (!esEstadoCerrado(orden?.estado)) return false;
  const etiqueta = (ESTADO_LABEL[orden.estado] || orden.estado).toLowerCase();
  res.status(400).json({ error: `La orden ya está ${etiqueta}: no se puede modificar. Si hay que corregir algo, avisale al administrador.` });
  return true;
}

// Filtro SQL para que cada usuario solo vea/opere sus propias notificaciones.
function notifWhere(req) {
  if (esAdmin(req)) return { clause: 'TRUE', params: [] };
  if (esTecnico(req)) {
    return { clause: 'EXISTS (SELECT 1 FROM ordenes o WHERE o.id = n.orden_id AND o.tecnico_id = $1)', params: [req.user.tecnico_id] };
  }
  if (esCliente(req)) {
    return { clause: 'EXISTS (SELECT 1 FROM ordenes o WHERE o.id = n.orden_id AND o.cliente_id = $1)', params: [req.user.cliente_id] };
  }
  return { clause: 'FALSE', params: [] };
}

// Capacidad firmada para enlaces publicos de cotizacion (aprueba/rechaza/lee)
function hornoSigCot(ordenId) {
  return createHmac('sha256', SECRET).update(`cot:${ordenId}`).digest('hex');
}
function validarSigCot(ordenId, t) {
  if (!t) return false;
  const a = Buffer.from(hornoSigCot(ordenId), 'utf8');
  const b = Buffer.from(String(t), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

// Actor de una accion: quien la ejecuta. null = automatico/web (sin sesion).
// Se guarda en el evento para poder auditar quien hizo cada paso del taller.
const actorDe = (req) => (req?.user
  ? { id: req.user.sub, email: req.user.email, rol: req.user.rol, ref: req.user.tecnico_id || req.user.cliente_id || null }
  : null);

// ---------- Privacidad y consentimientos ----------
// El hash HMAC prueba que el registro no fue alterado. Se puede usar un secreto
// propio (PRIVACY_HASH_SECRET) o, mientras no exista, el mismo JWT_SECRET.
const PRIVACY_HASH_SECRET = process.env.PRIVACY_HASH_SECRET || SECRET;
const PRIVACY_EMAIL = process.env.PRIVACY_EMAIL || LEGAL_META.emailPrivacidad;
const hashesLegales = new Map();

function hashLegal(clave) {
  if (hashesLegales.has(clave)) return hashesLegales.get(clave);
  const doc = LEGAL_DOCS[clave];
  if (!doc) throw { status: 500, message: `Falta el documento legal ${clave}` };
  const hash = createHash('sha256').update(textoLegalCanonico(doc.html), 'utf8').digest('hex');
  hashesLegales.set(clave, hash);
  return hash;
}

function documentoLegal(clave, version) {
  const doc = LEGAL_DOCS[clave];
  if (!doc) throw { status: 500, message: `Falta el documento legal ${clave}` };
  if (String(version || '') !== doc.version) {
    throw { status: 400, message: `La versión de ${doc.titulo.toLowerCase()} cambió. Recargá la página y volvé a aceptar.` };
  }
  // URL exacta del archivo congelado: la constancia queda atada al texto que
  // la persona tenía delante, no al texto que esté publicado hoy.
  return { version: doc.version, url: `/legal/archivo/${doc.version}/${clave}.html`, hash: hashLegal(clave) };
}

// Guarda un consentimiento. Valida la versión contra el documento publicado y
// exige las dos aceptaciones en los formularios. Devuelve { id, duplicado }.
async function guardarConsentimientoLegal({
  req, tipo, nombre = null, email = null, idempotencyKey = null,
  canal = 'web', accion = null, motivo = null, cookies = null,
  terminosVersion = null, privacidadVersion = null,
  aceptaTerminos = false, aceptaPrivacidad = false,
  origen = null, pagina = null,
}) {
  const tipoT = String(tipo || '').trim().toLowerCase();
  if (!['cookies', 'formulario', 'retiro'].includes(tipoT)) {
    throw { status: 400, message: 'Tipo de consentimiento inválido' };
  }
  const emailT = String(email || '').trim().toLowerCase();
  const nombreT = limStr(nombre, 120) || null;
  const ip = limStr(req?.ip, 60) || null;
  const userAgent = limStr(req?.get?.('user-agent'), 400) || null;
  const origenT = limStr(origen, 120) || null;
  const paginaT = limStr(pagina, 200) || null;
  const canalT = ['email', 'whatsapp', 'banner', 'web'].includes(String(canal)) ? String(canal) : 'web';
  const accionT = limStr(accion, 40) || null;
  const motivoT = limStr(motivo, 500) || null;
  const idemT = limStr(idempotencyKey, 60) || null;

  let term = { version: null, url: null, hash: null };
  let priv = { version: null, url: null, hash: null };
  let cookiesFilas = { necesarias: false, analiticas: false, marketing: false, version: null };

  if (tipoT === 'formulario') {
    if (normalizarBooleano(aceptaTerminos) !== true || normalizarBooleano(aceptaPrivacidad) !== true) {
      throw { status: 400, message: 'Tenés que aceptar los términos y la política de privacidad para enviar el formulario.' };
    }
    term = documentoLegal('terminos', terminosVersion);
    priv = documentoLegal('privacidad', privacidadVersion);
  } else if (tipoT === 'cookies') {
    cookiesFilas = {
      necesarias: true,
      analiticas: cookies?.analiticas === true,
      marketing: cookies?.marketing === true,
      version: documentoLegal('cookies', cookies?.version || null).version,
    };
  } else {
    if (!validEmail(emailT)) throw { status: 400, message: 'Falta un email válido para la solicitud.' };
  }

  const fila = {
    id: `cons_${randomUUID()}`,
    tipo: tipoT,
    nombre: nombreT,
    email: emailT || null,
    ip,
    user_agent: userAgent,
    origen: origenT,
    pagina: paginaT,
    acepta_terminos: tipoT === 'formulario',
    terminos_version: term.version,
    terminos_url: term.url,
    terminos_hash: term.hash,
    acepta_privacidad: tipoT === 'formulario',
    privacidad_version: priv.version,
    privacidad_url: priv.url,
    privacidad_hash: priv.hash,
    cookies_necesarias: tipoT === 'cookies' ? true : cookiesFilas.necesarias,
    cookies_analiticas: tipoT === 'cookies' ? cookiesFilas.analiticas : false,
    cookies_marketing: tipoT === 'cookies' ? cookiesFilas.marketing : false,
    cookies_version: tipoT === 'cookies' ? cookiesFilas.version : null,
    accion: accionT,
    canal: canalT,
    motivo: motivoT,
    idempotency_key: idemT,
    hash_version: 2,
  };
  fila.hash = hashConsentimiento(fila, PRIVACY_HASH_SECRET);
  fila.hash_legal = hashLegalConsentimiento(fila, PRIVACY_HASH_SECRET);

  try {
    await query(
      `INSERT INTO consentimientos
        (id, tipo, nombre, email, ip, user_agent, origen, pagina,
         acepta_terminos, terminos_version, terminos_url, terminos_hash,
         acepta_privacidad, privacidad_version, privacidad_url, privacidad_hash,
         cookies_necesarias, cookies_analiticas, cookies_marketing, cookies_version,
         accion, canal, motivo, idempotency_key, hash_version, hash, hash_legal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
      [
        fila.id, fila.tipo, fila.nombre, fila.email, fila.ip, fila.user_agent, fila.origen, fila.pagina,
        fila.acepta_terminos, fila.terminos_version, fila.terminos_url, fila.terminos_hash,
        fila.acepta_privacidad, fila.privacidad_version, fila.privacidad_url, fila.privacidad_hash,
        fila.cookies_necesarias, fila.cookies_analiticas, fila.cookies_marketing, fila.cookies_version,
        fila.accion, fila.canal, fila.motivo, fila.idempotency_key, fila.hash_version, fila.hash, fila.hash_legal,
      ]
    );
    return { id: fila.id, duplicado: false, hash: fila.hash };
  } catch (e) {
    if (e.code === '23505' && idemT) {
      const existente = await one('SELECT id FROM consentimientos WHERE idempotency_key = $1', [idemT]);
      if (existente) return { id: existente.id, duplicado: true, hash: fila.hash };
    }
    throw e;
  }
}

// ---------- Salud del sistema y alertas ----------
// /api/health es publico y minimo (para un monitor de uptime). El detalle
// (cola, respaldo, memoria) es solo para quien tiene la seccion "sistema".
const ALERTAS_EMAIL = process.env.ALERTAS_EMAIL || MAIL_TO;
const ALERTAS_WEBHOOK = process.env.ALERTAS_WEBHOOK || '';
const ALERTAS_MIN_MS = 30 * 60 * 1000; // no repetir la misma alerta antes de 30 min

function respaldoMasReciente() {
  try {
    const archivos = readdirSync(BACKUP_DIR).filter((n) => /^bertika_.*\.sql(\.gz)?$/.test(n));
    let mejor = null;
    for (const nombre of archivos) {
      const st = statSync(path.join(BACKUP_DIR, nombre));
      if (!mejor || st.mtimeMs > mejor.mtimeMs) mejor = { nombre, mtimeMs: st.mtimeMs, fecha: st.mtime, bytes: st.size };
    }
    if (!mejor) return null;
    return {
      nombre: mejor.nombre,
      fecha: mejor.fecha.toISOString(),
      bytes: mejor.bytes,
      horas: Math.round(((Date.now() - mejor.mtimeMs) / 3600000) * 10) / 10,
    };
  } catch {
    return null; // en desarrollo no existe /var/backups/bertika
  }
}

async function estadoSistema() {
  const t0 = Date.now();
  let db = { ok: true, ms: 0 };
  try {
    await query('SELECT 1');
    db = { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    db = { ok: false, error: e.message };
  }
  let outbox = null;
  try { outbox = await resumenOutbox(); } catch (e) { outbox = { error: e.message }; }
  const respaldo = respaldoMasReciente();
  const memoria = process.memoryUsage();
  return {
    ok: db.ok,
    version: VERSION,
    node: process.version,
    uptimeSeg: Math.round(process.uptime()),
    memoriaMB: Math.round(memoria.rss / 1024 / 1024),
    hora: nowIso(),
    db,
    outbox,
    respaldo,
    whatsapp: configPublicaWhatsApp(),
    alertas: {
      email: Boolean(mailer),
      destinoEmail: mailer ? ALERTAS_EMAIL : null,
      webhook: Boolean(ALERTAS_WEBHOOK),
      ultimaRacha5xx: errores5xx.length,
    },
  };
}

// Manda una alerta por email y/o webhook. Si no hay ningun canal configurado
// queda en el log del servidor, que es lo minimo para no perderla.
async function alertarSistema(tipo, mensaje, { forzar = false, detalle = null } = {}) {
  const clase = String(tipo || 'general').slice(0, 40);
  try {
    if (!forzar) {
      const ultima = await one(
        "SELECT fecha FROM alertas_log WHERE tipo = $1 AND ok = true ORDER BY fecha DESC LIMIT 1",
        [clase]
      );
      if (ultima && Date.now() - new Date(ultima.fecha).getTime() < ALERTAS_MIN_MS) return { omitida: true };
    }
  } catch { /* si falla la consulta, igual se intenta avisar */ }

  const asunto = `[Bertika] ${clase}: ${String(mensaje).slice(0, 120)}`;
  const cuerpo = `${mensaje}${detalle ? `\n\n${JSON.stringify(detalle, null, 2).slice(0, 4000)}` : ''}\n\n${nowIso()}`;
  const resultados = [];

  if (mailer) {
    try {
      await mailer.sendMail({ from: MAIL_FROM, to: ALERTAS_EMAIL, subject: asunto, text: cuerpo });
      resultados.push({ canal: 'email', ok: true, destino: ALERTAS_EMAIL });
    } catch (e) {
      resultados.push({ canal: 'email', ok: false, destino: ALERTAS_EMAIL, error: e.message });
    }
  }
  if (ALERTAS_WEBHOOK) {
    try {
      const r = await fetch(ALERTAS_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: clase, mensaje, detalle, fecha: nowIso() }),
      });
      resultados.push({ canal: 'webhook', ok: r.ok });
    } catch (e) {
      resultados.push({ canal: 'webhook', ok: false, error: e.message });
    }
  }
  if (!resultados.length) {
    console.warn(`[alerta] ${asunto}\n${cuerpo}`);
  }
  const ok = resultados.length ? resultados.some((r) => r.ok) : true;
  try {
    await query(
      'INSERT INTO alertas_log (id, tipo, mensaje, canal, destino, ok) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        `alt_${randomUUID()}`, clase, String(mensaje).slice(0, 500),
        resultados.map((r) => r.canal).join(',') || 'log',
        resultados.map((r) => r.destino).filter(Boolean).join(',') || null,
        ok,
      ]
    );
  } catch (e) {
    console.error('[alerta] no se pudo guardar el registro:', e.message);
  }
  return { ok, resultados };
}

// Revision periodica (cada 5 min): base, cola de salida, respaldo y racha de 500.
async function revisarSistema() {
  try {
    const est = await estadoSistema();
    if (!est.db.ok) {
      await alertarSistema('base_de_datos', 'La API no puede consultar la base de datos.', { detalle: est.db });
    }
    const o = est.outbox || {};
    const esperandoDesde = o.proximoIntento ? Date.now() - new Date(o.proximoIntento).getTime() : 0;
    if (o.pendientes > 0 && esperandoDesde > 15 * 60 * 1000) {
      await alertarSistema('outbox_atascado', `Hay ${o.pendientes} envío(s) esperando desde hace más de 15 minutos.`);
    }
    if (o.fallidos >= 3) {
      await alertarSistema('envios_fallidos', `Hay ${o.fallidos} envío(s) de WhatsApp fallidos. Revisalos en Sistema → Envíos.`);
    }
    if (est.respaldo && est.respaldo.horas > 36) {
      await alertarSistema('respaldo_viejo', `El último respaldo tiene ${est.respaldo.horas} horas.`);
    }
    if (errores5xx.length >= 5) {
      await alertarSistema('errores_500', `Hubo ${errores5xx.length} errores 500 en los últimos 10 minutos.`);
      errores5xx.length = 0;
    }
  } catch (e) {
    console.error('[monitoreo] no se pudo revisar el sistema:', e.message);
  }
}

let monitorTimer = null;
function iniciarMonitoreo({ intervaloMs = 5 * 60 * 1000 } = {}) {
  if (monitorTimer) return;
  monitorTimer = setInterval(() => { revisarSistema(); }, intervaloMs);
  if (monitorTimer.unref) monitorTimer.unref();
  const primera = setTimeout(() => { revisarSistema(); }, 30 * 1000);
  if (primera.unref) primera.unref();
}

async function pushEvento(client, ordenId, tipo, detalle, actor = null) {
  const evId = await nextId('ev', client);
  const ev = { id: evId, tipo, detalle, fecha: nowIso(), usuario: actor };
  await client.query(
    `UPDATE ordenes SET eventos = eventos || $2::jsonb WHERE id = $1`,
    [ordenId, JSON.stringify([ev])]
  );
  return ev;
}

// Movimiento de stock de un insumo (alta, ingreso, consumo, reversion, ajuste).
async function movimientoInsumo(client, { insumoId, tipo, cantidad, stockResultante, motivo, ordenId = null, actor = null }) {
  const id = await nextId('mov', client);
  const sql = `INSERT INTO insumos_movimientos (id, insumo_id, tipo, cantidad, stock_resultante, motivo, orden_id, usuario)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`;
  const params = [id, insumoId, tipo, Number(cantidad) || 0, stockResultante, limStr(motivo, 200), ordenId, JSON.stringify(actor)];
  if (client && typeof client.query === 'function') await client.query(sql, params);
  else await query(sql, params);
  return id;
}

async function notificar(client, ordenId, mensaje, canal = 'WhatsApp') {
  const nId = await nextId('nt', client);
  const sql = 'INSERT INTO notificaciones (id, orden_id, mensaje, canal) VALUES ($1,$2,$3,$4)';
  const params = [nId, ordenId, mensaje, canal];
  if (client && typeof client.query === 'function') {
    await client.query(sql, params);
  } else {
    // Sin transaccion abierta: se inserta con el pool propio (evita crash por client null)
    await query(sql, params);
  }
}

// Notificacion interna "best effort": si falla, queda en el log pero no se le
// devuelve error al taller. Antes, si esta inserción fallaba, el endpoint
// respondia 400 con el cambio ya aplicado (y el usuario reintentaba).
function notificarSinFrenar(client, ordenId, mensaje, canal = 'WhatsApp') {
  notificar(client, ordenId, mensaje, canal).catch((e) => console.error(`[notificacion] no se pudo registrar: ${e.message}`));
}

const eventoArgs = {
  diagnosing: ['diagnostico', 'Diagnóstico iniciado'],
  quoted: ['cotizacion', 'Cotización generada'],
  approved: ['aprobada', 'Cotización aprobada por el cliente'],
  in_repair: ['reparacion', 'Reparación iniciada'],
  testing: ['prueba_iniciada', 'Prueba final iniciada'],
  ready: ['reparacion_completada', 'Reparación completada'],
  delivered: ['entregada', 'Batería entregada'],
  cancelled: ['cancelada', 'Orden cancelada'],
};

async function transition(cliente, orden, target, detalle, actor = null) {
  const check = canTransition(orden, target);
  if (!check.ok) throw { status: 400, message: check.err };
  const [tipo, def] = eventoArgs[target] || [target, `Estado cambiado a ${target}`];
  await pushEvento(cliente, orden.id, tipo, detalle || def, actor);
  const sets = { estado: target };
  if (target === 'quoted') sets.estado_cotizacion = 'pending';
  if (target === 'approved') sets.estado_cotizacion = 'approved';
  if (target === 'delivered') sets.fecha_entrega = nowIso();
  // Control optimista: el UPDATE solo vale si la orden sigue en el estado que
  // leimos. Si otro la movio en el medio, no se pisa y se avisa para recargar.
  const upd = await cliente.query(
    `UPDATE ordenes SET estado = $2, estado_cotizacion = COALESCE($3, estado_cotizacion), fecha_entrega = COALESCE($4, fecha_entrega)
     WHERE id = $1 AND estado = $5`,
    [orden.id, sets.estado, sets.estado_cotizacion ?? null, sets.fecha_entrega ?? null, orden.estado]
  );
  if (upd.rowCount === 0) throw { status: 409, message: 'La orden cambió de estado mientras la mirabas: recargá y volvé a intentar.' };
  // notificaciones simuladas
  if (target === 'ready') await notificar(cliente, orden.id, `Orden ${orden.id}: reparación completada, batería lista para retirar.`, 'WhatsApp');
  if (target === 'delivered') await notificar(cliente, orden.id, `Orden ${orden.id}: batería entregada y cobrada. Garantía activada.`, 'WhatsApp');
  if (target === 'approved') await notificar(cliente, orden.id, `Orden ${orden.id}: cotización aprobada. Comienza la reparación.`, 'Email');
}

// ---------- Salud, auditoria y cola de salida ----------
// Monitor de uptime: publico y sin datos sensibles. Si la base no responde, 503.
app.get('/api/health', async (req, res) => {
  const t0 = Date.now();
  try {
    await query('SELECT 1');
    return res.json({ ok: true, version: VERSION, uptimeSeg: Math.round(process.uptime()), dbMs: Date.now() - t0, hora: nowIso() });
  } catch {
    return res.status(503).json({ ok: false, version: VERSION, error: 'base de datos', hora: nowIso() });
  }
});

// Consentimiento de cookies (público). La versión se valida contra el texto
// publicado; si el texto cambió, el navegador tiene que recargar y aceptar de nuevo.
app.post('/api/consentimiento', publicLimiter, async (req, res) => {
  const { cookies, source, page, cookiesVersion, accion } = req.body || {};
  if (!cookies || typeof cookies !== 'object') {
    return res.status(400).json({ error: 'Falta la decisión de cookies' });
  }
  const r = await guardarConsentimientoLegal({
    req,
    tipo: 'cookies',
    cookies: {
      necesarias: true,
      analiticas: cookies.analiticas === true,
      marketing: cookies.marketing === true,
      version: cookiesVersion,
    },
    canal: 'banner',
    accion: limStr(accion, 40) || 'configurar',
    origen: limStr(source, 120) || 'banner',
    pagina: limStr(page, 200) || null,
  });
  return res.status(201).json({ ok: true, id: r.id, duplicado: r.duplicado });
});

// Retiro de consentimiento y derechos de datos (público). Guarda la solicitud
// antes de avisar por correo: si el correo falla, la solicitud no se pierde.
app.post('/api/privacidad/solicitud', contactoLimiter, async (req, res) => {
  const { email, nombre, tipo, motivo, declara, website, idempotencyKey } = req.body || {};
  if (website) return res.status(201).json({ ok: true, descartado: true });
  if (normalizarBooleano(declara) !== true) {
    return res.status(400).json({ error: 'Tenés que declarar que sos el titular o que actuás en su nombre.' });
  }
  const emailT = String(email || '').trim();
  if (!validEmail(emailT)) return res.status(400).json({ error: 'Falta un email válido.' });
  const detalle = [limStr(tipo, 120), limStr(motivo, 500)].filter(Boolean).join(' · ');
  const r = await guardarConsentimientoLegal({
    req,
    tipo: 'retiro',
    email: emailT,
    nombre: limStr(nombre, 120),
    idempotencyKey,
    motivo: detalle || 'Solicitud de derechos',
    canal: 'web',
    accion: 'retiro',
    origen: 'formulario_privacidad',
    pagina: '/legal/privacidad/retirar',
  });
  try {
    if (mailer) {
      await mailer.sendMail({
        from: MAIL_FROM,
        to: PRIVACY_EMAIL,
        subject: '[Bertika] Solicitud de privacidad',
        text: `Solicitud de privacidad\n\nTipo: ${detalle || '—'}\nNombre: ${limStr(nombre, 120) || '—'}\nEmail: ${emailT}\nFecha: ${nowIso()}\nRegistro: ${r.id}\n\nIngresá al panel (Sistema → Privacidad) para verificarla y responder.`,
      });
    } else {
      console.warn('[privacidad] SMTP no configurado; la solicitud quedó guardada en el panel.');
    }
  } catch (e) {
    console.error('[privacidad] no se pudo enviar el aviso por correo:', e.message);
  }
  return res.status(201).json({ ok: true, id: r.id, duplicado: r.duplicado });
});

// Detalle para el panel (Sistema): cola, respaldo, memoria y canales de alerta.
app.get('/api/salud', authRequired, permisoRequerido('sistema'), async (req, res) => {
  return res.json(await estadoSistema());
});

// Historial de cambios. Filtros por tabla, registro, actor y fecha.
app.get('/api/auditoria', authRequired, permisoRequerido('sistema'), async (req, res) => {
  const aFecha = (v) => {
    if (!v) return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  const filas = await listarAuditoria({
    tabla: req.query?.tabla,
    registroId: req.query?.registro_id,
    actor: req.query?.actor,
    desde: aFecha(req.query?.desde),
    hasta: aFecha(req.query?.hasta),
    limite: req.query?.limite,
  });
  return res.json({ filas });
});

// Registro de consentimientos para el panel de privacidad (solo admin/sistema).
function filtrosConsentimientos(req) {
  const cond = [];
  const args = [];
  const tipo = limStr(req.query?.tipo, 20);
  if (['cookies', 'formulario', 'retiro'].includes(tipo)) {
    args.push(tipo);
    cond.push(`tipo = $${args.length}`);
  }
  const email = limStr(req.query?.email, 200).toLowerCase();
  if (email) {
    args.push(email);
    cond.push(`LOWER(email) = $${args.length}`);
  }
  const q = limStr(req.query?.q, 120);
  if (q) {
    args.push(`%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    cond.push(`(COALESCE(nombre, '') ILIKE $${args.length} OR COALESCE(email, '') ILIKE $${args.length})`);
  }
  const fecha = (v) => {
    if (!v) return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  const desde = fecha(req.query?.desde);
  if (desde) { args.push(desde); cond.push(`creado_en >= $${args.length}`); }
  const hasta = fecha(req.query?.hasta);
  if (hasta) { args.push(hasta); cond.push(`creado_en <= $${args.length}`); }
  return { cond, args };
}

app.get('/api/privacidad/consentimientos', authRequired, permisoRequerido('sistema'), async (req, res) => {
  const { cond, args } = filtrosConsentimientos(req);
  const limite = Math.max(1, Math.min(Number(req.query?.limite) || 100, 500));
  args.push(limite);
  const filas = await query(
    `SELECT id, creado_en, tipo, nombre, email, ip, user_agent, origen, pagina,
            acepta_terminos, terminos_version, terminos_url, terminos_hash,
            acepta_privacidad, privacidad_version, privacidad_url, privacidad_hash,
            cookies_necesarias, cookies_analiticas, cookies_marketing, cookies_version,
            accion, canal, motivo, idempotency_key, hash_version, hash, hash_legal, anonimizado_en
       FROM consentimientos
       ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
      ORDER BY creado_en DESC
      LIMIT $${args.length}`,
    args
  );
  const resumenFilas = await query('SELECT tipo, count(*)::int AS n FROM consentimientos GROUP BY tipo');
  const resumen = { total: 0, cookies: 0, formulario: 0, retiro: 0 };
  for (const r of resumenFilas) {
    resumen[r.tipo] = Number(r.n) || 0;
    resumen.total += Number(r.n) || 0;
  }
  return res.json({
    filas: filas.map((f) => ({ ...f, ...verificarConsentimiento(f, PRIVACY_HASH_SECRET) })),
    resumen,
  });
});

app.get('/api/privacidad/consentimientos/export', authRequired, permisoRequerido('sistema'), async (req, res) => {
  const { cond, args } = filtrosConsentimientos(req);
  const filas = await query(
    `SELECT creado_en, tipo, nombre, email, ip, user_agent, origen, pagina,
            acepta_terminos, terminos_version, terminos_url, terminos_hash,
            acepta_privacidad, privacidad_version, privacidad_url, privacidad_hash,
            cookies_necesarias, cookies_analiticas, cookies_marketing, cookies_version,
            accion, canal, motivo, idempotency_key, hash_version, hash, hash_legal, anonimizado_en
       FROM consentimientos
       ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
      ORDER BY creado_en DESC
      LIMIT 5000`,
    args
  );
  const encabezado = ['fecha', 'tipo', 'nombre', 'email', 'ip', 'navegador', 'origen', 'pagina',
    'acepta_terminos', 'terminos_version', 'terminos_url', 'terminos_hash',
    'acepta_privacidad', 'privacidad_version', 'privacidad_url', 'privacidad_hash',
    'cookies_necesarias', 'cookies_analiticas', 'cookies_marketing', 'cookies_version',
    'accion', 'canal', 'motivo', 'idempotencia', 'hash_version', 'hash', 'hash_legal', 'anonimizado_en'];
  const csv = filasCsv([
    encabezado,
    ...filas.map((f) => [
      f.creado_en instanceof Date ? f.creado_en.toISOString() : f.creado_en,
      f.tipo, f.nombre, f.email, f.ip, f.user_agent, f.origen, f.pagina,
      f.acepta_terminos ? 'si' : 'no', f.terminos_version, f.terminos_url, f.terminos_hash,
      f.acepta_privacidad ? 'si' : 'no', f.privacidad_version, f.privacidad_url, f.privacidad_hash,
      f.cookies_necesarias ? 'si' : 'no', f.cookies_analiticas ? 'si' : 'no', f.cookies_marketing ? 'si' : 'no',
      f.cookies_version, f.accion, f.canal, f.motivo, f.idempotency_key, f.hash_version, f.hash, f.hash_legal,
      f.anonimizado_en instanceof Date ? f.anonimizado_en.toISOString() : f.anonimizado_en,
    ]),
  ], { separador: ';' });
  await auditar({ req, tabla: 'consentimientos', accion: 'exportar', detalle: `${filas.length} registro(s)` });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bertika-privacidad-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
});

app.get('/api/privacidad/consentimientos/:id', authRequired, permisoRequerido('sistema'), async (req, res) => {
  const fila = await one('SELECT * FROM consentimientos WHERE id = $1', [req.params.id]);
  if (!fila) return res.status(404).json({ error: 'Registro no encontrado' });
  return res.json({ ...fila, ...verificarConsentimiento(fila, PRIVACY_HASH_SECRET) });
});

app.post('/api/privacidad/consentimientos/:id/anonimizar', authRequired, permisoRequerido('sistema'), async (req, res) => {
  const fila = await one('SELECT id, anonimizado_en FROM consentimientos WHERE id = $1', [req.params.id]);
  if (!fila) return res.status(404).json({ error: 'Registro no encontrado' });
  if (fila.anonimizado_en) return res.status(409).json({ error: 'Ese registro ya estaba anonimizado' });
  await query(
    `UPDATE consentimientos
        SET nombre = NULL, email = NULL, ip = NULL, user_agent = NULL, anonimizado_en = now()
      WHERE id = $1`,
    [fila.id]
  );
  await auditar({
    req, tabla: 'consentimientos', registroId: fila.id, accion: 'anonimizar',
    detalle: 'Se quitaron los datos identificatorios y se conservó la prueba del consentimiento.',
  });
  return res.json({ ok: true });
});

// Cola de salida de WhatsApp: que se mando, que espera y que fallo.
app.get('/api/whatsapp/envios', authRequired, permisoRequerido('sistema', 'whatsapp'), async (req, res) => {
  const [resumen, filas] = await Promise.all([
    resumenOutbox(),
    listarEnvios({ estado: req.query?.estado, limite: req.query?.limite }),
  ]);
  return res.json({ resumen, filas });
});

// Reintento manual de un envio fallido o incierto.
app.post('/api/whatsapp/envios/:id/reintentar', authRequired, permisoRequerido('sistema', 'responder_whatsapp'), async (req, res) => {
  const r = await reintentarEnvio(req.params.id);
  await auditar({ req, tabla: 'wa_outbox', registroId: req.params.id, accion: 'reintentar_envio', detalle: r.estado || r.error });
  if (!r.ok && r.status) return res.status(r.status).json({ error: r.error });
  return res.json(r);
});

// Fuerza un tick del worker (util si el proceso estuvo caido o para probar).
app.post('/api/whatsapp/envios/procesar', authRequired, permisoRequerido('sistema'), async (req, res) => {
  return res.json(await procesarPendientes({ limite: 50 }));
});

// ---------- Auth ----------
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!validEmail(email) || !password || password.length > 128) {
    return res.status(400).json({ error: 'Faltan email y password' });
  }
  const u = await one('SELECT * FROM usuarios WHERE email = $1 AND activo = true', [String(email).toLowerCase().trim()]);
  if (!u || !(await bcrypt.compare(String(password), u.password_hash))) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }
  const token = signToken(u);
  const user = { id: u.id, email: u.email, rol: u.rol, tecnico_id: u.tecnico_id, cliente_id: u.cliente_id, permisos: permisosEfectivos({ rol: u.rol, permisos: u.permisos }) };
  return res.json({ token, user });
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const u = await one('SELECT * FROM usuarios WHERE id = $1', [req.user.sub]);
  if (!u) return res.status(401).json({ error: 'Usuario inexistente' });
  return res.json({ id: u.id, email: u.email, rol: u.rol, tecnico_id: u.tecnico_id, cliente_id: u.cliente_id, permisos: permisosEfectivos({ rol: u.rol, permisos: u.permisos }) });
});

// Cambio de contrasena de la PROPIA cuenta: cualquier rol autenticado.
// Exige la contrasena actual; el PATCH /api/usuarios/:id sigue siendo solo admin.
app.post('/api/auth/password', authRequired, async (req, res) => {
  const { password_actual, password } = req.body || {};
  if (!validPassword(password)) {
    return res.status(400).json({ error: 'La contrasena nueva debe tener entre 8 y 72 caracteres' });
  }
  const u = await one('SELECT * FROM usuarios WHERE id = $1', [req.user.sub]);
  if (!u || !u.activo) return res.status(401).json({ error: 'Usuario inexistente o inactivo' });
  if (!password_actual || !(await bcrypt.compare(String(password_actual), u.password_hash))) {
    return res.status(401).json({ error: 'La contrasena actual no es correcta' });
  }
  await query('UPDATE usuarios SET password_hash = $2 WHERE id = $1', [u.id, await bcrypt.hash(String(password), BCRYPT_ROUNDS)]);
  return res.json({ ok: true });
});

// ---------- Estado global (para sincronizar el store) ----------
// Se expone segun rol: admin ve todo; tecnico ve catalogos y sus ordenes
// asignadas (+ no asignadas en recepcion); cliente ve solo sus datos.
app.get('/api/estado', authRequired, async (req, res) => {
  const rol = req.user.rol;
  const deps = ['tecnicos', 'clientes', 'baterias', 'insumos', 'ordenes', 'bajas', 'notificaciones'];
  const out = {};
  for (const t of deps) {
    if (rol === 'cliente' && (t === 'insumos' || t === 'bajas')) { out[t] = []; continue; }
    if (rol !== 'admin' && t === 'bajas') { out[t] = []; continue; }
    // Los clientes dados de baja (papelera) no se mandan al panel: se recuperan
    // desde /api/clientes?papelera=1 (solo admin).
    out[t] = await query(t === 'clientes' ? 'SELECT * FROM clientes WHERE deleted_at IS NULL' : `SELECT * FROM ${t}`);
  }
  // "Que ve": los catalogos de las secciones que el usuario no tiene
  // habilitadas se mandan vacios, asi el panel no expone datos de mas.
  for (const [tabla, seccion] of Object.entries({ clientes: 'clientes', tecnicos: 'tecnicos', insumos: 'inventario', bajas: 'baja' })) {
    if (!puedeVer(req.user, seccion)) out[tabla] = [];
  }
  if (rol === 'cliente') {
    const propias = out.ordenes.filter((o) => o.cliente_id === req.user.cliente_id);
    const series = new Set(propias.map((o) => o.bateria_serie));
    out.ordenes = propias;
    out.clientes = out.clientes.filter((c) => c.id === req.user.cliente_id);
    out.baterias = out.baterias.filter((b) => b.cliente_id === req.user.cliente_id || series.has(b.numero_serie));
    out.tecnicos = out.tecnicos.map((t) => ({ id: t.id, nombre: t.nombre }));
    out.notificaciones = out.notificaciones.filter((n) => propias.some((o) => o.id === n.orden_id));
  }
  const cont = await query('SELECT * FROM contadores');
  const seq = {};
  for (const c of cont) seq[c.nombre] = c.valor;
  out.seq = seq;
  // Permisos efectivos del usuario: el panel los usa para mostrar u ocultar.
  out.permisos = req.user.permisos;
  // Tareas del CRM: el admin ve todas las pendientes; el tecnico las suyas y las
  // que no tienen responsable; el cliente ninguna.
  if (rol === 'cliente') {
    out.tareas = [];
  } else {
    out.tareas = await query(
      `SELECT * FROM wa_tareas WHERE estado = 'pendiente'
       ${rol === 'admin' ? '' : 'AND (asignado_a = $1 OR asignado_a IS NULL)'}
       ORDER BY vence ASC NULLS LAST LIMIT 200`,
      rol === 'admin' ? [] : [req.user.email]
    );
  }
  return res.json(out);
});

// ---------- Ordenes ----------
app.get('/api/ordenes/:id', authRequired, async (req, res) => {
  const o = await one('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!puedeLeerOrden(req, o)) return res.status(403).json({ error: 'Sin permisos para esta orden' });
  return res.json(o);
});

// Publico: estadisticas de la landing (sin login)
app.get('/api/public/stats', publicLimiter, async (req, res) => {
  const [clientes, baterias, activas, entregadas] = await Promise.all([
    query('SELECT COUNT(*) AS n FROM clientes'),
    query('SELECT COUNT(*) AS n FROM baterias'),
    query("SELECT COUNT(*) AS n FROM ordenes WHERE estado NOT IN ('delivered','cancelled')"),
    query("SELECT COUNT(*) AS n FROM ordenes WHERE estado = 'delivered'"),
  ]);
  return res.json({
    clientes: Number(clientes[0]?.n || 0),
    baterias: Number(baterias[0]?.n || 0),
    activas: Number(activas[0]?.n || 0),
    entregadas: Number(entregadas[0]?.n || 0),
  });
});

// Publico: seguimiento por CODIGO de 16 digitos (el que esta impreso en el
// comprobante del cliente).
//
// Antes esta busqueda aceptaba el id de la orden, el numero de serie y comodines
// SQL (% y _), y devolvia el codigo de seguimiento de cada resultado: cualquiera
// podia listar las ordenes del taller sin sesion. Ahora:
//   - solo busca por el codigo completo (16 digitos),
//   - no busca por id ni por serie,
//   - no devuelve el codigo (el cliente ya lo tiene).
app.get('/api/public/ordenes', publicLimiter, async (req, res) => {
  const term = String(req.query?.q || '').trim().slice(0, 40);
  if (!term) return res.status(400).json({ error: 'Falta el parametro q' });
  const dig = digitar(term);
  if (dig.length !== 16) return res.json([]);
  const rows = await query(
    'SELECT bateria_serie, estado, fecha_ingreso FROM ordenes WHERE codigo_seguimiento = $1 LIMIT 1',
    [dig]
  );
  return res.json(rows);
});

// Publico: detalle del seguimiento. Solo con el codigo de 16 digitos (o el
// enlace firmado de la cotizacion, que es otro endpoint). Aceptar el id crudo
// permitia leer cualquier orden sin sesion (los ids son ord_100, ord_101...).
app.get('/api/public/ordenes/:id', publicLimiter, async (req, res) => {
  const dig = digitar(String(req.params.id || '').trim());
  if (dig.length !== 16) {
    return res.status(403).json({ error: 'Hace falta el código de seguimiento de 16 dígitos del comprobante.' });
  }
  const o = await one('SELECT * FROM ordenes WHERE codigo_seguimiento = $1', [dig]);
  if (!o) return res.status(404).json({ error: 'Orden no encontrada' });
  const b = await one('SELECT tipo, voltaje, capacidad, aplicacion, equipo FROM baterias WHERE numero_serie = $1', [o.bateria_serie]);
  const c = await one('SELECT nombre FROM clientes WHERE id = $1', [o.cliente_id]);
  return res.json({
    id: o.id,
    codigo: formatearCodigo(o.codigo_seguimiento),
    bateria_serie: o.bateria_serie,
    estado: o.estado,
    falla: o.falla,
    fecha_ingreso: o.fecha_ingreso,
    hora_entrega: o.hora_entrega,
    // Los eventos se devuelven sin el autor: adentro va el email y el rol del
    // personal del taller y eso no es informacion del cliente.
    eventos: (Array.isArray(o.eventos) ? o.eventos : []).map(({ usuario: _usuario, ...resto }) => resto),
    bateria: b || null,
    cliente: c?.nombre || null,
  });
});

app.get('/api/public/cotizacion/:orden_id', publicLimiter, async (req, res) => {
  if (!validarSigCot(req.params.orden_id, req.query.t || '')) {
    return res.status(403).json({ error: 'Acceso no autorizado: usa el enlace enviado por el taller.' });
  }
  const o = await one('SELECT * FROM ordenes WHERE id = $1', [req.params.orden_id]);
  if (!o) return res.status(404).json({ error: 'Orden no encontrada' });
  const b = await one('SELECT tipo, voltaje, capacidad, aplicacion, equipo FROM baterias WHERE numero_serie = $1', [o.bateria_serie]);
  const c = await one('SELECT nombre, email FROM clientes WHERE id = $1', [o.cliente_id]);
  return res.json({
    id: o.id,
    // Codigo de seguimiento (formateado) para que la pantalla publica de la
    // cotizacion pueda ofrecer el enlace al seguimiento sin usar el id interno.
    codigo: formatearCodigo(o.codigo_seguimiento),
    bateria_serie: o.bateria_serie,
    estado: o.estado,
    estado_cotizacion: o.estado_cotizacion,
    cotizacion: o.cotizacion,
    diagnostico: o.diagnostico,
    fecha_ingreso: o.fecha_ingreso,
    bateria: b || null,
    cliente: c || null,
  });
});

// El cliente dueño puede aprobar/rechazar desde su sesion; los enlaces
// publicos exigen el token firmado generado por /compartir.
async function puedeDecidirCotizacion(req, orden) {
  if (validarSigCot(orden.id, req.query.t || '')) return true;
  if (req.user?.rol === 'cliente' && orden.cliente_id === req.user.cliente_id) return true;
  // Staff (admin/tecnico de la orden) tambien puede aprobar/rechazar desde el panel.
  if (puedeEscribirOrden(req, orden)) return true;
  return false;
}

app.post('/api/ordenes/:id/cotizacion/aprobar', publicLimiter, async (req, res) => {
  let cambio = null;
  await tx(async (client) => {
    const o = await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
    const orden = o.rows[0];
    if (!orden) throw { status: 404, message: 'Orden no encontrada' };
    if (!(await puedeDecidirCotizacion(req, orden))) throw { status: 403, message: 'Sin permisos para esta cotizacion' };
    if (orden.estado !== 'quoted') throw { status: 400, message: 'La orden no esta en estado cotizada' };
    await transition(client, orden, 'approved', 'Cotización aprobada por el cliente.', actorDe(req));
    // El CRM se entera solo: la oportunidad pasa a "ganado".
    cambio = await moverEtapaPorOrden(client, orden.id, 'ganado', 'Cotización aprobada por el cliente.');
  });
  if (cambio) {
    await auditar({
      req, tabla: 'wa_conversaciones', registroId: cambio.conversacion_id, accion: 'etapa_automatica',
      antes: { etapa: cambio.anterior }, despues: { etapa: cambio.nueva }, detalle: 'Cotización aprobada',
    });
  }
  return res.json({ ok: true, etapa: cambio?.nueva || null });
});

app.post('/api/ordenes/:id/cotizacion/rechazar', publicLimiter, async (req, res) => {
  let cambio = null;
  await tx(async (client) => {
    const o = await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
    const orden = o.rows[0];
    if (!orden) throw { status: 404, message: 'Orden no encontrada' };
    if (!(await puedeDecidirCotizacion(req, orden))) throw { status: 403, message: 'Sin permisos para esta cotizacion' };
    if (orden.estado !== 'quoted') throw { status: 400, message: 'La orden no esta en estado cotizada' };
    await transition(client, orden, 'cancelled', 'Cotización rechazada por el cliente. Orden cancelada.', actorDe(req));
    cambio = await moverEtapaPorOrden(client, orden.id, 'perdido', 'Cotización rechazada');
  });
  if (cambio) {
    await auditar({
      req, tabla: 'wa_conversaciones', registroId: cambio.conversacion_id, accion: 'etapa_automatica',
      antes: { etapa: cambio.anterior }, despues: { etapa: cambio.nueva }, detalle: 'Cotización rechazada',
    });
  }
  return res.json({ ok: true, etapa: cambio?.nueva || null });
});

// Crea la orden (y la bateria si es nueva) dentro de una transaccion. Se usa
// tanto en POST /api/ordenes como al cotizar desde la bandeja: asi las dos
// puertas crean exactamente lo mismo.
async function crearOrdenTx(client, {
  serieT, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo,
  clienteT, fallaT, tecnico_id,
}, actor) {
  let bat = (await client.query('SELECT * FROM baterias WHERE numero_serie = $1', [serieT])).rows[0];
  if (!bat) {
    const batId = await nextId('bat', client);
    await client.query(
      `INSERT INTO baterias (id, numero_serie, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, fecha_fabricacion, cliente_id, ciclos_estimados, estado_vida)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,300,'activa')`,
      [batId, serieT, limStr(tipo, 40) || 'Plomo-Acido', limStr(voltaje, 12) || '12V', Number(capacidad) || 60, limStr(aplicacion, 40) || 'Automotriz', limStr(marca, 60) || 'Generica', limStr(modelo, 60) || 'Estandar', limStr(equipo, 120) || serieT, new Date().toISOString().slice(0, 10), clienteT]
    );
    bat = { id: batId, numero_serie: serieT };
  }
  const evId = await nextId('ev', client);
  const ordId = await nextId('ord', client);
  const codigo = await generarCodigoUnico(async (cod) => {
    const r = await client.query('SELECT 1 FROM ordenes WHERE codigo_seguimiento = $1', [cod]);
    return r.rowCount > 0;
  });
  await client.query(
    `INSERT INTO ordenes (id, codigo_seguimiento, bateria_serie, cliente_id, tecnico_id, falla, motivo, estado, fecha_ingreso, hora_entrega, eventos, cotizacion, estado_cotizacion, insumos_utilizados, prueba_final, diagnostico)
     VALUES ($1,$2,$3,$4,$5,$6,$6,'received',$7,$8,$9::jsonb,NULL,NULL,'[]'::jsonb,'{"estado":"pending"}',NULL)`,
    [
      ordId, codigo, serieT, clienteT, tecnico_id ? limStr(tecnico_id, 32) : null, fallaT,
      nowIso(), new Date(Date.now() + 24 * 3600000).toISOString(),
      JSON.stringify([{ id: evId, tipo: 'ingreso', detalle: `Batería ${serieT} ingresada al taller. Falla reportada: ${fallaT}`, fecha: nowIso(), usuario: actor }]),
    ]
  );
  return ordId;
}

// Arma el detalle de la cotizacion (monto + renglones) con topes de seguridad.
function armarDetalleCotizacion(montoN, servicios, insumos) {
  return {
    monto: montoN,
    servicios_costos: (servicios || []).slice(0, 50).map((s) => ({ nombre: limStr(s.nombre, 120) || 'Servicio', monto: Math.max(0, Math.min(Number(s.monto) || 0, 1e9)) })),
    insumos: (insumos || []).slice(0, 50).map((i) => ({ nombre: limStr(i.nombre, 120) || 'Insumo', cantidad: Math.max(0, Math.min(Number(i.cantidad) || 1, 1e4)), precio: Math.max(0, Math.min(Number(i.precio) || 0, 1e9)) })),
  };
}

// Cotiza (o recotiza) una orden dentro de una transaccion: deja la version en
// el historial y el evento. La validacion de permisos la hace el endpoint.
async function cotizarOrdenTx(client, ordenId, { montoN, detalleCot }, actor) {
  const o = (await client.query('SELECT * FROM ordenes WHERE id = $1 FOR UPDATE', [ordenId])).rows[0];
  if (!o) throw { status: 404, message: 'Orden no encontrada' };
  if (esEstadoCerrado(o.estado)) {
    throw { status: 400, message: `La orden ya está ${(ESTADO_LABEL[o.estado] || o.estado).toLowerCase()}: no se puede recotizar.` };
  }
  await client.query(
    `UPDATE ordenes SET cotizacion = $2::jsonb, estado = 'quoted', estado_cotizacion = 'pending' WHERE id = $1`,
    [o.id, JSON.stringify(detalleCot)]
  );
  const cotId = await nextId('cot', client);
  await client.query(
    'INSERT INTO cotizaciones_historial (id, orden_id, monto, detalle, usuario) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)',
    [cotId, o.id, montoN, JSON.stringify(detalleCot), JSON.stringify(actor)]
  );
  await pushEvento(client, o.id, 'cotizacion', `Cotización generada por ${fmtARS.format(montoN)}.`, actor);
  return { ...o, estado: 'quoted', estado_cotizacion: 'pending', cotizacion: detalleCot };
}

// Mueve la etapa de la conversacion vinculada a una orden (aprobacion o
// rechazo del cliente). Devuelve el cambio para poder auditarlo.
async function moverEtapaPorOrden(client, ordenId, nuevaEtapa, motivo, usuario = 'sistema') {
  const conv = (await client.query(
    'SELECT id, etapa, monto_estimado FROM wa_conversaciones WHERE orden_id = $1 ORDER BY ultima_fecha DESC NULLS LAST LIMIT 1',
    [ordenId]
  )).rows[0];
  if (!conv) return null;
  const anterior = normalizarEtapa(conv.etapa);
  const nueva = normalizarEtapa(nuevaEtapa);
  if (anterior === nueva) return null;
  await client.query('UPDATE wa_conversaciones SET etapa = $2 WHERE id = $1', [conv.id, nueva]);
  const histId = await nextId('weh', client);
  await client.query(
    `INSERT INTO wa_etapa_historial (id, conversacion_id, anterior, nueva, monto, motivo, usuario)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [histId, conv.id, anterior, nueva, conv.monto_estimado, limStr(motivo, 300) || null, usuario]
  );
  return { conversacion_id: conv.id, anterior, nueva };
}

app.post('/api/ordenes', authRequired, permisoRequerido('crear_orden'), async (req, res) => {
  const { serie, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, cliente_id, falla, tecnico_id } = req.body || {};
  const serieT = limStr(serie, 64);
  const fallaT = limStr(falla, 500);
  const clienteT = limStr(cliente_id, 32);
  if (!serieT || !clienteT || !fallaT) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (serie, cliente y falla)' });
  }
  const ordId = await tx(async (client) => crearOrdenTx(client, {
    serieT, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, clienteT, fallaT, tecnico_id,
  }, actorDe(req)));
  await auditar({
    req, tabla: 'ordenes', registroId: ordId, accion: 'crear',
    despues: { bateria_serie: serieT, cliente_id: clienteT, falla: fallaT, tecnico_id: tecnico_id || null, estado: 'received' },
  });
  notificarSinFrenar(null, ordId, `Orden ${ordId}: batería ingresada al taller.`, 'Email');
  avisarOrden(ordId); // no se espera: el aviso no debe demorar la respuesta
  return res.status(201).json({ id: ordId });
});

app.patch('/api/ordenes/:id/tecnico', authRequired, permisoRequerido('asignar_tecnico'), async (req, res) => {
  const { tecnico_id } = req.body || {};
  if (!tecnico_id) return res.status(400).json({ error: 'Falta tecnico_id' });
  const od = await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    const t = (await client.query('SELECT * FROM tecnicos WHERE id = $1', [tecnico_id])).rows[0];
    if (!t) throw { status: 404, message: 'Tecnico no encontrado' };
    await client.query('UPDATE ordenes SET tecnico_id = $2 WHERE id = $1', [o.id, tecnico_id]);
    await pushEvento(client, o.id, 'asignacion', `Técnico asignado: ${t.nombre}`, actorDe(req));
    return { tecnico: t, orden: o };
  });
  return res.json({ ok: true, tecnico: od.tecnico });
});

app.post('/api/ordenes/:id/diagnostico', authRequired, permisoRequerido('diagnostico'), async (req, res) => {
  const { voltaje, resistencia, pruebaCarga, notas, servicioTipo, fotos } = req.body || {};
  const notasT = limStr(notas, 1000);
  const servicioT = limStr(servicioTipo, 80);
  // Lecturas obligatorias y dentro de un rango fisico razonable.
  const vNum = numEnRango(voltaje, 0.1, 1000);
  const riNum = numEnRango(resistencia, 0.01, 100000);
  if (vNum === null || riNum === null) {
    return res.status(400).json({ error: 'Voltaje (0,1 a 1000 V) y resistencia interna (0,01 a 100.000 mOhm) deben ser numeros validos' });
  }
  const detalle = `Diagnóstico registrado: ${vNum} V, RI ${riNum} mΩ. Prueba de carga: ${pruebaCarga === 'passed' ? 'aprobada' : 'fallida'}.${notasT ? ` ${notasT}` : ''}`;
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (!puedeEscribirOrden(req, o)) throw { status: 403, message: 'Sin permisos para esta orden' };
    // Salvaguarda de integridad: el diagnostico solo se registra en una orden
    // que todavia no fue cotizada. Reenviarlo en una orden ya avanzada antes
    // retrocedia el estado a 'quoted' (se fabricaba el estado en transition()).
    if (!['received', 'diagnosing'].includes(o.estado)) {
      throw { status: 400, message: `La orden está en "${ESTADO_LABEL[o.estado] || o.estado}": el diagnóstico solo se registra en recibida o en diagnóstico` };
    }
    await client.query(
      'UPDATE ordenes SET diagnostico = $2::jsonb WHERE id = $1',
      [o.id, JSON.stringify({ voltaje_medido: vNum, resistencia_interna: riNum, prueba_carga: ['passed', 'failed'].includes(pruebaCarga) ? pruebaCarga : 'pending', notas: notasT, servicioTipo: servicioT, fotos: arrBounded(fotos, 6) ? fotos.slice(0, 6) : [] })]
    );
    await pushEvento(client, o.id, 'diagnostico', detalle, actorDe(req));
    if (o.estado === 'received') {
      await transition(client, o, 'diagnosing', 'Diagnóstico iniciado por el técnico.', actorDe(req));
    }
    // Tras lo anterior la orden esta en 'diagnosing' (en la base y en o.estado
    // si ya lo estaba), que es el unico origen valido hacia 'quoted'.
    await transition(client, { ...o, estado: 'diagnosing' }, 'quoted', `Diagnóstico completado. Cotización generada por ${servicioT || 'el servicio'}.`, actorDe(req));
  });
  notificarSinFrenar(null, req.params.id, `Orden ${req.params.id}: diagnóstico registrado y cotización generada. El cliente debe aprobarla.`, 'Email');
  avisarOrden(req.params.id); // aviso automático: presupuesto listo
  return res.json({ ok: true });
});

app.post('/api/ordenes/:id/cotizacion', authRequired, permisoRequerido('cotizar'), async (req, res) => {
  const { monto, servicios, insumos } = req.body || {};
  const montoN = Math.max(0, Math.min(Number(monto) || 0, 1e9));
  if (!arrBounded(servicios || []) || !arrBounded(insumos || [])) {
    return res.status(400).json({ error: 'Demasiados renglones en la cotizacion' });
  }
  const orden = await one('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!puedeEscribirOrden(req, orden)) return res.status(403).json({ error: 'Sin permisos para esta orden' });
  if (rechazarSiCerrada(orden, res)) return;
  const detalleCot = armarDetalleCotizacion(montoN, servicios, insumos);
  // Cotizacion + version en el historial + evento, todo en UNA transaccion: si
  // algo falla no queda una cotizacion sin su rastro de auditoria.
  await tx(async (client) => cotizarOrdenTx(client, orden.id, { montoN, detalleCot }, actorDe(req)));
  await auditar({
    req, tabla: 'ordenes', registroId: orden.id, accion: 'cotizar',
    antes: { monto: orden.cotizacion?.monto ?? null },
    despues: { monto: montoN, renglones: detalleCot.servicios_costos.length + detalleCot.insumos.length },
  });
  avisarOrden(orden.id); // aviso automático: presupuesto listo
  return res.json({ ok: true });
});

// Versiones anteriores de la cotizacion (auditoria de que se cotizo y cuando).
app.get('/api/ordenes/:id/cotizaciones', authRequired, async (req, res) => {
  const o = await one('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!puedeLeerOrden(req, o)) return res.status(403).json({ error: 'Sin permisos para esta orden' });
  return res.json(await query('SELECT * FROM cotizaciones_historial WHERE orden_id = $1 ORDER BY fecha DESC', [req.params.id]));
});

app.post('/api/ordenes/:id/insumos', authRequired, permisoRequerido('cargar_insumos'), async (req, res) => {
  const { insumo_id, cantidad } = req.body || {};
  const cant = numEnRango(cantidad, 0.01, 1000000);
  if (cant === null) return res.status(400).json({ error: 'La cantidad tiene que ser un numero mayor a 0' });
  const resultado = await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (!puedeEscribirOrden(req, o)) throw { status: 403, message: 'Sin permisos para esta orden' };
    if (esEstadoCerrado(o.estado)) {
      throw { status: 400, message: `La orden ya está ${(ESTADO_LABEL[o.estado] || o.estado).toLowerCase()}: no se le pueden cargar insumos.` };
    }
    const i = (await client.query('SELECT * FROM insumos WHERE id = $1', [insumo_id])).rows[0];
    if (!i) throw { status: 404, message: 'Insumo no encontrado' };
    // Descuento atomico: la condicion stock >= cant la evalua la base en el
    // mismo UPDATE, asi dos consumos simultaneos no dejan el stock negativo.
    const act = (await client.query(
      'UPDATE insumos SET stock = stock - $2 WHERE id = $1 AND stock >= $2 RETURNING stock',
      [i.id, cant]
    )).rows[0];
    if (!act) throw { status: 400, message: `No alcanza el stock de ${i.nombre} (disponible: ${i.stock})` };
    const stockNuevo = act.stock;
    await client.query(
      `UPDATE ordenes SET insumos_utilizados = insumos_utilizados || $2::jsonb WHERE id = $1`,
      [o.id, JSON.stringify([{ insumo_id: i.id, nombre: i.nombre, cantidad: cant, precio: i.precio }])]
    );
    await pushEvento(client, o.id, 'insumo', `Insumo utilizado: ${i.nombre} x${cant}`, actorDe(req));
    await movimientoInsumo(client, {
      insumoId: i.id, tipo: 'consumo', cantidad: cant, stockResultante: stockNuevo,
      motivo: `Consumo en orden ${o.id}`, ordenId: o.id, actor: actorDe(req),
    });
    return { critico: stockNuevo < 3, stockNuevo, nombre: i.nombre };
  });
  return res.json({ ok: true, critico: resultado ? resultado.critico : false });
});

// Correccion del piso: devuelve al stock un insumo cargado por error y lo quita
// de la orden (con evento de auditoria). Solo staff con acceso a la orden.
app.delete('/api/ordenes/:id/insumos/:indice', authRequired, permisoRequerido('cargar_insumos'), async (req, res) => {
  const indice = Number(req.params.indice);
  const revertido = await tx(async (client) => {
    // FOR UPDATE: serializa dos reversiones simultaneas de la misma orden (si se
    // pisaban, el stock se devolvia dos veces y quedaba mercaderia fantasma).
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (!puedeEscribirOrden(req, o)) throw { status: 403, message: 'Sin permisos para esta orden' };
    if (esEstadoCerrado(o.estado)) {
      throw { status: 400, message: `La orden ya está ${(ESTADO_LABEL[o.estado] || o.estado).toLowerCase()}: no se puede devolver stock.` };
    }
    const usados = Array.isArray(o.insumos_utilizados) ? o.insumos_utilizados : [];
    if (!Number.isInteger(indice) || indice < 0 || indice >= usados.length) {
      throw { status: 400, message: 'El insumo indicado no existe en esta orden' };
    }
    const item = usados[indice];
    let stockNuevo = null;
    if (item.insumo_id) {
      const ri = (await client.query('UPDATE insumos SET stock = stock + $2 WHERE id = $1 RETURNING stock', [item.insumo_id, Number(item.cantidad) || 0])).rows[0];
      stockNuevo = ri?.stock ?? null;
    }
    await client.query(
      'UPDATE ordenes SET insumos_utilizados = $2::jsonb WHERE id = $1',
      [o.id, JSON.stringify(usados.filter((_, i) => i !== indice))]
    );
    await pushEvento(client, o.id, 'insumo_revertido', `Insumo devuelto al stock: ${item.nombre} x${item.cantidad}.`, actorDe(req));
    if (item.insumo_id) {
      await movimientoInsumo(client, {
        insumoId: item.insumo_id, tipo: 'reversion', cantidad: Number(item.cantidad) || 0, stockResultante: stockNuevo,
        motivo: `Corrección de carga en orden ${o.id}`, ordenId: o.id, actor: actorDe(req),
      });
    }
    return item;
  });
  return res.json({ ok: true, revertido });
});

app.post('/api/ordenes/:id/prueba-final', authRequired, permisoRequerido('prueba_final'), async (req, res) => {
  const { capacidad, resultado, obs } = req.body || {};
  // La capacidad medida es obligatoria: es el respaldo de la aprobacion.
  const capNum = numEnRango(capacidad, 0.1, 1000000);
  if (capNum === null) {
    return res.status(400).json({ error: 'La capacidad medida (Ah) es obligatoria y debe ser un numero mayor a 0' });
  }
  const passed = resultado === 'passed';
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (!puedeEscribirOrden(req, o)) throw { status: 403, message: 'Sin permisos para esta orden' };
    if (o.estado !== 'testing') throw { status: 400, message: 'La orden debe estar en prueba final' };
    // Criterio de aceptacion: no se aprueba por debajo del minimo de capacidad.
    const b = (await client.query('SELECT capacidad FROM baterias WHERE numero_serie = $1', [o.bateria_serie])).rows[0];
    const nominal = Number(b?.capacidad) || 0;
    if (passed && nominal > 0 && capNum < nominal * (MIN_CAPACIDAD_PCT / 100)) {
      const pct = Math.round((capNum / nominal) * 100);
      throw { status: 400, message: `No se puede aprobar: ${capNum} Ah es el ${pct}% de la capacidad nominal (${nominal} Ah). El minimo de aceptacion es ${MIN_CAPACIDAD_PCT}%: registrala como fallida.` };
    }
    await client.query(
      `UPDATE ordenes SET prueba_final = $2::jsonb WHERE id = $1`,
      [o.id, JSON.stringify({ estado: passed ? 'passed' : 'failed', capacidad_medida: capNum, obs: limStr(obs, 1000) })]
    );
    const evTipo = passed ? 'prueba_aprobada' : 'prueba_fallida';
    const evDet = passed
      ? `Prueba final APROBADA. Capacidad medida: ${capNum} Ah.${obs ? ` ${obs}` : ''}`
      : `Prueba final FALLIDA. Capacidad medida: ${capNum} Ah. Regresa a reparación: ${obs || 'se requiere reproceso'}`;
    await pushEvento(client, o.id, evTipo, evDet, actorDe(req));
    const upd = await client.query(
      "UPDATE ordenes SET estado = $2 WHERE id = $1 AND estado = 'testing'",
      [o.id, passed ? 'ready' : 'in_repair']
    );
    if (upd.rowCount === 0) throw { status: 409, message: 'La orden cambió de estado mientras la mirabas: recargá y volvé a intentar.' };
  });
  if (passed) avisarOrden(req.params.id); // aviso automático: lista para retirar
  return res.json({ ok: true });
});

app.post('/api/ordenes/:id/entregar', authRequired, permisoRequerido('entregar'), async (req, res) => {
  const { monto_cobrado, garantia_meses, garantia_ciclos, medio_pago } = req.body || {};
  const medioT = limStr(medio_pago, 40);
  let antes = null;
  let despues = null;
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (o.estado !== 'ready') throw { status: 400, message: 'Solo órdenes listas pueden entregarse' };
    const monto = monto_cobrado != null && monto_cobrado !== '' ? Number(monto_cobrado) : o.cotizacion?.monto || 0;
    const gMeses = Number(garantia_meses) || 6;
    const gCiclos = Number(garantia_ciclos) || 100;
    const vence = new Date(Date.now() + gMeses * 30.44 * 86400000).toISOString();
    antes = { estado: o.estado, monto_cobrado: o.monto_cobrado, garantia: o.garantia, medio_pago: o.medio_pago };
    const upd = await client.query(
      `UPDATE ordenes SET estado = 'delivered', monto_cobrado = $2, fecha_entrega = $3, garantia = $4::jsonb, medio_pago = $5
       WHERE id = $1 AND estado = 'ready'`,
      [o.id, monto, nowIso(), JSON.stringify({ meses: gMeses, ciclos: gCiclos, vence }), medioT || null]
    );
    if (upd.rowCount === 0) throw { status: 409, message: 'La orden cambió de estado mientras la mirabas: recargá y volvé a intentar.' };
    await client.query('UPDATE baterias SET estado_vida = $2 WHERE numero_serie = $1', [o.bateria_serie, 'en_garantia']);
    await pushEvento(client, o.id, 'entregada',
      `Batería entregada al cliente. ${fmtARS.format(monto)} cobrados${medioT ? ` (${medioT})` : ''}. Garantía ${gMeses} meses / ${gCiclos} ciclos.`,
      actorDe(req));
    despues = { estado: 'delivered', monto_cobrado: monto, garantia: { meses: gMeses, ciclos: gCiclos, vence }, medio_pago: medioT || null };
  });
  await auditar({
    req, tabla: 'ordenes', registroId: req.params.id, accion: 'entregar', antes, despues,
    detalle: despues ? `cobrado ${fmtARS.format(despues.monto_cobrado)}${despues.medio_pago ? ` (${despues.medio_pago})` : ''}` : null,
  });
  notificarSinFrenar(null, req.params.id, `Orden ${req.params.id}: batería entregada y cobrada. Garantía activada.`, 'WhatsApp');
  return res.json({ ok: true });
});

app.post('/api/ordenes/:id/baja', authRequired, permisoRequerido('baja_orden'), async (req, res) => {
  const { motivo } = req.body || {};
  const motivoT = limStr(motivo, 300) || 'No reparable / fuera de vida util';
  const baja = await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    // Una orden ya entregada y cobrada no se da de baja (cambiaria el estado de
    // una venta cerrada y la vida de la bateria).
    if (o.estado === 'delivered') {
      throw { status: 400, message: 'La orden ya fue entregada y cobrada: no se puede dar de baja.' };
    }
    const b = (await client.query('SELECT * FROM baterias WHERE numero_serie = $1', [o.bateria_serie])).rows[0];
    const batId = b ? b.id : o.bateria_serie;
    // Idempotencia: una bateria no puede tener dos bajas (antes, repetir el
    // pedido duplicaba filas en el panel de reciclaje).
    const ya = (await client.query('SELECT id FROM bajas WHERE bateria_id = $1', [batId])).rows[0];
    if (ya) throw { status: 409, message: `Esa batería ya tiene una baja registrada (${ya.id}).` };
    await client.query('UPDATE ordenes SET estado = $2 WHERE id = $1', [o.id, 'cancelled']);
    if (b) await client.query('UPDATE baterias SET estado_vida = $2 WHERE id = $1', [b.id, 'dada_de_baja']);
    const bajaId = await nextId('baja', client);
    await client.query(
      `INSERT INTO bajas (id, bateria_id, serie, fecha, motivo, disposicion, reciclada) VALUES ($1,$2,$3,$4,$5,'Pendiente de disposicion responsable',false)`,
      [bajaId, batId, o.bateria_serie, nowIso(), motivoT]
    );
    await pushEvento(client, o.id, 'baja', `Batería ${o.bateria_serie} dada de baja: ${motivoT}. Trazabilidad activa para reciclaje.`, actorDe(req));
    return { id: bajaId, serie: o.bateria_serie, estadoAnterior: o.estado };
  });
  await auditar({
    req, tabla: 'ordenes', registroId: req.params.id, accion: 'dar_de_baja',
    antes: { estado: baja?.estadoAnterior }, despues: { estado: 'cancelled', baja: baja?.id, motivo: motivoT },
  });
  return res.json({ ok: true, baja });
});

// Transiciones genericas
app.post('/api/ordenes/:id/transition', authRequired, permisoRequerido('crear_orden','diagnostico','cotizar','cargar_insumos','prueba_final','entregar','baja_orden'), async (req, res) => {
  const { target, detalle } = req.body || {};
  if (!ORDEN_ESTADOS.includes(target)) return res.status(400).json({ error: 'Estado invalido' });
  // Entregar y cancelar son decisiones de administrador: la entrega tiene que
  // pasar por POST /ordenes/:id/entregar, que es el que registra el monto
  // cobrado, el medio de pago y la garantia (y deja la bateria en garantia).
  // Por este endpoint un tecnico podia entregar o cancelar salteando todo eso.
  if (['delivered', 'cancelled'].includes(target) && !esAdmin(req)) {
    return res.status(403).json({ error: 'Entregar o cancelar una orden es una acción de administrador' });
  }
  let estadoAnterior = null;
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (!puedeEscribirOrden(req, o)) throw { status: 403, message: 'Sin permisos para esta orden' };
    estadoAnterior = o.estado;
    await transition(client, o, target, limStr(detalle, 500), actorDe(req));
  });
  await auditar({
    req, tabla: 'ordenes', registroId: req.params.id, accion: 'cambiar_estado',
    antes: { estado: estadoAnterior }, despues: { estado: target },
    detalle: limStr(detalle, 300) || null,
  });
  return res.json({ ok: true });
});

// Compartir enlaces (cotizacion firmada + tracker). Staff con acceso a la orden.
app.post('/api/ordenes/:id/compartir', authRequired, async (req, res) => {
  const o = await one('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!puedeEscribirOrden(req, o)) return res.status(403).json({ error: 'Sin permisos para esta orden' });
  const t = hornoSigCot(o.id);
  const codigo = formatearCodigo(o.codigo_seguimiento);
  return res.json({
    cotizacion: `${PUBLIC_URL}/cotizacion/${o.id}?t=${t}`,
    // Sin codigo (no deberia pasar: se genera al crear la orden) se manda al
    // buscador publico: el id interno NO abre el seguimiento.
    tracker: codigo ? `${PUBLIC_URL}/tracker/${codigo}` : `${PUBLIC_URL}/seguimiento`,
  });
});

// ---------- Insumos ----------
app.post('/api/insumos', authRequired, permisoRequerido('crear_insumos'), async (req, res) => {
  const { nombre, categoria, stock, precio, stock_minimo } = req.body || {};
  const nombreT = limStr(nombre, 120);
  if (!nombreT) return res.status(400).json({ error: 'Falta nombre' });
  const stockInicial = Math.max(0, Math.min(Number(stock) || 0, 1000000));
  const minimo = numEnRango(stock_minimo, 0, 100000) ?? 3;
  // Alta + movimiento de stock en una transaccion: si falla el movimiento no
  // queda un insumo sin su rastro de auditoria.
  const id = await tx(async (client) => {
    const nuevo = await nextId('ins', client);
    await client.query('INSERT INTO insumos (id, nombre, categoria, stock, precio, stock_minimo) VALUES ($1,$2,$3,$4,$5,$6)', [
      nuevo, nombreT, limStr(categoria, 60), stockInicial, Math.max(0, Math.min(Number(precio) || 0, 1e9)), Math.round(minimo),
    ]);
    await movimientoInsumo(client, { insumoId: nuevo, tipo: 'alta', cantidad: stockInicial, stockResultante: stockInicial, motivo: 'Alta de insumo', actor: actorDe(req) });
    return nuevo;
  });
  return res.status(201).json({ id });
});

// Editar los datos del insumo (nombre, categoria, precio, umbral de stock
// critico). El stock NO se toca por aca: se mueve con /stock y /ajuste, que
// dejan el movimiento auditado.
app.patch('/api/insumos/:id', authRequired, permisoRequerido('editar_insumos'), async (req, res) => {
  const actual = await one('SELECT * FROM insumos WHERE id = $1', [req.params.id]);
  if (!actual) return res.status(404).json({ error: 'Insumo no encontrado' });
  const campos = [];
  const args = [];
  const set = (col, valor) => { args.push(valor); campos.push(`${col} = $${args.length}`); };
  if (req.body?.nombre !== undefined) {
    const nombreT = limStr(req.body.nombre, 120);
    if (!nombreT) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
    set('nombre', nombreT);
  }
  if (req.body?.categoria !== undefined) set('categoria', limStr(req.body.categoria, 60));
  if (req.body?.precio !== undefined) {
    const precio = numEnRango(req.body.precio, 0, 1e9);
    if (precio === null) return res.status(400).json({ error: 'El precio tiene que ser un número entre 0 y 1.000.000.000' });
    set('precio', precio);
  }
  if (req.body?.stock_minimo !== undefined) {
    const minimo = numEnRango(req.body.stock_minimo, 0, 100000);
    if (minimo === null) return res.status(400).json({ error: 'El stock mínimo tiene que ser un número entre 0 y 100.000' });
    set('stock_minimo', Math.round(minimo));
  }
  if (!campos.length) return res.status(400).json({ error: 'No hay nada para actualizar' });
  args.push(actual.id);
  const upd = await one(`UPDATE insumos SET ${campos.join(', ')} WHERE id = $${args.length} RETURNING *`, args);
  await auditar({ req, tabla: 'insumos', registroId: actual.id, accion: 'editar', antes: actual, despues: upd });
  return res.json(upd);
});

app.patch('/api/insumos/:id/stock', authRequired, permisoRequerido('mover_stock'), async (req, res) => {
  const { cantidad, motivo } = req.body || {};
  const cant = numEnRango(cantidad, 0.01, 1000000);
  if (cant === null) return res.status(400).json({ error: 'La cantidad tiene que ser un numero mayor a 0' });
  const r = await tx(async (client) => {
    const upd = (await client.query('UPDATE insumos SET stock = stock + $2 WHERE id = $1 RETURNING *', [req.params.id, cant])).rows[0];
    if (!upd) throw { status: 404, message: 'Insumo no encontrado' };
    await movimientoInsumo(client, {
      insumoId: upd.id, tipo: 'ingreso', cantidad: cant, stockResultante: upd.stock,
      motivo: limStr(motivo, 200) || 'Ingreso de stock', actor: actorDe(req),
    });
    return upd;
  });
  await auditar({
    req, tabla: 'insumos', registroId: r.id, accion: 'ingreso_stock',
    antes: { stock: r.stock - cant }, despues: { stock: r.stock }, detalle: limStr(motivo, 200) || null,
  });
  return res.json({ ok: true, stock: r.stock });
});

// Ajuste por recuento fisico: fija el stock real y registra la diferencia con motivo.
app.post('/api/insumos/:id/ajuste', authRequired, permisoRequerido('mover_stock'), async (req, res) => {
  const { stock_contado, motivo } = req.body || {};
  const contado = numEnRango(stock_contado, 0, 1000000);
  const motivoT = limStr(motivo, 200);
  if (contado === null) return res.status(400).json({ error: 'El stock contado debe ser un numero entre 0 y 1.000.000' });
  if (!motivoT) return res.status(400).json({ error: 'El motivo del ajuste es obligatorio (queda en la trazabilidad)' });
  const previo = await one('SELECT * FROM insumos WHERE id = $1', [req.params.id]);
  if (!previo) return res.status(404).json({ error: 'Insumo no encontrado' });
  const nuevo = Math.round(contado);
  const diferencia = await tx(async (client) => {
    const upd = (await client.query('UPDATE insumos SET stock = $2 WHERE id = $1 RETURNING stock', [previo.id, nuevo])).rows[0];
    await movimientoInsumo(client, {
      insumoId: previo.id, tipo: 'ajuste', cantidad: nuevo - previo.stock, stockResultante: upd.stock,
      motivo: motivoT, actor: actorDe(req),
    });
    return nuevo - previo.stock;
  });
  await auditar({
    req, tabla: 'insumos', registroId: previo.id, accion: 'ajuste_stock',
    antes: { stock: previo.stock }, despues: { stock: nuevo }, detalle: motivoT,
  });
  return res.json({ ok: true, stock: nuevo, diferencia });
});

app.get('/api/insumos/:id/movimientos', authRequired, permisoRequerido('inventario'), async (req, res) => {
  const i = await one('SELECT id, nombre, stock FROM insumos WHERE id = $1', [req.params.id]);
  if (!i) return res.status(404).json({ error: 'Insumo no encontrado' });
  const movimientos = await query('SELECT * FROM insumos_movimientos WHERE insumo_id = $1 ORDER BY fecha DESC LIMIT 200', [req.params.id]);
  return res.json({ insumo: i, movimientos });
});

// ---------- Clientes ----------
// Listado normal (sin los dados de baja) y papelera (solo admin).
app.get('/api/clientes', authRequired, permisoRequerido('clientes'), async (req, res) => {
  if (String(req.query?.papelera || '') === '1') {
    if (!esAdmin(req)) return res.status(403).json({ error: 'Solo un administrador puede ver la papelera' });
    return res.json(await query('SELECT * FROM clientes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 200'));
  }
  return res.json(await query('SELECT * FROM clientes WHERE deleted_at IS NULL ORDER BY nombre'));
});

app.post('/api/clientes', authRequired, permisoRequerido('crear_clientes'), async (req, res) => {
  const { nombre, empresa, email, telefono, tipo, contacto, notas } = req.body || {};
  const { direccion, localidad, cuit, condicion_pago, canal_origen, vendedor } = req.body || {};
  const nombreT = limStr(nombre, 120);
  const emailT = String(email || '').trim();
  if (!nombreT || !validEmail(emailT)) return res.status(400).json({ error: 'Faltan nombre y email valido' });
  // El email no puede estar repetido: se avisa con un mensaje de negocio en vez
  // del error crudo de Postgres (el indice unico es la red de seguridad).
  // Si el email lo tiene un cliente en la papelera, se ofrece restaurarlo.
  const existente = await one('SELECT id, nombre, deleted_at FROM clientes WHERE LOWER(email) = LOWER($1)', [emailT]);
  if (existente) {
    return res.status(409).json({
      error: existente.deleted_at
        ? `Ese email pertenece a ${existente.nombre}, que está en la papelera. Restauralo o usá otro email.`
        : `Ya hay un cliente cargado con ese email (${existente.nombre}).`,
    });
  }
  const id = await nextId('cli');
  try {
    await query(
      `INSERT INTO clientes (id, nombre, tipo, telefono, contacto, email, empresa, notas,
        direccion, localidad, cuit, condicion_pago, canal_origen, vendedor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id, nombreT, normalizarTipoCliente(tipo), limStr(telefono, 40), limStr(contacto, 120) || nombreT, emailT,
        limStr(empresa, 120), limStr(notas, 1000),
        limStr(direccion, 160), limStr(localidad, 80), limStr(cuit, 20),
        limStr(condicion_pago, 60), limStr(canal_origen, 60), limStr(vendedor, 80),
      ]
    );
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya hay un cliente cargado con ese email.' });
    throw e;
  }
  await auditar({
    req, tabla: 'clientes', registroId: id, accion: 'crear',
    despues: { nombre: nombreT, email: emailT, telefono: limStr(telefono, 40), tipo: normalizarTipoCliente(tipo) },
  });
  return res.status(201).json({ id });
});

// Editar la ficha: es lo que evita que un telefono mal cargado quede para siempre.
app.patch('/api/clientes/:id', authRequired, permisoRequerido('editar_clientes'), async (req, res) => {
  const actual = await one('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
  if (!actual) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (actual.deleted_at) return res.status(400).json({ error: 'El cliente está dado de baja: restauralo antes de editarlo' });
  const campos = [];
  const args = [];
  const set = (col, valor) => { args.push(valor); campos.push(`${col} = $${args.length}`); };
  if (req.body?.nombre !== undefined) {
    const nombreT = limStr(req.body.nombre, 120);
    if (!nombreT) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
    set('nombre', nombreT);
  }
  if (req.body?.contacto !== undefined) set('contacto', limStr(req.body.contacto, 120));
  if (req.body?.empresa !== undefined) set('empresa', limStr(req.body.empresa, 120));
  if (req.body?.telefono !== undefined) set('telefono', limStr(req.body.telefono, 40));
  if (req.body?.notas !== undefined) set('notas', limStr(req.body.notas, 1000));
  if (req.body?.tipo !== undefined) set('tipo', normalizarTipoCliente(req.body.tipo));
  // Datos comerciales de la ficha (CRM).
  if (req.body?.direccion !== undefined) set('direccion', limStr(req.body.direccion, 160));
  if (req.body?.localidad !== undefined) set('localidad', limStr(req.body.localidad, 80));
  if (req.body?.cuit !== undefined) set('cuit', limStr(req.body.cuit, 20));
  if (req.body?.condicion_pago !== undefined) set('condicion_pago', limStr(req.body.condicion_pago, 60));
  if (req.body?.canal_origen !== undefined) set('canal_origen', limStr(req.body.canal_origen, 60));
  if (req.body?.vendedor !== undefined) set('vendedor', limStr(req.body.vendedor, 80));
  if (req.body?.email !== undefined) {
    const emailT = String(req.body.email || '').trim();
    if (!validEmail(emailT)) return res.status(400).json({ error: 'El email no es válido' });
    const repetido = await one('SELECT id, nombre FROM clientes WHERE LOWER(email) = LOWER($1) AND id <> $2', [emailT, actual.id]);
    if (repetido) return res.status(409).json({ error: `Ese email ya lo usa otro cliente (${repetido.nombre}).` });
    set('email', emailT);
  }
  if (!campos.length) return res.status(400).json({ error: 'No hay nada para actualizar' });
  args.push(actual.id);
  try {
    const upd = await one(`UPDATE clientes SET ${campos.join(', ')} WHERE id = $${args.length} RETURNING *`, args);
    await auditar({ req, tabla: 'clientes', registroId: actual.id, accion: 'editar', antes: actual, despues: upd });
    return res.json(upd);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ese email ya lo usa otro cliente.' });
    throw e;
  }
});

// Baja logica: la ficha se conserva (con quien y cuando la dio de baja) y se
// puede restaurar. No se da de baja un cliente con trabajo en curso.
app.delete('/api/clientes/:id', authRequired, permisoRequerido('baja_clientes'), async (req, res) => {
  const c = await one('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (c.deleted_at) return res.status(400).json({ error: 'El cliente ya estaba dado de baja' });
  const activas = await one(
    "SELECT count(*)::int AS n, min(id) AS primera FROM ordenes WHERE cliente_id = $1 AND estado NOT IN ('delivered','cancelled')",
    [c.id]
  );
  if (activas?.n > 0) {
    return res.status(400).json({
      error: `No se puede dar de baja: tiene ${activas.n} orden(es) en curso (ej. ${activas.primera}). Entregalas o cancelalas primero.`,
    });
  }
  const upd = await one('UPDATE clientes SET deleted_at = now(), deleted_by = $2 WHERE id = $1 RETURNING *', [
    c.id, actorDe(req)?.email || 'panel',
  ]);
  await auditar({ req, tabla: 'clientes', registroId: c.id, accion: 'dar_de_baja', antes: c, despues: upd });
  return res.json(upd);
});

app.post('/api/clientes/:id/restaurar', authRequired, permisoRequerido('baja_clientes'), async (req, res) => {
  const c = await one('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!c.deleted_at) return res.status(400).json({ error: 'El cliente no está dado de baja' });
  // Si otro cliente activo se quedo con ese email mientras estaba en la papelera,
  // restaurarlo romperia el indice unico: se avisa en vez de fallar con un 500.
  const repetido = await one('SELECT id, nombre FROM clientes WHERE LOWER(email) = LOWER($1) AND id <> $2 AND deleted_at IS NULL', [c.email || '', c.id]);
  if (repetido) {
    return res.status(409).json({ error: `No se puede restaurar: ese email ahora es de ${repetido.nombre}. Cambiale el email a uno de los dos primero.` });
  }
  const upd = await one('UPDATE clientes SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 RETURNING *', [c.id]);
  await auditar({ req, tabla: 'clientes', registroId: c.id, accion: 'restaurar', antes: c, despues: upd });
  return res.json(upd);
});

app.post('/api/clientes/find-or-create', authRequired, permisoRequerido('crear_clientes'), async (req, res) => {
  const { nombre, empresa, email, telefono } = req.body || {};
  const emailT = String(email || '').trim();
  if (!validEmail(emailT)) return res.status(400).json({ error: 'Falta email valido' });
  const exist = await one('SELECT * FROM clientes WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL', [emailT]);
  if (exist) return res.json({ id: exist.id });
  // Si el email es de alguien en la papelera, no se reutiliza en silencio: la
  // orden quedaria colgada de una ficha dada de baja.
  const enPapelera = await one('SELECT id, nombre FROM clientes WHERE LOWER(email) = LOWER($1) AND deleted_at IS NOT NULL', [emailT]);
  if (enPapelera) {
    return res.status(409).json({ error: `Ese email es de ${enPapelera.nombre}, que está en la papelera: restauralo desde Papelera o usá otro email.` });
  }
  const id = await nextId('cli');
  const nombreT = limStr(nombre, 120) || 'Cliente';
  // ON CONFLICT DO NOTHING + relectura: si dos pedidos del mismo email entran
  // juntos, uno crea la ficha y el otro la reutiliza (antes se duplicaba).
  await query(
    `INSERT INTO clientes (id, nombre, tipo, telefono, contacto, email, empresa) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT DO NOTHING`,
    [id, nombreT, 'particular', limStr(telefono, 40), nombreT, emailT, limStr(empresa, 120)]
  );
  const creado = await one('SELECT id FROM clientes WHERE LOWER(email) = LOWER($1)', [emailT]);
  await auditar({ req, tabla: 'clientes', registroId: creado?.id || id, accion: 'crear_desde_bandeja', despues: { nombre: nombreT, email: emailT } });
  return res.status(201).json({ id: creado?.id || id });
});

// ---------- Tecnicos ----------
// Por defecto solo los activos; con ?todos=1 (admin) vienen tambien los inactivos.
app.get('/api/tecnicos', authRequired, permisoRequerido('tecnicos'), async (req, res) => {
  const todos = String(req.query?.todos || '') === '1' && esAdmin(req);
  return res.json(await query(`SELECT * FROM tecnicos${todos ? '' : ' WHERE activo = true'} ORDER BY nombre`));
});

app.post('/api/tecnicos', authRequired, permisoRequerido('crear_tecnicos'), async (req, res) => {
  const { nombre, especialidad, certificaciones } = req.body || {};
  const nombreT = limStr(nombre, 120);
  const especialidadT = limStr(especialidad, 80);
  if (!nombreT || !especialidadT) return res.status(400).json({ error: 'Faltan nombre y especialidad' });
  const id = await nextId('tec_');
  await query('INSERT INTO tecnicos (id, nombre, especialidad, certificaciones, activo) VALUES ($1,$2,$3,$4,true)', [
    id, nombreT, especialidadT, JSON.stringify((certificaciones || []).slice(0, 20).map((c) => limStr(c, 120))),
  ]);
  return res.status(201).json({ id });
});

// Editar un tecnico: especialidad, certificaciones y alta/baja. Antes solo se
// podia crear, asi que no habia forma de corregir ni de desactivar a alguien.
app.patch('/api/tecnicos/:id', authRequired, permisoRequerido('editar_tecnicos'), async (req, res) => {
  const actual = await one('SELECT * FROM tecnicos WHERE id = $1', [req.params.id]);
  if (!actual) return res.status(404).json({ error: 'Técnico no encontrado' });
  const campos = [];
  const args = [];
  const set = (col, valor) => { args.push(valor); campos.push(`${col} = $${args.length}`); };
  if (req.body?.nombre !== undefined) {
    const nombreT = limStr(req.body.nombre, 120);
    if (!nombreT) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
    set('nombre', nombreT);
  }
  if (req.body?.especialidad !== undefined) {
    const espT = limStr(req.body.especialidad, 80);
    if (!espT) return res.status(400).json({ error: 'La especialidad no puede quedar vacía' });
    set('especialidad', espT);
  }
  if (req.body?.certificaciones !== undefined) {
    if (!arrBounded(req.body.certificaciones, 20)) {
      return res.status(400).json({ error: 'Las certificaciones tienen que ser una lista de hasta 20 elementos' });
    }
    set('certificaciones', JSON.stringify(req.body.certificaciones.map((c) => limStr(c, 120)).filter(Boolean)));
  }
  if (req.body?.activo !== undefined) {
    const activo = req.body.activo === true || req.body.activo === 'true';
    // No se desactiva a alguien con trabajo asignado sin cerrar: sus ordenes
    // quedarian sin responsable visible en el tablero.
    if (!activo) {
      const pendientes = await one(
        "SELECT count(*)::int AS n, min(id) AS primera FROM ordenes WHERE tecnico_id = $1 AND estado NOT IN ('delivered','cancelled')",
        [actual.id]
      );
      if (pendientes?.n > 0 && actual.activo) {
        return res.status(400).json({
          error: `No se puede desactivar: tiene ${pendientes.n} orden(es) en curso (ej. ${pendientes.primera}). Reasignalas primero.`,
        });
      }
    }
    set('activo', activo);
  }
  if (!campos.length) return res.status(400).json({ error: 'No hay nada para actualizar' });
  args.push(actual.id);
  const upd = await one(`UPDATE tecnicos SET ${campos.join(', ')} WHERE id = $${args.length} RETURNING *`, args);
  return res.json(upd);
});
// ---------- Notificaciones ----------
app.post('/api/notificaciones/leidas', authRequired, async (req, res) => {
  const { clause, params } = notifWhere(req);
  await query(`UPDATE notificaciones n SET leida = true WHERE ${clause}`, params);
  return res.json({ ok: true });
});

// Borrar UNA sola notificacion (antes solo se podian borrar todas de un saque).
app.delete('/api/notificaciones/:id', authRequired, async (req, res) => {
  const { clause, params } = notifWhere(req);
  // Los parametros del filtro por rol van primero para no pisar sus $1..$n.
  const args = [...params, req.params.id];
  const borrada = await one(`DELETE FROM notificaciones n WHERE ${clause} AND n.id = $${args.length} RETURNING n.id`, args);
  if (!borrada) return res.status(404).json({ error: 'Notificación no encontrada' });
  return res.json({ ok: true });
});

app.delete('/api/notificaciones', authRequired, async (req, res) => {
  const { clause, params } = notifWhere(req);
  await query(`DELETE FROM notificaciones n WHERE ${clause}`, params);
  return res.json({ ok: true });
});

// ---------- Reset demo (solo admin; deshabilitado salvo ALLOW_RESET=1) ----------
// Borra TODOS los datos: por eso, ademas de la variable de entorno, exige una
// confirmacion escrita a mano. Un click de mas no puede vaciar la operacion.
app.post('/api/reset', authRequired, requireRol('admin'), async (req, res) => {
  if (process.env.ALLOW_RESET !== '1') {
    return res.status(403).json({ error: 'Reset deshabilitado en este entorno (requiere ALLOW_RESET=1). Borra datos solo con cuidado manual.' });
  }
  if (String(req.body?.confirmar || '').trim().toUpperCase() !== 'BORRAR TODO') {
    return res.status(400).json({ error: 'Para confirmar, escribí exactamente: BORRAR TODO' });
  }
  try {
    // seed.js usa su propio pool; la re-ejecucion se hace en proceso hijo para limpiar
    const { execFile } = await import('node:child_process');
    await new Promise((resolve, reject) => {
      execFile(process.execPath, [path.join(__dirname, 'seed.js')], (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      });
    });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Reset fallo: ' + e.message });
  }
});

// ---------- Respaldos (boton manual del panel) ----------
// El respaldo corre EN EL SERVIDOR donde vive la base: no hay tarea programada
// del lado de la Mac, el administrador lo dispara desde el panel cuando quiere.
// El endpoint ejecuta el script de respaldo con argumentos FIJOS (nunca texto
// del pedido), asi que el boton no puede convertirse en ejecucion arbitraria.
const RESPALDO_DIR = process.env.BACKUP_DIR || '/var/backups/bertika';
const RESPALDO_SCRIPT = process.env.BACKUP_SCRIPT || '/usr/local/bin/bertika-backup.sh';
// Cuantos dias se conservan (el script usa 14; es solo para mostrarlo en el panel).
const RESPALDO_RETENCION = Number(process.env.BACKUP_RETENCION_DIAS || 14);
// El nombre del archivo se valida contra este patron: no hay forma de pedir
// otra ruta del servidor.
const RESPALDO_ARCHIVO_RE = /^(bertika|uploads)_[A-Za-z0-9_-]+\.(sql\.gz|tar\.gz)$/;

let respaldoEnCurso = false; // un respaldo a la vez (el boton es a prueba de doble click)
let ultimoRespaldo = null;   // que paso la ultima vez que se apreto el boton

// El script devuelve el motivo como JSON en stderr: se muestra el texto y no
// el JSON crudo (el panel lo enseña tal cual).
function mensajeDeError(stderr, err) {
  const texto = String(stderr || '');
  const linea = texto.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{')).pop();
  try {
    const d = JSON.parse(linea || '');
    if (d?.error) return d.error;
  } catch { /* stderr no era JSON */ }
  return texto.trim() || err.message;
}

function listarRespaldos() {
  let nombres = [];
  try {
    nombres = readdirSync(RESPALDO_DIR);
  } catch {
    return [];
  }
  const archivos = [];
  for (const nombre of nombres) {
    if (!RESPALDO_ARCHIVO_RE.test(nombre)) continue;
    try {
      const st = statSync(path.join(RESPALDO_DIR, nombre));
      archivos.push({
        nombre,
        tipo: nombre.startsWith('uploads_') ? 'fotos' : 'base',
        bytes: st.size,
        fecha: st.mtime.toISOString(),
      });
    } catch { /* archivo que se borro mientras listabamos */ }
  }
  return archivos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

app.get('/api/respaldos', authRequired, permisoRequerido('respaldos'), async (req, res) => {
  const archivos = listarRespaldos();
  return res.json({
    archivos,
    carpeta: RESPALDO_DIR,
    retencionDias: RESPALDO_RETENCION,
    corriendo: respaldoEnCurso,
    ultimo: ultimoRespaldo,
    base: archivos.find((a) => a.tipo === 'base') || null,
  });
});

app.post('/api/respaldos', authRequired, permisoRequerido('respaldos'), async (req, res) => {
  if (respaldoEnCurso) return res.status(409).json({ error: 'Ya hay un respaldo en curso. Esperá a que termine.' });
  respaldoEnCurso = true;
  try {
    const { execFile } = await import('node:child_process');
    const salida = await new Promise((resolve, reject) => {
      execFile(
        RESPALDO_SCRIPT,
        ['--en-servidor', '--json'],
        { timeout: 5 * 60 * 1000, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => (err ? reject(new Error(mensajeDeError(stderr, err))) : resolve(String(stdout)))
      );
    });
    // El script imprime UNA linea JSON; si algo mas ensució la salida, se busca
    // la ultima linea que sea JSON valido.
    const linea = salida.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{')).pop();
    let datos;
    try { datos = JSON.parse(linea || ''); } catch { datos = null; }
    if (!datos?.ok || !datos.archivo) {
      throw new Error(datos?.error || 'El respaldo no devolvió un resultado válido');
    }
    const archivos = listarRespaldos();
    ultimoRespaldo = { ok: true, cuando: new Date().toISOString(), archivo: datos.archivo, bytes: datos.bytes, fotos: datos.fotos || null };
    return res.json({ ok: true, ...ultimoRespaldo, archivos, base: archivos.find((a) => a.tipo === 'base') || null });
  } catch (e) {
    ultimoRespaldo = { ok: false, cuando: new Date().toISOString(), error: e.message };
    console.error('[respaldos] fallo el respaldo:', e.message);
    return res.status(500).json({ error: 'No se pudo respaldar: ' + e.message });
  } finally {
    respaldoEnCurso = false;
  }
});

// Bajada del respaldo por el navegador (el .sql.gz que baja el boton).
app.get('/api/respaldos/:archivo', authRequired, permisoRequerido('respaldos'), async (req, res) => {
  const { archivo } = req.params;
  if (!RESPALDO_ARCHIVO_RE.test(archivo)) return res.status(400).json({ error: 'Nombre de respaldo inválido' });
  const ruta = path.join(RESPALDO_DIR, archivo);
  let info;
  try {
    info = statSync(ruta);
  } catch {
    return res.status(404).json({ error: 'Ese respaldo ya no está en el servidor' });
  }
  if (!info.isFile()) return res.status(404).json({ error: 'Ese respaldo ya no está en el servidor' });
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Length', String(info.size));
  res.setHeader('Content-Disposition', `attachment; filename="${archivo}"`);
  const stream = createReadStream(ruta);
  stream.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'No se pudo leer el respaldo' }); else res.destroy(); });
  stream.pipe(res);
});

// ---------- Usuarios (admin) ----------
app.get('/api/usuarios', authRequired, permisoRequerido('usuarios'), async (req, res) => {
  const rows = await query('SELECT id, email, rol, tecnico_id, cliente_id, activo, creado_en, permisos FROM usuarios ORDER BY email');
  return res.json(rows);
});

// Catalogo de permisos para dibujar la tabla de casillas del panel.
app.get('/api/permisos/catalogo', authRequired, permisoRequerido('usuarios'), async (req, res) => {
  // Mismo catalogo que dibuja el panel: filas agrupadas por modulo + columnas.
  return res.json({
    permisos: PERMISOS,
    grupos: agruparPermisos(),
    columnas: COLUMNAS,
    porRol: { admin: permisosPorDefecto('admin'), tecnico: permisosPorDefecto('tecnico'), cliente: permisosPorDefecto('cliente') },
  });
});

app.post('/api/usuarios', authRequired, permisoRequerido('crear_usuarios'), async (req, res) => {
  const { email, password, rol, tecnico_id, cliente_id, permisos } = req.body || {};
  const emailT = String(email || '').trim();
  if (!validEmail(emailT) || !validPassword(password) || !['admin', 'tecnico', 'cliente'].includes(rol)) {
    return res.status(400).json({ error: 'Email, password (min 8 caracteres) y rol valido son obligatorios' });
  }
  const id = await nextId('usr');
  // Los permisos que manda el panel son los de la matriz de casillas. Si no
  // vienen, queda NULL: se usan los de la plantilla del rol.
  const permisosT = permisos === undefined || permisos === null
    ? null
    : normalizarPermisos(permisos, rol);
  await query(
    'INSERT INTO usuarios (id, email, password_hash, rol, tecnico_id, cliente_id, activo, permisos) VALUES ($1,$2,$3,$4,$5,$6,true,$7)',
    [id, emailT, await bcrypt.hash(String(password), BCRYPT_ROUNDS), rol, tecnico_id ? limStr(tecnico_id, 32) : null, cliente_id ? limStr(cliente_id, 32) : null, permisosT]
  );
  await auditar({ req, tabla: 'usuarios', registroId: id, accion: 'crear', despues: { email: emailT, rol, tecnico_id, cliente_id, permisos: permisosT } });
  return res.status(201).json({ id });
});

app.patch('/api/usuarios/:id', authRequired, permisoRequerido('editar_usuarios'), async (req, res) => {
  const { email, password, rol, tecnico_id, cliente_id, activo, permisos } = req.body || {};
  const isSelf = req.params.id === req.user.sub;
  const antes = await one('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
  if (!antes) return res.status(404).json({ error: 'Usuario no encontrado' });
  const sets = [];
  const params = [];
  if (email !== undefined) {
    const e = String(email).trim();
    if (!validEmail(e)) return res.status(400).json({ error: 'Email invalido' });
    params.push(e); sets.push(`email = $${params.length}`);
  }
  if (rol !== undefined) {
    if (!['admin', 'tecnico', 'cliente'].includes(rol)) return res.status(400).json({ error: 'Rol invalido' });
    if (isSelf) return res.status(403).json({ error: 'No podes cambiarte el rol a vos mismo' });
    params.push(rol); sets.push(`rol = $${params.length}`);
  }
  if (tecnico_id !== undefined) { params.push(tecnico_id ? limStr(tecnico_id, 32) : null); sets.push(`tecnico_id = $${params.length}`); }
  if (cliente_id !== undefined) { params.push(cliente_id ? limStr(cliente_id, 32) : null); sets.push(`cliente_id = $${params.length}`); }
  if (activo !== undefined) {
    if (isSelf) return res.status(403).json({ error: 'No podes desactivarte a vos mismo' });
    // Ojo: antes era Boolean(activo), y el texto "false" dejaba al usuario
    // ACTIVO. Ahora se valida y un valor raro se rechaza.
    const activoBool = normalizarBooleano(activo);
    if (activoBool === null) return res.status(400).json({ error: 'El campo activo tiene que ser true o false' });
    params.push(activoBool); sets.push(`activo = $${params.length}`);
  }
  if (password !== undefined && password !== null && password !== '') {
    if (!validPassword(password)) return res.status(400).json({ error: 'Password invalido (min 8 caracteres)' });
    params.push(await bcrypt.hash(String(password), BCRYPT_ROUNDS)); sets.push(`password_hash = $${params.length}`);
  }
  if (permisos !== undefined) {
    // Solo un administrador reparte permisos: evita que alguien con "editar
    // usuarios" se auto-eleve o se deje sin poder administrar.
    if (!esAdmin(req)) return res.status(403).json({ error: 'Solo un administrador puede cambiar los permisos' });
    const rolFinal = rol !== undefined ? rol : (await one('SELECT rol FROM usuarios WHERE id = $1', [req.params.id]))?.rol;
    params.push(normalizarPermisos(permisos, rolFinal));
    sets.push(`permisos = $${params.length}`);
  }
  // Nunca dejar el sistema sin ningun administrador activo.
  if ((rol !== undefined && rol !== 'admin') || activo === false) {
    const objetivo = await one('SELECT rol, activo FROM usuarios WHERE id = $1', [req.params.id]);
    if (objetivo?.rol === 'admin' && objetivo.activo === true) {
      const [resto] = await query("SELECT count(*)::int AS n FROM usuarios WHERE rol = 'admin' AND activo = true AND id <> $1", [req.params.id]);
      if (resto.n === 0) {
        return res.status(400).json({ error: 'Es el único administrador activo: no se le puede cambiar el rol ni dar de baja' });
      }
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
  params.push(req.params.id);
  const despues = await one(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  await auditar({
    req, tabla: 'usuarios', registroId: antes.id, accion: 'editar', antes, despues,
    detalle: password ? 'incluye cambio de contraseña' : null,
  });
  return res.json({ ok: true });
});

app.delete('/api/usuarios/:id', authRequired, permisoRequerido('borrar_usuarios'), async (req, res) => {
  if (req.params.id === req.user.sub) return res.status(403).json({ error: 'No podes dar de baja tu propio usuario' });
  const u = await one('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!u.activo) return res.status(400).json({ error: 'El usuario ya estaba dado de baja' });
  // Baja logica: se conserva la ficha (y el rastro de quien tenia acceso) y se
  // puede reactivar. Ademas el middleware rechaza el token de un usuario inactivo.
  await query('UPDATE usuarios SET activo = false WHERE id = $1', [u.id]);
  await auditar({ req, tabla: 'usuarios', registroId: u.id, accion: 'dar_de_baja', antes: u, despues: { ...u, activo: false } });
  return res.json({ ok: true, baja: true });
});

// ---------- Bajas ----------
app.post('/api/bajas/:id/reciclar', authRequired, permisoRequerido('baja_orden'), async (req, res) => {
  await query('UPDATE bajas SET reciclada = true, fecha_reciclaje = $2 WHERE id = $1', [req.params.id, nowIso()]);
  return res.json({ ok: true });
});

app.get('/api/bajas', authRequired, permisoRequerido('baja'), async (req, res) => res.json(await query('SELECT * FROM bajas ORDER BY fecha DESC')));

// Configuracion vigente del cotizador de visitas: la que edito el admin desde
// el panel (tabla cotizador_config) o, si no hay nada guardado todavia, la de
// fabrica. Se cachea 30 segundos para no consultar en cada estimacion.
let cacheConfig = null;
async function configCotizador({ forzar = false } = {}) {
  const ahora = Date.now();
  if (!forzar && cacheConfig && cacheConfig.expira > ahora) return cacheConfig;
  try {
    const row = await one("SELECT config, actualizado_en, actualizado_por FROM cotizador_config WHERE id = 'actual'");
    cacheConfig = {
      config: normalizarConfig(row?.config || {}),
      actualizado: row?.actualizado_en || null,
      actualizadoPor: row?.actualizado_por || null,
      expira: ahora + 30000,
    };
  } catch (e) {
    console.error('[cotizador] config invalida, se usa la de fabrica:', e.message);
    cacheConfig = { config: CONFIG_DEFAULT, actualizado: null, actualizadoPor: null, expira: ahora + 5000, error: e.message };
  }
  return cacheConfig;
}

// ---------- Cotizador de visitas (publico) ----------
// Configuración vigente del cotizador (la usa la web para estimar en vivo).
app.get('/api/public/cotizador', publicLimiter, async (req, res) => {
  const c = await configCotizador();
  return res.json({ config: c.config, actualizado: c.actualizado, actualizadoPor: c.actualizadoPor });
});

// Edición de la configuración: solo admin. Valida con normalizarConfig() para
// que nunca quede una tabla de precios inconsistente.
app.put('/api/cotizador', authRequired, permisoRequerido('config_cotizador'), async (req, res) => {
  const entrada = req.body?.config ?? req.body ?? {};
  let config;
  try {
    config = normalizarConfig(entrada);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  // Config + historial en una transaccion: la config vigente y su version
  // tienen que guardarse juntas (si no, quedaba un cambio sin trazabilidad).
  const previa = await configCotizador({ forzar: true });
  await tx(async (client) => {
    await client.query(
      `INSERT INTO cotizador_config (id, config, actualizado_en, actualizado_por)
       VALUES ('actual', $1::jsonb, now(), $2)
       ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por`,
      [JSON.stringify(config), req.user.email]
    );
    const cfgId = await nextId('cfg', client);
    await client.query(
      'INSERT INTO cotizador_config_historial (id, config, usuario) VALUES ($1, $2::jsonb, $3::jsonb)',
      [cfgId, JSON.stringify(config), JSON.stringify(actorDe(req))]
    );
  });
  await configCotizador({ forzar: true });
  await auditar({ req, tabla: 'cotizador_config', registroId: 'actual', accion: 'editar', antes: previa.config, despues: config });
  return res.json({ ok: true, config, actualizadoPor: req.user.email });
});

app.get('/api/cotizador/historial', authRequired, permisoRequerido('cotizador'), async (req, res) => {
  return res.json(await query('SELECT id, fecha, usuario FROM cotizador_config_historial ORDER BY fecha DESC LIMIT 50'));
});

// ---------- Embudo del cotizador (métricas para el admin) ----------
const TIPOS_EVENTO = ['abre', 'interactua', 'solicita', 'whatsapp', 'imprime', 'modo'];

app.post('/api/public/cotizador-evento', publicLimiter, async (req, res) => {
  const { tipo, sesion, modo, km, total, codigo } = req.body || {};
  if (!TIPOS_EVENTO.includes(tipo)) return res.status(400).json({ error: 'Evento inválido' });
  await query(
    'INSERT INTO cotizador_eventos (id, tipo, sesion, modo, km, total, codigo) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [
      await nextId('evt'), tipo, limStr(sesion, 40),
      modo === 'taller' ? 'taller' : 'sitio',
      numEnRango(km, 0, 1000000) ?? null,
      numEnRango(total, 0, 1e9) ?? null,
      limStr(codigo, 20) || null,
    ]
  );
  return res.status(201).json({ ok: true });
});

app.get('/api/cotizador/metricas', authRequired, permisoRequerido('cotizador'), async (req, res) => {
  const dias = Math.max(1, Math.min(365, Number(req.query?.dias) || 30));
  const [funnel, cotizaciones, serie] = await Promise.all([
    query(`SELECT tipo, count(*)::int AS eventos, count(DISTINCT sesion)::int AS sesiones
             FROM cotizador_eventos WHERE fecha > now() - ($1 || ' days')::interval
             GROUP BY tipo`, [dias]),
    query(`SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE estado = 'solicitada')::int AS solicitadas,
                  count(*) FILTER (WHERE modo = 'taller')::int AS en_taller,
                  coalesce(round(avg(total)), 0)::int AS ticket_promedio
             FROM cotizaciones_visita WHERE fecha > now() - ($1 || ' days')::interval`, [dias]),
    query(`SELECT to_char(date_trunc('day', fecha), 'YYYY-MM-DD') AS dia, tipo, count(*)::int AS n
             FROM cotizador_eventos
            WHERE fecha > now() - ($1 || ' days')::interval AND tipo IN ('abre', 'solicita')
            GROUP BY 1, 2 ORDER BY 1`, [dias]),
  ]);
  const porTipo = Object.fromEntries(funnel.map((f) => [f.tipo, f]));
  const abren = porTipo.abre?.sesiones || 0;
  const solicitan = porTipo.solicita?.sesiones || 0;
  return res.json({
    dias,
    funnel: {
      abre: porTipo.abre?.sesiones || 0,
      interactua: porTipo.interactua?.sesiones || 0,
      solicita: solicitan,
      whatsapp: porTipo.whatsapp?.sesiones || 0,
      imprime: porTipo.imprime?.sesiones || 0,
      conversion: abren ? Math.round((solicitan / abren) * 100) : null,
    },
    cotizaciones: cotizaciones[0] || { total: 0, solicitadas: 0, en_taller: 0, ticket_promedio: 0 },
    serie,
  });
});

// Cotización del dólar oficial: la resuelve el servidor (proxy + cache) para que
// el navegador no dependa de terceros ni pierda la cotización si uno falla.
app.get('/api/public/dolar', publicLimiter, async (req, res) => {
  const d = await obtenerDolar({ forzar: String(req.query?.forzar || '') === '1' });
  return res.json(d);
});

// Guarda la estimación del cotizador y devuelve su código (CV-000123).
// El servidor RECALCULA el total con el mismo módulo que usa la web: el precio
// no depende de lo que mande el cliente.
app.post('/api/public/cotizacion-visita', publicLimiter, async (req, res) => {
  const {
    km, renglones, extrasSel, urgencia, turno, modo, nombre, empresa, email, telefono,
    fecha_preferida, website, terminosVersion, privacidadVersion, aceptaTerminos, aceptaPrivacidad,
    idempotencyKey,
  } = req.body || {};
  if (website) return res.status(201).json({ ok: true, codigo: '', descartado: true });

  const { config, actualizado: configActualizada } = await configCotizador();
  const modoT = modo === 'taller' && config.modoTaller.habilitado ? 'taller' : 'sitio';
  const esTaller = modoT === 'taller';

  // En visita al sitio la distancia es obligatoria y tiene tope de cobertura.
  let kmNum = 0;
  if (!esTaller) {
    kmNum = numEnRango(km, 0.1, 1000000);
    if (kmNum === null) return res.status(400).json({ error: 'Ingresá la distancia aproximada en km (número mayor a 0)' });
    if (kmNum > config.maxKm) {
      return res.status(400).json({ error: textoFueraCobertura(config.maxKm), fueraDeCobertura: true });
    }
  }
  const emailT = email ? String(email).trim() : '';
  if (emailT && !validEmail(emailT)) return res.status(400).json({ error: 'El email no es válido' });

  // Si la estimación lleva datos personales, se guarda el consentimiento antes
  // de persistirla. Una estimación anónima no necesita aceptación.
  const tieneDatos = Boolean(limStr(nombre, 120) || limStr(empresa, 120) || emailT || limStr(telefono, 40));
  if (tieneDatos) {
    await guardarConsentimientoLegal({
      req,
      tipo: 'formulario',
      nombre: limStr(nombre, 120),
      email: emailT,
      idempotencyKey,
      aceptaTerminos,
      aceptaPrivacidad,
      terminosVersion,
      privacidadVersion,
      canal: 'web',
      accion: 'estimar',
      origen: 'cotizador_visita',
      pagina: '/cotizador',
    });
  }

  const dolar = await obtenerDolar();
  const cot = calcularVisita({ km: kmNum, renglones, extrasSel, urgencia, turno, modo: modoT, dolar, config });
  if (!cot.ok) return res.status(400).json({ error: cot.avisos[0]?.texto || textoFueraCobertura(config.maxKm), fueraDeCobertura: true });

  const nro = String((await nextId('cv')).split('_')[1] || '').padStart(6, '0');
  const codigo = `CV-${nro}`;
  const fechaPref = limStr(fecha_preferida, 10);
  await query(
    `INSERT INTO cotizaciones_visita
      (id, km, zona, renglones, extras, urgencia, turno, subtotal, descuento, recargos, iva, total, moneda, dolar,
       nombre, empresa, email, telefono, fecha_preferida, resumen, config_actualizado, viaticos, viaticos_dias, modo)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$20,$13::jsonb,$14,$15,$16,$17,$18,$19,$21,$22,$23,$24)`,
    [
      codigo, kmNum, cot.zona?.nombre || null,
      JSON.stringify(cot.detalle.map((d) => ({ tipo: d.tipo.id, nombre: d.tipo.nombre, cantidad: d.cantidad, precioUnidad: d.tipo.precioUnidad, subtotal: d.subtotal }))),
      JSON.stringify(cot.detExtras.map((e) => ({ id: e.id, nombre: e.nombre, cantidad: e.cantidad, precio: e.precio, subtotal: e.subtotal }))),
      cot.urgencia, cot.turno, cot.subtotal, cot.descuentoVol, cot.recargo, cot.iva, cot.total,
      JSON.stringify(dolar), limStr(nombre, 120), limStr(empresa, 120), emailT, limStr(telefono, 40),
      /^\d{4}-\d{2}-\d{2}$/.test(fechaPref) ? fechaPref : null, cot.resumen,
      config.moneda, configActualizada, cot.viaticos, cot.viaticosDias, cot.modo,
    ]
  );
  return res.status(201).json({
    ok: true, codigo, total: cot.total, moneda: cot.moneda, ars: cot.ars,
    dolar: { disponible: dolar.disponible, venta: dolar.venta ?? null, actualizado: dolar.actualizado || null, fuente: dolar.fuente || null, vencido: Boolean(dolar.vencido) },
    avisos: cot.avisos, resumen: cot.resumen,
  });
});

// Consulta publica de una cotización por su código (sin datos personales).
app.get('/api/public/cotizacion-visita/:codigo', publicLimiter, async (req, res) => {
  const codigo = limStr(req.params.codigo, 20).toUpperCase();
  const c = await one(
    `SELECT id, fecha, km, zona, renglones, extras, urgencia, turno, subtotal, descuento, recargos, iva, total,
            moneda, dolar, estado, resumen
       FROM cotizaciones_visita WHERE id = $1`,
    [codigo]
  );
  if (!c) return res.status(404).json({ error: 'Cotización no encontrada' });
  return res.json(c);
});

// ---------- Contacto publico (crea orden si es reparacion + envia correo a ventas) ----------
app.post('/api/public/contacto', contactoLimiter, async (req, res) => {
  const {
    nombre, empresa, email, telefono, serie, asunto, mensaje, cotizacion_codigo, website,
    terminosVersion, privacidadVersion, aceptaTerminos, aceptaPrivacidad, idempotencyKey,
  } = req.body || {};
  // Honeypot: campo oculto que solo completan bots. Se descarta silenciosamente.
  if (website) return res.status(201).json({ ok: true, emailEnviado: false, codigo: '' });
  const nombreT = limStr(nombre, 120);
  const emailT = String(email || '').trim();
  const mensajeT = limStr(mensaje, 2000);
  if (!nombreT || !validEmail(emailT) || !mensajeT) {
    return res.status(400).json({ error: 'Faltan nombre, email valido y mensaje' });
  }
  // Se guarda el consentimiento ANTES de crear la orden o mandar el correo:
  // si el envío falla, la prueba de que la persona aceptó igual queda.
  const consentimiento = await guardarConsentimientoLegal({
    req,
    tipo: 'formulario',
    nombre: nombreT,
    email: emailT,
    idempotencyKey,
    aceptaTerminos,
    aceptaPrivacidad,
    terminosVersion,
    privacidadVersion,
    canal: 'email',
    accion: 'enviar',
    origen: 'formulario_contacto',
    pagina: '/contacto',
  });
  if (consentimiento.duplicado) {
    return res.status(201).json({ ok: true, emailEnviado: true, codigo: '', duplicado: true });
  }
  const esReparacion = Boolean(serie && String(serie).trim());
  const serieTxt = esReparacion ? String(serie).trim().slice(0, 64) : '';
  const empresaT = limStr(empresa, 120);
  const asuntoT = limStr(asunto, 120);
  let codigoTxt = '';

  if (esReparacion) {
    await tx(async (client) => {
      let c = (await client.query('SELECT * FROM clientes WHERE LOWER(email) = LOWER($1)', [emailT])).rows[0];
      if (!c) {
        const cid = await nextId('cli', client);
        // ON CONFLICT DO NOTHING + relectura: si dos consultas del mismo email
        // entran juntas, una gana y la otra reutiliza esa ficha (antes se
        // creaban clientes duplicados).
        await client.query(
          `INSERT INTO clientes (id, nombre, tipo, telefono, contacto, email, empresa) VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT DO NOTHING`,
          [cid, nombreT, 'particular', limStr(telefono, 40), nombreT, emailT, empresaT]
        );
        c = (await client.query('SELECT * FROM clientes WHERE LOWER(email) = LOWER($1)', [emailT])).rows[0]
          || { id: cid, nombre: nombreT };
      }
      const evId = await nextId('ev', client);
      const ordId = await nextId('ord', client);
      const codigo = await generarCodigoUnico(async (cod) => {
        const r = await client.query('SELECT 1 FROM ordenes WHERE codigo_seguimiento = $1', [cod]);
        return r.rowCount > 0;
      });
      codigoTxt = formatearCodigo(codigo);
      await client.query(
        `INSERT INTO ordenes (id, codigo_seguimiento, bateria_serie, cliente_id, tecnico_id, falla, motivo, estado, fecha_ingreso, hora_entrega, eventos, cotizacion, estado_cotizacion, insumos_utilizados, prueba_final, diagnostico, consentimiento_id)
         VALUES ($1,$2,$3,$4,NULL,$5,$5,'received',$6,$7,$8::jsonb,NULL,NULL,'[]'::jsonb,'{"estado":"pending"}',NULL,$9)`,
        [
          ordId, codigo, serieTxt, c.id, mensajeT,
          nowIso(), new Date(Date.now() + 24 * 3600000).toISOString(),
          JSON.stringify([{ id: evId, tipo: 'ingreso', detalle: `Batería ${serieTxt} ingresada al taller (por web). Falla reportada: ${mensajeT}`, fecha: nowIso(), usuario: null }]),
          consentimiento.id,
        ]
      );
    });
  }

  // Si la consulta viene del cotizador de visitas, se adjunta la estimación
  // guardada (con importes y cotización del dólar) y queda marcada como
  // solicitada. Todo dentro de una transacción y con el estado como condición:
  // dos envíos simultáneos no la marcan dos veces.
  let cotizacionDetalle = '';
  const cotCodigo = limStr(cotizacion_codigo, 20).toUpperCase();
  if (cotCodigo) {
    cotizacionDetalle = await tx(async (client) => {
      const c = (await client.query('SELECT id, total, moneda, dolar, resumen, estado FROM cotizaciones_visita WHERE id = $1 FOR UPDATE', [cotCodigo])).rows[0];
      if (!c) return '';
      const d = c.dolar || {};
      const texto = `${c.id} · ${c.moneda} ${c.total}${d.venta ? ` · dólar ${d.casa || 'oficial'} venta ${d.venta}${d.fuente ? ` (${d.fuente})` : ''}` : ''}\n${c.resumen}`;
      if (c.estado === 'estimada') {
        await client.query("UPDATE cotizaciones_visita SET estado = 'solicitada' WHERE id = $1 AND estado = 'estimada'", [c.id]);
      }
      return texto;
    });
  }

  const mail = await enviarMailContacto({ nombre: nombreT, empresa: empresaT, email: emailT, telefono: limStr(telefono, 40), serie: serieTxt, asunto: asuntoT, mensaje: mensajeT, codigo: codigoTxt, cotizacionDetalle });
  return res.status(201).json({ ok: true, emailEnviado: mail.ok, codigo: codigoTxt, cotizacion: cotCodigo || null });
});

// ---------- WhatsApp (canal oficial de Meta) ----------
// Cada telefono es una conversacion, vinculada al cliente cuando coincide con
// su ficha. Los mensajes quedan guardados: la bandeja vive en el panel.

// Vincula un telefono con la ficha del cliente (los datos viejos estan
// cargados como "11 5555-0101", asi que se comparan normalizados).
async function clientePorTelefono(telefono) {
  const destino = normalizarTelefono(telefono);
  if (!destino) return null;
  const clientes = await query('SELECT id, nombre, telefono, email FROM clientes');
  const sinNueve = destino.startsWith('549') ? `54${destino.slice(3)}` : null;
  return clientes.find((c) => {
    const d = String(c.telefono || '').replace(/\D/g, '');
    if (!d) return false;
    return normalizarTelefono(d) === destino || d === destino || (sinNueve && d === sinNueve);
  }) || null;
}

async function conversacionDe(telefono, nombrePerfil = null) {
  const destino = normalizarTelefono(telefono);
  if (!destino) return null;
  let conv = await one('SELECT * FROM wa_conversaciones WHERE telefono = $1', [destino]);
  if (!conv) {
    const cliente = await clientePorTelefono(destino);
    const id = await nextId('wacv');
    await query(
      'INSERT INTO wa_conversaciones (id, telefono, cliente_id, nombre_perfil) VALUES ($1,$2,$3,$4)',
      [id, destino, cliente?.id || null, nombrePerfil || cliente?.nombre || null]
    );
    conv = await one('SELECT * FROM wa_conversaciones WHERE id = $1', [id]);
  } else if (!conv.cliente_id) {
    const cliente = await clientePorTelefono(destino);
    if (cliente) {
      await query('UPDATE wa_conversaciones SET cliente_id = $2 WHERE id = $1', [conv.id, cliente.id]);
      conv.cliente_id = cliente.id;
    }
  }
  return conv;
}

async function guardarMensaje({ conversacion, direccion, tipo, texto, plantilla = null, waMessageId = null, estado = null, error = null, fecha = null, mediaUrl = null, mediaTipo = null, mediaNombre = null }) {
  // Mensaje + resumen de la conversacion en UNA transaccion: antes podia quedar
  // el mensaje guardado sin actualizar el ultimo texto o los no leidos.
  // Si viene wa_message_id y existe el indice unico, la reserva es atomica: un
  // aviso repetido de Meta (o un reintento del mismo envio) no se duplica y
  // devuelve null.
  return tx(async (client) => {
    const id = await nextId('wams', client);
    const dedupe = Boolean(waMessageId) && indiceWamid;
    const ins = await client.query(
      `INSERT INTO wa_mensajes (id, conversacion_id, wa_message_id, direccion, telefono, tipo, texto, plantilla, estado, error, fecha, media_url, media_tipo, media_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11::timestamptz, now()), $12, $13, $14)
       ${dedupe ? 'ON CONFLICT (wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING' : ''}
       RETURNING id`,
      [id, conversacion.id, waMessageId, direccion, conversacion.telefono, tipo, texto, plantilla, estado, error, fecha, mediaUrl, mediaTipo, mediaNombre]
    );
    if (!ins.rows.length) return null; // ya estaba cargado: no se duplica
    if (direccion === 'in') {
      await client.query(
        "UPDATE wa_conversaciones SET ultimo_texto = $2, ultima_fecha = now(), no_leidos = COALESCE(no_leidos, 0) + 1, estado = 'abierta' WHERE id = $1",
        [conversacion.id, texto || `[${tipo}]`]
      );
    } else {
      await client.query('UPDATE wa_conversaciones SET ultimo_texto = $2, ultima_fecha = now() WHERE id = $1', [conversacion.id, texto || `[${tipo}]`]);
    }
    return id;
  });
}

// Guarda el mensaje, lo encola y hace un intento inmediato. Devuelve el status
// y el cuerpo para que el endpoint decida (texto normal, cotizacion, etc.).
async function guardarYEnviar({
  conv, tipo, texto, plantilla = null, parametros = [], media = null,
}) {
  const mensajeId = await guardarMensaje({
    conversacion: conv,
    direccion: 'out',
    tipo: tipo === 'imagen' ? 'image' : tipo === 'documento' ? 'document' : (tipo === 'plantilla' ? 'template' : 'text'),
    texto,
    plantilla,
    estado: 'en_cola',
    mediaUrl: media?.url || null,
    mediaTipo: media?.tipo || null,
    mediaNombre: media?.nombre || null,
  });
  let envioId;
  try {
    envioId = await encolar({
      conversacionId: conv.id,
      telefono: conv.telefono,
      tipo,
      texto,
      plantilla,
      parametros,
      mediaPath: media?.path || null,
      mediaMime: media?.mime || null,
      mediaNombre: media?.nombre || null,
      mensajeId,
    });
  } catch (e) {
    // No se pudo ni encolar: el mensaje queda en la bandeja marcado con error,
    // no "en cola" para siempre.
    if (mensajeId) {
      await query("UPDATE wa_mensajes SET estado = 'error', error = $2 WHERE id = $1", [mensajeId, `No se pudo encolar: ${e.message}`]);
    }
    return { status: 500, body: { error: `No se pudo encolar el mensaje: ${e.message}` }, mensajeId, envioId: null };
  }
  const r = await procesarEnvio(envioId);
  const base = { conversacion_id: conv.id, media_url: media?.url || null, media_tipo: media?.tipo || null };
  if (r.estado === 'enviado') {
    return { status: 200, body: { ok: true, id: r.waMessageId || null, estado: 'enviado', ...base }, mensajeId, envioId };
  }
  if (r.estado === 'pendiente') {
    return {
      status: 202,
      body: {
        ok: true, enCola: true, estado: 'pendiente', ...base,
        aviso: 'WhatsApp no respondió: el mensaje quedó en cola y se reintenta solo.',
      },
      mensajeId, envioId,
    };
  }
  if (r.estado === 'incierto') {
    return {
      status: 202,
      body: {
        ok: true, enCola: true, incierto: true, estado: 'incierto', ...base,
        aviso: 'No sabemos si el mensaje llegó. Revisalo en Sistema → Envíos antes de reenviarlo.',
      },
      mensajeId, envioId,
    };
  }
  return {
    status: 400,
    body: { ok: false, error: r.error || 'No se pudo enviar el mensaje', estado: r.estado },
    mensajeId, envioId,
  };
}

// Version para los endpoints que solo quieren responder el resultado.
async function enviarPorOutbox(res, opciones) {
  const r = await guardarYEnviar(opciones);
  return res.status(r.status).json(r.body);
}


async function reservarAviso(ordenId, plantilla) {
  const r = await one(
    `INSERT INTO wa_avisos_log (orden_id, plantilla, estado) VALUES ($1, $2, 'enviando')
     ON CONFLICT (orden_id, plantilla) DO UPDATE SET estado = 'enviando', error = NULL, fecha = now()
       WHERE wa_avisos_log.estado <> 'enviado'
         AND (wa_avisos_log.estado <> 'enviando' OR wa_avisos_log.fecha < now() - interval '10 minutes')
         -- Si el aviso todavia esta en la cola (o quedo sin confirmar), no se
         -- encola otro: evita el mensaje duplicado cuando el reintento tarda.
         AND NOT EXISTS (
           SELECT 1 FROM wa_outbox o
            WHERE o.aviso_orden_id = $1 AND o.aviso_plantilla = $2
              AND o.estado IN ('pendiente', 'enviando', 'incierto')
              AND o.creado_en > now() - interval '1 day'
         )
     RETURNING orden_id`,
    [ordenId, plantilla]
  );
  return Boolean(r);
}

// Subida de adjuntos del chat: fotos o PDF, hasta 8 MB.
const uploadChat = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Solo se permiten fotos (jpg, png, webp, gif) o PDF'));
  },
});

// ---------- Avisos automaticos por WhatsApp ----------
let cacheAvisos = { valor: null, hasta: 0 };

async function configAvisos({ forzar = false } = {}) {
  if (!forzar && cacheAvisos.valor && Date.now() < cacheAvisos.hasta) return cacheAvisos.valor;
  const filas = await query('SELECT evento, activo FROM wa_avisos_config');
  const guardado = Object.fromEntries(filas.map((f) => [f.evento, f.activo === true]));
  const valor = normalizarAvisos(guardado);
  cacheAvisos = { valor, hasta: Date.now() + 15000 };
  return valor;
}

// Manda (encola) la plantilla que corresponde al estado actual de la orden, si
// el aviso esta prendido, el cliente tiene telefono y no se le haya mandado ya.
// Nunca lanza: un aviso fallido no puede voltear la operacion del taller.
async function avisarOrden(ordenId) {
  try {
    const orden = await one('SELECT * FROM ordenes WHERE id = $1', [ordenId]);
    if (!orden) return;
    const plantilla = PLANTILLA_POR_ESTADO[orden.estado];
    if (!plantilla) return;
    const activos = await configAvisos();
    if (!activos[orden.estado]) return;
    const cliente = orden.cliente_id
      ? await one('SELECT id, nombre, telefono FROM clientes WHERE id = $1', [orden.cliente_id])
      : null;
    if (!cliente?.telefono) return; // sin telefono no hay a donde avisar
    if (await estaEnBaja(cliente.telefono)) return; // pidio no recibir mas mensajes
    const conv = await conversacionDe(cliente.telefono);
    if (!conv) return;
    if (!(await reservarAviso(orden.id, plantilla))) return; // ya se mando (o lo esta mandando otro)
    const parametros = parametrosAviso(orden.estado, {
      cliente, orden, sitio: PUBLIC_URL,
      // El enlace público exige el token firmado: sin esto el cliente abría
      // una cotización que la API rechaza.
      linkCotizacion: `${PUBLIC_URL}/cotizacion/${orden.id}?t=${hornoSigCot(orden.id)}`,
    });
    const texto = resumenAviso(orden.estado, { orden });
    const mensajeId = await guardarMensaje({
      conversacion: conv, direccion: 'out', tipo: 'template', plantilla, texto, estado: 'en_cola',
    });
    try {
      // Sale por la cola: si Meta esta caido, el aviso no se pierde.
      await encolar({
        conversacionId: conv.id, telefono: cliente.telefono, tipo: 'plantilla',
        plantilla, parametros, texto, mensajeId,
        avisoOrdenId: orden.id, avisoPlantilla: plantilla,
      });
    } catch (e) {
      // Si no se pudo encolar, se libera la reserva para el proximo intento.
      await query('DELETE FROM wa_avisos_log WHERE orden_id = $1 AND plantilla = $2', [orden.id, plantilla]);
      throw e;
    }
  } catch (e) {
    console.error('[whatsapp] error encolando el aviso:', e.message);
  }
}

// Que avisos automaticos existen y cuales estan prendidos.
app.get('/api/whatsapp/avisos', authRequired, permisoRequerido('avisos_whatsapp'), async (req, res) => {
  return res.json({ eventos: EVENTOS_AVISO, activos: await configAvisos({ forzar: true }) });
});

app.put('/api/whatsapp/avisos', authRequired, permisoRequerido('avisos_whatsapp'), async (req, res) => {
  const activos = normalizarAvisos(req.body?.activos ?? req.body);
  for (const e of EVENTOS_AVISO) {
    await query(
      `INSERT INTO wa_avisos_config (evento, activo) VALUES ($1,$2)
       ON CONFLICT (evento) DO UPDATE SET activo = EXCLUDED.activo`,
      [e.evento, activos[e.evento]]
    );
  }
  cacheAvisos = { valor: null, hasta: 0 };
  return res.json({ eventos: EVENTOS_AVISO, activos: await configAvisos({ forzar: true }) });
});

// Revision de garantias: avisa a los clientes cuya garantia vence en los
// proximos 30 dias. Se corre sola una vez por dia y tambien a mano desde el panel.
async function avisarGarantias() {
  const resumen = { revisadas: 0, encoladas: 0, errores: 0, sinTelefono: 0, apagado: false, detalle: [] };
  try {
    const activos = await configAvisos();
    if (!activos.garantia) return { ...resumen, apagado: true };
    // Se filtra la fecha en JS (no en SQL): hay garantias viejas sin "vence" y
    // castear texto vacio a timestamptz romperia la consulta.
    const ordenes = await query(`SELECT o.id, o.bateria_serie, o.garantia, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
      FROM ordenes o LEFT JOIN clientes c ON c.id = o.cliente_id
      WHERE o.garantia IS NOT NULL AND o.estado = 'delivered'
      ORDER BY o.fecha_entrega DESC NULLS LAST LIMIT 500`);
    for (const o of ordenes) {
      if (!debeAvisarGarantia(o.garantia?.vence)) continue;
      resumen.revisadas += 1;
      if (!o.cliente_telefono) { resumen.sinTelefono += 1; continue; }
      const conv = await conversacionDe(o.cliente_telefono);
      if (!conv) continue;
      if (await estaEnBaja(o.cliente_telefono)) continue; // pidio no recibir mas mensajes
      if (!(await reservarAviso(o.id, PLANTILLA_GARANTIA))) continue; // ya se aviso
      const parametros = parametrosGarantia({ cliente: { nombre: o.cliente_nombre }, orden: o });
      const texto = resumenAviso('garantia', { orden: o });
      const mensajeId = await guardarMensaje({
        conversacion: conv, direccion: 'out', tipo: 'template', plantilla: PLANTILLA_GARANTIA,
        texto, estado: 'en_cola',
      });
      try {
        await encolar({
          conversacionId: conv.id, telefono: o.cliente_telefono, tipo: 'plantilla',
          plantilla: PLANTILLA_GARANTIA, parametros, texto, mensajeId,
          avisoOrdenId: o.id, avisoPlantilla: PLANTILLA_GARANTIA,
        });
        resumen.encoladas += 1;
        resumen.detalle.push(`${o.bateria_serie} (${o.id})`);
      } catch (e) {
        console.error('[whatsapp] no se pudo encolar el aviso de garantía:', e.message);
        await query('DELETE FROM wa_avisos_log WHERE orden_id = $1 AND plantilla = $2', [o.id, PLANTILLA_GARANTIA]);
        resumen.errores += 1;
      }
    }
  } catch (e) {
    console.error('[whatsapp] error revisando garantias:', e.message);
    resumen.error = e.message;
  }
  return resumen;
}

// Revision a mano desde el panel (devuelve cuantas se avisaron).
app.post('/api/whatsapp/avisos/garantias', authRequired, permisoRequerido('avisos_whatsapp'), async (req, res) => {
  return res.json(await avisarGarantias());
});

// ---------- Automatizaciones de seguimiento (crean tareas, no mandan solas) ----------
let cacheAuto = { valor: null, hasta: 0 };

async function configAutomatizaciones({ forzar = false } = {}) {
  if (!forzar && cacheAuto.valor && Date.now() < cacheAuto.hasta) return cacheAuto.valor;
  const filas = await query('SELECT clave, activo, dias FROM wa_automatizaciones');
  const guardado = Object.fromEntries(filas.map((f) => [f.clave, { activo: f.activo === true, dias: f.dias }]));
  const valor = normalizarAutomatizaciones(guardado);
  cacheAuto = { valor, hasta: Date.now() + 15000 };
  return valor;
}

// Crea la tarea y anota la regla en el log. El UNIQUE (clave, referencia) es la
// garantia de que no se duplica aunque el worker corra dos veces a la vez.
async function crearTareaAutomatica({ clave, referencia, tarea }) {
  return tx(async (client) => {
    const logId = `wal_${randomUUID()}`;
    const reserva = await client.query(
      `INSERT INTO wa_automatizaciones_log (id, clave, referencia, detalle)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (clave, referencia) DO NOTHING
       RETURNING id`,
      [logId, clave, referencia, tarea.detalle || null]
    );
    if (!reserva.rows.length) return null;
    const tareaId = await nextId('wat', client);
    await client.query(
      `INSERT INTO wa_tareas (id, conversacion_id, orden_id, cliente_id, titulo, vence, asignado_a, estado, creada_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente','automatizacion')`,
      [
        tareaId, tarea.conversacion_id || null, tarea.orden_id || null, tarea.cliente_id || null,
        tarea.titulo, tarea.vence || new Date(Date.now() + 86400000).toISOString(), tarea.asignado_a || null,
      ]
    );
    await client.query('UPDATE wa_automatizaciones_log SET tarea_id = $2 WHERE id = $1', [logId, tareaId]);
    return tareaId;
  });
}

// Corre las reglas prendidas. Se llama sola cada 6 horas y a mano desde el panel.
async function revisarAutomatizaciones() {
  const resumen = { presupuesto: 0, retiro: 0, errores: 0, apagado: false };
  try {
    const cfg = await configAutomatizaciones({ forzar: true });
    if (!cfg.seguimiento_presupuesto.activo && !cfg.retiro_pendiente.activo) {
      return { ...resumen, apagado: true };
    }

    if (cfg.seguimiento_presupuesto.activo) {
      const filas = await query(
        `SELECT c.id, c.telefono, c.asignado_a, c.etapa, c.ultima_fecha,
                COALESCE(cl.nombre, c.nombre_perfil, c.telefono) AS nombre
           FROM wa_conversaciones c
           LEFT JOIN clientes cl ON cl.id = c.cliente_id
          WHERE c.etapa IN ('presupuestado', 'negociando')
            AND c.ultima_fecha IS NOT NULL
            AND c.ultima_fecha < now() - ($1::int * interval '1 day')
            AND c.ultima_fecha > now() - interval '120 days'
            AND NOT EXISTS (SELECT 1 FROM wa_tareas t WHERE t.conversacion_id = c.id AND t.estado = 'pendiente')
            AND NOT EXISTS (SELECT 1 FROM wa_automatizaciones_log l WHERE l.clave = 'seguimiento_presupuesto' AND l.referencia = c.id)
            AND NOT EXISTS (SELECT 1 FROM wa_consentimiento k WHERE k.telefono = c.telefono AND k.estado = 'baja')
          ORDER BY c.ultima_fecha ASC LIMIT 100`,
        [cfg.seguimiento_presupuesto.dias]
      );
      for (const f of filas) {
        if (!debeSeguirPresupuesto(
          { etapa: f.etapa, ultimaFecha: f.ultima_fecha, enBaja: false, tareaAbierta: false },
          { dias: cfg.seguimiento_presupuesto.dias }
        )) continue;
        try {
          const tareaId = await crearTareaAutomatica({
            clave: 'seguimiento_presupuesto',
            referencia: f.id,
            tarea: {
              conversacion_id: f.id,
              asignado_a: f.asignado_a || null,
              titulo: tituloSeguimiento(f.nombre),
              detalle: `Presupuesto sin respuesta (${cfg.seguimiento_presupuesto.dias} días).`,
            },
          });
          if (tareaId) resumen.presupuesto += 1;
        } catch (e) {
          resumen.errores += 1;
          console.error('[automatizaciones] no se pudo crear la tarea de presupuesto:', e.message);
        }
      }
    }

    if (cfg.retiro_pendiente.activo) {
      // El tecnico_id de la orden es informativo; si tiene usuario, la tarea se
      // le asigna a esa persona, si no queda en el pool.
      const tecnicos = await query("SELECT tecnico_id, email FROM usuarios WHERE activo = true AND tecnico_id IS NOT NULL");
      const emailPorTecnico = Object.fromEntries(tecnicos.map((t) => [t.tecnico_id, t.email]));
      const filas = await query(
        `SELECT o.id, o.bateria_serie, o.cliente_id, o.tecnico_id, o.hora_entrega, o.fecha_ingreso,
                COALESCE(cl.nombre, 'el cliente') AS cliente_nombre
           FROM ordenes o
           LEFT JOIN clientes cl ON cl.id = o.cliente_id
          WHERE o.estado = 'ready'
            AND COALESCE(o.hora_entrega, o.fecha_ingreso) < now() - ($1::int * interval '1 day')
            AND COALESCE(o.hora_entrega, o.fecha_ingreso) > now() - interval '120 days'
            AND NOT EXISTS (SELECT 1 FROM wa_tareas t WHERE t.orden_id = o.id AND t.estado = 'pendiente')
            AND NOT EXISTS (SELECT 1 FROM wa_automatizaciones_log l WHERE l.clave = 'retiro_pendiente' AND l.referencia = o.id)
          ORDER BY COALESCE(o.hora_entrega, o.fecha_ingreso) ASC LIMIT 100`,
        [cfg.retiro_pendiente.dias]
      );
      for (const o of filas) {
        if (!debePedirRetiro({
          estado: 'ready', horaEntrega: o.hora_entrega, fechaIngreso: o.fecha_ingreso, tareaAbierta: false,
        }, { dias: cfg.retiro_pendiente.dias })) continue;
        try {
          const tareaId = await crearTareaAutomatica({
            clave: 'retiro_pendiente',
            referencia: o.id,
            tarea: {
              orden_id: o.id,
              cliente_id: o.cliente_id,
              asignado_a: emailPorTecnico[o.tecnico_id] || null,
              titulo: tituloRetiro(o.cliente_nombre, o.bateria_serie),
              detalle: `Orden lista hace ${cfg.retiro_pendiente.dias} días o más.`,
            },
          });
          if (tareaId) resumen.retiro += 1;
        } catch (e) {
          resumen.errores += 1;
          console.error('[automatizaciones] no se pudo crear la tarea de retiro:', e.message);
        }
      }
    }
  } catch (e) {
    resumen.error = e.message;
    console.error('[automatizaciones] revisión fallida:', e.message);
  }
  return resumen;
}

let timerAuto = null;
function iniciarAutomatizaciones({ intervaloMs = 6 * 60 * 60 * 1000 } = {}) {
  if (timerAuto) return;
  timerAuto = setInterval(() => { revisarAutomatizaciones(); }, intervaloMs);
  if (timerAuto.unref) timerAuto.unref();
  const primera = setTimeout(() => { revisarAutomatizaciones(); }, 90 * 1000);
  if (primera.unref) primera.unref();
}

// Configuracion y catalog of para el panel.
app.get('/api/whatsapp/automatizaciones', authRequired, permisoRequerido('avisos_whatsapp'), async (req, res) => {
  const ultima = await one('SELECT max(fecha) AS fecha FROM wa_automatizaciones_log');
  return res.json({
    catalogo: AUTOMATIZACIONES,
    config: await configAutomatizaciones({ forzar: true }),
    ultima: ultima?.fecha || null,
  });
});

app.put('/api/whatsapp/automatizaciones', authRequired, permisoRequerido('avisos_whatsapp'), async (req, res) => {
  const config = normalizarAutomatizaciones(req.body?.config ?? req.body);
  for (const a of AUTOMATIZACIONES) {
    const c = config[a.clave];
    await query(
      `INSERT INTO wa_automatizaciones (clave, activo, dias, actualizado_en)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (clave) DO UPDATE SET activo = EXCLUDED.activo, dias = EXCLUDED.dias, actualizado_en = now()`,
      [a.clave, c.activo, c.dias]
    );
  }
  cacheAuto = { valor: null, hasta: 0 };
  await auditar({ req, tabla: 'wa_automatizaciones', accion: 'editar', antes: null, despues: config, detalle: 'Configuración de automatizaciones' });
  return res.json({ catalogo: AUTOMATIZACIONES, config: await configAutomatizaciones({ forzar: true }) });
});

app.post('/api/whatsapp/automatizaciones/revisar', authRequired, permisoRequerido('avisos_whatsapp'), async (req, res) => {
  const r = await revisarAutomatizaciones();
  await auditar({ req, tabla: 'wa_automatizaciones', accion: 'revisar', detalle: `presupuesto=${r.presupuesto} retiro=${r.retiro} errores=${r.errores}` });
  return res.json(r);
});

// Tarea diaria: a los 2 minutos de arrancar el servicio y cada 24 h.
// No frena el proceso (unref) y no rompe nada si Meta no responde.
const tareaGarantias = setInterval(() => { avisarGarantias(); }, 24 * 3600 * 1000);
if (typeof tareaGarantias.unref === 'function') tareaGarantias.unref();
const primerChequeo = setTimeout(() => { avisarGarantias(); }, 2 * 60 * 1000);
if (typeof primerChequeo.unref === 'function') primerChequeo.unref();

// Estado del canal para el panel: configurado o no, que falta y los numeros.
app.get('/api/whatsapp/estado', authRequired, permisoRequerido('whatsapp'), async (req, res) => {
  const cfg = configPublicaWhatsApp();
  const [tot] = await query(`SELECT
      count(*) FILTER (WHERE direccion = 'in')::int AS recibidos,
      count(*) FILTER (WHERE direccion = 'out')::int AS enviados,
      count(*) FILTER (WHERE direccion = 'out' AND estado = 'error')::int AS con_error,
      count(*) FILTER (WHERE direccion = 'in' AND fecha > now() - interval '7 days')::int AS recibidos_7d
    FROM wa_mensajes`);
  const [conv] = await query('SELECT count(*)::int AS conversaciones, COALESCE(sum(no_leidos), 0)::int AS sin_leer FROM wa_conversaciones');
  // Etiquetas: el catalogo es la fuente (con color), mas las que hayan quedado
  // sueltas en conversaciones viejas (para que el filtro siga encontrandolas).
  const catalogo = await query('SELECT nombre, color FROM wa_etiquetas WHERE activo = true ORDER BY orden, nombre');
  const enUso = await query(`SELECT DISTINCT trim(t) AS etiqueta FROM wa_conversaciones,
      unnest(string_to_array(COALESCE(etiquetas, ''), ',')) AS t
    WHERE trim(t) <> ''`);
  const conocidas = new Set(catalogo.map((t) => t.nombre.toLowerCase()));
  const sueltas = enUso.map((t) => t.etiqueta).filter((t) => t && !conocidas.has(t.toLowerCase()));
  return res.json({
    ...cfg,
    webhook: `${PUBLIC_URL}/api/whatsapp/webhook`,
    estadisticas: { ...tot, ...conv },
    etiquetas: [...catalogo.map((t) => t.nombre), ...sueltas],
    etiquetasCatalogo: [...catalogo, ...sueltas.map((n) => ({ nombre: n, color: '#98a2b3' }))],
  });
});

// Bandeja con filtros: busqueda libre, etiqueta, responsable y sin leer.
app.get('/api/whatsapp/conversaciones', authRequired, permisoRequerido('whatsapp'), async (req, res) => {
  const q = limStr(req.query?.q, 60);
  const etiqueta = limStr(req.query?.etiqueta, 24);
  const asignado = limStr(req.query?.asignado, 120);
  const etapa = limStr(req.query?.etapa, 24);
  const soloSinLeer = String(req.query?.sin_leer || '') === '1';
  const soloSinResponder = String(req.query?.sin_responder || '') === '1';
  const cond = [];
  const args = [];
  if (q) {
    args.push(`%${q}%`);
    cond.push(`(c.telefono ILIKE $${args.length} OR c.nombre_perfil ILIKE $${args.length} OR c.ultimo_texto ILIKE $${args.length} OR cl.nombre ILIKE $${args.length})`);
  }
  if (etiqueta) {
    // Coincidencia exacta dentro de la lista separada por comas.
    args.push(etiqueta);
    const n = `$${args.length}`;
    cond.push(`(c.etiquetas = ${n} OR c.etiquetas LIKE ${n} || ', %' OR c.etiquetas LIKE '%, ' || ${n} OR c.etiquetas LIKE '%, ' || ${n} || ', %')`);
  }
  if (asignado) {
    args.push(asignado);
    cond.push(`c.asignado_a = $${args.length}`);
  }
  if (etapa) {
    args.push(normalizarEtapa(etapa));
    cond.push(`COALESCE(c.etapa, 'nuevo') = $${args.length}`);
  }
  if (soloSinLeer) cond.push('c.no_leidos > 0');
  if (soloSinResponder) cond.push("sla.ultima_entrada > COALESCE(sla.ultima_salida, 'epoch'::timestamptz)");
  const convs = await query(`SELECT c.*, cl.nombre AS cliente_nombre, cl.email AS cliente_email,
      o.estado AS orden_estado, o.bateria_serie AS orden_serie,
      sla.ultima_entrada, sla.ultima_salida
    FROM wa_conversaciones c
    LEFT JOIN clientes cl ON cl.id = c.cliente_id
    LEFT JOIN ordenes o ON o.id = c.orden_id
    LEFT JOIN LATERAL (
      SELECT max(m.fecha) FILTER (WHERE m.direccion = 'in') AS ultima_entrada,
             max(m.fecha) FILTER (WHERE m.direccion = 'out') AS ultima_salida
        FROM wa_mensajes m WHERE m.conversacion_id = c.id
    ) sla ON true
    ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
    ORDER BY c.ultima_fecha DESC NULLS LAST, c.id DESC LIMIT 100`, args);
  return res.json(convs);
});

// Responsables posibles de una conversacion (admins y tecnicos activos).
app.get('/api/whatsapp/agentes', authRequired, permisoRequerido('whatsapp'), async (req, res) => {
  const rows = await query("SELECT email, rol FROM usuarios WHERE activo = true AND rol IN ('admin','tecnico') ORDER BY rol, email");
  return res.json(rows);
});

// ---------- Consentimiento (opt-out) ----------
async function consentimientoDe(telefono) {
  const t = normalizarTelefono(telefono);
  if (!t) return { telefono: '', estado: 'alta' };
  const fila = await one('SELECT * FROM wa_consentimiento WHERE telefono = $1', [t]);
  return fila || { telefono: t, estado: 'alta' };
}

async function estaEnBaja(telefono) {
  return (await consentimientoDe(telefono)).estado === 'baja';
}

async function registrarConsentimientoWhatsApp({ telefono, estado, motivo = null, fuente = null, usuario = null }) {
  const t = normalizarTelefono(telefono);
  if (!t) return null;
  return one(`INSERT INTO wa_consentimiento (telefono, estado, motivo, fuente, usuario, actualizado)
    VALUES ($1,$2,$3,$4,$5, now())
    ON CONFLICT (telefono) DO UPDATE SET estado = EXCLUDED.estado, motivo = EXCLUDED.motivo,
      fuente = EXCLUDED.fuente, usuario = EXCLUDED.usuario, actualizado = now()
    RETURNING *`, [t, estado === 'baja' ? 'baja' : 'alta', limStr(motivo, 200) || null, limStr(fuente, 40) || null, limStr(usuario, 120) || null]);
}

// Etiquetas activas del catalogo (para validar lo que llega del panel).
async function catalogoEtiquetas() {
  const rows = await query('SELECT nombre FROM wa_etiquetas WHERE activo = true');
  return rows.map((r) => r.nombre);
}

// Renombra una etiqueta en todas las conversaciones que la tenian (si no, el
// renombre del catalogo dejaria conversaciones con la etiqueta vieja).
async function renombrarEtiquetaEnConversaciones(anterior, nuevo) {
  const pat = normalizarEtiquetas(anterior);
  if (!pat) return 0;
  const convs = await query(
    `SELECT id, etiquetas FROM wa_conversaciones
      WHERE etiquetas = $1 OR etiquetas LIKE $1 || ', %' OR etiquetas LIKE '%, ' || $1 OR etiquetas LIKE '%, ' || $1 || ', %'`,
    [pat]
  );
  for (const c of convs) {
    const lista = normalizarEtiquetas(c.etiquetas).split(', ').filter(Boolean)
      .map((t) => (t.toLowerCase() === pat.toLowerCase() ? nuevo : t));
    await query('UPDATE wa_conversaciones SET etiquetas = $2 WHERE id = $1', [c.id, normalizarEtiquetas(lista.join(', ')) || null]);
  }
  return convs.length;
}

// ---------- Catalogo de etiquetas (CRM) ----------
app.get('/api/whatsapp/etiquetas', authRequired, permisoRequerido('whatsapp'), async (req, res) => {
  const todas = String(req.query?.todas || '') === '1';
  const rows = await query(`SELECT * FROM wa_etiquetas ${todas ? '' : 'WHERE activo = true'} ORDER BY orden, nombre`);
  return res.json(rows);
});

app.post('/api/whatsapp/etiquetas', authRequired, permisoRequerido('crm_whatsapp'), async (req, res) => {
  const nombre = normalizarEtiquetas(String(req.body?.nombre || '').replace(/,/g, ' '));
  if (!nombre || nombre.includes(',')) return res.status(400).json({ error: 'La etiqueta necesita un nombre (sin comas)' });
  const color = /^#[0-9a-fA-F]{6}$/.test(String(req.body?.color || '')) ? req.body.color : '#d98e00';
  const orden = Number.isFinite(Number(req.body?.orden)) ? Math.max(0, Math.min(Number(req.body.orden), 9999)) : 100;
  const ya = await one('SELECT 1 AS x FROM wa_etiquetas WHERE lower(nombre) = lower($1)', [nombre]);
  if (ya) return res.status(409).json({ error: `Ya existe la etiqueta "${nombre}"` });
  const id = await nextId('wet');
  return res.json(await one('INSERT INTO wa_etiquetas (id, nombre, color, orden) VALUES ($1,$2,$3,$4) RETURNING *', [id, nombre, color, orden]));
});

app.patch('/api/whatsapp/etiquetas/:id', authRequired, permisoRequerido('crm_whatsapp'), async (req, res) => {
  const et = await one('SELECT * FROM wa_etiquetas WHERE id = $1', [req.params.id]);
  if (!et) return res.status(404).json({ error: 'Etiqueta no encontrada' });
  const campos = [];
  const args = [];
  let nuevoNombre = null;
  if (req.body?.nombre !== undefined) {
    nuevoNombre = normalizarEtiquetas(String(req.body.nombre || '').replace(/,/g, ' '));
    if (!nuevoNombre) return res.status(400).json({ error: 'La etiqueta necesita un nombre' });
    const repetida = await one('SELECT id FROM wa_etiquetas WHERE lower(nombre) = lower($1) AND id <> $2', [nuevoNombre, et.id]);
    if (repetida) return res.status(409).json({ error: `Ya existe la etiqueta "${nuevoNombre}"` });
    args.push(nuevoNombre);
    campos.push(`nombre = $${args.length}`);
  }
  if (req.body?.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(String(req.body.color))) {
    args.push(req.body.color);
    campos.push(`color = $${args.length}`);
  }
  if (req.body?.orden !== undefined && Number.isFinite(Number(req.body.orden))) {
    args.push(Math.max(0, Math.min(Number(req.body.orden), 9999)));
    campos.push(`orden = $${args.length}`);
  }
  if (req.body?.activo !== undefined) {
    const activo = normalizarBooleano(req.body.activo);
    if (activo === null) return res.status(400).json({ error: 'activo tiene que ser verdadero o falso' });
    args.push(activo);
    campos.push(`activo = $${args.length}`);
  }
  if (!campos.length) return res.status(400).json({ error: 'No hay nada para actualizar' });
  args.push(et.id);
  const actualizada = await one(`UPDATE wa_etiquetas SET ${campos.join(', ')} WHERE id = $${args.length} RETURNING *`, args);
  // Si la renombraron, se renombra tambien en las conversaciones que la usaban.
  let tocadas = 0;
  if (nuevoNombre && nuevoNombre !== et.nombre) tocadas = await renombrarEtiquetaEnConversaciones(et.nombre, nuevoNombre);
  return res.json({ ...actualizada, conversaciones_actualizadas: tocadas });
});

// Dar de baja una etiqueta: es una baja LOGICA (activo=false), nunca se borra la
// fila, asi el historial de las conversaciones que la usan sigue teniendo sentido
// y se puede volver a activar. Devuelve en cuantas conversaciones estaba.
app.delete('/api/whatsapp/etiquetas/:id', authRequired, permisoRequerido('crm_whatsapp'), async (req, res) => {
  const et = await one('SELECT * FROM wa_etiquetas WHERE id = $1', [req.params.id]);
  if (!et) return res.status(404).json({ error: 'Etiqueta no encontrada' });
  const enUso = await one(
    `SELECT count(*)::int AS n FROM wa_conversaciones
      WHERE etiquetas = $1 OR etiquetas LIKE $1 || ', %' OR etiquetas LIKE '%, ' || $1 OR etiquetas LIKE '%, ' || $1 || ', %'`,
    [et.nombre]
  );
  await query('UPDATE wa_etiquetas SET activo = false WHERE id = $1', [et.id]);
  return res.json({
    ok: true, desactivada: true, conversaciones: enUso?.n || 0,
    mensaje: (enUso?.n || 0) > 0
      ? `La etiqueta estaba en ${enUso.n} conversación(es): se dio de baja del catálogo pero se mantiene en ellas.`
      : 'Etiqueta dada de baja (se puede volver a activar).',
  });
});

// ---------- Respuestas rapidas del compositor ----------
app.get('/api/whatsapp/respuestas', authRequired, permisoRequerido('whatsapp'), async (req, res) => {
  const todas = String(req.query?.todas || '') === '1';
  const rows = await query(`SELECT * FROM wa_respuestas ${todas ? '' : 'WHERE activo = true'} ORDER BY orden, atajo`);
  return res.json(rows);
});

app.post('/api/whatsapp/respuestas', authRequired, permisoRequerido('responder_whatsapp'), async (req, res) => {
  const atajo = normalizarAtajo(req.body?.atajo);
  const texto = limStr(req.body?.texto, 2000);
  if (!atajo) return res.status(400).json({ error: 'El atajo necesita letras o números (sin espacios ni "/")' });
  if (!texto) return res.status(400).json({ error: 'La respuesta está vacía' });
  const ya = await one('SELECT 1 AS x FROM wa_respuestas WHERE lower(atajo) = lower($1)', [atajo]);
  if (ya) return res.status(409).json({ error: `Ya existe el atajo "/${atajo}"` });
  const id = await nextId('war');
  const orden = Number.isFinite(Number(req.body?.orden)) ? Math.max(0, Math.min(Number(req.body.orden), 9999)) : 100;
  return res.json(await one('INSERT INTO wa_respuestas (id, atajo, texto, orden) VALUES ($1,$2,$3,$4) RETURNING *', [id, atajo, texto, orden]));
});

app.patch('/api/whatsapp/respuestas/:id', authRequired, permisoRequerido('responder_whatsapp'), async (req, res) => {
  const r = await one('SELECT * FROM wa_respuestas WHERE id = $1', [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Respuesta no encontrada' });
  const campos = [];
  const args = [];
  if (req.body?.atajo !== undefined) {
    const atajo = normalizarAtajo(req.body.atajo);
    if (!atajo) return res.status(400).json({ error: 'El atajo necesita letras o números (sin espacios ni "/")' });
    const repetido = await one('SELECT id FROM wa_respuestas WHERE lower(atajo) = lower($1) AND id <> $2', [atajo, r.id]);
    if (repetido) return res.status(409).json({ error: `Ya existe el atajo "/${atajo}"` });
    args.push(atajo);
    campos.push(`atajo = $${args.length}`);
  }
  if (req.body?.texto !== undefined) {
    const texto = limStr(req.body.texto, 2000);
    if (!texto) return res.status(400).json({ error: 'La respuesta está vacía' });
    args.push(texto);
    campos.push(`texto = $${args.length}`);
  }
  if (req.body?.activo !== undefined) {
    const activo = normalizarBooleano(req.body.activo);
    if (activo === null) return res.status(400).json({ error: 'activo tiene que ser verdadero o falso' });
    args.push(activo);
    campos.push(`activo = $${args.length}`);
  }
  if (req.body?.orden !== undefined && Number.isFinite(Number(req.body.orden))) {
    args.push(Math.max(0, Math.min(Number(req.body.orden), 9999)));
    campos.push(`orden = $${args.length}`);
  }
  if (!campos.length) return res.status(400).json({ error: 'No hay nada para actualizar' });
  args.push(r.id);
  return res.json(await one(`UPDATE wa_respuestas SET ${campos.join(', ')} WHERE id = $${args.length} RETURNING *`, args));
});

// Borrar una respuesta rapida (si esta en uso no molesta a nadie: es una ayuda).
app.delete('/api/whatsapp/respuestas/:id', authRequired, permisoRequerido('responder_whatsapp'), async (req, res) => {
  const r = await one('SELECT id FROM wa_respuestas WHERE id = $1', [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Respuesta no encontrada' });
  await query('DELETE FROM wa_respuestas WHERE id = $1', [r.id]);
  return res.json({ ok: true });
});

// ---------- Buscar dentro de los mensajes ----------
// El buscador de la bandeja solo miraba telefono/nombre/ultimo texto. Esto busca
// en el cuerpo de los mensajes (lo que el cliente dijo hace tres semanas).
app.get('/api/whatsapp/buscar', authRequired, permisoRequerido('whatsapp'), async (req, res) => {
  const bruto = String(req.query?.q || '').trim().slice(0, 60);
  if (bruto.length < 2) return res.json([]);
  // Se escapan los comodines de LIKE: si no, buscar "%" devolvia todo.
  const patron = `%${bruto.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const filas = await query(
    `SELECT m.id, m.conversacion_id, m.direccion, m.tipo, m.fecha, m.estado,
            COALESCE(m.texto, '') AS texto_completo,
            c.telefono, c.nombre_perfil, cl.nombre AS cliente_nombre
       FROM wa_mensajes m
       JOIN wa_conversaciones c ON c.id = m.conversacion_id
       LEFT JOIN clientes cl ON cl.id = c.cliente_id
      WHERE m.texto ILIKE $1
      ORDER BY m.fecha DESC
      LIMIT 50`,
    [patron]
  );
  // El fragmento se recorta alrededor de lo buscado (y el panel lo resalta).
  return res.json(filas.map((f) => {
    const { texto_completo: completo, ...resto } = f;
    return { ...resto, texto: fragmentoConTexto(completo, bruto) };
  }));
});

// Asignar responsable y/o etiquetas (CRM).
app.patch('/api/whatsapp/conversaciones/:id', authRequired, permisoRequerido('crm_whatsapp'), async (req, res) => {
  const conv = await one('SELECT * FROM wa_conversaciones WHERE id = $1', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  const campos = [];
  const args = [];
  if (req.body?.asignado_a !== undefined) {
    args.push(limStr(req.body.asignado_a, 120) || null);
    campos.push(`asignado_a = $${args.length}`);
  }
  if (req.body?.etiquetas !== undefined) {
    // Ahora las etiquetas salen del catalogo: si mandan una que no existe, se
    // avisa en vez de inventarla (asi no se llena de variantes parecidas).
    const lista = normalizarEtiquetas(req.body.etiquetas);
    const conocidas = await catalogoEtiquetas();
    const desconocidas = lista.split(', ').filter(Boolean)
      .filter((t) => !conocidas.some((c) => c.toLowerCase() === t.toLowerCase()));
    if (desconocidas.length) {
      return res.status(400).json({ error: `Estas etiquetas no están en el catálogo: ${desconocidas.join(', ')}. Creálas en Etiquetas y volvé a intentar.` });
    }
    args.push(lista || null);
    campos.push(`etiquetas = $${args.length}`);
  }
  // Vincular la conversacion con una ficha: los mensajes que entran solo se
  // vinculan solos cuando el telefono coincide con una ficha cargada.
  if (req.body?.cliente_id !== undefined) {
    const clienteId = limStr(req.body.cliente_id, 40);
    if (clienteId) {
      const cli = await one('SELECT id, nombre, deleted_at FROM clientes WHERE id = $1', [clienteId]);
      if (!cli) return res.status(404).json({ error: 'Ese cliente no existe' });
      if (cli.deleted_at) return res.status(400).json({ error: 'Ese cliente está en la papelera: restauralo primero' });
    }
    args.push(clienteId || null);
    campos.push(`cliente_id = $${args.length}`);
  }
  // Vincular una orden concreta a la oportunidad (la que se cotiza y sigue).
  if (req.body?.orden_id !== undefined) {
    const ordenId = limStr(req.body.orden_id, 40);
    if (ordenId) {
      const o = await one('SELECT id, cliente_id, estado FROM ordenes WHERE id = $1', [ordenId]);
      if (!o) return res.status(404).json({ error: 'Esa orden no existe' });
      if (conv.cliente_id && o.cliente_id !== conv.cliente_id) {
        return res.status(400).json({ error: 'Esa orden pertenece a otro cliente: no se puede vincular a esta conversación.' });
      }
    }
    args.push(ordenId || null);
    campos.push(`orden_id = $${args.length}`);
  }
  // Embudo comercial: mover la oportunidad de etapa (queda el historial, que es
  // lo que permite medir conversion y tiempo por etapa) y guardar el monto.
  let cambioEtapa = null;
  if (req.body?.etapa !== undefined) {
    const nueva = normalizarEtapa(req.body.etapa);
    const anterior = normalizarEtapa(conv.etapa);
    const motivo = limStr(req.body?.motivo, 300);
    if (faltaMotivoPerdida(nueva, motivo)) {
      return res.status(400).json({ error: 'Para dar por perdida una oportunidad hay que indicar el motivo.' });
    }
    if (nueva !== anterior) cambioEtapa = { anterior, nueva, motivo: motivo || null };
    args.push(nueva);
    campos.push(`etapa = $${args.length}`);
  }
  // El monto del historial es el que queda guardado (el nuevo, si vino).
  const montoFinal = req.body?.monto_estimado !== undefined
    ? normalizarMonto(req.body.monto_estimado)
    : normalizarMonto(conv.monto_estimado);
  if (req.body?.monto_estimado !== undefined) {
    args.push(montoFinal);
    campos.push(`monto_estimado = $${args.length}`);
  }
  if (!campos.length) return res.status(400).json({ error: 'No hay nada para actualizar' });
  args.push(conv.id);
  const upd = await one(`UPDATE wa_conversaciones SET ${campos.join(', ')} WHERE id = $${args.length} RETURNING *`, args);
  if (cambioEtapa) {
    const histId = await nextId('weh');
    await query(
      `INSERT INTO wa_etapa_historial (id, conversacion_id, anterior, nueva, monto, motivo, usuario)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [histId, conv.id, cambioEtapa.anterior, cambioEtapa.nueva, montoFinal, cambioEtapa.motivo, actorDe(req)?.email || 'panel']
    );
  }
  await auditar({
    req, tabla: 'wa_conversaciones', registroId: conv.id,
    accion: cambioEtapa ? 'mover_etapa' : 'editar',
    antes: conv, despues: upd,
    detalle: cambioEtapa ? `${cambioEtapa.anterior} → ${cambioEtapa.nueva}${cambioEtapa.motivo ? ` (${cambioEtapa.motivo})` : ''}` : null,
  });
  return res.json(upd);
});

// Cotizar desde la bandeja: vincula la conversacion con la orden (existente o
// nueva), genera la cotizacion y, si se pide, manda el link firmado por WhatsApp.
// Es el puente que faltaba entre "me dijo que si" y la orden del taller.
app.post('/api/whatsapp/conversaciones/:id/cotizacion', authRequired, permisoRequerido('cotizar'), async (req, res) => {
  const conv = await one('SELECT * FROM wa_conversaciones WHERE id = $1', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  if (!conv.cliente_id) {
    return res.status(400).json({ error: 'Primero vinculá la conversación con un cliente (o creá la ficha) para poder cotizar.' });
  }
  const cliente = await one('SELECT id, nombre, telefono, deleted_at FROM clientes WHERE id = $1', [conv.cliente_id]);
  if (!cliente || cliente.deleted_at) return res.status(400).json({ error: 'El cliente de esta conversación no está disponible.' });
  const montoN = normalizarMonto(req.body?.monto);
  if (montoN === null) return res.status(400).json({ error: 'Falta un monto válido para la cotización.' });
  if (!arrBounded(req.body?.servicios || []) || !arrBounded(req.body?.insumos || [])) {
    return res.status(400).json({ error: 'Demasiados renglones en la cotización' });
  }
  const detalleCot = armarDetalleCotizacion(montoN, req.body?.servicios, req.body?.insumos);
  const ordenIdPedida = limStr(req.body?.orden_id, 40);
  const enviar = req.body?.enviar !== false && String(req.body?.enviar) !== 'false';
  if (!ordenIdPedida && !tienePermiso(req.user.permisos, 'crear_orden')) {
    return res.status(403).json({ error: 'Para crear una orden nueva desde el chat hace falta el permiso «Crear órdenes» (admin). Podés vincular una orden existente.' });
  }

  let ordenFinal = null;
  let cambioEtapa = null;
  await tx(async (client) => {
    const convTx = (await client.query('SELECT * FROM wa_conversaciones WHERE id = $1 FOR UPDATE', [conv.id])).rows[0];
    const etapaActual = normalizarEtapa(convTx.etapa);
    if (['ganado', 'perdido'].includes(etapaActual)) {
      throw { status: 400, message: `La oportunidad ya está ${etapaActual === 'ganado' ? 'ganada' : 'perdida'}: movela de etapa antes de cotizar de nuevo.` };
    }

    let orden;
    if (ordenIdPedida) {
      orden = (await client.query('SELECT * FROM ordenes WHERE id = $1 FOR UPDATE', [ordenIdPedida])).rows[0];
      if (!orden) throw { status: 404, message: 'La orden indicada no existe' };
      if (orden.cliente_id !== conv.cliente_id) throw { status: 400, message: 'Esa orden es de otro cliente: elegí una de la misma ficha o creá una nueva.' };
      if (esEstadoCerrado(orden.estado)) throw { status: 400, message: 'Esa orden ya está cerrada: no se puede cotizar.' };
      if (!puedeEscribirOrden(req, orden)) throw { status: 403, message: 'Sin permisos para esa orden' };
      await client.query('UPDATE wa_conversaciones SET orden_id = $2 WHERE id = $1', [convTx.id, orden.id]);
    } else {
      const serieT = limStr(req.body?.serie, 64);
      if (!serieT) throw { status: 400, message: 'Falta el número de serie de la batería para crear la orden.' };
      const fallaT = limStr(req.body?.falla, 500) || 'Consulta por WhatsApp';
      const nuevaId = await crearOrdenTx(client, {
        serieT,
        tipo: req.body?.tipo,
        voltaje: req.body?.voltaje,
        capacidad: req.body?.capacidad,
        aplicacion: req.body?.aplicacion,
        marca: req.body?.marca,
        modelo: req.body?.modelo,
        equipo: req.body?.equipo,
        clienteT: conv.cliente_id,
        fallaT,
        tecnico_id: req.body?.tecnico_id,
      }, actorDe(req));
      orden = (await client.query('SELECT * FROM ordenes WHERE id = $1', [nuevaId])).rows[0];
      await client.query('UPDATE wa_conversaciones SET orden_id = $2 WHERE id = $1', [convTx.id, nuevaId]);
    }

    await cotizarOrdenTx(client, orden.id, { montoN, detalleCot }, actorDe(req));
    await client.query('UPDATE wa_conversaciones SET monto_estimado = $2 WHERE id = $1', [convTx.id, montoN]);
    if (etapaActual === 'nuevo') {
      await client.query("UPDATE wa_conversaciones SET etapa = 'presupuestado' WHERE id = $1", [convTx.id]);
      const histId = await nextId('weh', client);
      await client.query(
        `INSERT INTO wa_etapa_historial (id, conversacion_id, anterior, nueva, monto, motivo, usuario)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [histId, convTx.id, 'nuevo', 'presupuestado', montoN, 'Cotización enviada desde la bandeja', actorDe(req)?.email || 'panel']
      );
      cambioEtapa = { anterior: 'nuevo', nueva: 'presupuestado' };
    }
    ordenFinal = orden;
  });

  const cotizacionUrl = `${PUBLIC_URL}/cotizacion/${ordenFinal.id}?t=${hornoSigCot(ordenFinal.id)}`;
  let envio = null;
  if (enviar) {
    if (await estaEnBaja(conv.telefono)) {
      envio = { estado: 'omitido', error: 'El cliente pidió no recibir mensajes: la cotización quedó creada pero no se envió.' };
    } else {
      const nombre = String(cliente.nombre || '').trim().split(/\s+/)[0] || 'cliente';
      const mensaje = limStr(req.body?.mensaje, 1000)
        || `Hola ${nombre}, te paso el presupuesto de ${ordenFinal.bateria_serie} por ${fmtARS.format(montoN)}. Podés verlo y aprobarlo acá: ${cotizacionUrl}`;
      const r = await guardarYEnviar({ conv, tipo: 'texto', texto: mensaje });
      envio = { estado: r.body.estado || null, enCola: Boolean(r.body.enCola), incierto: Boolean(r.body.incierto), error: r.body.error || null, aviso: r.body.aviso || null };
    }
  } else {
    // Sin envío inmediato: si el aviso de "presupuesto listo" está prendido, el
    // cliente recibe la plantilla con el link firmado.
    avisarOrden(ordenFinal.id);
  }

  await auditar({
    req, tabla: 'wa_conversaciones', registroId: conv.id, accion: 'cotizar_desde_bandeja',
    antes: { etapa: conv.etapa, monto_estimado: conv.monto_estimado },
    despues: { etapa: cambioEtapa?.nueva || normalizarEtapa(conv.etapa), monto_estimado: montoN, orden_id: ordenFinal.id },
    detalle: `Orden ${ordenFinal.id} · ${enviar ? 'link enviado' : 'link no enviado'}`,
  });
  return res.status(201).json({
    ok: true,
    orden_id: ordenFinal.id,
    cotizacion_url: cotizacionUrl,
    monto: montoN,
    envio,
    etapa: cambioEtapa?.nueva || normalizarEtapa(conv.etapa),
  });
});

// Metricas del embudo comercial: conversion, tasa de cierre, tiempo medio en cada
// etapa y motivos de perdida. El calculo vive en src/data/crm.js (probado aparte).
app.get('/api/whatsapp/metricas', authRequired, permisoRequerido('metricas_whatsapp'), async (req, res) => {
  const conversaciones = await query('SELECT id, etapa, monto_estimado, ultima_fecha, orden_id FROM wa_conversaciones');
  const historial = await query(
    'SELECT conversacion_id, anterior, nueva, monto, motivo, fecha FROM wa_etapa_historial ORDER BY fecha ASC LIMIT 5000'
  );
  // La entrada a la primera etapa se aproxima con el primer mensaje del cliente.
  const primeras = await query(
    "SELECT conversacion_id, min(fecha) AS primera FROM wa_mensajes WHERE direccion = 'in' GROUP BY conversacion_id"
  );
  // Cierre real: ordenes vinculadas a una oportunidad (monto cotizado y cobrado).
  const ordenes = await query(`
    SELECT o.id, o.estado, o.cotizacion, o.monto_cobrado
      FROM ordenes o
     WHERE o.id IN (SELECT orden_id FROM wa_conversaciones WHERE orden_id IS NOT NULL)`);
  const porPrimera = {};
  for (const p of primeras) porPrimera[p.conversacion_id] = p.primera;
  return res.json(calcularMetricas({ conversaciones, historial, primeras: porPrimera, ordenes }));
});

// SLA de atencion: primera respuesta, conversaciones sin responder y carga por
// responsable. El calculo vive en src/data/sla.js (probado aparte).
app.get('/api/whatsapp/sla', authRequired, permisoRequerido('metricas_whatsapp'), async (req, res) => {
  const filas = await query(`
    SELECT c.id, c.telefono, c.nombre_perfil, c.asignado_a, c.etapa,
           cl.nombre AS cliente_nombre,
           sla.primera_entrada, sla.primera_salida, sla.ultima_entrada, sla.ultima_salida
      FROM wa_conversaciones c
      LEFT JOIN clientes cl ON cl.id = c.cliente_id
      LEFT JOIN LATERAL (
        SELECT min(m.fecha) FILTER (WHERE m.direccion = 'in')  AS primera_entrada,
               min(m.fecha) FILTER (WHERE m.direccion = 'out') AS primera_salida,
               max(m.fecha) FILTER (WHERE m.direccion = 'in')  AS ultima_entrada,
               max(m.fecha) FILTER (WHERE m.direccion = 'out') AS ultima_salida
          FROM wa_mensajes m WHERE m.conversacion_id = c.id
      ) sla ON true
     ORDER BY c.ultima_fecha DESC NULLS LAST`);
  const normalizadas = filas.map((f) => ({
    id: f.id,
    telefono: f.telefono,
    nombre: f.cliente_nombre || f.nombre_perfil || f.telefono,
    asignado_a: f.asignado_a,
    etapa: normalizarEtapa(f.etapa),
    primeraEntrada: f.primera_entrada,
    primeraSalida: f.primera_salida,
    ultimaEntrada: f.ultima_entrada,
    ultimaSalida: f.ultima_salida,
  }));
  return res.json(resumenSla(normalizadas));
});

// Reparto por carga: toma las conversaciones sin responsable y las distribuye
// entre quien puede responder, empezando por el que tiene menos abiertas.
app.post('/api/whatsapp/repartir', authRequired, requireRol('admin'), async (req, res) => {
  const usuarios = await query("SELECT email, rol, permisos FROM usuarios WHERE activo = true AND rol IN ('admin','tecnico') ORDER BY email");
  const agentes = usuarios
    .filter((u) => {
      const efectivos = permisosEfectivos({ rol: u.rol, permisos: u.permisos });
      return tienePermiso(efectivos, 'whatsapp') && tienePermiso(efectivos, 'responder_whatsapp');
    })
    .map((u) => u.email);
  if (!agentes.length) {
    return res.status(400).json({ error: 'No hay usuarios activos con permiso para ver y responder WhatsApp.' });
  }
  const pendientes = await query(
    `SELECT id FROM wa_conversaciones
      WHERE (asignado_a IS NULL OR asignado_a = '') AND COALESCE(estado, 'abierta') <> 'cerrada'
      ORDER BY ultima_fecha ASC NULLS FIRST, id ASC LIMIT 500`
  );
  if (!pendientes.length) {
    return res.json({ ok: true, asignadas: 0, porAgente: Object.fromEntries(agentes.map((a) => [a, 0])) });
  }
  const cargas = await query(
    `SELECT asignado_a, count(*)::int AS n FROM wa_conversaciones
      WHERE asignado_a = ANY($1) AND COALESCE(estado, 'abierta') <> 'cerrada'
      GROUP BY asignado_a`,
    [agentes]
  );
  const porAgente = Object.fromEntries(agentes.map((a) => [a, 0]));
  for (const c of cargas) if (porAgente[c.asignado_a] !== undefined) porAgente[c.asignado_a] = Number(c.n) || 0;
  for (const conv of pendientes) {
    const agente = agentes.reduce((mejor, actual) => (porAgente[actual] < porAgente[mejor] ? actual : mejor), agentes[0]);
    await query('UPDATE wa_conversaciones SET asignado_a = $2 WHERE id = $1', [conv.id, agente]);
    porAgente[agente] += 1;
  }
  await auditar({
    req, tabla: 'wa_conversaciones', accion: 'repartir',
    detalle: `${pendientes.length} conversación(es) repartidas por carga`,
    despues: { porAgente },
  });
  return res.json({ ok: true, asignadas: pendientes.length, porAgente });
});

// Historial de etapas de una conversacion (para ver como se movio la oportunidad).
app.get('/api/whatsapp/conversaciones/:id/etapas', authRequired, permisoRequerido('whatsapp'), async (req, res) => {
  const filas = await query(
    'SELECT * FROM wa_etapa_historial WHERE conversacion_id = $1 ORDER BY fecha DESC LIMIT 100',
    [req.params.id]
  );
  return res.json(filas);
});

// ---------- Tareas / recordatorios del CRM ----------

// Un tecnico solo ve y toca sus tareas (o las que no tienen responsable).
function tareaVisible(req, t) {
  if (esAdmin(req)) return true;
  return !t.asignado_a || t.asignado_a === req.user.email;
}

app.get('/api/whatsapp/tareas', authRequired, permisoRequerido('tareas', 'whatsapp'), async (req, res) => {
  const estado = limStr(req.query?.estado, 20);
  const mias = String(req.query?.mias || '') === '1';
  const cond = [];
  const args = [];
  if (estado === 'pendiente' || estado === 'cerrada') {
    args.push(estado);
    cond.push(`t.estado = $${args.length}`);
  }
  if (mias || !esAdmin(req)) {
    args.push(req.user.email);
    cond.push(`(t.asignado_a = $${args.length}${mias ? '' : ' OR t.asignado_a IS NULL'})`);
  }
  const filas = await query(
    `SELECT t.*, cl.nombre AS cliente_nombre, cl.telefono AS cliente_telefono,
            conv.nombre_perfil AS conversacion_perfil, conv.telefono AS conversacion_telefono
       FROM wa_tareas t
       LEFT JOIN clientes cl ON cl.id = t.cliente_id
       LEFT JOIN wa_conversaciones conv ON conv.id = t.conversacion_id
       ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
      ORDER BY t.estado ASC, t.vence ASC NULLS LAST, t.creada_en DESC LIMIT 200`,
    args
  );
  return res.json(filas);
});

app.post('/api/whatsapp/tareas', authRequired, permisoRequerido('crear_tareas'), async (req, res) => {
  const titulo = limStr(req.body?.titulo, 160);
  if (!titulo) return res.status(400).json({ error: 'La tarea necesita un título' });
  const vence = limStr(req.body?.vence, 40);
  if (vence && Number.isNaN(new Date(vence).getTime())) {
    return res.status(400).json({ error: 'La fecha de vencimiento no es válida' });
  }
  const id = await nextId('wat');
  const tarea = await one(
    `INSERT INTO wa_tareas (id, conversacion_id, orden_id, cliente_id, titulo, vence, asignado_a, creada_por)
     VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7,$8) RETURNING *`,
    [
      id,
      limStr(req.body?.conversacion_id, 40) || null,
      limStr(req.body?.orden_id, 40) || null,
      limStr(req.body?.cliente_id, 40) || null,
      titulo,
      vence || null,
      limStr(req.body?.asignado_a, 120) || req.user.email,
      req.user.email,
    ]
  );
  return res.status(201).json(tarea);
});

app.patch('/api/whatsapp/tareas/:id', authRequired, permisoRequerido('cerrar_tareas', 'crear_tareas'), async (req, res) => {
  const tarea = await one('SELECT * FROM wa_tareas WHERE id = $1', [req.params.id]);
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
  if (!tareaVisible(req, tarea)) return res.status(403).json({ error: 'Esa tarea es de otra persona' });
  const campos = [];
  const args = [];
  const set = (col, valor) => { args.push(valor); campos.push(`${col} = $${args.length}`); };
  if (req.body?.titulo !== undefined) {
    const titulo = limStr(req.body.titulo, 160);
    if (!titulo) return res.status(400).json({ error: 'El título no puede quedar vacío' });
    set('titulo', titulo);
  }
  if (req.body?.vence !== undefined) {
    const vence = limStr(req.body.vence, 40);
    if (vence && Number.isNaN(new Date(vence).getTime())) {
      return res.status(400).json({ error: 'La fecha de vencimiento no es válida' });
    }
    args.push(vence || null);
    campos.push(`vence = $${args.length}::timestamptz`);
  }
  if (req.body?.asignado_a !== undefined) set('asignado_a', limStr(req.body.asignado_a, 120) || null);
  if (req.body?.estado !== undefined) {
    const estado = normalizarEstadoTarea(req.body.estado);
    set('estado', estado);
    campos.push(estado === 'cerrada' ? 'cerrada_en = now()' : 'cerrada_en = NULL');
  }
  if (!campos.length) return res.status(400).json({ error: 'No hay nada para actualizar' });
  args.push(tarea.id);
  const upd = await one(`UPDATE wa_tareas SET ${campos.join(', ')} WHERE id = $${args.length} RETURNING *`, args);
  return res.json(upd);
});

app.delete('/api/whatsapp/tareas/:id', authRequired, permisoRequerido('borrar_tareas'), async (req, res) => {
  const tarea = await one('SELECT * FROM wa_tareas WHERE id = $1', [req.params.id]);
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
  if (!esAdmin(req) && tarea.creada_por !== req.user.email) {
    return res.status(403).json({ error: 'Solo quien la creó o un administrador pueden borrarla' });
  }
  await query('DELETE FROM wa_tareas WHERE id = $1', [tarea.id]);
  return res.json({ ok: true, id: tarea.id });
});

// Notas internas del taller: no se le mandan al cliente.
app.get('/api/whatsapp/conversaciones/:id/notas', authRequired, permisoRequerido('whatsapp'), async (req, res) => {
  const notas = await query('SELECT * FROM wa_notas WHERE conversacion_id = $1 ORDER BY fecha DESC LIMIT 100', [req.params.id]);
  return res.json(notas);
});

app.post('/api/whatsapp/conversaciones/:id/notas', authRequired, permisoRequerido('crm_whatsapp'), async (req, res) => {
  const conv = await one('SELECT id FROM wa_conversaciones WHERE id = $1', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  const texto = limStr(req.body?.texto, 1000);
  if (!texto) return res.status(400).json({ error: 'La nota está vacía' });
  const id = await nextId('wan');
  const autor = actorDe(req)?.email || 'panel';
  const nota = await one('INSERT INTO wa_notas (id, conversacion_id, autor, texto) VALUES ($1,$2,$3,$4) RETURNING *', [id, conv.id, autor, texto]);
  return res.json(nota);
});

// Borrar una nota interna: solo el autor o un administrador.
app.delete('/api/whatsapp/conversaciones/:id/notas/:notaId', authRequired, permisoRequerido('crm_whatsapp'), async (req, res) => {
  const nota = await one('SELECT * FROM wa_notas WHERE id = $1 AND conversacion_id = $2', [req.params.notaId, req.params.id]);
  if (!nota) return res.status(404).json({ error: 'Nota no encontrada' });
  const quien = actorDe(req)?.email || 'panel';
  if (!esAdmin(req) && nota.autor !== quien) {
    return res.status(403).json({ error: 'Solo el autor de la nota o un administrador pueden borrarla' });
  }
  await query('DELETE FROM wa_notas WHERE id = $1', [nota.id]);
  return res.json({ ok: true, id: nota.id });
});

app.get('/api/whatsapp/conversaciones/:id', authRequired, permisoRequerido('whatsapp'), async (req, res) => {
  const conv = await one('SELECT * FROM wa_conversaciones WHERE id = $1', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  const mensajes = await query('SELECT * FROM wa_mensajes WHERE conversacion_id = $1 ORDER BY fecha ASC LIMIT 300', [conv.id]);
  await query('UPDATE wa_conversaciones SET no_leidos = 0 WHERE id = $1', [conv.id]);
  const cliente = conv.cliente_id ? await one('SELECT * FROM clientes WHERE id = $1', [conv.cliente_id]) : null;
  const ordenes = conv.cliente_id
    ? await query('SELECT id, bateria_serie, codigo_seguimiento, estado, fecha_ingreso FROM ordenes WHERE cliente_id = $1 ORDER BY fecha_ingreso DESC LIMIT 5', [conv.cliente_id])
    : [];
  const notas = await query('SELECT * FROM wa_notas WHERE conversacion_id = $1 ORDER BY fecha DESC LIMIT 50', [conv.id]);
  // Ficha 360: numeros del cliente para no tener que salir de la bandeja.
  const ficha = conv.cliente_id
    ? await one(`SELECT
        count(*)::int AS ordenes,
        count(*) FILTER (WHERE estado = 'delivered')::int AS entregadas,
        count(*) FILTER (WHERE cotizacion IS NOT NULL)::int AS cotizadas,
        count(*) FILTER (WHERE garantia IS NOT NULL)::int AS con_garantia
      FROM ordenes WHERE cliente_id = $1`, [conv.cliente_id])
    : null;
  const garantias = conv.cliente_id
    ? await query("SELECT id, bateria_serie, garantia FROM ordenes WHERE cliente_id = $1 AND garantia IS NOT NULL ORDER BY garantia->>'vence' DESC NULLS LAST LIMIT 10", [conv.cliente_id])
    : [];
  const consentimiento = await consentimientoDe(conv.telefono);
  // Orden vinculada a la oportunidad (la que se cotiza y se sigue desde aca).
  const orden = conv.orden_id
    ? await one(`SELECT id, bateria_serie, codigo_seguimiento, estado, estado_cotizacion, cotizacion,
                        monto_cobrado, garantia, medio_pago, fecha_ingreso, fecha_entrega
                   FROM ordenes WHERE id = $1`, [conv.orden_id])
    : null;
  const cotizacionUrl = orden ? `${PUBLIC_URL}/cotizacion/${orden.id}?t=${hornoSigCot(orden.id)}` : null;
  // SLA del hilo: ultima entrada vs ultima salida (para el cartel "sin responder").
  const entradas = mensajes.filter((m) => m.direccion === 'in').map((m) => new Date(m.fecha).getTime());
  const salidas = mensajes.filter((m) => m.direccion === 'out').map((m) => new Date(m.fecha).getTime());
  const ultimaEntrada = entradas.length ? Math.max(...entradas) : null;
  const ultimaSalida = salidas.length ? Math.max(...salidas) : null;
  const sinResponder = ultimaEntrada !== null && (ultimaSalida === null || ultimaEntrada > ultimaSalida);
  const sla = {
    sinResponder,
    minutosSinResponder: sinResponder ? Math.max(0, Math.round((Date.now() - ultimaEntrada) / 60000)) : null,
  };
  return res.json({ conversacion: { ...conv, no_leidos: 0 }, mensajes, cliente, ordenes, orden, cotizacion_url: cotizacionUrl, sla, notas, consentimiento, ficha: ficha ? { ...ficha, garantias } : null });
});

// Mensaje libre: vale dentro de las 24 h desde el ultimo mensaje del cliente.
app.post('/api/whatsapp/conversaciones/:id/responder', authRequired, permisoRequerido('responder_whatsapp'), async (req, res) => {
  const conv = await one('SELECT * FROM wa_conversaciones WHERE id = $1', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  const texto = limStr(req.body?.texto, 4000);
  if (!texto) return res.status(400).json({ error: 'El mensaje está vacío' });
  if (await estaEnBaja(conv.telefono)) {
    return res.status(400).json({ error: 'Este cliente pidió no recibir más mensajes (baja de WhatsApp). Si querés volver a escribirle, habilitá el envío desde el hilo.' });
  }
  // Sale por la cola: si Meta falla por red, no se pierde la respuesta.
  return enviarPorOutbox(res, { conv, tipo: 'texto', texto });
});

// Habilitar o dar de baja el envío de mensajes para un cliente.
app.post('/api/whatsapp/conversaciones/:id/optin', authRequired, permisoRequerido('crm_whatsapp'), async (req, res) => {
  const conv = await one('SELECT * FROM wa_conversaciones WHERE id = $1', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  const estado = String(req.body?.estado || '').toLowerCase() === 'baja' ? 'baja' : 'alta';
  const fila = await registrarConsentimientoWhatsApp({
    telefono: conv.telefono, estado, motivo: req.body?.motivo || (estado === 'baja' ? 'Dado de baja desde el panel' : 'Habilitado desde el panel'),
    fuente: 'panel', usuario: actorDe(req)?.email,
  });
  await auditar({
    req, tabla: 'wa_conversaciones', registroId: conv.id,
    accion: estado === 'baja' ? 'opt_out' : 'opt_in',
    antes: { estado: conv.estado }, despues: { consentimiento: estado },
    detalle: req.body?.motivo || null,
  });
  return res.json(fila);
});

// Estado del consentimiento de un teléfono.
app.get('/api/whatsapp/consentimiento', authRequired, permisoRequerido('whatsapp'), async (req, res) => {
  return res.json(await consentimientoDe(req.query?.telefono));
});

// Exportar las conversaciones (admin). Queda registrado quién se lo llevó.
app.get('/api/whatsapp/export', authRequired, requireRol('admin'), async (req, res) => {
  const desde = req.query?.desde ? new Date(String(req.query.desde)) : null;
  const hasta = req.query?.hasta ? new Date(String(req.query.hasta)) : null;
  const conversacion = limStr(req.query?.conversacion, 32);
  const cond = [];
  const args = [];
  if (desde && !Number.isNaN(desde.getTime())) { args.push(desde.toISOString()); cond.push(`m.fecha >= $${args.length}`); }
  if (hasta && !Number.isNaN(hasta.getTime())) { args.push(hasta.toISOString()); cond.push(`m.fecha <= $${args.length}`); }
  if (conversacion) { args.push(conversacion); cond.push(`m.conversacion_id = $${args.length}`); }
  const filas = await query(
    `SELECT m.fecha, m.conversacion_id, m.direccion, c.telefono, COALESCE(cl.nombre, c.nombre_perfil, '') AS cliente,
            m.tipo, m.texto, m.estado, m.plantilla, m.media_url
       FROM wa_mensajes m
       JOIN wa_conversaciones c ON c.id = m.conversacion_id
       LEFT JOIN clientes cl ON cl.id = c.cliente_id
       ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
      ORDER BY m.fecha ASC
      LIMIT 20000`,
    args
  );
  const encabezado = ['conversacion', 'fecha', 'direccion', 'telefono', 'cliente', 'tipo', 'texto', 'estado', 'plantilla', 'archivo'];
  const csv = filasCsv([
    encabezado,
    ...filas.map((f) => [
      f.conversacion_id,
      f.fecha instanceof Date ? f.fecha.toISOString() : f.fecha,
      f.direccion === 'in' ? 'recibido' : 'enviado',
      f.telefono, f.cliente, f.tipo, f.texto, f.estado, f.plantilla, f.media_url,
    ]),
  ], { separador: ';' });
  await query(
    'INSERT INTO wa_export_log (id, usuario, desde, hasta, filas) VALUES ($1,$2,$3,$4,$5)',
    [await nextId('wex'), actorDe(req)?.email || 'panel', desde, hasta, filas.length]
  );
  // Auditoria minima en el log del servidor: quien exporto y con que filtros.
  console.log(`[whatsapp] export CSV por ${actorDe(req)?.email || 'panel'}: desde=${desde ? desde.toISOString() : '-'} hasta=${hasta ? hasta.toISOString() : '-'} conversacion=${conversacion || '-'} filas=${filas.length}`);
  await auditar({
    req, tabla: 'wa_mensajes', accion: 'exportar',
    detalle: `${filas.length} mensaje(s) · desde ${desde ? desde.toISOString() : '-'} hasta ${hasta ? hasta.toISOString() : '-'} · conversación ${conversacion || 'todas'}`,
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bertika-whatsapp-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
});

// Mandar una foto o un PDF dentro de la conversacion.
app.post('/api/whatsapp/conversaciones/:id/adjunto', authRequired, permisoRequerido('responder_whatsapp'), uploadChat.single('archivo'), async (req, res) => {
  const conv = await one('SELECT * FROM wa_conversaciones WHERE id = $1', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  if (!req.file?.buffer?.length) return res.status(400).json({ error: 'No se recibió el archivo' });
  if (await estaEnBaja(conv.telefono)) {
    return res.status(400).json({ error: 'Este cliente pidió no recibir más mensajes (baja de WhatsApp).' });
  }
  const texto = limStr(req.body?.texto, 1000);
  const esPdf = req.file.buffer.subarray(0, 4).toString('latin1') === '%PDF';
  const nombre = limStr(req.file.originalname, 120) || (esPdf ? 'documento.pdf' : 'foto.jpg');
  // Se guarda la copia local para mostrarla en la bandeja y para poder
  // reintentar: el worker vuelve a subirla a Meta si el primer intento falla.
  const local = guardarArchivoChat({ buffer: req.file.buffer, mime: req.file.mimetype, nombre });
  if (!local) return res.status(400).json({ error: 'Archivo inválido: solo se permiten fotos (jpg, png, webp, gif) o PDF.' });
  return enviarPorOutbox(res, {
    conv,
    tipo: esPdf ? 'documento' : 'imagen',
    texto: texto || (esPdf ? `[documento: ${nombre}]` : '[foto]'),
    media: {
      url: local.url,
      tipo: local.tipo,
      nombre: local.nombre,
      mime: esPdf ? 'application/pdf' : req.file.mimetype,
      path: path.join(UPLOAD_DIR, local.archivo),
    },
  });
});

// Enviar a un numero suelto (prueba del canal o aviso puntual).
app.post('/api/whatsapp/enviar', authRequired, permisoRequerido('enviar_whatsapp'), async (req, res) => {
  const telefono = limStr(req.body?.telefono, 30);
  const texto = limStr(req.body?.texto, 4000);
  if (!telefono || !texto) return res.status(400).json({ error: 'Faltan el teléfono y el mensaje' });
  const conv = await conversacionDe(telefono);
  if (!conv) return res.status(400).json({ error: 'Teléfono inválido' });
  if (await estaEnBaja(conv.telefono)) {
    return res.status(400).json({ error: 'Este cliente pidió no recibir más mensajes (baja de WhatsApp).' });
  }
  return enviarPorOutbox(res, { conv, tipo: 'texto', texto });
});

// Verificacion del webhook: Meta llama una vez al configurarlo y le devolvemos
// el "challenge" para confirmar que la URL es nuestra.
app.get('/api/whatsapp/webhook', (req, res) => {
  const modo = req.query?.['hub.mode'];
  const token = req.query?.['hub.verify_token'];
  const challenge = req.query?.['hub.challenge'];
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN || '';
  if (modo === 'subscribe' && esperado && token === esperado) return res.status(200).send(String(challenge || ''));
  return res.sendStatus(403);
});

// Avisos de Meta: mensajes entrantes y estados de entrega.
app.post('/api/whatsapp/webhook', async (req, res) => {
  const firma = verificarFirma(req.rawBody, req.get('x-hub-signature-256'));
  if (!firma.ok) {
    console.warn('[whatsapp] aviso rechazado:', firma.error);
    // Un aviso rechazado puede ser un ataque o una clave mal configurada.
    // Se avisa (con throttle de 30 min) sin frenar la respuesta a Meta.
    alertarSistema('webhook_rechazado', `Se rechazó un aviso de WhatsApp: ${firma.error}`).catch(() => {});
    return res.status(403).json({ error: firma.error });
  }
  res.sendStatus(200); // Meta reintenta si no contestamos rapido
  try {
    const cambios = (req.body?.entry || []).flatMap((e) => e.changes || []);
    for (const cambio of cambios) {
      const v = cambio.value || {};
      const perfil = v.contacts?.[0]?.profile?.name || null;
      for (const m of v.messages || []) {
        // Con el indice unico de wa_message_id, la reserva del mensaje entrante
        // la hace la base (atomica, sin carrera). Si el indice no existe, se
        // consulta antes (puede colarse un duplicado en simultaneo, pero no se
        // pierde ningun mensaje).
        if (m.id && !indiceWamid) {
          const ya = await one('SELECT id FROM wa_mensajes WHERE wa_message_id = $1', [m.id]);
          if (ya) continue; // Meta puede repetir el mismo aviso
        }
        const conv = await conversacionDe(m.from, perfil);
        if (!conv) continue;
        const tipo = limStr(m.type, 20) || 'desconocido';
        // Fotos y documentos: se bajan de Meta y se guardan (si falla, el mensaje
        // igual queda con su texto para no perder el aviso).
        const adjunto = m.image || m.document || null;
        let media = null;
        if (adjunto?.id) {
          const bajado = await descargarMedia({ mediaId: adjunto.id });
          if (bajado.ok) media = guardarArchivoChat({ buffer: bajado.buffer, mime: bajado.mime || adjunto.mime_type, nombre: bajado.nombre || adjunto.filename });
          else console.warn('[whatsapp] no se pudo bajar el archivo entrante:', bajado.error);
        }
        const texto = m.text?.body
          || m.button?.text
          || m.interactive?.list_reply?.title
          || m.interactive?.button_reply?.title
          || (m.image ? (media ? '[foto]' : '[imagen]') : m.audio ? '[audio]' : m.document ? (media ? `[documento: ${media.nombre}]` : '[documento]') : m.video ? '[video]' : m.location ? '[ubicación]' : `[${tipo}]`);
        const fecha = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null;
        const guardado = await guardarMensaje({
          conversacion: conv, direccion: 'in', tipo, texto, waMessageId: m.id || null, estado: 'recibido', fecha,
          mediaUrl: media?.url || null, mediaTipo: media?.tipo || null, mediaNombre: media?.nombre || null,
        });
        if (!guardado) continue; // ya estaba cargado: no se duplica ni suma no leidos
        // Pedido de baja (BAJA / STOP / "no me escriban"): se registra con fecha
        // y no se le vuelve a escribir. Se le confirma una sola vez.
        const pidioBaja = pideBaja(texto);
        if (pidioBaja) {
          await registrarConsentimientoWhatsApp({
            telefono: conv.telefono, estado: 'baja', fuente: 'whatsapp',
            motivo: `El cliente escribió: ${limStr(texto, 40)}`,
          });
          enviarTexto({ to: conv.telefono, texto: 'Listo, no te vamos a escribir más por acá. Si nos necesitás, escribinos cuando quieras.' });
        }
        // Escribirnos es el consentimiento implicito para poder responderle.
        if (!pidioBaja && conv.cliente_id) {
          const cli = await one('SELECT id, wa_optin FROM clientes WHERE id = $1', [conv.cliente_id]);
          if (cli && !cli.wa_optin) await query('UPDATE clientes SET wa_optin = true, wa_optin_fecha = now() WHERE id = $1', [cli.id]);
        }
        notificarSinFrenar(null, null, `WhatsApp de ${perfil || conv.telefono}: ${String(texto).slice(0, 120)}`, 'WhatsApp');
      }
      for (const s of v.statuses || []) {
        if (!s.id) continue;
        await query(
          "UPDATE wa_mensajes SET estado = $2, error = CASE WHEN $2 = 'error' THEN COALESCE(error, 'Meta reportó un error de entrega') ELSE error END WHERE wa_message_id = $1",
          [s.id, ESTADO_ENTREGA[s.status] || s.status]
        );
      }
    }
  } catch (e) {
    console.error('[whatsapp] error procesando el aviso:', e.message);
  }
});

// ---------- Fotos de diagnostico ----------
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// Validacion por magic bytes: la extension final siempre deriva del tipo
// detectado en el contenido, jamas del nombre original ni del mimetype.
function detectImg(buf) {
  const b = buf.subarray(0, 16);
  if (b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.length > 7 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return '.png';
  if (b.length > 5 && b.toString('latin1', 0, 4) === 'GIF8' && b[4] === 0x37 && b[5] === 0x61) return '.gif';
  if (b.length > 11 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return '.webp';
  return null;
}

// Guarda un archivo del chat (foto o PDF) con nombre aleatorio, validando el
// contenido real y no lo que dice el remitente.
function guardarArchivoChat({ buffer, mime, nombre = '' }) {
  if (!buffer?.length) return null;
  const ext = detectImg(buffer) || (buffer.subarray(0, 4).toString('latin1') === '%PDF' ? '.pdf' : null);
  if (!ext) return null;
  const archivo = `chat-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  writeFileSync(path.join(UPLOAD_DIR, archivo), buffer);
  const tipo = ext === '.pdf' ? 'documento' : (String(mime || '').split('/')[1] || 'imagen');
  return { url: `${PUBLIC_URL}/uploads/${archivo}`, archivo, tipo, nombre: limStr(nombre, 120) || `archivo${ext}` };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Solo se permiten imagenes (jpg, png, webp, gif)'));
  },
});

app.post('/api/diagnostico/:orden_id/fotos', authRequired, upload.array('fotos', 6), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No se recibieron fotos' });
  const orden = await one('SELECT * FROM ordenes WHERE id = $1', [req.params.orden_id]);
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!puedeEscribirOrden(req, orden)) return res.status(403).json({ error: 'Sin permisos para esta orden' });
  if (rechazarSiCerrada(orden, res)) return;
  const rutas = [];
  for (const f of req.files) {
    const ext = detectImg(f.buffer);
    if (!ext) return res.status(400).json({ error: 'Archivo subido no es una imagen valida (jpg, png, webp, gif)' });
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    writeFileSync(path.join(UPLOAD_DIR, name), f.buffer);
    rutas.push(`${PUBLIC_URL}/uploads/${name}`);
  }
  const dia = orden.diagnostico || {};
  const fotos = [...(dia.fotos || []), ...rutas];
  await query('UPDATE ordenes SET diagnostico = $2::jsonb WHERE id = $1', [orden.id, JSON.stringify({ ...dia, fotos })]);
  return res.status(201).json({ fotos });
});

// ---------- server ----------
const PORT = process.env.PORT || 3001;
app.use((err, req, res, _next) => {
  const status = err.status || 400;
  // Log con el request-id: el mismo que ve el usuario en la respuesta.
  console.error(JSON.stringify({
    nivel: 'error', fecha: new Date().toISOString(), reqId: req.requestId,
    ruta: req.path, status, mensaje: err.message, usuario: req.user?.email || null,
  }));
  return res.status(status).json({ error: err.message, reqId: req.requestId });
});

asegurarCodigos()
  .then(() => {
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`Bertika API escuchando en http://127.0.0.1:${PORT}`);
    });
    // Worker de la cola de WhatsApp y monitoreo del sistema. Se pueden apagar
    // por entorno (tests de integracion) para que la corrida sea determinista.
    if (process.env.OUTBOX_WORKER !== '0') iniciarOutbox();
    if (process.env.MONITOREO !== '0') iniciarMonitoreo();
    if (process.env.AUTOMATIZACIONES !== '0') iniciarAutomatizaciones();
  })
  .catch((err) => {
    console.error('Fallo la migracion de codigos:', err.message);
    process.exit(1);
  });