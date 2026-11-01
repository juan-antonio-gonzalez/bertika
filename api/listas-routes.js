// Bertika - API del motor de listas dinamicas.
//
// Cada lista guarda su definicion (campos y vistas) en tablas de metadatos y
// sus filas en JSONB. Los permisos se resuelven SIEMPRE en el servidor contra
// el area de la lista y la categoria del usuario: el frontend solo dibuja.
import { Router } from 'express';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';
import { crearStoreRateLimit } from './rate-limit-store.js';
import { randomUUID } from 'node:crypto';
import { query, one, tx } from './db.js';
import { authRequired } from './middleware/auth.js';
import { auditar } from './auditoria.js';
import { encolar } from './outbox.js';
import { normalizarBooleano } from './validaciones.js';
import { PLANTILLAS, crearListaDesdePlantilla } from './listas-seed.js';
import {
  CLAVES_AREA, TIPOS, normalizarOpciones, permisosArea, validarRegistro, evaluarFormula,
} from './listas.js';

export const listasRouter = Router();

const limStr = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const esObjeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const idNuevo = (prefijo) => `${prefijo}_${randomUUID()}`;
const TODAS = Object.fromEntries(CLAVES_AREA.map((k) => [k, true]));
const publicFormLimiter = rateLimit({
  store: crearStoreRateLimit('lista-publica'),
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados envíos. Esperá un minuto y probá de nuevo.' },
});
const PUBLIC_URL = String(process.env.PUBLIC_URL || 'https://bertika.com').replace(/\/+$/, '');
const MAIL_FROM = process.env.MAIL_FROM || process.env.MAIL_USER || 'admin@bertika.com';
const mailerListas = (process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS)
  ? nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 465),
      secure: String(process.env.MAIL_SECURE ?? 'true') === 'true',
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    })
  : null;

function cumpleCondicion(datos, regla) {
  const valor = datos?.[regla.campo];
  const vacio = valor === null || valor === undefined || valor === '' || (Array.isArray(valor) && valor.length === 0);
  if (regla.op === 'vacio') return vacio;
  if (vacio) return false;
  const a = String(Array.isArray(valor) ? valor.join(', ') : valor).toLowerCase();
  const b = String(regla.valor ?? '').toLowerCase();
  if (regla.op === 'contiene') return a.includes(b);
  if (regla.op === 'igual') return a === b;
  if (regla.op === 'distinto') return a !== b;
  if (regla.op === 'mayor' || regla.op === 'menor') {
    const na = Number(valor);
    const nb = Number(regla.valor);
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
    return regla.op === 'mayor' ? na > nb : na < nb;
  }
  return false;
}

