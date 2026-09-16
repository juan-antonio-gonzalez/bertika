import { Link } from 'react-router-dom';
import { Icon } from './ui';
import { CONTACTO } from '../data/siteData';

const productos = [
  { label: 'Baterías Ferroviarias', to: '/productos#ferroviarias' },
  { label: 'Baterías de Tracción', to: '/productos#traccion' },
  { label: 'Baterías Estacionarias', to: '/productos#estacionarias' },
  { label: 'Baterías de uso Solar y Eólico', to: '/productos#solar' },
  { label: 'Baterías de Arranque', to: '/productos#arranque' },
  { label: 'Baterías Especiales', to: '/productos#especiales' },
];

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <div className="brand-footer">
              <span className="logo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" />
                </svg>
              </span>
              <span>BERTIKA<sup style={{ fontSize: 8 }}>®</sup></span>
            </div>
            <p style={{ margin: '0 0 16px', lineHeight: 1.6, color: 'rgba(255,255,255,0.65)', maxWidth: 340 }}>
              Especialistas en acumuladores eléctricos industriales. Diagnóstico, reparación, reacondicionamiento y entrega con garantía.
            </p>
            <p style={{ margin: '0 0 16px', color: 'var(--amber)', fontWeight: 600 }}>
              Representante oficial de AMSA Forbat
            </p>
            <div className="footer-contact-item">
              <img src="/img/marker-footer.png" alt="" />
              <span>Buenos Aires, Argentina</span>
            </div>
            <div className="footer-contact-item">
              <img src="/img/phone-footer.png" alt="" />
              <span>Ventas (tel/WhatsApp): <a href={CONTACTO.telHref} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{CONTACTO.telefono}</a></span>
            </div>
            <div className="footer-contact-item">
              <img src="/img/phone-footer.png" alt="" />
              <span>Soporte técnico (tel/WhatsApp): <a href={CONTACTO.telHrefSoporte} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{CONTACTO.telefonoSoporte}</a></span>
            </div>
            <div className="footer-contact-item">
              <img src="/img/mail-footer.png" alt="" />
              <span>Ventas: ventas@bertika.com</span>
            </div>
            <div className="footer-contact-item">
              <img src="/img/mail-footer.png" alt="" />
              <span>Soporte técnico: soporte.tecnico@bertika.com</span>
            </div>
            <div className="footer-contact-item">
              <img src="/img/mail-footer.png" alt="" />
              <span>Cobranzas: cobranzas@bertika.com</span>
            </div>
          </div>

          <div>
            <h4>NUESTROS PRODUCTOS</h4>
            <ul className="footer-links">
              {productos.map((p) => (
                <li key={p.to}><Link to={p.to}>{p.label}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4>SERVICIOS</h4>
            <ul className="footer-links">
              <li><Link to="/servicios">Rectificación de baterías</Link></li>
              <li><Link to="/servicios">Capacitación y mantenimiento</Link></li>
              <li><Link to="/servicios">Retiro y reciclaje</Link></li>
            </ul>
            <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
              <a href="#" style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', color: '#fff' }}>
                <Icon name="info" size={16} />
              </a>
              <Link to="/plataforma" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--amber)', display: 'grid', placeItems: 'center', color: '#0a1740' }}>
                <Icon name="bolt" size={16} />
              </Link>
            </div>
          </div>
        </div>

        <div className="footer-copy">
          Bertika® — Acumuladores Industriales — {new Date().getFullYear()}
        </div>
      </div>
    </footer>
  );
}
