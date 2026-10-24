import { useEffect, useRef, useState } from 'react';

// Fondo de video para una sección: carga y reproduce solo cuando entra en
// pantalla, y si el usuario pide reducir movimiento o el video falla, queda
// el poster fijo. Así la home no baja 10 MB de videos de golpe.
export default function SectionVideo({ src, poster, className = '' }) {
  const videoRef = useRef(null);
  const [pocoMovimiento, setPocoMovimiento] = useState(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const aplicar = () => setPocoMovimiento(mq.matches);
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const io = new IntersectionObserver(([entrada]) => {
      if (entrada.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.05, rootMargin: '250px 0px' });
    io.observe(v);
    return () => io.disconnect();
  }, [pocoMovimiento, fallo]);

  return (
    <div className={`sec-video ${className}`} aria-hidden="true">
      <img src={poster} alt="" loading="lazy" />
      {!pocoMovimiento && !fallo && (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster={poster}
          onError={() => setFallo(true)}
        >
          <source src={src} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
