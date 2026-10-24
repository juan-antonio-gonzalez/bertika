// Tests de integracion de la API contra un PostgreSQL real.
//
// Que prueba (lo que los tests unitarios no pueden):
//   - que las migraciones creen las tablas nuevas y el servidor arranque;
//   - login, permisos por rol y matriz de secciones;
//   - auditoria: alta/edicion de cliente, entrega con monto, redaccion de claves;
//   - outbox: un envio sin WhatsApp queda fallido (no se pierde), se puede
//     reintentar y el worker puede procesar la cola;
//   - export CSV: una formula de Excel queda neutralizada;
//   - webhook: rechaza un aviso sin firma.
//
// Requiere TEST_DATABASE_URL apuntando a una base descartable cuyo nombre
// termine en "_test" (el script la borra y la vuelve a crear).
//
//   TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/bertika_test \
//     node scripts/test-integracion.mjs

import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { LEGAL_DOCS } from '../src/data/legal.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(RAIZ, 'api');
const requireApi = createRequire(path.join(API_DIR, 'package.json'));
const { Client } = requireApi('pg');

const DB_URL = process.env.TEST_DATABASE_URL;
if (!DB_URL) {
  console.error('Falta TEST_DATABASE_URL (base descartable, el nombre tiene que terminar en _test).');
  process.exit(2);
}
const url = new URL(DB_URL);
const NOMBRE_DB = decodeURIComponent(url.pathname.replace(/^\//, ''));
if (!/_test$/i.test(NOMBRE_DB)) {
  console.error(`Por seguridad el nombre de la base tiene que terminar en _test (es "${NOMBRE_DB}").`);
  process.exit(2);
}

const PORT = Number(process.env.TEST_PORT || 3999);
const BASE = `http://127.0.0.1:${PORT}`;
const API = `${BASE}/api`;
const MOCK_PORT = Number(process.env.TEST_MOCK_PORT || 3998);
const UPLOAD_DIR = path.join('/tmp', `bertika-test-uploads-${process.pid}`);
const ADMIN_PASS = 'admin12345';
const TEC_PASS = 'tec12345';
const JWT_SECRET_TEST = 'test-secret-b3rt1k4-integracion-0123456789';
const firmaCotizacion = (ordenId) => createHmac('sha256', JWT_SECRET_TEST).update(`cot:${ordenId}`).digest('hex');

let servidor = null;
let mockMeta = null;
let db = null;
let pasaron = 0;
let fallaron = 0;
const llamadasMeta = [];

const test = async (nombre, fn) => {
  try {
    await fn();
    pasaron += 1;
    console.log(`  ok  ${nombre}`);
  } catch (e) {
    fallaron += 1;
    console.error(`FALLA  ${nombre}\n      ${e.message}`);
  }
};

async function pedir(ruta, { method = 'GET', token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const opciones = { method, headers: h };
  if (body !== undefined && method !== 'GET' && method !== 'HEAD') opciones.body = JSON.stringify(body);
  const res = await fetch(API + ruta, opciones);
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* respuesta no JSON */ }
  return { status: res.status, ok: res.ok, json, texto, headers: res.headers };
}

async function esperarServidor() {
  const limite = Date.now() + 20000;
  while (Date.now() < limite) {
    if (servidor.exitCode !== null) throw new Error(`El servidor terminó (código ${servidor.exitCode}).`);
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return;
    } catch { /* todavía no levantó */ }
    await sleep(250);
  }
  throw new Error('El servidor no respondió /api/health en 20 segundos.');
}

async function prepararBase() {
  const adminUrl = new URL(DB_URL);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  // DROP ... WITH (FORCE) corta conexiones colgadas (Postgres 13+).
  await admin.query(`DROP DATABASE IF EXISTS "${NOMBRE_DB}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${NOMBRE_DB}"`);
  await admin.end();

  // Datos de demo con credenciales conocidas (el seed no deja claves en el código).
  execFileSync(process.execPath, ['seed.js'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      DATABASE_URL: DB_URL,
      DEMO_ADMIN_PASS: ADMIN_PASS,
      DEMO_TEC01_PASS: TEC_PASS,
      DEMO_CLI01_PASS: 'cli12345',
    },
    stdio: 'pipe',
  });
}

// Meta simulado: permite probar el camino feliz y los reintentos sin gastar
// mensajes ni depender de internet. "FALLA_DEFINITIVA" simula la ventana de 24 h
// (no se reintenta) y "FALLA_TEMPORAL" un 500 la primera vez (se reintenta).
function iniciarMockMeta() {
  return new Promise((resolve, reject) => {
    mockMeta = http.createServer((req, res) => {
      let cuerpo = '';
      req.on('data', (c) => { cuerpo += c; });
      req.on('end', () => {
        let json = {};
        try { json = JSON.parse(cuerpo || '{}'); } catch { /* body no JSON */ }
        const texto = String(json.text?.body || json.template?.name || '');
        llamadasMeta.push(texto);
        const responder = (status, payload) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        };
        if (texto.includes('FALLA_DEFINITIVA')) {
          return responder(400, { error: { code: 131047, message: 'Fuera de la ventana de 24 h' } });
        }
        const temporales = llamadasMeta.filter((t) => t.includes('FALLA_TEMPORAL')).length;
        if (texto.includes('FALLA_TEMPORAL') && temporales === 1) {
          return responder(500, { error: { code: 131016, message: 'Servicio no disponible' } });
        }
        return responder(200, { messages: [{ id: `wamid.test.${Date.now()}` }] });
      });
    });
    mockMeta.on('error', reject);
    mockMeta.listen(MOCK_PORT, '127.0.0.1', resolve);
  });
}

