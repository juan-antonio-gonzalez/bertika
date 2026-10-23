// Bertika - Outbox de WhatsApp.
//
// Todo mensaje que sale del taller se guarda PRIMERO en `wa_outbox` y recien
// despues se manda. Si Meta falla por red, 429 o 5xx, se reintenta solo con
// backoff; si el error es de datos (plantilla, numero, ventana de 24 h) no se
// insiste. Cada intento queda visible en el panel (Sistema -> Envios).
//
// Por que existe: antes el envio era sincronico. Si Meta tardaba o se caia, el
// mensaje quedaba en `wa_mensajes` con estado "error" y nadie lo reintentaba:
// el cliente no recibia el aviso y el taller no se enteraba hasta el reclamo.
//
// Un timeout se marca "incierto" y NO se reintenta solo: la peticion pudo
// haber llegado. Un humano decide desde el panel (evita mandar dos veces).

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, one } from './db.js';
import { enviarTexto, enviarPlantilla, enviarImagen, enviarDocumento, subirMedia } from './whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MAX_INTENTOS = 4;
export const ESTADOS_OUTBOX = ['pendiente', 'enviando', 'enviado', 'fallido', 'incierto'];

// Espera entre intentos automaticos: 1 min, 5 min, 15 min.
const ESPERAS_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];

// Errores de Meta que sí mejoran reintentando (servicio caído / límite temporal).
const CODIGOS_TRANSITORIOS = new Set([1, 2, 4, 17, 32, 613, 131000, 131016, 131042, 131048, 131056]);

// Codigos que no se arreglan solos: token vencido, plantilla, numero, 24 h.
const CODIGOS_DEFINITIVOS = new Set([100, 102, 190, 131026, 131030, 131047, 132000, 132001, 133010]);

// Que hacer con la respuesta de Meta. Exportada para poder probarla sin red.
export function decidirResultado(envio = {}) {
  if (envio.ok) return 'enviado';
  if (envio.incierto) return 'incierto';
  const code = Number(envio.code) || 0;
  if (envio.transitorio || CODIGOS_TRANSITORIOS.has(code)) return 'reintentar';
  if (CODIGOS_DEFINITIVOS.has(code)) return 'fallido';
  return 'fallido';
}

export async function encolar({
  conversacionId, telefono, tipo = 'texto', texto = null, plantilla = null,
  idioma = 'es_AR', parametros = [], mediaPath = null, mediaMime = null,
  mediaNombre = null, mensajeId = null, avisoOrdenId = null, avisoPlantilla = null,
} = {}) {
  const destino = String(telefono || '').trim();
  if (!destino) throw new Error('Falta el teléfono del envío');
  const id = `wout_${randomUUID()}`;
  try {
    await query(
      `INSERT INTO wa_outbox
         (id, conversacion_id, telefono, tipo, texto, plantilla, idioma, parametros,
          media_path, media_mime, media_nombre, mensaje_id, aviso_orden_id, aviso_plantilla)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14)`,
      [
        id, conversacionId || null, destino, tipo, texto, plantilla, idioma,
        JSON.stringify(Array.isArray(parametros) ? parametros : []),
        mediaPath, mediaMime, mediaNombre, mensajeId, avisoOrdenId, avisoPlantilla,
      ]
    );
  } catch (e) {
    // El indice unico de avisos puede rechazar un duplicado si dos procesos
    // intentaron encolar el mismo aviso a la vez: se reutiliza el que ya esta.
    if (e.code === '23505' && avisoOrdenId && avisoPlantilla) {
      const existente = await one(
        `SELECT id FROM wa_outbox
          WHERE aviso_orden_id = $1 AND aviso_plantilla = $2
            AND estado IN ('pendiente', 'enviando', 'incierto')
          ORDER BY creado_en DESC LIMIT 1`,
        [avisoOrdenId, avisoPlantilla]
      );
      if (existente) return existente.id;
    }
    throw e;
  }
  return id;
}

