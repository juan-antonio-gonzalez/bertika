export const PRODUCTOS = [
  {
    id: 'ferroviarias',
    titulo: 'BATERÍAS FERROVIARIAS',
    img: '/img/ferroviarias-370x214.png',
    desc: 'Las baterías para arranque de locomotoras fueron diseñadas para operar sobre condiciones severas de vibraciones, tiempo y temperatura, posibilitando un alto número de ciclos de arranque, un máximo de eficiencia y confiabilidad a sus usuarios.',
  },
  {
    id: 'traccion',
    titulo: 'BATERÍAS DE TRACCIÓN',
    img: '/img/traccion-370x214.png',
    desc: 'Las baterías traccionarias ofrecen lo máximo en eficiencia y confiabilidad a sus usuarios, presentan versiones desde 230 a 1750 A/h.',
  },
  {
    id: 'estacionarias',
    titulo: 'BATERÍAS ESTACIONARIAS',
    img: '/img/estacionarias-370x214.png',
    desc: 'Estas baterías adquieren especial importancia porque son la fuente de energía de los sistemas de reserva o emergencia de diversas aplicaciones, por lo que requieren una alta fiabilidad de suministro eléctrico.',
  },
  {
    id: 'solar',
    titulo: 'BATERÍAS DE USO SOLAR Y EÓLICO',
    img: '/img/solar-370x214.png',
    desc: 'Las baterías de uso solar y eólico fueron diseñadas para cumplir con el requerimiento de acumulación de energía de reserva, permitiendo obtener una alta confiabilidad del sistema de energía bajo exigencias de uso más desfavorables.',
  },
  {
    id: 'arranque',
    titulo: 'BATERÍAS DE ARRANQUE',
    img: '/img/arranque-370x214.png',
    desc: 'Las baterías de arranque fueron diseñadas para cumplir con el requerimiento de gran entrega de energía en el momento de la ignición de motores, diseñadas especialmente para uso industrial.',
  },
  {
    id: 'especiales',
    titulo: 'BATERÍAS ESPECIALES',
    img: '/img/especiales-370x214.png',
    desc: 'Nuestra empresa dispone también de baterías para usos específicos: Baterías de Electrolito absorbido, Baterías Gelificadas, Pilas industriales y Baterías Níquel Cadmio.',
  },
  {
    id: 'cargadores',
    titulo: 'CARGADORES DE BATERÍAS',
    img: '/img/cargador.jpg',
    desc: 'Rectificadores y cargadores de baterías para cada tipo de acumulador: arranque, tracción y estacionario, con sistemas de control y ecualización automáticos.',
  },
];

export const CONTACTO = {
  direccion: 'Buenos Aires, Argentina',
  telefono: '1124813392',
  telHref: 'tel:+541124813392',
  telefonoSoporte: '1124869443',
  telHrefSoporte: 'tel:+541124869443',
  waVentas: '541124813392',
  waSoporte: '541124869443',
  email: 'ventas@bertika.com',
  emailVentas: 'ventas@bertika.com',
  emailSoporte: 'soporte.tecnico@bertika.com',
  emailCobranzas: 'cobranzas@bertika.com',
};

export const OFICIAL = 'Representante oficial de AMSA Forbat';

// Horarios de atencion: unica fuente (ComoLlegar, Contacto y Chatbot).
export const HORARIOS = [
  { dias: 'Lunes a Viernes', horas: '8:00 a 17:00' },
  { dias: 'Sábado', horas: '9:00 a 13:00' },
];

// Resumen en una linea para textos y respuestas del chat.
export const HORARIOS_TEXTO = `${HORARIOS[0].dias} de ${HORARIOS[0].horas} hs y ${HORARIOS[1].dias} de ${HORARIOS[1].horas} hs`;

// URL de Google Maps derivada de la direccion (mapa embebido y "como llegar").
export const MAPS_QUERY = encodeURIComponent(CONTACTO.direccion);
export const MAPS_EMBED_URL = `https://maps.google.com/maps?q=${MAPS_QUERY}&z=11&output=embed`;
export const MAPS_DIR_URL = `https://www.google.com/maps/dir/?api=1&destination=${MAPS_QUERY}`;