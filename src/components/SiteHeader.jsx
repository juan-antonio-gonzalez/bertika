import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const menuItems = [
  { label: 'HOME', to: '/' },
  { label: 'NUESTRA EMPRESA', to: '/empresa' },
  {
    label: 'PRODUCTOS',
    to: '/productos',
    children: [
      { label: 'Baterías Ferroviarias', to: '/productos#ferroviarias' },
      { label: 'Baterías de Tracción', to: '/productos#traccion' },
      { label: 'Baterías Estacionarias', to: '/productos#estacionarias' },
      { label: 'Baterías de uso Solar y Eólico', to: '/productos#solar' },
      { label: 'Baterías de Arranque', to: '/productos#arranque' },
      { label: 'Baterías Especiales', to: '/productos#especiales' },
      { label: 'Cargadores de Baterías', to: '/productos#cargadores' },
    ],
  },
  { label: 'SERVICIOS', to: '/servicios' },
  { label: 'POLÍTICA ECOLÓGICA', to: '/politica-ecologica' },
  { label: 'CÓMO LLEGAR', to: '/como-llegar' },
  { label: 'SEGUIMIENTO', to: '/seguimiento' },
];

export default function SiteHeader() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <>
      {/* Logo + normas */}
      <header className="site-header">
        <div className="wrap">
          <Link to="/" className="brand">
            <span className="logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" />
              </svg>
            </span>
            <span>
              BERTIKA<sup style={{ fontSize: 9 }}>®</sup>
              <small style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: 11, letterSpacing: '0.3px' }}>
                Acumuladores Industriales
              </small>
              <small style={{ display: 'block', color: 'var(--amber)', fontSize: 10, letterSpacing: '0.3px', fontWeight: 700 }}>
                Representante oficial de AMSA Forbat
              </small>
            </span>
          </Link>
          <div className="normas-box">
            <div className="nb-item">
              <img src="/img/check.png" alt="" />
              <span className="nb-label">Norma Nacional<br />FA8019</span>
            </div>
            <div className="nb-item">
              <img src="/img/check.png" alt="" />
              <span className="nb-label">Norma Nacional<br />FA8020</span>
            </div>
            <div className="nb-item">
              <img src="/img/check.png" alt="" />
              <span className="nb-label">Norma Internacional<br />S-508 AAFDM</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="site-nav">
        <div className="wrap">
          <div className={`site-main-nav${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
            {menuItems.map((item) =>
              item.children ? (
                <div key={item.label} className="has-dropdown">
                  <Link to={item.to} className={location.pathname === item.to ? 'active' : ''}>{item.label}</Link>
                  <div className="dropdown">
                    {item.children.map((child) => (
                      <Link key={child.to} to={child.to}>{child.label}</Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  key={item.to}
                  to={item.to}
                  className={location.pathname === item.to ? 'active' : ''}
                >
                  {item.label}
                </Link>
              )
            )}
            <Link to="/contacto" className="nav-cta">CONTACTO</Link>
          </div>
          <button className="nav-toggle" onClick={() => setOpen((v) => !v)} aria-label="Abrir menú" aria-expanded={open}>
            <span /><span /><span />
          </button>
        </div>
      </nav>
    </>
  );
}
