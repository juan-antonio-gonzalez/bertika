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
import { signToken, authRequired, requireRol, SECRET } from './middleware/auth.js';
import { canTransition, ORDEN_ESTADOS, ESTADO_LABEL, MIN_CAPACIDAD_PCT } from './reglas.js';
import { obtenerDolar } from './dolar.js';
import { calcularVisita, normalizarConfig, CONFIG_DEFAULT, textoFueraCobertura } from '../src/data/cotizadorVisita.js';
import { enviarTexto, configPublicaWhatsApp, normalizarTelefono, verificarFirma, ESTADO_ENTREGA } from './whatsapp.js';
import { generarCodigoUnico, digitar, formatearCodigo } from './codigo.js';

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
  console.log('[migracion] esquema asegurado (codigos, medio de pago, historial de cotizaciones, movimientos de insumos, cotizador configurable, whatsapp)');
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
  const evId = await nextId('ev');
  const ev = { id: evId, tipo, detalle, fecha: nowIso(), usuario: actor };
  await client.query(
    `UPDATE ordenes SET eventos = eventos || $2::jsonb WHERE id = $1`,
    [ordenId, JSON.stringify([ev])]
  );
  return ev;
}

// Movimiento de stock de un insumo (alta, ingreso, consumo, reversion, ajuste).
async function movimientoInsumo(client, { insumoId, tipo, cantidad, stockResultante, motivo, ordenId = null, actor = null }) {
  const id = await nextId('mov');
  const sql = `INSERT INTO insumos_movimientos (id, insumo_id, tipo, cantidad, stock_resultante, motivo, orden_id, usuario)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`;
  const params = [id, insumoId, tipo, Number(cantidad) || 0, stockResultante, limStr(motivo, 200), ordenId, JSON.stringify(actor)];
  if (client && typeof client.query === 'function') await client.query(sql, params);
  else await query(sql, params);
  return id;
}

