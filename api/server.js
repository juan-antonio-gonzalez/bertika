import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, timingSafeEqual } from 'node:crypto';
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
import { PERMISOS, COLUMNAS, agruparPermisos, permisosPorDefecto, normalizarPermisos, permisosEfectivos, puedeVer } from './permisos.js';
import { canTransition, ORDEN_ESTADOS, ESTADO_LABEL, MIN_CAPACIDAD_PCT, esEstadoCerrado } from './reglas.js';
import { obtenerDolar } from './dolar.js';
import { calcularVisita, normalizarConfig, CONFIG_DEFAULT, textoFueraCobertura } from '../src/data/cotizadorVisita.js';
import {
  enviarTexto, enviarPlantilla, configPublicaWhatsApp, normalizarTelefono, normalizarEtiquetas, verificarFirma, ESTADO_ENTREGA,
  descargarMedia, subirMedia, enviarImagen, enviarDocumento, pideBaja,
} from './whatsapp.js';
import { EVENTOS as EVENTOS_AVISO, PLANTILLA_POR_ESTADO, PLANTILLA_GARANTIA, normalizarAvisos, parametrosAviso, resumenAviso, debeAvisarGarantia, parametrosGarantia } from './avisos.js';
import {
  normalizarEtapa, normalizarMonto, normalizarTipoCliente, faltaMotivoPerdida,
  calcularMetricas, normalizarEstadoTarea,
} from './crm.js';
import { generarCodigoUnico, digitar, formatearCodigo } from './codigo.js';
import { normalizarBooleano } from './validaciones.js';
import { RESPUESTAS_EJEMPLO, colorDePaleta, normalizarAtajo, fragmentoConTexto } from '../src/data/respuestas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:5173';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || PUBLIC_URL).split(',').map((s) => s.trim());

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
  if (esTecnico(req)) return orden.tecnico_id === req.user.tecnico_id;
  if (esCliente(req)) return orden.cliente_id === req.user.cliente_id;
  return false;
}

function puedeEscribirOrden(req, orden) {
  if (esAdmin(req)) return true;
  if (esTecnico(req)) {
    return orden.tecnico_id === req.user.tecnico_id
      || (!orden.tecnico_id && ['received', 'diagnosing'].includes(orden.estado));
  }
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
  if (rol === 'tecnico') {
    out.ordenes = out.ordenes.filter((o) => o.tecnico_id === req.user.tecnico_id
      || (o.tecnico_id === null && ['received', 'diagnosing'].includes(o.estado)));
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
  await tx(async (client) => {
    const o = await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
    const orden = o.rows[0];
    if (!orden) throw { status: 404, message: 'Orden no encontrada' };
    if (!(await puedeDecidirCotizacion(req, orden))) throw { status: 403, message: 'Sin permisos para esta cotizacion' };
    if (orden.estado !== 'quoted') throw { status: 400, message: 'La orden no esta en estado cotizada' };
    await transition(client, orden, 'approved', 'Cotización aprobada por el cliente.', actorDe(req));
  });
  return res.json({ ok: true });
});

app.post('/api/ordenes/:id/cotizacion/rechazar', publicLimiter, async (req, res) => {
  await tx(async (client) => {
    const o = await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
    const orden = o.rows[0];
    if (!orden) throw { status: 404, message: 'Orden no encontrada' };
    if (!(await puedeDecidirCotizacion(req, orden))) throw { status: 403, message: 'Sin permisos para esta cotizacion' };
    if (orden.estado !== 'quoted') throw { status: 400, message: 'La orden no esta en estado cotizada' };
    await transition(client, orden, 'cancelled', 'Cotización rechazada por el cliente. Orden cancelada.', actorDe(req));
  });
  return res.json({ ok: true });
});

