import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';
import SectionVideo from '../components/SectionVideo';
import { PRODUCTOS } from '../data/siteData';
import { api } from '../store/api';

// Video de fondo del hero: escena 3D propia (nave de baterías) renderizada
// con Three.js. Sin marcas de agua, sin stock y sin licencias de terceros.
const HERO_VIDEO = '/video/hero-bateria-3d.mp4';

// Ficha técnica resumida de cada línea. Sale de las descripciones del catálogo
// (siteData.js): acá solo se abrevia, no se agregan datos nuevos.
const LINEA_DATOS = {
  ferroviarias: { app: 'Arranque de locomotoras', spec: 'Uso severo · alto ciclado' },
  traccion: { app: 'Autoelevadores y tracción', spec: '230 – 1750 Ah' },
  estacionarias: { app: 'Reserva y emergencia', spec: 'Suministro continuo' },
  solar: { app: 'Acumulación solar y eólica', spec: 'Descarga profunda' },
  arranque: { app: 'Ignición de motores', spec: 'Alta entrega de corriente' },
  especiales: { app: 'AGM · Gel · pilas · Ni-Cd', spec: 'Aplicaciones específicas' },
  cargadores: { app: 'Carga y ecualización', spec: 'Control automático' },
};

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

  // Los títulos del catálogo están en mayúsculas; en el índice se leen mejor
  // en caja baja (solo el índice, el catálogo conserva su estilo).
  const enCajaBaja = (t) => t.charAt(0).toUpperCase() + t.slice(1).toLocaleLowerCase('es');

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

      {/* Productos: matriz técnica. Densa y verificable, no un índice de tarjetas. */}
      <section className="sec sec-alt">
        <div className="wrap">
          <header className="sec-head">
            <span className="eyebrow">Catálogo</span>
            <h2 className="sec-title">Siete líneas, siete regímenes de trabajo</h2>
            <p className="sec-sub">
              Cada aplicación exige una química y una construcción distinta. Esta es la referencia
              rápida; el detalle con normas está en el catálogo.
            </p>
          </header>

          <div className="matriz">
            <div className="matriz-head" aria-hidden="true">
              <span />
              <span>Línea</span>
              <span>Aplicación</span>
              <span>Referencia</span>
              <span />
            </div>

            {PRODUCTOS.map((p) => {
              const datos = LINEA_DATOS[p.id] || {};
              return (
                <Link key={p.id} to={`/productos/${p.id}`} className="matriz-row">
                  <span className="matriz-thumb">
                    <img src={p.img} alt="" loading="lazy" width="370" height="214" />
                  </span>
                  <span className="matriz-nombre">{enCajaBaja(p.titulo)}</span>
                  <span className="matriz-app">{datos.app}</span>
                  <span className="matriz-spec">{datos.spec}</span>
                  <span className="matriz-go" aria-hidden="true">→</span>
                </Link>
              );
            })}
          </div>

          <div className="matriz-pie">
            <span>¿No sabés qué línea te corresponde? Con el número de serie lo identificamos.</span>
            <Link to="/productos" className="btn primary">Ver el catálogo completo</Link>
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