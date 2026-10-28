import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AMSA, PRODUCTOS } from '../data/siteData';
import AmsaLink from '../components/AmsaLink';
import SectionVideo from '../components/SectionVideo';

export default function Productos() {
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  return (
    <div className="page-light">
      <section className="page-hero page-hero--video">
        <SectionVideo src="/video/vitrina-productos.mp4" poster="/img/vitrina-productos.jpg" className="sec-video--productos-hero" />
        <div className="wrap">
          <div className="page-hero-kicker">Productos</div>
          <h1 className="page-hero-title"><span className="hl-orange">Energía</span> para cada aplicación industrial</h1>
          <div className="breadcrumb">
            <Link to="/">Home</Link> / Productos
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <header className="sec-head">
            <span className="eyebrow">Catálogo</span>
            <h2 className="sec-title">Siete líneas de acumuladores industriales</h2>
            <p className="sec-sub">
              Cada línea está pensada para un régimen de trabajo distinto. Somos representantes
              oficiales de{' '}
              <AmsaLink href={AMSA.url} className="link-amsa" title="Sitio oficial de AMSA Forbat">
                {AMSA.nombre}
              </AmsaLink>
              : las mismas baterías del fabricante, con el respaldo del taller.
            </p>
          </header>

          {/* Mismo formato que la ficha del fabricante: imagen grande + título +
              descripción completa, una línea por fila. */}
          <div className="productos">
            {PRODUCTOS.map((p, i) => (
              <article key={p.id} id={p.id} className="producto">
                <figure className="producto-media">
                  <img
                    src={p.img}
                    alt={p.titulo}
                    width="370"
                    height="214"
                  />
                </figure>
                <div className="producto-body">
                  <span className="producto-kicker">{String(i + 1).padStart(2, '0')} · Línea</span>
                  <h3 className="producto-t">{p.titulo}</h3>
                  <p className="producto-d">{p.desc}</p>
                  <div className="producto-acciones">
                    <Link to={`/productos/${p.id}`} className="lineup-btn">
                      Más info
                    </Link>
                    <Link
                      to={`/contacto?asunto=${encodeURIComponent(p.titulo)}`}
                      className="producto-link"
                    >
                      Consultar <span aria-hidden="true">→</span>
                    </Link>
                    <AmsaLink
                      href={p.amsaUrl}
                      className="producto-link producto-link--amsa"
                      title={`${p.titulo} en el sitio de AMSA Forbat`}
                    >
                      Ver en AMSA <span aria-hidden="true">↗</span>
                    </AmsaLink>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="productos-pie">
            <p>¿No sabés qué línea te corresponde? Con el número de serie lo identificamos.</p>
            <div className="productos-pie-acciones">
              <AmsaLink href={AMSA.url} className="btn lg" showIcon>
                Sitio de AMSA Forbat
              </AmsaLink>
              <Link to="/contacto" className="btn primary lg">Consultar disponibilidad</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}