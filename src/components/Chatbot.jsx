import { useEffect, useRef, useState } from 'react';
import { CONTACTO, HORARIOS_TEXTO } from '../data/siteData';

const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const QUIK = [
  '¿Qué baterías venden?',
  '¿Hacen reparaciones?',
  'Precios y presupuesto',
  'Seguimiento de mi batería',
  'Garantía',
  'Horarios y ubicación',
];

function botReply(raw) {
  const t = norm(raw);

  if (/hola|buenas|buen dia|hi|hey|que tal|hola bertika/.test(t)) {
    return '¡Hola! Soy el asistente virtual de Bertika. Consultame sobre baterías, servicios, precios, garantía o seguimiento de tu orden.';
  }
  if (/precio|cuanto cuesta|costo|presupuesto|cotiz|valor|tarifa|barato|caro/.test(t)) {
    return `Los precios varían según línea y formato (ferroviarias, tracción, estacionarias, solar y eólico, arranque, especiales y cargadores). Para armarte una cotización personalizada escribinos por WhatsApp (${CONTACTO.telefono}) o por el formulario de contacto.`;
  }
  if (/ferroviar|locomotora|tren/.test(t)) {
    return 'Las baterías ferroviarias están diseñadas para el arranque de locomotoras: soportan vibraciones, condiciones de temperatura severas y un alto número de ciclos de arranque. Cumplen normas FA8019 y FA8020.';
  }
  if (/traccion|autoelevador|auto elevador|montacarga|industrial pesado|zorra/.test(t)) {
    return 'Las baterías de tracción van de 230 a 1750 Ah y son ideales para autoelevadores y maquinaria de movimiento. Se complementan con cargadores con control y ecualización automáticos.';
  }
  if (/estacionaria|ups|emergencia|reserva|backup|respaldo|telecomunicacion/.test(t)) {
    return 'Las baterías estacionarias alimentan los sistemas de reserva o emergencia (UPS, telecomunicaciones, seguridad), que requieren máxima fiabilidad de suministro eléctrico.';
  }
  if (/solar|eolico|panel|fotovolta|viento/.test(t)) {
    return 'Las baterías de uso solar y eólico acumulan la energía de reserva del sistema, soportando exigencias de uso desfavorables y descargas profundas con alta confiabilidad.';
  }
  if (/arranque|ignicion|arrancar|motor de combust/.test(t)) {
    return 'Las baterías de arranque entregan gran energía en el momento de la ignición del motor. Las nuestras son de diseño especialmente industrial, para uso exigente.';
  }
  if (/especial|gel|electrolito absorbido|niquel|cadmio|nimh|pilas industriales/.test(t)) {
    return 'Disponemos de baterías especiales: electrolito absorbido, gelificadas, pilas industriales y Níquel-Cadmio para aplicaciones específicas.';
  }
  if (/cargador|rectificador|ecualiz/.test(t)) {
    return 'Tenemos rectificadores y cargadores para cada tipo de acumulador (arranque, tracción y estacionario), con sistemas de control y ecualización automáticos.';
  }
  if (/repar|arregl|diagnostico|mantenimiento|reacondicion|service|servicio|taller/.test(t)) {
    return 'Sí, hacemos diagnóstico, reparación y reacondicionamiento con trazabilidad por número de serie y prueba final de capacidad y carga. Ingresá tu batería desde el formulario de contacto eligiendo "Servicio de reparación", o consultanos por WhatsApp.';
  }
  if (/garantia|ciclo|ciclos|meses de garantia/.test(t)) {
    return 'Todas nuestras reparaciones salen del taller con garantía (meses y ciclos de carga) y constancia. La garantía queda registrada en la plataforma de seguimiento.';
  }
  if (/seguimiento|estado|lista|lleva mi|progreso|como va/.test(t)) {
    return 'Podés seguir tu reparación en tiempo real desde la página "Seguimiento", ingresando el número de serie de la batería o el ID de la orden. Te dejo el enlace: /seguimiento';
  }
  if (/reciclaje|reciclar|medio ambiente|ambiental|ecologic|residuos|contamin/.test(t)) {
    return 'Estamos comprometidos con el medio ambiente: los acumuladores usados se consideran fuente de materias primas secundarias. Metales, plásticos y ácidos se desvían de los residuos urbanos hacia operaciones de reutilización autorizadas.';
  }
  if (/horario|abren|abierto|cierran|atenden|lunes a|sabado|lunes a viernes/.test(t)) {
    return `Horarios de atención: ${HORARIOS_TEXTO}.`;
  }
  if (/donde|ubicacion|llego|llegar|direccion|mapa|buenos aires|bsas|caba|estan/.test(t)) {
    return `Estamos en ${CONTACTO.direccion}. En la página "Cómo llegar" encontrarás el mapa interactivo y un botón para abrir la navegación directa en Google Maps.`;
  }
  if (/contacto|contactar|email|telefono|whatsapp|escribir|mail/.test(t)) {
    return `Podés escribirnos por WhatsApp (${CONTACTO.telefono}, ventas), Soporte técnico al ${CONTACTO.telefonoSoporte}, por mail a ${CONTACTO.emailVentas} (ventas y consultas), ${CONTACTO.emailSoporte} (soporte técnico) o desde el formulario de contacto del sitio.`;
  }
  if (/gracias|graci|perfecto|excelente|buenisimo|genial/.test(t)) {
    return '¡A vos! Cualquier otra consulta sobre baterías, estoy acá para ayudarte.';
  }
  if (/productos|catalogo|baterias|bateria|venden|linea|modelo/.test(t)) {
    return 'Trabajamos 7 líneas: Baterías Ferroviarias, de Tracción, Estacionarias, de uso Solar y Eólico, de Arranque, Especiales y Cargadores. En la página "Productos" tenés el detalle de cada una con su aplicación y normas.';
  }
  return 'Gracias por tu consulta. No estoy seguro de haberlo entendido; preguntame por productos, reparaciones, precios, garantía, seguimiento, horarios o ubicación, o escribinos por WhatsApp para atención personalizada.';
}

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: 'bot', text: '¡Hola! Soy el asistente de Bertika. ¿En qué puedo ayudarte con baterías?' },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bodyRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing, open]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const send = (text) => {
    const q = (text ?? '').trim();
    if (!q || typing) return;
    setMessages((m) => [...m, { from: 'user', text: q }]);
    setInput('');
    setTyping(true);
    timer.current = setTimeout(() => {
      setMessages((m) => [...m, { from: 'bot', text: botReply(q) }]);
      setTyping(false);
    }, 850);
  };

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-panel">
          <div className="chat-head">
            <div className="chat-head-info">
              <span className="chat-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="9" width="15" height="11" rx="2" /><path d="M12 9V6.5" /><circle cx="12" cy="4.6" r="1.2" fill="currentColor" stroke="none" /><rect x="2.5" y="12" width="2" height="5" rx="1" /><rect x="19.5" y="12" width="2" height="5" rx="1" /><circle cx="9" cy="13.5" r="1" /><circle cx="15" cy="13.5" r="1" /><path d="M9.5 16.5h5" /></svg>
              </span>
              <div>
                <div className="chat-title">Asistente Bertika</div>
                <div className="chat-status">Respuesta automática · online</div>
              </div>
            </div>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Cerrar chat">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="chat-body" ref={bodyRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.from}`}>{m.text}</div>
            ))}
            {typing && (
              <div className="chat-msg bot chat-typing">
                <span /><span /><span />
              </div>
            )}
          </div>

          <div className="chat-quick">
            {QUIK.map((q) => (
              <button key={q} onClick={() => send(q)}>{q}</button>
            ))}
          </div>

          <div className="chat-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send(input)}
              placeholder="Escribí tu consulta..."
            />
            <button className="chat-send" onClick={() => send(input)} aria-label="Enviar">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        </div>
      )}

      <button className="chat-toggle" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Cerrar chat' : 'Abrir chat'}>
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="9" width="15" height="11" rx="2" /><path d="M12 9V6.5" /><circle cx="12" cy="4.6" r="1.2" fill="currentColor" stroke="none" /><rect x="2.5" y="12" width="2" height="5" rx="1" /><rect x="19.5" y="12" width="2" height="5" rx="1" /><circle cx="9" cy="13.5" r="1" /><circle cx="15" cy="13.5" r="1" /><path d="M9.5 16.5h5" /></svg>
        )}
      </button>
    </div>
  );
}