async function notificar(client, ordenId, mensaje, canal = 'WhatsApp') {
  const nId = await nextId('nt');
  const sql = 'INSERT INTO notificaciones (id, orden_id, mensaje, canal) VALUES ($1,$2,$3,$4)';
  const params = [nId, ordenId, mensaje, canal];
  if (client && typeof client.query === 'function') {
    await client.query(sql, params);
  } else {
    // Sin transaccion abierta: se inserta con el pool propio (evita crash por client null)
    await query(sql, params);
  }
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
  await cliente.query(
    `UPDATE ordenes SET estado = $2, estado_cotizacion = COALESCE($3, estado_cotizacion), fecha_entrega = COALESCE($4, fecha_entrega) WHERE id = $1`,
    [orden.id, sets.estado, sets.estado_cotizacion ?? null, sets.fecha_entrega ?? null]
  );
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
  const user = { id: u.id, email: u.email, rol: u.rol, tecnico_id: u.tecnico_id, cliente_id: u.cliente_id };
  return res.json({ token, user });
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const u = await one('SELECT * FROM usuarios WHERE id = $1', [req.user.sub]);
  if (!u) return res.status(401).json({ error: 'Usuario inexistente' });
  return res.json({ id: u.id, email: u.email, rol: u.rol, tecnico_id: u.tecnico_id, cliente_id: u.cliente_id });
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
    out[t] = await query(`SELECT * FROM ${t}`);
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

// Publico: busqueda por id de orden, numero de serie o codigo de 16 digitos (sin login)
app.get('/api/public/ordenes', publicLimiter, async (req, res) => {
  const { q } = req.query || {};
  const term = String(q || '').trim();
  if (!term) return res.status(400).json({ error: 'Falta el parametro q' });
  const dig = digitar(term);
  const rows = await query(
    `SELECT id, bateria_serie, codigo_seguimiento, estado, fecha_ingreso FROM ordenes
     WHERE id ILIKE $1 OR bateria_serie ILIKE $1 OR ($2 <> '' AND codigo_seguimiento = $3)
     ORDER BY fecha_ingreso DESC LIMIT 10`,
    [`%${term}%`, dig, dig]
  );
  for (const r of rows) { r.codigo = formatearCodigo(r.codigo_seguimiento); delete r.codigo_seguimiento; }
  return res.json(rows);
});

// Publico: seguimiento / cotizacion publica (sin login). Se resuelve por id de
// la orden o por el codigo de seguimiento de 16 digitos (con o sin guiones).
app.get('/api/public/ordenes/:id', publicLimiter, async (req, res) => {
  const param = String(req.params.id).trim();
  const dig = digitar(param);
  const o = dig.length === 16
    ? await one('SELECT * FROM ordenes WHERE id = $1 OR codigo_seguimiento = $2', [param, dig])
    : await one('SELECT * FROM ordenes WHERE id = $1', [param]);
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
    eventos: o.eventos,
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

app.post('/api/ordenes', authRequired, requireRol('admin'), async (req, res) => {
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
      const batId = await nextId('bat');
      await client.query(
        `INSERT INTO baterias (id, numero_serie, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, fecha_fabricacion, cliente_id, ciclos_estimados, estado_vida)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,300,'activa')`,
        [batId, serieT, limStr(tipo, 40) || 'Plomo-Acido', limStr(voltaje, 12) || '12V', Number(capacidad) || 60, limStr(aplicacion, 40) || 'Automotriz', limStr(marca, 60) || 'Generica', limStr(modelo, 60) || 'Estandar', limStr(equipo, 120) || serieT, new Date().toISOString().slice(0, 10), clienteT]
      );
      bat = { id: batId, numero_serie: serieT };
    }
    const evId = await nextId('ev');
    const ordId = await nextId('ord');
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
  await notificar(null, ordId, `Orden ${ordId}: batería ingresada al taller.`, 'Email');
  return res.status(201).json({ id: ordId });
});

app.patch('/api/ordenes/:id/tecnico', authRequired, requireRol('admin'), async (req, res) => {
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

app.post('/api/ordenes/:id/diagnostico', authRequired, async (req, res) => {
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
  await notificar(null, req.params.id, `Orden ${req.params.id}: diagnóstico registrado y cotización generada. El cliente debe aprobarla.`, 'Email');
  return res.json({ ok: true });
});

app.post('/api/ordenes/:id/cotizacion', authRequired, async (req, res) => {
  const { monto, servicios, insumos } = req.body || {};
  const montoN = Math.max(0, Math.min(Number(monto) || 0, 1e9));
  if (!arrBounded(servicios) || !arrBounded(insumos)) {
    return res.status(400).json({ error: 'Demasiados renglones en la cotizacion' });
  }
  const orden = await one('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!puedeEscribirOrden(req, orden)) return res.status(403).json({ error: 'Sin permisos para esta orden' });
  const detalleCot = {
    monto: montoN,
    servicios_costos: (servicios || []).slice(0, 50).map((s) => ({ nombre: limStr(s.nombre, 120) || 'Servicio', monto: Math.max(0, Math.min(Number(s.monto) || 0, 1e9)) })),
    insumos: (insumos || []).slice(0, 50).map((i) => ({ nombre: limStr(i.nombre, 120) || 'Insumo', cantidad: Math.max(0, Math.min(Number(i.cantidad) || 1, 1e4)), precio: Math.max(0, Math.min(Number(i.precio) || 0, 1e9)) })),
  };
  await query(
    `UPDATE ordenes SET cotizacion = $2::jsonb, estado = 'quoted', estado_cotizacion = 'pending' WHERE id = $1`,
    [orden.id, JSON.stringify(detalleCot)]
  );
  // Versionado: cada cotizacion guardada queda en el historial con su autor.
  await query(
    'INSERT INTO cotizaciones_historial (id, orden_id, monto, detalle, usuario) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)',
    [await nextId('cot'), orden.id, montoN, JSON.stringify(detalleCot), JSON.stringify(actorDe(req))]
  );
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    await pushEvento(client, o.id, 'cotizacion', `Cotización generada por ${fmtARS.format(montoN)}.`, actorDe(req));
  });
  return res.json({ ok: true });
});

// Versiones anteriores de la cotizacion (auditoria de que se cotizo y cuando).
app.get('/api/ordenes/:id/cotizaciones', authRequired, async (req, res) => {
  const o = await one('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!puedeLeerOrden(req, o)) return res.status(403).json({ error: 'Sin permisos para esta orden' });
  return res.json(await query('SELECT * FROM cotizaciones_historial WHERE orden_id = $1 ORDER BY fecha DESC', [req.params.id]));
});

app.post('/api/ordenes/:id/insumos', authRequired, async (req, res) => {
  const { insumo_id, cantidad } = req.body || {};
  const cant = Number(cantidad) || 0;
  const resultado = await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (!puedeEscribirOrden(req, o)) throw { status: 403, message: 'Sin permisos para esta orden' };
    const i = (await client.query('SELECT * FROM insumos WHERE id = $1', [insumo_id])).rows[0];
    if (!i) throw { status: 404, message: 'Insumo no encontrado' };
    if (cant <= 0) throw { status: 400, message: 'Cantidad invalida' };
    if (i.stock < cant) throw { status: 400, message: `Stock insuficiente de ${i.nombre} (disponible: ${i.stock})` };
    await client.query('UPDATE insumos SET stock = stock - $2 WHERE id = $1', [i.id, cant]);
    await client.query(
      `UPDATE ordenes SET insumos_utilizados = insumos_utilizados || $2::jsonb WHERE id = $1`,
      [o.id, JSON.stringify([{ insumo_id: i.id, nombre: i.nombre, cantidad: cant, precio: i.precio }])]
    );
    await pushEvento(client, o.id, 'insumo', `Insumo utilizado: ${i.nombre} x${cant}`, actorDe(req));
    const critico = i.stock - cant < 3;
    await movimientoInsumo(client, {
      insumoId: i.id, tipo: 'consumo', cantidad: cant, stockResultante: i.stock - cant,
      motivo: `Consumo en orden ${o.id}`, ordenId: o.id, actor: actorDe(req),
    });
    return { critico, stockNuevo: i.stock - cant, nombre: i.nombre };
  });
  return res.json({ ok: true, critico: resultado ? resultado.critico : false });
});

// Correccion del piso: devuelve al stock un insumo cargado por error y lo quita
// de la orden (con evento de auditoria). Solo staff con acceso a la orden.
app.delete('/api/ordenes/:id/insumos/:indice', authRequired, async (req, res) => {
  const indice = Number(req.params.indice);
  const revertido = await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (!puedeEscribirOrden(req, o)) throw { status: 403, message: 'Sin permisos para esta orden' };
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

app.post('/api/ordenes/:id/prueba-final', authRequired, async (req, res) => {
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
    await client.query('UPDATE ordenes SET estado = $2 WHERE id = $1', [o.id, passed ? 'ready' : 'in_repair']);
  });
  return res.json({ ok: true });
});

app.post('/api/ordenes/:id/entregar', authRequired, requireRol('admin'), async (req, res) => {
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
    await client.query(
      `UPDATE ordenes SET estado = 'delivered', monto_cobrado = $2, fecha_entrega = $3, garantia = $4::jsonb, medio_pago = $5 WHERE id = $1`,
      [o.id, monto, nowIso(), JSON.stringify({ meses: gMeses, ciclos: gCiclos, vence }), medioT || null]
    );
    await client.query('UPDATE baterias SET estado_vida = $2 WHERE numero_serie = $1', [o.bateria_serie, 'en_garantia']);
    await pushEvento(client, o.id, 'entregada',
      `Batería entregada al cliente. ${fmtARS.format(monto)} cobrados${medioT ? ` (${medioT})` : ''}. Garantía ${gMeses} meses / ${gCiclos} ciclos.`,
      actorDe(req));
  });
  await notificar(null, req.params.id, `Orden ${req.params.id}: batería entregada y cobrada. Garantía activada.`, 'WhatsApp');
  return res.json({ ok: true });
});

