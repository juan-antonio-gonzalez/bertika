import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  seedTecnicos,
  seedClientes,
  seedBaterias,
  seedInsumos,
  seedOrdenes,
  seedOrdenHistorica,
  seedOrdenEntregadaReciente,
  TRANSITIONS,
} from '../data/seed';

export const SEED_VERSION = '1.0.0';

const seedData = () => ({
  tecnicos: JSON.parse(JSON.stringify(seedTecnicos)),
  clientes: JSON.parse(JSON.stringify(seedClientes)),
  baterias: JSON.parse(JSON.stringify(seedBaterias)),
  insumos: JSON.parse(JSON.stringify(seedInsumos)),
  ordenes: JSON.parse(JSON.stringify([...seedOrdenes, seedOrdenHistorica, seedOrdenEntregadaReciente])),
  bajas: JSON.parse(JSON.stringify([{ id: 'baja_01', bateria_id: 'bat_09', serie: 'BAT-MTC-103', fecha: new Date(Date.now() - 26 * 86400000).toISOString(), motivo: 'Celdas irreparables / capacidad bajo 40%', disposicion: 'Reciclaje de plomo-acido autorizado', reciclada: false }])),
  seq: { ev: 100, ord: 100, bat: 100 },
});

const nowIso = () => new Date().toISOString();
const fmtMXN = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

