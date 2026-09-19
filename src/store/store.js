import { create } from 'zustand';
import { api, getToken, setToken } from './api';
import { TRANSITIONS } from '../data/seed';

const emptyData = () => ({
  tecnicos: [],
  clientes: [],
  baterias: [],
  insumos: [],
  ordenes: [],
  bajas: [],
  notificaciones: [],
  seq: { ev: 100, ord: 100, bat: 100 },
});

const fmtARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

// Convierte el usuario de la API (id/uid reales) al shape que usa la UI.
// id = referencia a cliente/tecnico (o 'admin'); uid = id real del usuario en BD.
function normalizarUser(apiUser, data) {
  const ref = { id: 'admin', uid: apiUser.id, rol: apiUser.rol, email: apiUser.email, nombre: 'Administrador' };
  if (apiUser.rol === 'tecnico') {
    ref.id = apiUser.tecnico_id;
    ref.tecnico_id = apiUser.tecnico_id;
    const t = data.tecnicos.find((x) => x.id === apiUser.tecnico_id);
    if (t) ref.nombre = t.nombre;
  }
  if (apiUser.rol === 'cliente') {
    ref.id = apiUser.cliente_id;
    ref.cliente_id = apiUser.cliente_id;
    const c = data.clientes.find((x) => x.id === apiUser.cliente_id);
    if (c) ref.nombre = c.nombre;
  }
  if (!ref.nombre) ref.nombre = apiUser.email;
  return ref;
}

