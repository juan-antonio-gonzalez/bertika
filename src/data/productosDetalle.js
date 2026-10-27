// Ficha completa de cada línea de producto.
// El contenido técnico viene de las fichas del fabricante (AMSA Forbat) y está
// reescrito para Bertika: mismos datos, redacción propia y sin errores de tipeo.
// Cada bloque es { h, p } (párrafo) o { h, items } (lista).

export const PRODUCTO_DETALLE = {
  ferroviarias: {
    resumen:
      'Diseñadas para operar bajo condiciones severas de vibración, tiempo y temperatura, con un alto número de ciclos de arranque, máxima eficiencia y confiabilidad.',
    imagen: '/img/productos/ferroviaria.jpg',
    ficha: [
      { k: 'Tecnología', v: 'Plomo ácido tubular' },
      { k: 'Aplicación', v: 'Arranque ferroviario' },
      { k: 'Garantía', v: '24 meses' },
    ],
    aplicaciones: [
      'Arranque de locomotoras',
      'Iluminación de coches',
      'Señalamiento',
      'Subterráneos y metro',
      'Coches motores',
    ],
    bloques: [
      {
        h: 'Nueva fórmula potenciada',
        p: 'La fórmula entrega gran capacidad de corriente en el momento del arranque de la locomotora, con rápida recuperación, menor consumo de agua y mayor vida útil.',
      },
      {
        h: 'Características constructivas',
        p: 'Placas positivas tubulares y negativas tipo Faure, separadores de PVC envolventes, contenedores de polipropileno, celdas individuales termosoldadas, tapas inyectadas, tapones recuperadores de vapor de ácido y conectores de plomo puro con protectores plásticos.',
      },
      {
        h: 'Rendimiento y vida útil',
        p: 'La construcción tubular sostiene el ciclado intenso del arranque ferroviario y es la de mayor duración del mercado, con garantía integral de 24 meses.',
      },
    ],
  },

  traccion: {
    resumen:
      'Máxima eficiencia y confiabilidad para tracción eléctrica, con versiones de 110 a 1750 Ah. Materias primas de primera calidad, 24 meses de garantía, menor costo operativo y bajo mantenimiento.',
    imagen: '/img/productos/traccion.jpg',
    ficha: [
      { k: 'Capacidades', v: '110 – 1750 Ah' },
      { k: 'Ciclos', v: 'Más de 1500' },
      { k: 'Garantía', v: '24 meses' },
    ],
    aplicaciones: [
      'Autoelevadores eléctricos',
      'Carretillas eléctricas',
      'Minería: locomotoras y vehículos especiales',
      'Vehículos eléctricos',
    ],
    bloques: [
      {
        h: 'Nueva fórmula potenciada',
        p: 'Mayor capacidad específica, menor consumo de agua, mayor rendimiento y baja emisión de gases. Las placas positivas y negativas se optimizaron según el volumen disponible en el recipiente y se mejoró el procedimiento de rellenado.',
      },
      {
        h: 'Productos',
        p: 'Integran la armonización europea de las series DIN y BS, con características idénticas a los repuestos originales para máquinas de procedencia europea, americana y asiática.',
      },
      {
        h: 'Características constructivas',
        p: 'Placas positivas pluritubulares y negativas tipo Faure, separadores de PVC envolventes, celdas individuales termosoldadas, tapas inyectadas, conectores de plomo puro con protectores, tapones tipo clap, cajas de acero con pintura epoxi y cables y fichas según norma.',
      },
      {
        h: 'Rendimiento y vida útil',
        p: 'La placa tubular lleva el rendimiento por encima de los 1500 ciclos, con un menor costo operativo a lo largo de la vida útil.',
      },
    ],
  },

  estacionarias: {
    resumen:
      'Fuente de energía de los sistemas de reserva y emergencia, donde la continuidad de suministro es crítica. Materias primas de primera calidad, 48 meses de garantía y bajo mantenimiento.',
    imagen: '/img/productos/estacionaria.jpg',
    ficha: [
      { k: 'Capacidades', v: '100 – 2500 Ah' },
      { k: 'Vida útil', v: 'Más de 12 años (OPzS)' },
      { k: 'Garantía', v: '48 meses' },
    ],
    aplicaciones: [
      'UPS y respaldo de energía',
      'Telecomunicaciones',
      'Subestaciones eléctricas',
      'Sistemas de seguridad',
    ],
    bloques: [
      {
        h: 'Plomo ácido tubulares OPzS',
        p: 'Acumuladores estacionarios abiertos de 100 a 2500 Ah según la necesidad del cliente. Placas positivas tubulares y negativas tipo Faure, separadores de PVC, contenedores SAN transparentes, celdas termosoldadas, tapas inyectadas, conectores de plomo puro, tapones con recuperador de vapores, estanterías antisísmicas y aislamiento eléctrico. Más de 1500 ciclos y vida útil proyectada superior a 12 años.',
      },
      {
        h: 'AGM VRLA',
        p: 'Reguladas por válvula, selladas a prueba de derrame y de fuga, libres de mantenimiento durante toda su vida útil. La válvula abre cuando la presión interna supera lo normal y vuelve a cerrar al descargarse. Se comercializan celdas de 2 V y baterías de 12 V.',
      },
      {
        h: 'GEL',
        p: 'Vida de diseño de hasta 15 años y aptitud para descarga prolongada. Aleación especial de plomo y calcio que mejora la resistencia anticorrosiva de la rejilla, alta capacidad térmica y recombinación de gas eficiente para ambientes hostiles. Celdas de 2 V y baterías de 12 V.',
      },
      {
        h: 'Níquel cadmio',
        p: 'Funcionamiento eléctrico excelente en altas y bajas temperaturas, alta resistencia mecánica, voltaje de descarga estable, mantenimiento simple, baja autodescarga y alto factor de seguridad.',
      },
    ],
  },

  solar: {
    resumen:
      'Diseñadas para acumular energía renovable con alta confiabilidad bajo condiciones climáticas adversas, usos intensivos y alta profundidad de descarga.',
    imagen: '/img/productos/solar.jpg',
    ficha: [
      { k: 'Capacidades', v: '100 – 2500 Ah' },
      { k: 'Ciclos', v: 'Más de 1500 (tubular)' },
      { k: 'Vida útil', v: 'Más de 12 años' },
    ],
    aplicaciones: [
      'Proyectos industriales, rurales y particulares de energía renovable',
      'Sistemas de iluminación de emergencia',
      'Minería',
      'Proyectos de gas, petróleo y energía',
    ],
    bloques: [
      {
        h: 'Nueva fórmula potenciada',
        p: 'Pensada para acumular la energía de reserva generada por paneles solares, turbinas de agua, motogeneradores y aerogeneradores: baja autodescarga, rápida recuperación y bajo mantenimiento, ideal para descargas durante largos períodos.',
      },
      {
        h: 'Productos',
        p: 'Se producen acumuladores de 100 a 2500 Ah según la necesidad del cliente, con solución para cada requerimiento.',
      },
      {
        h: 'Características constructivas',
        p: 'Línea tubular: placas positivas tubulares y negativas tipo Faure, separadores de PVC, contenedores individuales de polipropileno, celdas termosoldadas, tapas inyectadas, conectores de plomo puro, tapones con recuperador de vapores, estanterías antisísmicas y aislamiento eléctrico. Línea de placa plana: placas positivas de gran robustez, separadores de fibra de vidrio, contenedores block de 6 y 12 V, conectores de plomo puro y terminales tipo L de fácil conexión.',
      },
      {
        h: 'Rendimiento y vida útil',
        p: 'Tecnología tubular: más de 1500 ciclos y vida útil proyectada superior a 12 años. Tecnología de placa plana: hasta 500 ciclos y vida útil proyectada superior a 4 años.',
      },
    ],
  },

  arranque: {
    resumen:
      'Diseñadas para entregar gran energía en el momento de la ignición, con confiabilidad incluso en condiciones desfavorables de tiempo y temperatura.',
    imagen: '/img/productos/arranque.jpg',
    ficha: [
      { k: 'Tecnología', v: 'Plomo calcio · placa plana' },
      { k: 'Uso', v: 'Industrial y comercial' },
      { k: 'Garantía', v: '12 meses' },
    ],
    aplicaciones: [
      'Vehículos industriales',
      'Maquinaria vial',
      'Camiones',
      'Colectivos',
      'Automotores',
    ],
    bloques: [
      {
        h: 'Nueva fórmula potenciada',
        p: 'Formulada para aumentar la potencia en el momento del arranque, con baja autodescarga, rápida recuperación y bajo mantenimiento.',
      },
      {
        h: 'Productos',
        p: 'Baterías de arranque para vehículos industriales y comerciales.',
      },
      {
        h: 'Características constructivas',
        p: 'Placas planas, rejilla de aleación plomo-calcio, conectores reforzados, separadores tipo sobre que previenen cortocircuitos, tapa termosellada y caja de polipropileno.',
      },
      {
        h: 'Rendimiento y vida útil',
        p: 'El conjunto de estas características da un rendimiento mayor, con garantía integral de 12 meses.',
      },
    ],
  },

  especiales: {
    resumen:
      'Baterías para usos específicos donde la química estándar no alcanza: AGM VRLA, GEL, Níquel Cadmio y Litio Ion.',
    imagen: '/img/productos/especiales.jpg',
    ficha: [
      { k: 'Tecnologías', v: 'AGM · GEL · Ni-Cd · Litio' },
      { k: 'Formatos', v: 'Celdas de 2 V y baterías de 12 V' },
      { k: 'Vida útil', v: 'Hasta 15 años (GEL)' },
    ],
    aplicaciones: [
      'Vehículos industriales',
      'Telecomunicaciones',
      'Equipos médicos',
      'Sistemas ininterrumpidos de energía',
      'Señalización y balizamiento',
      'Subestaciones eléctricas',
      'Náutica y seguridad',
      'Energías renovables',
      'Iluminación de emergencia',
      'Plataformas elevadoras',
    ],
    bloques: [
      {
        h: 'AGM VRLA',
        p: 'Reguladas por válvula, selladas a prueba de derrame y de fuga, libres de mantenimiento en toda su vida útil. La válvula abre cuando la presión interna supera lo normal y cierra al descargarse. Celdas de 2 V y baterías de 12 V.',
      },
      {
        h: 'GEL',
        p: 'Vida de diseño de hasta 15 años y descarga prolongada. Aleación de plomo y calcio de alta resistencia anticorrosiva, gran capacidad térmica y recombinación de gas eficiente para ambientes hostiles. Celdas de 2 V y baterías de 12 V.',
      },
      {
        h: 'Níquel cadmio',
        p: 'Excelente funcionamiento en altas y bajas temperaturas, alta resistencia mecánica, voltaje de descarga estable, mantenimiento simple, baja autodescarga y alto factor de seguridad.',
      },
      {
        h: 'Litio Ion',
        p: 'Cumplen requisitos técnicos bajo ambientes especiales de seguridad y confiabilidad. Se instalan con sistema de administración de batería (BMS) con monitoreo, ecualización, protección y alarma.',
      },
    ],
  },

  cargadores: {
    resumen:
      'Rectificadores y cargadores automáticos para cada tipo de acumulador: arranque, tracción y estacionario, con control y ecualización automáticos.',
    imagen: '/img/productos/cargadores.jpg',
    ficha: [
      { k: 'Alimentación', v: '380 V trifásica · 220 V monofásica' },
      { k: 'Curva de carga', v: 'Wa (DIN 41774)' },
      { k: 'Control', v: 'Electrónico multitención' },
    ],
    aplicaciones: [
      'Autoelevadores y tracción',
      'Bancos estacionarios',
      'Arranque industrial',
      'Racks autoestibables',
    ],
    bloques: [
      {
        h: 'Funcionamiento',
        items: [
          'Funcionamiento automático con inicio de carga pocos segundos después de conectar la batería.',
          'Curva de carga Wa (DIN 41774).',
          'Amperaje y tiempo de carga proporcionales al requerimiento de la batería.',
          'Controlador electrónico multitención con display digital.',
        ],
      },
      {
        h: 'Construcción',
        items: [
          'Gabinete metálico con puerta anterior: 500 × 540 × 660 mm (trifásico) y 460 × 370 × 375 mm (monofásico).',
          'Alimentación 380 V trifásica o 220 V monofásica.',
          'Racks autoestibables.',
        ],
      },
    ],
  },
};

// Orden de las líneas para el "siguiente producto" del pie de página.
export const ORDEN_LINEAS = [
  'ferroviarias',
  'traccion',
  'estacionarias',
  'solar',
  'arranque',
  'especiales',
  'cargadores',
];
