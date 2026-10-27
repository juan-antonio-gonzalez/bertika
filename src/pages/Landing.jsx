import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';
import SectionVideo from '../components/SectionVideo';
import { PRODUCTOS } from '../data/siteData';
import { api } from '../store/api';

// Video de fondo del hero: escena 3D propia (nave de baterías) renderizada
// con Three.js. Sin marcas de agua, sin stock y sin licencias de terceros.
const HERO_VIDEO = '/video/hero-bateria-3d.mp4';

export default function Landing() {
  const [stats, setStats] = useState({ clientes: 0, baterias: 0, activas: 0, entregadas: 0 });
  const [statsListo, setStatsListo] = useState(false);
  const [videoListo, setVideoListo] = useState(false);
  const [videoFallo, setVideoFallo] = useState(false);
  const [pocoMovimiento, setPocoMovimiento] = useState(false);
  const videoRef = useRef(null);

  // Respeta la preferencia "reducir movimiento" del sistema: sin video, foto fija.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const aplicar = () => setPocoMovimiento(mq.matches);
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, []);

  // Pausa el video cuando el hero sale de pantalla (ahorra batería y datos).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const io = new IntersectionObserver(([entrada]) => {
      if (entrada.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.2 });
    io.observe(v);
    return () => io.disconnect();
  }, [videoListo, videoFallo, pocoMovimiento]);

  useEffect(() => {
    let activo = true;
    api('/public/stats')
      .then((s) => { if (activo) { setStats(s); setStatsListo(true); } })
      .catch(() => { /* estadisticas opcionales */ });
    return () => { activo = false; };
  }, []);

  // Si el taller todavía no tiene datos, la banda de cifras no se muestra:
  // cuatro ceros no comunican nada.
  const hayStats = statsListo && Object.values(stats).some((n) => Number(n) > 0);


  const statList = [
    { n: stats.clientes, l: 'Clientes', ic: 'users' },
    { n: stats.baterias, l: 'Baterías en gestión', ic: 'battery' },
    { n: stats.activas, l: 'Reparaciones en curso', ic: 'tools' },
    { n: stats.entregadas, l: 'Baterías entregadas', ic: 'truck' },
  ];

  return (
    <>
      {/* Hero */}
      <section className={`hero${videoListo ? ' hero--video' : ''}`}>
        <div className="hero-bg">
          <img src="/img/hero-3d-poster.jpg" alt="" />
          {!pocoMovimiento && !videoFallo && (
            <video
              ref={videoRef}
              className={`hero-video${videoListo ? ' is-ready' : ''}`}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster="/img/hero-3d-poster.jpg"
              aria-hidden="true"
              onCanPlay={() => setVideoListo(true)}
              onError={() => setVideoFallo(true)}
            >
              <source src={HERO_VIDEO} type="video/mp4" />
            </video>
          )}
        </div>
        <div className="wrap">
          <div className="hero-inner">
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              <span className="pill"><Icon name="bolt" size={13} /> Taller especializado en baterías industriales</span>
              <span className="pill"><Icon name="shield" size={13} /> Representante oficial de AMSA Forbat</span>
            </div>
            <h1>
              <span className="hl-orange">Salud energética</span><br />
              para que tu operación nunca se detenga
            </h1>
            <p className="lead">
              Recepción, diagnóstico, reparación, prueba de carga y entrega con garantía. Un proceso
              controlado paso a paso con trazabilidad por número de serie y prueba final de capacidad obligatoria.
            </p>
            <div className="ctas">
              <Link to="/productos" className="btn primary lg"><Icon name="bolt" size={18} /> Ver productos</Link>
              <Link to="/cotizador" className="btn lg"><Icon name="calculator" size={16} /> Cotizador de visita</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Cifras: banda con hairlines, los números son los protagonistas.
          Solo aparece cuando hay datos reales del taller. */}
      {hayStats && (
      <section className="sec">
        <div className="wrap">
          <header className="sec-head">
            <span className="eyebrow">En números</span>
            <h2 className="sec-title">El progreso se mide en baterías que vuelven a trabajar</h2>
            <p className="sec-sub">
              Cada batería es un eslabón crítico de tu cadena productiva. Trabajamos para que tu
              operación nunca se detenga.
            </p>
          </header>
          <div className="stats">
            {statList.map((s) => (
              <div key={s.l} className="stat">
                <span className="stat-n">{statsListo ? s.n : '—'}</span>
                <span className="stat-l">{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Productos: grilla sin cajas, como la del fabricante. Foto, título en
          mayúsculas, bajada y botón. Cada ficha abre su página de detalle. */}
      <section className="sec sec-alt">
        <div className="wrap">
          <header className="sec-head">
            <span className="eyebrow">Productos</span>
            <h2 className="sec-title">Una batería para cada necesidad</h2>
          </header>

          <div className="lineup">
            {PRODUCTOS.map((p) => (
              <article key={p.id} className="lineup-item">
                <Link to={`/productos/${p.id}`} className="lineup-foto" tabIndex={-1} aria-hidden="true">
                  <img src={p.img} alt="" width="370" height="214" />
                </Link>
                <h3 className="lineup-t">
                  <Link to={`/productos/${p.id}`}>{p.titulo}</Link>
                </h3>
                <p className="lineup-d">{p.desc}</p>
                <Link to={`/productos/${p.id}`} className="lineup-btn">Más info</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Empresa: imagen + relato + datos duros */}
      <section className="sec sec-alt">
        <div className="wrap split">
          <figure className="split-media">
            <img src="/img/img-automatizacion.jpg" alt="Planta y departamento técnico de Bertika" />
            <figcaption>Departamento técnico propio, bancos de carga y prueba final obligatoria.</figcaption>
          </figure>
          <div className="split-body">
            <span className="eyebrow">La empresa</span>
            <h2 className="sec-title">Dos trayectorias, un mismo taller</h2>
            <p className="split-lead">
              Bertika® nació de la unión de dos recorridos complementarios: la precisión de la
              automatización industrial y la visión de negocio de tres décadas de gestión comercial.
            </p>
            <dl className="datos">
              <div>
                <dt>+20 años</dt>
                <dd>Automatización y procesos</dd>
              </div>
              <div>
                <dt>+30 años</dt>
                <dd>Gestión industrial y comercial</dd>
              </div>
              <div>
                <dt>100%</dt>
                <dd>Trazable por número de serie</dd>
              </div>
            </dl>
            <Link to="/empresa" className="btn primary">Conozca más</Link>
          </div>
        </div>
      </section>

      {/* Ecología: la banda de video es el fondo, el texto va encima */}
      <section className="sec sec-video-sec">
        <SectionVideo src="/video/seccion-ecologia.mp4" poster="/img/seccion-ecologia.jpg" className="sec-video--eco" />
        <div className="wrap">
          <div className="eco-band">
            <div>
              <span className="eyebrow eyebrow--light">Política ecológica</span>
              <h2 className="eco-title">Comprometidos con el medio ambiente</h2>
              <Link to="/politica-ecologica" className="btn lg eco-btn">
                Conocé nuestra política ecológica
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}