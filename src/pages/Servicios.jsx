import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';
import SectionVideo from '../components/SectionVideo';

// Cada servicio con su icono y una línea de alcance. El detalle vive en la
// conversación: la ficha solo ordena y lleva al contacto.
const servicios = [
  {
    titulo: 'Rectificado y reparación',
    desc: 'Cambio de celdas, relleno de electrolito, ecualizaciones y recarga profunda en bancos de carga industriales.',
    ic: 'tools',
  },
  {
    titulo: 'Diagnóstico y prueba',
    desc: 'Voltaje, resistencia interna y prueba de capacidad con equipo especializado. Resultado documentado.',
    ic: 'gauge',
  },
  {
    titulo: 'Capacitación',
    desc: 'Formación para operadores y técnicos sobre manejo, mantenimiento y seguridad de baterías industriales.',
    ic: 'check',
  },
  {
    titulo: 'Mantenimiento preventivo',
    desc: 'Programas de mantenimiento periódico para flotillas de autoelevadores, UPS y bancos estacionarios.',
    ic: 'clock',
  },
  {
    titulo: 'Retiro de baterías en desuso',
    desc: 'Logística de retiro en planta y posterior reciclaje responsable de plomo, ácido y plásticos.',
    ic: 'pin',
  },
  {
    titulo: 'Reciclaje certificado',
    desc: 'Gestión de residuos desviados del circuito urbano hacia operaciones de reutilización y eliminación definitiva.',
    ic: 'recycl',
  },
];

const proceso = [
  { t: 'Recepción', d: 'Ingresamos la batería con su número de serie y queda trazada desde el primer minuto.' },
  { t: 'Diagnóstico', d: 'Medimos voltaje, resistencia interna y capacidad real antes de definir el trabajo.' },
  { t: 'Reparación', d: 'Cambio de celdas, electrolito y ecualización según lo que pida cada banco.' },
  { t: 'Prueba y entrega', d: 'Prueba final de capacidad obligatoria y entrega con garantía por escrito.' },
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
          <header className="sec-head">
            <span className="eyebrow">Servicios</span>
            <h2 className="sec-title">Un servicio <span className="txt-green">integral</span></h2>
            <p className="sec-sub">
              Desde el diagnóstico hasta el reciclaje. Ninguna batería sale del taller sin pasar la
              prueba final de carga y capacidad.
            </p>
          </header>

          <div className="srv-grid">
            {servicios.map((s, i) => (
              <article key={s.titulo} className="card srv">
                <div className="srv-top">
                  <span className="srv-ic"><Icon name={s.ic} size={18} /></span>
                  <span className="srv-num">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3 className="card-title">{s.titulo}</h3>
                <p className="card-sub">{s.desc}</p>
                <Link to={`/contacto?asunto=${encodeURIComponent(s.titulo)}`} className="srv-link">
                  Consultar <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="wrap">
          <header className="sec-head">
            <span className="eyebrow">Proceso</span>
            <h2 className="sec-title">Cómo <span className="txt-green">trabajamos</span></h2>
            <p className="sec-sub">
              Cuatro pasos, siempre en el mismo orden. Es lo que permite garantizar lo que entregamos.
            </p>
          </header>

          <ol className="proceso">
            {proceso.map((p, i) => (
              <li key={p.t} className="proceso-paso">
                <span className="proceso-num">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="proceso-t">{p.t}</h3>
                <p className="proceso-d">{p.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="cta-band">
            <div>
              <h2 className="cta-band-t">¿Necesitás un presupuesto?</h2>
              <p className="cta-band-d">
                Contanos qué tenés y te decimos qué conviene: reparar, reemplazar o programar
                mantenimiento.
              </p>
            </div>
            <div className="cta-band-acciones">
              <Link to="/contacto" className="btn primary lg">Solicitar presupuesto</Link>
              <Link to="/cotizador" className="btn lg">
                <Icon name="calculator" size={15} /> Cotizador de visita
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
