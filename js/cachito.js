/* ============================================================
   cachito.js — el chanchito de la casa.
   Dibujado en SVG, sin imágenes: pesa nada y se ve nítido
   en cualquier pantalla. Cambia de cara según los números.
   ============================================================ */

const PIG = 'var(--pig)', PIG2 = 'var(--pig-2)', INK = 'var(--pig-ink)';

/* moods: feliz · ok · alerta · festejo · dormido */
export function cachito(mood = 'ok', size = 62){
  const anteojos =
    '<g fill="#14263F">' +
      '<rect x="24.5" y="26" width="15" height="10" rx="4.4"/>' +
      '<rect x="44.5" y="26" width="15" height="10" rx="4.4"/>' +
      '<rect x="38.6" y="29" width="7" height="2.6"/></g>' +
    '<path d="M22 28.5c2-1.6 3.2-2 5-2M62 28.5c-2-1.6-3.2-2-5-2" stroke="#14263F" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<path d="M27 28.5l4 2.5M47 28.5l4 2.5" stroke="rgba(255,255,255,.5)" stroke-width="1.8" stroke-linecap="round"/>';

  const ojosAbiertos =
    `<circle cx="33" cy="31" r="2.6" fill="${INK}"/><circle cx="51" cy="31" r="2.6" fill="${INK}"/>`;
  const ojosDormido =
    `<path d="M29 31c2-2.4 6-2.4 8 0M47 31c2-2.4 6-2.4 8 0" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;

  const ojos = mood === 'alerta' ? ojosAbiertos
             : mood === 'dormido' ? ojosDormido
             : anteojos;

  const boca =
    mood === 'feliz'   ? `<path d="M35 46c3.2 3.2 7.4 3.2 10.6 0" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` :
    mood === 'festejo' ? `<path d="M33 45c4 5.5 11 5.5 15 0z" fill="${INK}"/>` :
    mood === 'alerta'  ? `<ellipse cx="41" cy="47" rx="3.4" ry="2.6" fill="${INK}"/>` :
    mood === 'dormido' ? `<path d="M37 47h7" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` :
                         `<path d="M36 47h9" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;

  const extra = mood === 'festejo'
    ? '<g stroke="var(--gold)" stroke-width="2.4" stroke-linecap="round">' +
      '<path d="M10 14l-3-4M74 14l3-4M42 8V3"/></g>'
    : mood === 'dormido'
    ? '<text x="67" y="18" font-family="Baloo 2, sans-serif" font-size="13" font-weight="700" fill="var(--muted)">z</text>'
    : '';

  return `<svg viewBox="0 0 84 74" width="${size}" height="${Math.round(size * 74 / 84)}" ` +
    `role="img" aria-label="Cachito, el chanchito">` +
    `<path d="M27 24c-3-6-2-11 1.5-12.5C32 10 36 14 37.5 19z" fill="${PIG2}"/>` +
    `<path d="M57 24c3-6 2-11-1.5-12.5C52 10 48 14 46.5 19z" fill="${PIG2}"/>` +
    `<ellipse cx="42" cy="38" rx="27" ry="23" fill="${PIG}"/>` +
    ojos +
    `<ellipse cx="41" cy="43" rx="9.5" ry="7.5" fill="${PIG2}"/>` +
    `<ellipse cx="37.8" cy="43" rx="1.5" ry="2.1" fill="${INK}"/>` +
    `<ellipse cx="44.2" cy="43" rx="1.5" ry="2.1" fill="${INK}"/>` +
    boca + extra + '</svg>';
}

export function bocadillo(mood, titulo, texto){
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  return `<div class="av">${cachito(mood, 62)}</div><div>` +
    `<span class="who2">Cachito dice</span><strong>${esc(titulo)}</strong><p>${esc(texto)}</p></div>`;
}
