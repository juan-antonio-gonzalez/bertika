// Pruebas de la política de contraseñas. Se ejecutan con `npm test`.
import assert from 'node:assert/strict';
import {
  PASSWORD_MIN, validarPassword, fortalezaPassword, generarPasswordSegura,
} from '../src/data/passwordPolicy.js';

let ok = 0;
const prueba = (nombre, fn) => {
  fn();
  ok += 1;
  console.log('  ok ', nombre);
};

console.log('Política de contraseñas');

prueba('rechaza vacías y cortas', () => {
  assert.ok(validarPassword(''));
  assert.ok(validarPassword('Ab1!'));
  assert.ok(validarPassword('Ab1!'.padEnd(PASSWORD_MIN - 1, 'x')));
});

prueba('rechaza claves comunes y secuencias', () => {
  assert.ok(validarPassword('password'));
  assert.ok(validarPassword('123456789012'));
  assert.ok(validarPassword('abcdefghijkl'));
  assert.ok(validarPassword('qwertyuiopas'));
});

prueba('rechaza datos personales y de la marca', () => {
  assert.ok(validarPassword('MiClave-Bertika-2026!', { email: 'juan@bertika.com' }));
  assert.ok(validarPassword('Juan-Clave-2026!', { email: 'juan@bertika.com', nombre: 'Juan' }));
  assert.ok(validarPassword('juan-Clave-2026!', { email: 'juan@bertika.com' }));
});

prueba('rechaza repeticiones largas y falta de clases', () => {
  assert.ok(validarPassword('aaaaaaaaaaaaaa'));
  assert.ok(validarPassword('sololetrasminusculas'));
});

prueba('acepta una clave larga y variada', () => {
  assert.equal(validarPassword('Segura-2026-Clave!'), null);
  assert.equal(validarPassword('UnaClaveMuyLarga2026SinSimbolos'), null);
});

prueba('el medidor distingue débil de fuerte', () => {
  assert.ok(fortalezaPassword('abc').score <= 1);
  assert.ok(fortalezaPassword('Segura-2026-Clave!').score >= 3);
});

prueba('el generador produce claves válidas y variadas', () => {
  const vistas = new Set();
  for (let i = 0; i < 100; i += 1) {
    const p = generarPasswordSegura(18);
    assert.equal(validarPassword(p), null);
    assert.ok(p.length >= 18);
    vistas.add(p);
  }
  assert.equal(vistas.size, 100);
});

console.log(`\n${ok} pruebas de contraseñas OK`);
