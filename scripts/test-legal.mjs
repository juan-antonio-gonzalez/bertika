// Tests de los documentos legales y su archivo de versiones.  npm test
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LEGAL_DOCS, LEGAL_META, textoLegalCanonico } from '../src/data/legal.js';

let pasaron = 0;
const test = (nombre, fn) => {
  try { fn(); pasaron += 1; console.log(`  ok  ${nombre}`); } catch (e) { console.error(`FALLA  ${nombre}\n      ${e.message}`); process.exitCode = 1; }
};

const sha = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');
const manifiesto = JSON.parse(readFileSync(path.resolve('public/legal/versiones/index.json'), 'utf8'));

console.log('\nDocumentos legales');

test('los tres documentos tienen versión, título y URL', () => {
  assert.deepEqual(Object.keys(LEGAL_DOCS).sort(), ['cookies', 'privacidad', 'terminos']);
  for (const [clave, doc] of Object.entries(LEGAL_DOCS)) {
    assert.match(doc.version, /^\d{4}-\d{2}-\d{2}$/, `${clave} tiene versión con formato fecha`);
    assert.ok(doc.titulo && doc.url.startsWith('/legal/'), `${clave} tiene título y URL`);
    assert.ok(doc.html.length > 1500, `${clave} tiene contenido suficiente`);
  }
  assert.equal(new Set(Object.values(LEGAL_DOCS).map((d) => d.version)).size, 1, 'los tres comparten versión');
  assert.equal(LEGAL_DOCS.privacidad.version, LEGAL_META.version);
});

test('los datos faltantes quedan marcados como en trámite', () => {
  assert.match(LEGAL_DOCS.privacidad.html, /en trámite/i);
  assert.match(LEGAL_DOCS.privacidad.html, /AAIP/);
  assert.match(LEGAL_DOCS.privacidad.html, new RegExp(LEGAL_META.emailPrivacidad.replace('.', '\\.')));
  assert.equal(LEGAL_META.razonSocial, 'en trámite');
  assert.equal(LEGAL_META.cuit, 'en trámite');
});

test('la privacidad cubre ley, retención y derechos', () => {
  assert.match(LEGAL_DOCS.privacidad.html, /25\.326/);
  assert.match(LEGAL_DOCS.privacidad.html, /5 años/);
  assert.match(LEGAL_DOCS.privacidad.html, /acceso, rectificación/i);
  assert.match(LEGAL_DOCS.privacidad.html, /WhatsApp/);
});

test('cookies declara las categorías y las claves reales', () => {
  assert.match(LEGAL_DOCS.cookies.html, /bertika-token/);
  assert.match(LEGAL_DOCS.cookies.html, /bertika-consent-v1/);
  assert.match(LEGAL_DOCS.cookies.html, /Medición/);
  assert.match(LEGAL_DOCS.cookies.html, /Marketing/);
  assert.match(LEGAL_DOCS.cookies.html, /desactivadas por defecto/);
});

test('términos cubre garantía, portal y jurisdicción', () => {
  assert.match(LEGAL_DOCS.terminos.html, /garantía/i);
  assert.match(LEGAL_DOCS.terminos.html, /portal de flotillas/i);
  assert.match(LEGAL_DOCS.terminos.html, /República Argentina/);
});

test('no se copió la identidad de otro proyecto', () => {
  const todo = Object.values(LEGAL_DOCS).map((d) => d.html).join('\n');
  assert.equal(/makerapps/i.test(todo), false, 'no debe quedar la marca MakerApps');
  assert.match(todo, /BERTIKA/);
});

test('el archivo de versiones coincide con el texto publicado', () => {
  assert.ok(Array.isArray(manifiesto) && manifiesto.length >= 1);
  const ultima = manifiesto[0];
  assert.equal(ultima.version, LEGAL_META.version);
  for (const [clave, doc] of Object.entries(LEGAL_DOCS)) {
    const entry = ultima.documentos.find((d) => d.clave === clave);
    assert.ok(entry, `falta ${clave} en el manifiesto`);
    assert.equal(entry.sha256, sha(textoLegalCanonico(doc.html)), `hash de ${clave}`);
    assert.equal(entry.url, `/legal/versiones/${LEGAL_META.version}/${clave}.html`);
  }
});

if (!process.exitCode) console.log(`\n${pasaron} pruebas legales OK`);