function rutaMediaSegura(mediaPath) {
  const base = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
  const ruta = path.resolve(String(mediaPath || ''));
  return ruta.startsWith(`${base}${path.sep}`) ? ruta : null;
}

async function enviarFila(fila) {
  if (fila.tipo === 'plantilla') {
    return enviarPlantilla({
      to: fila.telefono,
      nombre: fila.plantilla,
      idioma: fila.idioma || 'es_AR',
      parametros: Array.isArray(fila.parametros) ? fila.parametros : [],
    });
  }
  if (fila.tipo === 'texto') {
    return enviarTexto({ to: fila.telefono, texto: fila.texto });
  }
  if (fila.tipo === 'imagen' || fila.tipo === 'documento') {
    const ruta = rutaMediaSegura(fila.media_path);
    if (!ruta) return { ok: false, error: 'El archivo adjunto ya no está disponible.' };
    let buffer;
    try {
      buffer = await readFile(ruta);
    } catch {
      return { ok: false, error: 'El archivo adjunto ya no está disponible en el servidor.' };
    }
    const subida = await subirMedia({ buffer, mime: fila.media_mime || 'application/octet-stream', nombre: fila.media_nombre || 'archivo' });
    if (!subida.ok) return subida;
    return fila.tipo === 'imagen'
      ? enviarImagen({ to: fila.telefono, mediaId: subida.id, texto: fila.texto || '' })
      : enviarDocumento({ to: fila.telefono, mediaId: subida.id, texto: fila.texto || '', nombre: fila.media_nombre || 'documento.pdf' });
  }
  return { ok: false, error: `Tipo de envío desconocido: ${fila.tipo}` };
}

// Reclama un envio pendiente de forma atomica. SKIP LOCKED permite que dos
// procesos (o dos ticks del worker) no manden el mismo mensaje.
async function reclamarSiguiente() {
  return one(
    `UPDATE wa_outbox
        SET estado = 'enviando', intentos = intentos + 1, actualizado_en = now()
      WHERE id = (
        SELECT id FROM wa_outbox
         WHERE estado = 'pendiente' AND proximo_intento <= now()
         ORDER BY creado_en ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING *`
  );
}

async function reclamarPorId(id) {
  return one(
    `UPDATE wa_outbox
        SET estado = 'enviando', intentos = intentos + 1, actualizado_en = now()
      WHERE id = $1 AND estado = 'pendiente'
      RETURNING *`,
    [id]
  );
}

async function marcarMensaje(mensajeId, estado, error = null, waMessageId = null) {
  if (!mensajeId) return;
  try {
    await query(
      `UPDATE wa_mensajes
          SET estado = $2, error = $3, wa_message_id = COALESCE($4, wa_message_id)
        WHERE id = $1`,
      [mensajeId, estado, error, waMessageId]
    );
  } catch (e) {
    // El mensaje ya se mandó: si falla el UPDATE del espejo en la bandeja no
    // se puede revertir el envío. Queda en el log y la cola conserva el estado.
    console.error('[outbox] no se pudo actualizar el mensaje de la bandeja:', e.message);
  }
}

async function cerrarAviso(fila, ok) {
  if (!fila.aviso_orden_id || !fila.aviso_plantilla) return;
  try {
    if (ok) {
      await query(
        "UPDATE wa_avisos_log SET estado = 'enviado', error = NULL, fecha = now() WHERE orden_id = $1 AND plantilla = $2",
        [fila.aviso_orden_id, fila.aviso_plantilla]
      );
    } else {
      // Se libera para que el proximo cambio de estado pueda volver a intentarlo.
      await query('DELETE FROM wa_avisos_log WHERE orden_id = $1 AND plantilla = $2', [fila.aviso_orden_id, fila.aviso_plantilla]);
    }
  } catch (e) {
    console.error('[outbox] no se pudo cerrar la reserva del aviso:', e.message);
  }
}

