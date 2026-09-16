import { Link } from 'react-router-dom';

export default function Ecologica() {
  return (
    <>
      <section className="page-hero">
        <div className="page-hero-bg">
          <img src="/img/img-mundo.jpg" alt="" />
        </div>
        <div className="wrap">
          <h1>Política Ecológica</h1>
          <div className="breadcrumb">
            <Link to="/">Home</Link> / Política Ecológica
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="grid2" style={{ alignItems: 'center', gap: 40 }}>
            <div>
              <img src="/img/img-mundo.jpg" alt="Reciclaje de baterías" style={{ width: '100%', borderRadius: 12, boxShadow: 'var(--shadow-lg)' }} />
            </div>
            <div>
              <h2 className="sec-title">Comprometidos con el medio ambiente</h2>
              <p className="muted" style={{ lineHeight: 1.7 }}>
                A nivel de gestión de recursos, los acumuladores eléctricos usados se consideran como una
                fuente de materias primas secundarias. Metales, plásticos y ácidos son recolectados por el
                sistema y desviados del circuito de los residuos urbanos, y dirigidos a operaciones de
                reutilización y eliminación definitiva.
              </p>
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
        </div>
      </section>
    </>
  );
}