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
import { query, one, tx } from './db.js';
import { nextId } from './ids.js';
import { signToken, authRequired, requireRol } from './middleware/auth.js';
import { canTransition, ORDEN_ESTADOS, ESTADO_LABEL } from './reglas.js';
import { generarCodigoUnico, digitar, formatearCodigo } from './codigo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:5173';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || PUBLIC_URL).split(',').map((s) => s.trim());

const app = express();
app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '2mb' }));

export { PUBLIC_URL };

// ---------- helpers ----------
const fmtARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const nowIso = () => new Date().toISOString();

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

// Migracion leve al arrancar: columna codigo_seguimiento + relleno de ordenes viejas.
async function asegurarCodigos() {
  await query('ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS codigo_seguimiento TEXT');
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
  console.log('[migracion] codigos de seguimiento asegurados');
}

async function enviarMailContacto(d) {
  const filas = [
    ['Nombre', d.nombre], ['Empresa', d.empresa], ['Email', d.email], ['Teléfono', d.telefono],
    ['Asunto', d.asunto], ['N° de serie', d.serie], ['Código de seguimiento', d.codigo], ['Mensaje', d.mensaje],
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

// Capacidad firmada para enlaces publicos de cotizacion (aprueba/rechaza/lee)
function hornoSigCot(ordenId) {
  return createHmac('sha256', process.env.JWT_SECRET || '').update(`cot:${ordenId}`).digest('hex');
}
function validarSigCot(ordenId, t) {
  if (!t) return false;
  const a = Buffer.from(hornoSigCot(ordenId), 'utf8');
  const b = Buffer.from(String(t), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

async function pushEvento(client, ordenId, tipo, detalle) {
  const evId = await nextId('ev');
  const ev = { id: evId, tipo, detalle, fecha: nowIso() };
  await client.query(
    `UPDATE ordenes SET eventos = eventos || $2::jsonb WHERE id = $1`,
    [ordenId, JSON.stringify([ev])]
  );
  return ev;
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
  diagnosing: ['diagnostico', 'Diagnostico iniciado'],
  quoted: ['cotizacion', 'Cotizacion generada'],
  approved: ['aprobada', 'Cotizacion aprobada por el cliente'],
  in_repair: ['reparacion', 'Reparacion iniciada'],
  testing: ['prueba_iniciada', 'Prueba final iniciada'],
  ready: ['reparacion_completada', 'Reparacion completada'],
  delivered: ['entregada', 'Bateria entregada'],
  cancelled: ['cancelada', 'Orden cancelada'],
};

async function transition(cliente, orden, target, detalle) {
  const check = canTransition(orden, target);
  if (!check.ok) throw { status: 400, message: check.err };
  const [tipo, def] = eventoArgs[target] || [target, `Estado cambiado a ${target}`];
  await pushEvento(cliente, orden.id, tipo, detalle || def);
  const sets = { estado: target };
  if (target === 'quoted') sets.estado_cotizacion = 'pending';
  if (target === 'approved') sets.estado_cotizacion = 'approved';
  if (target === 'delivered') sets.fecha_entrega = nowIso();
  await cliente.query(
    `UPDATE ordenes SET estado = $2, estado_cotizacion = COALESCE($3, estado_cotizacion), fecha_entrega = COALESCE($4, fecha_entrega) WHERE id = $1`,
    [orden.id, sets.estado, sets.estado_cotizacion ?? null, sets.fecha_entrega ?? null]
  );
  // notificaciones simuladas
  if (target === 'ready') await notificar(cliente, orden.id, `Orden ${orden.id}: reparacion completada, bateria lista para retirar.`, 'WhatsApp');
  if (target === 'delivered') await notificar(cliente, orden.id, `Orden ${orden.id}: bateria entregada y cobrada. Garantia activada.`, 'WhatsApp');
  if (target === 'approved') await notificar(cliente, orden.id, `Orden ${orden.id}: cotizacion aprobada. Comienza la reparacion.`, 'Email');
}

// ---------- Auth ----------
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Faltan email y password' });
  const u = await one('SELECT * FROM usuarios WHERE email = $1 AND activo = true', [String(email).toLowerCase().trim()]);
  if (!u || !bcrypt.compareSync(String(password), u.password_hash)) {
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
app.get('/api/public/stats', async (req, res) => {
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
app.get('/api/public/ordenes', async (req, res) => {
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
app.get('/api/public/ordenes/:id', async (req, res) => {
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

app.get('/api/public/cotizacion/:orden_id', async (req, res) => {
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
  return false;
}

app.post('/api/ordenes/:id/cotizacion/aprobar', async (req, res) => {
  await tx(async (client) => {
    const o = await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
    const orden = o.rows[0];
    if (!orden) throw { status: 404, message: 'Orden no encontrada' };
    if (!(await puedeDecidirCotizacion(req, orden))) throw { status: 403, message: 'Sin permisos para esta cotizacion' };
    if (orden.estado !== 'quoted') throw { status: 400, message: 'La orden no esta en estado cotizada' };
    await transition(client, orden, 'approved');
  });
  return res.json({ ok: true });
});

app.post('/api/ordenes/:id/cotizacion/rechazar', async (req, res) => {
  await tx(async (client) => {
    const o = await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
    const orden = o.rows[0];
    if (!orden) throw { status: 404, message: 'Orden no encontrada' };
    if (!(await puedeDecidirCotizacion(req, orden))) throw { status: 403, message: 'Sin permisos para esta cotizacion' };
    if (orden.estado !== 'quoted') throw { status: 400, message: 'La orden no esta en estado cotizada' };
    await transition(client, orden, 'cancelled', 'Cotizacion rechazada por el cliente. Orden cancelada.');
  });
  return res.json({ ok: true });
});

app.post('/api/ordenes', authRequired, requireRol('admin'), async (req, res) => {
  const { serie, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, cliente_id, falla, tecnico_id } = req.body || {};
  if (!serie || !cliente_id || !falla) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (serie, cliente y falla)' });
  }
  const ordId = await tx(async (client) => {
    let bat = (await client.query('SELECT * FROM baterias WHERE numero_serie = $1', [serie])).rows[0];
    if (!bat) {
      const batId = await nextId('bat');
      await client.query(
        `INSERT INTO baterias (id, numero_serie, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, fecha_fabricacion, cliente_id, ciclos_estimados, estado_vida)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,300,'activa')`,
        [batId, serie, tipo || 'Plomo-Acido', voltaje || '12V', Number(capacidad) || 60, aplicacion || 'Automotriz', marca || 'Generica', modelo || 'Estandar', equipo || serie, new Date().toISOString().slice(0, 10), cliente_id]
      );
      bat = { id: batId, numero_serie: serie };
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
        ordId, codigo, serie, cliente_id, tecnico_id || null, falla,
        nowIso(), new Date(Date.now() + 24 * 3600000).toISOString(),
        JSON.stringify([{ id: evId, tipo: 'ingreso', detalle: `Bateria ${serie} ingresada al taller. Falla reportada: ${falla}`, fecha: nowIso() }]),
      ]
    );
    return ordId;
  });
  await notificar(null, ordId, `Orden ${ordId}: bateria ingresada al taller.`, 'Email');
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
    await pushEvento(client, o.id, 'asignacion', `Tecnico asignado: ${t.nombre}`);
    return { tecnico: t, orden: o };
  });
  return res.json({ ok: true, tecnico: od.tecnico });
});

app.post('/api/ordenes/:id/diagnostico', authRequired, async (req, res) => {
  const { voltaje, resistencia, pruebaCarga, notas, servicioTipo, fotos } = req.body || {};
  const detalle = `Diagnostico registrado: ${voltaje}V, RI ${resistencia} mOhm. Prueba: ${pruebaCarga === 'passed' ? 'aprobada' : 'fallida'}.${notas ? ` ${notas}` : ''}`;
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (!puedeEscribirOrden(req, o)) throw { status: 403, message: 'Sin permisos para esta orden' };
    await client.query(
      `UPDATE ordenes SET diagnostico = $2::jsonb, estado = CASE WHEN estado = 'received' THEN 'diagnosing' ELSE estado END WHERE id = $1`,
      [o.id, JSON.stringify({ voltaje_medido: voltaje, resistencia_interna: resistencia, prueba_carga: pruebaCarga, notas: notas || '', servicioTipo: servicioTipo || '', fotos: fotos || [] })]
    );
    const updated = (await client.query('SELECT * FROM ordenes WHERE id = $1', [o.id])).rows[0];
    await pushEvento(client, o.id, 'diagnostico', detalle);
    if (updated.estado === 'received') {
      await transition(client, updated, 'diagnosing', 'Diagnostico iniciado por el tecnico.');
    }
    await transition(client, { ...updated, estado: 'diagnosing' }, 'quoted', `Diagnostico completado. Cotizacion generada por ${servicioTipo || 'el servicio'}.`);
  });
  await notificar(null, req.params.id, `Orden ${req.params.id}: diagnostico registrado y cotizacion generada. El cliente debe aprobarla.`, 'Email');
  return res.json({ ok: true });
});

app.post('/api/ordenes/:id/cotizacion', authRequired, async (req, res) => {
  const { monto, servicios, insumos } = req.body || {};
  const orden = await one('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!puedeEscribirOrden(req, orden)) return res.status(403).json({ error: 'Sin permisos para esta orden' });
  await query(
    `UPDATE ordenes SET cotizacion = $2::jsonb, estado = 'quoted', estado_cotizacion = 'pending' WHERE id = $1`,
    [orden.id, JSON.stringify({
      monto: Number(monto) || 0,
      servicios_costos: (servicios || []).map((s) => ({ nombre: s.nombre, monto: Number(s.monto) || 0 })),
      insumos: (insumos || []).map((i) => ({ nombre: i.nombre, cantidad: Number(i.cantidad) || 1, precio: Number(i.precio) || 0 })),
    })]
  );
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    await pushEvento(client, o.id, 'cotizacion', `Cotizacion generada por ${fmtARS.format(Number(monto) || 0)}.`);
  });
  return res.json({ ok: true });
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
    await pushEvento(client, o.id, 'insumo', `Insumo utilizado: ${i.nombre} x${cant}`);
    const critico = i.stock - cant < 3;
    return { critico, stockNuevo: i.stock - cant, nombre: i.nombre };
  });
  return res.json({ ok: true, critico: resultado ? resultado.critico : false });
});

app.post('/api/ordenes/:id/prueba-final', authRequired, async (req, res) => {
  const { capacidad, resultado, obs } = req.body || {};
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (!puedeEscribirOrden(req, o)) throw { status: 403, message: 'Sin permisos para esta orden' };
    if (o.estado !== 'testing') throw { status: 400, message: 'La orden debe estar en prueba final' };
    const passed = resultado === 'passed';
    await client.query(
      `UPDATE ordenes SET prueba_final = $2::jsonb WHERE id = $1`,
      [o.id, JSON.stringify({ estado: passed ? 'passed' : 'failed', capacidad_medida: Number(capacidad) || null, obs: obs || '' })]
    );
    const evTipo = passed ? 'prueba_aprobada' : 'prueba_fallida';
    const evDet = passed
      ? `Prueba final APROBADA. Capacidad medida: ${capacidad}Ah.${obs ? ` ${obs}` : ''}`
      : `Prueba final FALLIDA. Capacidad medida: ${capacidad}Ah. Regreso a reparacion: ${obs || 'se requiere reproceso'}`;
    await pushEvento(client, o.id, evTipo, evDet);
    await client.query('UPDATE ordenes SET estado = $2 WHERE id = $1', [o.id, passed ? 'ready' : 'in_repair']);
  });
  return res.json({ ok: true });
});

app.post('/api/ordenes/:id/entregar', authRequired, requireRol('admin'), async (req, res) => {
  const { monto_cobrado, garantia_meses, garantia_ciclos } = req.body || {};
  await tx(async (client) => {
    const o = (await client.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id])).rows[0];
    if (!o) throw { status: 404, message: 'Orden no encontrada' };
    if (o.estado !== 'ready') throw { status: 400, message: 'Solo ordenes listas pueden entregarse' };
    const monto = monto_cobrado != null && monto_cobrado !== '' ? Number(monto_cobrado) : o.cotizacion?.monto || 0;
    const gMeses = Number(garantia_meses) || 6;
    const gCiclos = Number(garantia_ciclos) || 100;
    const vence = new Date(Date.now() + gMeses * 30.44 * 86400000).toISOString();
    await client.query(
      `UPDATE ordenes SET estado = 'delivered', monto_cobrado = $2, fecha_entrega = $3, garantia = $4::jsonb WHERE id = $1`,
      [o.id, monto, nowIso(), JSON.stringify({ meses: gMeses, ciclos: gCiclos, vence })]
    );
    await client.query('UPDATE baterias SET estado_vida = $2 WHERE numero_serie = $1', [o.bateria_serie, 'en_garantia']);
    await pushEvento(client, o.id, 'entregada', `Bateria entregada al cliente. ${fmtARS.format(monto)} cobrados. Garantia ${gMeses} meses / ${gCiclos} ciclos.`);
  });
  await notificar(null, req.params.id, `Orden ${req.params.id}: bateria entregada y cobrada. Garantia activada.`, 'WhatsApp');
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
    await pushEvento(client, o.id, 'baja', `Bateria ${o.bateria_serie} dada de baja: ${motivo || 'no reparable'}. Trazabilidad activa para reciclaje.`);
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
    await transition(client, o, target, detalle);
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
  if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
  const id = await nextId('ins');
  await query('INSERT INTO insumos (id, nombre, categoria, stock, precio) VALUES ($1,$2,$3,$4,$5)', [
    id, nombre, categoria || '', Number(stock) || 0, Number(precio) || 0,
  ]);
  return res.status(201).json({ id });
});

