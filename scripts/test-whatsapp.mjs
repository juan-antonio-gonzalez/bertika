// Tests del canal de WhatsApp (sin llamar a Meta de verdad: fetch simulado).
// Sin dependencias:  npm test
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  configWhatsApp, configPublicaWhatsApp, normalizarTelefono, enviarTexto, enviarPlantilla, verificarFirma, mensajeDeError,
  normalizarEtiquetas, listaEtiquetas,
} from '../api/whatsapp.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};
const asyncTest = async (nombre, fn) => {
  try { await fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

console.log('\nConfiguración del canal');
test('sin variables cargadas el canal queda apagado (no rompe)', () => {
  const previo = { ...process.env };
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_ID;
  const c = configWhatsApp();
  assert.equal(c.configurado, false);
  assert.equal(c.numeroIdCorto, '');
  Object.assign(process.env, previo);
});
test('con token y número queda configurado y no expone la clave', () => {
  const previo = { ...process.env };
  process.env.WHATSAPP_TOKEN = 'EAAG-secreto';
  process.env.WHATSAPP_PHONE_ID = '123456789012345';
  process.env.WHATSAPP_WABA_ID = '987654321';
  process.env.WHATSAPP_APP_SECRET = 'secreto-app';
  process.env.WHATSAPP_VERIFY_TOKEN = 'frase-verificacion';
  assert.equal(configWhatsApp().configurado, true);
  const publica = configPublicaWhatsApp();
  assert.equal(publica.configurado, true);
  assert.equal(publica.numeroIdCorto, '1234…345');
  assert.deepEqual(publica.falta, []);
  const texto = JSON.stringify(publica);
  for (const secreto of ['EAAG-secreto', 'secreto-app', 'frase-verificacion']) {
    assert.equal(texto.includes(secreto), false, `la config publica no debe incluir ${secreto}`);
  }
  Object.assign(process.env, previo);
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_ID;
  delete process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_VERIFY_TOKEN;
});
test('la config publica lista lo que falta configurar', () => {
  const previo = { ...process.env };
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_ID;
  delete process.env.WHATSAPP_WABA_ID;
  delete process.env.WHATSAPP_VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
  assert.deepEqual(configPublicaWhatsApp().falta, ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'WHATSAPP_WABA_ID', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET']);
  Object.assign(process.env, previo);
});

console.log('\nTeléfonos');
test('los teléfonos locales se convierten al formato internacional', () => {
  assert.equal(normalizarTelefono('11 5555-0101'), '5491155550101');
  assert.equal(normalizarTelefono('+54 9 11 5555-0101'), '5491155550101');
  assert.equal(normalizarTelefono('5491155550101'), '5491155550101');
  assert.equal(normalizarTelefono('91155550101'), '5491155550101');
  assert.equal(normalizarTelefono(''), '');
  assert.equal(normalizarTelefono(null), '');
});

console.log('\nEnvío de mensajes');
const respuestaOk = (id = 'wamid.TEST') => ({ ok: true, json: async () => ({ messages: [{ id }] }) });
const respuestaError = (code, message = 'error de Meta') => ({ ok: false, json: async () => ({ error: { code, message } }) });

await asyncTest('envía un texto con el formato que pide Meta', async () => {
  process.env.WHATSAPP_TOKEN = 'token-de-prueba';
  process.env.WHATSAPP_PHONE_ID = '999';
  let capturado = null;
  const fetchImpl = async (url, opts) => { capturado = { url, opts, body: JSON.parse(opts.body) }; return respuestaOk(); };
  const r = await enviarTexto({ to: '11 5555-0101', texto: 'Tu batería está lista', fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.id, 'wamid.TEST');
  assert.match(capturado.url, /graph\.facebook\.com\/v.+\/999\/messages$/);
  assert.equal(capturado.opts.headers.Authorization, 'Bearer token-de-prueba');
  assert.equal(capturado.body.to, '5491155550101');
  assert.equal(capturado.body.type, 'text');
  assert.equal(capturado.body.text.body, 'Tu batería está lista');
  assert.equal(capturado.body.messaging_product, 'whatsapp');
});
await asyncTest('rechaza un envío sin teléfono o sin texto sin llamar a Meta', async () => {
  let llamado = false;
  const fetchImpl = async () => { llamado = true; return respuestaOk(); };
  assert.equal((await enviarTexto({ to: '', texto: 'hola', fetchImpl })).ok, false);
  assert.equal((await enviarTexto({ to: '1155550101', texto: '  ', fetchImpl })).ok, false);
  assert.equal(llamado, false);
});
await asyncTest('envía una plantilla con sus variables', async () => {
  let capturado = null;
  const fetchImpl = async (url, opts) => { capturado = JSON.parse(opts.body); return respuestaOk('wamid.TPL'); };
  const r = await enviarPlantilla({ to: '1155550101', nombre: 'bateria_lista', idioma: 'es_AR', parametros: ['BAT-1234'], fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(capturado.type, 'template');
  assert.equal(capturado.template.name, 'bateria_lista');
  assert.equal(capturado.template.language.code, 'es_AR');
  assert.deepEqual(capturado.template.components[0].parameters, [{ type: 'text', text: 'BAT-1234' }]);
});
await asyncTest('traduce el error de la ventana de 24 h', async () => {
  const r = await enviarTexto({ to: '1155550101', texto: 'hola', fetchImpl: async () => respuestaError(131047, 'Re-engagement message') });
  assert.equal(r.ok, false);
  assert.match(r.error, /24 h/);
  assert.match(r.error, /plantilla aprobada/);
  assert.equal(r.code, 131047);
});
await asyncTest('traduce token vencido y número inválido', async () => {
  assert.match(mensajeDeError({ code: 190, message: 'Invalid OAuth' }), /token|clave/i);
  assert.match(mensajeDeError({ code: 131026 }), /no puede recibir/i);
  assert.match(mensajeDeError({ code: 132000 }), /plantilla/i);
});
await asyncTest('explica que el número no está en la lista de autorizados', async () => {
  const r = mensajeDeError({ code: 131030, message: 'Recipient phone number not in allowed list' });
  assert.match(r, /no está autorizado/i);
  assert.match(r, /lista de destinatarios/i);
});
await asyncTest('si Meta no responde, avisa sin romper', async () => {
  const fetchImpl = async () => { const e = new Error('boom'); e.name = 'AbortError'; throw e; };
  const r = await enviarTexto({ to: '1155550101', texto: 'hola', fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.error, /no respondió|conectar/i);
});

console.log('\nEtiquetas del CRM (bandeja)');
test('normaliza las etiquetas: sin repetidas, sin vacías y con tope', () => {
  assert.equal(normalizarEtiquetas('presupuesto, garantia'), 'presupuesto, garantia');
  assert.equal(normalizarEtiquetas('  Presupuesto ,, presupuesto ,  GARANTIA '), 'Presupuesto, GARANTIA');
  assert.equal(normalizarEtiquetas(['a', 'b', 'a']), 'a, b');
  assert.equal(normalizarEtiquetas(''), '');
  assert.equal(normalizarEtiquetas(null), '');
  assert.equal(normalizarEtiquetas(',,,,'), '');
  const muchas = normalizarEtiquetas(Array.from({ length: 20 }, (_, i) => `t${i}`));
  assert.equal(muchas.split(', ').length, 8, 'como máximo 8 etiquetas');
  const larga = normalizarEtiquetas('x'.repeat(80));
  assert.equal(larga.length, 24, 'cada etiqueta se recorta a 24 caracteres');
  assert.deepEqual(listaEtiquetas('uno, dos'), ['uno', 'dos']);
  assert.deepEqual(listaEtiquetas(null), []);
});

console.log('\nFirma de los avisos de Meta (webhook)');
test('acepta la firma correcta y rechaza la alterada', () => {
  const secreto = 'secreto-de-app';
  const cuerpo = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));
  const firma = `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;
  assert.equal(verificarFirma(cuerpo, firma, secreto).ok, true);
  assert.equal(verificarFirma(cuerpo, 'sha256=deadbeef', secreto).ok, false);
  assert.equal(verificarFirma(cuerpo, '', secreto).ok, false);
  assert.equal(verificarFirma(cuerpo, firma, '').ok, false);
  assert.equal(verificarFirma(Buffer.from('otro cuerpo'), firma, secreto).ok, false);
});

console.log(`\n${pasaron} tests OK${process.exitCode ? ' (con fallas)' : ''}\n`);
