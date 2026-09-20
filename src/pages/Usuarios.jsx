import { useEffect, useState } from 'react';
import { Icon, Modal } from '../components/ui';
import { api } from '../store/api';
import { useStore } from '../store/store';

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
  const rolFinal = edicionPropia ? user.rol : rol;

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
    onGuardar(body);
  };

  return (
    <Modal
      title={esEdicion ? `Editar ${user.email}` : 'Crear usuario'}
      sub={esEdicion ? 'Cambiá email, contraseña o rol.' : 'Nueva cuenta de acceso a la plataforma.'}
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
          <select className="input" value={rolFinal} onChange={(e) => setRol(e.target.value)} disabled={edicionPropia}>
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
  const [aBorrar, setABorrar] = useState(null);

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

  const toggleActivo = async (u) => {
    if (u.id === currentUid) return;
    try {
      await api(`/usuarios/${u.id}`, { method: 'PATCH', body: { activo: !u.activo } });
      await cargar();
      toastShow(u.activo ? 'Acceso desactivado' : 'Acceso activado', 'ok');
    } catch (e) {
      toastShow(e.message, 'error');
    }
  };

  const borrar = async (u) => {
    try {
      await api(`/usuarios/${u.id}`, { method: 'DELETE' });
      setABorrar(null);
      await cargar();
      toastShow(`Acceso de ${u.email} eliminado`, 'ok');
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
                  <button className="btn sm" onClick={() => toggleActivo(u)} disabled={u.id === currentUid}>
                    <Icon name={u.activo ? 'x' : 'check'} size={13} /> {u.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button className="btn sm danger" onClick={() => setABorrar(u)} disabled={u.id === currentUid}><Icon name="x" size={13} /> Eliminar</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {aBorrar && (
        <Modal title="Eliminar acceso" sub={aBorrar.email} onClose={() => setABorrar(null)}>
          <div className="col">
            <p className="muted" style={{ margin: 0 }}>
              Se elimina solo el acceso a la plataforma; el cliente o técnico vinculado no se borra.
              Esta acción no se puede deshacer.
            </p>
            <div className="grid2">
              <button className="btn danger" onClick={() => borrar(aBorrar)}><Icon name="x" size={14} /> Eliminar acceso</button>
              <button className="btn" onClick={() => setABorrar(null)}>Cancelar</button>
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