app.patch('/api/insumos/:id/stock', authRequired, requireRol('admin'), async (req, res) => {
  const { cantidad } = req.body || {};
  const cant = Number(cantidad) || 0;
  if (cant <= 0) return res.status(400).json({ error: 'Cantidad invalida' });
  const r = await query('UPDATE insumos SET stock = stock + $2 WHERE id = $1 RETURNING *', [req.params.id, cant]);
  if (!r.length) return res.status(404).json({ error: 'Insumo no encontrado' });
  return res.json({ ok: true, stock: r[0].stock });
});

// ---------- Clientes ----------
app.get('/api/clientes', authRequired, requireRol('admin', 'tecnico'), async (req, res) => res.json(await query('SELECT * FROM clientes ORDER BY nombre')));

app.post('/api/clientes', authRequired, async (req, res) => {
  const { nombre, empresa, email, telefono } = req.body || {};
  if (!nombre || !email) return res.status(400).json({ error: 'Faltan nombre y email' });
  const id = await nextId('cli');
  await query('INSERT INTO clientes (id, nombre, tipo, telefono, contacto, email, empresa) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
    id, nombre, 'particular', telefono || '', nombre, email, empresa || '',
  ]);
  return res.status(201).json({ id });
});

app.post('/api/clientes/find-or-create', authRequired, async (req, res) => {
  const { nombre, empresa, email, telefono } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Falta email' });
  const exist = await one('SELECT * FROM clientes WHERE LOWER(email) = LOWER($1)', [email]);
  if (exist) return res.json({ id: exist.id });
  const id = await nextId('cli');
  await query('INSERT INTO clientes (id, nombre, tipo, telefono, contacto, email, empresa) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
    id, nombre || 'Cliente', 'particular', telefono || '', nombre || 'Cliente', email, empresa || '',
  ]);
  return res.status(201).json({ id });
});

