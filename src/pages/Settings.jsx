import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/store';
import { api, setToken } from '../store/api';
import { Icon, fmtFecha } from '../components/ui';
import { PasswordInput, PasswordPair } from '../components/PasswordFields';
import { validarPassword } from '../data/passwordPolicy';

export default function Settings() {
  const user = useStore((s) => s.user);
  const data = useStore((s) => s.data);
  const logout = useStore((s) => s.logout);
  const toastShow = useStore((s) => s.toastShow);
  const lastSync = useStore((s) => s.lastSync);
  const navigate = useNavigate();
  const [actual, setActual] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [twofa, setTwofa] = useState(Boolean(user?.twofa_email));
  const [pass2fa, setPass2fa] = useState('');
  const [busy2fa, setBusy2fa] = useState(false);

  const perfil = user?.rol === 'tecnico'
    ? data.tecnicos.find((t) => t.id === user.id)
    : user?.rol === 'cliente'
      ? data.clientes.find((c) => c.id === user.id)
      : null;

  const cambiarPass = async (e) => {
    e.preventDefault();
    if (!actual) return toastShow('Ingresá tu contraseña actual', 'warn');
    const error = validarPassword(pass, { email: user?.email });
    if (error) return toastShow(error, 'warn');
    if (pass !== pass2) return toastShow('Las contraseñas no coinciden', 'warn');
    setBusy(true);
    try {
      // Endpoint de autoservicio: funciona para cualquier rol. Devuelve un token
      // nuevo para que esta sesión siga abierta; las demás se invalidan.
      const res = await api('/auth/password', { method: 'POST', body: { password_actual: actual, password: pass } });
      if (res?.token) setToken(res.token);
      setActual('');
      setPass('');
      setPass2('');
      toastShow('Contraseña actualizada. Cerramos las otras sesiones.', 'ok');
    } catch (err) {
      toastShow(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cambiar2fa = async () => {
    if (!pass2fa) return toastShow('Ingresá tu contraseña actual para confirmar', 'warn');
    setBusy2fa(true);
    try {
      const res = await api('/auth/2fa', {
        method: 'PATCH',
        body: { activo: !twofa, password: pass2fa },
      });
      setTwofa(Boolean(res.twofa_email));
      setPass2fa('');
      toastShow(res.twofa_email ? 'Doble factor activado: te pediremos un código en cada login.' : 'Doble factor desactivado.', 'ok');
    } catch (err) {
      toastShow(err.message, 'error');
    } finally {
      setBusy2fa(false);
    }
  };

  return (
    <div className="wrap page">
      <div className="mb24">
        <h1 className="page-title">Configuración</h1>
        <p className="page-sub">Perfil y seguridad de tu cuenta.</p>
      </div>

      <div className="grid2" style={{ maxWidth: 900 }}>
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
            <h3 className="card-title"><Icon name="shield" size={15} /> Doble factor por email</h3>
            <p className="card-sub">
              Si lo activás, además de la contraseña te vamos a pedir un código de 6 dígitos
              enviado a <b>{user?.email}</b> cada vez que inicies sesión.
            </p>
            <div className="row" style={{ gap: 8, margin: '10px 0 14px' }}>
              <span className={`badge ${twofa ? 'green' : 'gray'}`}>{twofa ? 'Activado' : 'Desactivado'}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {twofa ? 'Cada login pide código por correo.' : 'Recomendado para administradores.'}
              </span>
            </div>
            <div className="field">
              <PasswordInput
                label="Contraseña actual para confirmar"
                value={pass2fa}
                onChange={(e) => setPass2fa(e.target.value)}
                placeholder="Tu contraseña actual"
                autoComplete="current-password"
              />
            </div>
            <button type="button" className="btn" onClick={cambiar2fa} disabled={busy2fa || !pass2fa}>
              <Icon name={twofa ? 'x' : 'shield'} size={14} /> {busy2fa ? 'Guardando...' : twofa ? 'Desactivar doble factor' : 'Activar doble factor'}
            </button>
          </div>

          <div className="card">
            <h3 className="card-title"><Icon name="shield" size={15} /> Cambiar contraseña</h3>
            <form onSubmit={cambiarPass} className="col">
              <PasswordInput
                label="Contraseña actual"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="Tu contraseña actual"
                autoComplete="current-password"
              />
              <PasswordPair
                password={pass}
                setPassword={setPass}
                confirm={pass2}
                setConfirm={setPass2}
                label="Nueva contraseña"
                confirmLabel="Repetir contraseña nueva"
                help="Mínimo 12 caracteres. No podés reutilizar una de las últimas 5."
                email={user?.email}
              />
              <button className="btn primary" disabled={busy || !actual || !pass}>
                <Icon name="check" size={14} /> {busy ? 'Guardando...' : 'Actualizar contraseña'}
              </button>
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
              <span className="row between"><span className="muted">Última sincronización</span><b>{lastSync ? fmtFecha(lastSync) : '—'}</b></span>
            </div>
            <div className="row mt16">
              <button className="btn" onClick={() => { logout(); navigate('/'); }}><Icon name="logout" size={14} /> Salir / cambiar de usuario</button>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title"><Icon name="info" size={15} /> Seguridad de la cuenta</h3>
            <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
              <li>La contraseña se guarda cifrada con bcrypt; nadie puede leerla.</li>
              <li>Si cambiás la contraseña, se cierran las sesiones de los demás dispositivos.</li>
              <li>Después de 5 intentos fallidos la cuenta se bloquea 15 minutos.</li>
              <li>El enlace de recuperación vence a los 30 minutos y sirve una sola vez.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