async function evaluarReglas(lista, campos, datos, evento, registroId, req) {
  try {
    const reglas = await query(
      "SELECT * FROM lista_reglas WHERE lista_id = $1 AND activo = true AND evento IN ('ambos', $2)",
      [lista.id, evento]
    );
    for (const regla of reglas) {
      if (!cumpleCondicion(datos, regla)) continue;
      const campo = (campos || []).find((c) => c.id === regla.campo);
      const resumen = (campos || []).slice(0, 6)
        .map((c) => `${c.nombre}: ${Array.isArray(datos?.[c.id]) ? datos[c.id].join(', ') : (datos?.[c.id] ?? '—')}`)
        .join(' · ');
      const link = `${PUBLIC_URL}/listas/${lista.area_slug}/${lista.id}`;
      const texto = `Regla "${regla.nombre}" en ${lista.nombre}: ${campo?.nombre || 'campo'} ${regla.op} ${regla.valor || '(vacío)'}.\n${resumen}\n${link}`;
      if (regla.accion === 'orden') {
        const clienteVal = datos?.[regla.campo_destino];
        const clienteId = clienteVal && typeof clienteVal === 'object' ? clienteVal.id : clienteVal;
        const serie = String(datos?.[regla.campo_serie] ?? '').trim();
        if (clienteId && serie) {
          const cliente = await one('SELECT id FROM clientes WHERE id = $1 AND deleted_at IS NULL', [clienteId]);
          if (cliente) {
            const batExistente = await one('SELECT id FROM baterias WHERE numero_serie = $1', [serie]);
            if (!batExistente) {
              await query(
                `INSERT INTO baterias (id, numero_serie, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, fecha_fabricacion, cliente_id, ciclos_estimados, estado_vida)
                 VALUES ($1,$2,'Plomo-Acido','12V',60,'Automotriz','Generica','Estandar',$3,$4,$5,300,'activa')`,
                [idNuevo('bat'), serie, serie, new Date().toISOString().slice(0, 10), cliente.id]
              );
            }
            const ordId = idNuevo('ord');
            const codigo = `AUTO-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
            const evId = idNuevo('ev');
            await query(
              `INSERT INTO ordenes (id, codigo_seguimiento, bateria_serie, cliente_id, tecnico_id, falla, motivo, estado, fecha_ingreso, hora_entrega, eventos, cotizacion, estado_cotizacion, insumos_utilizados, prueba_final, diagnostico)
               VALUES ($1,$2,$3,$4,NULL,$5,$5,'received',$6,$7,$8::jsonb,NULL,NULL,'[]'::jsonb,'{"estado":"pending"}',NULL)`,
              [ordId, codigo, serie, cliente.id, regla.mensaje || 'Orden automática', new Date().toISOString(), new Date(Date.now() + 24 * 3600000).toISOString(), JSON.stringify([{ id: evId, tipo: 'ingreso', detalle: `Serie ${serie} ingresada por regla "${regla.nombre}".`, fecha: new Date().toISOString(), usuario: 'regla' }])]
            );
            await auditar({ req, tabla: 'lista_reglas', registroId: regla.id, accion: 'orden_creada', detalle: `${ordId} cliente ${cliente.id}` });
          }
        }
      } else if (regla.accion === 'webhook') {
        try {
          const url = new URL(regla.mensaje || '');
          const host = url.hostname.toLowerCase();
          const privado = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1'
            || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')
            || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
          if (url.protocol === 'https:' && !privado) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            const respuesta = await fetch(url.toString(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lista: { id: lista.id, nombre: lista.nombre }, regla: { id: regla.id, nombre: regla.nombre }, registro_id: registroId, datos }),
              signal: ctrl.signal,
            }).finally(() => clearTimeout(timer));
            await auditar({ req, tabla: 'lista_reglas', registroId: regla.id, accion: respuesta.ok ? 'webhook_ok' : 'webhook_error', detalle: `${respuesta.status} ${url.toString()}` });
          }
        } catch (e) {
          console.error('[listas] webhook falló:', e.message);
        }
      } else if (regla.accion === 'campo') {
        const destino = regla.campo_destino;
        const camposDestino = await camposDe(lista.id);
        if (destino && camposDestino.some((c) => c.id === destino)) {
          const nuevosDatos = { ...datos, [destino]: regla.mensaje || '' };
          await query('UPDATE lista_registros SET datos = $2::jsonb, actualizado_en = now() WHERE id = $1', [registroId, nuevosDatos]);
          await query(
            `INSERT INTO lista_registros_historial (id, lista_id, registro_id, datos, usuario, accion)
             VALUES ($1,$2,$3,$4::jsonb,$5,'regla')`,
            [idNuevo('hist'), lista.id, registroId, nuevosDatos, 'regla']
          );
          await auditar({ req, tabla: 'lista_reglas', registroId: regla.id, accion: 'disparar_campo', detalle: `registro ${registroId}` });
        }
      } else if (regla.accion === 'whatsapp') {
        const telefono = String(datos?.[regla.campo_destino] ?? '').trim();
        if (telefono) {
          await encolar({ telefono, tipo: 'texto', texto: regla.mensaje || texto });
        }
      } else {
        const html = `<p>Se cumplió la regla <b>${regla.nombre}</b> en la lista <b>${lista.nombre}</b>.</p>
          <p>${campo?.nombre || 'Campo'}: ${resumen}</p><p><a href="${link}">Abrir la lista</a></p>`;
        await avisarPorMail(regla.destinatario, regla.asunto || `Bertika · aviso de ${lista.nombre}`, texto, html);
      }
      await auditar({ req, tabla: 'lista_reglas', registroId: regla.id, accion: 'disparar', detalle: `registro ${registroId}` });
    }
  } catch (e) {
    console.error('[listas] no se pudieron evaluar las reglas:', e.message);
  }
}

async function notificarLista(email, { titulo, mensaje, link, tipo = 'lista' }) {
  if (!email) return;
  try {
    await query(
      `INSERT INTO lista_notificaciones (id, usuario_email, titulo, mensaje, link, tipo)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [idNuevo('lnot'), email, titulo, mensaje, link, tipo]
    );
  } catch (e) {
    console.error('[listas] no se pudo crear la notificación:', e.message);
  }
}

async function avisarPorMail(destinatario, asunto, texto, html) {
  if (!mailerListas || !destinatario) return false;
  try {
    await mailerListas.sendMail({ from: MAIL_FROM, to: destinatario, subject: asunto, text: texto, html });
    return true;
  } catch (e) {
    console.error('[listas] no se pudo enviar el aviso:', e.message);
    return false;
  }
}

function capacidades(req, areaId) {
  if (req.user?.rol === 'admin') return TODAS;
  if (req.user?.rol !== 'tecnico') return Object.fromEntries(CLAVES_AREA.map((k) => [k, false]));
  return permisosArea(req.user.areas, areaId);
}

function sinPermiso(res, mensaje = 'No tenés permiso para esta acción en esta área.') {
  return res.status(403).json({ error: mensaje });
}

function puedeVerRegistro(req, lista, registro) {
  if (req.user?.rol === 'admin') return true;
  if (capacidades(req, lista.area_id).editar_listas) return true;
  const modo = lista.ver_filas || 'todos';
  if (modo === 'todos') return true;
  if (modo === 'admin') return false;
  if (modo === 'creador') return registro.creado_por === req.user?.email;
  if (modo === 'responsable') {
    if (!lista.ver_campo) return false;
    const valor = String(registro.datos?.[lista.ver_campo] ?? '').trim().toLowerCase();
    if (!valor) return false;
    const email = String(req.user?.email || '').trim().toLowerCase();
    const uid = String(req.user?.id || '').trim().toLowerCase();
    return valor === email || (uid && valor === uid);
  }
  return true;
}

function filtroVisibilidad(req, lista, inicio = 1) {
  if (req.user?.rol === 'admin' || capacidades(req, lista.area_id).editar_listas) return { sql: '', params: [] };
  const modo = lista.ver_filas || 'todos';
  if (modo === 'todos') return { sql: '', params: [] };
  if (modo === 'admin') return { sql: ' AND false', params: [] };
  if (modo === 'creador') {
    return { sql: ` AND creado_por = $${inicio}`, params: [req.user?.email] };
  }
  if (modo === 'responsable') {
    if (!lista.ver_campo) return { sql: ' AND false', params: [] };
    const email = String(req.user?.email || '').trim().toLowerCase();
    const uid = String(req.user?.id || '').trim().toLowerCase();
    return {
      sql: ` AND (lower(datos->>$${inicio}) = $${inicio + 1} OR ($${inicio + 2} <> '' AND lower(datos->>$${inicio}) = $${inicio + 2}))`,
      params: [lista.ver_campo, email, uid],
    };
  }
  return { sql: '', params: [] };
}

function puedeEditarRegistro(req, lista, registro) {
  if (!puedeVerRegistro(req, lista, registro)) return false;
  if (req.user?.rol === 'admin') return true;
  const modo = lista.permiso_filas || 'todos';
  if (modo === 'todos') return true;
  if (modo === 'admin') return false;
  if (modo === 'creador') return registro.creado_por === req.user?.email;
  if (modo === 'responsable') {
    if (!lista.permiso_campo) return false;
    const valor = String(registro.datos?.[lista.permiso_campo] ?? '').trim().toLowerCase();
    if (!valor) return false;
    const email = String(req.user?.email || '').trim().toLowerCase();
    const uid = String(req.user?.id || '').trim().toLowerCase();
    return valor === email || (uid && valor === uid);
  }
  return true;
}

async function areasVisibles(user) {
  if (!user || user.rol === 'cliente') return [];
  const areas = await query('SELECT id, slug, nombre, descripcion, icono, orden FROM areas WHERE activo = true ORDER BY orden, nombre');
  const listas = await query(`
    SELECT id, area_id, nombre, descripcion, icono, orden, acceso_categorias
      FROM listas
     WHERE archivada = false
     ORDER BY orden, lower(nombre)
  `);
  return areas
    .filter((a) => user.rol === 'admin' || permisosArea(user.areas, a.id).ver)
    .map((a) => ({
      ...a,
      puede: user.rol === 'admin' ? TODAS : permisosArea(user.areas, a.id),
      listas: listas.filter((l) => l.area_id === a.id && listaAccesible(user, l)),
    }));
}

// Se exporta para que /api/estado arme el menú dinámico en el mismo request.
export { areasVisibles, listaAccesible, capacidadesLista };

function listaAccesible(user, lista) {
  if (!user) return true;
  if (user.rol === 'admin') return true;
  const categorias = Array.isArray(lista.acceso_categorias) ? lista.acceso_categorias : [];
  if (!categorias.length) return true;
  return Boolean(user.categoria_id) && categorias.includes(user.categoria_id);
}

function capacidadesLista(req, lista) {
  const base = capacidades(req, lista.area_id);
  if (req.user?.rol === 'admin') return base;
  const categoria = req.user?.categoria_id;
  if (!categoria) return base;
  const permisos = lista.permisos_categorias && typeof lista.permisos_categorias === 'object' ? lista.permisos_categorias[categoria] : null;
  if (permisos && typeof permisos === 'object') {
    for (const [clave, cap] of [['crear', 'crear_registros'], ['editar', 'editar_registros'], ['borrar', 'borrar_registros'], ['vistas', 'administrar_vistas']]) {
      if (permisos[clave] === false) base[cap] = false;
    }
  }
  const soloLectura = Array.isArray(lista.acceso_solo_lectura) ? lista.acceso_solo_lectura : [];
  if (soloLectura.includes(categoria)) {
    base.crear_registros = false;
    base.editar_registros = false;
    base.borrar_registros = false;
    base.administrar_vistas = false;
  }
  return base;
}

function idsCamposOcultos(user, campos) {
  if (user?.rol === 'admin' || !user?.categoria_id) return new Set();
  return new Set((campos || []).filter((c) => Array.isArray(c.oculto_categorias) && c.oculto_categorias.includes(user.categoria_id)).map((c) => c.id));
}

function camposVisibles(user, campos) {
  const ocultos = idsCamposOcultos(user, campos);
  return ocultos.size ? campos.filter((c) => !ocultos.has(c.id)) : campos;
}

function sinCamposOcultos(datos, ocultos) {
  if (!ocultos.size || !datos || typeof datos !== 'object') return datos;
  const copia = { ...datos };
  for (const id of ocultos) delete copia[id];
  return copia;
}

async function listaConArea(id, user = null) {
  const lista = await one(`
    SELECT l.*, a.slug AS area_slug, a.nombre AS area_nombre
      FROM listas l
      JOIN areas a ON a.id = l.area_id
     WHERE l.id = $1 AND l.archivada = false
  `, [id]);
  if (lista && user && !listaAccesible(user, lista)) return null;
  return lista;
}

async function camposDe(listaId) {
  return query(`
    SELECT id, lista_id, nombre, tipo, config, requerido, unico, oculto_categorias, orden, activo,
           creado_en, actualizado_en
      FROM lista_campos
     WHERE lista_id = $1 AND activo = true
     ORDER BY orden, lower(nombre)
  `, [listaId]);
}

async function vistasDe(listaId, email) {
  return query(`
    SELECT id, lista_id, nombre, tipo, config, visibilidad, creada_por,
           creado_en, actualizado_en, predeterminada
      FROM lista_vistas
     WHERE lista_id = $1 AND (visibilidad = 'compartida' OR creada_por = $2)
     ORDER BY predeterminada DESC, creado_en
  `, [listaId, email]);
}

function calcularCampos(campos, datos) {
  const salida = { ...datos };
  const calculados = (campos || []).filter((c) => c.tipo === 'calculado');
  for (let pasada = 0; pasada < 3; pasada += 1) {
    for (const campo of calculados) {
      try {
        salida[campo.id] = evaluarFormula(campo.config?.formula, salida);
      } catch {
        salida[campo.id] = 0;
      }
    }
  }
  return salida;
}

function esGestorLista(req, lista) {
  return req.user?.rol === 'admin' || Boolean(capacidades(req, lista.area_id).editar_listas);
}

function bloqueoAprobacion(req, lista, registro) {
  if (!lista.requiere_aprobacion || esGestorLista(req, lista)) return null;
  if (registro.aprobacion_estado === 'pendiente') return 'Este registro está pendiente de aprobación y todavía no se puede modificar.';
  if (registro.aprobacion_estado === 'rechazado') return 'Este registro fue rechazado. Un responsable tiene que aprobarlo antes de modificarlo.';
  return null;
}

async function crearAprobacionAuto(client, lista, registroId, usuario, comentario) {
  const id = idNuevo('apr');
  const cadena = Array.isArray(lista.aprobadores) && lista.aprobadores.length ? lista.aprobadores : (lista.aprobador_email ? [lista.aprobador_email] : []);
  const aprobador = cadena[0] || null;
  const dias = Math.max(1, Number(lista.aprobacion_dias) || 3);
  const fila = await client.query(
    `INSERT INTO lista_aprobaciones (id, lista_id, registro_id, solicitado_por, aprobador, comentario, fecha_limite, paso)
     VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' days')::interval, 0)
     RETURNING id, estado, solicitado_por, decidido_por, aprobador, comentario, decidido_en, fecha_limite, creado_en, paso`,
    [id, lista.id, registroId, usuario, aprobador, comentario, String(dias)]
  );
  return fila.rows[0];
}

async function guardarHistorial(client, listaId, registroId, datos, usuario, accion = 'editar') {
  await client.query(
    `INSERT INTO lista_registros_historial (id, lista_id, registro_id, datos, usuario, accion)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
    [idNuevo('hist'), listaId, registroId, datos || {}, usuario || null, accion]
  );
}

async function validarRelaciones(campos, datos) {
  for (const campo of campos) {
    if (campo.tipo !== 'relacion') continue;
    const rel = datos[campo.id];
    if (!rel?.id) continue;
    const objetivo = await one(`
      SELECT r.id, r.datos FROM lista_registros r
        JOIN listas l ON l.id = r.lista_id
       WHERE r.id = $1 AND r.lista_id = $2 AND r.archivado = false AND l.archivada = false
    `, [rel.id, campo.config?.lista_id]);
    if (!objetivo) return `“${campo.nombre}”: el registro relacionado no existe o no está disponible.`;
    // Lookup avanzado: la etiqueta la resuelve el servidor con el campo elegido,
    // no el texto que mandó el navegador.
    const camposDestino = await camposDe(campo.config?.lista_id);
    const mostrar = camposDestino.find((c) => c.id === campo.config?.campo_mostrar)
      || camposDestino.find((c) => /nombre|t[ií]tulo|material|herramienta|insumo|prospecto|cliente/i.test(c.nombre))
      || camposDestino[0];
    const etiqueta = mostrar ? String(objetivo.datos?.[mostrar.id] ?? '').slice(0, 200) : objetivo.id;
    datos[campo.id] = { id: objetivo.id, etiqueta: etiqueta || objetivo.id };
  }
  return null;
}

async function conflictoUnico(listaId, campos, datos, excluirId = null) {
  for (const campo of campos) {
    if (!campo.unico) continue;
    const valor = datos[campo.id];
    if (valor === null || valor === undefined || valor === '') continue;
    const params = [listaId, campo.id, String(valor)];
    let sql = 'SELECT id FROM lista_registros WHERE lista_id = $1 AND archivado = false AND datos->>$2 = $3';
    if (excluirId) { params.push(excluirId); sql += ' AND id <> $4'; }
    const fila = await one(`${sql} LIMIT 1`, params);
    if (fila) return `“${campo.nombre}” debe ser único: ya existe otro registro con ese valor.`;
  }
  return null;
}

function normalizarConfigCampo(tipo, config) {
  const entrada = esObjeto(config) ? config : {};
  const salida = {};
  if (tipo === 'seleccion' || tipo === 'multiseleccion') {
    salida.opciones = normalizarOpciones(entrada.opciones);
  }
  if (tipo === 'numero' || tipo === 'moneda') {
    if (entrada.min !== undefined && entrada.min !== null && entrada.min !== '') salida.min = Number(entrada.min);
    if (entrada.max !== undefined && entrada.max !== null && entrada.max !== '') salida.max = Number(entrada.max);
  }
  if (tipo === 'relacion' && entrada.lista_id) salida.lista_id = limStr(entrada.lista_id, 80);
  if (tipo === 'relacion' && entrada.campo_mostrar) salida.campo_mostrar = limStr(entrada.campo_mostrar, 80);
  if (tipo === 'calculado' && entrada.formula) salida.formula = String(entrada.formula).slice(0, 1000);
  if (entrada.defecto !== undefined && entrada.defecto !== null && entrada.defecto !== '') {
    salida.defecto = entrada.defecto;
  }
  if (entrada.ayuda) salida.ayuda = limStr(entrada.ayuda, 240);
  if (entrada.placeholder) salida.placeholder = limStr(entrada.placeholder, 120);
  return salida;
}

function normalizarVistaConfig(valor) {
  const c = esObjeto(valor) ? valor : {};
  const columnas = Array.isArray(c.columnas)
    ? [...new Set(c.columnas.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 80)
    : [];
  const filtros = Array.isArray(c.filtros)
    ? c.filtros
      .filter((f) => esObjeto(f) && f.campo)
      .slice(0, 20)
      .map((f) => ({
        campo: String(f.campo).trim(),
        op: ['contiene', 'igual', 'distinto', 'mayor', 'menor', 'vacio'].includes(f.op) ? f.op : 'contiene',
        valor: f.valor === undefined || f.valor === null ? '' : String(f.valor).slice(0, 200),
      }))
    : [];
  const orden = esObjeto(c.orden) && c.orden.campo
    ? { campo: String(c.orden.campo).trim(), dir: c.orden.dir === 'asc' ? 'asc' : 'desc' }
    : null;
  const agrupar = c.agrupar ? String(c.agrupar).trim() : null;
  const q = c.q ? String(c.q).slice(0, 120) : '';
  const kanban = c.kanban ? String(c.kanban).trim() : null;
  const titulo = c.titulo ? String(c.titulo).trim() : null;
  const mis = ['creado_por', 'responsable'].includes(c.mis) ? c.mis : null;
  const responsable = c.responsable ? String(c.responsable).trim() : null;
  const calendario = c.calendario ? String(c.calendario).trim() : null;
  const galeria = c.galeria ? String(c.galeria).trim() : null;
  const formato = Array.isArray(c.formato)
    ? c.formato
      .filter((f) => esObjeto(f) && f.campo)
      .slice(0, 20)
      .map((f) => ({
        campo: String(f.campo).trim(),
        op: ['contiene', 'igual', 'distinto', 'mayor', 'menor', 'vacio'].includes(f.op) ? f.op : 'igual',
        valor: f.valor === undefined || f.valor === null ? '' : String(f.valor).slice(0, 200),
        color: ['red', 'amber', 'green', 'blue', 'gray'].includes(f.color) ? f.color : 'amber',
      }))
    : [];
  return { columnas, filtros, orden, agrupar, q, kanban, titulo, mis, responsable, formato, calendario, galeria };
}

// ---------- Navegación visible ----------
listasRouter.get('/listas/nav', authRequired, async (req, res) => {
  return res.json(await areasVisibles(req.user));
});

// ---------- Listas ----------
// Papelera de listas (antes de /listas/:id para que no la capture el comodín).
listasRouter.get('/listas/archivadas', authRequired, async (req, res) => {
  const where = [];
  const params = [];
  if (req.user.rol !== 'admin') {
    const areas = Object.entries(req.user.areas || {}).filter(([, caps]) => caps?.borrar_listas).map(([id]) => id);
    if (!areas.length) return res.json([]);
    params.push(areas);
    where.push(`l.area_id = ANY($${params.length})`);
  }
  const filas = await query(`
    SELECT l.id, l.area_id, l.nombre, l.descripcion, l.icono, l.archivada_en, l.archivada_por,
           l.acceso_categorias, a.nombre AS area_nombre
      FROM listas l JOIN areas a ON a.id = l.area_id
     WHERE l.archivada = true ${where.length ? `AND ${where.join(' AND ')}` : ''}
     ORDER BY l.archivada_en DESC NULLS LAST
     LIMIT 200
  `, params);
  return res.json(filas.filter((l) => listaAccesible(req.user, l)));
});

listasRouter.patch('/listas/:id/restaurar', authRequired, async (req, res) => {
  const lista = await one(`
    SELECT l.*, a.slug AS area_slug FROM listas l JOIN areas a ON a.id = l.area_id
     WHERE l.id = $1 AND l.archivada = true
  `, [req.params.id]);
  if (!lista || !listaAccesible(req.user, lista)) return res.status(404).json({ error: 'Lista archivada no encontrada' });
  if (!capacidades(req, lista.area_id).borrar_listas) return sinPermiso(res);
  try {
    await query('UPDATE listas SET archivada = false, archivada_en = NULL, archivada_por = NULL, actualizado_en = now() WHERE id = $1', [lista.id]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya hay una lista activa con ese nombre en el área.' });
    throw e;
  }
  await auditar({ req, tabla: 'listas', registroId: lista.id, accion: 'restaurar' });
  return res.json({ ok: true });
});

const TIPOS_PUBLICOS = new Set(['texto', 'texto_largo', 'email', 'telefono', 'url', 'numero', 'moneda', 'fecha', 'seleccion', 'multiseleccion', 'checkbox']);

function camposPublicos(campos) {
  return (campos || [])
    .filter((c) => TIPOS_PUBLICOS.has(c.tipo) && c.activo !== false)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      requerido: Boolean(c.requerido),
      config: {
        opciones: Array.isArray(c.config?.opciones) ? c.config.opciones : [],
        ayuda: c.config?.ayuda || '',
      },
    }));
}

async function formularioPorToken(token) {
  return one(`
    SELECT f.*, l.nombre AS lista_nombre, l.area_id, l.archivada AS lista_archivada
      FROM lista_formularios f JOIN listas l ON l.id = f.lista_id
     WHERE f.token = $1
  `, [token]);
}

// ---------- Formularios públicos ----------
listasRouter.get('/listas/:id/formulario', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const form = await one('SELECT * FROM lista_formularios WHERE lista_id = $1', [lista.id]);
  const campos = camposPublicos(await camposDe(lista.id));
  return res.json({
    formulario: form ? { ...form, url: `${PUBLIC_URL}/f/${form.token}` } : null,
    campos,
  });
});

listasRouter.put('/listas/:id/formulario', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const todos = await camposDe(lista.id);
  const disponibles = new Map(camposPublicos(todos).map((c) => [c.id, c]));
  const ids = Array.isArray(req.body?.campos) ? [...new Set(req.body.campos.map((x) => limStr(x, 80)).filter((x) => disponibles.has(x)))] : [];
  if (!ids.length) return res.status(400).json({ error: 'Elegí al menos un campo para el formulario.' });
  const titulo = limStr(req.body?.titulo, 120) || `Formulario de ${lista.nombre}`;
  const descripcion = limStr(req.body?.descripcion, 400) || null;
  const activo = req.body?.activo !== false;
  const confirmarEmail = normalizarBooleano(req.body?.confirmar_email) === true;
  const existente = await one('SELECT token FROM lista_formularios WHERE lista_id = $1', [lista.id]);
  const token = existente?.token || randomUUID().replace(/-/g, '').slice(0, 24);
  const fila = await one(
    `INSERT INTO lista_formularios (id, lista_id, token, titulo, descripcion, campos, activo, confirmar_email, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
     ON CONFLICT (lista_id) DO UPDATE SET titulo = EXCLUDED.titulo, descripcion = EXCLUDED.descripcion,
       campos = EXCLUDED.campos, activo = EXCLUDED.activo, confirmar_email = EXCLUDED.confirmar_email, actualizado_en = now()
     RETURNING *`,
    [idNuevo('form'), lista.id, token, titulo, descripcion, JSON.stringify(ids), activo, confirmarEmail, req.user.email]
  );
  await auditar({ req, tabla: 'lista_formularios', registroId: fila.id, accion: 'guardar', detalle: lista.id });
  return res.json({ ...fila, url: `${PUBLIC_URL}/f/${token}` });
});

listasRouter.delete('/listas/:id/formulario', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  await query('DELETE FROM lista_formularios WHERE lista_id = $1', [lista.id]);
  await auditar({ req, tabla: 'lista_formularios', registroId: lista.id, accion: 'borrar' });
  return res.json({ ok: true });
});

// Público: no devuelve campos internos ni registros; solo la definición elegida.
listasRouter.get('/public/formulario/:token', publicFormLimiter, async (req, res) => {
  const f = await formularioPorToken(req.params.token);
  if (!f || !f.activo || f.lista_archivada) return res.status(404).json({ error: 'Formulario no disponible.' });
  const todos = await camposDe(f.lista_id);
  const porId = new Map(camposPublicos(todos).map((c) => [c.id, c]));
  const ids = Array.isArray(f.campos) ? f.campos : [];
  const campos = ids.map((id) => porId.get(id)).filter(Boolean);
  return res.json({
    titulo: f.titulo || `Formulario de ${f.lista_nombre}`,
    descripcion: f.descripcion || '',
    lista: f.lista_nombre,
    campos,
  });
});

listasRouter.post('/public/formulario/:token', publicFormLimiter, async (req, res) => {
  if (req.body?._empresa) return res.status(400).json({ error: 'No se pudo enviar el formulario.' });
  const f = await formularioPorToken(req.params.token);
  if (!f || !f.activo || f.lista_archivada) return res.status(404).json({ error: 'Formulario no disponible.' });
  const todos = await camposDe(f.lista_id);
  const porId = new Map(camposPublicos(todos).map((c) => [c.id, c]));
  const ids = Array.isArray(f.campos) ? f.campos : [];
  const campos = ids.map((id) => porId.get(id)).filter(Boolean);
  if (!campos.length) return res.status(400).json({ error: 'El formulario no tiene campos disponibles.' });
  const validado = validarRegistro(campos, req.body?.datos);
  if (!validado.ok) return res.status(400).json({ error: validado.error });
  const datosFinal = calcularCampos(campos, validado.datos);
  const conflicto = await conflictoUnico(f.lista_id, campos, datosFinal);
  if (conflicto) return res.status(400).json({ error: 'Ya existe un registro con esos datos.' });
  const lista = await listaConArea(f.lista_id);
  const requiere = lista?.requiere_aprobacion === true;
  const estadoAprobacion = requiere ? 'pendiente' : 'no_requiere';
  const id = idNuevo('reg');
  let aprobacionAuto = null;
  await tx(async (client) => {
    await client.query(
      `INSERT INTO lista_registros (id, lista_id, datos, aprobacion_estado, creado_por, actualizado_por)
       VALUES ($1,$2,$3::jsonb,$4,'formulario-publico','formulario-publico')`,
      [id, f.lista_id, datosFinal, estadoAprobacion]
    );
    if (requiere && lista) {
      aprobacionAuto = await crearAprobacionAuto(client, lista, id, 'formulario-publico', 'Solicitud automática desde formulario público.');
    }
    await guardarHistorial(client, f.lista_id, id, datosFinal, 'formulario-publico', 'crear');
  });
  if (aprobacionAuto && lista) avisarAprobadores(lista, aprobacionAuto, 'formulario-publico');
  if (f.confirmar_email) {
    const campoEmail = campos.find((c) => c.tipo === 'email' && datosFinal[c.id]);
    const email = campoEmail ? String(datosFinal[campoEmail.id] || '').trim() : '';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      avisarPorMail(
        email,
        `Bertika · recibimos tu respuesta en ${f.lista_nombre}`,
        `Gracias por escribirnos. Recibimos tu respuesta en ${f.lista_nombre}.`,
        `<p>Gracias por escribirnos.</p><p>Recibimos tu respuesta en <b>${f.lista_nombre}</b>.</p>`
      );
    }
  }
  if (lista) evaluarReglas(lista, todos, datosFinal, 'crear', id, req);
  await auditar({ req, tabla: 'lista_registros', registroId: id, accion: 'crear_formulario', detalle: f.id });
  return res.status(201).json({ ok: true, aprobacion_estado: estadoAprobacion });
});

// Búsqueda global de registros en las listas visibles para el usuario.
listasRouter.get('/listas/buscar', authRequired, async (req, res) => {
  if (!req.user || req.user.rol === 'cliente') return sinPermiso(res);
  const q = limStr(req.query?.q, 80);
  if (q.length < 2) return res.json({ q, resultados: [] });
  const patron = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const areas = await areasVisibles(req.user);
  const ids = areas.flatMap((a) => (a.listas || []).map((l) => l.id));
  if (!ids.length) return res.json({ q, resultados: [] });

  // Una sola consulta de listas, campos y registros: antes se hacía N+1 por lista.
  const [listas, campos, filas] = await Promise.all([
    query('SELECT * FROM listas WHERE id = ANY($1) AND archivada = false', [ids]),
    query('SELECT id, lista_id, nombre, tipo FROM lista_campos WHERE lista_id = ANY($1) AND activo = true ORDER BY orden, lower(nombre)', [ids]),
    query(`
      SELECT id, lista_id, datos, creado_por, creado_en
        FROM lista_registros
       WHERE lista_id = ANY($1) AND archivado = false AND datos::text ILIKE $2
       ORDER BY creado_en DESC
       LIMIT 500
    `, [ids, patron]),
  ]);
  const porId = new Map(listas.map((l) => [l.id, l]));
  const camposPorLista = new Map();
  for (const c of campos) {
    if (!camposPorLista.has(c.lista_id)) camposPorLista.set(c.lista_id, []);
    camposPorLista.get(c.lista_id).push(c);
  }
  const filasPorLista = new Map();
  for (const f of filas) {
    if (!filasPorLista.has(f.lista_id)) filasPorLista.set(f.lista_id, []);
    filasPorLista.get(f.lista_id).push(f);
  }

  const resultados = [];
  for (const area of areas) {
    for (const meta of area.listas || []) {
      const lista = porId.get(meta.id);
      if (!lista || !listaAccesible(req.user, lista)) continue;
      const camposLista = camposPorLista.get(lista.id) || [];
      const tituloCampo = camposLista.find((c) => c.tipo === 'texto') || camposLista[0] || null;
      const propias = filasPorLista.get(lista.id) || [];
      let usadas = 0;
      for (const fila of propias) {
        if (usadas >= 10) break;
        if (!puedeVerRegistro(req, lista, fila)) continue;
        const valor = fila.datos?.[tituloCampo?.id];
        const titulo = valor && typeof valor === 'object'
          ? (valor.etiqueta || valor.nombre || valor.id || 'Sin título')
          : (valor == null || valor === '' ? 'Sin título' : String(valor));
        resultados.push({
          area_slug: area.slug,
          area_nombre: area.nombre,
          lista_id: lista.id,
          lista_nombre: lista.nombre,
          registro_id: fila.id,
          titulo: String(titulo).slice(0, 180),
          creado_en: fila.creado_en,
        });
        usadas += 1;
        if (resultados.length >= 25) return res.json({ q, resultados });
      }
    }
  }
  return res.json({ q, resultados });
});

function mapearConfigVista(config = {}, mapa) {
  let out = { ...config };
  if (out.kanban && mapa.has(out.kanban)) out = { ...out, kanban: mapa.get(out.kanban) };
  if (out.titulo && mapa.has(out.titulo)) out = { ...out, titulo: mapa.get(out.titulo) };
  if (out.responsable && mapa.has(out.responsable)) out = { ...out, responsable: mapa.get(out.responsable) };
  if (out.calendario && mapa.has(out.calendario)) out = { ...out, calendario: mapa.get(out.calendario) };
  if (out.galeria && mapa.has(out.galeria)) out = { ...out, galeria: mapa.get(out.galeria) };
  if (out.agrupar && mapa.has(out.agrupar)) out = { ...out, agrupar: mapa.get(out.agrupar) };
  if (Array.isArray(out.columnas)) out = { ...out, columnas: out.columnas.map((x) => mapa.get(x) || x) };
  if (Array.isArray(out.filtros)) out = { ...out, filtros: out.filtros.map((f) => ({ ...f, campo: mapa.get(f.campo) || f.campo })) };
  if (Array.isArray(out.formato)) out = { ...out, formato: out.formato.map((f) => ({ ...f, campo: mapa.get(f.campo) || f.campo })) };
  if (out.orden?.campo && mapa.has(out.orden.campo)) out = { ...out, orden: { ...out.orden, campo: mapa.get(out.orden.campo) } };
  return out;
}

async function crearListaDesdeSnapshot({ tpl, areaId, nombre, usuario }) {
  let listaId;
  await tx(async (client) => {
    listaId = idNuevo('lst');
    await client.query(
      `INSERT INTO listas (id, area_id, nombre, descripcion, icono, creada_por)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [listaId, areaId, nombre || tpl.nombre, tpl.descripcion || null, tpl.icono || 'clipboard', usuario]
    );
    const mapa = new Map();
    const campos = Array.isArray(tpl.campos) ? tpl.campos : [];
    for (const campo of campos) {
      const nuevo = idNuevo('cam');
      if (campo.id) mapa.set(campo.id, nuevo);
      let config = campo.config || {};
      if (campo.tipo === 'calculado' && config.formula) {
        config = { ...config, formula: String(config.formula).replace(/\{([^}]+)\}/g, (m, idc) => (mapa.has(idc) ? `{${mapa.get(idc)}}` : m)) };
      }
      await client.query(
        `INSERT INTO lista_campos (id, lista_id, nombre, tipo, config, requerido, unico, orden)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
        [nuevo, listaId, campo.nombre, campo.tipo, config, campo.requerido === true, campo.unico === true, campo.orden || 0]
      );
    }
    const vistas = Array.isArray(tpl.vistas) ? tpl.vistas : [];
    let primera = true;
    for (const vista of vistas) {
      const config = mapearConfigVista(vista.config || {}, mapa);
      await client.query(
        `INSERT INTO lista_vistas (id, lista_id, nombre, tipo, config, visibilidad, creada_por, predeterminada)
         VALUES ($1,$2,$3,$4,$5::jsonb,'compartida',$6,$7)`,
        [idNuevo('vis'), listaId, vista.nombre || 'Vista', vista.tipo || 'grid', config, usuario, primera ? true : Boolean(vista.predeterminada)]
      );
      primera = false;
    }
    if (!vistas.length) {
      await client.query(
        `INSERT INTO lista_vistas (id, lista_id, nombre, tipo, config, visibilidad, creada_por, predeterminada)
         VALUES ($1,$2,'Vista principal','grid','{}'::jsonb,'compartida',$3,true)`,
        [idNuevo('vis'), listaId, usuario]
      );
    }
  });
  return listaId;
}

// Clientes disponibles para el campo Cliente de una lista.
listasRouter.get('/listas/clientes', authRequired, async (req, res) => {
  if (!req.user || req.user.rol === 'cliente') return sinPermiso(res);
  const filas = await query("SELECT id, nombre, empresa FROM clientes WHERE deleted_at IS NULL ORDER BY lower(nombre) LIMIT 500");
  return res.json(filas);
});

// Catálogo de plantillas de listas.
listasRouter.get('/listas/plantillas', authRequired, async (req, res) => {
  if (!req.user || req.user.rol === 'cliente') return sinPermiso(res);
  const propias = await query(`
    SELECT id, area_id, nombre, descripcion, icono, campos, vistas, creada_por, creado_en
      FROM lista_plantillas_usuario ORDER BY creado_en DESC LIMIT 100
  `);
  return res.json([
    ...PLANTILLAS.map((p) => ({
      clave: p.clave, nombre: p.nombre, descripcion: p.descripcion, icono: p.icono,
      area_id: p.area_id, campos: (p.campos || []).length, vistas: (p.vistas || []).length, origen: 'sistema',
    })),
    ...propias.map((p) => ({
      clave: p.id, nombre: p.nombre, descripcion: p.descripcion, icono: p.icono,
      area_id: p.area_id, campos: Array.isArray(p.campos) ? p.campos.length : 0,
      vistas: Array.isArray(p.vistas) ? p.vistas.length : 0, origen: 'usuario', creada_por: p.creada_por,
    })),
  ]);
});

listasRouter.post('/listas/:id/guardar-plantilla', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const nombre = limStr(req.body?.nombre, 80) || `${lista.nombre} (plantilla)`;
  const descripcion = limStr(req.body?.descripcion, 240) || lista.descripcion || null;
  const campos = await camposDe(lista.id);
  const vistas = await query("SELECT nombre, tipo, config, predeterminada FROM lista_vistas WHERE lista_id = $1 AND visibilidad = 'compartida' ORDER BY predeterminada DESC, creado_en", [lista.id]);
  const id = idNuevo('plt');
  await query(
    `INSERT INTO lista_plantillas_usuario (id, area_id, nombre, descripcion, icono, campos, vistas, creada_por)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
    [id, lista.area_id, nombre, descripcion, lista.icono, JSON.stringify(campos), JSON.stringify(vistas), req.user.email]
  );
  await auditar({ req, tabla: 'lista_plantillas_usuario', registroId: id, accion: 'crear', detalle: lista.id });
  return res.status(201).json({ id, nombre });
});

listasRouter.post('/listas/plantillas/:clave', authRequired, async (req, res) => {
  const areaId = limStr(req.body?.area_id, 60);
  const area = await one('SELECT id FROM areas WHERE id = $1 AND activo = true', [areaId]);
  if (!area) return res.status(400).json({ error: 'Elegí un área válida.' });
  if (!capacidades(req, areaId).crear_listas) return sinPermiso(res, 'No tenés permiso para crear listas en esta área.');
  const nombre = limStr(req.body?.nombre, 80);
  try {
    const sistema = PLANTILLAS.find((p) => p.clave === req.params.clave && p.area_id === areaId);
    if (sistema) {
      const creada = await crearListaDesdePlantilla({ clave: req.params.clave, areaId, nombre, usuario: req.user.email });
      await auditar({ req, tabla: 'listas', registroId: creada.id, accion: 'crear', detalle: `plantilla ${req.params.clave}` });
      return res.status(201).json({ id: creada.id });
    }
    const tpl = await one('SELECT * FROM lista_plantillas_usuario WHERE id = $1 AND area_id = $2', [req.params.clave, areaId]);
    if (!tpl) return res.status(400).json({ error: 'La plantilla no corresponde a esta área.' });
    const id = await crearListaDesdeSnapshot({ tpl, areaId, nombre: nombre || tpl.nombre, usuario: req.user.email });
    await auditar({ req, tabla: 'listas', registroId: id, accion: 'crear', detalle: `plantilla usuario ${tpl.id}` });
    return res.status(201).json({ id });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe una lista con ese nombre en el área.' });
    throw e;
  }
});

// Categorías disponibles para configurar el acceso a una lista.
listasRouter.get('/listas/categorias', authRequired, async (req, res) => {
  if (!req.user || req.user.rol === 'cliente') return sinPermiso(res);
  const filas = await query('SELECT id, nombre, descripcion FROM categorias_acceso ORDER BY lower(nombre)');
  return res.json(filas);
});

// Equipo interno para los campos de tipo Persona (sin datos sensibles).
listasRouter.get('/equipo', authRequired, async (req, res) => {
  if (!req.user || req.user.rol === 'cliente') return sinPermiso(res);
  const filas = await query(`
    SELECT u.id, u.email, u.rol, COALESCE(t.nombre, split_part(u.email, '@', 1)) AS nombre
      FROM usuarios u
      LEFT JOIN tecnicos t ON t.id = u.tecnico_id
     WHERE u.activo = true AND u.rol IN ('admin', 'tecnico')
     ORDER BY lower(COALESCE(t.nombre, u.email))
  `);
  return res.json(filas);
});

// Historial de la estructura de la lista (lista, campos, vistas, reglas y formularios).
listasRouter.get('/listas/:id/auditoria-estructura', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const columnas = 'a.id, a.fecha, a.actor, a.rol, a.tabla, a.accion, a.campos, a.detalle, a.antes, a.despues';
  const [propia, campos, vistas, reglas, formularios] = await Promise.all([
    query(`SELECT ${columnas} FROM auditoria a WHERE a.tabla = 'listas' AND a.registro_id = $1 ORDER BY a.fecha DESC LIMIT 30`, [lista.id]),
    query(`SELECT ${columnas} FROM auditoria a JOIN lista_campos c ON c.id = a.registro_id WHERE a.tabla = 'lista_campos' AND c.lista_id = $1 ORDER BY a.fecha DESC LIMIT 50`, [lista.id]),
    query(`SELECT ${columnas} FROM auditoria a JOIN lista_vistas v ON v.id = a.registro_id WHERE a.tabla = 'lista_vistas' AND v.lista_id = $1 ORDER BY a.fecha DESC LIMIT 50`, [lista.id]),
    query(`SELECT ${columnas} FROM auditoria a JOIN lista_reglas r ON r.id = a.registro_id WHERE a.tabla = 'lista_reglas' AND r.lista_id = $1 ORDER BY a.fecha DESC LIMIT 50`, [lista.id]),
    query(`SELECT ${columnas} FROM auditoria a JOIN lista_formularios f ON f.id = a.registro_id WHERE a.tabla = 'lista_formularios' AND f.lista_id = $1 ORDER BY a.fecha DESC LIMIT 30`, [lista.id]),
  ]);
  const filas = [...propia, ...campos, ...vistas, ...reglas, ...formularios]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 150);
  return res.json(filas);
});

// Historial de actividad de los registros de una lista.
listasRouter.get('/listas/:id/auditoria', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const filas = await query(`
    SELECT a.id, a.fecha, a.actor, a.rol, a.accion, a.campos, a.detalle, a.antes, a.despues
      FROM auditoria a
      JOIN lista_registros r ON r.id = a.registro_id
     WHERE r.lista_id = $1 AND a.tabla = 'lista_registros'
     ORDER BY a.fecha DESC
     LIMIT 100
  `, [lista.id]);
  return res.json(filas);
});

