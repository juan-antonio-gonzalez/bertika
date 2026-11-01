// Prueba el adaptador S3/R2 contra un servidor S3 simulado local.
// No reemplaza una prueba con un bucket real, pero valida firma y flujo HTTP.
import assert from 'node:assert/strict';
import http from 'node:http';

const objetos = new Map();
let autorizaciones = 0;
const server = http.createServer((req, res) => {
  const key = decodeURIComponent(req.url.split('/').slice(2).join('/'));
  if (!req.headers.authorization?.startsWith('AWS4-HMAC-SHA256')) {
    res.writeHead(403); res.end('sin firma'); return;
  }
  autorizaciones += 1;
  if (req.method === 'PUT') {
    const partes = [];
    req.on('data', (p) => partes.push(p));
    req.on('end', () => { objetos.set(key, Buffer.concat(partes)); res.writeHead(200); res.end(); });
    return;
  }
  if (req.method === 'GET') {
    const data = objetos.get(key);
    if (!data) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(data); return;
  }
  if (req.method === 'DELETE') { objetos.delete(key); res.writeHead(204); res.end(); return; }
  res.writeHead(405); res.end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const puerto = server.address().port;

process.env.STORAGE_DRIVER = 's3';
process.env.S3_ENDPOINT = `http://127.0.0.1:${puerto}`;
process.env.S3_BUCKET = 'bertika-test';
process.env.S3_REGION = 'auto';
process.env.S3_ACCESS_KEY_ID = 'clave-prueba';
process.env.S3_SECRET_ACCESS_KEY = 'secreto-prueba';
process.env.S3_PUBLIC_BASE = 'https://cdn.test';
const storage = await import('../api/storage.js');

const buffer = Buffer.from('contenido-de-prueba');
const publico = await storage.guardarPublico('chat-prueba.png', buffer);
assert.equal(publico.url, 'https://cdn.test/chat-prueba.png');
assert.equal(objetos.get('chat-prueba.png').toString(), 'contenido-de-prueba');

const privado = await storage.guardarPrivado('adj-prueba.pdf', buffer);
assert.equal(privado.key, 'adj-prueba.pdf');
assert.equal((await storage.leerPrivado('adj-prueba.pdf')).toString(), 'contenido-de-prueba');
assert.equal((await storage.leerMedia('chat-prueba.png')).toString(), 'contenido-de-prueba');
await storage.borrarPrivado('adj-prueba.pdf');
assert.equal(objetos.has('adj-prueba.pdf'), false);
assert.ok(autorizaciones >= 5, 'el servidor simulado tiene que ver firmas SigV4');

await new Promise((resolve) => server.close(resolve));
console.log('5 pruebas de storage S3/R2 OK');
