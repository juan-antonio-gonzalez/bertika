import { useEffect, useState } from 'react';
import { Icon, Modal } from '../components/ui';
import { api } from '../store/api';
import { useStore } from '../store/store';
import {
  SECCIONES, SECCIONES_CLIENTE, ACCIONES, TODAS_SECCIONES, TODAS_ACCIONES,
  permisosDeRol, normalizarPermisos, resumenPermisos,
} from '../data/permisos';

const ROL_LABEL = { admin: 'Administrador', tecnico: 'Técnico', cliente: 'Cliente' };

function FormUsuariosModal({ mode, user, tecnicos, clientes, busy, onGuardar, onClose }) {
  const uid = useStore((s) => s.user?.uid);
  const toastShow = useStore((s) => s.toastShow);
  const esEdicion = mode === 'editar';
  const edicionPropia = esEdicion && user.id === uid;
  const [email, setEmail] = useState(esEdicion ? user.email : '');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState(esEdicion ? user.rol : 'cliente');
  const [tecnicoId, setTecnicoId] = useState(esEdicion ? user.tecnico_id || '' : '');
  const [clienteId, setClienteId] = useState(esEdicion ? user.cliente_id || '' : '');
  // Permisos: arrancan con los del rol del usuario (o los suyos si ya los tiene).
  const [permisos, setPermisos] = useState(() => normalizarPermisos(esEdicion ? user.permisos : null, esEdicion ? user.rol : 'cliente'));
  const rolFinal = edicionPropia ? user.rol : rol;

  const alternar = (familia, clave) => setPermisos((p) => ({
    ...p,
    [familia]: p[familia].includes(clave) ? p[familia].filter((k) => k !== clave) : [...p[familia], clave],
  }));
  const marcarGrupo = (familia, items, valor) => setPermisos((p) => {
    const claves = items.map((i) => i.key);
    return {
      ...p,
      [familia]: valor ? [...new Set([...p[familia], ...claves])] : p[familia].filter((k) => !claves.includes(k)),
    };
  });
  const cambiarRol = (nuevo) => { setRol(nuevo); setPermisos(permisosDeRol(nuevo)); };

  const submit = (e) => {
    e.preventDefault();
    if (!esEdicion && (!email.trim() || password.length < 8)) {
      toastShow('Email y contraseña (mínimo 8 caracteres) son obligatorios.', 'warn');
      return;
    }
    if (password && password.length < 8) {
      toastShow('La contraseña debe tener al menos 8 caracteres.', 'warn');
      return;
    }
    const body = { email: email.trim() };
    if (password) body.password = password;
    if (!edicionPropia) {
      body.rol = rol;
      if (rol === 'tecnico') body.tecnico_id = tecnicoId || null;
      if (rol === 'cliente') body.cliente_id = clienteId || null;
    }
    // La tabla de casillas viaja tal cual al servidor.
    body.permisos = permisos;
    onGuardar(body);
  };

  return (
    <Modal
      title={esEdicion ? `Editar ${user.email}` : 'Crear usuario'}
      sub={esEdicion ? 'Cambiá email, contraseña, rol y permisos.' : 'Nueva cuenta de acceso a la plataforma.'}
      ancho="ancho"
      onClose={onClose}
    >
      <form onSubmit={submit} className="col">
        <div className="field">
          <label>Email *</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={esEdicion} />
        </div>
        <div className="field">
          <label>{esEdicion ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña *'}</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
        </div>
        <div className="field">
          <label>Rol</label>
          <select className="input" value={rolFinal} onChange={(e) => cambiarRol(e.target.value)} disabled={edicionPropia}>
            <option value="admin">Administrador</option>
            <option value="tecnico">Técnico</option>
            <option value="cliente">Cliente</option>
          </select>
          {edicionPropia && <small className="muted">No podés cambiarte el rol a vos mismo.</small>}
        </div>
        {rolFinal === 'tecnico' && (
          <div className="field">
            <label>Vincular a técnico</label>
            <select className="input" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
              <option value="">Sin vínculo</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>
        )}
        {rolFinal === 'cliente' && (
          <div className="field">
            <label>Vincular a cliente</label>
            <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Sin vínculo</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        )}
        {rolFinal === 'admin' ? (
          <p className="muted" style={{ fontSize: 12.5 }}>
            El administrador tiene acceso total a la plataforma: no se le pueden quitar permisos, así nunca se
            pierde la administración del sistema.
          </p>
        ) : (
          <div className="permisos">
            <div className="row between wrap" style={{ gap: 8, marginBottom: 8 }}>
              <div>
                <b style={{ fontSize: 13 }}>Qué puede ver y hacer</b>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  Marcá las secciones y las acciones que le habilitás a este usuario.
                </div>
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                <button type="button" className="chip" onClick={() => setPermisos(permisosDeRol(rolFinal))}>
                  Como {ROL_LABEL[rolFinal] || rolFinal}
                </button>
                <button type="button" className="chip" onClick={() => setPermisos({ ver: [], hacer: [] })}>Nada</button>
                <button
                  type="button" className="chip"
                  onClick={() => setPermisos({ ver: [...TODAS_SECCIONES], hacer: [...TODAS_ACCIONES] })}
                >Todo</button>
              </div>
            </div>
            <div className={`permisos-grid${rolFinal === 'cliente' ? ' sola' : ''}`}>
              <div className="permisos-col">
                <div className="permisos-titulo">Secciones que puede ver</div>
                {[...SECCIONES, ...SECCIONES_CLIENTE].map((g) => (
                  <div key={g.grupo} className="permisos-grupo">
                    <div className="row between" style={{ gap: 6 }}>
                      <span className="permisos-grupo-nombre">{g.grupo}</span>
                      <span className="row" style={{ gap: 4 }}>
                        <button type="button" className="chip" onClick={() => marcarGrupo('ver', g.items, true)}>todos</button>
                        <button type="button" className="chip" onClick={() => marcarGrupo('ver', g.items, false)}>ninguno</button>
                      </span>
                    </div>
                    {g.items.map((i) => (
                      <label key={i.key} className="permiso-item" title={i.detalle}>
                        <input type="checkbox" checked={permisos.ver.includes(i.key)} onChange={() => alternar('ver', i.key)} />
                        <span><b>{i.label}</b><small>{i.detalle}</small></span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              {rolFinal !== 'cliente' && (
                <div className="permisos-col">
                  <div className="permisos-titulo">Acciones que puede hacer</div>
                  {ACCIONES.map((g) => (
                    <div key={g.grupo} className="permisos-grupo">
                      <div className="row between" style={{ gap: 6 }}>
                        <span className="permisos-grupo-nombre">{g.grupo}</span>
                        <span className="row" style={{ gap: 4 }}>
                          <button type="button" className="chip" onClick={() => marcarGrupo('hacer', g.items, true)}>todas</button>
                          <button type="button" className="chip" onClick={() => marcarGrupo('hacer', g.items, false)}>ninguna</button>
                        </span>
                      </div>
                      {g.items.map((i) => (
                        <label key={i.key} className="permiso-item" title={i.detalle}>
                          <input type="checkbox" checked={permisos.hacer.includes(i.key)} onChange={() => alternar('hacer', i.key)} />
                          <span><b>{i.label}</b><small>{i.detalle}</small></span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <button className="btn primary block" disabled={busy}>
          <Icon name="check" size={14} /> {busy ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear usuario'}
        </button>
      </form>
    </Modal>
  );
}

export default function Usuarios() {
  const currentUid = useStore((s) => s.user?.uid);
  const tecnicos = useStore((s) => s.data.tecnicos);
  const clientes = useStore((s) => s.data.clientes);
  const toastShow = useStore((s) => s.toastShow);
  const [lista, setLista] = useState(null);
  const [modal, setModal] = useState(null); // { mode: 'crear' } | { mode: 'editar', user }
  const [busy, setBusy] = useState(false);
  const [aBaja, setABaja] = useState(null);

  const cargar = async () => {
    try {
      setLista(await api('/usuarios'));
    } catch {
      setLista([]);
    }
  };

  useEffect(() => { cargar(); }, []);

  const vincular = (u) => {
    if (u.rol === 'tecnico' && u.tecnico_id) {
      const t = tecnicos.find((x) => x.id === u.tecnico_id);
      if (t) return t.nombre;
    }
    if (u.rol === 'cliente' && u.cliente_id) {
      const c = clientes.find((x) => x.id === u.cliente_id);
      if (c) return c.nombre;
    }
    return null;
  };

  const guardar = async (payload) => {
    setBusy(true);
    try {
      if (modal.mode === 'crear') {
        await api('/usuarios', { method: 'POST', body: payload });
        toastShow('Usuario creado', 'ok');
      } else {
        await api(`/usuarios/${modal.user.id}`, { method: 'PATCH', body: payload });
        toastShow('Cambios guardados', 'ok');
      }
      setModal(null);
      await cargar();
    } catch (e) {
      toastShow(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // La baja es logica (activo = false): la ficha se conserva y se puede reactivar.
  const reactivar = async (u) => {
    if (u.id === currentUid) return;
    try {
      await api(`/usuarios/${u.id}`, { method: 'PATCH', body: { activo: true } });
      await cargar();
      toastShow(`${u.email}: acceso reactivado`, 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const darDeBaja = async (u) => {
    try {
      await api(`/usuarios/${u.id}`, { method: 'DELETE' });
      setABaja(null);
      await cargar();
      toastShow(`${u.email}: acceso dado de baja (se puede reactivar)`, 'warn');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  return (
    <div className="wrap page">
      <div className="row between wrap mb24">
        <div>
          <h1 className="page-title">Usuarios y accesos</h1>
          <p className="page-sub">Cuentas de la plataforma y permisos por rol. Solo el administrador edita esto.</p>
        </div>
        <button className="btn primary" onClick={() => setModal({ mode: 'crear' })}>
          <Icon name="plus" size={14} /> Crear usuario
        </button>
      </div>

      <div className="col" style={{ maxWidth: 860 }}>
        {!lista ? (
          <p className="muted">Cargando usuarios...</p>
        ) : lista.length === 0 ? (
          <div className="card"><p className="muted">Todavía no hay usuarios. Creá el primero.</p></div>
        ) : (
          lista.map((u) => (
            <div key={u.id} className="card" style={{ opacity: u.activo ? 1 : 0.6 }}>
              <div className="row between wrap">
                <div className="row" style={{ gap: 12, minWidth: 240 }}>
                  <span className="avatar">{u.email?.[0]?.toUpperCase()}</span>
                  <div>
                    <b>{u.email}</b>
                    <div className="row" style={{ gap: 8, marginTop: 2 }}>
                      <span className={`badge ${u.rol === 'admin' ? 'amber' : u.rol === 'tecnico' ? 'blue' : 'green'}`}>{ROL_LABEL[u.rol] || u.rol}</span>
                      <span className="badge gray">{resumenPermisos(u)}</span>
                      {!u.activo && <span className="badge gray">Inactivo</span>}
                      {u.id === currentUid && <span className="badge gray">Vos</span>}
                    </div>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>
                  {vincular(u) ? `Vinculado a: ${vincular(u)}` : 'Sin vínculo'}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn sm" onClick={() => setModal({ mode: 'editar', user: u })}><Icon name="gear" size={13} /> Editar</button>
                  {u.activo ? (
                    <button className="btn sm danger" onClick={() => setABaja(u)} disabled={u.id === currentUid}>
                      <Icon name="x" size={13} /> Dar de baja
                    </button>
                  ) : (
                    <button className="btn sm" onClick={() => reactivar(u)}>
                      <Icon name="check" size={13} /> Reactivar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {aBaja && (
        <Modal title="Dar de baja el acceso" sub={aBaja.email} onClose={() => setABaja(null)}>
          <div className="col">
            <div className="banner-info">
              <Icon name="info" size={15} />
              <span>
                Se da de baja <b>solo el acceso a la plataforma</b>: la ficha del usuario no se borra y
                el cliente o técnico vinculado queda intacto. Se puede <b>reactivar</b> cuando quieras.
              </span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              Al darlo de baja, su sesión deja de servir al instante.
            </p>
            <div className="grid2">
              <button className="btn danger" onClick={() => darDeBaja(aBaja)}><Icon name="x" size={14} /> Dar de baja</button>
              <button className="btn" onClick={() => setABaja(null)}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {modal && (
        <FormUsuariosModal
          mode={modal.mode}
          user={modal.user}
          tecnicos={tecnicos}
          clientes={clientes}
          busy={busy}
          onGuardar={guardar}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}