// ---------- Notificaciones internas de listas ----------
listasRouter.get('/listas/notificaciones', authRequired, async (req, res) => {
  const filas = await query(`
    SELECT id, titulo, mensaje, link, tipo, leida, creado_en
      FROM lista_notificaciones
     WHERE usuario_email = $1
     ORDER BY creado_en DESC
     LIMIT 50
  `, [req.user.email]);
  return res.json({
    notificaciones: filas,
    no_leidas: filas.filter((f) => !f.leida).length,
  });
});

listasRouter.post('/listas/notificaciones/leidas', authRequired, async (req, res) => {
  await query('UPDATE lista_notificaciones SET leida = true WHERE usuario_email = $1 AND leida = false', [req.user.email]);
  return res.json({ ok: true });
});

listasRouter.delete('/listas/notificaciones/:id', authRequired, async (req, res) => {
  const borrada = await one('DELETE FROM lista_notificaciones WHERE id = $1 AND usuario_email = $2 RETURNING id', [req.params.id, req.user.email]);
  if (!borrada) return res.status(404).json({ error: 'Notificación no encontrada' });
  return res.json({ ok: true });
});

// Bandeja de aprobaciones pendientes del área (para gestores de listas).
listasRouter.get('/listas/aprobaciones/pendientes', authRequired, async (req, res) => {
  const areaId = limStr(req.query?.area_id, 60);
  const area = await one('SELECT id, slug, nombre FROM areas WHERE id = $1 AND activo = true', [areaId]);
  if (!area) return res.status(400).json({ error: 'Área inválida.' });
  const cap = capacidades(req, areaId);
  if (!cap.ver || !cap.editar_listas) return sinPermiso(res, 'Solo quien administra las listas puede ver las aprobaciones pendientes.');

  let filas = await query(`
    SELECT a.id, a.lista_id, a.registro_id, a.solicitado_por, a.aprobador, a.comentario, a.fecha_limite, a.paso, a.creado_en,
           l.nombre AS lista_nombre, l.acceso_categorias, r.datos
      FROM lista_aprobaciones a
      JOIN listas l ON l.id = a.lista_id
      JOIN lista_registros r ON r.id = a.registro_id
     WHERE l.area_id = $1 AND l.archivada = false AND r.archivado = false AND a.estado = 'pendiente'
     ORDER BY a.creado_en ASC
     LIMIT 300
  `, [areaId]);
  filas = filas.filter((f) => listaAccesible(req.user, f));

  const campos = await query(`
    SELECT c.id, c.lista_id, c.nombre, c.tipo
      FROM lista_campos c JOIN listas l ON l.id = c.lista_id
     WHERE l.area_id = $1 AND l.archivada = false AND c.activo = true
     ORDER BY c.orden, lower(c.nombre)
  `, [areaId]);
  const tituloPorLista = new Map();
  for (const c of campos) {
    const actual = tituloPorLista.get(c.lista_id);
    if (!actual || (actual.tipo !== 'texto' && c.tipo === 'texto')) tituloPorLista.set(c.lista_id, c);
  }
  const limpiar = (v) => {
    if (Array.isArray(v)) return v.join(', ');
    if (v && typeof v === 'object') return v.etiqueta || v.nombre || v.id || '';
    return v == null ? '' : String(v);
  };
  return res.json({
    area,
    total: filas.length,
    aprobaciones: filas.map((f) => ({
      ...f,
      titulo: limpiar(f.datos?.[tituloPorLista.get(f.lista_id)?.id]) || 'Sin título',
      datos: undefined,
    })),
  });
});

