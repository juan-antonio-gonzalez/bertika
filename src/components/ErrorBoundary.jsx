import { Component } from 'react';
import { CONTACTO } from '../data/siteData';

// Red de seguridad: evita la pantalla en blanco.
//
// 1) Si el navegador quedo con una version anterior y el deploy borro ese
//    archivo (lo tipico: "Failed to fetch dynamically imported module" o el
//    TypeError de React.lazy al no resolver el modulo), se recarga una vez.
// 2) Si aun asi falla, se muestra un cartel con "Recargar" en vez de nada.

const CLAVE_TS = 'bertika-reload-deploy';
const ESPERA_MS = 30000;

// Recarga como maximo una vez cada 30 segundos: evita loops si el problema
// persiste y se autocorrige en el proximo deploy.
export function recargarUnaVez() {
  try {
    const ultimo = Number(sessionStorage.getItem(CLAVE_TS) || 0);
    if (Date.now() - ultimo < ESPERA_MS) return false;
    sessionStorage.setItem(CLAVE_TS, String(Date.now()));
  } catch {
    /* sin sessionStorage igual recargamos */
  }
  window.location.reload();
  return true;
}

// Vite avisa por este evento cuando no puede precargar un modulo dinamico.
export function manejarPreloadError(evento) {
  evento?.preventDefault?.();
  recargarUnaVez();
}

// Errores que casi siempre significan "el archivo que pedia ya no existe".
function esErrorDeArchivo(error) {
  const m = `${error?.message || ''} ${error?.stack || ''}`;
  return /dynamically imported module|Importing a module script failed|Loading chunk|MIME type|Failed to fetch|error loading dynamically|reading 'default'/i.test(m);
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[bertika] error de interfaz:', error);
    if (esErrorDeArchivo(error)) recargarUnaVez();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="wrap page center" style={{ minHeight: '70vh', placeContent: 'center', textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
        <div>
          <div style={{ width: 46, height: 46, display: 'grid', placeItems: 'center', margin: '0 auto 14px', background: 'linear-gradient(135deg, var(--amber), var(--orange))', borderRadius: 12 }}>
            <span style={{ color: '#fff', fontWeight: 800 }}>B</span>
          </div>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>No pudimos cargar esta pantalla</h1>
          <p className="muted" style={{ margin: '0 0 6px' }}>
            Puede que el sitio se haya actualizado y tu navegador tenga guardada una versión anterior.
            Recargá la página y seguimos.
          </p>
          <p className="muted" style={{ margin: '0 0 18px', fontSize: 12.5 }}>
            Si el problema continúa, escribinos a <a href={`mailto:${CONTACTO.emailVentas}`} style={{ textDecoration: 'underline' }}>{CONTACTO.emailVentas}</a> o por WhatsApp al {CONTACTO.telefono} y lo resolvemos.
          </p>
          <div className="row" style={{ gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => window.location.reload()}>Recargar la página</button>
            <a className="btn" href="/">Ir al inicio</a>
          </div>
          {import.meta.env.DEV && (
            <pre className="muted" style={{ textAlign: 'left', fontSize: 11, marginTop: 18, whiteSpace: 'pre-wrap' }}>
              {String(error?.stack || error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
