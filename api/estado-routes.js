import express from 'express';
import { query } from './db.js';

// Router del estado global del panel. Se separó de server.js para que el
// bootstrap y la paginación opt-in tengan un límite claro.
export function crearEstadoRouter({ authRequired, puedeVer, areasVisibles }) {
  const router = express.Router();
  router.get('/estado', authRequired, async (req, res) => {
  const rol = req.user.rol;
  const deps = ['tecnicos', 'clientes', 'baterias', 'activos', 'insumos', 'ordenes', 'bajas', 'notificaciones'];
  const out = {};
  const paginado = String(req.query?.paginado || '') === '1';
  const limite = Math.min(500, Math.max(1, Number(req.query?.limit) || 200));
  const offset = Math.max(0, Number(req.query?.offset) || 0);
  for (const t of deps) {
    if (rol === 'cliente' && (t === 'insumos' || t === 'bajas')) { out[t] = []; continue; }
    if (rol !== 'admin' && t === 'bajas') { out[t] = []; continue; }
    // Los clientes dados de baja (papelera) no se mandan al panel: se recuperan
    // desde /api/clientes?papelera=1 (solo admin).
    out[t] = await query(t === 'clientes' ? 'SELECT * FROM clientes WHERE deleted_at IS NULL' : `SELECT * FROM ${t}`);
  }
  // "Que ve": los catalogos de las secciones que el usuario no tiene
  // habilitadas se mandan vacios, asi el panel no expone datos de mas.
  for (const [tabla, seccion] of Object.entries({ clientes: 'clientes', tecnicos: 'tecnicos', insumos: 'inventario', bajas: 'baja', activos: 'clientes' })) {
    if (!puedeVer(req.user, seccion)) out[tabla] = [];
  }
  // El taller ve clientes con al menos una orden o una batería/equipo
  // registrado. El admin ve toda la cartera y puede abrir la pestaña "Sin relación".
  if (rol !== 'admin' && rol !== 'cliente' && puedeVer(req.user, 'clientes')) {
    const conRelacion = new Set([
      ...out.ordenes.map((o) => o.cliente_id),
      ...out.baterias.map((b) => b.cliente_id),
      ...out.activos.map((a) => a.cliente_id),
    ].filter(Boolean));
    out.clientes = out.clientes.filter((c) => conRelacion.has(c.id));
  }
  if (rol === 'cliente') {
    const propias = out.ordenes.filter((o) => o.cliente_id === req.user.cliente_id);
    const series = new Set(propias.map((o) => o.bateria_serie));
    out.ordenes = propias;
    out.clientes = out.clientes.filter((c) => c.id === req.user.cliente_id);
    out.baterias = out.baterias.filter((b) => b.cliente_id === req.user.cliente_id || series.has(b.numero_serie));
    out.activos = out.activos.filter((a) => a.cliente_id === req.user.cliente_id);
    out.tecnicos = out.tecnicos.map((t) => ({ id: t.id, nombre: t.nombre }));
    out.notificaciones = out.notificaciones.filter((n) => propias.some((o) => o.id === n.orden_id));
  }
  const cont = await query('SELECT * FROM contadores');
  const seq = {};
  for (const c of cont) seq[c.nombre] = c.valor;
  out.seq = seq;
  // Permisos efectivos del usuario: el panel los usa para mostrar u ocultar.
  out.permisos = req.user.permisos;
  // Menú de listas visible según la categoría (y todas para el admin).
  out.areas = await areasVisibles(req.user);
  // Tareas del CRM: el admin ve todas las pendientes; el tecnico las suyas y las
  // que no tienen responsable; el cliente ninguna.
  if (rol === 'cliente' || !puedeVer(req.user, 'tareas')) {
    out.tareas = [];
  } else {
    out.tareas = await query(
      `SELECT * FROM wa_tareas WHERE estado = 'pendiente'
       ${rol === 'admin' ? '' : 'AND (asignado_a = $1 OR asignado_a IS NULL)'}
       ORDER BY vence ASC NULLS LAST LIMIT 200`,
      rol === 'admin' ? [] : [req.user.email]
    );
  }
  if (paginado) {
    const paginacion = {};
    for (const clave of deps) {
      if (!Array.isArray(out[clave])) continue;
      const total = out[clave].length;
      paginacion[clave] = { total, limit: limite, offset, next: offset + limite < total };
      out[clave] = out[clave].slice(offset, offset + limite);
    }
    out.paginacion = paginacion;
  }
  return res.json(out);
  });
  return router;
}