// Dashboard de un área: métricas, actividad reciente y alertas.
listasRouter.get('/listas/resumen', authRequired, async (req, res) => {
  const areaId = limStr(req.query?.area_id, 60);
  const area = await one('SELECT id, slug, nombre FROM areas WHERE id = $1 AND activo = true', [areaId]);
  if (!area) return res.status(400).json({ error: 'Área inválida.' });
  const capArea = capacidades(req, areaId);
  if (!capArea.ver) return sinPermiso(res);
  const verTodo = req.user.rol === 'admin' || capArea.editar_listas;

  let listas = await query(`
    SELECT l.id, l.area_id, l.nombre, l.icono, l.ver_filas, l.ver_campo, l.acceso_categorias, count(r.id)::int AS registros,
           count(r.id) FILTER (WHERE r.creado_en >= now() - interval '7 days')::int AS nuevos
      FROM listas l
      LEFT JOIN lista_registros r ON r.lista_id = l.id AND r.archivado = false
     WHERE l.area_id = $1 AND l.archivada = false
     GROUP BY l.id
     ORDER BY l.orden, lower(l.nombre)
  `, [areaId]);
  listas = listas.filter((l) => listaAccesible(req.user, l));

  const campos = await query(`
    SELECT c.id, c.lista_id, c.nombre, c.tipo
      FROM lista_campos c JOIN listas l ON l.id = c.lista_id
     WHERE l.area_id = $1 AND l.archivada = false AND c.activo = true
     ORDER BY c.orden, lower(c.nombre)
  `, [areaId]);
  const tituloPorLista = new Map();
  for (const c of campos) {
    const actual = tituloPorLista.get(c.lista_id);
    if (!actual || (actual.tipo !== 'texto' && c.tipo === 'texto')) tituloPorLista.set(c.lista_id, c);
  }

  let recientes = await query(`
    SELECT r.id, r.lista_id, r.datos, r.creado_en, r.creado_por, l.nombre AS lista_nombre
      FROM lista_registros r JOIN listas l ON l.id = r.lista_id
     WHERE l.area_id = $1 AND l.archivada = false AND r.archivado = false
     ORDER BY r.creado_en DESC
     LIMIT 8
  `, [areaId]);
  const limpiar = (v) => {
    if (Array.isArray(v)) return v.join(', ');
    if (v && typeof v === 'object') return v.etiqueta || v.nombre || v.id || '';
    return v == null ? '' : String(v);
  };
  const idsListas = new Set(listas.map((l) => l.id));
  recientes = recientes.filter((r) => idsListas.has(r.lista_id));

  if (!verTodo) {
    const filasArea = await query(`
      SELECT r.id, r.lista_id, r.datos, r.creado_en, r.creado_por
        FROM lista_registros r JOIN listas l ON l.id = r.lista_id
       WHERE l.area_id = $1 AND l.archivada = false AND r.archivado = false
       ORDER BY r.creado_en DESC
    `, [areaId]);
    const porLista = new Map(listas.map((l) => [l.id, { ...l, registros: 0, nuevos: 0 }]));
    const visibles = [];
    const desde = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const fila of filasArea) {
      const lista = porLista.get(fila.lista_id);
      if (!lista || !puedeVerRegistro(req, lista, fila)) continue;
      lista.registros += 1;
      if (new Date(fila.creado_en).getTime() >= desde) lista.nuevos += 1;
      visibles.push(fila);
    }
    listas = [...porLista.values()];
    recientes = visibles.slice(0, 8);
  }

  let etapas = [];
  let alertas = [];
  if (verTodo && area.slug === 'ventas') {
    const lista = listas.find((l) => l.nombre.toLowerCase() === 'oportunidades');
    const campo = campos.find((c) => c.lista_id === lista?.id && /etapa/i.test(c.nombre));
    if (lista && campo) {
      const filas = await query('SELECT datos FROM lista_registros WHERE lista_id = $1 AND archivado = false', [lista.id]);
      const conteo = new Map();
      for (const f of filas) {
        const v = String(f.datos?.[campo.id] ?? 'Sin etapa');
        conteo.set(v, (conteo.get(v) || 0) + 1);
      }
      etapas = [...conteo.entries()].map(([valor, total]) => ({ valor, total })).sort((a, b) => b.total - a.total);
    }
  }
  if (verTodo && area.slug === 'taller') {
    for (const lista of listas) {
      const campo = campos.find((c) => c.lista_id === lista.id && /^(stock|stock mínimo)$/i.test(c.nombre));
      if (!campo) continue;
      const filas = await query('SELECT datos FROM lista_registros WHERE lista_id = $1 AND archivado = false', [lista.id]);
      const total = filas.filter((f) => Number(f.datos?.[campo.id] || 0) <= 0).length;
      if (total > 0) alertas.push({ lista: lista.nombre, texto: 'Sin stock', total });
    }
  }

  return res.json({
    area,
    listas,
    total_registros: listas.reduce((n, l) => n + Number(l.registros || 0), 0),
    nuevos_7d: listas.reduce((n, l) => n + Number(l.nuevos || 0), 0),
    recientes: recientes.map((r) => ({
      ...r,
      titulo: limpiar(r.datos?.[tituloPorLista.get(r.lista_id)?.id]) || 'Sin título',
    })),
    etapas,
    alertas,
  });
});

