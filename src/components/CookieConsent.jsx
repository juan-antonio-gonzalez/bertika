import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../store/api';
import { ANALYTICS } from '../data/siteData';
import { LEGAL_DOCS } from '../data/legal';

const CLAVE = 'bertika-consent-v1';

function leerDecision() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) || 'null');
  } catch {
    return null;
  }
}

// Carga las herramientas de medición SOLO después del consentimiento.
// Hoy no hay IDs configurados: la función queda lista para cuando se activen.
function cargarAnaliticas() {
  if (ANALYTICS.gtmId && !window.__bertikaGtm) {
    window.__bertikaGtm = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtm.js?id=${ANALYTICS.gtmId}`;
    document.head.appendChild(s);
  }
  if (ANALYTICS.gaId && !window.__bertikaGa) {
    window.__bertikaGa = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS.gaId}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ANALYTICS.gaId, { anonymize_ip: true });
  }
}

export default function CookieConsent() {
  const [abierto, setAbierto] = useState(false);
  const [configurar, setConfigurar] = useState(false);
  const [cats, setCats] = useState({ analiticas: false, marketing: false });

  useEffect(() => {
    const guardada = leerDecision();
    if (guardada && guardada.version === LEGAL_DOCS.cookies.version) {
      setCats({ analiticas: Boolean(guardada.analiticas), marketing: Boolean(guardada.marketing) });
      if (guardada.analiticas) cargarAnaliticas();
    } else {
      // Sin decisión o con una versión vieja del aviso: se vuelve a preguntar.
      setAbierto(true);
    }
    const abrir = () => { setConfigurar(false); setAbierto(true); };
    window.addEventListener('bertika:cookies', abrir);
    const clic = (e) => {
      if (e.target instanceof Element && e.target.closest('[data-cookie-abrir]')) {
        e.preventDefault();
        abrir();
      }
    };
    document.addEventListener('click', clic);
    return () => {
      window.removeEventListener('bertika:cookies', abrir);
      document.removeEventListener('click', clic);
    };
  }, []);

  useEffect(() => {
    if (!abierto) return undefined;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [abierto]);

  const guardar = (accion, categorias = cats) => {
    const decision = {
      necesarias: true,
      analiticas: Boolean(categorias.analiticas),
      marketing: Boolean(categorias.marketing),
      version: LEGAL_DOCS.cookies.version,
      fecha: new Date().toISOString(),
      accion,
    };
    try { localStorage.setItem(CLAVE, JSON.stringify(decision)); } catch { /* sin storage */ }
    setAbierto(false);
    setConfigurar(false);
    if (decision.analiticas) cargarAnaliticas();
    api('/consentimiento', {
      method: 'POST',
      body: {
        cookies: {
          necesarias: true,
          analiticas: decision.analiticas,
          marketing: decision.marketing,
        },
        source: 'banner',
        page: window.location.pathname,
        cookiesVersion: decision.version,
        accion,
      },
    }).catch(() => { /* la decisión ya quedó en el navegador */ });
  };

  if (!abierto) return null;

  return (
    <>
      <div className="cookie-overlay" aria-hidden="true" />
      <div
        className="cookie-banner" role="dialog" aria-modal="true" aria-labelledby="cookie-title"
      >
        {!configurar ? (
          <>
            <h2 id="cookie-title">Cookies y privacidad</h2>
            <p>
              Usamos lo mínimo para que el sitio funcione. Las cookies de <strong>medición</strong> y de{' '}
              <strong>marketing</strong> están apagadas hasta que las autorices. Podés aceptarlas, rechazarlas o elegir
              una por una. El detalle está en la <Link to="/legal/cookies">política de cookies</Link>.
            </p>
            <div className="cookie-acciones">
              <button type="button" className="btn primary" onClick={() => guardar('aceptar-todo', { analiticas: true, marketing: true })}>
                Aceptar todas
              </button>
              <button type="button" className="btn" onClick={() => guardar('rechazar-todo', { analiticas: false, marketing: false })}>
                Rechazar todas
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfigurar(true)}>
                Elegir cuáles
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="cookie-title">Elegí qué autorizás</h2>
            <p>Podés cambiarlo cuando quieras desde «Cambiar preferencias» en el pie de página.</p>
            <ul className="cookie-lista">
              <li>
                <span><b>Necesarias</b><small>Guardan tu decisión y hacen funcionar el sitio. No se pueden desactivar.</small></span>
                <span className="badge gray">Siempre</span>
              </li>
              <li>
                <span><b>Medición</b><small>Nos dicen qué páginas resultan útiles y de dónde llegan las visitas. Datos agregados, sin publicidad.</small></span>
                <input
                  type="checkbox" checked={cats.analiticas}
                  onChange={(e) => setCats((c) => ({ ...c, analiticas: e.target.checked }))}
                  aria-label="Autorizar cookies de medición"
                />
              </li>
              <li>
                <span><b>Marketing</b><small>Permiten medir campañas y mostrar anuncios. Hoy no hay ninguna activa.</small></span>
                <input
                  type="checkbox" checked={cats.marketing}
                  onChange={(e) => setCats((c) => ({ ...c, marketing: e.target.checked }))}
                  aria-label="Autorizar cookies de marketing"
                />
              </li>
            </ul>
            <div className="cookie-acciones">
              <button type="button" className="btn primary" onClick={() => guardar('configurar')}>Guardar mi elección</button>
              <button type="button" className="btn ghost" onClick={() => setConfigurar(false)}>Volver</button>
            </div>
          </>
        )}
        <p className="cookie-pie">
          <Link to="/legal/privacidad">Privacidad</Link> · <Link to="/legal/terminos">Términos</Link> ·{' '}
          <Link to="/legal/privacidad/retirar">Tus derechos</Link>
        </p>
      </div>
    </>
  );
}
