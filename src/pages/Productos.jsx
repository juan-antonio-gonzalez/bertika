import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PRODUCTOS } from '../data/siteData';

export default function Productos() {
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [location.hash]);

  return (
    <div className="page-light">
      <section className="page-hero">
        <div className="page-hero-bg">
          <img src="/img/slide00-drop.jpg" alt="" />
        </div>
        <div className="wrap">
          <h1>Productos — Baterías</h1>
          <div className="breadcrumb">
            <Link to="/">Home</Link> / Service
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="banner-warn" style={{ marginBottom: 24, maxWidth: 600, display: 'inline-flex' }}>
            <span>Representante oficial de AMSA Forbat</span>
          </div>
          <div className="service-grid">
            {PRODUCTOS.map((p) => (
              <div key={p.id} id={p.id} className="service-card">
                <div className="sc-thumb"><img src={p.img} alt={p.titulo} /></div>
                <div className="sc-body">
                  <h3 className="sc-title">{p.titulo}</h3>
                  <hr className="hr-red" />
                  <p className="sc-desc">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="center mt32">
            <Link to="/contacto" className="btn primary lg">Consultar disponibilidad</Link>
          </div>
        </div>
      </section>
    </div>
  );
}