listasRouter.get('/listas/:id', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  const cap = capacidades(req, lista.area_id);
  if (!cap.ver) return sinPermiso(res, 'No tenés acceso a esta área.');
  const [todos, vistas] = await Promise.all([camposDe(lista.id), vistasDe(lista.id, req.user.email)]);
  return res.json({ ...lista, campos: camposVisibles(req.user, todos), vistas, puede: capacidadesLista(req, lista) });
});

listasRouter.post('/listas', authRequired, async (req, res) => {
  const areaId = limStr(req.body?.area_id, 60);
  const area = await one('SELECT id, nombre FROM areas WHERE id = $1 AND activo = true', [areaId]);
  if (!area) return res.status(400).json({ error: 'Elegí un área válida.' });
  if (!capacidades(req, areaId).crear_listas) return sinPermiso(res, 'No tenés permiso para crear listas en esta área.');
  const nombre = limStr(req.body?.nombre, 80);
  if (nombre.length < 2) return res.status(400).json({ error: 'El nombre de la lista debe tener al menos 2 caracteres.' });
  const descripcion = limStr(req.body?.descripcion, 240) || null;
  const icono = limStr(req.body?.icono, 30) || 'clipboard';
  const id = idNuevo('lst');
  try {
    await tx(async (client) => {
      await client.query(
        `INSERT INTO listas (id, area_id, nombre, descripcion, icono, creada_por)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, areaId, nombre, descripcion, icono, req.user.email]
      );
      await client.query(
        `INSERT INTO lista_vistas (id, lista_id, nombre, tipo, config, visibilidad, creada_por, predeterminada)
         VALUES ($1,$2,'Vista principal','grid','{}'::jsonb,'compartida',$3,true)`,
        [idNuevo('vis'), id, req.user.email]
      );
    });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe una lista con ese nombre en esta área.' });
    throw e;
  }
  await auditar({ req, tabla: 'listas', registroId: id, accion: 'crear', despues: { id, areaId, nombre, descripcion } });
  return res.status(201).json({ id });
});

listasRouter.patch('/listas/:id', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const sets = [];
  const params = [];
  if (req.body?.nombre !== undefined) {
    const nombre = limStr(req.body.nombre, 80);
    if (nombre.length < 2) return res.status(400).json({ error: 'El nombre de la lista debe tener al menos 2 caracteres.' });
    params.push(nombre); sets.push(`nombre = $${params.length}`);
  }
  if (req.body?.descripcion !== undefined) {
    params.push(limStr(req.body.descripcion, 240) || null); sets.push(`descripcion = $${params.length}`);
  }
  if (req.body?.icono !== undefined) {
    params.push(limStr(req.body.icono, 30) || 'clipboard'); sets.push(`icono = $${params.length}`);
  }
  if (req.body?.permiso_filas !== undefined) {
    const modo = ['todos', 'creador', 'responsable', 'admin'].includes(req.body.permiso_filas) ? req.body.permiso_filas : 'todos';
    params.push(modo); sets.push(`permiso_filas = $${params.length}`);
    if (modo === 'responsable') {
      const campo = await one('SELECT id FROM lista_campos WHERE id = $1 AND lista_id = $2 AND activo = true AND tipo = $3', [limStr(req.body?.permiso_campo, 80), lista.id, 'persona']);
      if (!campo) return res.status(400).json({ error: 'Elegí un campo de tipo Persona para el responsable de fila.' });
      params.push(campo.id); sets.push(`permiso_campo = $${params.length}`);
    } else {
      sets.push('permiso_campo = NULL');
    }
  }
  if (req.body?.permisos_categorias !== undefined) {
    const entrada = req.body.permisos_categorias;
    const limpio = {};
    if (entrada && typeof entrada === 'object' && !Array.isArray(entrada)) {
      const ids = Object.keys(entrada).map((x) => limStr(x, 80)).filter(Boolean);
      if (ids.length) {
        const validas = await query('SELECT id FROM categorias_acceso WHERE id = ANY($1)', [ids]);
        if (validas.length !== ids.length) return res.status(400).json({ error: 'Una de las categorías de permisos no existe.' });
      }
      for (const cat of ids) {
        const val = entrada[cat];
        if (!val || typeof val !== 'object') continue;
        limpio[cat] = {
          crear: val.crear !== false,
          editar: val.editar !== false,
          borrar: val.borrar !== false,
          vistas: val.vistas !== false,
        };
      }
    }
    params.push(JSON.stringify(limpio)); sets.push(`permisos_categorias = $${params.length}::jsonb`);
  }
  if (req.body?.acceso_solo_lectura !== undefined) {
    const ids = Array.isArray(req.body.acceso_solo_lectura)
      ? [...new Set(req.body.acceso_solo_lectura.map((x) => limStr(x, 80)).filter(Boolean))]
      : [];
    if (ids.length) {
      const validas = await query('SELECT id FROM categorias_acceso WHERE id = ANY($1)', [ids]);
      if (validas.length !== ids.length) return res.status(400).json({ error: 'Una de las categorías de solo lectura no existe.' });
    }
    params.push(JSON.stringify(ids)); sets.push(`acceso_solo_lectura = $${params.length}::jsonb`);
  }
  if (req.body?.acceso_categorias !== undefined) {
    const ids = Array.isArray(req.body.acceso_categorias)
      ? [...new Set(req.body.acceso_categorias.map((x) => limStr(x, 80)).filter(Boolean))]
      : [];
    if (ids.length) {
      const validas = await query('SELECT id FROM categorias_acceso WHERE id = ANY($1)', [ids]);
      if (validas.length !== ids.length) return res.status(400).json({ error: 'Una de las categorías seleccionadas no existe.' });
    }
    params.push(JSON.stringify(ids)); sets.push(`acceso_categorias = $${params.length}::jsonb`);
  }
  if (req.body?.aprobadores !== undefined) {
    const emails = Array.isArray(req.body.aprobadores)
      ? [...new Set(req.body.aprobadores.map((x) => limStr(x, 200).toLowerCase()).filter(Boolean))].slice(0, 10)
      : [];
    if (emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) return res.status(400).json({ error: 'Uno de los emails de aprobadores no es válido.' });
    params.push(JSON.stringify(emails)); sets.push(`aprobadores = $${params.length}::jsonb`);
  }
  if (req.body?.aprobador_email !== undefined) {
    const email = limStr(req.body.aprobador_email, 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'El email del aprobador no es válido.' });
    params.push(email || null); sets.push(`aprobador_email = $${params.length}`);
  }
  if (req.body?.aprobacion_dias !== undefined) {
    const dias = Math.max(1, Math.min(60, Number(req.body.aprobacion_dias) || 3));
    params.push(dias); sets.push(`aprobacion_dias = $${params.length}`);
  }
  if (req.body?.requiere_aprobacion !== undefined) {
    params.push(normalizarBooleano(req.body.requiere_aprobacion) === true);
    sets.push(`requiere_aprobacion = $${params.length}`);
  }
  if (req.body?.ver_filas !== undefined) {
    const modoVer = ['todos', 'creador', 'responsable', 'admin'].includes(req.body.ver_filas) ? req.body.ver_filas : 'todos';
    params.push(modoVer); sets.push(`ver_filas = $${params.length}`);
    if (modoVer === 'responsable') {
      const campoVer = await one('SELECT id FROM lista_campos WHERE id = $1 AND lista_id = $2 AND activo = true AND tipo = $3', [limStr(req.body?.ver_campo, 80), lista.id, 'persona']);
      if (!campoVer) return res.status(400).json({ error: 'Elegí un campo de tipo Persona para la visibilidad de fila.' });
      params.push(campoVer.id); sets.push(`ver_campo = $${params.length}`);
    } else {
      sets.push('ver_campo = NULL');
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
  params.push(new Date()); sets.push(`actualizado_en = $${params.length}`);
  params.push(lista.id);
  try {
    await query(`UPDATE listas SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe una lista con ese nombre en esta área.' });
    throw e;
  }
  await auditar({ req, tabla: 'listas', registroId: lista.id, accion: 'editar', antes: lista, despues: req.body });
  return res.json({ ok: true });
});

// Duplicar una lista copia SU ESTRUCTURA (campos y vistas), no los registros.
// Sirve como plantilla: Materiales, Herramientas, Insumos, etc.
listasRouter.post('/listas/:id/duplicar', authRequired, async (req, res) => {
  const origen = await listaConArea(req.params.id, req.user);
  if (!origen) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, origen.area_id).crear_listas) return sinPermiso(res, 'No tenés permiso para crear listas en esta área.');
  const nombre = limStr(req.body?.nombre, 80);
  if (nombre.length < 2) return res.status(400).json({ error: 'Poné un nombre de al menos 2 caracteres.' });
  const nuevoId = idNuevo('lst');
  try {
    await tx(async (client) => {
      await client.query(
        `INSERT INTO listas (id, area_id, nombre, descripcion, icono, creada_por, permiso_filas, ver_filas, requiere_aprobacion, acceso_categorias, acceso_solo_lectura)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)`,
        [nuevoId, origen.area_id, nombre, origen.descripcion, origen.icono, req.user.email, origen.permiso_filas || 'todos', origen.ver_filas || 'todos', origen.requiere_aprobacion === true, JSON.stringify(Array.isArray(origen.acceso_categorias) ? origen.acceso_categorias : []), JSON.stringify(Array.isArray(origen.acceso_solo_lectura) ? origen.acceso_solo_lectura : [])]
      );
      const campos = await client.query(
        'SELECT * FROM lista_campos WHERE lista_id = $1 AND activo = true ORDER BY orden, lower(nombre)',
        [origen.id]
      );
      const mapa = new Map();
      for (const c of campos.rows) {
        const nuevo = idNuevo('cam');
        mapa.set(c.id, nuevo);
        let configCampo = c.config || {};
        if (c.tipo === 'calculado' && configCampo.formula) {
          configCampo = {
            ...configCampo,
            formula: String(configCampo.formula).replace(/\{([^}]+)\}/g, (m, idCampo) => (mapa.has(idCampo) ? `{${mapa.get(idCampo)}}` : m)),
          };
        }
        await client.query(
          `INSERT INTO lista_campos (id, lista_id, nombre, tipo, config, requerido, unico, orden)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
          [nuevo, nuevoId, c.nombre, c.tipo, configCampo, c.requerido, c.unico, c.orden]
        );
      }
      if (origen.permiso_filas === 'responsable') {
        const nuevoResponsable = mapa.get(origen.permiso_campo) || null;
        if (nuevoResponsable) {
          await client.query('UPDATE listas SET permiso_campo = $2 WHERE id = $1', [nuevoId, nuevoResponsable]);
        } else {
          await client.query("UPDATE listas SET permiso_filas = 'todos', permiso_campo = NULL WHERE id = $1", [nuevoId]);
        }
      }
      if (origen.ver_filas === 'responsable') {
        const nuevoVer = mapa.get(origen.ver_campo) || null;
        if (nuevoVer) {
          await client.query('UPDATE listas SET ver_campo = $2 WHERE id = $1', [nuevoId, nuevoVer]);
        } else {
          await client.query("UPDATE listas SET ver_filas = 'todos', ver_campo = NULL WHERE id = $1", [nuevoId]);
        }
      }
      const vistas = await client.query('SELECT * FROM lista_vistas WHERE lista_id = $1 ORDER BY creado_en', [origen.id]);
      let primera = true;
      for (const v of vistas.rows) {
        let config = v.config || {};
        if (config.kanban && mapa.has(config.kanban)) config = { ...config, kanban: mapa.get(config.kanban) };
        if (config.titulo && mapa.has(config.titulo)) config = { ...config, titulo: mapa.get(config.titulo) };
        if (config.responsable && mapa.has(config.responsable)) config = { ...config, responsable: mapa.get(config.responsable) };
        if (Array.isArray(config.columnas)) config = { ...config, columnas: config.columnas.map((x) => mapa.get(x) || x) };
        if (Array.isArray(config.filtros)) config = { ...config, filtros: config.filtros.map((f) => ({ ...f, campo: mapa.get(f.campo) || f.campo })) };
        if (config.orden?.campo && mapa.has(config.orden.campo)) config = { ...config, orden: { ...config.orden, campo: mapa.get(config.orden.campo) } };
        if (config.agrupar && mapa.has(config.agrupar)) config = { ...config, agrupar: mapa.get(config.agrupar) };
        if (config.calendario && mapa.has(config.calendario)) config = { ...config, calendario: mapa.get(config.calendario) };
        if (config.galeria && mapa.has(config.galeria)) config = { ...config, galeria: mapa.get(config.galeria) };
        if (Array.isArray(config.formato)) config = { ...config, formato: config.formato.map((f) => ({ ...f, campo: mapa.get(f.campo) || f.campo })) };
        await client.query(
          `INSERT INTO lista_vistas (id, lista_id, nombre, tipo, config, visibilidad, creada_por, predeterminada)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
          [idNuevo('vis'), nuevoId, v.nombre, v.tipo, config, v.visibilidad, req.user.email, primera ? true : false]
        );
        primera = false;
      }
      if (primera) {
        await client.query(
          `INSERT INTO lista_vistas (id, lista_id, nombre, tipo, config, visibilidad, creada_por, predeterminada)
           VALUES ($1,$2,'Vista principal','grid','{}'::jsonb,'compartida',$3,true)`,
          [idNuevo('vis'), nuevoId, req.user.email]
        );
      }
    });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe una lista con ese nombre en esta área.' });
    throw e;
  }
  await auditar({ req, tabla: 'listas', registroId: nuevoId, accion: 'duplicar', detalle: `origen ${origen.id}` });
  return res.status(201).json({ id: nuevoId });
});

