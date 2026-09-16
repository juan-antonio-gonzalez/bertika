// Bertika - Código de seguimiento.
// Unico e irrepetible: 16 digitos aleatorios con chequeo de unicidad.
// Los guiones son solo de presentacion (XXXX-XXXX-XXXX-XXXX); en la base
// se guardan los 16 digitos puros.

import { randomInt } from 'node:crypto';

const DIGITOS = 16;

export function generarCodigo() {
  let s = '';
  for (let i = 0; i < DIGITOS; i++) s += String(randomInt(0, 10));
  return s;
}

// Garantiza unicidad reintentando mientras "yaExiste(codigo)" devuelva true.
export async function generarCodigoUnico(yaExiste) {
  for (let i = 0; i < 50; i++) {
    const c = generarCodigo();
    if (!(await yaExiste(c))) return c;
  }
  throw new Error('No se pudo generar un codigo de seguimiento unico');
}

// Solo digitos (los 16 internos).
export function digitar(c) {
  return String(c || '').replace(/\D/g, '').slice(0, DIGITOS);
}

// Formato visible: XXXX-XXXX-XXXX-XXXX
export function formatearCodigo(c) {
  return digitar(c).replace(/(.{4})/g, '$1-').replace(/-$/, '');
}