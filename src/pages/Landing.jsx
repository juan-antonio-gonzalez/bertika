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
  // Índice de líneas: la imagen y el detalle acompañan a la fila que se mira.
  const [lineaActiva, setLineaActiva] = useState(0);
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

  // Los títulos del catálogo están en mayúsculas; en el índice se leen mejor
  // en caja baja (solo el índice, el catálogo conserva su estilo).
  const enCajaBaja = (t) => t.charAt(0).toUpperCase() + t.slice(1).toLocaleLowerCase('es');
  const linea = PRODUCTOS[lineaActiva] || PRODUCTOS[0];

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

      {/* Cifras: banda con hairlines, los números son los protagonistas */}
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

      {/* Productos */}
      <section className="sec sec-alt page-light">
        <div className="wrap">
          <div className="lineas-head">
            <h2 className="sec-title">Nuestras líneas de productos</h2>
            <p className="sec-sub">
              Siete líneas para cada aplicación industrial. Elegí una y ves su uso y sus normas;
              el detalle completo está en el catálogo.
            </p>
          </div>

          {/* Índice editorial: la fila que se mira manda en la imagen. No repite
              las fichas del catálogo, pero tampoco lo deja en una lista seca. */}
          <div className="lineas-panel">
            <figure className="lineas-media">
              <img key={linea.id} src={linea.img} alt={linea.titulo} width="370" height="214" />
              <figcaption>
                <span className="lineas-media-kicker">En uso</span>
                <strong className="lineas-media-t">{enCajaBaja(linea.titulo)}</strong>
                <span className="lineas-media-d">{linea.desc}</span>
              </figcaption>
            </figure>

            <ul className="lineas-lista">
              {PRODUCTOS.map((p, i) => (
                <li key={p.id}>
                  <Link
                    to={`/productos#${p.id}`}
                    className={`linea-row${i === lineaActiva ? ' on' : ''}`}
                    onMouseEnter={() => setLineaActiva(i)}
                    onFocus={() => setLineaActiva(i)}
                  >
                    <span className="linea-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="linea-nombre">{enCajaBaja(p.titulo)}</span>
                    <span className="linea-go" aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="center" style={{ marginTop: 30 }}>
            <Link to="/productos" className="btn primary lg">Ver el catálogo completo</Link>
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
            </div>
            <div>
              <p className="eco-lead">
                Los acumuladores usados son una fuente de materias primas secundarias: metales,
                plásticos y ácidos se recolectan, clasifican y desvían de los residuos urbanos hacia
                operaciones de reutilización autorizadas.
              </p>
              <ul className="eco-list">
                <li>Reciclaje responsable</li>
                <li>Operaciones autorizadas</li>
                <li>Menos residuos urbanos</li>
              </ul>
              <Link to="/politica-ecologica" className="btn lg">Conocé nuestra política ecológica</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}