async function aplicarResultado(fila, envio) {
  const accion = decidirResultado(envio);
  const error = envio?.error || null;
  const intentos = Number(fila.intentos) || 1;

  if (accion === 'enviado') {
    await query(
      "UPDATE wa_outbox SET estado = 'enviado', ultimo_error = NULL, wa_message_id = $2, actualizado_en = now() WHERE id = $1",
      [fila.id, envio.id || null]
    );
    await marcarMensaje(fila.mensaje_id, 'enviado', null, envio.id || null);
    await cerrarAviso(fila, true);
    return { ok: true, estado: 'enviado', waMessageId: envio.id || null, intentos };
  }

  if (accion === 'reintentar' && intentos < MAX_INTENTOS) {
    const espera = ESPERAS_MS[Math.min(intentos - 1, ESPERAS_MS.length - 1)];
    await query(
      `UPDATE wa_outbox
          SET estado = 'pendiente',
              proximo_intento = now() + ($2::int * interval '1 millisecond'),
              ultimo_error = $3,
              actualizado_en = now()
        WHERE id = $1`,
      [fila.id, espera, error]
    );
    await marcarMensaje(fila.mensaje_id, 'reintentando', error);
    return { ok: false, estado: 'pendiente', reintentando: true, error, intentos };
  }

  if (accion === 'incierto') {
    await query(
      "UPDATE wa_outbox SET estado = 'incierto', ultimo_error = $2, actualizado_en = now() WHERE id = $1",
      [fila.id, error]
    );
    await marcarMensaje(fila.mensaje_id, 'sin confirmar', error);
    return { ok: false, estado: 'incierto', error, intentos };
  }

  // Fallo definitivo o se agotaron los intentos.
  await query(
    "UPDATE wa_outbox SET estado = 'fallido', ultimo_error = $2, actualizado_en = now() WHERE id = $1",
    [fila.id, error]
  );
  await marcarMensaje(fila.mensaje_id, 'error', error);
  await cerrarAviso(fila, false);
  return { ok: false, estado: 'fallido', error, intentos };
}

async function ejecutar(fila) {
  let envio;
  try {
    envio = await enviarFila(fila);
  } catch (e) {
    envio = { ok: false, error: e.message, transitorio: true };
  }
  return aplicarResultado(fila, envio);
}

// Procesa un envio concreto (lo usan los endpoints para dar respuesta inmediata).
export async function procesarEnvio(id) {
  const fila = await reclamarPorId(id);
  if (!fila) {
    const actual = await one('SELECT estado, ultimo_error, intentos FROM wa_outbox WHERE id = $1', [id]);
    if (!actual) return { ok: false, estado: 'desconocido', error: 'Envío no encontrado' };
    // Si el worker se adelantó y lo está mandando, el pedido no falló: queda en cola.
    if (actual.estado === 'enviando') {
      return { ok: true, estado: 'pendiente', reintentando: true, intentos: actual.intentos };
    }
    return { ok: actual.estado === 'enviado', estado: actual.estado, error: actual.ultimo_error, intentos: actual.intentos };
  }
  return ejecutar(fila);
}

// Si el proceso se reinició en medio de un envío, la fila queda "enviando" para
// siempre. Se marca "incierto" (no se reintenta sola: pudo haber llegado).
async function recuperarAtascados() {
  try {
    await query(
      `UPDATE wa_outbox
          SET estado = 'incierto',
              ultimo_error = COALESCE(ultimo_error, 'El servidor se reinició mientras se enviaba: no sabemos si llegó.'),
              actualizado_en = now()
        WHERE estado = 'enviando' AND actualizado_en < now() - interval '10 minutes'`
    );
  } catch (e) {
    console.error('[outbox] no se pudieron recuperar los envíos atascados:', e.message);
  }
}

