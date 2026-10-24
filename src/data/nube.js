// Accesos a la nube de archivos (OpenCloud) desde el panel.
//
// El panel SOLO enlaza: los permisos reales los aplica OpenCloud con el usuario
// de cada persona. Un enlace no da acceso a nada que la nube no permita.
//
// Los IDs de los espacios son los creados el 24/10/2026. Si un espacio se
// recrea, su ID cambia: actualizar la URL correspondiente acá.
export const NUBE_URL = 'https://nube.bertika.com';

export const NUBE_ESPACIOS = {
  ventas: 'https://nube.bertika.com/f/2b85e2cd-9079-49bc-8e09-4c020cc17172$beae9894-f587-4659-bc69-6a728029ec0f',
  taller: 'https://nube.bertika.com/f/2b85e2cd-9079-49bc-8e09-4c020cc17172$7c1ee2e6-4ccf-4f17-9439-49057c5e07b0',
  administracion: 'https://nube.bertika.com/f/2b85e2cd-9079-49bc-8e09-4c020cc17172$2d718d63-0aff-4fae-8407-21443117a746',
  cobranzas: 'https://nube.bertika.com/f/2b85e2cd-9079-49bc-8e09-4c020cc17172$02b00c0f-e919-4266-9a79-7ec542c3df71',
};

// URL de un espacio por su clave; si la clave no existe, la raíz de la nube.
export const nubeUrl = (espacio) => NUBE_ESPACIOS[espacio] || NUBE_URL;
