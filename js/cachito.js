/* ============================================================
   Cachito — el chanchito de la casa.
   Dibujado a mano en SVG, cambia de cara según cómo viene el mes
   y dice una sola cosa por vez: la más útil.
   ============================================================ */

const FACES = {
  // ojos, boca y cejas por humor
  feliz:      { eyes:'<path d="M30 30c1.6-2.4 4.4-2.4 6 0" /><path d="M48 30c1.6-2.4 4.4-2.4 6 0" />', mouth:'<path d="M36 45c2.8 2.6 6.4 2.6 9.2 0" />', brow:'' },
  ok:         { eyes:'<circle cx="33" cy="30" r="2.1" fill="currentColor" stroke="none"/><circle cx="51" cy="30" r="2.1" fill="currentColor" stroke="none"/>', mouth:'<path d="M37 46h8" />', brow:'' },
  alerta:     { eyes:'<circle cx="33" cy="31" r="2.6" fill="currentColor" stroke="none"/><circle cx="51" cy="31" r="2.6" fill="currentColor" stroke="none"/>', mouth:'<ellipse cx="41" cy="46" rx="3.4" ry="2.6" />', brow:'<path d="M28.5 24.5l6 2.5" /><path d="M55.5 24.5l-6 2.5" />' },
  preocupado: { eyes:'<path d="M30.5 31.5c1.6 2 4.4 2 6 0" /><path d="M48.5 31.5c1.6 2 4.4 2 6 0" />', mouth:'<path d="M36 47c2.8-2.6 6.4-2.6 9.2 0" />', brow:'<path d="M28.5 25l6 3" /><path d="M55.5 25l-6 3" />' },
  festejo:    { eyes:'<path d="M29.5 31c1.8-3.4 5-3.4 6.8 0" /><path d="M47.5 31c1.8-3.4 5-3.4 6.8 0" />', mouth:'<path d="M35 44c3.4 4.4 8 4.4 11.4 0z" fill="currentColor" fill-opacity=".22"/>', brow:'' },
  dormido:    { eyes:'<path d="M29.5 31h7" /><path d="M47.5 31h7" />', mouth:'<circle cx="41" cy="46" r="2.4" />', brow:'' }
};

/** SVG de Cachito. `mood` es una de las claves de FACES. */
export function cachitoSVG(mood = 'ok', size = 62) {
  const f = FACES[mood] || FACES.ok;
  const coins = mood === 'festejo'
    ? `<g class="coins" fill="var(--ochre)" stroke="none">
         <circle cx="17" cy="13" r="3.4"/><circle cx="66" cy="9" r="2.6"/><circle cx="58" cy="17" r="2"/>
       </g>` : '';
  const zzz = mood === 'dormido'
    ? `<g fill="var(--text-3)" stroke="none" font-family="var(--mono)" font-size="7" font-weight="600">
         <text x="62" y="16">z</text><text x="68" y="10" font-size="9">Z</text>
       </g>` : '';
  return `<svg viewBox="0 0 84 74" width="${size}" height="${size * 74 / 84}" role="img"
     aria-label="Cachito, el chanchito de la casa, ${mood}">
    ${coins}${zzz}
    <g class="ear-l"><path d="M27 24c-3-6-2-11 1.5-12.5C32 10 36 14 37.5 19z" fill="var(--pig-2)"/></g>
    <path d="M57 24c3-6 2-11-1.5-12.5C52 10 48 14 46.5 19z" fill="var(--pig-2)"/>
    <ellipse cx="42" cy="38" rx="27" ry="23" fill="var(--pig)"/>
    <path d="M24 58c0 4 0 6 0 6M35 62c0 3 0 4 0 4M49 62c0 3 0 4 0 4M60 58c0 4 0 6 0 6"
          stroke="var(--pig-2)" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="42" cy="38" rx="27" ry="23" fill="var(--pig)"/>
    <rect x="34" y="17" width="16" height="3.4" rx="1.7" fill="var(--pig-ink)" opacity=".55"/>
    <ellipse cx="41" cy="44" rx="9.5" ry="7.5" fill="var(--pig-2)"/>
    <ellipse cx="37.8" cy="44" rx="1.5" ry="2.1" fill="var(--pig-ink)"/>
    <ellipse cx="44.2" cy="44" rx="1.5" ry="2.1" fill="var(--pig-ink)"/>
    <g stroke="var(--pig-ink)" stroke-width="2.1" stroke-linecap="round" fill="none" color="var(--pig-ink)">
      ${f.brow}${f.eyes}
    </g>
    <path d="M69 41c4 1 5 4 3.5 6.5S67 50 65.5 47" fill="var(--pig-2)" opacity=".85"/>
  </svg>`;
}