export const useStore = create()(
  persist(
    (set, get) => ({
      version: SEED_VERSION,
      data: seedData(),
      user: null,
      ready: false,
      toast: null,

      boot() {
        // En modo demo la plataforma se alimenta del seed local; el backend
        // publico (seguimiento, codigos, cotizaciones) se consume via api.
        set({ ready: true });
      },

      login(rol, id) {
        const { tecnicos, clientes } = get().data;
        let nombre = rol.toUpperCase();
        if (rol === 'tecnico') {
          const t = tecnicos.find((x) => x.id === id);
          if (t) nombre = t.nombre;
          set({ user: { rol: 'tecnico', id } });
        } else if (rol === 'cliente') {
          const c = clientes.find((x) => x.id === id);
          if (c) nombre = c.nombre;
          set({ user: { rol: 'cliente', id } });
        } else {
          nombre = 'Administrador';
          set({ user: { rol: 'admin', id: 'admin' } });
        }
        set({
          user: {
            rol,
            id: rol === 'admin' ? 'admin' : id,
            nombre: rol === 'admin' ? 'Administrador' : nombre,
          },
        });
        return get().user;
      },

      logout() {
        set({ user: null });
      },

      reset() {
        set({ data: seedData(), user: null });
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

      transition(ordenId, target, detalle = '') {
        const data = get().data;
        const orden = data.ordenes.find((o) => o.id === ordenId);
        if (!orden) return get().toastShow('Orden no encontrada', 'error');
        const check = get().canTransition(orden, target);
        if (!check.ok) return get().toastShow(check.err, 'error');

        const tipoEvento = {
          diagnosing: 'diagnostico',
          quoted: 'cotizacion',
          approved: 'aprobada',
          in_repair: 'reparacion',
          testing: 'prueba_iniciada',
          ready: 'reparacion_completada',
          delivered: 'entregada',
          cancelled: 'cancelada',
        }[target];

        get().pushEvento(ordenId, tipoEvento, detalle || `Estado cambiado a ${target}`);
        set({
          data: {
            ...get().data,
            ordenes: get().data.ordenes.map((o) =>
              o.id === ordenId
                ? {
                    ...o,
                    estado: target,
                    estado_cotizacion: target === 'quoted' ? 'pending' : o.estado_cotizacion,
                    fecha_entrega: target === 'delivered' ? nowIso() : o.fecha_entrega,
                  }
                : o
            ),
          },
        });
        return get().toastShow(`Orden ${ordenId}: ${target}`, 'ok');
      },

      pushEvento(ordenId, tipo, detalle) {
        const data = get().data;
        const seq = data.seq.ev + 1;
        const ev = { id: `ev_${seq}`, tipo, detalle, fecha: nowIso() };
        set({
          data: {
            ...data,
            seq: { ...data.seq, ev: seq },
            ordenes: data.ordenes.map((o) =>
              o.id === ordenId ? { ...o, eventos: [...(o.eventos || []), ev] } : o
            ),
          },
        });
      },

      addOrder({ serie, tipo, voltaje, capacidad, aplicacion, marca, modelo, equipo, cliente_id, falla, tecnico_id }) {
        const data = get().data;
        if (!serie || !cliente_id || !falla) {
          return get().toastShow('Faltan datos obligatorios (serie, cliente y falla)', 'error');
        }
        const seq = data.seq;
        let baterias = data.baterias;
        let nuevaBat = null;
        const existente = baterias.find((b) => b.numero_serie === serie);
        if (!existente) {
          nuevaBat = {
            id: `bat_${seq.bat}`,
            numero_serie: serie,
            tipo: tipo || 'Plomo-Acido',
            voltaje: voltaje || '12V',
            capacidad: Number(capacidad) || 60,
            aplicacion: aplicacion || 'Automotriz',
            marca: marca || 'Generica',
            modelo: modelo || 'Estándar',
            equipo: equipo || serie,
            fecha_fabricacion: new Date().toISOString().slice(0, 10),
            cliente_id,
            ciclos_estimados: 300,
            estado_vida: 'activa',
          };
          baterias = [...baterias, nuevaBat];
        } else {
          nuevaBat = existente;
        }

        const ordId = `ord_${seq.ord}`;
        const orden = {
          id: ordId,
          bateria_serie: nuevaBat.numero_serie,
          bateria_id: nuevaBat.id,
          cliente_id,
          tecnico_id: tecnico_id || null,
          falla,
          motivo: falla,
          estado: 'received',
          fecha_ingreso: nowIso(),
          hora_entrega: new Date(Date.now() + 24 * 3600000).toISOString(),
          eventos: [{ id: `ev_${seq.ev + 1}`, tipo: 'ingreso', detalle: `Bateria ${nuevaBat.numero_serie} ingresada al taller. Falla reportada: ${falla}`, fecha: nowIso() }],
          cotizacion: null,
          estado_cotizacion: null,
          insumos_utilizados: [],
          prueba_final: { estado: 'pending' },
          diagnostico: null,
        };
        set({
          data: {
            ...data,
            baterias,
            ordenes: [...data.ordenes, orden],
            seq: { ev: seq.ev + 1, ord: seq.ord + 1, bat: nuevaBat.id === `bat_${seq.bat}` ? seq.bat + 1 : seq.bat },
          },
        });
        get().toastShow(`Orden ${ordId} creada`, 'ok');
        return ordId;
      },

      asignarTecnico(ordenId, tecnicoId) {
        const data = get().data;
        const orden = data.ordenes.find((o) => o.id === ordenId);
        const tecnico = data.tecnicos.find((t) => t.id === tecnicoId);
        if (!orden || !tecnico) return get().toastShow('Tecnico u orden no encontrado', 'error');
        const bateria = data.baterias.find((b) => b.numero_serie === orden.bateria_serie);
        const match = (bateria ? bateria.aplicacion === 'Ferroviario' ? tecnico.especialidad === 'Ferroviario'
          : bateria.aplicacion === 'Autoelevador' ? ['Plomo-Acido', 'Litio / Ion-Litio', 'Industrial Pesado'].includes(tecnico.especialidad)
          : ['Plomo-Acido', 'Industrial Pesado'].includes(tecnico.especialidad) : true);
        set({
          data: {
            ...data,
            ordenes: data.ordenes.map((o) => (o.id === ordenId ? { ...o, tecnico_id: tecnicoId } : o)),
          },
        });
        get().pushEvento(ordenId, 'asignacion', `Tecnico asignado: ${tecnico.nombre}`);
        if (!match) {
          get().toastShow(`Asignado a ${tecnico.nombre}. Advertencia: especialidad no coincide con la aplicacion.`, 'warn');
        } else {
          get().toastShow(`Tecnico asignado: ${tecnico.nombre}`, 'ok');
        }
      },

      // ---------- Diagnostico ----------
      startDiagnosis(ordenId) {
        const check = get().canTransition(get().findOrden(ordenId), 'diagnosing');
        if (!check.ok) return get().toastShow(check.err, 'error');
        get().transition(ordenId, 'diagnosing', 'Diagnostico iniciado por el tecnico.');
      },

      saveDiagnosis(ordenId, { voltaje, resistencia, pruebaCarga, notas, servicioTipo }) {
        const data = get().data;
        const orden = data.ordenes.find((o) => o.id === ordenId);
        if (!orden) return;
        const tipoDisplay = servicioTipo || '';
        const detalle = `Diagnostico registrado: ${voltaje}V, RI ${resistencia} mOhm. Prueba: ${pruebaCarga === 'passed' ? 'aprobada' : 'fallida'}.${notas ? ` ${notas}` : ''}`;
        set({
          data: {
            ...data,
            ordenes: data.ordenes.map((o) =>
              o.id === ordenId
                ? {
                    ...o,
                    diagnostico: {
                      voltaje_medido: voltaje,
                      resistencia_interna: resistencia,
                      prueba_carga: pruebaCarga,
                      notas,
                      servicioTipo,
                    },
                  }
                : o
            ),
          },
        });
        get().pushEvento(ordenId, 'diagnostico', detalle);
        // Si la orden esta en received, avanza a diagnosing antes de cotizar
        if (get().findOrden(ordenId)?.estado === 'received') {
          get().transition(ordenId, 'diagnosing', 'Diagnostico iniciado por el tecnico.');
        }
        get().transition(ordenId, 'quoted', `Diagnostico completado. Cotizacion generada por ${tipoDisplay || 'el servicio'}.`);
      },

      // ---------- Cotizacion ----------
      generarCotizacion(ordenId, { monto, servicios, insumos }) {
        const data = get().data;
        set({
          data: {
            ...data,
            ordenes: data.ordenes.map((o) =>
              o.id === ordenId
                ? {
                    ...o,
                    cotizacion: {
                      monto: Number(monto) || 0,
                      servicios_costos: (servicios || []).map((s) => ({ nombre: s.nombre, monto: Number(s.monto) || 0 })),
                      insumos: (insumos || []).map((i) => ({ nombre: i.nombre, cantidad: Number(i.cantidad) || 1, precio: Number(i.precio) || 0 })),
                    },
                  }
                : o
            ),
          },
        });
        get().pushEvento(ordenId, 'cotizacion', `Cotizacion generada por ${fmtMXN.format(monto || 0)}.`);
        get().toastShow(`Cotizacion generada por $${fmtMXN.format(monto || 0)}`, 'ok');
      },

      aprobarCotizacion(ordenId) {
        const check = get().canTransition(get().findOrden(ordenId), 'approved');
        if (!check.ok) return get().toastShow(check.err, 'error');
        get().pushEvento(ordenId, 'aprobada', 'Cotizacion aprobada por el cliente.');
        set({
          data: {
            ...get().data,
            ordenes: get().data.ordenes.map((o) =>
              o.id === ordenId ? { ...o, estado: 'approved', estado_cotizacion: 'approved' } : o
            ),
          },
        });
        get().toastShow('Cotizacion aprobada', 'ok');
      },

      rechazarCotizacion(ordenId) {
        const orden = get().findOrden(ordenId);
        if (!orden || orden.estado_cotizacion === 'rejected') return;
        get().pushEvento(ordenId, 'cancelada', 'Cotizacion rechazada por el cliente. Orden cancelada.');
        set({
          data: {
            ...get().data,
            ordenes: get().data.ordenes.map((o) =>
              o.id === ordenId ? { ...o, estado: 'cancelled', estado_cotizacion: 'rejected' } : o
            ),
          },
        });
        get().toastShow('Cotizacion rechazada. Orden cancelada.', 'error');
      },

      // ---------- Reparacion ----------
      startRepair(ordenId) {
        const check = get().canTransition(get().findOrden(ordenId), 'in_repair');
        if (!check.ok) return get().toastShow(check.err, 'error');
        get().transition(ordenId, 'in_repair', 'Reparacion iniciada.');
      },

      registrarInsumo(ordenId, insumoId, cantidad) {
        const data = get().data;
        const insumo = data.insumos.find((i) => i.id === insumoId);
        if (!insumo) return get().toastShow('Insumo no encontrado', 'error');
        const cant = Number(cantidad) || 0;
        if (cant <= 0) return get().toastShow('Cantidad invalida', 'error');
        if (insumo.stock < cant) return get().toastShow(`Stock insuficiente de ${insumo.nombre} (disponible: ${insumo.stock})`, 'error');

        set({
          data: {
            ...data,
            insumos: data.insumos.map((i) => (i.id === insumoId ? { ...i, stock: i.stock - cant } : i)),
            ordenes: data.ordenes.map((o) =>
              o.id === ordenId
                ? {
                    ...o,
                    insumos_utilizados: [
                      ...(o.insumos_utilizados || []),
                      { insumo_id: insumoId, nombre: insumo.nombre, cantidad: cant, precio: insumo.precio },
                    ],
                  }
                : o
            ),
          },
        });
        get().pushEvento(ordenId, 'insumo', `Insumo utilizado: ${insumo.nombre} x${cant}`);
        const isCritico = insumo.stock - cant < 3;
        get().toastShow(
          isCritico ? `Stock critico de ${insumo.nombre}: ${insumo.stock - cant} restantes` : `Registrado: ${insumo.nombre} x${cant}`,
          isCritico ? 'warn' : 'ok'
        );
      },

      // ---------- Prueba final ----------
      startTest(ordenId) {
        const check = get().canTransition(get().findOrden(ordenId), 'testing');
        if (!check.ok) return get().toastShow(check.err, 'error');
        get().transition(ordenId, 'testing', 'Prueba final de carga/capacidad iniciada.');
      },

      completeTest(ordenId, { capacidad, resultado, obs }) {
        const data = get().data;
        const orden = data.ordenes.find((o) => o.id === ordenId);
        if (!orden || orden.estado !== 'testing') {
          return get().toastShow('La orden debe estar en prueba final', 'error');
        }
        set({
          data: {
            ...data,
            ordenes: data.ordenes.map((o) =>
              o.id === ordenId
                ? { ...o, prueba_final: { estado: resultado === 'passed' ? 'passed' : 'failed', capacidad_medida: Number(capacidad) || null, obs: obs || '' } }
                : o
            ),
          },
        });

        if (resultado === 'passed') {
          get().pushEvento(ordenId, 'prueba_aprobada', `Prueba final APROBADA. Capacidad medida: ${capacidad}Ah.${obs ? ` ${obs}` : ''}`);
          set({
            data: {
              ...get().data,
              ordenes: get().data.ordenes.map((o) =>
                o.id === ordenId ? { ...o, estado: 'ready' } : o
              ),
            },
          });
          get().toastShow('Prueba aprobada. Orden lista para entrega.', 'ok');
        } else {
          get().pushEvento(ordenId, 'prueba_fallida', `Prueba final FALLIDA. Capacidad medida: ${capacidad}Ah. Regreso a reparacion: ${obs || 'se requiere reproceso'}`);
          set({
            data: {
              ...get().data,
              ordenes: get().data.ordenes.map((o) =>
                o.id === ordenId ? { ...o, estado: 'in_repair' } : o
              ),
            },
          });
          get().toastShow('Prueba fallida. La bateria regresa a reparacion.', 'error');
        }
      },

      // ---------- Entrega / cierre ----------
      deliverOrder(ordenId, montoCobrado, garantiaMeses, garantiaCiclos) {
        const data = get().data;
        const orden = data.ordenes.find((o) => o.id === ordenId);
        if (!orden || orden.estado !== 'ready') {
          return get().toastShow('Solo ordenes listas pueden entregarse', 'error');
        }
        const monto = montoCobrado != null && montoCobrado !== '' ? Number(montoCobrado) : orden.cotizacion?.monto || 0;
        const gMeses = Number(garantiaMeses) || 6;
        const gCiclos = Number(garantiaCiclos) || 100;
        const vence = new Date(Date.now() + gMeses * 30.44 * 86400000).toISOString();
        set({
          data: {
            ...data,
            ordenes: data.ordenes.map((o) =>
              o.id === ordenId
                ? {
                    ...o,
                    estado: 'delivered',
                    monto_cobrado: monto,
                    fecha_entrega: nowIso(),
                    garantia: { meses: gMeses, ciclos: gCiclos, vence },
                  }
                : o
            ),
            baterias: data.baterias.map((b) =>
              b.numero_serie === orden.bateria_serie ? { ...b, estado_vida: 'en_garantia' } : b
            ),
          },
        });
        get().pushEvento(ordenId, 'entregada', `Bateria entregada al cliente. ${fmtMXN.format(monto)} cobrados. Garantia ${gMeses} meses / ${gCiclos} ciclos.`);
        get().toastShow('Orden entregada y cobrada', 'ok');
      },

      // ---------- Carga de stock ----------
      agregarStock(insumoId, cantidad) {
        const data = get().data;
        const cant = Number(cantidad) || 0;
        if (cant <= 0) return get().toastShow('Cantidad invalida', 'error');
        set({
          data: {
            ...data,
            insumos: data.insumos.map((i) => (i.id === insumoId ? { ...i, stock: i.stock + cant } : i)),
          },
        });
        get().toastShow(`+${cant} unidades al inventario`, 'ok');
      },

      // ---------- Baja / reciclaje ----------
      darDeBaja(ordenId, motivo) {
        const data = get().data;
        const orden = data.ordenes.find((o) => o.id === ordenId);
        if (!orden) return get().toastShow('Orden no encontrada', 'error');
        const seq = data.seq;
        const bateria = data.baterias.find((b) => b.numero_serie === orden.bateria_serie);
        set({
          data: {
            ...data,
            ordenes: data.ordenes.map((o) => (o.id === ordenId ? { ...o, estado: 'cancelled' } : o)),
            baterias: data.baterias.map((b) =>
              b.numero_serie === orden.bateria_serie ? { ...b, estado_vida: 'dada_de_baja' } : b
            ),
            bajas: [
              ...data.bajas,
              {
                id: `baja_${seq.ev}`,
                bateria_id: bateria ? bateria.id : orden.bateria_serie,
                serie: orden.bateria_serie,
                fecha: nowIso(),
                motivo: motivo || 'No reparable / fuera de vida util',
                disposicion: 'Pendiente de disposicion responsable',
                reciclada: false,
              },
            ],
            seq: { ...data.seq, ev: data.seq.ev + 1 },
          },
        });
        get().pushEvento(ordenId, 'baja', `Bateria ${orden.bateria_serie} dada de baja: ${motivo || 'no reparable'}. Trazabilidad activa para reciclaje.`);
        get().toastShow('Bateria dada de baja. Registrada para disposicion responsable.', 'warn');
      },

      marcarReciclada(bajaId) {
        const data = get().data;
        set({
          data: {
            ...data,
            bajas: data.bajas.map((b) => (b.id === bajaId ? { ...b, reciclada: true, fecha_reciclaje: nowIso() } : b)),
          },
        });
        get().toastShow('Baja registrada como reciclada', 'ok');
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
    }),
    {
      name: 'bertika-db',
      partialize: (s) => ({ version: s.version, data: s.data, user: s.user }),
      onRehydrateStorage: () => (state) => {
        if (state && state.version !== SEED_VERSION) {
          state.reset();
        }
      },
    }
  )
);