app.post('/api/ordenes', authRequired, permisoRequerido('crear_orden'), async (req, res) => {
  const { serie, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, cliente_id, falla, tecnico_id } = req.body || {};
  const serieT = limStr(serie, 64);
  const fallaT = limStr(falla, 500);
  const clienteT = limStr(cliente_id, 32);
  if (!serieT || !clienteT || !fallaT) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (serie, cliente y falla)' });
  }
  const ordId = await tx(async (client) => {
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
        JSON.stringify([{ id: evId, tipo: 'ingreso', detalle: `Batería ${serieT} ingresada al taller. Falla reportada: ${fallaT}`, fecha: nowIso(), usuario: actorDe(req) }]),
      ]
    );
    return ordId;
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
  if (!arrBounded(servicios) || !arrBounded(insumos)) {
    return res.status(400).json({ error: 'Demasiados renglones en la cotizacion' });
  }
  const orden = await one('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!puedeEscribirOrden(req, orden)) return res.status(403).json({ error: 'Sin permisos para esta orden' });
  if (rechazarSiCerrada(orden, res)) return;
  const detalleCot = {
    monto: montoN,
    servicios_costos: (servicios || []).slice(0, 50).map((s) => ({ nombre: limStr(s.nombre, 120) || 'Servicio', monto: Math.max(0, Math.min(Number(s.monto) || 0, 1e9)) })),
    insumos: (insumos || []).slice(0, 50).map((i) => ({ nombre: limStr(i.nombre, 120) || 'Insumo', cantidad: Math.max(0, Math.min(Number(i.cantidad) || 1, 1e4)), precio: Math.max(0, Math.min(Number(i.precio) || 0, 1e9)) })),
  };
  // Cotizacion + version en el historial + evento, todo en UNA transaccion: si
  // algo falla no queda una cotizacion sin su rastro de auditoria.
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1 FOR UPDATE', [orden.id])).rows[0];
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
      [cotId, o.id, montoN, JSON.stringify(detalleCot), JSON.stringify(actorDe(req))]
    );
    await pushEvento(client, o.id, 'cotizacion', `Cotización generada por ${fmtARS.format(montoN)}.`, actorDe(req));
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
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (o.estado !== 'ready') throw { status: 400, message: 'Solo órdenes listas pueden entregarse' };
    const monto = monto_cobrado != null && monto_cobrado !== '' ? Number(monto_cobrado) : o.cotizacion?.monto || 0;
    const gMeses = Number(garantia_meses) || 6;
    const gCiclos = Number(garantia_ciclos) || 100;
    const vence = new Date(Date.now() + gMeses * 30.44 * 86400000).toISOString();
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
    return { id: bajaId, serie: o.bateria_serie };
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
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (!puedeEscribirOrden(req, o)) throw { status: 403, message: 'Sin permisos para esta orden' };
    await transition(client, o, target, limStr(detalle, 500), actorDe(req));
  });
  return res.json({ ok: true });
});

