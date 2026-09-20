import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { manejarPreloadError } from './components/ErrorBoundary.jsx';
import './index.css';

// Si el navegador quedo con una version vieja y el deploy borro ese archivo,
// Vite emite este evento: recargamos una vez para traer la version nueva.
window.addEventListener('vite:preloadError', manejarPreloadError);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