listasRouter.delete('/listas/:id', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).borrar_listas) return sinPermiso(res);
  await query(
    'UPDATE listas SET archivada = true, archivada_en = now(), archivada_por = $2 WHERE id = $1',
    [lista.id, req.user.email]
  );
  await auditar({ req, tabla: 'listas', registroId: lista.id, accion: 'archivar', antes: lista });
  return res.json({ ok: true });
});

// ---------- Campos ----------
listasRouter.post('/listas/:id/campos', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const nombre = limStr(req.body?.nombre, 80);
  if (nombre.length < 1) return res.status(400).json({ error: 'El campo necesita un nombre.' });
  const tipo = String(req.body?.tipo || 'texto');
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de campo inválido.' });
  const config = normalizarConfigCampo(tipo, req.body?.config);
  if ((tipo === 'seleccion' || tipo === 'multiseleccion') && !config.opciones.length) {
    return res.status(400).json({ error: 'Agregá al menos una opción para este campo.' });
  }
  if (tipo === 'relacion') {
    if (!config.lista_id) return res.status(400).json({ error: 'Elegí la lista con la que se relaciona este campo.' });
    const objetivo = await one('SELECT id, area_id FROM listas WHERE id = $1 AND archivada = false', [config.lista_id]);
    if (!objetivo) return res.status(400).json({ error: 'La lista relacionada no existe.' });
    if (objetivo.area_id !== lista.area_id) return res.status(400).json({ error: 'La lista relacionada tiene que ser del mismo área.' });
    if (config.campo_mostrar) {
      const campoMostrar = await one('SELECT id FROM lista_campos WHERE id = $1 AND lista_id = $2 AND activo = true', [config.campo_mostrar, config.lista_id]);
      if (!campoMostrar) return res.status(400).json({ error: 'El campo a mostrar no pertenece a la lista relacionada.' });
    }
  }
  if (tipo === 'calculado') {
    if (!config.formula) return res.status(400).json({ error: 'Escribí la fórmula del campo calculado.' });
    try { evaluarFormula(config.formula, {}); } catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const requerido = normalizarBooleano(req.body?.requerido) === true;
  const unico = normalizarBooleano(req.body?.unico) === true;
  const oculto = Array.isArray(req.body?.oculto_categorias) ? [...new Set(req.body.oculto_categorias.map((x) => limStr(x, 80)).filter(Boolean))] : [];
  const [max] = await query('SELECT COALESCE(MAX(orden), 0)::int AS n FROM lista_campos WHERE lista_id = $1', [lista.id]);
  const id = idNuevo('cam');
  try {
    await query(
      `INSERT INTO lista_campos (id, lista_id, nombre, tipo, config, requerido, unico, oculto_categorias, orden)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9)`,
      [id, lista.id, nombre, tipo, config, requerido, unico, JSON.stringify(oculto), Number(max.n) + 10]
    );
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe un campo con ese nombre en la lista.' });
    throw e;
  }
  await auditar({ req, tabla: 'lista_campos', registroId: id, accion: 'crear', despues: { listaId: lista.id, nombre, tipo, config, requerido, unico, oculto } });
  return res.status(201).json({ id });
});

