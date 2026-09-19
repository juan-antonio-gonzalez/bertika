import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { Icon } from '../components/ui';
import { useStore } from '../store/store';
import { CONTACTO } from '../data/siteData';

const IcoMarker = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IcoPhone = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

export default function Auth() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const login = useStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Ingresá tu email y contraseña.');
      return;
    }
    setEnviando(true);
    try {
      await login(email.trim(), password);
      navigate('/home');
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión. Verificá tus credenciales.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="wrap page-wide">
      {user && <Navigate to="/home" replace />}
      <div className="auth-wrap">
        <div className="auth-brand">
          <div>
            <div className="auth-logo">
              <span className="auth-logo-box"><Icon name="bolt" size={22} /></span>
              <span>BERTIKA<sup style={{ fontSize: 10 }}>®</sup></span>
            </div>
            <div className="auth-tag">Plataforma de clientes del taller</div>
          </div>

          <div className="auth-mid">
            <h2>Acceso seguro</h2>
            <p className="auth-brand-lead">
              Seguimiento en tiempo real de tus baterías en reparación, cotizaciones para
              aprobar, historial, garantías y reportes. Cada cuenta tiene permisos según su
              rol: administrador, técnico o cliente.
            </p>
            <ul className="auth-contact">
              <li>
                <span className="fi"><IcoMarker /></span>
                <span><span className="lbl">Ubicación</span>{CONTACTO.direccion}</span>
              </li>
              <li>
                <span className="fi"><IcoPhone /></span>
                <span><span className="lbl">Ventas (tel/WhatsApp)</span><a href={CONTACTO.telHref} target="_blank" rel="noopener noreferrer">{CONTACTO.telefono}</a></span>
              </li>
              <li>
                <span className="fi"><Icon name="tools" size={13} /></span>
                <span><span className="lbl">Soporte técnico</span><a href={CONTACTO.telHrefSoporte} target="_blank" rel="noopener noreferrer">{CONTACTO.telefonoSoporte}</a></span>
              </li>
              <li>
                <span className="fi"><Icon name="mail" size={13} /></span>
                <span><span className="lbl">Soporte técnico</span><a href={`mailto:${CONTACTO.emailSoporte}`}>{CONTACTO.emailSoporte}</a></span>
              </li>
            </ul>
          </div>

          <div className="auth-amsa">Representante oficial de <b>AMSA Forbat</b></div>
        </div>

        <div className="auth-form-side">
          <div className="auth-card auth-card-wide">
            <h2>Iniciar sesión</h2>
            <p className="auth-sub">
              Usá el email y la contraseña que te entregó el taller para acceder
              a tu plataforma.
            </p>

            {error && (
              <div className="banner-red" style={{ marginBottom: 16 }}>
                <div><Icon name="x" size={15} /> {error}</div>
              </div>
            )}

            <form onSubmit={onSubmit} noValidate>
              <div className="field">
                <label>Email *</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="username"
                  disabled={enviando}
                />
              </div>
              <div className="field">
                <label>Contraseña *</label>
                <div className="pass-wrap">
                  <input
                    className="input"
                    type={ver ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tu contraseña"
                    autoComplete="current-password"
                    disabled={enviando}
                  />
                  <button type="button" className="pass-eye" onClick={() => setVer((v) => !v)} title={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    <Icon name={ver ? 'eye-off' : 'eye'} size={16} />
                  </button>
                </div>
              </div>
              <button className="btn primary lg block auth-submit" disabled={enviando}>
                <Icon name="check" size={16} /> {enviando ? 'Ingresando...' : 'Ingresar a la plataforma'}
              </button>
            </form>

            <div className="auth-foot">
              <Link to="/" className="auth-back"><Icon name="home" size={13} /> Volver al sitio</Link>
              <Link to="/seguimiento" className="auth-back"><Icon name="search" size={13} /> Hacer seguimiento</Link>
              <a className="auth-back" href={`mailto:${CONTACTO.emailSoporte}?subject=${encodeURIComponent('No puedo ingresar a la plataforma')}`}>
                <Icon name="mail" size={13} /> ¿Olvidaste la contraseña?
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}