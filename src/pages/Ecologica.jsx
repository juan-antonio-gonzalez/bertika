import { Link } from 'react-router-dom';
import AmsaLink from '../components/AmsaLink';
import SectionVideo from '../components/SectionVideo';
import { AMSA } from '../data/siteData';

export default function Ecologica() {
  return (
    <>
      <section className="page-hero page-hero--eco-video">
        <SectionVideo src="/video/seccion-ecologia.mp4" poster="/img/seccion-ecologia.jpg" className="sec-video--eco-hero" />
        <div className="wrap">
          <div className="page-hero-kicker">Política Ecológica</div>
          <h1 className="page-hero-title">Cerramos el <span className="hl-orange">ciclo</span> de la energía</h1>
          <div className="breadcrumb">
            <Link to="/">Home</Link> / Política Ecológica
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          {/* Mismo relato y misma imagen que la landing de AMSA Forbat, con
              links directos a su política ecológica y a su sitio. */}
          <div className="split">
            <figure className="split-media">
              <img
                src="/img/img-mundo.jpg"
                alt="Compromiso ambiental de AMSA Forbat"
                loading="lazy"
              />
              <figcaption>
                Recuperación de metales, plásticos y ácidos: economía circular en la producción
                de acumuladores.
              </figcaption>
            </figure>

            <div className="split-body">
              <span className="eyebrow">El fabricante</span>
              <h2 className="sec-title">Comprometidos con el medio ambiente</h2>
              <p className="split-lead">
                A nivel de gestión de recursos, los acumuladores eléctricos usados se consideran una
                fuente de materias primas secundarias. Metales, plásticos y ácidos son recolectados
                por el sistema y desviados del circuito de los residuos urbanos, y dirigidos a
                operaciones de reutilización y eliminación definitiva.
              </p>
              <p className="split-lead">
                La utilización de materiales reciclados para la producción de acumuladores eléctricos
                tiene un impacto positivo: disminuye el gasto de energía, la contaminación derivada de
                la producción y el ahorro de recursos naturales.{' '}
                <strong>FORBAT Acumuladores Industriales S.R.L.</strong> mantiene un compromiso
                ineludible con la protección del medio ambiente.
              </p>
              <div className="amsa-eco-acciones">
                <AmsaLink href={AMSA.politicaUrl} className="btn primary" showIcon>
                  Ver la política ecológica de AMSA
                </AmsaLink>
                <AmsaLink href={AMSA.url} className="btn" showIcon>
                  Sitio oficial de AMSA Forbat
                </AmsaLink>
              </div>
            </div>
          </div>

          <div className="grid3 mt32" style={{ gap: 20 }}>
            {[
              { t: 'Ahorro de energía', d: 'La utilización de materiales reciclados disminuye el gasto de energía derivado de la producción de nuevos materiales.' },
              { t: 'Menos contaminación', d: 'Desvío del circuito de residuos urbanos: menos contaminación derivada de la fabricación.' },
              { t: 'Recursos naturales', d: 'La recuperación de metales y ácidos ahorra recursos naturales y materias primas vírgenes.' },
            ].map((x) => (
              <div key={x.t} className="card">
                <h4 className="card-title">{x.t}</h4>
                <p className="card-sub">{x.d}</p>
              </div>
            ))}
          </div>

          <div className="center mt32">
            <Link to="/contacto" className="btn primary lg">Consultar sobre reciclaje</Link>
          </div>

          <p className="amsa-eco-fuente">
            Contenido y política del fabricante:{' '}
            <AmsaLink href={AMSA.politicaUrl} className="link-amsa">
              AMSA Forbat
            </AmsaLink>
            .
          </p>
        </div>
      </section>
    </>
  );
}
