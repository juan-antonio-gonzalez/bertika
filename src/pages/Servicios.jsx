import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';
import { PRODUCTOS } from '../data/siteData';

const servicios = [
  {
    titulo: 'Rectificado y reparación',
    desc: 'Cambio de celdas, relleno de electrolito, ecualizaciones y recarga profunda en bancos de carga industriales.',
  },
  {
    titulo: 'Diagnóstico y prueba',
    desc: 'Voltaje, resistencia interna y prueba de capacidad con equipo especializado. Resultado documentado.',
  },
  {
    titulo: 'Capacitación',
    desc: 'Formación para operadores y técnicos sobre manejo, mantenimiento y seguridad de baterías industriales.',
  },
  {
    titulo: 'Mantenimiento preventivo',
    desc: 'Programas de mantenimiento periódico para flotillas de autoelevadores, UPS y bancos estacionarios.',
  },
  {
    titulo: 'Retiro de baterías en desuso',
    desc: 'Logística de retiro en planta y posterior reciclaje responsable de plomo, ácido y plásticos.',
  },
  {
    titulo: 'Reciclaje certificado',
    desc: 'Gestión de residuos desviados del circuito urbano hacia operaciones de reutilización y eliminación definitiva.',
  },
];

export default function Servicios() {
  return (
    <>
      <section className="page-hero">
        <div className="page-hero-bg">
          <img src="/img/slide00-drop.jpg" alt="" />
        </div>
        <div className="wrap">
          <h1>Servicios</h1>
          <div className="breadcrumb">
            <Link to="/">Home</Link> / Servicios
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <h2 className="sec-title">Un servicio integral</h2>
          <p className="sec-sub">
            Desde el diagnóstico hasta el reciclaje. Ninguna batería sale del taller sin pasar la prueba final de carga y capacidad.
          </p>
          <div className="service-grid">
            {servicios.map((s) => (
              <div key={s.titulo} className="service-card">
                <div className="sc-body">
                  <h3 className="sc-title">{s.titulo}</h3>
                  <hr className="hr-red" />
                  <p className="sc-desc">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="center mt32 row" style={{ justifyContent: 'center', gap: 10 }}>
            <Link to="/contacto" className="btn primary lg">Solicitar presupuesto</Link>
            <Link to="/cotizador" className="btn lg"><Icon name="calculator" size={15} /> Cotizador de visita</Link>
          </div>

          <div className="mt32">
            <h3 className="sec-title" style={{ fontSize: 22 }}>También comercializamos</h3>
            <div className="service-grid">
              {PRODUCTOS.map((p) => (
                <Link key={p.id} to={`/productos#${p.id}`} className="service-card" style={{ color: 'inherit' }}>
                  <div className="sc-thumb"><img src={p.img} alt={p.titulo} /></div>
                  <div className="sc-body">
                    <h3 className="sc-title" style={{ fontSize: 14 }}>{p.titulo}</h3>
                    <hr className="hr-red" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}