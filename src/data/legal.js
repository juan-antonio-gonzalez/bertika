// Bertika - Documentos legales y metadatos. FUENTE UNICA.
//
// Los textos se guardan como HTML para que las páginas los rendericen y para
// poder calcular un hash reproducible: el consentimiento guarda la versión y
// el hash del texto que la persona aceptó.
//
// Reglas:
//   - No inventar datos registrales: lo que falta queda "en trámite".
//   - El correo de privacidad es admin@bertika.com.
//   - Si cambia un texto, se sube la versión acá y se corre `npm run legal:archivar`.

export const LEGAL_META = {
  actualizado: '23 de octubre de 2026',
  version: '2026-10-23',
  marca: 'BERTIKA®',
  razonSocial: 'en trámite',
  cuit: 'en trámite',
  domicilio: 'Buenos Aires, Argentina',
  emailPrivacidad: 'admin@bertika.com',
  telefono: '+54 11 2481-3392',
  sitio: 'https://bertika.com',
  aaip: 'https://www.argentina.gob.ar/aaip',
  retencionAnios: 5,
};

const NOTA_REGISTRAL = `<p class="legal-nota"><strong>Versión ${LEGAL_META.version}.</strong> Los datos registrales (razón social, CUIT y domicilio legal) se encuentran <strong>en trámite</strong> y se completarán en la próxima versión. Lo publicado acá es lo que rige mientras tanto.</p>`;

