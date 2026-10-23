import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_DOCS, LEGAL_META } from '../data/legal';

// Historial de versiones legales. El manifiesto lo genera `npm run legal:archivar`
// y queda como archivo estático en public/legal/archivo/index.json.
export default function VersionesLegales() {
  const [versiones, setVersiones] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/legal/archivo/index.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('No se pudo leer el historial'))))
      .then((v) => setVersiones(Array.isArray(v) ? v : []))
      .catch(() => {
        setError('No se pudo cargar el historial; abajo están las versiones vigentes.');
        setVersiones([]);
      });
  }, []);

  const vigentes = Object.values(LEGAL_DOCS).map((d) => ({ titulo: d.titulo, url: d.url }));

  return (
    <div className="legal-page">
      <div className="legal-hero">
        <div className="wrap">
          <p className="legal-kicker">Legal</p>
          <h1>Versiones de los documentos legales</h1>
          <p className="legal-meta">
            Cada aceptación guarda la versión que la persona tenía delante. Acá está el texto exacto de cada versión publicada.
          </p>
        </div>
      </div>

      <div className="wrap legal-body">
        <div className="legal-prose">
          {error && <p className="legal-nota">{error}</p>}
          {versiones === null && <p className="muted">Cargando historial…</p>}
          {versiones?.length === 0 && !error && (
            <p className="muted">Todavía no hay versiones archivadas.</p>
          )}
          {(versiones || []).map((v, i) => (
            <section key={v.version} className="legal-version">
              <div className="legal-version-head">
                <h2>Versión {v.version}</h2>
                {i === 0 && <span className="badge green">Vigente</span>}
                {v.fecha && <span className="muted">{v.fecha}</span>}
              </div>
              <ul>
                {(v.documentos || []).map((d) => (
                  <li key={d.url}><a href={d.url} target="_blank" rel="noreferrer">{d.titulo}</a></li>
                ))}
              </ul>
              <p className="muted legal-version-nota">
                Texto congelado el día de su publicación. No se modifica: si cambia una política, se publica una versión nueva.
                Se conserva por {LEGAL_META.retencionAnios} años.
              </p>
            </section>
          ))}

          <div className="legal-version">
            <h2>Versiones vigentes</h2>
            <ul>
              {vigentes.map((d) => <li key={d.url}><Link to={d.url}>{d.titulo}</Link></li>)}
            </ul>
            <p className="muted legal-version-nota">
              Las versiones anteriores se conservan por {LEGAL_META.retencionAnios} años, el plazo durante el cual puede ser necesario
              acreditar qué texto aceptó una persona.
            </p>
          </div>
        </div>
        <aside className="legal-aside">
          <h2>Documentos</h2>
          <nav>
            <Link to="/legal/privacidad">Política de privacidad</Link>
            <Link to="/legal/cookies">Política de cookies</Link>
            <Link to="/legal/terminos">Términos y condiciones</Link>
            <Link to="/legal/privacidad/retirar">Retirar consentimiento y derechos</Link>
          </nav>
          <Link to="/" className="legal-volver">← Volver al sitio</Link>
        </aside>
      </div>
    </div>
  );
}
