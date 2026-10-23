import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_META } from '../data/legal';

// Layout de las páginas legales: hero, texto y navegación lateral.
// El HTML viene de src/data/legal.js (contenido propio, no de terceros).
export default function LegalLayout({ doc, children }) {
  useEffect(() => {
    const previo = document.title;
    document.title = `${doc.titulo} · BERTIKA®`;
    return () => { document.title = previo; };
  }, [doc]);

  return (
    <div className="legal-page">
      <div className="legal-hero">
        <div className="wrap">
          <p className="legal-kicker">Legal</p>
          <h1>{doc.titulo}</h1>
          <p className="legal-meta">
            Última actualización: {LEGAL_META.actualizado} · Versión {doc.version}
          </p>
        </div>
      </div>

      <div className="wrap legal-body">
        <article className="legal-prose" dangerouslySetInnerHTML={{ __html: doc.html }} />
        <aside className="legal-aside" aria-label="Documentos legales">
          <h2>Documentos</h2>
          <nav>
            <Link to="/legal/privacidad">Política de privacidad</Link>
            <Link to="/legal/cookies">Política de cookies</Link>
            <Link to="/legal/terminos">Términos y condiciones</Link>
            <Link to="/legal/privacidad/retirar">Retirar consentimiento y derechos</Link>
            <Link to="/legal/versiones">Versiones legales</Link>
          </nav>
          <h2>Preferencias</h2>
          <button
            type="button"
            className="btn sm"
            onClick={() => window.dispatchEvent(new Event('bertika:cookies'))}
          >
            Cambiar preferencias de cookies
          </button>
          <p className="legal-aside-contacto">
            Privacidad: <a href={`mailto:${LEGAL_META.emailPrivacidad}`}>{LEGAL_META.emailPrivacidad}</a>
          </p>
          <Link to="/" className="legal-volver">← Volver al sitio</Link>
        </aside>
      </div>
      {children}
    </div>
  );
}