export const LEGAL_DOCS = {
  privacidad: {
    version: LEGAL_META.version,
    titulo: 'Política de privacidad',
    url: '/legal/privacidad',
    html: `
${NOTA_REGISTRAL}
<p>Esta política explica cómo <strong>${LEGAL_META.marca}</strong> trata los datos personales que recibe a través del sitio, del taller, del panel de gestión y del canal de WhatsApp.</p>

<h2>1. Responsable del tratamiento</h2>
<p>El responsable es <strong>${LEGAL_META.marca}</strong>, con domicilio en ${LEGAL_META.domicilio}. Correo de privacidad: <a href="mailto:${LEGAL_META.emailPrivacidad}">${LEGAL_META.emailPrivacidad}</a>. Teléfono: ${LEGAL_META.telefono}. Razón social y CUIT: <strong>en trámite</strong>.</p>
<p>Cuando trata datos por cuenta de un cliente (por ejemplo, los datos de una flotilla), actúa como <strong>encargado del tratamiento</strong> siguiendo las instrucciones de ese cliente. Cuando los usa para su propia gestión comercial, actúa como <strong>responsable</strong>.</p>

<h2>2. Alcance</h2>
<p>Esta política se aplica a:</p>
<ul>
  <li>El sitio <a href="${LEGAL_META.sitio}">${LEGAL_META.sitio}</a> y sus formularios de contacto y cotización.</li>
  <li>El seguimiento público de órdenes por código.</li>
  <li>El panel de gestión del taller (clientes, órdenes, inventario y usuarios).</li>
  <li>La bandeja de WhatsApp y las comunicaciones con clientes.</li>
  <li>El futuro portal de flotillas. Antes de habilitarlo se publicará una versión nueva de esta política.</li>
</ul>

<h2>3. Qué datos tratamos</h2>
<ul>
  <li><strong>Datos de contacto y consulta:</strong> nombre, empresa, email, teléfono, asunto, número de serie y mensaje.</li>
  <li><strong>Datos de la relación comercial:</strong> órdenes, baterías, diagnósticos, cotizaciones, entregas, garantías, pagos y comprobantes.</li>
  <li><strong>Datos de usuarios del panel:</strong> nombre, email, rol, permisos y actividad de acceso.</li>
  <li><strong>Conversaciones de WhatsApp:</strong> teléfono, nombre de perfil, mensajes, archivos que el cliente envía y estado de entrega.</li>
  <li><strong>Registros técnicos:</strong> dirección IP, fecha y hora, navegador y recurso solicitado, con fines de seguridad y diagnóstico.</li>
  <li><strong>Registro de consentimientos:</strong> fecha, IP, navegador, versión y hash del documento aceptado, y categorías de cookies autorizadas.</li>
</ul>
<p>No se solicitan datos sensibles (salud, origen étnico, opiniones políticas, convicciones religiosas, datos biométricos) ni datos de tarjetas. Los pagos, cuando existan, se procesan en la pasarela del proveedor.</p>

<h2>4. Datos de terceros</h2>
<p>Si una persona envía datos de otra persona (por ejemplo, de un chofer o de un compañero de trabajo), declara contar con la base legal y la autorización necesarias, y responde por esa circunstancia.</p>

<h2>5. Para qué usamos los datos</h2>
<ul>
  <li>Responder consultas, preparar presupuestos y coordinar visitas o servicios.</li>
  <li>Gestionar órdenes, reparaciones, entregas, garantías y reclamos.</li>
  <li>Enviar avisos vinculados al servicio: batería recibida, presupuesto listo, lista para retirar y garantía por vencer.</li>
  <li>Gestionar la relación contractual, la facturación y las obligaciones legales y contables.</li>
  <li>Mantener la seguridad del sitio y del panel, prevenir abusos y auditar cambios.</li>
  <li>Acreditar el consentimiento ante un reclamo, una auditoría o un requerimiento de autoridad.</li>
  <li>Medir el uso del sitio <strong>solo si la persona autoriza cookies de medición</strong>. Hoy no hay herramientas de medición activas.</li>
</ul>
<p>No se venden ni se alquilan datos personales con fines publicitarios. No se envían comunicaciones promocionales no solicitadas.</p>

<h2>6. Base legal</h2>
<p>El tratamiento se rige por la Ley 25.326 de Protección de Datos Personales de la República Argentina y su reglamentación.</p>
<ul>
  <li><strong>Consentimiento</strong> para los datos enviados por formularios, para las cookies no necesarias y para las comunicaciones que lo requieran.</li>
  <li><strong>Ejecución de un contrato o medidas precontractuales</strong> para presupuestos, órdenes, reparaciones y garantías.</li>
  <li><strong>Cumplimiento de obligaciones legales</strong> para facturación, contabilidad y conservación de comprobantes.</li>
  <li><strong>Interés legítimo</strong> para seguridad, prevención de abusos, registro de accesos y defensa ante reclamos, sin prevalecer sobre los derechos de la persona.</li>
</ul>

<h2>7. Consentimiento: cómo se otorga y se retira</h2>
<p>El consentimiento se otorga con una casilla que la persona marca de forma expresa; ninguna casilla llega premarcada. En los formularios, la aceptación de los términos y de esta política son dos casillas separadas. La aceptación de cookies no necesarias es independiente y no condiciona el uso del sitio.</p>
<p>Se puede retirar en cualquier momento escribiendo a <a href="mailto:${LEGAL_META.emailPrivacidad}">${LEGAL_META.emailPrivacidad}</a> o usando el <a href="/legal/privacidad/retirar">formulario de retiro y derechos</a>. El retiro no afecta la licitud del tratamiento anterior ni los datos que deban conservarse por una obligación legal.</p>

<h2>8. Cookies y tecnologías similares</h2>
<p>Se usa almacenamiento local del navegador para recordar la sesión y la decisión sobre cookies. Las cookies de medición y marketing están desactivadas por defecto y solo se activan con autorización. El detalle está en la <a href="/legal/cookies">política de cookies</a>.</p>

<h2>9. Con quién compartimos</h2>
<p>Los datos se comparten únicamente con proveedores que prestan servicios necesarios y con autoridades cuando corresponda:</p>
<ul>
  <li>Proveedor de hosting y base de datos.</li>
  <li>Proveedor de correo electrónico para enviar consultas, avisos y respuestas.</li>
  <li>Meta/WhatsApp para enviar y recibir mensajes cuando el canal está habilitado.</li>
  <li>Pasarelas de pago, si en el futuro se habilitan cobros.</li>
  <li>Autoridades públicas, cuando exista un requerimiento legal.</li>
</ul>
<p>Estos proveedores actúan como encargados o responsables según el caso y están obligados a proteger la información.</p>

<h2>10. Transferencia internacional</h2>
<p>Algunos proveedores pueden almacenar o procesar datos fuera de Argentina. En esos casos se aplican las medidas contractuales y de seguridad que correspondan, y se informa en esta política. WhatsApp/Meta procesa los mensajes en su propia infraestructura y bajo sus políticas.</p>

<h2>11. Conservación</h2>
<p>Los registros de consentimiento y las versiones de los documentos legales se conservan <strong>${LEGAL_META.retencionAnios} años</strong>, para poder acreditar qué aceptó cada persona. Los comprobantes fiscales y contables se conservan por el plazo legal (10 años). Las conversaciones de WhatsApp y los datos del CRM se conservan mientras dure la relación y luego por el plazo necesario para garantías, reclamos o obligaciones legales. Los registros técnicos se conservan por períodos acotados.</p>
<p>Cuando el plazo termina, los datos se eliminan o se anonimizan. Los registros de consentimiento pueden conservarse anonimizados como prueba de que existió una aceptación.</p>

<h2>12. Seguridad</h2>
<p>Se aplican medidas razonables: acceso con usuario y contraseña, roles y permisos, registro de auditoría de cambios, respaldos periódicos, cifrado en tránsito, validación de archivos y límites de intentos. Ningún sistema es invulnerable; si ocurre un incidente, se contiene, se investiga y se notifica a quien corresponda.</p>

<h2>13. Derechos</h2>
<p>La persona titular puede pedir <strong>acceso, rectificación, actualización, supresión y oposición</strong> al tratamiento, y retirar su consentimiento. Para hacerlo, escribí a <a href="mailto:${LEGAL_META.emailPrivacidad}">${LEGAL_META.emailPrivacidad}</a> o usá el <a href="/legal/privacidad/retirar">formulario de derechos</a>. Se verifica la identidad antes de actuar y se responde en los plazos legales.</p>
<p>También se puede presentar un reclamo ante la Agencia de Acceso a la Información Pública (AAIP): <a href="${LEGAL_META.aaip}" target="_blank" rel="noopener noreferrer">${LEGAL_META.aaip}</a>.</p>

<h2>14. Inscripción de la base de datos</h2>
<p>La inscripción de la base de datos ante la AAIP se encuentra <strong>en trámite</strong>. Mientras tanto, esta política y los registros de consentimiento son la prueba del tratamiento informado.</p>

<h2>15. Menores de edad</h2>
<p>El sitio y los servicios están dirigidos a personas mayores de 18 años. No se recogen datos de menores de forma consciente. Si se detectan, se eliminan a la brevedad a pedido del representante legal.</p>

<h2>16. Cambios y versiones</h2>
<p>Si cambia esta política, se publica una versión nueva con su fecha. Las versiones anteriores quedan archivadas en <a href="/legal/versiones">versiones legales</a>. El consentimiento guarda la versión que la persona aceptó.</p>

<h2>17. Contacto</h2>
<p>Por cualquier consulta sobre privacidad: <a href="mailto:${LEGAL_META.emailPrivacidad}">${LEGAL_META.emailPrivacidad}</a> · ${LEGAL_META.domicilio} · ${LEGAL_META.telefono}.</p>
`,
  },

  cookies: {
    version: LEGAL_META.version,
    titulo: 'Política de cookies',
    url: '/legal/cookies',
    html: `
${NOTA_REGISTRAL}
<p>Esta política explica qué cookies y tecnologías similares usa <strong>${LEGAL_META.marca}</strong>, para qué y cómo se pueden aceptar, rechazar o retirar.</p>

<h2>1. Qué son</h2>
<p>Las cookies son archivos que un sitio guarda en el navegador. También existen tecnologías equivalentes, como el almacenamiento local (<em>localStorage</em>), las etiquetas de medición y los identificadores de dispositivo. Esta política se refiere a todas ellas.</p>
<ul>
  <li><strong>Propias</strong> cuando las gestiona el sitio; <strong>de terceros</strong> cuando las gestiona un proveedor externo.</li>
  <li><strong>De sesión</strong> si se borran al cerrar el navegador; <strong>persistentes</strong> si duran un plazo o hasta que se eliminan.</li>
  <li><strong>Necesarias, de medición o de marketing</strong> según su finalidad.</li>
</ul>

<h2>2. Qué usa Bertika hoy</h2>
<ul>
  <li><strong>Almacenamiento local para la sesión:</strong> guarda el token de acceso del panel. Es necesario para que la persona no tenga que iniciar sesión en cada pantalla.</li>
  <li><strong>Almacenamiento local para la decisión de cookies:</strong> recuerda si se aceptaron o rechazaron las categorías no necesarias.</li>
  <li><strong>No hay herramientas de medición activas.</strong> El sitio está preparado para activarlas, pero solo se cargan si la persona autoriza la categoría “Medición”.</li>
  <li><strong>No hay píxeles publicitarios, redes de afiliación ni cookies de marketing.</strong></li>
  <li>El botón de WhatsApp es un <strong>enlace</strong>: no descarga cookies de WhatsApp hasta que se hace clic. La conversación se rige por las políticas de Meta/WhatsApp.</li>
</ul>

<h2>3. Categorías</h2>
<p>Las categorías <strong>Medición</strong> y <strong>Marketing</strong> están desactivadas por defecto y solo se activan con una acción afirmativa. Las necesarias no requieren consentimiento porque hacen funcionar el sitio y recuerdan la propia decisión.</p>
<table class="legal-table">
  <thead><tr><th>Categoría</th><th>Nombre</th><th>Proveedor</th><th>Finalidad</th><th>Duración</th><th>Estado</th></tr></thead>
  <tbody>
    <tr><td>Necesarias</td><td><code>bertika-token</code></td><td>Bertika</td><td>Mantener la sesión del panel.</td><td>Hasta cerrar sesión o borrar datos del sitio.</td><td>Siempre activa</td></tr>
    <tr><td>Necesarias</td><td><code>bertika-consent-v1</code></td><td>Bertika</td><td>Guardar la decisión sobre cookies no necesarias.</td><td>Hasta borrar datos del sitio.</td><td>Siempre activa</td></tr>
    <tr><td>Medición</td><td><code>_ga</code>, <code>_ga_&lt;ID&gt;</code></td><td>Google (tercero)</td><td>Medir visitas y páginas vistas de forma agregada, con IP anonimizada.</td><td>Hasta 24 meses.</td><td>Desactivada por defecto</td></tr>
    <tr><td>Marketing</td><td>—</td><td>—</td><td>No hay cookies de esta categoría previstas ni instaladas.</td><td>—</td><td>No se utilizan</td></tr>
  </tbody>
</table>
<p>Si en el futuro se incorporan cookies de medición o marketing, se informarán en esta tabla y quedarán desactivadas hasta obtener el consentimiento.</p>

<h2>4. Base legal y consentimiento</h2>
<p>En Argentina, la Ley 25.326 y los criterios de la AAIP exigen consentimiento previo para las cookies no esenciales. Por eso ninguna cookie de medición o marketing se activa antes de que la persona la autorice. No se usan casillas premarcadas y rechazar las cookies no necesarias no impide usar el sitio ni contactar al taller.</p>

<h2>5. Cómo aceptar, rechazar o retirar</h2>
<p>La primera visita muestra un aviso con tres opciones de igual importancia: <strong>aceptar todas</strong>, <strong>rechazar todas</strong> o <strong>elegir cuáles</strong>. La decisión se guarda en el navegador y se registra en el servidor con fecha, versión y categorías autorizadas.</p>
<p>Para cambiarla:</p>
<ul>
  <li>Usá <strong>“Cambiar preferencias”</strong> en el pie del sitio.</li>
  <li>Borrando los datos del sitio en el navegador: el aviso vuelve a aparecer.</li>
  <li>Escribiendo a <a href="mailto:${LEGAL_META.emailPrivacidad}">${LEGAL_META.emailPrivacidad}</a> para dejar registrado el retiro.</li>
</ul>

<h2>6. Terceros y enlaces</h2>
<p>No se instalan cookies de terceros con fines publicitarios. Los terceros que podrían intervenir son el proveedor de medición —solo con consentimiento— y los sitios a los que se accede por un enlace, como WhatsApp o Google Maps. Esos sitios tienen sus propias políticas.</p>

<h2>7. Más información</h2>
<p>El tratamiento de datos personales se explica en la <a href="/legal/privacidad">política de privacidad</a>. Consultas: <a href="mailto:${LEGAL_META.emailPrivacidad}">${LEGAL_META.emailPrivacidad}</a>.</p>
`,
  },

  terminos: {
    version: LEGAL_META.version,
    titulo: 'Términos y condiciones',
    url: '/legal/terminos',
    html: `
${NOTA_REGISTRAL}
<p>Estos términos regulan el uso del sitio, del taller y del panel de gestión de <strong>${LEGAL_META.marca}</strong>. Al usar el sitio o enviar un formulario, la persona acepta estos términos y la <a href="/legal/privacidad">política de privacidad</a>.</p>

<h2>1. Objeto y alcance</h2>
<p>Bertika brinda servicios de diagnóstico, reparación, reacondicionamiento, venta, mantenimiento y reciclaje de acumuladores industriales, y pone a disposición un sitio informativo, un cotizador, un seguimiento público de órdenes y un panel de gestión para el taller y sus clientes.</p>

<h2>2. Uso del sitio</h2>
<p>El sitio se puede usar para consultar información, pedir presupuestos, solicitar visitas, crear órdenes de reparación y hacer seguimiento. No se permite usarlo para fines ilícitos, intentar acceder a datos de otras personas, interferir con el funcionamiento, extraer información de forma masiva o suplantar identidades.</p>

<h2>3. Cuentas y credenciales</h2>
<p>Las cuentas del panel son personales. Cada usuario es responsable de mantener su contraseña y de las acciones realizadas con su cuenta. Si una empresa tiene varios usuarios, su administrador decide quién entra y quién sale. Bertika puede suspender una cuenta ante un uso indebido o un riesgo de seguridad.</p>

<h2>4. Presupuestos y precios</h2>
<p>Los precios del sitio y del cotizador son estimativos, salvo que se indique lo contrario. Pueden estar en pesos o en dólares, con el tipo de cambio indicado, y no incluyen impuestos si no se aclara. Un presupuesto enviado por WhatsApp o email tiene la vigencia que figure en ese mensaje. La cotización formal y la orden de trabajo son las que rigen la operación.</p>

<h2>5. Órdenes, reparaciones y garantías</h2>
<p>La recepción de una batería no implica que la reparación sea posible. El diagnóstico determina el alcance, el costo y el plazo. La garantía se registra en la orden de entrega y cubre lo que allí se indique; no cubre daños por mal uso, sobrecarga, golpes, humedad, reparaciones de terceros o desgaste normal. Los plazos son estimados y pueden variar por disponibilidad de repuestos o causas ajenas al taller.</p>

<h2>6. Entregas y retiro</h2>
<p>La batería se entrega contra pago y con la garantía registrada. Si el cliente no retira un equipo en el plazo informado, Bertika puede aplicar costos de almacenamiento o coordinar la disposición del equipo, avisando previamente. Las baterías no reclamadas o no reparables se gestionan según la normativa de residuos peligrosos y la trazabilidad de reciclaje.</p>

<h2>7. Pagos</h2>
<p>Los medios de pago habilitados se informan en el taller o en la orden. Si en el futuro se habilitan pagos en línea, se procesan en la pasarela del proveedor; Bertika no almacena números de tarjeta. Los comprobantes y la facturación se emiten conforme a la normativa fiscal argentina.</p>

<h2>8. Portal de flotillas</h2>
<p>Cuando se habilite el portal de flotillas, el acceso será para la empresa cliente y sus usuarios autorizados. La empresa es responsable de los datos que carga y de administrar sus usuarios. Las solicitudes de visita o service que se hagan desde el portal son <strong>pedidos sujetos a confirmación</strong> del taller, no turnos automáticos. La información de garantías y estados es informativa; prevalece la orden de trabajo.</p>

<h2>9. Propiedad intelectual</h2>
<p>La marca, el sitio, el software, los textos, las imágenes y el diseño son de Bertika o de sus licenciantes. No se puede copiar, modificar, distribuir ni usar comercialmente sin autorización. Los datos de la flota y de los clientes pertenecen a cada cliente; Bertika los usa solo para prestar el servicio.</p>

<h2>10. Disponibilidad y responsabilidad</h2>
<p>El sitio y el panel pueden tener interrupciones por mantenimiento, fallas de internet o causas de fuerza mayor. Bertika pone medidas razonables para mantenerlos disponibles y seguros, pero no garantiza que funcionen sin interrupciones. En la medida permitida por la ley, la responsabilidad se limita al daño directo comprobable y no alcanza daños indirectos o lucro cesante. Nada de esto limita los derechos que la ley reconoce al consumidor.</p>

<h2>11. Datos personales y cookies</h2>
<p>El tratamiento de datos se rige por la <a href="/legal/privacidad">política de privacidad</a> y el uso de cookies por la <a href="/legal/cookies">política de cookies</a>, que forman parte de estos términos.</p>

<h2>12. Cambios</h2>
<p>Bertika puede actualizar estos términos. La versión vigente es la publicada en el sitio, con su fecha. Si el cambio es relevante, se avisa por los canales habituales. Las versiones anteriores quedan en <a href="/legal/versiones">versiones legales</a>.</p>

<h2>13. Ley aplicable y jurisdicción</h2>
<p>Estos términos se rigen por las leyes de la República Argentina. Cualquier controversia se somete a los tribunales ordinarios competentes del domicilio de Bertika, salvo que la ley disponga otro fuero para consumidores.</p>

<h2>14. Contacto</h2>
<p>Consultas sobre estos términos: <a href="mailto:${LEGAL_META.emailPrivacidad}">${LEGAL_META.emailPrivacidad}</a> · ${LEGAL_META.domicilio} · ${LEGAL_META.telefono}.</p>
`,
  },
};

// Texto canónico de un documento: la API le calcula SHA-256 y el archivo
// histórico guarda el mismo hash para poder verificar qué versión se aceptó.
export function textoLegalCanonico(html) {
  // Se normalizan los saltos de línea para que el hash no dependa del sistema
  // operativo ni del editor.
  return String(html || '').replace(/\r\n/g, '\n').trim();
}

export const LEGAL_VERSIONES = Object.fromEntries(
  Object.entries(LEGAL_DOCS).map(([clave, doc]) => [clave, { version: doc.version, titulo: doc.titulo, url: doc.url }])
);
