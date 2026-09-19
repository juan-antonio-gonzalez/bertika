import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/store';
import { api } from '../store/api';
import { Icon, fmtFecha } from '../components/ui';

export default function Settings() {
  const user = useStore((s) => s.user);
  const data = useStore((s) => s.data);
  const logout = useStore((s) => s.logout);
  const toastShow = useStore((s) => s.toastShow);
  const navigate = useNavigate();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);

  const perfil = user?.rol === 'tecnico'
    ? data.tecnicos.find((t) => t.id === user.id)
    : user?.rol === 'cliente'
      ? data.clientes.find((c) => c.id === user.id)
      : null;

  const cambiarPass = async (e) => {
    e.preventDefault();
    if (pass.length < 8) return toastShow('La contraseña debe tener al menos 8 caracteres', 'warn');
    if (pass !== pass2) return toastShow('Las contraseñas no coinciden', 'warn');
    setBusy(true);
    try {
      await api(`/usuarios/${user.uid}`, { method: 'PATCH', body: { password: pass } });
      setPass('');
      setPass2('');
      toastShow('Contraseña actualizada', 'ok');
    } catch (err) {
      toastShow(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap page">
      <div className="mb24">
        <h1 className="page-title">Configuración</h1>
        <p className="page-sub">Perfil y seguridad de tu cuenta.</p>
      </div>

      <div className="grid2" style={{ maxWidth: 820 }}>
        <div className="col">
          <div className="card">
            <h3 className="card-title"><Icon name="user" size={15} /> Información del perfil</h3>
            <div className="row mt8" style={{ gap: 12 }}>
              <span className="avatar" style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--amber)', color: '#0c0e11', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 19 }}>{user?.nombre?.[0]}</span>
              <div className="grow">
                <b>{user?.nombre}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>{user?.email}</div>
                <div className="badge amber" style={{ marginTop: 4 }}>{user?.rol}</div>
              </div>
            </div>
            <div className="col mt16">
              {user?.rol === 'tecnico' && (
                <div className="field">
                  <label>Especialidad</label>
                  <input className="input" value={perfil?.especialidad || '—'} disabled />
                </div>
              )}
              {user?.rol === 'cliente' && (
                <div className="field">
                  <label>Tipo de cliente</label>
                  <input className="input" value={perfil?.tipo === 'flotilla_corporativa' ? 'Flotilla corporativa' : perfil?.tipo === 'empresa' ? 'Empresa' : 'Particular'} disabled />
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="card-title"><Icon name="shield" size={15} /> Cambiar contraseña</h3>
            <form onSubmit={cambiarPass} className="col">
              <div className="field">
                <label>Nueva contraseña</label>
                <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
              </div>
              <div className="field">
                <label>Repetir contraseña</label>
                <input className="input" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="Repetí la contraseña" autoComplete="new-password" />
              </div>
              <button className="btn primary" disabled={busy || !pass}><Icon name="check" size={14} /> {busy ? 'Guardando...' : 'Actualizar contraseña'}</button>
            </form>
          </div>
        </div>

        <div className="col">
          <div className="card">
            <h3 className="card-title"><Icon name="info" size={15} /> Sesión</h3>
            <p className="card-sub">Datos sincronizados con la base de datos del taller.</p>
            <div className="col" style={{ fontSize: 13, gap: 8 }}>
              <span className="row between"><span className="muted">Ordenes activas</span><b>{data.ordenes.filter((o) => o.estado !== 'delivered' && o.estado !== 'cancelled').length}</b></span>
              <span className="row between"><span className="muted">Clientes</span><b>{data.clientes.length}</b></span>
              <span className="row between"><span className="muted">Baterías registradas</span><b>{data.baterias.length}</b></span>
              <span className="row between"><span className="muted">Última sincronización</span><b>{fmtFecha(new Date().toISOString())}</b></span>
            </div>
            <div className="row mt16">
              <button className="btn" onClick={() => { logout(); navigate('/'); }}><Icon name="logout" size={14} /> Salir / cambiar de usuario</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}