export const useStore = create()((set, get) => ({
  version: 'api',
  data: emptyData(),
  user: null,
  ready: false,
  toast: null,

  async boot() {
    // Restaura la sesion si hay token valido y trae el estado real de la BD.
    if (!getToken()) return set({ ready: true, user: null, data: emptyData() });
    try {
      const me = await api('/auth/me');
      const estado = await api('/estado');
      set({ ready: true, user: normalizarUser(me, estado), data: estado });
    } catch {
      setToken(null);
      set({ ready: true, user: null, data: emptyData() });
    }
  },

  async login(email, password) {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(token);
    const estado = await api('/estado');
    set({ user: normalizarUser(user, estado), data: estado });
    return get().user;
  },

  async logout() {
    setToken(null);
    set({ user: null, data: emptyData(), ready: true });
  },

  // Re-sincroniza TODO desde la BD (fuente unica de verdad).
  async sync() {
    const estado = await api('/estado');
    set((s) => ({
      data: estado,
      user: s.user ? normalizarUser({ ...s.user, id: s.user.uid }, estado) : null,
    }));
    return estado;
  },

  async reset() {
    try {
      await api('/reset', { method: 'POST' });
      await get().sync();
      get().toastShow('Base de datos restablecida', 'ok');
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  toastShow(msg, tipo = 'ok') {
    set({ toast: { msg, tipo, id: Date.now() } });
  },

  toastHide() {
    set({ toast: null });
  },

  // ---------- Ordenes ----------
  findOrden(id) {
    return get().data.ordenes.find((o) => o.id === id);
  },

  canTransition(orden, target) {
    const t = TRANSITIONS[orden.estado] || [];
    if (!t.includes(target)) return { ok: false, err: `Transicion ${orden.estado} -> ${target} no permitida` };
    if (target === 'ready') {
      if (orden.prueba_final?.estado !== 'passed') {
        return { ok: false, err: 'La orden no puede marcarse lista: la prueba final debe estar aprobada' };
      }
    }
    if (target === 'in_repair' && orden.estado === 'testing') return { ok: true };
    if (target === 'in_repair') {
      if (orden.estado_cotizacion !== 'approved') {
        return { ok: false, err: 'La cotizacion debe ser aprobada por el cliente antes de reparar' };
      }
    }
    return { ok: true };
  },

  async transition(ordenId, target, detalle = '') {
    const orden = get().findOrden(ordenId);
    if (!orden) return get().toastShow('Orden no encontrada', 'error');
    const check = get().canTransition(orden, target);
    if (!check.ok) return get().toastShow(check.err, 'error');
    try {
      await api(`/ordenes/${ordenId}/transition`, { method: 'POST', body: { target, detalle: detalle || `Estado cambiado a ${target}` } });
      await get().sync();
      get().toastShow(`Orden ${ordenId}: ${target}`, 'ok');
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  async addOrder({ serie, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, cliente_id, falla, tecnico_id }) {
    try {
      const { id } = await api('/ordenes', {
        method: 'POST',
        body: { serie, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, cliente_id, falla, tecnico_id },
      });
      await get().sync();
      get().toastShow(`Orden ${id} creada`, 'ok');
      return id;
    } catch (e) {
      get().toastShow(e.message, 'error');
      return null;
    }
  },

  async asignarTecnico(ordenId, tecnicoId) {
    const tecnico = get().data.tecnicos.find((t) => t.id === tecnicoId);
    try {
      await api(`/ordenes/${ordenId}/tecnico`, { method: 'PATCH', body: { tecnico_id: tecnicoId } });
      await get().sync();
      const orden = get().findOrden(ordenId);
      const bateria = get().data.baterias.find((b) => b.numero_serie === orden?.bateria_serie);
      const match = bateria && tecnico
        ? bateria.aplicacion === 'Ferroviario' ? tecnico.especialidad === 'Ferroviario'
          : bateria.aplicacion === 'Autoelevador' ? ['Plomo-Acido', 'Litio / Ion-Litio', 'Industrial Pesado'].includes(tecnico.especialidad)
            : ['Plomo-Acido', 'Industrial Pesado'].includes(tecnico.especialidad)
        : true;
      get().toastShow(match ? `Tecnico asignado: ${tecnico?.nombre}` : `Asignado a ${tecnico?.nombre}. Advertencia: especialidad no coincide con la aplicacion.`, match ? 'ok' : 'warn');
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  // ---------- Diagnostico ----------
  async startDiagnosis(ordenId) {
    return get().transition(ordenId, 'diagnosing', 'Diagnostico iniciado por el tecnico.');
  },

  async saveDiagnosis(ordenId, { voltaje, resistencia, pruebaCarga, notas, servicioTipo }) {
    try {
      await api(`/ordenes/${ordenId}/diagnostico`, {
        method: 'POST',
        body: { voltaje, resistencia, pruebaCarga, notas, servicioTipo },
      });
      await get().sync();
      get().toastShow('Diagnostico registrado y cotizacion generada', 'ok');
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  // ---------- Cotizacion ----------
  async generarCotizacion(ordenId, { monto, servicios, insumos }) {
    try {
      await api(`/ordenes/${ordenId}/cotizacion`, { method: 'POST', body: { monto, servicios, insumos } });
      await get().sync();
      get().toastShow(`Cotizacion generada por ${fmtARS.format(Number(monto) || 0)}`, 'ok');
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  async aprobarCotizacion(ordenId) {
    try {
      await api(`/ordenes/${ordenId}/cotizacion/aprobar`, { method: 'POST' });
      await get().sync();
      get().toastShow('Cotizacion aprobada', 'ok');
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  async rechazarCotizacion(ordenId) {
    try {
      await api(`/ordenes/${ordenId}/cotizacion/rechazar`, { method: 'POST' });
      await get().sync();
      get().toastShow('Cotizacion rechazada. Orden cancelada.', 'error');
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  // ---------- Reparacion ----------
  async startRepair(ordenId) {
    return get().transition(ordenId, 'in_repair', 'Reparacion iniciada.');
  },

  async registrarInsumo(ordenId, insumoId, cantidad) {
    try {
      const { critico } = await api(`/ordenes/${ordenId}/insumos`, {
        method: 'POST',
        body: { insumo_id: insumoId, cantidad: Number(cantidad) || 0 },
      });
      await get().sync();
      const insumo = get().data.insumos.find((i) => i.id === insumoId);
      get().toastShow(
        critico ? `Stock critico de ${insumo?.nombre}: ${insumo?.stock} restantes` : `Registrado: ${insumo?.nombre} x${cantidad}`,
        critico ? 'warn' : 'ok'
      );
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  // ---------- Prueba final ----------
  async startTest(ordenId) {
    return get().transition(ordenId, 'testing', 'Prueba final de carga/capacidad iniciada.');
  },

  async completeTest(ordenId, { capacidad, resultado, obs }) {
    const orden = get().findOrden(ordenId);
    if (!orden || orden.estado !== 'testing') {
      return get().toastShow('La orden debe estar en prueba final', 'error');
    }
    try {
      await api(`/ordenes/${ordenId}/prueba-final`, { method: 'POST', body: { capacidad, resultado, obs } });
      await get().sync();
      get().toastShow(resultado === 'passed' ? 'Prueba aprobada. Orden lista para entrega.' : 'Prueba fallida. La bateria regresa a reparacion.', resultado === 'passed' ? 'ok' : 'error');
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  // ---------- Entrega / cierre ----------
  async deliverOrder(ordenId, montoCobrado, garantiaMeses, garantiaCiclos) {
    const orden = get().findOrden(ordenId);
    if (!orden || orden.estado !== 'ready') {
      return get().toastShow('Solo ordenes listas pueden entregarse', 'error');
    }
    try {
      await api(`/ordenes/${ordenId}/entregar`, {
        method: 'POST',
        body: {
          monto_cobrado: montoCobrado,
          garantia_meses: Number(garantiaMeses) || 6,
          garantia_ciclos: Number(garantiaCiclos) || 100,
        },
      });
      await get().sync();
      get().toastShow('Orden entregada y cobrada', 'ok');
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  // ---------- Carga de stock ----------
  async agregarStock(insumoId, cantidad) {
    const cant = Number(cantidad) || 0;
    if (cant <= 0) return get().toastShow('Cantidad invalida', 'error');
    try {
      await api(`/insumos/${insumoId}/stock`, { method: 'PATCH', body: { cantidad: cant } });
      await get().sync();
      get().toastShow(`+${cant} unidades al inventario`, 'ok');
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  // ---------- Baja / reciclaje ----------
  async darDeBaja(ordenId, motivo) {
    try {
      await api(`/ordenes/${ordenId}/baja`, { method: 'POST', body: { motivo } });
      await get().sync();
      get().toastShow('Bateria dada de baja. Registrada para disposicion responsable.', 'warn');
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  async marcarReciclada(bajaId) {
    try {
      await api(`/bajas/${bajaId}/reciclar`, { method: 'POST' });
      await get().sync();
      get().toastShow('Baja registrada como reciclada', 'ok');
    } catch (e) {
      get().toastShow(e.message, 'error');
    }
  },

  // ---------- Utilidades ----------
  getBateria(serie) {
    return get().data.baterias.find((b) => b.numero_serie === serie);
  },
  getCliente(id) {
    return get().data.clientes.find((c) => c.id === id);
  },
  getTecnico(id) {
    return get().data.tecnicos.find((t) => t.id === id);
  },
  ordenesDeSerie(serie) {
    return get().data.ordenes.filter((o) => o.bateria_serie === serie);
  },
}));