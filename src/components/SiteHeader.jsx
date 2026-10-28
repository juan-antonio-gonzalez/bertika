import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from './ui';
import { useStore } from '../store/store';

const menuItems = [
  { label: 'HOME', to: '/' },
  { label: 'NUESTRA EMPRESA', to: '/empresa' },
  {
    label: 'PRODUCTOS',
    to: '/productos',
    children: [
      { label: 'Baterías Ferroviarias', to: '/productos/ferroviarias' },
      { label: 'Baterías de Tracción', to: '/productos/traccion' },
      { label: 'Baterías Estacionarias', to: '/productos/estacionarias' },
      { label: 'Baterías de uso Solar y Eólico', to: '/productos/solar' },
      { label: 'Baterías de Arranque', to: '/productos/arranque' },
      { label: 'Baterías Especiales', to: '/productos/especiales' },
      { label: 'Cargadores de Baterías', to: '/productos/cargadores' },
    ],
  },
  { label: 'SERVICIOS', to: '/servicios' },
  { label: 'POLÍTICA ECOLÓGICA', to: '/politica-ecologica' },
  { label: 'CÓMO LLEGAR', to: '/como-llegar' },
  { label: 'SEGUIMIENTO', to: '/seguimiento' },
];

export default function SiteHeader() {
  const location = useLocation();
  const user = useStore((s) => s.user);
  const [open, setOpen] = useState(false);

  // El login lleva al panel que corresponde si ya hay sesión abierta.
  const loginDest = user?.rol === 'admin' ? '/hub' : user?.rol === 'tecnico' ? '/tecnico' : user?.rol === 'cliente' ? '/cliente' : '/auth';

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <>
      {/* Logo + normas */}
      <header className="site-header">
        <div className="wrap">
          <Link to="/" className="brand" aria-label="Bertika — Acumuladores Industriales">
            <img
              className="brand-logo"
              src="/img/logo-bertika.png"
              alt="Bertika® Acumuladores Industriales"
              width="460"
              height="82"
            />
            <span className="brand-lines">
              <span className="brand-tag">Acumuladores Industriales</span>
              <span className="brand-amsa">Representante oficial de AMSA Forbat</span>
            </span>
          </Link>
          <div className="header-right">
            <div className="normas-box">
              {[
                { grupo: 'Norma Nacional', norma: 'FA8019' },
                { grupo: 'Norma Nacional', norma: 'FA8020' },
                { grupo: 'Norma Internacional', norma: 'S-508 AAFDM' },
              ].map((n) => (
                <div key={n.norma} className="nb-item">
                  <span className="nb-check" aria-hidden="true">
                    <Icon name="check" size={11} />
                  </span>
                  <span className="nb-label">{n.grupo}</span>
                  <span className="nb-code">{n.norma}</span>
                </div>
              ))}
            </div>
            <Link
              to={loginDest}
              className="header-login header-login--icon"
              title="Ingreso de clientes"
              aria-label="Ingreso de clientes"
            >
              <Icon name="user" size={16} />
            </Link>
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
            <Link to="/cotizador" className="nav-cta nav-cta--cotizador">COTIZADOR</Link>
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
