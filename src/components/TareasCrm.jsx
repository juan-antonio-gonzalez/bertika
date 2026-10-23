import { useEffect, useState } from 'react';
import { Icon, Modal, FormGrid, fmtFecha } from './ui';
import { api } from '../store/api';
import { useStore } from '../store/store';
import { tareaVencida, ordenarTareas } from '../data/crm.js';

// Tareas / recordatorios del CRM: para que ningun presupuesto se enfrie.
// El admin ve todas; el tecnico, las suyas y las que no tienen responsable.
export default function TareasCrm() {
  const toastShow = useStore((s) => s.toastShow);
  const yo = useStore((s) => s.user);
  const sync = useStore((s) => s.sync);
  const clientes = useStore((s) => s.data.clientes) || [];
  const [tareas, setTareas] = useState([]);
  const [soloMias, setSoloMias] = useState(false);
  const [verCerradas, setVerCerradas] = useState(false);
  const [nueva, setNueva] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [listaAgentes, setListaAgentes] = useState([]);

  const cargar = async () => {
    setCargando(true);
    try {
      const p = new URLSearchParams({ estado: verCerradas ? 'cerrada' : 'pendiente' });
      if (!verCerradas && soloMias) p.set('mias', '1');
      setTareas(await api(`/whatsapp/tareas?${p}`));
      setError(null);
    } catch (e) {
      setError(e.message || 'No se pudieron cargar las tareas');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloMias, verCerradas]);

  useEffect(() => {
    api('/whatsapp/agentes').then(setListaAgentes).catch(() => setListaAgentes([]));
  }, []);

  const cerrar = async (t) => {
    try {
      await api(`/whatsapp/tareas/${t.id}`, { method: 'PATCH', body: { estado: 'cerrada' } });
      toastShow('Tarea cerrada', 'ok');
      await cargar();
      await sync();
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const reabrir = async (t) => {
    try {
      await api(`/whatsapp/tareas/${t.id}`, { method: 'PATCH', body: { estado: 'pendiente' } });
      await cargar();
      await sync();
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const borrar = async (t) => {
    try {
      await api(`/whatsapp/tareas/${t.id}`, { method: 'DELETE' });
      toastShow('Tarea borrada', 'warn');
      await cargar();
      await sync();
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const guardar = async () => {
    const f = nueva || {};
    if (!String(f.titulo || '').trim()) return toastShow('La tarea necesita un título', 'warn');
    setBusy(true);
    try {
      await api('/whatsapp/tareas', {
        method: 'POST',
        body: { titulo: f.titulo, vence: f.vence || null, asignado_a: f.asignado_a || '', cliente_id: f.cliente_id || null },
      });
      toastShow('Tarea creada', 'ok');
      setNueva(null);
      await cargar();
      await sync();
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const ordenadas = ordenarTareas(tareas);
  const vencidas = tareas.filter((t) => tareaVencida(t)).length;
  const hoy = tareas.filter((t) => {
    if (!t.vence || tareaVencida(t)) return false;
    const d = new Date(t.vence);
    const a = new Date();
    return d.toDateString() === a.toDateString();
  }).length;
  const sinFecha = tareas.filter((t) => !t.vence).length;

  return (
    <div className="col">
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className={`chip${!verCerradas && !soloMias ? ' on' : ''}`} onClick={() => { setVerCerradas(false); setSoloMias(false); }}>Pendientes</button>
          <button className={`chip${!verCerradas && soloMias ? ' on' : ''}`} onClick={() => { setVerCerradas(false); setSoloMias(true); }}>Mis tareas</button>
          <button className={`chip${verCerradas ? ' on' : ''}`} onClick={() => { setVerCerradas(true); setSoloMias(false); }}>Cerradas</button>
        </div>
        <button className="btn primary" onClick={() => setNueva({ titulo: '', vence: '', asignado_a: yo?.email || '', cliente_id: '' })}>
          <Icon name="plus" size={14} /> Nueva tarea
        </button>
      </div>

      {!verCerradas && (
        <div className="grid4">
          <div className="kpi"><div className="kpi-label">Pendientes</div><div className="kpi-value">{tareas.length}</div><div className="kpi-sub">en total</div></div>
          <div className="kpi"><div className="kpi-label">Vencidas</div><div className="kpi-value" style={{ color: vencidas ? 'var(--amber)' : undefined }}>{vencidas}</div><div className="kpi-sub">hay que hacerlas ya</div></div>
          <div className="kpi"><div className="kpi-label">Para hoy</div><div className="kpi-value">{hoy}</div><div className="kpi-sub">vence hoy</div></div>
          <div className="kpi"><div className="kpi-label">Sin fecha</div><div className="kpi-value">{sinFecha}</div><div className="kpi-sub">sin vencimiento</div></div>
        </div>
      )}

      <div className="card">
        <div className="card-title"><Icon name="clock" size={14} /> {verCerradas ? 'Tareas cerradas' : 'Tareas pendientes'}</div>
        {error && <p style={{ color: 'var(--red)', fontSize: 12.5, margin: '6px 0 0' }}>No pude cargar las tareas: {error}</p>}
        {!error && cargando && <p className="muted" style={{ fontSize: 12.5 }}>Cargando…</p>}
        {!error && !cargando && ordenadas.length === 0 && (
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
            {verCerradas ? 'Todavía no hay tareas cerradas.' : 'No hay tareas pendientes. Creá una para no olvidarte de seguir una venta.'}
          </p>
        )}
        {!error && ordenadas.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr><th>Tarea</th><th>Vence</th><th>Responsable</th><th>Cliente</th><th /></tr>
              </thead>
              <tbody>
                {ordenadas.map((t) => {
                  const vencida = tareaVencida(t);
                  return (
                    <tr key={t.id} style={vencida ? { background: 'var(--amber-bg)' } : undefined}>
                      <td>
                        <b>{t.titulo}</b>
                        {t.cliente_nombre && <span className="muted"> · {t.cliente_nombre}</span>}
                      </td>
                      <td>
                        {t.vence ? fmtFecha(t.vence) : <span className="muted">sin fecha</span>}
                        {vencida && <span className="badge amber" style={{ marginLeft: 6 }}>vencida</span>}
                      </td>
                      <td>{t.asignado_a || <span className="muted">sin responsable</span>}</td>
                      <td>{t.cliente_nombre || <span className="muted">—</span>}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {t.estado === 'pendiente' ? (
                          <button className="btn sm" onClick={() => cerrar(t)}><Icon name="check" size={12} /> Cerrar</button>
                        ) : (
                          <button className="btn sm" onClick={() => reabrir(t)}>Reabrir</button>
                        )}
                        <button className="btn sm ghost" title="Borrar" onClick={() => borrar(t)}><Icon name="x" size={12} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nueva && (
        <Modal
          size="md"
          title="Nueva tarea"
          sub="Para no perderle el rastro a una venta"
          onClose={() => setNueva(null)}
          closeOnBackdrop={false}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setNueva(null)} disabled={busy}>Cancelar</button>
              <button type="button" className="btn primary" disabled={busy || !nueva.titulo.trim()} onClick={guardar}>
                <Icon name="check" size={14} /> {busy ? 'Guardando...' : 'Crear tarea'}
              </button>
            </>
          )}
        >
          <div className="col">
            <div className="field">
              <label>Título *</label>
              <input
                className="input" value={nueva.titulo} autoFocus
                onChange={(e) => setNueva({ ...nueva, titulo: e.target.value })}
                placeholder="ej. llamar a Marcos por el presupuesto"
              />
            </div>
            <FormGrid cols={2}>
              <div className="field">
                <label>Vence</label>
                <input className="input" type="date" value={nueva.vence} onChange={(e) => setNueva({ ...nueva, vence: e.target.value })} />
              </div>
              <div className="field">
                <label>Responsable</label>
                <select className="input" value={nueva.asignado_a} onChange={(e) => setNueva({ ...nueva, asignado_a: e.target.value })}>
                  <option value="">Sin responsable</option>
                  {listaAgentes.map((a) => <option key={a.email} value={a.email}>{a.email}</option>)}
                </select>
              </div>
            </FormGrid>
            <div className="field">
              <label>Cliente (opcional)</label>
              <select className="input" value={nueva.cliente_id} onChange={(e) => setNueva({ ...nueva, cliente_id: e.target.value })}>
                <option value="">— Sin cliente —</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
