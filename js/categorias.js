/* ============================================================
   categorias.js — la categoría se asigna sola.
   Quien carga un gasto sólo pone el lugar y el monto; acá
   decidimos si eso es supermercado, kiosco, nafta o qué.
   ============================================================ */

/* Color e ícono de cada categoría. Fijos por categoría, nunca
   por ranking: "Kiosco" es siempre naranja, esté arriba o abajo. */
export const CATS = {
  'Supermercado': { c:'var(--c-super)',  i:'carro' },
  'Kiosco':       { c:'var(--c-kiosco)', i:'golo' },
  'Panadería':    { c:'var(--c-pan)',    i:'pan' },
  'Transporte':   { c:'var(--c-transp)', i:'auto' },
  'Salud':        { c:'var(--c-salud)',  i:'salud' },
  'Educación':    { c:'var(--c-edu)',    i:'libro' },
  'Servicios':    { c:'var(--c-serv)',   i:'rayo' },
  'Casa':         { c:'var(--c-casa)',   i:'casa' },
  'Ocio':         { c:'var(--c-otros)',  i:'juego' },
  'Ropa':         { c:'var(--c-otros)',  i:'otros' },
  'Otros':        { c:'var(--c-otros)',  i:'otros' }
};
export const catC = c => (CATS[c] || CATS.Otros).c;
export const catI = c => (CATS[c] || CATS.Otros).i;

/* Los lugares de siempre: un toque y a poner el monto. */
export const LUGARES = [
  { id:'dasa',  nom:'DASA',        cat:'Supermercado', ic:'carro', desc:'distribuidora' },
  { id:'maxi',  nom:'MaxiConsumo', cat:'Supermercado', ic:'caja',  desc:'mayorista' },
  { id:'pan',   nom:'Panadería',   cat:'Panadería',    ic:'pan',   desc:'' },
  { id:'imp',   nom:'Imperio',     cat:'Kiosco',       ic:'golo',  desc:'kiosco' },
  { id:'ruta3', nom:'Ruta 3',      cat:'Kiosco',       ic:'golo',  desc:'kiosco' },
  { id:'mil',   nom:'Milhouse',    cat:'Kiosco',       ic:'golo',  desc:'kiosco' }
];

/* Palabras que delatan la categoría. El orden importa: se toma
   la primera que aparezca, así que lo específico va antes que
   lo general ("super" antes que "mercado"). */
const REGLAS = [
  ['Supermercado', ['dasa','maxiconsumo','maxi consumo','la anonima','la anónima','super','coto','carrefour','dia%','changomas','mayorista','almacen','almacén','verduler','carnicer','pescader','fiambrer']],
  ['Kiosco',       ['imperio','ruta 3','ruta3','milhouse','kiosco','kiosko','maxikiosco','golosina','cigarr']],
  ['Panadería',    ['panader','panaderia','panadería','factura','pan ','bizcoch','conflitur','confiter']],
  ['Transporte',   ['nafta','combustible','ypf','shell','axion','puma','gnc','peaje','estacionamiento','cochera','taxi','remis','cubierta','neumatic','neumátic','service','mecanic','mecánic','lubricentro','seguro','sancor','federacion patronal','federación patronal','patente','vtv','lavadero']],
  ['Salud',        ['osde','farmacia','remedio','medicament','dentista','odontolog','oculista','optica','óptica','laboratorio','clinica','clínica','sanatorio','kinesio']],
  ['Educación',    ['escuela','colegio','jif','ingles','inglés','next','universidad','ugr','utn','facultad','cuota','matricula','matrícula','libreria','librería','util escolar','útil escolar','curso','instituto']],
  ['Servicios',    ['camuzzi','gas','luz','cooperativa','electric','eléctric','agua','internet','wifi','telecentro','tv fuego','cable','celular','tuenti','claro','personal','movistar','telefon','teléfon','abono','claude','chatgpt','spotify','suscrip']],
  ['Casa',         ['ferreter','pintureria','pinturería','sodimac','easy','corralon','corralón','mueble','electrodomest','electrodomést','limpieza','bazar','jardin','jardín','alquiler','expensa','municipal','inmobiliar']],
  ['Ocio',         ['netflix','disney','hbo','max','prime','cine','resto','restaurant','bar ','cerve','helad','delivery','pedidosya','rappi','salida','juego','play','steam','regalo','cumple']],
  ['Ropa',         ['ropa','zapatill','calzado','indument','zara','tienda','remera','pantalon','pantalón','campera']]
];

/* Devuelve la categoría que corresponde a un texto libre.
   Si no reconoce nada, "Otros" — nunca inventa. */
export function categorizar(texto){
  const t = ' ' + String(texto || '').toLowerCase().trim() + ' ';
  if (!t.trim()) return 'Otros';
  const lugar = LUGARES.find(l => t.includes(l.nom.toLowerCase()));
  if (lugar) return lugar.cat;
  for (const [cat, claves] of REGLAS)
    for (const k of claves) if (t.includes(k)) return cat;
  return 'Otros';
}

/* Los íconos de trazo. Uno por concepto, 24x24. */
export const IC = {
  carro:'<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
  caja:'<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>',
  golo:'<path d="M5.6 8h12.8l-1.1 11.4a1.6 1.6 0 0 1-1.6 1.4H8.3a1.6 1.6 0 0 1-1.6-1.4z"/><path d="M9 8V6.4a3 3 0 0 1 6 0V8"/>',
  pan:'<rect x="3" y="9" width="18" height="8.5" rx="4.2"/><path d="M9 9.6v7.3M14 9.6v7.3"/>',
  auto:'<path d="M5 16h14M6.5 16l1.2-5A2 2 0 0 1 9.6 9.5h4.8a2 2 0 0 1 1.9 1.5l1.2 5"/><rect x="3" y="16" width="18" height="4" rx="1.6"/><path d="M7 20v1M17 20v1"/>',
  salud:'<path d="M12 20s-7-4.4-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7C19 15.6 12 20 12 20z"/>',
  libro:'<path d="M4 5.5A2 2 0 0 1 6 4h5v16H6a2 2 0 0 1-2-1.6z"/><path d="M20 5.5A2 2 0 0 0 18 4h-5v16h5a2 2 0 0 0 2-1.6z"/>',
  rayo:'<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  casa:'<path d="M4 11l8-6 8 6v8a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19z"/><path d="M10 21v-6h4v6"/>',
  juego:'<rect x="3" y="8" width="18" height="10" rx="4"/><path d="M8 11v4M6 13h4M16 12.5h.01M18 15h.01"/>',
  mas:'<path d="M12 5v14M5 12h14"/>',
  otros:'<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  home:'<path d="M4 11l8-6 8 6v8a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19z"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  meta:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/>',
  stats:'<path d="M5 20V10M12 20V4M19 20v-7"/>',
  alerta:'<path d="M12 9v4.5M12 17h.01"/><path d="M10.3 4L2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/>',
  ok:'<path d="M20 6L9 17l-5-5"/>',
  baja:'<path d="M12 5v14M5 12l7 7 7-7"/>',
  sube:'<path d="M12 19V5M5 12l7-7 7 7"/>',
  tuerca:'<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'
};
export const svg = (p, cls) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"' + (cls ? ' class="' + cls + '"' : '') + '>' + p + '</svg>';
