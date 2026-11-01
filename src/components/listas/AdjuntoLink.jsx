import { useEffect, useState } from 'react';
import { BASE_URL, apiDescargar, getToken } from '../../store/api';

const esPrivado = (url) => String(url || '').includes('/api/lista-adjuntos/');

export function AdjuntoLink({ url, nombre, className = '', children }) {
  const abrir = async (e) => {
    e.stopPropagation();
    if (!url) return;
    if (!esPrivado(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      await apiDescargar(url.replace(/^\/api/, ''), nombre || 'adjunto');
    } catch (err) {
      window.alert(err.message || 'No se pudo descargar el adjunto.');
    }
  };
  return (
    <button type="button" className={className} onClick={abrir} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
      {children}
    </button>
  );
}

export function AdjuntoImg({ url, alt, className }) {
  const [src, setSrc] = useState(esPrivado(url) ? '' : url);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!esPrivado(url)) { setSrc(url); return undefined; }
    const cargar = async () => {
      try {
        const res = await fetch(BASE_URL + url.replace(/^\/api/, ''), {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error('No se pudo cargar');
        const blob = await res.blob();
        const lector = new FileReader();
        lector.onload = () => { if (vivo) setSrc(String(lector.result || '')); };
        lector.readAsDataURL(blob);
      } catch {
        if (vivo) setError(true);
      }
    };
    cargar();
    return () => { vivo = false; };
  }, [url]);

  if (error) return <div className={`${className || ''} gallery-noimg`}>No disponible</div>;
  if (!src) return <div className={`${className || ''} gallery-noimg`}>Cargando...</div>;
  return <img src={src} alt={alt || 'Adjunto'} className={className} />;
}