function arrancarServidor() {
  servidor = spawn(process.execPath, ['server.js'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      DATABASE_URL: DB_URL,
      PORT: String(PORT),
      JWT_SECRET: JWT_SECRET_TEST,
      PUBLIC_URL: BASE,
      UPLOAD_DIR,
      OUTBOX_WORKER: '0', // el test decide cuándo procesar la cola
      MONITOREO: '0',
      AUTOMATIZACIONES: '0', // se disparan a mano desde el endpoint
      WHATSAPP_API_BASE: `http://127.0.0.1:${MOCK_PORT}`,
      WHATSAPP_TOKEN: 'token-de-prueba',
      WHATSAPP_PHONE_ID: '123456789',
      WHATSAPP_APP_SECRET: 'secreto-de-prueba',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servidor.stdout.on('data', (d) => {
    if (process.env.VERBOSE) process.stdout.write(`[api] ${d}`);
  });
  servidor.stderr.on('data', (d) => {
    if (process.env.VERBOSE) process.stderr.write(`[api] ${d}`);
  });
}

async function main() {
  console.log(`\nIntegración contra ${url.host}/${NOMBRE_DB}`);
  await prepararBase();
  await iniciarMockMeta();
  arrancarServidor();
  await esperarServidor();

  db = new Client({ connectionString: DB_URL });
  await db.connect();

  // Los avisos automáticos quedan apagados: así el outbox solo tiene lo que
  // crea el test y las cuentas son deterministas.
  await db.query(`INSERT INTO wa_avisos_config (evento, activo)
    VALUES ('received', false), ('quoted', false), ('ready', false), ('garantia', false)
    ON CONFLICT (evento) DO UPDATE SET activo = false`);
  await db.query('DELETE FROM wa_outbox');
  await db.query('DELETE FROM auditoria');
  await db.query('DELETE FROM alertas_log');

  let tokenAdmin = '';
  let tokenTec = '';

  await test('health público responde y dice que la base está bien', async () => {
    const r = await pedir('/health');
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(typeof r.json.version, 'string');
  });

  await test('login rechaza una clave incorrecta', async () => {
    const r = await pedir('/auth/login', { method: 'POST', body: { email: 'admin@bertika.com', password: 'incorrecta' } });
    assert.equal(r.status, 401);
  });

  await test('login del admin y del técnico devuelve token', async () => {
    const a = await pedir('/auth/login', { method: 'POST', body: { email: 'admin@bertika.com', password: ADMIN_PASS } });
    assert.equal(a.status, 200);
    assert.ok(a.json.token);
    tokenAdmin = a.json.token;
    const t = await pedir('/auth/login', { method: 'POST', body: { email: 'tec01@bertika.com', password: TEC_PASS } });
    assert.equal(t.status, 200);
    assert.ok(t.json.token);
    tokenTec = t.json.token;
  });

  await test('salud detallada es solo para el admin', async () => {
    const sin = await pedir('/salud');
    assert.equal(sin.status, 401);
    const tec = await pedir('/salud', { token: tokenTec });
    assert.equal(tec.status, 403);
    const admin = await pedir('/salud', { token: tokenAdmin });
    assert.equal(admin.status, 200);
    assert.equal(admin.json.db.ok, true);
    assert.equal(admin.json.whatsapp.configurado, true);
    assert.equal(typeof admin.json.outbox.pendientes, 'number');
  });

  let clienteId = '';
  await test('crear cliente queda en la auditoría (sin secretos)', async () => {
    const r = await pedir('/clientes', {
      method: 'POST', token: tokenAdmin,
      body: { nombre: 'Cliente Integración', email: 'integracion@test.local', telefono: '11 5555-0000' },
    });
    assert.equal(r.status, 201, r.texto);
    clienteId = r.json.id;
    const a = await pedir(`/auditoria?tabla=clientes&registro_id=${clienteId}`, { token: tokenAdmin });
    assert.equal(a.status, 200);
    assert.ok(a.json.filas.length >= 1, 'tiene que quedar la fila de auditoría');
    assert.equal(a.json.filas[0].accion, 'crear');
    assert.equal(JSON.stringify(a.json).includes('password'), false);
  });

  await test('editar cliente guarda solo el campo que cambió', async () => {
    const r = await pedir(`/clientes/${clienteId}`, {
      method: 'PATCH', token: tokenAdmin, body: { telefono: '11 4444-1111' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.telefono, '11 4444-1111');
    const a = await pedir(`/auditoria?tabla=clientes&registro_id=${clienteId}&limite=10`, { token: tokenAdmin });
    const fila = a.json.filas.find((f) => f.accion === 'editar');
    assert.ok(fila, 'tiene que estar el cambio de teléfono');
    assert.equal(fila.antes.telefono, '11 5555-0000');
    assert.equal(fila.despues.telefono, '11 4444-1111');
  });

  let ordenId = '';
  await test('crear orden y entregarla registra el cobro en la auditoría', async () => {
    const serie = `TEST-${Date.now()}`;
    const r = await pedir('/ordenes', {
      method: 'POST', token: tokenAdmin,
      body: {
        serie, tipo: 'Plomo-Acido', voltaje: '12V', capacidad: 55, aplicacion: 'Automotriz',
        marca: 'Prueba', modelo: 'T', equipo: 'Banco de pruebas', cliente_id: clienteId, falla: 'No arranca',
      },
    });
    assert.equal(r.status, 201, r.texto);
    ordenId = r.json.id;
    // Se salta el circuito técnico: para probar la entrega alcanza con que esté lista.
    await db.query("UPDATE ordenes SET estado = 'ready' WHERE id = $1", [ordenId]);
    const e = await pedir(`/ordenes/${ordenId}/entregar`, {
      method: 'POST', token: tokenAdmin,
      body: { monto_cobrado: 25000, garantia_meses: 6, medio_pago: 'Efectivo' },
    });
    assert.equal(e.status, 200, e.texto);
    const a = await pedir(`/auditoria?tabla=ordenes&registro_id=${ordenId}`, { token: tokenAdmin });
    const fila = a.json.filas.find((f) => f.accion === 'entregar');
    assert.ok(fila, 'la entrega tiene que quedar auditada');
    assert.equal(Number(fila.despues.monto_cobrado), 25000);
    assert.equal(fila.despues.medio_pago, 'Efectivo');
  });

  await test('un técnico no puede entregar ni ver la auditoría', async () => {
    const entrega = await pedir(`/ordenes/${ordenId}/transition`, {
      method: 'POST', token: tokenTec, body: { target: 'delivered' },
    });
    assert.equal(entrega.status, 403);
    const audit = await pedir('/auditoria', { token: tokenTec });
    assert.equal(audit.status, 403);
  });

  // ---------- Privacidad, consentimientos y cookies ----------
  const emailPriv = `priv-${Date.now()}@test.local`;
  let consentCookiesId = '';
  let consentContactoId = '';
  let consentRetiroId = '';

  await test('el consentimiento de cookies se guarda con versión y hash', async () => {
    const r = await pedir('/consentimiento', {
      method: 'POST',
      body: {
        cookies: { necesarias: true, analiticas: true, marketing: false },
        cookiesVersion: LEGAL_DOCS.cookies.version,
        source: 'banner', page: '/test', accion: 'aceptar-todo',
      },
    });
    assert.equal(r.status, 201, r.texto);
    assert.ok(r.json.id);
    consentCookiesId = r.json.id;
    const fila = (await db.query('SELECT * FROM consentimientos WHERE id = $1', [consentCookiesId])).rows[0];
    assert.equal(fila.tipo, 'cookies');
    assert.equal(fila.cookies_analiticas, true);
    assert.equal(fila.cookies_marketing, false);
    assert.equal(fila.cookies_version, LEGAL_DOCS.cookies.version);
    assert.equal(fila.hash_version, 2);
    assert.match(fila.hash, /^[a-f0-9]{64}$/);
    assert.match(fila.hash_legal, /^[a-f0-9]{64}$/);
  });

  await test('una versión vieja de cookies se rechaza', async () => {
    const r = await pedir('/consentimiento', {
      method: 'POST',
      body: {
        cookies: { necesarias: true, analiticas: true, marketing: false },
        cookiesVersion: '2020-01-01', source: 'banner', page: '/test', accion: 'aceptar-todo',
      },
    });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /versión|cambió/i);
  });

  await test('el formulario de contacto exige términos y privacidad', async () => {
    const sin = await pedir('/public/contacto', {
      method: 'POST',
      body: { nombre: 'Sin Consentimiento', email: emailPriv, mensaje: 'Hola' },
    });
    assert.equal(sin.status, 400);
    assert.match(sin.json.error, /aceptar/i);

    const con = await pedir('/public/contacto', {
      method: 'POST',
      body: {
        nombre: 'Con Consentimiento', email: emailPriv, telefono: '11 5555-0000',
        asunto: 'Consulta', mensaje: 'Hola, necesito un presupuesto', website: '',
        serie: 'TEST-PRIV-1',
        terminosVersion: LEGAL_DOCS.terminos.version,
        privacidadVersion: LEGAL_DOCS.privacidad.version,
        aceptaTerminos: true, aceptaPrivacidad: true, idempotencyKey: 'contacto-test-1',
      },
    });
    assert.equal(con.status, 201, con.texto);
    const fila = (await db.query(
      "SELECT * FROM consentimientos WHERE tipo = 'formulario' AND email = $1 ORDER BY creado_en DESC LIMIT 1",
      [emailPriv]
    )).rows[0];
    assert.ok(fila, 'tiene que quedar el consentimiento del formulario');
    consentContactoId = fila.id;
    assert.equal(fila.acepta_terminos, true);
    assert.equal(fila.acepta_privacidad, true);
    assert.equal(fila.terminos_version, LEGAL_DOCS.terminos.version);
    assert.equal(fila.privacidad_version, LEGAL_DOCS.privacidad.version);
    assert.equal(fila.terminos_url, `/legal/archivo/${LEGAL_DOCS.terminos.version}/terminos.html`);
    assert.equal(fila.privacidad_url, `/legal/archivo/${LEGAL_DOCS.privacidad.version}/privacidad.html`);
    assert.match(fila.hash, /^[a-f0-9]{64}$/);
    assert.ok(con.json.codigo, 'el formulario de reparación devuelve el código de seguimiento');
    const orden = (await db.query('SELECT id, consentimiento_id FROM ordenes WHERE consentimiento_id = $1', [fila.id])).rows[0];
    assert.ok(orden, 'la orden creada desde el formulario queda vinculada a la aceptación');
    assert.equal(orden.consentimiento_id, fila.id);
  });

  await test('reenviar el mismo formulario no duplica el consentimiento', async () => {
    const r = await pedir('/public/contacto', {
      method: 'POST',
      body: {
        nombre: 'Con Consentimiento', email: emailPriv, telefono: '11 5555-0000',
        asunto: 'Consulta', mensaje: 'Hola de nuevo', website: '',
        terminosVersion: LEGAL_DOCS.terminos.version,
        privacidadVersion: LEGAL_DOCS.privacidad.version,
        aceptaTerminos: true, aceptaPrivacidad: true, idempotencyKey: 'contacto-test-1',
      },
    });
    assert.equal(r.status, 201, r.texto);
    assert.equal(r.json.duplicado, true);
    const n = (await db.query("SELECT count(*)::int AS n FROM consentimientos WHERE tipo = 'formulario' AND email = $1", [emailPriv])).rows[0].n;
    assert.equal(n, 1, 'el mismo idempotencyKey no crea otra fila');
  });

  await test('el retiro de consentimiento queda registrado', async () => {
    const r = await pedir('/privacidad/solicitud', {
      method: 'POST',
      body: {
        email: emailPriv, nombre: 'Con Consentimiento', tipo: 'Acceso a mis datos',
        motivo: 'Quiero ver qué datos tienen', declara: true, website: '', idempotencyKey: 'retiro-test-1',
      },
    });
    assert.equal(r.status, 201, r.texto);
    assert.ok(r.json.id);
    consentRetiroId = r.json.id;
    const fila = (await db.query('SELECT * FROM consentimientos WHERE id = $1', [consentRetiroId])).rows[0];
    assert.equal(fila.tipo, 'retiro');
    assert.match(fila.motivo, /Acceso a mis datos/);
  });

  await test('el panel de privacidad lista, exporta y anonimiza', async () => {
    const lista = await pedir('/privacidad/consentimientos', { token: tokenAdmin });
    assert.equal(lista.status, 200, lista.texto);
    assert.ok(lista.json.resumen.total >= 3);
    assert.ok(lista.json.filas.some((f) => f.id === consentCookiesId));
    assert.ok(lista.json.filas.every((f) => f.integro === true), 'el panel marca todas como íntegras');
    const porEmail = await pedir(`/privacidad/consentimientos?email=${encodeURIComponent(emailPriv)}`, { token: tokenAdmin });
    assert.equal(porEmail.status, 200, porEmail.texto);
    assert.ok(porEmail.json.filas.length >= 1, 'la ficha del cliente encuentra sus aceptaciones por email');
    assert.ok(porEmail.json.filas.every((f) => f.email === emailPriv.toLowerCase()));

    const detalle = await pedir(`/privacidad/consentimientos/${consentContactoId}`, { token: tokenAdmin });
    assert.equal(detalle.status, 200, detalle.texto);
    assert.equal(detalle.json.integro, true);
    assert.equal(detalle.json.integro_legal, true);
    assert.equal(detalle.json.integro_completo, true);
    assert.equal(detalle.json.terminos_url, `/legal/archivo/${LEGAL_DOCS.terminos.version}/terminos.html`);
    assert.ok(detalle.json.hash_legal);

    const tec = await pedir('/privacidad/consentimientos', { token: tokenTec });
    assert.equal(tec.status, 403);
    const tecDetalle = await pedir(`/privacidad/consentimientos/${consentContactoId}`, { token: tokenTec });
    assert.equal(tecDetalle.status, 403);
    const inexistente = await pedir('/privacidad/consentimientos/cons_no_existe', { token: tokenAdmin });
    assert.equal(inexistente.status, 404);

    const exp = await pedir('/privacidad/consentimientos/export', { token: tokenAdmin });
    assert.equal(exp.status, 200);
    assert.match(exp.headers.get('content-type') || '', /text\/csv/);
    assert.ok(exp.texto.includes('cookies'));
    assert.ok(exp.texto.includes(emailPriv));

    const anon = await pedir(`/privacidad/consentimientos/${consentContactoId}/anonimizar`, { method: 'POST', token: tokenAdmin });
    assert.equal(anon.status, 200, anon.texto);
    const fila = (await db.query('SELECT nombre, email, ip, anonimizado_en, hash, hash_legal FROM consentimientos WHERE id = $1', [consentContactoId])).rows[0];
    assert.equal(fila.nombre, null);
    assert.equal(fila.email, null);
    assert.equal(fila.ip, null);
    assert.ok(fila.anonimizado_en);
    assert.match(fila.hash, /^[a-f0-9]{64}$/, 'el hash se conserva como prueba');
    assert.match(fila.hash_legal, /^[a-f0-9]{64}$/, 'el hash legal queda verificable tras anonimizar');
    const detAnon = await pedir(`/privacidad/consentimientos/${consentContactoId}`, { token: tokenAdmin });
    assert.equal(detAnon.status, 200);
    assert.equal(detAnon.json.integro, true);
    assert.equal(detAnon.json.integro_legal, true);
    assert.equal(detAnon.json.integro_completo, true, 'la identidad anonimizada no invalida la prueba legal');
    const otra = await pedir(`/privacidad/consentimientos/${consentContactoId}/anonimizar`, { method: 'POST', token: tokenAdmin });
    assert.equal(otra.status, 409);
  });

  // ---------- Fase 2: conversación -> cotización -> orden ----------
  let convCot = null;
  let ordenCot = null;

  await test('cotizar desde el chat vincula la orden y manda el link firmado', async () => {
    const envio = await pedir('/whatsapp/enviar', {
      method: 'POST', token: tokenAdmin, body: { telefono: '11 5555-7777', texto: 'Consulta de cotización' },
    });
    assert.equal(envio.status, 200, envio.texto);
    convCot = (await db.query('SELECT id FROM wa_conversaciones WHERE telefono = $1', ['5491155557777'])).rows[0]?.id;
    assert.ok(convCot, 'la conversación tiene que existir');
    const vinc = await pedir(`/whatsapp/conversaciones/${convCot}`, {
      method: 'PATCH', token: tokenAdmin, body: { cliente_id: clienteId },
    });
    assert.equal(vinc.status, 200, vinc.texto);

    const o = await pedir('/ordenes', {
      method: 'POST', token: tokenAdmin,
      body: {
        serie: `TEST-COT-${Date.now()}`, cliente_id: clienteId, falla: 'No retiene carga',
        tipo: 'Plomo-Acido', voltaje: '12V', capacidad: 60, aplicacion: 'Automotriz',
      },
    });
    assert.equal(o.status, 201, o.texto);
    ordenCot = o.json.id;

    const q = await pedir(`/whatsapp/conversaciones/${convCot}/cotizacion`, {
      method: 'POST', token: tokenAdmin,
      body: { orden_id: ordenCot, monto: 18000, enviar: true, mensaje: 'Tu presupuesto está listo' },
    });
    assert.equal(q.status, 201, q.texto);
    assert.equal(q.json.orden_id, ordenCot);
    assert.match(q.json.cotizacion_url, /\?t=[a-f0-9]{64}$/);
    assert.equal(q.json.envio?.estado, 'enviado');

    const conv = (await db.query('SELECT orden_id, etapa, monto_estimado FROM wa_conversaciones WHERE id = $1', [convCot])).rows[0];
    assert.equal(conv.orden_id, ordenCot);
    assert.equal(conv.etapa, 'presupuestado');
    assert.equal(Number(conv.monto_estimado), 18000);
    const orden = (await db.query("SELECT estado, cotizacion->>'monto' AS monto FROM ordenes WHERE id = $1", [ordenCot])).rows[0];
    assert.equal(orden.estado, 'quoted');
    assert.equal(Number(orden.monto), 18000);

    const detalle = await pedir(`/whatsapp/conversaciones/${convCot}`, { token: tokenAdmin });
    assert.equal(detalle.status, 200);
    assert.equal(detalle.json.orden?.id, ordenCot);
    assert.match(detalle.json.cotizacion_url, /\?t=/);
    assert.ok(detalle.json.sla, 'el hilo trae datos de SLA');

    const audit = await pedir(`/auditoria?tabla=wa_conversaciones&registro_id=${convCot}`, { token: tokenAdmin });
    assert.ok(audit.json.filas.some((f) => f.accion === 'cotizar_desde_bandeja'));
  });

  await test('aprobar la cotización mueve la oportunidad a ganado', async () => {
    const t = firmaCotizacion(ordenCot);
    const r = await pedir(`/ordenes/${ordenCot}/cotizacion/aprobar?t=${t}`, { method: 'POST' });
    assert.equal(r.status, 200, r.texto);
    assert.equal(r.json.etapa, 'ganado');
    const conv = (await db.query('SELECT etapa FROM wa_conversaciones WHERE id = $1', [convCot])).rows[0];
    assert.equal(conv.etapa, 'ganado');
    const orden = (await db.query('SELECT estado FROM ordenes WHERE id = $1', [ordenCot])).rows[0];
    assert.equal(orden.estado, 'approved');
    const hist = (await db.query(
      "SELECT nueva, motivo FROM wa_etapa_historial WHERE conversacion_id = $1 AND nueva = 'ganado' ORDER BY fecha DESC LIMIT 1",
      [convCot]
    )).rows[0];
    assert.ok(hist, 'tiene que quedar el historial de etapa');
    // Para las métricas de cierre real, la orden aprobada se entrega.
    await db.query("UPDATE ordenes SET estado = 'delivered', monto_cobrado = 18000, fecha_entrega = now() WHERE id = $1", [ordenCot]);
  });

  await test('rechazar la cotización mueve la oportunidad a perdido con motivo', async () => {
    const envio = await pedir('/whatsapp/enviar', {
      method: 'POST', token: tokenAdmin, body: { telefono: '11 5555-8888', texto: 'Otra consulta' },
    });
    assert.equal(envio.status, 200, envio.texto);
    const conv = (await db.query('SELECT id FROM wa_conversaciones WHERE telefono = $1', ['5491155558888'])).rows[0]?.id;
    await pedir(`/whatsapp/conversaciones/${conv}`, { method: 'PATCH', token: tokenAdmin, body: { cliente_id: clienteId } });
    const o = await pedir('/ordenes', {
      method: 'POST', token: tokenAdmin,
      body: { serie: `TEST-RECH-${Date.now()}`, cliente_id: clienteId, falla: 'Otra falla' },
    });
    assert.equal(o.status, 201, o.texto);
    const q = await pedir(`/whatsapp/conversaciones/${conv}/cotizacion`, {
      method: 'POST', token: tokenAdmin, body: { orden_id: o.json.id, monto: 9000, enviar: false },
    });
    assert.equal(q.status, 201, q.texto);
    const t = firmaCotizacion(o.json.id);
    const r = await pedir(`/ordenes/${o.json.id}/cotizacion/rechazar?t=${t}`, { method: 'POST' });
    assert.equal(r.status, 200, r.texto);
    assert.equal(r.json.etapa, 'perdido');
    const convDb = (await db.query('SELECT etapa FROM wa_conversaciones WHERE id = $1', [conv])).rows[0];
    assert.equal(convDb.etapa, 'perdido');
    const hist = (await db.query(
      "SELECT motivo FROM wa_etapa_historial WHERE conversacion_id = $1 AND nueva = 'perdido' ORDER BY fecha DESC LIMIT 1",
      [conv]
    )).rows[0];
    assert.equal(hist.motivo, 'Cotización rechazada');
  });

  await test('las métricas del embudo incluyen cotizado y cobrado real', async () => {
    const r = await pedir('/whatsapp/metricas', { token: tokenAdmin });
    assert.equal(r.status, 200);
    assert.ok(r.json.ordenes.conOrden >= 2, 'las dos oportunidades tienen orden');
    assert.ok(r.json.ordenes.cotizado >= 27000);
    assert.ok(r.json.ordenes.cobrado >= 18000);
    assert.ok(r.json.ordenes.entregadas >= 1);
    assert.equal(typeof r.json.ordenes.tasaCobro, 'number');
  });

  // ---------- Fase 2: SLA y reparto ----------
  await test('el SLA detecta la conversación sin responder y mide la primera respuesta', async () => {
    await db.query(`INSERT INTO wa_conversaciones (id, telefono, nombre_perfil, ultima_fecha)
      VALUES ('conv_sla_1', '5491100000001', 'SLA Uno', now()), ('conv_sla_2', '5491100000002', 'SLA Dos', now())`);
    await db.query(`INSERT INTO wa_mensajes (id, conversacion_id, direccion, telefono, tipo, texto, estado, fecha) VALUES
      ('wams_sla_1_in', 'conv_sla_1', 'in', '5491100000001', 'text', 'Consulta', 'recibido', now() - interval '3 hours'),
      ('wams_sla_1_out', 'conv_sla_1', 'out', '5491100000001', 'text', 'Respuesta', 'enviado', now() - interval '2 hours 50 minutes'),
      ('wams_sla_2_in', 'conv_sla_2', 'in', '5491100000002', 'text', 'Otra consulta', 'recibido', now() - interval '10 minutes')`);
    const r = await pedir('/whatsapp/sla', { token: tokenAdmin });
    assert.equal(r.status, 200, r.texto);
    assert.ok(r.json.medidas >= 1);
    assert.ok(r.json.sinResponder.some((c) => c.id === 'conv_sla_2'));
    assert.ok(r.json.primeraRespuestaPromedioMs !== null);
    assert.ok(Array.isArray(r.json.porAgente));
    const filtro = await pedir('/whatsapp/conversaciones?sin_responder=1', { token: tokenAdmin });
    assert.equal(filtro.status, 200);
    assert.ok(filtro.json.some((c) => c.id === 'conv_sla_2'), 'el filtro de la bandeja trae la conversación pendiente');
  });

  await test('el admin puede repartir las conversaciones sin asignar por carga', async () => {
    const r = await pedir('/whatsapp/repartir', { method: 'POST', token: tokenAdmin });
    assert.equal(r.status, 200, r.texto);
    assert.ok(r.json.asignadas >= 2, r.texto);
    const sla2 = (await db.query('SELECT asignado_a FROM wa_conversaciones WHERE id = $1', ['conv_sla_2'])).rows[0];
    assert.ok(sla2.asignado_a, 'la conversación sin asignar tiene que quedar con responsable');
  });

  // ---------- Fase 2: automatizaciones ----------
  await test('las automatizaciones crean tareas una sola vez', async () => {
    const cfg = await pedir('/whatsapp/automatizaciones', {
      method: 'PUT', token: tokenAdmin,
      body: { config: { seguimiento_presupuesto: { activo: true, dias: 1 }, retiro_pendiente: { activo: true, dias: 1 } } },
    });
    assert.equal(cfg.status, 200, cfg.texto);

    await db.query(`INSERT INTO wa_conversaciones (id, telefono, cliente_id, nombre_perfil, etapa, ultima_fecha, asignado_a)
      VALUES ('conv_auto_pres', '5491100000003', $1, 'Auto Presupuesto', 'presupuestado', now() - interval '3 days', 'admin@bertika.com')`,
      [clienteId]);
    const o = await pedir('/ordenes', {
      method: 'POST', token: tokenAdmin,
      body: { serie: `TEST-RETIRO-${Date.now()}`, cliente_id: clienteId, falla: 'Lista sin retirar' },
    });
    assert.equal(o.status, 201, o.texto);
    await db.query("UPDATE ordenes SET estado = 'ready', hora_entrega = now() - interval '4 days' WHERE id = $1", [o.json.id]);

    const primera = await pedir('/whatsapp/automatizaciones/revisar', { method: 'POST', token: tokenAdmin });
    assert.equal(primera.status, 200, primera.texto);
    assert.ok(primera.json.presupuesto >= 1, primera.texto);
    assert.ok(primera.json.retiro >= 1, primera.texto);

    const tarea = (await db.query("SELECT * FROM wa_tareas WHERE conversacion_id = 'conv_auto_pres' AND creada_por = 'automatizacion'")).rows[0];
    assert.ok(tarea, 'tiene que quedar la tarea de seguimiento');
    const tareaRetiro = (await db.query("SELECT * FROM wa_tareas WHERE orden_id = $1 AND creada_por = 'automatizacion'", [o.json.id])).rows[0];
    assert.ok(tareaRetiro, 'tiene que quedar la tarea de retiro');

    const segunda = await pedir('/whatsapp/automatizaciones/revisar', { method: 'POST', token: tokenAdmin });
    assert.equal(segunda.status, 200);
    assert.equal(segunda.json.presupuesto, 0, 'no duplica la tarea en la segunda pasada');
    assert.equal(segunda.json.retiro, 0);

    const lista = await pedir('/whatsapp/automatizaciones', { token: tokenAdmin });
    assert.equal(lista.status, 200);
    assert.equal(lista.json.config.seguimiento_presupuesto.dias, 1);
  });

  await test('un mensaje normal sale por WhatsApp y queda como enviado', async () => {
    const r = await pedir('/whatsapp/enviar', {
      method: 'POST', token: tokenAdmin, body: { telefono: '11 5555-1234', texto: 'Hola desde el test' },
    });
    assert.equal(r.status, 200, r.texto);
    assert.equal(r.json.estado, 'enviado');
    const msg = await db.query('SELECT estado, wa_message_id FROM wa_mensajes WHERE texto = $1 ORDER BY fecha DESC LIMIT 1', ['Hola desde el test']);
    assert.equal(msg.rows[0].estado, 'enviado');
    assert.ok(msg.rows[0].wa_message_id, 'guarda el id que devolvió Meta');
    const cola = await pedir('/whatsapp/envios?estado=enviado', { token: tokenAdmin });
    assert.ok(cola.json.filas.some((f) => f.texto === 'Hola desde el test'));
  });

  await test('un error definitivo de Meta queda fallido y no se reintenta solo', async () => {
    const r = await pedir('/whatsapp/enviar', {
      method: 'POST', token: tokenAdmin, body: { telefono: '11 5555-1234', texto: 'FALLA_DEFINITIVA' },
    });
    assert.equal(r.status, 400, r.texto);
    const cola = await pedir('/whatsapp/envios?estado=fallido', { token: tokenAdmin });
    const fila = cola.json.filas.find((f) => f.texto === 'FALLA_DEFINITIVA');
    assert.ok(fila, 'el mensaje tiene que quedar en la cola como fallido');
    assert.equal(fila.intentos, 1);
    assert.match(fila.ultimo_error, /escribirnos|ventana/i);
    const msg = await db.query('SELECT estado, error FROM wa_mensajes WHERE texto = $1 ORDER BY fecha DESC LIMIT 1', ['FALLA_DEFINITIVA']);
    assert.equal(msg.rows[0].estado, 'error');
  });

  await test('reintentar un envío fallido lo intenta de nuevo y lo informa', async () => {
    const cola = await pedir('/whatsapp/envios?estado=fallido', { token: tokenAdmin });
    const fila = cola.json.filas.find((f) => f.texto === 'FALLA_DEFINITIVA');
    const r = await pedir(`/whatsapp/envios/${fila.id}/reintentar`, { method: 'POST', token: tokenAdmin });
    assert.equal(r.status, 200, r.texto);
    assert.equal(r.json.estado, 'fallido', 'el error de datos sigue, pero se intentó de nuevo');
  });

  await test('un error transitorio queda en cola y el worker lo recupera', async () => {
    const r = await pedir('/whatsapp/enviar', {
      method: 'POST', token: tokenAdmin, body: { telefono: '11 5555-1234', texto: 'FALLA_TEMPORAL' },
    });
    assert.equal(r.status, 202, r.texto);
    assert.equal(r.json.enCola, true, 'la API avisa que quedó en cola');
    const cola = await pedir('/whatsapp/envios?estado=pendiente', { token: tokenAdmin });
    const fila = cola.json.filas.find((f) => f.texto === 'FALLA_TEMPORAL');
    assert.ok(fila, 'tiene que quedar pendiente de reintento');
    assert.ok(new Date(fila.proximo_intento).getTime() > Date.now(), 'espera antes de reintentar');
    // Se adelanta el reloj de la cola para no dormir un minuto en el test.
    await db.query('UPDATE wa_outbox SET proximo_intento = now() WHERE id = $1', [fila.id]);
    const p = await pedir('/whatsapp/envios/procesar', { method: 'POST', token: tokenAdmin });
    assert.equal(p.status, 200);
    assert.ok(p.json.enviados >= 1);
    const fin = await db.query('SELECT estado, intentos FROM wa_outbox WHERE id = $1', [fila.id]);
    assert.equal(fin.rows[0].estado, 'enviado');
    assert.equal(fin.rows[0].intentos, 2);
    const msg = await db.query('SELECT estado FROM wa_mensajes WHERE texto = $1 ORDER BY fecha DESC LIMIT 1', ['FALLA_TEMPORAL']);
    assert.equal(msg.rows[0].estado, 'enviado');
  });

  await test('un aviso automático también pasa por la cola y no se duplica', async () => {
    const cfg = await pedir('/whatsapp/avisos', {
      method: 'PUT', token: tokenAdmin,
      body: { activos: { received: true, quoted: false, ready: false, garantia: false } },
    });
    assert.equal(cfg.status, 200, cfg.texto);
    const serie = `TEST-AVISO-${Date.now()}`;
    const o = await pedir('/ordenes', {
      method: 'POST', token: tokenAdmin,
      body: { serie, cliente_id: clienteId, falla: 'Aviso de prueba' },
    });
    assert.equal(o.status, 201, o.texto);
    let fila = null;
    for (let i = 0; i < 50 && !fila; i += 1) {
      await sleep(100);
      const q = await db.query('SELECT * FROM wa_outbox WHERE aviso_orden_id = $1', [o.json.id]);
      fila = q.rows[0] || null;
    }
    assert.ok(fila, 'el aviso tiene que quedar en la cola');
    assert.equal(fila.tipo, 'plantilla');
    assert.equal(fila.plantilla, 'bateria_recibida');
    const p = await pedir('/whatsapp/envios/procesar', { method: 'POST', token: tokenAdmin });
    assert.equal(p.status, 200);
    const fin = await db.query('SELECT estado FROM wa_outbox WHERE id = $1', [fila.id]);
    assert.equal(fin.rows[0].estado, 'enviado');
    const log = await db.query('SELECT estado FROM wa_avisos_log WHERE orden_id = $1 AND plantilla = $2', [o.json.id, 'bateria_recibida']);
    assert.equal(log.rows[0].estado, 'enviado');
    const cuantos = await db.query('SELECT count(*)::int AS n FROM wa_outbox WHERE aviso_orden_id = $1', [o.json.id]);
    assert.equal(cuantos.rows[0].n, 1, 'un solo aviso por orden y plantilla');
  });

  await test('el export CSV neutraliza una fórmula de Excel', async () => {
    const conv = await db.query('SELECT id, telefono FROM wa_conversaciones ORDER BY id DESC LIMIT 1');
    assert.ok(conv.rows[0], 'tiene que existir la conversación del envío fallido');
    const idMsg = `wams_test_${Date.now()}`;
    await db.query(
      `INSERT INTO wa_mensajes (id, conversacion_id, direccion, telefono, tipo, texto, estado)
       VALUES ($1, $2, 'out', $3, 'text', '=1+1', 'enviado')`,
      [idMsg, conv.rows[0].id, conv.rows[0].telefono]
    );
    const r = await pedir('/whatsapp/export', { token: tokenAdmin });
    assert.equal(r.status, 200);
    assert.ok(r.texto.includes('"\'=1+1"'), 'la fórmula tiene que ir precedida por apóstrofo');
    assert.ok(r.texto.includes('conversacion'), 'tiene que traer el encabezado');
  });

  await test('cambiar una contraseña queda auditado sin guardar el hash', async () => {
    const r = await pedir('/usuarios/usr_tec01', {
      method: 'PATCH', token: tokenAdmin, body: { password: 'otraClave123' },
    });
    assert.equal(r.status, 200, r.texto);
    const a = await pedir('/auditoria?tabla=usuarios&registro_id=usr_tec01', { token: tokenAdmin });
    const fila = a.json.filas.find((f) => f.accion === 'editar');
    assert.ok(fila, 'el cambio de clave tiene que quedar auditado');
    const bruto = JSON.stringify(fila);
    assert.equal(bruto.includes('$2b$'), false, 'nunca se guarda el hash');
    assert.equal(bruto.includes('password_hash'), false);
    assert.match(fila.detalle, /contraseña/);
  });

  await test('la auditoría filtra por tabla y no inventa resultados', async () => {
    const vacia = await pedir('/auditoria?tabla=tabla_que_no_existe', { token: tokenAdmin });
    assert.equal(vacia.status, 200);
    assert.deepEqual(vacia.json.filas, []);
    const conDatos = await pedir('/auditoria?tabla=clientes', { token: tokenAdmin });
    assert.ok(conDatos.json.filas.length >= 1);
  });

  await test('el webhook rechaza un aviso sin firma', async () => {
    const res = await fetch(`${API}/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: [] }),
    });
    assert.equal(res.status, 403);
  });

  await test('el export completo sigue siendo solo del admin', async () => {
    const r = await pedir('/whatsapp/export', { token: tokenTec });
    assert.equal(r.status, 403);
  });

  await test('la salud ve la cola con el envío fallido', async () => {
    const r = await pedir('/salud', { token: tokenAdmin });
    assert.equal(r.status, 200);
    assert.ok(r.json.outbox.fallidos >= 1);
  });
}

try {
  await main();
} catch (e) {
  fallaron += 1;
  console.error(`\nError general: ${e.stack || e.message}`);
} finally {
  if (db) await db.end().catch(() => {});
  if (servidor) {
    servidor.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => servidor.once('exit', resolve)),
      sleep(3000),
    ]);
    if (servidor.exitCode === null) servidor.kill('SIGKILL');
  }
  if (mockMeta) await new Promise((resolve) => mockMeta.close(resolve));
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
}

console.log(`\n${pasaron} pruebas OK${fallaron ? ` · ${fallaron} fallaron` : ''}`);
process.exit(fallaron ? 1 : 0);
