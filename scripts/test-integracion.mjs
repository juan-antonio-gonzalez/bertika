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
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

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
      JWT_SECRET: 'test-secret-b3rt1k4-integracion-0123456789',
      PUBLIC_URL: BASE,
      UPLOAD_DIR,
      OUTBOX_WORKER: '0', // el test decide cuándo procesar la cola
      MONITOREO: '0',
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
