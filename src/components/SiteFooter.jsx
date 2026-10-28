import { Link } from 'react-router-dom';
import { Icon } from './ui';
import AmsaLink from './AmsaLink';
import { AMSA, CONTACTO, OFICIAL } from '../data/siteData';

const productos = [
  { label: 'Baterías Ferroviarias', to: '/productos/ferroviarias' },
  { label: 'Baterías de Tracción', to: '/productos/traccion' },
  { label: 'Baterías Estacionarias', to: '/productos/estacionarias' },
  { label: 'Baterías de uso Solar y Eólico', to: '/productos/solar' },
  { label: 'Baterías de Arranque', to: '/productos/arranque' },
  { label: 'Baterías Especiales', to: '/productos/especiales' },
  { label: 'Cargadores de Baterías', to: '/productos/cargadores' },
];

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <div className="brand-footer">
              <img
                src="/img/logo-bertika.png"
                alt="Bertika® Acumuladores Industriales"
                width="460"
                height="82"
              />
            </div>
            <p style={{ margin: '0 0 16px', lineHeight: 1.6, color: 'rgba(211, 226, 220, 0.72)', maxWidth: 340 }}>
              Especialistas en acumuladores eléctricos industriales. Diagnóstico, reparación, reacondicionamiento y entrega con garantía.
            </p>
            <div className="footer-contact-item">
              <img src="/img/marker-footer.png" alt="" />
              <span>{CONTACTO.direccion}</span>
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
              <span>Ventas: {CONTACTO.emailVentas}</span>
            </div>
            <div className="footer-contact-item">
              <img src="/img/mail-footer.png" alt="" />
              <span>Soporte técnico: {CONTACTO.emailSoporte}</span>
            </div>
            <div className="footer-contact-item">
              <img src="/img/mail-footer.png" alt="" />
              <span>Cobranzas: {CONTACTO.emailCobranzas}</span>
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
              <a href="#" style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(92, 232, 148, 0.12)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', color: 'var(--green)' }}>
                <Icon name="info" size={16} />
              </a>
              <Link to="/plataforma" style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(160deg, #6df795 0%, #14d450 52%, #0a8f37 100%)', display: 'grid', placeItems: 'center', color: 'var(--green-ink)' }}>
                <Icon name="bolt" size={16} />
              </Link>
            </div>
          </div>
        </div>

        {/* Representación oficial: logo del fabricante al pie de todas las
            páginas públicas, con link directo a su sitio. */}
        <div className="footer-amsa-strip">
          <AmsaLink
            href={AMSA.url}
            className="footer-amsa-link"
            title="Sitio oficial de AMSA Forbat"
          >
            <img
              src={AMSA.logoFooter}
              alt="FORBAT · Acumuladores Industriales"
              width="151"
              height="126"
              loading="lazy"
            />
            <span className="footer-amsa-txt">
              <strong>{OFICIAL}</strong>
              <small>Acumuladores industriales · Córdoba, Argentina</small>
            </span>
            <span className="footer-amsa-url">
              bateriasamsa.com <span aria-hidden="true">↗</span>
            </span>
          </AmsaLink>
        </div>

        <div className="footer-legal">
          <Link to="/legal/privacidad">Privacidad</Link>
          <Link to="/legal/terminos">Términos</Link>
          <Link to="/legal/cookies">Cookies</Link>
          <Link to="/legal/privacidad/retirar">Tus datos</Link>
          <button type="button" data-cookie-abrir>Cambiar preferencias</button>
        </div>

        <div className="footer-copy">
          Bertika® — Acumuladores Industriales — {new Date().getFullYear()}
        </div>
      </div>
    </footer>
  );
}
