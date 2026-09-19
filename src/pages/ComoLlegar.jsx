import { Link } from 'react-router-dom';
import { CONTACTO, HORARIOS, MAPS_EMBED_URL, MAPS_DIR_URL } from '../data/siteData';

export default function ComoLlegar() {
  return (
    <>
      <section className="page-hero">
        <div className="page-hero-bg">
          <img src="/img/fachada.jpg" alt="" />
        </div>
        <div className="wrap">
          <h1>Cómo Llegar</h1>
          <div className="breadcrumb">
            <Link to="/">Home</Link> / Cómo Llegar
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="grid2" style={{ gap: 24, alignItems: 'flex-start' }}>
            <div className="card" style={{ padding: 24 }}>
              <h3 className="card-title">Nuestra planta</h3>
              <hr className="hr-red" style={{ width: 65 }} />
              <div className="col" style={{ gap: 14 }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <img src="/img/marker.png" alt="" style={{ height: 16, marginTop: 2 }} />
                  <span>{CONTACTO.direccion}</span>
                </div>
                <div className="row">
                  <img src="/img/phone.png" alt="" style={{ height: 16 }} />
                  <span>{CONTACTO.telefono}</span>
                </div>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <img src="/img/mail.png" alt="" style={{ height: 16, marginTop: 2 }} />
                  <span>
                    <a href={`mailto:${CONTACTO.emailVentas}`} style={{ fontWeight: 600 }}>{CONTACTO.emailVentas}</a>
                    <br />
                    <a href={`mailto:${CONTACTO.emailSoporte}`} style={{ fontWeight: 600 }}>{CONTACTO.emailSoporte}</a>
                    <br />
                    <a href={`mailto:${CONTACTO.emailCobranzas}`} style={{ fontWeight: 600 }}>{CONTACTO.emailCobranzas}</a>
                  </span>
                </div>
              </div>
            </div>
            <div className="card pad0">
              <iframe
                title="Ubicación Bertika"
                src={MAPS_EMBED_URL}
                style={{ width: '100%', height: 340, border: 0, display: 'block' }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          <div className="center mt24">
            <a
              className="btn primary lg"
              href={MAPS_DIR_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Cómo llegar en Google Maps
            </a>
          </div>

          <div className="card mt24">
            <h3 className="card-title">Horarios de atención</h3>
            <div className="ulist">
              {HORARIOS.map((h) => (
                <div key={h.dias} className="row between" style={{ padding: '8px 0' }}>
                  <span>{h.dias}</span>
                  <strong>{h.horas}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}