import { useState } from 'react';
import { useStore } from '../store/store';
import { Icon, ResetDemoBtn, fmtMXN } from '../components/ui';

export default function Settings() {
  const user = useStore((s) => s.user);
  const data = useStore((s) => s.data);
  const login = useStore((s) => s.login);
  const logout = useStore((s) => s.logout);
  const toastShow = useStore((s) => s.toastShow);
  const [nombre, setNombre] = useState(user?.nombre || '');
  const [email, setEmail] = useState('');

  const perfil = user?.rol === 'tecnico'
    ? data.tecnicos.find((t) => t.id === user.id)
    : user?.rol === 'cliente'
      ? data.clientes.find((c) => c.id === user.id)
      : null;

  const guardar = () => {
    if (user?.rol === 'admin') return;
    const esTecnico = user?.rol === 'tecnico';
    const target = esTecnico
      ? data.tecnicos.find((t) => t.id === user.id)
      : data.clientes.find((c) => c.id === user.id);
    if (target) target.nombre = nombre;
    login(user.rol, user.id);
    toastShow('Perfil actualizado', 'ok');
  };

  return (
    <div className="wrap page">
      <div className="row between wrap mb24">
        <div>
          <h1 className="page-title">Configuracion</h1>
          <p className="page-sub">Perfil y datos del usuario activo (demo local).</p>
        </div>
        <ResetDemoBtn />
      </div>

      <div className="grid2" style={{ maxWidth: 820 }}>
        <div className="card">
          <h3 className="card-title"><Icon name="user" size={15} /> Informacion del perfil</h3>
          <div className="col mt8">
            <div className="field"><label>Nombre</label><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={user?.rol === 'admin'} /></div>
            <div className="field"><label>Correo (demo)</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" /></div>
            {perfil && user?.rol === 'tecnico' && (
              <div className="field"><label>Especialidad</label><input className="input" value={perfil.especialidad} disabled /></div>
            )}
            {perfil && user?.rol === 'cliente' && (
              <div className="field"><label>Tipo de cliente</label><input className="input" value={perfil.tipo === 'flotilla_corporativa' ? 'Flotilla corporativa' : 'Particular'} disabled /></div>
            )}
            <button className="btn primary" onClick={guardar}><Icon name="check" size={14} /> Guardar cambios</button>
          </div>
        </div>
        <div className="col">
          <div className="card">
            <h3 className="card-title"><Icon name="shield" size={15} /> Sesion actual</h3>
            <div className="row mt8">
              <span className="avatar" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--amber)', color: '#0c0e11', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 17 }}>{user?.nombre?.[0]}</span>
              <div>
                <b>{user?.nombre}</b>
                <div className="badge amber" style={{ marginTop: 2 }}>{user?.rol}</div>
              </div>
            </div>
            <div className="row mt16">
              <button className="btn" onClick={logout}>Cambiar de usuario</button>
            </div>
          </div>
          <div className="card">
            <h3 className="card-title"><Icon name="info" size={15} /> Datos demo</h3>
            <p className="card-sub">Todos los datos viven en localStorage ({fmtMXN(data.insumos.reduce((a, i) => a + i.stock * i.precio, 0))} en inventario · {data.ordenes.length} ordenes).</p>
          </div>
        </div>
      </div>
    </div>
  );
}