import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';
import SectionVideo from '../components/SectionVideo';

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
      <section className="page-hero page-hero--video">
        <SectionVideo src="/video/servicios-nave.mp4" poster="/img/servicios-nave.jpg" className="sec-video--servicios-hero" />
        <div className="wrap">
          <div className="page-hero-kicker">Servicios</div>
          <h1 className="page-hero-title">Devolvemos la <span className="hl-orange">energía</span> a tu operación</h1>
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
          <div className="servicios">
            {servicios.map((s, i) => (
              <article key={s.titulo} className="servicio">
                <span className="servicio-num">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="servicio-t">{s.titulo}</h3>
                <p className="servicio-d">{s.desc}</p>
              </article>
            ))}
          </div>

          <div className="center mt32 row" style={{ justifyContent: 'center', gap: 10 }}>
            <Link to="/contacto" className="btn primary lg">Solicitar presupuesto</Link>
            <Link to="/cotizador" className="btn lg"><Icon name="calculator" size={15} /> Cotizador de visita</Link>
          </div>
        </div>
      </section>
    </>
  );
}