/* ------------------------------------------------------------
   Qué dice. Se evalúa en orden: gana lo primero que aplique,
   para que nunca hable de tres cosas a la vez.
   ------------------------------------------------------------ */
export function cachitoSay(c) {
  const { total, budget, projection, daysLeft, daysSinceLast, overdueFixed,
          goalDone, goalClose, goalName, goalMissing, savings, monthName,
          hasData, isCurrentMonth, topCategory, topShare } = c;

  if (!hasData)
    return { mood:'ok', title:'Arrancamos',
      line:'Cargá el primer gasto y en dos días ya te puedo decir algo útil. Mientras tanto, miro.' };

  if (goalDone)
    return { mood:'festejo', title:'¡Lo lograste!',
      line:`Llegaste a "${goalName}". Fue juntar de a poco, todos los meses. Ahora elegí la próxima antes de que se te vaya la plata en otra cosa.` };

  if (budget && total > budget)
    return { mood:'preocupado', title:'Nos pasamos',
      line:`Vamos ${money(total - budget)} arriba del presupuesto. No es el fin del mundo, pero conviene frenar lo variable hasta fin de mes y ver qué pasó.` };

  if (isCurrentMonth && budget && projection > budget * 1.05)
    return { mood:'alerta', title:'Ojo con el ritmo',
      line:`A este paso terminás en ${money(projection)}. Bajando ${money((projection - budget) / Math.max(daysLeft, 1))} por día llegás justo.` };

  if (overdueFixed > 0)
    return { mood:'alerta', title:'Tenés fijos vencidos',
      line:`${overdueFixed === 1 ? 'Hay uno' : `Hay ${overdueFixed}`} sin marcar como pagado y ya pasó la fecha. Fijate en la pestaña Fijos, no sea cosa que se te haya escapado.` };

  if (goalClose)
    return { mood:'feliz', title:'Falta poco',
      line:`Para "${goalName}" te faltan ${money(goalMissing)}. Estás cerquísima. Un mes prolijo y listo.` };

  if (isCurrentMonth && daysSinceLast >= 5)
    return { mood:'dormido', title:'Me quedé dormido',
      line:`Hace ${daysSinceLast} días que nadie carga nada. O fue un mes tranquilo, o se están acumulando tickets en el bolsillo.` };

  if (savings > 0 && budget && total < budget * .8)
    return { mood:'feliz', title:'Vas bárbaro',
      line:`Llevás ${money(budget - total)} sin gastar del presupuesto. Si mandás aunque sea la mitad a una meta, en tres meses se nota.` };

  if (topShare > .45)
    return { mood:'alerta', title:'Todo va al mismo lado',
      line:`${topCategory} se lleva ${Math.round(topShare * 100)}% de ${monthName}. Cuando un rubro pesa tanto, es el único lugar donde recortar sirve de verdad.` };

  return { mood:'feliz', title:'Todo en orden',
    line:`${monthName} viene prolijo: ${money(total)} hasta ahora. Segui cargando que así los números sirven.` };
}

function money(n) {
  return '$' + Math.round(Math.abs(n || 0)).toLocaleString('es-AR');
}