app.post('/api/ordenes/:id/baja', authRequired, requireRol('admin'), async (req, res) => {
  const { motivo } = req.body || {};
  const baja = await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    const b = (await client.query('SELECT * FROM baterias WHERE numero_serie = $1', [o.bateria_serie])).rows[0];
    await client.query('UPDATE ordenes SET estado = $2 WHERE id = $1', [o.id, 'cancelled']);
    if (b) await client.query('UPDATE baterias SET estado_vida = $2 WHERE id = $1', [b.id, 'dada_de_baja']);
    const bajaId = await nextId('baja');
    await client.query(
      `INSERT INTO bajas (id, bateria_id, serie, fecha, motivo, disposicion, reciclada) VALUES ($1,$2,$3,$4,$5,'Pendiente de disposicion responsable',false)`,
      [bajaId, b ? b.id : o.bateria_serie, o.bateria_serie, nowIso(), motivo || 'No reparable / fuera de vida util']
    );
    await pushEvento(client, o.id, 'baja', `Batería ${o.bateria_serie} dada de baja: ${motivo || 'no reparable'}. Trazabilidad activa para reciclaje.`, actorDe(req));
    return { id: bajaId, serie: o.bateria_serie };
  });
  return res.json({ ok: true, baja });
});

// Transiciones genericas
app.post('/api/ordenes/:id/transition', authRequired, async (req, res) => {
  const { target, detalle } = req.body || {};
  if (!ORDEN_ESTADOS.includes(target)) return res.status(400).json({ error: 'Estado invalido' });
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (!puedeEscribirOrden(req, o)) throw { status: 403, message: 'Sin permisos para esta orden' };
    await transition(client, o, target, detalle, actorDe(req));
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
    tracker: `${PUBLIC_URL}/tracker/${o.id}`,
  });
});

