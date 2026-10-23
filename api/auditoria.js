// Bertika - Auditoria generica de cambios.
//
// Guarda QUIEN cambio QUE, cuando y desde donde. Es la respuesta a "esto antes
// decia otra cosa" y a "quien borro este cliente".
//
// Reglas:
//   - Nunca se guardan contrasenas, hashes, tokens ni secretos (se redactan).
//   - Se guarda solo lo que cambio (no la ficha entera) y con un tope de tamano.
//   - Registrar la auditoria NO puede voltear la operacion del taller: si la
//     tabla falla, queda el error en el log y la accion sigue.

import { randomUUID } from 'node:crypto';
import { query } from './db.js';

const MAX_TEXTO = 2000;
const MAX_ITEMS = 100;
const CLAVE_SECRETA = /(password|passwd|hash|token|secret|authorization|jwt|cookie|clave|api[_-]?key)/i;

function sanear(valor, nivel = 0) {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'string') {
    return valor.length > MAX_TEXTO ? `${valor.slice(0, MAX_TEXTO)}…` : valor;
  }
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;
  if (nivel >= 4) return '[…]';
  if (Array.isArray(valor)) {
    return valor.slice(0, MAX_ITEMS).map((v) => sanear(v, nivel + 1));
  }
  if (typeof valor === 'object') {
    const salida = {};
    for (const [k, v] of Object.entries(valor)) {
      if (CLAVE_SECRETA.test(k)) { salida[k] = '[redactado]'; continue; }
      salida[k] = sanear(v, nivel + 1);
    }
    return salida;
  }
  return String(valor).slice(0, MAX_TEXTO);
}

// Compara dos versiones y devuelve solo los campos que cambiaron.
// `campos` queda como resumen legible en la pantalla.
export function diferencias(antes, despues) {
  const a = antes && typeof antes === 'object' ? antes : null;
  const d = despues && typeof despues === 'object' ? despues : null;
  if (!a) return { campos: d ? Object.keys(d).slice(0, 40) : [], antes: null, despues: sanear(d) };
  if (!d) return { campos: Object.keys(a).slice(0, 40), antes: sanear(a), despues: null };
  const campos = [];
  const soloAntes = {};
  const soloDespues = {};
  const claves = new Set([...Object.keys(a), ...Object.keys(d)]);
  for (const k of claves) {
    if (CLAVE_SECRETA.test(k)) continue;
    if (JSON.stringify(a[k]) === JSON.stringify(d[k])) continue;
    campos.push(k);
    soloAntes[k] = sanear(a[k]);
    soloDespues[k] = sanear(d[k]);
  }
  return { campos, antes: soloAntes, despues: soloDespues };
}

// Inserta una fila. Si se pasa `client` (una transaccion), usa esa conexion.
// `req` es opcional: de ahi salen actor, rol, IP y request-id.
export async function registrarAuditoria({
  req = null, client = null, tabla, registroId = null, accion,
  antes = null, despues = null, detalle = null, campos = null,
}) {
  const actor = req?.user || {};
  const diff = diferencias(antes, despues);
  const id = `aud_${randomUUID()}`;
  const sql = `INSERT INTO auditoria
      (id, actor, actor_id, rol, ip, tabla, registro_id, accion, campos, antes, despues, detalle, request_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13)`;
  const params = [
    id,
    actor.email || 'sistema',
    actor.sub || actor.id || null,
    actor.rol || null,
    req?.ip || null,
    String(tabla || 'desconocida').slice(0, 40),
    registroId ? String(registroId).slice(0, 80) : null,
    String(accion || 'cambio').slice(0, 40),
    campos ? String(campos).slice(0, 400) : diff.campos.join(', ').slice(0, 400),
    JSON.stringify(diff.antes),
    JSON.stringify(diff.despues),
    detalle ? String(detalle).slice(0, 500) : null,
    req?.requestId || null,
  ];
  if (client && typeof client.query === 'function') {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
  return id;
}

// Version "que nunca rompe": para usar dentro de endpoints normales.
export async function auditar(datos) {
  try {
    return await registrarAuditoria(datos);
  } catch (e) {
    console.error('[auditoria] no se pudo registrar el cambio:', e.message);
    return null;
  }
}

// Listado para la pantalla, con filtros simples y tope duro.
export async function listarAuditoria({ tabla, registroId, actor, desde, hasta, limite = 200 } = {}) {
  const cond = [];
  const args = [];
  const lim = Math.max(1, Math.min(Number(limite) || 200, 500));
  if (tabla) { args.push(String(tabla).slice(0, 40)); cond.push(`tabla = $${args.length}`); }
  if (registroId) { args.push(String(registroId).slice(0, 80)); cond.push(`registro_id = $${args.length}`); }
  if (actor) { args.push(`%${String(actor).slice(0, 120)}%`); cond.push(`actor ILIKE $${args.length}`); }
  if (desde) { args.push(desde); cond.push(`fecha >= $${args.length}`); }
  if (hasta) { args.push(hasta); cond.push(`fecha <= $${args.length}`); }
  args.push(lim);
  const filas = await query(
    `SELECT id, fecha, actor, rol, ip, tabla, registro_id, accion, campos, antes, despues, detalle, request_id
       FROM auditoria
      ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
      ORDER BY fecha DESC
      LIMIT $${args.length}`,
    args
  );
  return filas;
}
