import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store/store';
import { Icon, fmtMXN, ResetDemoBtn } from '../components/ui';

export default function Auth() {
  const navigate = useNavigate();
  const login = useStore((s) => s.login);
  const data = useStore((s) => s.data);
  const [rol, setRol] = useState(null);

  const entrar = (r, id) => {
    login(r, id);
    navigate('/home');
  };

  return (
    <div className="wrap page">
      <div className="center mb24">
        <h1 className="page-title" style={{ fontSize: 30 }}>Acceso a Vertika</h1>
        <p className="page-sub">Demo con login simulado. Elige un rol para explorar la plataforma.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <Link to="/" className="btn sm"><Icon name="home" size={13} /> Volver a la landing</Link>
          <ResetDemoBtn compact />
        </div>
      </div>

      <div className="login-grid" style={{ marginTop: 24 }}>
        <div className="login-card" onClick={() => setRol('admin')}>
          <div className="li" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}><Icon name="gear" size={26} /></div>
          <h4>Admin</h4>
          <p>Operacion, kanban, inventario, flotillas, garantias y reportes.</p>
        </div>
        <div className="login-card" onClick={() => setRol('tecnico')}>
          <div className="li" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}><Icon name="tools" size={26} /></div>
          <h4>Tecnico</h4>
          <p>Diagnostico, reparacion, insumos y prueba final desde el piso del taller.</p>
        </div>
        <div className="login-card" onClick={() => setRol('cliente')}>
          <div className="li" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}><Icon name="user" size={26} /></div>
          <h4>Cliente</h4>
          <p>Seguimiento tipo paqueteria, cotizaciones, historial y garantia.</p>
        </div>
      </div>

      {rol && (
        <div className="card mt24" style={{ maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' }}>
          <div className="row between mb16">
            <h3 className="card-title">
              {rol === 'admin' && <><Icon name="gear" size={16} />Iniciar como Administrador</>}
              {rol === 'tecnico' && <><Icon name="tools" size={16} />Selecciona el tecnico</>}
              {rol === 'cliente' && <><Icon name="user" size={16} />Selecciona el cliente</>}
            </h3>
            <button className="btn sm ghost" onClick={() => setRol(null)}>Cancelar</button>
          </div>

          {rol === 'admin' && (
            <button
              className="btn primary lg block"
              onClick={() => entrar('admin', 'admin')}
            >
              <Icon name="bolt" size={16} /> Entrar como Administrador del taller
            </button>
          )}

          {rol === 'tecnico' && (
            <div className="col">
              {data.tecnicos.filter((t) => t.activo).map((t) => (
                <button key={t.id} className="btn block" style={{ justifyContent: 'space-between', padding: '12px 16px' }} onClick={() => entrar('tecnico', t.id)}>
                  <span className="row"><Icon name="tools" size={15} /> {t.nombre}</span>
                  <span className="badge blue">{t.especialidad}</span>
                </button>
              ))}
            </div>
          )}

          {rol === 'cliente' && (
            <div className="col">
              {data.clientes.map((c) => (
                <button key={c.id} className="btn block" style={{ justifyContent: 'space-between', padding: '12px 16px' }} onClick={() => entrar('cliente', c.id)}>
                  <span className="row">
                    <Icon name={c.tipo === 'flotilla_corporativa' ? 'building' : 'user'} size={15} />
                    {c.nombre}
                  </span>
                  <span className="badge gray">{c.tipo === 'flotilla_corporativa' ? 'Flotilla corporativa' : 'Particular'}</span>
                </button>
              ))}
            </div>
          )}

          <p className="muted mt16" style={{ fontSize: 12.5 }}>
            Datos de ejemplo: {data.ordenes.filter((o) => o.estado !== 'delivered' && o.estado !== 'cancelled').length} ordenes activas ·
            Inventario actual ${fmtMXN(data.insumos.reduce((a, i) => a + i.stock * i.precio, 0))}
          </p>
        </div>
      )}
    </div>
  );
}