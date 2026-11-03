// E2E de navegador (smoke de solo lectura) para login, menú y Listas.
//
// Requiere Chrome/Chromium instalado y credenciales por entorno:
//   BERTIKA_UI_EMAIL=... BERTIKA_UI_PASSWORD=... node scripts/test-ui-e2e.mjs
// Opcional:
//   BERTIKA_UI_BASE=https://bertika.com   CHROME_PATH=/ruta/a/chrome
//
// No crea ni modifica datos: solo verifica que la interfaz cargue y navegue.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = (process.env.BERTIKA_UI_BASE || 'https://bertika.com').replace(/\/$/, '');
const EMAIL = process.env.BERTIKA_UI_EMAIL || '';
const PASSWORD = process.env.BERTIKA_UI_PASSWORD || '';
const CHROME = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((p) => existsSync(p));

if (!EMAIL || !PASSWORD) {
  console.error('Faltan BERTIKA_UI_EMAIL / BERTIKA_UI_PASSWORD.');
  process.exit(2);
}
if (!CHROME) {
  console.error('No encontré Chrome/Chromium. Seteá CHROME_PATH.');
  process.exit(2);
}

const PORT = Number(process.env.BERTIKA_UI_DEBUG_PORT || 9333);
const PERFIL = mkdtempSync(path.join(os.tmpdir(), 'bertika-ui-e2e-'));
const SHOT = path.join(os.tmpdir(), 'bertika-ui-e2e.png');
const SHOT_PROSPECTOS = path.join(os.tmpdir(), 'bertika-prospectos.png');
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--user-data-dir=${PERFIL}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let seq = 0;
const pendientes = new Map();
const errores = [];

async function conectar() {
  let version;
  for (let i = 0; i < 80; i += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      break;
    } catch { await sleep(150); }
  }
  if (!version) throw new Error('Chrome no abrió el puerto de depuración.');
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`${BASE}/auth`)}`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) {
      const { res, rej } = pendientes.get(m.id);
      pendientes.delete(m.id);
      if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  });
}

function send(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++seq;
    pendientes.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluar(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'Error evaluando en la página');
  return r.result?.value;
}

async function navegar(url) {
  await send('Page.navigate', { url });
  await sleep(500);
}

async function esperar(expresion, etiqueta, timeout = 15000) {
  const hasta = Date.now() + timeout;
  while (Date.now() < hasta) {
    if (await evaluar(expresion)) return;
    await sleep(250);
  }
  throw new Error(`Timeout esperando: ${etiqueta}`);
}

async function escribir(selector, valor) {
  const ok = await evaluar(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(valor)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`No encontré el campo ${selector}`);
}

async function cerrar() {
  try { ws?.close(); } catch {}
  chrome.kill('SIGKILL');
  try { rmSync(PERFIL, { recursive: true, force: true }); } catch {}
}

let paso = 'inicio';
try {
  await conectar();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await sleep(3000);

  paso = 'login';
  await evaluar(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().toLowerCase().includes('rechazar todas')); if (b) b.click(); return !!b; })()`);
  await sleep(300);
  await escribir('input[type="text"]', EMAIL);
  await escribir('input[type="password"]', PASSWORD);
  const enviado = await evaluar(`(() => { const b = [...document.querySelectorAll('form button')].find((x) => x.textContent.includes('Ingresar')); if (!b) return false; b.click(); return true; })()`);
  if (!enviado) throw new Error('No encontré el botón Ingresar.');
  await esperar('!!document.querySelector(".shell-nav")', 'menú después del login', 20000);

  paso = 'listas del taller';
  await navegar(`${BASE}/listas/taller`);
  await esperar('document.querySelectorAll(".area-lista-card").length > 0', 'tarjetas de listas');
  const tarjetas = await evaluar('document.querySelectorAll(".area-lista-card").length');
  if (tarjetas < 3) throw new Error(`Se esperaban al menos 3 listas de Taller; hay ${tarjetas}.`);
  await evaluar(`(() => { document.querySelector('.area-lista-card').click(); return true; })()`);
  await esperar('!!document.querySelector(".tab")', 'vista de la lista');
  await esperar('!!document.querySelector(".busqueda-listas") || !!document.querySelector(".listas-toolbar")', 'toolbar de la lista');

  paso = 'búsqueda global';
  await navegar(`${BASE}/listas`);
  await esperar('!!document.querySelector(".busqueda-listas input")', 'buscador global');
  await escribir('.busqueda-listas input', 'Taller');
  await evaluar(`(() => { const b = [...document.querySelectorAll('.busqueda-listas button')].find((x) => x.textContent.includes('Buscar')); if (b) b.click(); return true; })()`);
  await sleep(600);

  paso = 'whatsapp web';
  await navegar(`${BASE}/hub/whatsapp`);
  await esperar('!!document.querySelector(".wa-panel")', 'bandeja de WhatsApp');
  await esperar('!!document.querySelector(".wa-composer") || document.body.innerText.includes("Elegí una conversación")', 'compositor o estado vacío');

  paso = 'ventas';
  await navegar(`${BASE}/ventas`);
  await esperar("document.body.innerText.toLowerCase().includes('pipeline abierto')", 'pantalla de Ventas', 30000);
  await esperar('!!document.querySelector(".ventas-pipeline") || document.body.innerText.includes("Nueva oportunidad")', 'pipeline de Ventas');

  paso = 'prospectos';
  await navegar(`${BASE}/prospectos`);
  await esperar("document.body.innerText.includes('Prospectos') && document.body.innerText.includes('Nuevo prospecto')", 'pantalla de Prospectos', 30000);
  await esperar('!!document.querySelector("table.tbl") || document.body.innerText.includes("No hay prospectos")', 'tabla o estado vacío de Prospectos');
  { const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(SHOT_PROSPECTOS, Buffer.from(data, 'base64')); }

  paso = 'buscador del menú';
  await escribir('.shell-menu-search input', 'Taller');
  await sleep(500);
  const menu = await evaluar(`document.querySelector('.shell-nav')?.innerText || ''`);
  if (!/Taller/i.test(menu)) throw new Error('El buscador del menú no muestra Taller.');

  paso = 'excepciones';
  if (errores.length) throw new Error(`Errores de JavaScript en la página:\n${errores.slice(-3).join('\n')}`);

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(SHOT, Buffer.from(data, 'base64'));
  console.log(`OK E2E UI · login, ${tarjetas} listas de Taller, vista de lista, búsqueda global y menú.`);
  console.log(`Captura: ${SHOT}`);
  console.log(`Captura Prospectos: ${SHOT_PROSPECTOS}`);
  process.exitCode = 0;
} catch (e) {
  try {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(SHOT, Buffer.from(data, 'base64'));
  } catch {}
  console.error(`FALLA E2E UI en "${paso}": ${e.message}`);
  console.error(`Captura: ${SHOT}`);
  process.exitCode = 1;
} finally {
  await cerrar();
}
