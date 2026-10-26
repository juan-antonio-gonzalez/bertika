import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { manejarPreloadError } from './components/ErrorBoundary.jsx';
import './index.css';
// Tema del sitio público (kit Bertika). Va después de index.css porque lo
// re-tiñe solo, y todo su alcance está bajo `.site-pub`.
import './styles/bertika-publico.css';

// Si el navegador quedo con una version vieja y el deploy borro ese archivo,
// Vite emite este evento: recargamos una vez para traer la version nueva.
window.addEventListener('vite:preloadError', manejarPreloadError);

// La recarga anti-cache agrega ?_r=<timestamp>. Se limpia al arrancar para que
// no quede en la barra de direcciones ni en un enlace compartido.
try {
  const url = new URL(window.location.href);
  if (url.searchParams.has('_r')) {
    url.searchParams.delete('_r');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
} catch {
  /* sin History API se sigue igual */
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