// ---------- Insumos ----------
app.post('/api/insumos', authRequired, requireRol('admin'), async (req, res) => {
  const { nombre, categoria, stock, precio } = req.body || {};
  const nombreT = limStr(nombre, 120);
  if (!nombreT) return res.status(400).json({ error: 'Falta nombre' });
  const id = await nextId('ins');
  const stockInicial = Math.max(0, Math.min(Number(stock) || 0, 1000000));
  await query('INSERT INTO insumos (id, nombre, categoria, stock, precio) VALUES ($1,$2,$3,$4,$5)', [
    id, nombreT, limStr(categoria, 60), stockInicial, Math.max(0, Math.min(Number(precio) || 0, 1e9)),
  ]);
  await movimientoInsumo(null, { insumoId: id, tipo: 'alta', cantidad: stockInicial, stockResultante: stockInicial, motivo: 'Alta de insumo', actor: actorDe(req) });
  return res.status(201).json({ id });
});

app.patch('/api/insumos/:id/stock', authRequired, requireRol('admin'), async (req, res) => {
  const { cantidad, motivo } = req.body || {};
  const cant = Number(cantidad) || 0;
  if (cant <= 0) return res.status(400).json({ error: 'Cantidad invalida' });
  const r = await query('UPDATE insumos SET stock = stock + $2 WHERE id = $1 RETURNING *', [req.params.id, cant]);
  if (!r.length) return res.status(404).json({ error: 'Insumo no encontrado' });
  await movimientoInsumo(null, {
    insumoId: r[0].id, tipo: 'ingreso', cantidad: cant, stockResultante: r[0].stock,
    motivo: limStr(motivo, 200) || 'Ingreso de stock', actor: actorDe(req),
  });
  return res.json({ ok: true, stock: r[0].stock });
});