listasRouter.patch('/lista-campos/:id', authRequired, async (req, res) => {
  const campo = await one('SELECT * FROM lista_campos WHERE id = $1 AND activo = true', [req.params.id]);
  if (!campo) return res.status(404).json({ error: 'Campo no encontrado' });
  const lista = await listaConArea(campo.lista_id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const sets = [];
  const params = [];
  if (req.body?.nombre !== undefined) {
    const nombre = limStr(req.body.nombre, 80);
    if (!nombre) return res.status(400).json({ error: 'El campo necesita un nombre.' });
    params.push(nombre); sets.push(`nombre = $${params.length}`);
  }
  if (req.body?.tipo !== undefined) {
    const tipo = String(req.body.tipo);
    if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de campo inválido.' });
    params.push(tipo); sets.push(`tipo = $${params.length}`);
  }
  if (req.body?.config !== undefined) {
    const tipo = req.body?.tipo !== undefined ? String(req.body.tipo) : campo.tipo;
    params.push(normalizarConfigCampo(tipo, req.body.config)); sets.push(`config = $${params.length}::jsonb`);
  }
  if (req.body?.requerido !== undefined) {
    params.push(normalizarBooleano(req.body.requerido) === true); sets.push(`requerido = $${params.length}`);
  }
  if (req.body?.unico !== undefined) {
    params.push(normalizarBooleano(req.body.unico) === true); sets.push(`unico = $${params.length}`);
  }
  if (req.body?.oculto_categorias !== undefined) {
    const ids = Array.isArray(req.body.oculto_categorias) ? [...new Set(req.body.oculto_categorias.map((x) => limStr(x, 80)).filter(Boolean))] : [];
    params.push(JSON.stringify(ids)); sets.push(`oculto_categorias = $${params.length}::jsonb`);
  }
  if (req.body?.orden !== undefined) {
    params.push(Math.max(0, Number(req.body.orden) || 0)); sets.push(`orden = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
  if ((req.body?.tipo || campo.tipo) === 'relacion') {
    const objetivoId = req.body?.config?.lista_id ?? campo.config?.lista_id;
    if (!objetivoId) return res.status(400).json({ error: 'Elegí la lista con la que se relaciona este campo.' });
    const objetivo = await one('SELECT id, area_id FROM listas WHERE id = $1 AND archivada = false', [objetivoId]);
    if (!objetivo) return res.status(400).json({ error: 'La lista relacionada no existe.' });
    if (objetivo.area_id !== lista.area_id) return res.status(400).json({ error: 'La lista relacionada tiene que ser del mismo área.' });
    const mostrarId = req.body?.config?.campo_mostrar ?? campo.config?.campo_mostrar;
    if (mostrarId) {
      const campoMostrar = await one('SELECT id FROM lista_campos WHERE id = $1 AND lista_id = $2 AND activo = true', [mostrarId, objetivoId]);
      if (!campoMostrar) return res.status(400).json({ error: 'El campo a mostrar no pertenece a la lista relacionada.' });
    }
  }
  if ((req.body?.tipo || campo.tipo) === 'calculado') {
    const formula = req.body?.config?.formula ?? campo.config?.formula;
    if (!formula) return res.status(400).json({ error: 'Escribí la fórmula del campo calculado.' });
    try { evaluarFormula(formula, {}); } catch (e) { return res.status(400).json({ error: e.message }); }
  }
  params.push(new Date()); sets.push(`actualizado_en = $${params.length}`);
  params.push(campo.id);
  try {
    await query(`UPDATE lista_campos SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe un campo con ese nombre en la lista.' });
    throw e;
  }
  await auditar({ req, tabla: 'lista_campos', registroId: campo.id, accion: 'editar', antes: campo, despues: req.body });
  return res.json({ ok: true });
});

listasRouter.delete('/lista-campos/:id', authRequired, async (req, res) => {
  const campo = await one('SELECT * FROM lista_campos WHERE id = $1 AND activo = true', [req.params.id]);
  if (!campo) return res.status(404).json({ error: 'Campo no encontrado' });
  const lista = await listaConArea(campo.lista_id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  await query('UPDATE lista_campos SET activo = false, actualizado_en = now() WHERE id = $1', [campo.id]);
  await auditar({ req, tabla: 'lista_campos', registroId: campo.id, accion: 'archivar', antes: campo });
  return res.json({ ok: true });
});

// ---------- Vistas ----------
listasRouter.post('/listas/:id/vistas', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidadesLista(req, lista).administrar_vistas) return sinPermiso(res);
  const nombre = limStr(req.body?.nombre, 80);
  if (!nombre) return res.status(400).json({ error: 'La vista necesita un nombre.' });
  const tipo = ['grid', 'kanban', 'form', 'calendar', 'gallery'].includes(req.body?.tipo) ? req.body.tipo : 'grid';
  const visibilidad = req.body?.visibilidad === 'personal' ? 'personal' : 'compartida';
  const config = normalizarVistaConfig(req.body?.config);
  const predeterminada = normalizarBooleano(req.body?.predeterminada) === true;
  const id = idNuevo('vis');
  await tx(async (client) => {
    if (predeterminada) await client.query('UPDATE lista_vistas SET predeterminada = false WHERE lista_id = $1', [lista.id]);
    await client.query(
      `INSERT INTO lista_vistas (id, lista_id, nombre, tipo, config, visibilidad, creada_por, predeterminada)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
      [id, lista.id, nombre, tipo, config, visibilidad, req.user.email, predeterminada]
    );
  });
  await auditar({ req, tabla: 'lista_vistas', registroId: id, accion: 'crear', despues: { listaId: lista.id, nombre, tipo, config } });
  return res.status(201).json({ id });
});

listasRouter.patch('/lista-vistas/:id', authRequired, async (req, res) => {
  const vista = await one('SELECT * FROM lista_vistas WHERE id = $1', [req.params.id]);
  if (!vista) return res.status(404).json({ error: 'Vista no encontrada' });
  const lista = await listaConArea(vista.lista_id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidadesLista(req, lista).administrar_vistas) return sinPermiso(res);
  if (vista.visibilidad === 'personal' && vista.creada_por !== req.user.email && req.user.rol !== 'admin') {
    return res.status(404).json({ error: 'Vista no encontrada' });
  }
  const sets = [];
  const params = [];
  if (req.body?.nombre !== undefined) {
    const nombre = limStr(req.body.nombre, 80);
    if (!nombre) return res.status(400).json({ error: 'La vista necesita un nombre.' });
    params.push(nombre); sets.push(`nombre = $${params.length}`);
  }
  if (req.body?.tipo !== undefined) {
    params.push(['grid', 'kanban', 'form', 'calendar', 'gallery'].includes(req.body.tipo) ? req.body.tipo : 'grid'); sets.push(`tipo = $${params.length}`);
  }
  if (req.body?.config !== undefined) {
    params.push(normalizarVistaConfig(req.body.config)); sets.push(`config = $${params.length}::jsonb`);
  }
  if (req.body?.visibilidad !== undefined) {
    params.push(req.body.visibilidad === 'personal' ? 'personal' : 'compartida'); sets.push(`visibilidad = $${params.length}`);
  }
  if (req.body?.predeterminada !== undefined) {
    const pred = normalizarBooleano(req.body.predeterminada) === true;
    if (pred) await query('UPDATE lista_vistas SET predeterminada = false WHERE lista_id = $1', [lista.id]);
    params.push(pred); sets.push(`predeterminada = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
  params.push(new Date()); sets.push(`actualizado_en = $${params.length}`);
  params.push(vista.id);
  await query(`UPDATE lista_vistas SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  await auditar({ req, tabla: 'lista_vistas', registroId: vista.id, accion: 'editar', antes: vista, despues: req.body });
  return res.json({ ok: true });
});

listasRouter.delete('/lista-vistas/:id', authRequired, async (req, res) => {
  const vista = await one('SELECT * FROM lista_vistas WHERE id = $1', [req.params.id]);
  if (!vista) return res.status(404).json({ error: 'Vista no encontrada' });
  const lista = await listaConArea(vista.lista_id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidadesLista(req, lista).administrar_vistas) return sinPermiso(res);
  if (vista.visibilidad === 'personal' && vista.creada_por !== req.user.email && req.user.rol !== 'admin') {
    return res.status(404).json({ error: 'Vista no encontrada' });
  }
  await query('DELETE FROM lista_vistas WHERE id = $1', [vista.id]);
  await auditar({ req, tabla: 'lista_vistas', registroId: vista.id, accion: 'borrar', antes: vista });
  return res.json({ ok: true });
});

// ---------- Registros ----------
listasRouter.get('/listas/:id/registros', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).ver_registros) return sinPermiso(res);
  const q = limStr(req.query?.q, 120);
  const params = [lista.id];
  const vis = filtroVisibilidad(req, lista, params.length + 1);
  let sql = `SELECT id, lista_id, datos, aprobacion_estado, creado_por, actualizado_por, creado_en, actualizado_en
               FROM lista_registros
              WHERE lista_id = $1 AND archivado = false ${vis.sql}`;
  params.push(...vis.params);
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    sql += ` AND datos::text ILIKE $${params.length}`;
  }
  const limit = Math.min(500, Math.max(1, Number(req.query?.limit) || 500));
  const offset = Math.max(0, Number(req.query?.offset) || 0);
  params.push(limit, offset);
  sql += ` ORDER BY creado_en DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const registros = await query(sql, params);
  const ocultos = idsCamposOcultos(req.user, await camposDe(lista.id));
  const regsVisibles = ocultos.size ? registros.map((r) => ({ ...r, datos: sinCamposOcultos(r.datos, ocultos) })) : registros;
  const paramsTotal = [lista.id, ...vis.params];
  const [total] = await query(`SELECT count(*)::int AS n FROM lista_registros WHERE lista_id = $1 AND archivado = false ${vis.sql}`, paramsTotal);
  return res.json({ registros: regsVisibles, total: total.n, restringido: Boolean(vis.sql) });
});

listasRouter.post('/listas/:id/registros', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidadesLista(req, lista).crear_registros) return sinPermiso(res, 'No tenés permiso para crear registros en esta lista.');
  const todos = await camposDe(lista.id);
  const ocultos = idsCamposOcultos(req.user, todos);
  const campos = camposVisibles(req.user, todos);
  const validado = validarRegistro(campos, req.body?.datos);
  if (!validado.ok) return res.status(400).json({ error: validado.error });
  let datosFinal = calcularCampos(todos, validado.datos);
  if (ocultos.size) datosFinal = sinCamposOcultos(datosFinal, ocultos);
  const relError = await validarRelaciones(todos, datosFinal);
  if (relError) return res.status(400).json({ error: relError });
  const conflicto = await conflictoUnico(lista.id, campos, datosFinal);
  if (conflicto) return res.status(400).json({ error: conflicto });
  const gestor = esGestorLista(req, lista);
  const requiere = lista.requiere_aprobacion === true;
  const estadoAprobacion = !requiere ? 'no_requiere' : gestor ? 'aprobado' : 'pendiente';
  const id = idNuevo('reg');
  let aprobacionAuto = null;
  await tx(async (client) => {
    await client.query(
      `INSERT INTO lista_registros (id, lista_id, datos, aprobacion_estado, creado_por, actualizado_por)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6)`,
      [id, lista.id, datosFinal, estadoAprobacion, req.user.email, req.user.email]
    );
    if (requiere && !gestor) {
      aprobacionAuto = await crearAprobacionAuto(client, lista, id, req.user.email, 'Solicitud automática al crear el registro.');
    }
    await guardarHistorial(client, lista.id, id, datosFinal, req.user.email, 'crear');
  });
  if (aprobacionAuto) avisarAprobadores(lista, aprobacionAuto, req.user.email);
  await auditar({ req, tabla: 'lista_registros', registroId: id, accion: 'crear', despues: { listaId: lista.id, datos: datosFinal, aprobacion_estado: estadoAprobacion } });
  evaluarReglas(lista, campos, datosFinal, 'crear', id, req);
  return res.status(201).json({ id, aprobacion_estado: estadoAprobacion });
});

listasRouter.patch('/lista-registros/:id', authRequired, async (req, res) => {
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND archivado = false', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  const lista = await listaConArea(registro.lista_id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidadesLista(req, lista).editar_registros) return sinPermiso(res, 'No tenés permiso para editar registros en esta lista.');
  if (!puedeEditarRegistro(req, lista, registro)) return sinPermiso(res, 'Este registro está reservado para su creador o responsable.');
  const bloqueo = bloqueoAprobacion(req, lista, registro);
  if (bloqueo) return res.status(409).json({ error: bloqueo });
  const todos = await camposDe(lista.id);
  const ocultos = idsCamposOcultos(req.user, todos);
  const campos = camposVisibles(req.user, todos);
  const combinados = { ...(esObjeto(registro.datos) ? registro.datos : {}), ...(esObjeto(req.body?.datos) ? req.body.datos : {}) };
  const validado = validarRegistro(campos, combinados);
  if (!validado.ok) return res.status(400).json({ error: validado.error });
  const datosFinal = calcularCampos(todos, validado.datos);
  for (const id of ocultos) {
    if (Object.prototype.hasOwnProperty.call(registro.datos || {}, id)) datosFinal[id] = registro.datos[id];
  }
  const relError = await validarRelaciones(todos, datosFinal);
  if (relError) return res.status(400).json({ error: relError });
  const conflicto = await conflictoUnico(lista.id, campos, datosFinal, registro.id);
  if (conflicto) return res.status(400).json({ error: conflicto });
  const gestor = esGestorLista(req, lista);
  const requiere = lista.requiere_aprobacion === true;
  const nuevoEstado = !requiere ? 'no_requiere' : gestor ? (registro.aprobacion_estado || 'aprobado') : 'pendiente';
  let aprobacionAuto = null;
  await tx(async (client) => {
    await client.query(
      'UPDATE lista_registros SET datos = $2::jsonb, aprobacion_estado = $3, actualizado_por = $4, actualizado_en = now() WHERE id = $1',
      [registro.id, datosFinal, nuevoEstado, req.user.email]
    );
    if (requiere && !gestor) {
      aprobacionAuto = await crearAprobacionAuto(client, lista, registro.id, req.user.email, 'Solicitud automática por cambios en el registro.');
    }
    await guardarHistorial(client, lista.id, registro.id, datosFinal, req.user.email, 'editar');
  });
  if (aprobacionAuto) avisarAprobadores(lista, aprobacionAuto, req.user.email);
  await auditar({ req, tabla: 'lista_registros', registroId: registro.id, accion: 'editar', antes: registro.datos, despues: { datos: datosFinal, aprobacion_estado: nuevoEstado } });
  evaluarReglas(lista, campos, datosFinal, 'editar', registro.id, req);
  return res.json({ ok: true });
});

function normalizarRegla(body, campos) {
  const nombre = limStr(body?.nombre, 80);
  if (!nombre) return { error: 'La regla necesita un nombre.' };
  const campoId = limStr(body?.campo, 80);
  const campo = (campos || []).find((c) => c.id === campoId);
  if (!campo) return { error: 'Elegí un campo válido para la regla.' };
  const op = ['contiene', 'igual', 'distinto', 'mayor', 'menor', 'vacio'].includes(body?.op) ? body.op : 'igual';
  const evento = ['crear', 'editar', 'ambos'].includes(body?.evento) ? body.evento : 'ambos';
  const accion = ['whatsapp', 'campo', 'webhook', 'orden'].includes(body?.accion) ? body.accion : 'email';
  const base = {
    nombre,
    campo: campo.id,
    op,
    valor: op === 'vacio' ? '' : limStr(body?.valor, 200),
    evento,
    accion,
    activo: body?.activo === undefined ? true : normalizarBooleano(body.activo),
    campo_destino: null,
    campo_serie: null,
    mensaje: null,
    destinatario: null,
    asunto: null,
  };
  if (accion === 'orden') {
    const clienteCampo = (campos || []).find((c) => c.id === limStr(body?.campo_destino, 80) && c.tipo === 'cliente');
    const serieCampo = (campos || []).find((c) => c.id === limStr(body?.campo_serie, 80));
    if (!clienteCampo) return { error: 'Elegí el campo Cliente que va a usar la orden.' };
    if (!serieCampo) return { error: 'Elegí el campo que va a aportar el número de serie.' };
    return {
      ...base,
      evento: 'crear',
      campo_destino: clienteCampo.id,
      campo_serie: serieCampo.id,
      mensaje: limStr(body?.mensaje, 500) || 'Orden creada automáticamente por una regla.',
      destinatario: null,
      asunto: null,
    };
  }
  if (accion === 'webhook') {
    const url = limStr(body?.mensaje, 500);
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const privado = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1'
        || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
      if (parsed.protocol !== 'https:' || privado) throw new Error('URL no permitida');
    } catch {
      return { error: 'El webhook tiene que ser una URL HTTPS pública.' };
    }
    return { ...base, campo_destino: null, mensaje: url, destinatario: null, asunto: null };
  }
  if (accion === 'campo') {
    const destino = (campos || []).find((c) => c.id === limStr(body?.campo_destino, 80) && c.tipo !== 'calculado');
    if (!destino) return { error: 'Elegí el campo que va a cambiar la regla.' };
    return {
      ...base,
      campo_destino: destino.id,
      mensaje: limStr(body?.mensaje, 1000) || null,
      destinatario: null,
      asunto: null,
    };
  }
  if (accion === 'whatsapp') {
    const destino = (campos || []).find((c) => c.id === limStr(body?.campo_destino, 80) && c.tipo === 'telefono');
    if (!destino) return { error: 'Elegí un campo de teléfono para el aviso por WhatsApp.' };
    return {
      ...base,
      campo_destino: destino.id,
      mensaje: limStr(body?.mensaje, 1000) || null,
      destinatario: null,
      asunto: null,
    };
  }
  const destinatario = limStr(body?.destinatario, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) return { error: 'El email del aviso no es válido.' };
  return {
    ...base,
    campo_destino: null,
    mensaje: null,
    destinatario,
    asunto: limStr(body?.asunto, 160) || null,
  };
}

listasRouter.get('/listas/:id/reglas', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const reglas = await query('SELECT * FROM lista_reglas WHERE lista_id = $1 ORDER BY creado_en DESC', [lista.id]);
  return res.json(reglas);
});

listasRouter.post('/listas/:id/reglas', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const campos = await camposDe(lista.id);
  const regla = normalizarRegla(req.body, campos);
  if (regla.error) return res.status(400).json({ error: regla.error });
  const id = idNuevo('regla');
  const fila = await one(
    `INSERT INTO lista_reglas (id, lista_id, nombre, activo, evento, campo, op, valor, destinatario, asunto, accion, campo_destino, campo_serie, mensaje, creada_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [id, lista.id, regla.nombre, regla.activo, regla.evento, regla.campo, regla.op, regla.valor, regla.destinatario, regla.asunto, regla.accion, regla.campo_destino, regla.campo_serie, regla.mensaje, req.user.email]
  );
  await auditar({ req, tabla: 'lista_reglas', registroId: id, accion: 'crear', despues: fila });
  return res.status(201).json(fila);
});

listasRouter.patch('/lista-reglas/:id', authRequired, async (req, res) => {
  const regla = await one('SELECT * FROM lista_reglas WHERE id = $1', [req.params.id]);
  if (!regla) return res.status(404).json({ error: 'Regla no encontrada' });
  const lista = await listaConArea(regla.lista_id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const campos = await camposDe(lista.id);
  const datos = normalizarRegla({ ...regla, ...req.body }, campos);
  if (datos.error) return res.status(400).json({ error: datos.error });
  const fila = await one(
    `UPDATE lista_reglas SET nombre=$2, activo=$3, evento=$4, campo=$5, op=$6, valor=$7, destinatario=$8, asunto=$9,
       accion=$10, campo_destino=$11, campo_serie=$12, mensaje=$13 WHERE id=$1 RETURNING *`,
    [regla.id, datos.nombre, datos.activo, datos.evento, datos.campo, datos.op, datos.valor, datos.destinatario, datos.asunto, datos.accion, datos.campo_destino, datos.campo_serie, datos.mensaje]
  );
  await auditar({ req, tabla: 'lista_reglas', registroId: regla.id, accion: 'editar', antes: regla, despues: fila });
  return res.json(fila);
});

listasRouter.delete('/lista-reglas/:id', authRequired, async (req, res) => {
  const regla = await one('SELECT * FROM lista_reglas WHERE id = $1', [req.params.id]);
  if (!regla) return res.status(404).json({ error: 'Regla no encontrada' });
  const lista = await listaConArea(regla.lista_id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  await query('DELETE FROM lista_reglas WHERE id = $1', [regla.id]);
  await auditar({ req, tabla: 'lista_reglas', registroId: regla.id, accion: 'borrar', antes: regla });
  return res.json({ ok: true });
});

async function avisarAprobadores(lista, aprobacion, solicitante, decision = false) {
  try {
    const link = `${PUBLIC_URL}/listas/${lista.area_slug}/${lista.id}`;
    if (decision) {
      if (!aprobacion.solicitado_por) return;
      const texto = `Tu solicitud de aprobación en ${lista.nombre} fue ${aprobacion.estado}.\n${aprobacion.comentario || ''}\n${link}`;
      await avisarPorMail(aprobacion.solicitado_por, `Bertika · aprobación ${aprobacion.estado} en ${lista.nombre}`, texto, `<p>Tu solicitud en <b>${lista.nombre}</b> fue <b>${aprobacion.estado}</b>.</p><p>${aprobacion.comentario || ''}</p><p><a href="${link}">Abrir la lista</a></p>`);
      await notificarLista(aprobacion.solicitado_por, {
        titulo: `Aprobación ${aprobacion.estado}`,
        mensaje: `Tu solicitud en ${lista.nombre} fue ${aprobacion.estado}.`,
        link: `/listas/${lista.area_slug}/${lista.id}`,
        tipo: 'aprobacion',
      });
      return;
    }
    const rows = await query(`
      SELECT DISTINCT u.email FROM usuarios u
        LEFT JOIN categorias_acceso c ON c.id = u.categoria_id
       WHERE u.activo = true AND (
         u.rol = 'admin' OR (c.areas -> $1 ->> 'editar_listas')::boolean = true
       )
    `, [lista.area_id]);
    const correos = aprobacion.aprobador
      ? new Set([aprobacion.aprobador])
      : new Set(rows.map((r) => r.email).filter(Boolean));
    if (!aprobacion.aprobador && lista.creada_por) correos.add(lista.creada_por);
    correos.delete(solicitante);
    for (const email of correos) {
      const texto = `${solicitante} solicitó aprobar un registro en ${lista.nombre}.\n${aprobacion.comentario || ''}\n${link}`;
      await avisarPorMail(email, `Bertika · aprobación pendiente en ${lista.nombre}`, texto, `<p><b>${solicitante}</b> solicitó aprobar un registro en <b>${lista.nombre}</b>.</p><p>${aprobacion.comentario || ''}</p><p><a href="${link}">Abrir la lista</a></p>`);
      await notificarLista(email, {
        titulo: 'Aprobación pendiente',
        mensaje: `${solicitante} solicitó aprobar un registro en ${lista.nombre}.`,
        link: `/listas/${lista.area_slug}/${lista.id}`,
        tipo: 'aprobacion',
      });
    }
  } catch (e) {
    console.error('[listas] no se pudo avisar la aprobación:', e.message);
  }
}

// ---------- Aprobaciones de registros ----------
listasRouter.get('/listas/:id/registros/:rid/aprobaciones', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).ver_registros) return sinPermiso(res);
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND lista_id = $2 AND archivado = false', [req.params.rid, lista.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  if (!puedeVerRegistro(req, lista, registro)) return sinPermiso(res, 'No tenés acceso a este registro.');
  const filas = await query(`
    SELECT id, estado, solicitado_por, decidido_por, aprobador, comentario, decidido_en, fecha_limite, paso, creado_en
      FROM lista_aprobaciones WHERE registro_id = $1 ORDER BY creado_en DESC LIMIT 50
  `, [registro.id]);
  return res.json(filas);
});

listasRouter.post('/listas/:id/registros/:rid/aprobaciones', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidadesLista(req, lista).editar_registros) return sinPermiso(res);
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND lista_id = $2 AND archivado = false', [req.params.rid, lista.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  if (!puedeVerRegistro(req, lista, registro)) return sinPermiso(res, 'No tenés acceso a este registro.');
  if (!puedeEditarRegistro(req, lista, registro)) return sinPermiso(res, 'Este registro está reservado para su creador o responsable.');
  const pendiente = await one("SELECT id FROM lista_aprobaciones WHERE registro_id = $1 AND estado = 'pendiente'", [registro.id]);
  if (pendiente) return res.status(400).json({ error: 'Ya hay una aprobación pendiente para este registro.' });
  const comentario = limStr(req.body?.comentario, 1000) || null;
  const id = idNuevo('apr');
  const cadena = Array.isArray(lista.aprobadores) && lista.aprobadores.length ? lista.aprobadores : (lista.aprobador_email ? [lista.aprobador_email] : []);
  const aprobador = cadena[0] || null;
  const dias = Math.max(1, Number(lista.aprobacion_dias) || 3);
  const fila = await one(
    `INSERT INTO lista_aprobaciones (id, lista_id, registro_id, solicitado_por, aprobador, comentario, fecha_limite, paso)
     VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' days')::interval, 0)
     RETURNING id, estado, solicitado_por, decidido_por, aprobador, comentario, decidido_en, fecha_limite, creado_en, paso`,
    [id, lista.id, registro.id, req.user.email, aprobador, comentario, String(dias)]
  );
  if (lista.requiere_aprobacion) {
    await query("UPDATE lista_registros SET aprobacion_estado = 'pendiente' WHERE id = $1", [registro.id]);
  }
  await auditar({ req, tabla: 'lista_aprobaciones', registroId: id, accion: 'solicitar', detalle: registro.id });
  avisarAprobadores(lista, fila, req.user.email);
  return res.status(201).json(fila);
});

listasRouter.patch('/lista-aprobaciones/:id', authRequired, async (req, res) => {
  const aprobacion = await one('SELECT * FROM lista_aprobaciones WHERE id = $1', [req.params.id]);
  if (!aprobacion) return res.status(404).json({ error: 'Aprobación no encontrada' });
  const lista = await listaConArea(aprobacion.lista_id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res, 'Solo quien administra la lista puede aprobar o rechazar.');
  if (aprobacion.aprobador && req.user.rol !== 'admin' && req.user.email !== aprobacion.aprobador) {
    return res.status(403).json({ error: `Esta aprobación está asignada a ${aprobacion.aprobador}.` });
  }
  if (aprobacion.estado !== 'pendiente') return res.status(400).json({ error: 'Esta aprobación ya fue decidida.' });
  const estado = req.body?.estado === 'aprobado' ? 'aprobado' : req.body?.estado === 'rechazado' ? 'rechazado' : null;
  if (!estado) return res.status(400).json({ error: 'Elegí aprobar o rechazar.' });
  const comentario = limStr(req.body?.comentario, 1000) || null;
  const cadena = Array.isArray(lista.aprobadores) && lista.aprobadores.length ? lista.aprobadores : (lista.aprobador_email ? [lista.aprobador_email] : []);
  const paso = Math.max(0, Number(aprobacion.paso) || 0);
  const siguiente = estado === 'aprobado' ? cadena[paso + 1] : null;
  if (siguiente) {
    const dias = Math.max(1, Number(lista.aprobacion_dias) || 3);
    const fila = await one(
      `UPDATE lista_aprobaciones SET paso = $2, aprobador = $3, fecha_limite = now() + ($4 || ' days')::interval, comentario = COALESCE($5, comentario)
        WHERE id = $1 RETURNING id, estado, solicitado_por, decidido_por, aprobador, comentario, decidido_en, fecha_limite, paso, creado_en`,
      [aprobacion.id, paso + 1, siguiente, String(dias), comentario]
    );
    await auditar({ req, tabla: 'lista_aprobaciones', registroId: aprobacion.id, accion: 'paso_aprobado', detalle: `${paso + 1} → ${siguiente}` });
    avisarAprobadores(lista, fila, req.user.email, false);
    return res.json({ ...fila, siguiente: true });
  }
  const fila = await one(
    `UPDATE lista_aprobaciones SET estado = $2, decidido_por = $3, comentario = COALESCE($4, comentario), decidido_en = now()
      WHERE id = $1 RETURNING id, estado, solicitado_por, decidido_por, aprobador, comentario, decidido_en, fecha_limite, paso, creado_en`,
    [aprobacion.id, estado, req.user.email, comentario]
  );
  if (lista.requiere_aprobacion) {
    await query('UPDATE lista_registros SET aprobacion_estado = $2 WHERE id = $1', [aprobacion.registro_id, estado]);
  }
  await auditar({ req, tabla: 'lista_aprobaciones', registroId: aprobacion.id, accion: estado, detalle: aprobacion.registro_id });
  avisarAprobadores(lista, fila, req.user.email, true);
  return res.json(fila);
});

listasRouter.get('/listas/:id/registros/:rid/comentarios', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).ver_registros) return sinPermiso(res);
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND lista_id = $2 AND archivado = false', [req.params.rid, lista.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  if (!puedeVerRegistro(req, lista, registro)) return sinPermiso(res, 'No tenés acceso a este registro.');
  const filas = await query(`
    SELECT id, autor, texto, menciones, creado_en
      FROM lista_comentarios
     WHERE registro_id = $1
     ORDER BY creado_en ASC
     LIMIT 500
  `, [registro.id]);
  return res.json(filas);
});

listasRouter.post('/listas/:id/registros/:rid/comentarios', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).ver_registros) return sinPermiso(res);
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND lista_id = $2 AND archivado = false', [req.params.rid, lista.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  if (!puedeVerRegistro(req, lista, registro)) return sinPermiso(res, 'No tenés acceso a este registro.');
  const texto = limStr(req.body?.texto, 2000);
  if (!texto) return res.status(400).json({ error: 'Escribí un comentario.' });
  const emails = [...new Set((texto.match(/@[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}/g) || []).map((m) => m.slice(1).toLowerCase()))].slice(0, 10);
  const id = idNuevo('com');
  const fila = await one(
    `INSERT INTO lista_comentarios (id, lista_id, registro_id, autor, texto, menciones)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     RETURNING id, autor, texto, menciones, creado_en`,
    [id, lista.id, registro.id, req.user.email, texto, JSON.stringify(emails)]
  );
  for (const email of emails) {
    const u = await one('SELECT email FROM usuarios WHERE LOWER(email) = $1 AND activo = true', [email]);
    if (!u) continue;
    const link = `${PUBLIC_URL}/listas/${lista.area_slug}/${lista.id}`;
    const html = `<p><b>${req.user.email}</b> te mencionó en la lista <b>${lista.nombre}</b>.</p>
      <blockquote>${texto.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</blockquote>
      <p><a href="${link}">Abrir la lista</a></p>`;
    await avisarPorMail(u.email, `Bertika · mención en ${lista.nombre}`, `${req.user.email} te mencionó: ${texto}`, html);
    await notificarLista(u.email, {
      titulo: `Mención en ${lista.nombre}`,
      mensaje: `${req.user.email} te mencionó: ${texto.slice(0, 180)}`,
      link: `/listas/${lista.area_slug}/${lista.id}`,
      tipo: 'mencion',
    });
  }
  await auditar({ req, tabla: 'lista_comentarios', registroId: id, accion: 'crear', detalle: `registro ${registro.id}` });
  return res.status(201).json(fila);
});

listasRouter.get('/listas/:id/registros/:rid/historial', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).ver_registros) return sinPermiso(res);
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND lista_id = $2', [req.params.rid, lista.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  if (!puedeVerRegistro(req, lista, registro)) return sinPermiso(res, 'No tenés acceso a este registro.');
  const filas = await query(`
    SELECT id, datos, usuario, accion, creado_en
      FROM lista_registros_historial
     WHERE registro_id = $1
     ORDER BY creado_en DESC
     LIMIT 100
  `, [registro.id]);
  const ocultos = idsCamposOcultos(req.user, await camposDe(registro.lista_id));
  return res.json(ocultos.size ? filas.map((f) => ({ ...f, datos: sinCamposOcultos(f.datos, ocultos) })) : filas);
});

listasRouter.patch('/lista-registros/:id/historial/:histId/restaurar', authRequired, async (req, res) => {
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND archivado = false', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  const lista = await listaConArea(registro.lista_id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidadesLista(req, lista).editar_registros) return sinPermiso(res);
  if (!puedeEditarRegistro(req, lista, registro)) return sinPermiso(res, 'Este registro está reservado para su creador o responsable.');
  const bloqueo = bloqueoAprobacion(req, lista, registro);
  if (bloqueo) return res.status(409).json({ error: bloqueo });
  const version = await one('SELECT * FROM lista_registros_historial WHERE id = $1 AND registro_id = $2', [req.params.histId, registro.id]);
  if (!version) return res.status(404).json({ error: 'Versión no encontrada' });
  await tx(async (client) => {
    await client.query('UPDATE lista_registros SET datos = $2::jsonb, actualizado_por = $3, actualizado_en = now() WHERE id = $1', [registro.id, version.datos, req.user.email]);
    await guardarHistorial(client, lista.id, registro.id, version.datos, req.user.email, 'restaurar');
  });
  await auditar({ req, tabla: 'lista_registros', registroId: registro.id, accion: 'restaurar_version', detalle: version.id });
  return res.json({ ok: true });
});

listasRouter.get('/listas/:id/registros-archivados', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidadesLista(req, lista).borrar_registros && !capacidadesLista(req, lista).editar_registros) {
    return sinPermiso(res);
  }
  const filas = await query(`
    SELECT id, lista_id, datos, creado_por, actualizado_por, creado_en, actualizado_en, archivado_en, archivado_por
      FROM lista_registros
     WHERE lista_id = $1 AND archivado = true
     ORDER BY archivado_en DESC NULLS LAST
     LIMIT 200
  `, [lista.id]);
  return res.json(filas);
});

listasRouter.patch('/lista-registros/:id/restaurar', authRequired, async (req, res) => {
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND archivado = true', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Registro archivado no encontrado' });
  const lista = await listaConArea(registro.lista_id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidadesLista(req, lista).borrar_registros) return sinPermiso(res);
  if (!puedeEditarRegistro(req, lista, registro)) return sinPermiso(res, 'Este registro está reservado para su creador o responsable.');
  await query('UPDATE lista_registros SET archivado = false, archivado_en = NULL, archivado_por = NULL, actualizado_por = $2, actualizado_en = now() WHERE id = $1', [registro.id, req.user.email]);
  await auditar({ req, tabla: 'lista_registros', registroId: registro.id, accion: 'restaurar' });
  return res.json({ ok: true });
});

listasRouter.delete('/lista-registros/:id', authRequired, async (req, res) => {
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND archivado = false', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  const lista = await listaConArea(registro.lista_id, req.user);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidadesLista(req, lista).borrar_registros) return sinPermiso(res, 'No tenés permiso para archivar registros en esta lista.');
  if (!puedeEditarRegistro(req, lista, registro)) return sinPermiso(res, 'Este registro está reservado para su creador o responsable.');
  const bloqueo = bloqueoAprobacion(req, lista, registro);
  if (bloqueo) return res.status(409).json({ error: bloqueo });
  await query(
    'UPDATE lista_registros SET archivado = true, archivado_en = now(), archivado_por = $2 WHERE id = $1',
    [registro.id, req.user.email]
  );
  await auditar({ req, tabla: 'lista_registros', registroId: registro.id, accion: 'archivar', antes: registro.datos });
  return res.json({ ok: true });
});
