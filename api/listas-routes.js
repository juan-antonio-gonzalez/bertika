// Bertika - API del motor de listas dinamicas.
//
// Cada lista guarda su definicion (campos y vistas) en tablas de metadatos y
// sus filas en JSONB. Los permisos se resuelven SIEMPRE en el servidor contra
// el area de la lista y la categoria del usuario: el frontend solo dibuja.
import { Router } from 'express';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { query, one, tx } from './db.js';
import { authRequired } from './middleware/auth.js';
import { auditar } from './auditoria.js';
import { normalizarBooleano } from './validaciones.js';
import {
  CLAVES_AREA, TIPOS, normalizarOpciones, permisosArea, validarRegistro, evaluarFormula,
} from './listas.js';

export const listasRouter = Router();

const limStr = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const esObjeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const idNuevo = (prefijo) => `${prefijo}_${randomUUID()}`;
const TODAS = Object.fromEntries(CLAVES_AREA.map((k) => [k, true]));
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
      const html = `<p>Se cumplió la regla <b>${regla.nombre}</b> en la lista <b>${lista.nombre}</b>.</p>
        <p>${campo?.nombre || 'Campo'}: ${resumen}</p><p><a href="${link}">Abrir la lista</a></p>`;
      await avisarPorMail(regla.destinatario, regla.asunto || `Bertika · aviso de ${lista.nombre}`, texto, html);
      await auditar({ req, tabla: 'lista_reglas', registroId: regla.id, accion: 'disparar', detalle: `registro ${registroId}` });
    }
  } catch (e) {
    console.error('[listas] no se pudieron evaluar las reglas:', e.message);
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

async function areasVisibles(user) {
  if (!user || user.rol === 'cliente') return [];
  const areas = await query('SELECT id, slug, nombre, descripcion, icono, orden FROM areas WHERE activo = true ORDER BY orden, nombre');
  const listas = await query(`
    SELECT id, area_id, nombre, descripcion, icono, orden
      FROM listas
     WHERE archivada = false
     ORDER BY orden, lower(nombre)
  `);
  return areas
    .filter((a) => user.rol === 'admin' || permisosArea(user.areas, a.id).ver)
    .map((a) => ({
      ...a,
      puede: user.rol === 'admin' ? TODAS : permisosArea(user.areas, a.id),
      listas: listas.filter((l) => l.area_id === a.id),
    }));
}

// Se exporta para que /api/estado arme el menú dinámico en el mismo request.
export { areasVisibles };

async function listaConArea(id) {
  return one(`
    SELECT l.*, a.slug AS area_slug, a.nombre AS area_nombre
      FROM listas l
      JOIN areas a ON a.id = l.area_id
     WHERE l.id = $1 AND l.archivada = false
  `, [id]);
}

async function camposDe(listaId) {
  return query(`
    SELECT id, lista_id, nombre, tipo, config, requerido, unico, orden, activo,
           creado_en, actualizado_en
      FROM lista_campos
     WHERE lista_id = $1 AND activo = true
     ORDER BY orden, lower(nombre)
  `, [listaId]);
}

async function vistasDe(listaId) {
  return query(`
    SELECT id, lista_id, nombre, tipo, config, visibilidad, creada_por,
           creado_en, actualizado_en, predeterminada
      FROM lista_vistas
     WHERE lista_id = $1
     ORDER BY predeterminada DESC, creado_en
  `, [listaId]);
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
           a.nombre AS area_nombre
      FROM listas l JOIN areas a ON a.id = l.area_id
     WHERE l.archivada = true ${where.length ? `AND ${where.join(' AND ')}` : ''}
     ORDER BY l.archivada_en DESC NULLS LAST
     LIMIT 200
  `, params);
  return res.json(filas);
});

listasRouter.patch('/listas/:id/restaurar', authRequired, async (req, res) => {
  const lista = await one(`
    SELECT l.*, a.slug AS area_slug FROM listas l JOIN areas a ON a.id = l.area_id
     WHERE l.id = $1 AND l.archivada = true
  `, [req.params.id]);
  if (!lista) return res.status(404).json({ error: 'Lista archivada no encontrada' });
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

listasRouter.get('/listas/:id', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  const cap = capacidades(req, lista.area_id);
  if (!cap.ver) return sinPermiso(res, 'No tenés acceso a esta área.');
  const [campos, vistas] = await Promise.all([camposDe(lista.id), vistasDe(lista.id)]);
  return res.json({ ...lista, campos, vistas, puede: cap });
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
  const lista = await listaConArea(req.params.id);
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
  const origen = await listaConArea(req.params.id);
  if (!origen) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, origen.area_id).crear_listas) return sinPermiso(res, 'No tenés permiso para crear listas en esta área.');
  const nombre = limStr(req.body?.nombre, 80);
  if (nombre.length < 2) return res.status(400).json({ error: 'Poné un nombre de al menos 2 caracteres.' });
  const nuevoId = idNuevo('lst');
  try {
    await tx(async (client) => {
      await client.query(
        `INSERT INTO listas (id, area_id, nombre, descripcion, icono, creada_por)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [nuevoId, origen.area_id, nombre, origen.descripcion, origen.icono, req.user.email]
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
  const lista = await listaConArea(req.params.id);
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
  const lista = await listaConArea(req.params.id);
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
  const [max] = await query('SELECT COALESCE(MAX(orden), 0)::int AS n FROM lista_campos WHERE lista_id = $1', [lista.id]);
  const id = idNuevo('cam');
  try {
    await query(
      `INSERT INTO lista_campos (id, lista_id, nombre, tipo, config, requerido, unico, orden)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
      [id, lista.id, nombre, tipo, config, requerido, unico, Number(max.n) + 10]
    );
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe un campo con ese nombre en la lista.' });
    throw e;
  }
  await auditar({ req, tabla: 'lista_campos', registroId: id, accion: 'crear', despues: { listaId: lista.id, nombre, tipo, config, requerido, unico } });
  return res.status(201).json({ id });
});

listasRouter.patch('/lista-campos/:id', authRequired, async (req, res) => {
  const campo = await one('SELECT * FROM lista_campos WHERE id = $1 AND activo = true', [req.params.id]);
  if (!campo) return res.status(404).json({ error: 'Campo no encontrado' });
  const lista = await listaConArea(campo.lista_id);
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
  const lista = await listaConArea(campo.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  await query('UPDATE lista_campos SET activo = false, actualizado_en = now() WHERE id = $1', [campo.id]);
  await auditar({ req, tabla: 'lista_campos', registroId: campo.id, accion: 'archivar', antes: campo });
  return res.json({ ok: true });
});

// ---------- Vistas ----------
listasRouter.post('/listas/:id/vistas', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).administrar_vistas) return sinPermiso(res);
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
  const lista = await listaConArea(vista.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).administrar_vistas) return sinPermiso(res);
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
  const lista = await listaConArea(vista.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).administrar_vistas) return sinPermiso(res);
  await query('DELETE FROM lista_vistas WHERE id = $1', [vista.id]);
  await auditar({ req, tabla: 'lista_vistas', registroId: vista.id, accion: 'borrar', antes: vista });
  return res.json({ ok: true });
});

// ---------- Registros ----------
listasRouter.get('/listas/:id/registros', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).ver_registros) return sinPermiso(res);
  const q = limStr(req.query?.q, 120);
  const params = [lista.id];
  let sql = `SELECT id, lista_id, datos, creado_por, actualizado_por, creado_en, actualizado_en
               FROM lista_registros
              WHERE lista_id = $1 AND archivado = false`;
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    sql += ` AND datos::text ILIKE $${params.length}`;
  }
  sql += ' ORDER BY creado_en DESC LIMIT 500';
  const registros = await query(sql, params);
  const [total] = await query('SELECT count(*)::int AS n FROM lista_registros WHERE lista_id = $1 AND archivado = false', [lista.id]);
  return res.json({ registros, total: total.n });
});

listasRouter.post('/listas/:id/registros', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).crear_registros) return sinPermiso(res, 'No tenés permiso para crear registros en esta lista.');
  const campos = await camposDe(lista.id);
  const validado = validarRegistro(campos, req.body?.datos);
  if (!validado.ok) return res.status(400).json({ error: validado.error });
  const datosFinal = calcularCampos(campos, validado.datos);
  const relError = await validarRelaciones(campos, datosFinal);
  if (relError) return res.status(400).json({ error: relError });
  const conflicto = await conflictoUnico(lista.id, campos, datosFinal);
  if (conflicto) return res.status(400).json({ error: conflicto });
  const id = idNuevo('reg');
  await tx(async (client) => {
    await client.query(
      `INSERT INTO lista_registros (id, lista_id, datos, creado_por, actualizado_por)
       VALUES ($1,$2,$3::jsonb,$4,$5)`,
      [id, lista.id, datosFinal, req.user.email, req.user.email]
    );
    await guardarHistorial(client, lista.id, id, datosFinal, req.user.email, 'crear');
  });
  await auditar({ req, tabla: 'lista_registros', registroId: id, accion: 'crear', despues: { listaId: lista.id, datos: datosFinal } });
  evaluarReglas(lista, campos, datosFinal, 'crear', id, req);
  return res.status(201).json({ id });
});

listasRouter.patch('/lista-registros/:id', authRequired, async (req, res) => {
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND archivado = false', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  const lista = await listaConArea(registro.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_registros) return sinPermiso(res, 'No tenés permiso para editar registros en esta lista.');
  const campos = await camposDe(lista.id);
  const combinados = { ...(esObjeto(registro.datos) ? registro.datos : {}), ...(esObjeto(req.body?.datos) ? req.body.datos : {}) };
  const validado = validarRegistro(campos, combinados);
  if (!validado.ok) return res.status(400).json({ error: validado.error });
  const datosFinal = calcularCampos(campos, validado.datos);
  const relError = await validarRelaciones(campos, datosFinal);
  if (relError) return res.status(400).json({ error: relError });
  const conflicto = await conflictoUnico(lista.id, campos, datosFinal, registro.id);
  if (conflicto) return res.status(400).json({ error: conflicto });
  await tx(async (client) => {
    await client.query(
      'UPDATE lista_registros SET datos = $2::jsonb, actualizado_por = $3, actualizado_en = now() WHERE id = $1',
      [registro.id, datosFinal, req.user.email]
    );
    await guardarHistorial(client, lista.id, registro.id, datosFinal, req.user.email, 'editar');
  });
  await auditar({ req, tabla: 'lista_registros', registroId: registro.id, accion: 'editar', antes: registro.datos, despues: datosFinal });
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
  const destinatario = limStr(body?.destinatario, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) return { error: 'El email del aviso no es válido.' };
  return {
    nombre,
    campo: campo.id,
    op,
    valor: op === 'vacio' ? '' : limStr(body?.valor, 200),
    evento,
    destinatario,
    asunto: limStr(body?.asunto, 160) || null,
    activo: body?.activo === undefined ? true : normalizarBooleano(body.activo),
  };
}

listasRouter.get('/listas/:id/reglas', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const reglas = await query('SELECT * FROM lista_reglas WHERE lista_id = $1 ORDER BY creado_en DESC', [lista.id]);
  return res.json(reglas);
});

listasRouter.post('/listas/:id/reglas', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const campos = await camposDe(lista.id);
  const regla = normalizarRegla(req.body, campos);
  if (regla.error) return res.status(400).json({ error: regla.error });
  const id = idNuevo('regla');
  const fila = await one(
    `INSERT INTO lista_reglas (id, lista_id, nombre, activo, evento, campo, op, valor, destinatario, asunto, creada_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [id, lista.id, regla.nombre, regla.activo, regla.evento, regla.campo, regla.op, regla.valor, regla.destinatario, regla.asunto, req.user.email]
  );
  await auditar({ req, tabla: 'lista_reglas', registroId: id, accion: 'crear', despues: fila });
  return res.status(201).json(fila);
});

listasRouter.patch('/lista-reglas/:id', authRequired, async (req, res) => {
  const regla = await one('SELECT * FROM lista_reglas WHERE id = $1', [req.params.id]);
  if (!regla) return res.status(404).json({ error: 'Regla no encontrada' });
  const lista = await listaConArea(regla.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  const campos = await camposDe(lista.id);
  const datos = normalizarRegla({ ...regla, ...req.body }, campos);
  if (datos.error) return res.status(400).json({ error: datos.error });
  const fila = await one(
    `UPDATE lista_reglas SET nombre=$2, activo=$3, evento=$4, campo=$5, op=$6, valor=$7, destinatario=$8, asunto=$9
      WHERE id=$1 RETURNING *`,
    [regla.id, datos.nombre, datos.activo, datos.evento, datos.campo, datos.op, datos.valor, datos.destinatario, datos.asunto]
  );
  await auditar({ req, tabla: 'lista_reglas', registroId: regla.id, accion: 'editar', antes: regla, despues: fila });
  return res.json(fila);
});

listasRouter.delete('/lista-reglas/:id', authRequired, async (req, res) => {
  const regla = await one('SELECT * FROM lista_reglas WHERE id = $1', [req.params.id]);
  if (!regla) return res.status(404).json({ error: 'Regla no encontrada' });
  const lista = await listaConArea(regla.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_listas) return sinPermiso(res);
  await query('DELETE FROM lista_reglas WHERE id = $1', [regla.id]);
  await auditar({ req, tabla: 'lista_reglas', registroId: regla.id, accion: 'borrar', antes: regla });
  return res.json({ ok: true });
});

listasRouter.get('/listas/:id/registros/:rid/comentarios', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).ver_registros) return sinPermiso(res);
  const registro = await one('SELECT id FROM lista_registros WHERE id = $1 AND lista_id = $2 AND archivado = false', [req.params.rid, lista.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
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
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).ver_registros) return sinPermiso(res);
  const registro = await one('SELECT id, datos FROM lista_registros WHERE id = $1 AND lista_id = $2 AND archivado = false', [req.params.rid, lista.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
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
  }
  await auditar({ req, tabla: 'lista_comentarios', registroId: id, accion: 'crear', detalle: `registro ${registro.id}` });
  return res.status(201).json(fila);
});

listasRouter.get('/listas/:id/registros/:rid/historial', authRequired, async (req, res) => {
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).ver_registros) return sinPermiso(res);
  const registro = await one('SELECT id FROM lista_registros WHERE id = $1 AND lista_id = $2', [req.params.rid, lista.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  const filas = await query(`
    SELECT id, datos, usuario, accion, creado_en
      FROM lista_registros_historial
     WHERE registro_id = $1
     ORDER BY creado_en DESC
     LIMIT 100
  `, [registro.id]);
  return res.json(filas);
});

listasRouter.patch('/lista-registros/:id/historial/:histId/restaurar', authRequired, async (req, res) => {
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND archivado = false', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  const lista = await listaConArea(registro.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).editar_registros) return sinPermiso(res);
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
  const lista = await listaConArea(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).borrar_registros && !capacidades(req, lista.area_id).editar_registros) {
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
  const lista = await listaConArea(registro.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).borrar_registros) return sinPermiso(res);
  await query('UPDATE lista_registros SET archivado = false, archivado_en = NULL, archivado_por = NULL, actualizado_por = $2, actualizado_en = now() WHERE id = $1', [registro.id, req.user.email]);
  await auditar({ req, tabla: 'lista_registros', registroId: registro.id, accion: 'restaurar' });
  return res.json({ ok: true });
});

listasRouter.delete('/lista-registros/:id', authRequired, async (req, res) => {
  const registro = await one('SELECT * FROM lista_registros WHERE id = $1 AND archivado = false', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
  const lista = await listaConArea(registro.lista_id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (!capacidades(req, lista.area_id).borrar_registros) return sinPermiso(res, 'No tenés permiso para archivar registros en esta lista.');
  await query(
    'UPDATE lista_registros SET archivado = true, archivado_en = now(), archivado_por = $2 WHERE id = $1',
    [registro.id, req.user.email]
  );
  await auditar({ req, tabla: 'lista_registros', registroId: registro.id, accion: 'archivar', antes: registro.datos });
  return res.json({ ok: true });
});