// Ajuste por recuento fisico: fija el stock real y registra la diferencia con motivo.
app.post('/api/insumos/:id/ajuste', authRequired, requireRol('admin'), async (req, res) => {
  const { stock_contado, motivo } = req.body || {};
  const contado = numEnRango(stock_contado, 0, 1000000);
  const motivoT = limStr(motivo, 200);
  if (contado === null) return res.status(400).json({ error: 'El stock contado debe ser un numero entre 0 y 1.000.000' });
  if (!motivoT) return res.status(400).json({ error: 'El motivo del ajuste es obligatorio (queda en la trazabilidad)' });
  const previo = await one('SELECT * FROM insumos WHERE id = $1', [req.params.id]);
  if (!previo) return res.status(404).json({ error: 'Insumo no encontrado' });
  const nuevo = Math.round(contado);
  await query('UPDATE insumos SET stock = $2 WHERE id = $1', [previo.id, nuevo]);
  await movimientoInsumo(null, {
    insumoId: previo.id, tipo: 'ajuste', cantidad: nuevo - previo.stock, stockResultante: nuevo,
    motivo: motivoT, actor: actorDe(req),
  });
  return res.json({ ok: true, stock: nuevo, diferencia: nuevo - previo.stock });
});

app.get('/api/insumos/:id/movimientos', authRequired, requireRol('admin', 'tecnico'), async (req, res) => {
  const i = await one('SELECT id, nombre, stock FROM insumos WHERE id = $1', [req.params.id]);
  if (!i) return res.status(404).json({ error: 'Insumo no encontrado' });
  const movimientos = await query('SELECT * FROM insumos_movimientos WHERE insumo_id = $1 ORDER BY fecha DESC LIMIT 200', [req.params.id]);
  return res.json({ insumo: i, movimientos });
});

// ---------- Clientes ----------
app.get('/api/clientes', authRequired, requireRol('admin', 'tecnico'), async (req, res) => res.json(await query('SELECT * FROM clientes ORDER BY nombre')));

app.post('/api/clientes', authRequired, requireRol('admin'), async (req, res) => {
  const { nombre, empresa, email, telefono } = req.body || {};
  const nombreT = limStr(nombre, 120);
  const emailT = String(email || '').trim();
  if (!nombreT || !validEmail(emailT)) return res.status(400).json({ error: 'Faltan nombre y email valido' });
  const id = await nextId('cli');
  await query('INSERT INTO clientes (id, nombre, tipo, telefono, contacto, email, empresa) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
    id, nombreT, 'particular', limStr(telefono, 40), nombreT, emailT, limStr(empresa, 120),
  ]);
  return res.status(201).json({ id });
});

app.post('/api/clientes/find-or-create', authRequired, requireRol('admin'), async (req, res) => {
  const { nombre, empresa, email, telefono } = req.body || {};
  const emailT = String(email || '').trim();
  if (!validEmail(emailT)) return res.status(400).json({ error: 'Falta email valido' });
  const exist = await one('SELECT * FROM clientes WHERE LOWER(email) = LOWER($1)', [emailT]);
  if (exist) return res.json({ id: exist.id });
  const id = await nextId('cli');
  const nombreT = limStr(nombre, 120) || 'Cliente';
  await query('INSERT INTO clientes (id, nombre, tipo, telefono, contacto, email, empresa) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
    id, nombreT, 'particular', limStr(telefono, 40), nombreT, emailT, limStr(empresa, 120),
  ]);
  return res.status(201).json({ id });
});

// ---------- Tecnicos ----------
app.get('/api/tecnicos', authRequired, requireRol('admin', 'tecnico'), async (req, res) => res.json(await query('SELECT * FROM tecnicos ORDER BY nombre')));