// ---------- Tecnicos ----------
app.get('/api/tecnicos', authRequired, requireRol('admin', 'tecnico'), async (req, res) => res.json(await query('SELECT * FROM tecnicos ORDER BY nombre')));

app.post('/api/tecnicos', authRequired, requireRol('admin'), async (req, res) => {
  const { nombre, especialidad, certificaciones } = req.body || {};
  if (!nombre || !especialidad) return res.status(400).json({ error: 'Faltan nombre y especialidad' });
  const id = await nextId('tec_');
  await query('INSERT INTO tecnicos (id, nombre, especialidad, certificaciones, activo) VALUES ($1,$2,$3,$4,true)', [
    id, nombre, especialidad, JSON.stringify(certificaciones || []),
  ]);
  return res.status(201).json({ id });
});

// ---------- Notificaciones ----------
app.post('/api/notificaciones/leidas', authRequired, async (req, res) => {
  await query('UPDATE notificaciones SET leida = true');
  return res.json({ ok: true });
});

app.delete('/api/notificaciones', authRequired, async (req, res) => {
  await query('DELETE FROM notificaciones');
  return res.json({ ok: true });
});

// ---------- Reset demo (solo admin) ----------
app.post('/api/reset', authRequired, requireRol('admin'), async (req, res) => {
  try {
    const seedScript = await import('./seed.js');
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
  if (!email || !password || !['admin', 'tecnico', 'cliente'].includes(rol)) {
    return res.status(400).json({ error: 'Faltan email, password y rol valido' });
  }
  const id = await nextId('usr');
  await query(
    'INSERT INTO usuarios (id, email, password_hash, rol, tecnico_id, cliente_id, activo) VALUES ($1,$2,$3,$4,$5,$6,true)',
    [id, email.toLowerCase().trim(), bcrypt.hashSync(String(password), 10), rol, tecnico_id || null, cliente_id || null]
  );
  return res.status(201).json({ id });
});

app.patch('/api/usuarios/:id', authRequired, requireRol('admin'), async (req, res) => {
  const { email, password, rol, tecnico_id, cliente_id, activo } = req.body || {};
  const sets = [];
  const params = [];
  if (email !== undefined) { params.push(email.toLowerCase().trim()); sets.push(`email = $${params.length}`); }
  if (rol !== undefined) { params.push(rol); sets.push(`rol = $${params.length}`); }
  if (tecnico_id !== undefined) { params.push(tecnico_id ?? null); sets.push(`tecnico_id = $${params.length}`); }
  if (cliente_id !== undefined) { params.push(cliente_id ?? null); sets.push(`cliente_id = $${params.length}`); }
  if (activo !== undefined) { params.push(Boolean(activo)); sets.push(`activo = $${params.length}`); }
  if (password) { params.push(bcrypt.hashSync(String(password), 10)); sets.push(`password_hash = $${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
  params.push(req.params.id);
  await query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return res.json({ ok: true });
});

app.delete('/api/usuarios/:id', authRequired, requireRol('admin'), async (req, res) => {
  await query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
  return res.json({ ok: true });
});

// ---------- Bajas ----------
app.post('/api/bajas/:id/reciclar', authRequired, requireRol('admin'), async (req, res) => {
  await query('UPDATE bajas SET reciclada = true, fecha_reciclaje = $2 WHERE id = $1', [req.params.id, nowIso()]);
  return res.json({ ok: true });
});

app.get('/api/bajas', authRequired, requireRol('admin'), async (req, res) => res.json(await query('SELECT * FROM bajas ORDER BY fecha DESC')));

// ---------- Contacto publico (crea orden si es reparacion + envia correo a ventas) ----------
app.post('/api/public/contacto', async (req, res) => {
  const { nombre, empresa, email, telefono, serie, asunto, mensaje } = req.body || {};
  if (!nombre || !email || !mensaje) {
    return res.status(400).json({ error: 'Faltan nombre, email y mensaje' });
  }
  const esReparacion = Boolean(serie && String(serie).trim());
  const serieTxt = esReparacion ? String(serie).trim() : '';
  let codigoTxt = '';

  if (esReparacion) {
    await tx(async (client) => {
      let c = (await client.query('SELECT * FROM clientes WHERE LOWER(email) = LOWER($1)', [email])).rows[0];
      if (!c) {
        const cid = await nextId('cli');
        await client.query('INSERT INTO clientes (id, nombre, tipo, telefono, contacto, email, empresa) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
          cid, nombre, 'particular', telefono || '', nombre, email, empresa || '',
        ]);
        c = { id: cid, nombre };
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
          ordId, codigo, serieTxt, c.id, mensaje,
          nowIso(), new Date(Date.now() + 24 * 3600000).toISOString(),
          JSON.stringify([{ id: evId, tipo: 'ingreso', detalle: `Bateria ${serieTxt} ingresada al taller (por web). Falla reportada: ${mensaje}`, fecha: nowIso() }]),
        ]
      );
    });
  }

  const mail = await enviarMailContacto({ nombre, empresa, email, telefono, serie: serieTxt, asunto, mensaje, codigo: codigoTxt });
  return res.status(201).json({ ok: true, emailEnviado: mail.ok, codigo: codigoTxt });
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
app.use((err, req, res, next) => {
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