// Compartir enlaces (cotizacion firmada + tracker). Staff con acceso a la orden.
app.post('/api/ordenes/:id/compartir', authRequired, async (req, res) => {
  const o = await one('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!puedeEscribirOrden(req, o)) return res.status(403).json({ error: 'Sin permisos para esta orden' });
  const t = hornoSigCot(o.id);
  return res.json({
    cotizacion: `${PUBLIC_URL}/cotizacion/${o.id}?t=${t}`,
    tracker: `${PUBLIC_URL}/tracker/${formatearCodigo(o.codigo_seguimiento) || o.id}`,
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
  return res.status(201).json({ id });
});

app.patch('/api/usuarios/:id', authRequired, permisoRequerido('editar_usuarios'), async (req, res) => {
  const { email, password, rol, tecnico_id, cliente_id, activo, permisos } = req.body || {};
  const isSelf = req.params.id === req.user.sub;
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
  await query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
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
  const { km, renglones, extrasSel, urgencia, turno, modo, nombre, empresa, email, telefono, fecha_preferida, website } = req.body || {};
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
  const { nombre, empresa, email, telefono, serie, asunto, mensaje, cotizacion_codigo, website } = req.body || {};
  // Honeypot: campo oculto que solo completan bots. Se descarta silenciosamente.
  if (website) return res.status(201).json({ ok: true, emailEnviado: false, codigo: '' });
  const nombreT = limStr(nombre, 120);
  const emailT = String(email || '').trim();
  const mensajeT = limStr(mensaje, 2000);
  if (!nombreT || !validEmail(emailT) || !mensajeT) {
    return res.status(400).json({ error: 'Faltan nombre, email valido y mensaje' });
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
        `INSERT INTO ordenes (id, codigo_seguimiento, bateria_serie, cliente_id, tecnico_id, falla, motivo, estado, fecha_ingreso, hora_entrega, eventos, cotizacion, estado_cotizacion, insumos_utilizados, prueba_final, diagnostico)
         VALUES ($1,$2,$3,$4,NULL,$5,$5,'received',$6,$7,$8::jsonb,NULL,NULL,'[]'::jsonb,'{"estado":"pending"}',NULL)`,
        [
          ordId, codigo, serieTxt, c.id, mensajeT,
          nowIso(), new Date(Date.now() + 24 * 3600000).toISOString(),
          JSON.stringify([{ id: evId, tipo: 'ingreso', detalle: `Batería ${serieTxt} ingresada al taller (por web). Falla reportada: ${mensajeT}`, fecha: nowIso(), usuario: null }]),
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

// Reserva el aviso ANTES de mandarlo: si otro proceso ya lo reservo o ya lo
// mando, no se vuelve a enviar. (Antes se enviaba y recien despues se anotaba,
// asi que dos procesos podian mandar la misma plantilla dos veces.)
async function reservarAviso(ordenId, plantilla) {
  const r = await one(
    `INSERT INTO wa_avisos_log (orden_id, plantilla, estado) VALUES ($1, $2, 'enviando')
     ON CONFLICT (orden_id, plantilla) DO UPDATE SET estado = 'enviando', error = NULL, fecha = now()
       WHERE wa_avisos_log.estado <> 'enviado'
         AND (wa_avisos_log.estado <> 'enviando' OR wa_avisos_log.fecha < now() - interval '10 minutes')
     RETURNING orden_id`,
    [ordenId, plantilla]
  );
  return Boolean(r);
}

// Cierra la reserva: si salio queda 'enviado' (y no se repite nunca mas); si
// fallo se libera para poder reintentar. El intento fallido igual queda en la
// bandeja como mensaje con error, asi el taller lo ve.
async function cerrarAviso(ordenId, plantilla, envio) {
  if (envio.ok) {
    await query("UPDATE wa_avisos_log SET estado = 'enviado', error = NULL, fecha = now() WHERE orden_id = $1 AND plantilla = $2", [ordenId, plantilla]);
  } else {
    await query('DELETE FROM wa_avisos_log WHERE orden_id = $1 AND plantilla = $2', [ordenId, plantilla]);
  }
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

// Manda la plantilla que corresponde al estado actual de la orden, si el aviso
// esta prendido, el cliente tiene telefono y no se le haya mandado ya.
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
    const parametros = parametrosAviso(orden.estado, { cliente, orden, sitio: PUBLIC_URL });
    const envio = await enviarPlantilla({ to: cliente.telefono, nombre: plantilla, idioma: 'es_AR', parametros });
    await guardarMensaje({
      conversacion: conv, direccion: 'out', tipo: 'template', plantilla,
      texto: resumenAviso(orden.estado, { orden }),
      waMessageId: envio.id || null, estado: envio.ok ? 'enviado' : 'error', error: envio.ok ? null : envio.error,
    });
    await cerrarAviso(orden.id, plantilla, envio);
    if (!envio.ok) console.warn(`[whatsapp] aviso ${plantilla} de ${orden.id} no salio: ${envio.error}`);
  } catch (e) {
    console.error('[whatsapp] error mandando el aviso:', e.message);
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
  const resumen = { revisadas: 0, enviadas: 0, errores: 0, sinTelefono: 0, apagado: false, detalle: [] };
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
      const envio = await enviarPlantilla({ to: o.cliente_telefono, nombre: PLANTILLA_GARANTIA, idioma: 'es_AR', parametros });
      await guardarMensaje({
        conversacion: conv, direccion: 'out', tipo: 'template', plantilla: PLANTILLA_GARANTIA,
        texto: resumenAviso('garantia', { orden: o }),
        waMessageId: envio.id || null, estado: envio.ok ? 'enviado' : 'error', error: envio.ok ? null : envio.error,
      });
      await cerrarAviso(o.id, PLANTILLA_GARANTIA, envio);
      if (envio.ok) {
        resumen.enviadas += 1;
        resumen.detalle.push(`${o.bateria_serie} (${o.id})`);
      } else {
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
  const convs = await query(`SELECT c.*, cl.nombre AS cliente_nombre, cl.email AS cliente_email
    FROM wa_conversaciones c LEFT JOIN clientes cl ON cl.id = c.cliente_id
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

async function registrarConsentimiento({ telefono, estado, motivo = null, fuente = null, usuario = null }) {
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
  return res.json(upd);
});

// Metricas del embudo comercial: conversion, tasa de cierre, tiempo medio en cada
// etapa y motivos de perdida. El calculo vive en src/data/crm.js (probado aparte).
app.get('/api/whatsapp/metricas', authRequired, permisoRequerido('metricas_whatsapp'), async (req, res) => {
  const conversaciones = await query('SELECT id, etapa, monto_estimado, ultima_fecha FROM wa_conversaciones');
  const historial = await query(
    'SELECT conversacion_id, anterior, nueva, monto, motivo, fecha FROM wa_etapa_historial ORDER BY fecha ASC LIMIT 5000'
  );
  // La entrada a la primera etapa se aproxima con el primer mensaje del cliente.
  const primeras = await query(
    "SELECT conversacion_id, min(fecha) AS primera FROM wa_mensajes WHERE direccion = 'in' GROUP BY conversacion_id"
  );
  const porPrimera = {};
  for (const p of primeras) porPrimera[p.conversacion_id] = p.primera;
  return res.json(calcularMetricas({ conversaciones, historial, primeras: porPrimera }));
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
  return res.json({ conversacion: { ...conv, no_leidos: 0 }, mensajes, cliente, ordenes, notas, consentimiento, ficha: ficha ? { ...ficha, garantias } : null });
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
  const envio = await enviarTexto({ to: conv.telefono, texto });
  await guardarMensaje({
    conversacion: conv, direccion: 'out', tipo: 'text', texto,
    waMessageId: envio.id || null, estado: envio.ok ? 'enviado' : 'error', error: envio.ok ? null : envio.error,
  });
  if (!envio.ok) return res.status(400).json({ error: envio.error });
  return res.json({ ok: true, id: envio.id });
});

// Habilitar o dar de baja el envío de mensajes para un cliente.
app.post('/api/whatsapp/conversaciones/:id/optin', authRequired, permisoRequerido('crm_whatsapp'), async (req, res) => {
  const conv = await one('SELECT * FROM wa_conversaciones WHERE id = $1', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  const estado = String(req.body?.estado || '').toLowerCase() === 'baja' ? 'baja' : 'alta';
  const fila = await registrarConsentimiento({
    telefono: conv.telefono, estado, motivo: req.body?.motivo || (estado === 'baja' ? 'Dado de baja desde el panel' : 'Habilitado desde el panel'),
    fuente: 'panel', usuario: actorDe(req)?.email,
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
  const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
  const encabezado = ['conversacion', 'fecha', 'direccion', 'telefono', 'cliente', 'tipo', 'texto', 'estado', 'plantilla', 'archivo'].join(';');
  const csv = [
    encabezado,
    ...filas.map((f) => [
      f.conversacion_id,
      f.fecha instanceof Date ? f.fecha.toISOString() : f.fecha,
      f.direccion === 'in' ? 'recibido' : 'enviado',
      f.telefono, f.cliente, f.tipo, f.texto, f.estado, f.plantilla, f.media_url,
    ].map(escapar).join(';')),
  ].join('\n');
  await query(
    'INSERT INTO wa_export_log (id, usuario, desde, hasta, filas) VALUES ($1,$2,$3,$4,$5)',
    [await nextId('wex'), actorDe(req)?.email || 'panel', desde, hasta, filas.length]
  );
  // Auditoria minima en el log del servidor: quien exporto y con que filtros.
  console.log(`[whatsapp] export CSV por ${actorDe(req)?.email || 'panel'}: desde=${desde ? desde.toISOString() : '-'} hasta=${hasta ? hasta.toISOString() : '-'} conversacion=${conversacion || '-'} filas=${filas.length}`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bertika-whatsapp-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(`\uFEFF${csv}`);
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
  const subida = await subirMedia({ buffer: req.file.buffer, mime: esPdf ? 'application/pdf' : req.file.mimetype, nombre });
  if (!subida.ok) return res.status(400).json({ error: subida.error });
  const envio = esPdf
    ? await enviarDocumento({ to: conv.telefono, mediaId: subida.id, texto, nombre })
    : await enviarImagen({ to: conv.telefono, mediaId: subida.id, texto });
  // Se guarda la copia local para poder mostrarla en la bandeja.
  const local = guardarArchivoChat({ buffer: req.file.buffer, mime: req.file.mimetype, nombre });
  await guardarMensaje({
    conversacion: conv, direccion: 'out', tipo: esPdf ? 'document' : 'image',
    texto: texto || (esPdf ? `[documento: ${nombre}]` : '[foto]'),
    waMessageId: envio.id || null, estado: envio.ok ? 'enviado' : 'error', error: envio.ok ? null : envio.error,
    mediaUrl: local?.url || null, mediaTipo: local?.tipo || null, mediaNombre: local?.nombre || null,
  });
  if (!envio.ok) return res.status(400).json({ error: envio.error });
  return res.json({ ok: true, id: envio.id, media_url: local?.url || null, media_tipo: local?.tipo || null });
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
  const envio = await enviarTexto({ to: conv.telefono, texto });
  await guardarMensaje({
    conversacion: conv, direccion: 'out', tipo: 'text', texto,
    waMessageId: envio.id || null, estado: envio.ok ? 'enviado' : 'error', error: envio.ok ? null : envio.error,
  });
  if (!envio.ok) return res.status(400).json({ error: envio.error });
  return res.json({ ok: true, id: envio.id, conversacion_id: conv.id });
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
          await registrarConsentimiento({
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
  return { url: `${PUBLIC_URL}/uploads/${archivo}`, tipo, nombre: limStr(nombre, 120) || `archivo${ext}` };
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
  console.error('Error:', err.message);
  return res.status(err.status || 400).json({ error: err.message });
});

asegurarCodigos()
  .then(() => {
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`Bertika API escuchando en http://127.0.0.1:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Fallo la migracion de codigos:', err.message);
    process.exit(1);
  });