app.post('/api/tecnicos', authRequired, requireRol('admin'), async (req, res) => {
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

// ---------- Notificaciones ----------
app.post('/api/notificaciones/leidas', authRequired, async (req, res) => {
  const { clause, params } = notifWhere(req);
  await query(`UPDATE notificaciones n SET leida = true WHERE ${clause}`, params);
  return res.json({ ok: true });
});

app.delete('/api/notificaciones', authRequired, async (req, res) => {
  const { clause, params } = notifWhere(req);
  await query(`DELETE FROM notificaciones n WHERE ${clause}`, params);
  return res.json({ ok: true });
});

// ---------- Reset demo (solo admin; deshabilitado salvo ALLOW_RESET=1) ----------
app.post('/api/reset', authRequired, requireRol('admin'), async (req, res) => {
  if (process.env.ALLOW_RESET !== '1') {
    return res.status(403).json({ error: 'Reset deshabilitado en este entorno (requiere ALLOW_RESET=1). Borra datos solo con cuidado manual.' });
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
app.get('/api/usuarios', authRequired, requireRol('admin'), async (req, res) => {
  const rows = await query('SELECT id, email, rol, tecnico_id, cliente_id, activo, creado_en FROM usuarios ORDER BY email');
  return res.json(rows);
});

app.post('/api/usuarios', authRequired, requireRol('admin'), async (req, res) => {
  const { email, password, rol, tecnico_id, cliente_id } = req.body || {};
  const emailT = String(email || '').trim();
  if (!validEmail(emailT) || !validPassword(password) || !['admin', 'tecnico', 'cliente'].includes(rol)) {
    return res.status(400).json({ error: 'Email, password (min 8 caracteres) y rol valido son obligatorios' });
  }
  const id = await nextId('usr');
  await query(
    'INSERT INTO usuarios (id, email, password_hash, rol, tecnico_id, cliente_id, activo) VALUES ($1,$2,$3,$4,$5,$6,true)',
    [id, emailT, await bcrypt.hash(String(password), BCRYPT_ROUNDS), rol, tecnico_id ? limStr(tecnico_id, 32) : null, cliente_id ? limStr(cliente_id, 32) : null]
  );
  return res.status(201).json({ id });
});

app.patch('/api/usuarios/:id', authRequired, requireRol('admin'), async (req, res) => {
  const { email, password, rol, tecnico_id, cliente_id, activo } = req.body || {};
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
    params.push(Boolean(activo)); sets.push(`activo = $${params.length}`);
  }
  if (password !== undefined && password !== null && password !== '') {
    if (!validPassword(password)) return res.status(400).json({ error: 'Password invalido (min 8 caracteres)' });
    params.push(await bcrypt.hash(String(password), BCRYPT_ROUNDS)); sets.push(`password_hash = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
  params.push(req.params.id);
  await query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return res.json({ ok: true });
});

app.delete('/api/usuarios/:id', authRequired, requireRol('admin'), async (req, res) => {
  if (req.params.id === req.user.sub) return res.status(403).json({ error: 'No podes eliminar tu propio usuario' });
  await query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
  return res.json({ ok: true });
});

// ---------- Bajas ----------
app.post('/api/bajas/:id/reciclar', authRequired, requireRol('admin'), async (req, res) => {
  await query('UPDATE bajas SET reciclada = true, fecha_reciclaje = $2 WHERE id = $1', [req.params.id, nowIso()]);
  return res.json({ ok: true });
});

app.get('/api/bajas', authRequired, requireRol('admin'), async (req, res) => res.json(await query('SELECT * FROM bajas ORDER BY fecha DESC')));

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
app.put('/api/cotizador', authRequired, requireRol('admin'), async (req, res) => {
  const entrada = req.body?.config ?? req.body ?? {};
  let config;
  try {
    config = normalizarConfig(entrada);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  await query(
    `INSERT INTO cotizador_config (id, config, actualizado_en, actualizado_por)
     VALUES ('actual', $1::jsonb, now(), $2)
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por`,
    [JSON.stringify(config), req.user.email]
  );
  await query(
    'INSERT INTO cotizador_config_historial (id, config, usuario) VALUES ($1, $2::jsonb, $3::jsonb)',
    [await nextId('cfg'), JSON.stringify(config), JSON.stringify(actorDe(req))]
  );
  await configCotizador({ forzar: true });
  return res.json({ ok: true, config, actualizadoPor: req.user.email });
});

app.get('/api/cotizador/historial', authRequired, requireRol('admin'), async (req, res) => {
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

app.get('/api/cotizador/metricas', authRequired, requireRol('admin'), async (req, res) => {
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
        const cid = await nextId('cli');
        await client.query('INSERT INTO clientes (id, nombre, tipo, telefono, contacto, email, empresa) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
          cid, nombreT, 'particular', limStr(telefono, 40), nombreT, emailT, empresaT,
        ]);
        c = { id: cid, nombre: nombreT };
      }
      const evId = await nextId('ev');
      const ordId = await nextId('ord');
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
  // guardada (con importes y cotización del dólar) y queda marcada como solicitada.
  let cotizacionDetalle = '';
  const cotCodigo = limStr(cotizacion_codigo, 20).toUpperCase();
  if (cotCodigo) {
    const c = await one('SELECT id, total, moneda, dolar, resumen, estado FROM cotizaciones_visita WHERE id = $1', [cotCodigo]);
    if (c) {
      const d = c.dolar || {};
      cotizacionDetalle = `${c.id} · ${c.moneda} ${c.total}${d.venta ? ` · dólar ${d.casa || 'oficial'} venta ${d.venta}${d.fuente ? ` (${d.fuente})` : ''}` : ''}\n${c.resumen}`;
      if (c.estado === 'estimada') await query("UPDATE cotizaciones_visita SET estado = 'solicitada' WHERE id = $1", [c.id]);
    }
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

async function guardarMensaje({ conversacion, direccion, tipo, texto, plantilla = null, waMessageId = null, estado = null, error = null, fecha = null }) {
  const id = await nextId('wams');
  await query(
    `INSERT INTO wa_mensajes (id, conversacion_id, wa_message_id, direccion, telefono, tipo, texto, plantilla, estado, error, fecha)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11::timestamptz, now()))`,
    [id, conversacion.id, waMessageId, direccion, conversacion.telefono, tipo, texto, plantilla, estado, error, fecha]
  );
  if (direccion === 'in') {
    await query(
      "UPDATE wa_conversaciones SET ultimo_texto = $2, ultima_fecha = now(), no_leidos = COALESCE(no_leidos, 0) + 1, estado = 'abierta' WHERE id = $1",
      [conversacion.id, texto || `[${tipo}]`]
    );
  } else {
    await query('UPDATE wa_conversaciones SET ultimo_texto = $2, ultima_fecha = now() WHERE id = $1', [conversacion.id, texto || `[${tipo}]`]);
  }
  return id;
}

// Estado del canal para el panel: configurado o no, que falta y los numeros.
app.get('/api/whatsapp/estado', authRequired, requireRol('admin'), async (req, res) => {
  const cfg = configPublicaWhatsApp();
  const [tot] = await query(`SELECT
      count(*) FILTER (WHERE direccion = 'in')::int AS recibidos,
      count(*) FILTER (WHERE direccion = 'out')::int AS enviados,
      count(*) FILTER (WHERE direccion = 'out' AND estado = 'error')::int AS con_error,
      count(*) FILTER (WHERE direccion = 'in' AND fecha > now() - interval '7 days')::int AS recibidos_7d
    FROM wa_mensajes`);
  const [conv] = await query('SELECT count(*)::int AS conversaciones, COALESCE(sum(no_leidos), 0)::int AS sin_leer FROM wa_conversaciones');
  return res.json({ ...cfg, webhook: `${PUBLIC_URL}/api/whatsapp/webhook`, estadisticas: { ...tot, ...conv } });
});

app.get('/api/whatsapp/conversaciones', authRequired, requireRol('admin', 'tecnico'), async (req, res) => {
  const convs = await query(`SELECT c.*, cl.nombre AS cliente_nombre, cl.email AS cliente_email
    FROM wa_conversaciones c LEFT JOIN clientes cl ON cl.id = c.cliente_id
    ORDER BY COALESCE(c.ultima_fecha, c.id) DESC LIMIT 100`);
  return res.json(convs);
});

app.get('/api/whatsapp/conversaciones/:id', authRequired, requireRol('admin', 'tecnico'), async (req, res) => {
  const conv = await one('SELECT * FROM wa_conversaciones WHERE id = $1', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  const mensajes = await query('SELECT * FROM wa_mensajes WHERE conversacion_id = $1 ORDER BY fecha ASC LIMIT 300', [conv.id]);
  await query('UPDATE wa_conversaciones SET no_leidos = 0 WHERE id = $1', [conv.id]);
  const cliente = conv.cliente_id ? await one('SELECT * FROM clientes WHERE id = $1', [conv.cliente_id]) : null;
  const ordenes = conv.cliente_id
    ? await query('SELECT id, bateria_serie, estado, fecha_ingreso FROM ordenes WHERE cliente_id = $1 ORDER BY fecha_ingreso DESC LIMIT 5', [conv.cliente_id])
    : [];
  return res.json({ conversacion: { ...conv, no_leidos: 0 }, mensajes, cliente, ordenes });
});

// Mensaje libre: vale dentro de las 24 h desde el ultimo mensaje del cliente.
app.post('/api/whatsapp/conversaciones/:id/responder', authRequired, requireRol('admin', 'tecnico'), async (req, res) => {
  const conv = await one('SELECT * FROM wa_conversaciones WHERE id = $1', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  const texto = limStr(req.body?.texto, 4000);
  if (!texto) return res.status(400).json({ error: 'El mensaje está vacío' });
  const envio = await enviarTexto({ to: conv.telefono, texto });
  await guardarMensaje({
    conversacion: conv, direccion: 'out', tipo: 'text', texto,
    waMessageId: envio.id || null, estado: envio.ok ? 'enviado' : 'error', error: envio.ok ? null : envio.error,
  });
  if (!envio.ok) return res.status(400).json({ error: envio.error });
  return res.json({ ok: true, id: envio.id });
});

// Enviar a un numero suelto (prueba del canal o aviso puntual).
app.post('/api/whatsapp/enviar', authRequired, requireRol('admin', 'tecnico'), async (req, res) => {
  const telefono = limStr(req.body?.telefono, 30);
  const texto = limStr(req.body?.texto, 4000);
  if (!telefono || !texto) return res.status(400).json({ error: 'Faltan el teléfono y el mensaje' });
  const conv = await conversacionDe(telefono);
  if (!conv) return res.status(400).json({ error: 'Teléfono inválido' });
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
        if (m.id) {
          const ya = await one('SELECT id FROM wa_mensajes WHERE wa_message_id = $1', [m.id]);
          if (ya) continue; // Meta puede repetir el mismo aviso
        }
        const conv = await conversacionDe(m.from, perfil);
        if (!conv) continue;
        const tipo = limStr(m.type, 20) || 'desconocido';
        const texto = m.text?.body
          || m.button?.text
          || m.interactive?.list_reply?.title
          || m.interactive?.button_reply?.title
          || (m.image ? '[imagen]' : m.audio ? '[audio]' : m.document ? '[documento]' : m.video ? '[video]' : m.location ? '[ubicación]' : `[${tipo}]`);
        const fecha = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null;
        await guardarMensaje({ conversacion: conv, direccion: 'in', tipo, texto, waMessageId: m.id || null, estado: 'recibido', fecha });
        // Escribirnos es el consentimiento implicito para poder responderle.
        if (conv.cliente_id) {
          const cli = await one('SELECT id, wa_optin FROM clientes WHERE id = $1', [conv.cliente_id]);
          if (cli && !cli.wa_optin) await query('UPDATE clientes SET wa_optin = true, wa_optin_fecha = now() WHERE id = $1', [cli.id]);
        }
        await notificar(null, null, `WhatsApp de ${perfil || conv.telefono}: ${String(texto).slice(0, 120)}`, 'WhatsApp');
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