// Procesa los pendientes que ya vencieron. Devuelve un resumen para el panel.
export async function procesarPendientes({ limite = 20 } = {}) {
  const resumen = { procesados: 0, enviados: 0, reintentando: 0, fallidos: 0, inciertos: 0 };
  await recuperarAtascados();
  for (let i = 0; i < limite; i += 1) {
    const fila = await reclamarSiguiente();
    if (!fila) break;
    const r = await ejecutar(fila);
    resumen.procesados += 1;
    if (r.estado === 'enviado') resumen.enviados += 1;
    else if (r.estado === 'pendiente') resumen.reintentando += 1;
    else if (r.estado === 'incierto') resumen.inciertos += 1;
    else resumen.fallidos += 1;
  }
  return resumen;
}

// Reintento a mano desde el panel. Solo para lo que quedó fallido o incierto.
export async function reintentarEnvio(id) {
  const fila = await one('SELECT * FROM wa_outbox WHERE id = $1', [id]);
  if (!fila) return { ok: false, error: 'Envío no encontrado', status: 404 };
  if (!['fallido', 'incierto'].includes(fila.estado)) {
    return { ok: false, error: `El envío está en estado "${fila.estado}": no hace falta reintentarlo.`, status: 409 };
  }
  await query(
    "UPDATE wa_outbox SET estado = 'pendiente', intentos = 0, proximo_intento = now(), ultimo_error = NULL, actualizado_en = now() WHERE id = $1",
    [id]
  );
  return procesarEnvio(id);
}

export async function listarEnvios({ estado = null, limite = 100 } = {}) {
  const lim = Math.max(1, Math.min(Number(limite) || 100, 300));
  const args = [];
  let where = '';
  if (estado && ESTADOS_OUTBOX.includes(estado)) {
    args.push(estado);
    where = `WHERE estado = $${args.length}`;
  }
  args.push(lim);
  return query(
    `SELECT id, conversacion_id, telefono, tipo, texto, plantilla, estado, intentos,
            proximo_intento, ultimo_error, wa_message_id, mensaje_id, aviso_orden_id,
            creado_en, actualizado_en
       FROM wa_outbox
       ${where}
      ORDER BY creado_en DESC
      LIMIT $${args.length}`,
    args
  );
}

export async function resumenOutbox() {
  const filas = await query(
    `SELECT estado, count(*)::int AS n,
            min(proximo_intento) FILTER (WHERE estado = 'pendiente') AS proximo,
            max(actualizado_en) AS ultimo
       FROM wa_outbox GROUP BY estado`
  );
  const porEstado = Object.fromEntries(ESTADOS_OUTBOX.map((e) => [e, 0]));
  let proximo = null;
  let ultimo = null;
  for (const f of filas) {
    porEstado[f.estado] = Number(f.n) || 0;
    if (f.proximo && (!proximo || new Date(f.proximo) < new Date(proximo))) proximo = f.proximo;
    if (f.ultimo && (!ultimo || new Date(f.ultimo) > new Date(ultimo))) ultimo = f.ultimo;
  }
  return {
    porEstado,
    pendientes: porEstado.pendiente,
    fallidos: porEstado.fallido,
    inciertos: porEstado.incierto,
    proximoIntento: proximo,
    ultimoMovimiento: ultimo,
  };
}

// Worker: corre cada 30 s. `unref` para no impedir que el proceso termine.
let timer = null;
let enCurso = false;

export function iniciarOutbox({ intervaloMs = 30000 } = {}) {
  if (timer) return;
  const tick = async () => {
    if (enCurso) return;
    enCurso = true;
    try {
      const r = await procesarPendientes();
      if (r.procesados) console.log(`[outbox] ${r.procesados} procesados · ${r.enviados} enviados · ${r.reintentando} en espera · ${r.fallidos} fallidos · ${r.inciertos} inciertos`);
    } catch (e) {
      console.error('[outbox] error procesando la cola:', e.message);
    } finally {
      enCurso = false;
    }
  };
  timer = setInterval(tick, intervaloMs);
  if (timer.unref) timer.unref();
  const arranque = setTimeout(tick, 3000);
  if (arranque.unref) arranque.unref();
}

export function detenerOutbox() {
  if (timer) clearInterval(timer);
  timer = null;
  enCurso = false;
}
