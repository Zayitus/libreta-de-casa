/* ============================================================
   app.js — todo lo que se ve y se toca.
   Los datos salen de store.js; acá sólo se dibujan y se piden.
   ============================================================ */

import * as S from './store.js';
import { cachito, bocadillo } from './cachito.js';
import { CATS, catC, catI, LUGARES, categorizar, IC, svg } from './categorias.js';

/* La flechita circular: lo que distingue a un fijo de un gasto suelto. */
IC.repite = '<path d="M20 11a8 8 0 0 0-14.3-4.9M4 13a8 8 0 0 0 14.3 4.9"/>' +
            '<path d="M20 4.5V11h-6.5M4 19.5V13h6.5"/>';

/* Grupos que se le ofrecen a un gasto fijo. */
const duenios = () => [{ id:'comun', nom:'De los dos / de la casa' }]
  .concat(S.state.members.map(m => ({ id:m, nom:'De ' + m })))
  .concat([{ id:'Casa de mamá', nom:'Casa de mamá' }]
    .filter(x => !S.state.members.includes(x.id)));

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ------------------------------ formato ------------------------------ */
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
               'agosto','septiembre','octubre','noviembre','diciembre'];
const MES3 = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const fmt = n => '$' + Math.round(n).toLocaleString('es-AR');
function fmtU(n){
  const r = Math.round(n * 100) / 100;
  return 'US$' + r.toLocaleString('es-AR',
    { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
}
function fmtK(n){
  n = Math.round(n);
  if (Math.abs(n) >= 1e6) return '$' + (n/1e6).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + 'M';
  if (Math.abs(n) >= 1e4) return '$' + Math.round(n/1e3) + 'k';
  return '$' + n.toLocaleString('es-AR');
}
/* "12.500" y "12500,50" son el mismo número para cualquiera de esta casa */
function num(t){
  t = String(t == null ? '' : t).replace(/[^\d.,-]/g, '').trim();
  if (!t) return 0;
  const coma = t.lastIndexOf(','), punto = t.lastIndexOf('.');
  if (coma > -1 && coma > punto) t = t.replace(/\./g, '').replace(',', '.');
  else if (punto > -1 && coma > -1) t = t.replace(/,/g, '');
  else if (punto > -1 && /\.\d{3}\b/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  else t = t.replace(/,/g, '.');
  const n = parseFloat(t);
  return isFinite(n) ? n : 0;
}

/* Los colores los elige cada teléfono. No van a la base a propósito:
   es una preferencia de quien mira, no un dato del hogar. */
const TEMAS = {
  noche: { nom:'Noche',  desc:'azul oscuro',  claro:false },
  lila:  { nom:'Lila',   desc:'claro',        claro:true  }
};
const TEMA_KEY = 'libreta.tema';
function temaActual(){
  try { return TEMAS[localStorage.getItem(TEMA_KEY)] ? localStorage.getItem(TEMA_KEY) : 'noche'; }
  catch { return 'noche'; }
}
function ponerTema(t){
  if (!TEMAS[t]) t = 'noche';
  document.documentElement.dataset.tema = t;
  try { localStorage.setItem(TEMA_KEY, t); } catch {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = tok('--bg');
}
/* Lee un color del tema vigente, para los gráficos que se dibujan en SVG. */
function tok(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

const hoy = () => new Date();
const mesDe = d => d.toISOString().slice(0, 7);
function toast(m){
  const t = $('#toast'); t.textContent = m; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ------------------------------ estado de pantalla ------------------------------ */
let vista = 'inicio';
let mes = mesDe(hoy());          // 'YYYY-MM'
let quien = '';                  // quién está cargando
let donutSel = null;

const rate    = () => +S.state.settings.usd_rate || 1;
const ingreso = () => +S.state.settings.income || 0;
const cierre  = () => +S.state.settings.card_close_day || 0;
const ars = (m, cur) => cur === 'USD' ? m * rate() : +m;

/* ------------------------------ cálculos ------------------------------ */
function fijosDe(m){
  return S.state.fixed.filter(f =>
    (!f.active_from || f.active_from <= m) && (!f.active_to || f.active_to >= m));
}
/* Fijos y cuotas comparten tabla: una compra en cuotas es un "fijo con
   fecha de fin". fijosDe() trae los dos (los totales cuentan todo lo
   comprometido); las listas separan con soloFijos() y cuotasDe(). */
const soloFijos = m => fijosDe(m).filter(f => f.kind !== 'cuota');
const cuotasDe  = m => fijosDe(m).filter(f => f.kind === 'cuota');
const mesMas    = (m, n) => mesAnterior(m, -n);
/* Qué número de cuota cae en el mes m (1 = la primera). */
function nroCuota(f, m){
  const [y1, m1] = f.active_from.split('-').map(Number);
  const [y2, m2] = m.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}
/* "marzo", o "marzo 2027" si no es de este año. */
function nomMes(m){
  const n = MESES[+m.slice(5, 7) - 1];
  return m.slice(0, 4) === mesDe(hoy()).slice(0, 4) ? n : n + ' ' + m.slice(0, 4);
}
function gastosDe(m){
  return S.state.expenses
    .filter(e => String(e.spent_on).slice(0, 7) === m)
    .sort((a, b) => String(b.spent_on).localeCompare(String(a.spent_on)) ||
                    String(b.created_at || '').localeCompare(String(a.created_at || '')));
}
function totales(m){
  const o = { fijoArs:0, fijoUsd:0, cuotaArs:0, varArs:0, varUsd:0, porCat:{}, porQuien:{} };
  for (const f of fijosDe(m)){
    const a = ars(f.amount, f.currency);
    o.fijoArs += a;
    if (f.kind === 'cuota') o.cuotaArs += a;
    if (f.currency === 'USD') o.fijoUsd += +f.amount;
    o.porCat[f.category] = (o.porCat[f.category] || 0) + a;
  }
  for (const e of gastosDe(m)){
    const a = ars(e.amount, e.currency);
    o.varArs += a;
    if (e.currency === 'USD') o.varUsd += +e.amount;
    o.porCat[e.category] = (o.porCat[e.category] || 0) + a;
    const q = e.member_name || '—';
    o.porQuien[q] = (o.porQuien[q] || 0) + a;
  }
  o.total = o.fijoArs + o.varArs;
  o.usd = o.fijoUsd + o.varUsd;
  return o;
}
function mesAnterior(m, n = 1){
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(y, mm - 1 - n, 1);
  return mesDe(d);
}
/* Grupos de gastos fijos: primero los comunes, después cada persona. */
function grupos(){
  const vistos = [...new Set(S.state.fixed.map(f => f.owner || 'comun'))];
  const gente = new Set(S.state.members);
  const rank = o => (gente.has(o) ? 0 : /\s/.test(o) ? 2 : 1);
  const resto = vistos.filter(o => o !== 'comun')
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'es'));
  const colores = ['var(--acc)', 'var(--lila)', 'var(--good-ink)', 'var(--c-pan)'];
  return [{ id:'comun', nom:'Comunes', color:'var(--muted)' }]
    .concat(resto.map((o, i) => ({
      id: o,
      nom: /\s/.test(o) ? o : 'De ' + o,
      color: o === 'Casa de mamá' ? 'var(--gold)' : colores[i % colores.length]
    })));
}

/* ====================================================================
   ENTRADA
   ==================================================================== */
let modo = 'join';
function pintarGate(){
  $('#gateAvatar').innerHTML = cachito('feliz', 76);
  $$('#gateSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === modo)));
  $('#gHouseWrap').hidden = modo !== 'new';
  $('#gGo').textContent = modo === 'new' ? 'Crear el hogar' : 'Entrar';
  $('#gCodeHint').textContent = modo === 'new'
    ? 'Inventá uno y pasáselo a quien quieras que entre. Se guarda encriptado.'
    : 'Pedíselo a quien creó la libreta. Se escribe una sola vez.';
}
$('#gateSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-mode]'); if (!b) return;
  modo = b.dataset.mode; $('#gErr').hidden = true; pintarGate();
});
$('#gGo').addEventListener('click', async () => {
  const code = $('#gCode').value.trim();
  const name = $('#gName').value.trim();
  const casa = $('#gHouse').value.trim();
  const err = m => { const e = $('#gErr'); e.textContent = m; e.hidden = false; };
  $('#gErr').hidden = true;
  if (code.length < 4) return err('El código tiene que tener al menos 4 caracteres.');
  if (!name) return err('Poné tu nombre, así se sabe quién carga cada gasto.');
  if (modo === 'new' && !casa) return err('Ponele un nombre al hogar.');

  const btn = $('#gGo'); btn.disabled = true; btn.textContent = 'Un segundo…';
  try {
    if (modo === 'new') await S.createHouse(casa, code, name);
    else await S.joinHouse(code, name);
    entrar();
  } catch (e) {
    const m = String(e.message || e);
    if (/no existe|ningún hogar/i.test(m) && modo === 'join') {
      err('Ese código no existe. Fijate mayúsculas y espacios — o creá el hogar con "Crear uno nuevo".');
    } else err(m);
    btn.disabled = false; pintarGate();
  }
});

/* ====================================================================
   RENDER
   ==================================================================== */
function entrar(){
  $('#gate').hidden = true;
  $('#app').hidden = false;
  $('#tabs').hidden = false;
  quien = quien || S.state.memberName;
  render();
}

function render(){
  if (!S.state.householdId) return;
  const t = totales(mes);

  $('#mark').innerHTML = cachito('feliz', 36);
  $('#hiName').textContent = quien || S.state.memberName || '—';
  $('#btnSet').innerHTML = svg(IC.tuerca);
  $('#mLab').textContent = MESES[+mes.slice(5, 7) - 1];
  $('#nextM').disabled = mes >= mesDe(hoy());

  pintarQuien();
  pintarEstado();
  heroBox(t);
  quickBox();
  listas(t);
  dolares(t);
  fijosBox();
  cuotasBox();
  metasBox(t);
  numerosBox(t);
  pintarTabs();
}

function pintarQuien(){
  const gente = S.state.members.length ? S.state.members : [S.state.memberName].filter(Boolean);
  if (!quien || !gente.includes(quien)) quien = S.state.memberName || gente[0] || '';
  $('#who').innerHTML = gente.map((g, i) =>
    `<button data-q="${esc(g)}" class="${i ? 'r' : 'g'}" aria-pressed="${g === quien}" ` +
    `title="Cargar como ${esc(g)}">${esc(g.slice(0, 1).toUpperCase())}</button>`).join('');
  const m = $('#padMeta');
  if (m && !$('#scrim').hidden) pintarPad();
}

function pintarEstado(){
  const e = $('#estado'), txt = $('#estadoTxt');
  if (!S.state.online){ e.className = 'state off'; txt.textContent = 'sin señal — se guarda igual'; }
  else if (S.state.problema){ e.className = 'state off'; txt.textContent = S.state.problema.toLowerCase(); }
  else if (S.state.queue){ e.className = 'state cola'; txt.textContent = `subiendo ${S.state.queue}…`; }
  else { e.className = 'state'; txt.textContent = S.state.householdName || 'al día'; }
}

/* ------------------------------- inicio ------------------------------- */
function heroBox(t){
  $('#heroTotal').textContent = fmt(t.total);

  const prev = totales(mesAnterior(mes));
  const d = $('#heroDelta');
  if (prev.total > 0 && t.varArs + t.fijoArs > 0){
    const dif = (t.total - prev.total) / prev.total * 100;
    d.hidden = false;
    d.className = 'chip ' + (dif <= 0 ? 'good' : 'bad');
    d.innerHTML = svg(dif <= 0 ? IC.baja : IC.sube) +
      Math.abs(dif).toFixed(1).replace('.', ',') + ' % vs ' + MES3[+mesAnterior(mes).slice(5,7) - 1] + '.';
  } else d.hidden = true;

  $('#heroSub').textContent = t.fijoArs
    ? fmt(t.fijoArs) + ' ya estaban comprometidos antes de arrancar el mes'
    : 'Todavía no hay gastos fijos cargados.';

  const base = ingreso() || t.total || 1;
  const pF = Math.min(t.fijoArs / base, 1), pV = Math.min(t.varArs / base, 1 - pF);
  $('#heroBar').innerHTML =
    `<i style="width:${(pF*100).toFixed(1)}%;background:var(--acc)"></i>` +
    `<i style="width:2px;background:var(--card)"></i>` +
    `<i style="width:${(pV*100).toFixed(1)}%;background:var(--gold)"></i>`;
  $('#heroLeft').innerHTML =
    '<i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--acc);margin-right:5px"></i>fijos' +
    '<i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--gold);margin:0 5px 0 12px"></i>variables';
  $('#heroBudget').textContent = ingreso() ? 'de ' + fmt(ingreso()) + ' que entran' : '';

  $('#sFijos').textContent = fmtK(t.fijoArs);
  $('#sFijosLab').textContent = t.cuotaArs ? 'Fijos y cuotas' : 'Fijos';
  $('#sVar').textContent   = fmtK(t.varArs);
  $('#sQueda').textContent = ingreso() ? fmtK(ingreso() - t.total) : '—';
}

/* Botón "Fijos" en la grilla de Inicio: abre directo la hoja de nuevo
   gasto fijo, sin tener que ir a la pestaña Mes. Usa data-nuevofijo (no
   data-lugar ni data-fijo) para no mezclarse con los otros manejadores. */
function botonFijos(){
  const fx = soloFijos(mes);
  const suma = fx.reduce((s, f) => s + ars(f.amount, f.currency), 0);
  const sub = fx.length ? `${fx.length} · ${fmtK(suma)} por mes` : 'sin cargar';
  return `<button class="qt fijo" data-nuevofijo="1" aria-label="Agregar un gasto fijo">` +
    `<span class="ic">${svg(IC.repite)}</span>` +
    `<strong>Fijos</strong><span>${sub}</span></button>`;
}

/* Botón "Cuotas": abre la hoja de compra en cuotas. Abajo muestra lo que
   cae este mes en cuotas, así se ve de un vistazo. */
function botonCuotas(){
  const cq = cuotasDe(mes);
  const suma = cq.reduce((s, f) => s + ars(f.amount, f.currency), 0);
  const sub = cq.length ? `${fmtK(suma)} este mes` : 'sin cuotas';
  return `<button class="qt cuota" data-nuevacuota="1" aria-label="Agregar una compra en cuotas">` +
    `<span class="ic">${svg(IC.cal)}</span>` +
    `<strong>Cuotas</strong><span>${sub}</span></button>`;
}

function quickBox(){
  const delMes = gastosDe(mes);
  $('#quick').innerHTML = LUGARES.map(l => {
    const suma = delMes.filter(e => e.place === l.nom)
                       .reduce((s, e) => s + ars(e.amount, e.currency), 0);
    return `<button class="qt" data-lugar="${l.id}">` +
      `<span class="ic" style="background:${catC(l.cat)}">${svg(IC[l.ic])}</span>` +
      `<strong>${esc(l.nom)}</strong>` +
      `<span>${suma ? fmtK(suma) + ' este mes' : 'sin cargar'}</span></button>`;
  }).join('') +
  botonFijos() + botonCuotas() +
  `<button class="qt otro" data-lugar="otro">` +
    `<span class="ic">${svg(IC.mas)}</span><strong>Otro</strong><span>escribís dónde</span></button>`;
}

function movRow(e){
  const cuando = String(e.spent_on).slice(8, 10) + ' ' + MES3[+String(e.spent_on).slice(5, 7) - 1];
  const quienEs = e.member_name || '';
  const detalle = [e.category, quienEs, e.note].filter(Boolean).join(' · ');
  return `<div class="it${e.pending ? ' pend' : ''}">` +
    `<span class="ic" style="background:${catC(e.category)}">${svg(IC[catI(e.category)])}</span>` +
    `<span class="nm"><strong>${esc(e.place || e.note || e.category)}</strong>` +
    `<em>${esc(detalle)}</em></span>` +
    `<span class="amt">${fmt(ars(e.amount, e.currency))}` +
      `<small>${e.pending ? '<span class="pendtag">subiendo</span>' : cuando}</small></span>` +
    `<button class="del" data-del="${esc(e.id)}" aria-label="Borrar">✕</button></div>`;
}

function listas(t){
  const movs = gastosDe(mes);
  const vacio = `<p class="empty"><b>Todavía no cargaste nada este mes</b>` +
    `Tocá un lugar de arriba, o el <b style="display:inline">+</b> de abajo.</p>`;
  $('#lastList').innerHTML = movs.length ? movs.slice(0, 4).map(movRow).join('') : vacio;
  $('#mvList').innerHTML   = movs.length ? movs.map(movRow).join('') : vacio;
  $('#mvCount').textContent = movs.length ? fmt(t.varArs) + ' en ' + movs.length : '';
}

/* -------------------------------- dólares -------------------------------- */
function dolares(t){
  const items = fijosDe(mes).filter(f => f.currency === 'USD')
    .map(f => ({ nom:f.name, monto:+f.amount }))
    .concat(gastosDe(mes).filter(e => e.currency === 'USD')
      .map(e => ({ nom:e.place || e.note || e.category, monto:+e.amount })));

  $('#usdCard').hidden = !items.length;
  if (!items.length) return;

  $('#usdTotal').textContent = fmtU(t.usd);

  const pill = $('#usdPill');
  if (cierre()){
    const hoyD = hoy();
    let corte = new Date(hoyD.getFullYear(), hoyD.getMonth(), cierre());
    if (corte < hoyD) corte = new Date(hoyD.getFullYear(), hoyD.getMonth() + 1, cierre());
    const faltan = Math.ceil((corte - hoyD) / 86400000);
    pill.hidden = false;
    pill.className = 'chip ' + (faltan <= 5 ? 'warn' : 'usd');
    pill.innerHTML = svg(IC.cal) + (faltan > 1 ? `cierra en ${faltan} días`
      : faltan === 1 ? 'cierra mañana' : 'cierra hoy');
  } else pill.hidden = true;

  $('#usdSub').innerHTML = 'Poniendo los dólares te sale <b>' + fmt(t.usd * rate()) +
    '</b> a $' + rate().toLocaleString('es-AR') +
    '. Por tarjeta en pesos pagás los impuestos encima.' +
    (cierre() ? ' La tarjeta cierra el día ' + cierre() + '.' : '');

  $('#usdList').innerHTML = items.map(i =>
    `<div class="grp"><div class="it" style="padding-left:0"><span>${esc(i.nom)}</span>` +
    `<b>${fmtU(i.monto)} <u>${fmt(i.monto * rate())}</u></b></div></div>`).join('');
}

/* ------------------------------ gastos fijos ------------------------------ */
function fijosBox(){
  const fx = soloFijos(mes);
  if (!fx.length){
    $('#fxGroups').innerHTML = `<p class="empty"><b>No hay gastos fijos cargados</b>` +
      `Tocá el botón de abajo y cargá el primero: el colegio, la luz, el gas, los seguros.</p>`;
    $('#fxCount').textContent = '';
    $('#btnNuevoFijo').innerHTML = '<span class="ic">' + svg(IC.repite) + '</span>Agregar un gasto fijo';
    return;
  }
  let total = 0;
  $('#fxGroups').innerHTML = grupos().map(g => {
    const items = fx.filter(f => (f.owner || 'comun') === g.id);
    const sum = items.reduce((s, f) => s + ars(f.amount, f.currency), 0);
    total += sum;
    if (!items.length) return '';
    return `<div class="grp"><div class="h"><i style="background:${g.color}"></i>` +
      `<strong>${esc(g.nom)}</strong><b>${fmt(sum)}</b></div>` +
      items.sort((a, b) => ars(b.amount, b.currency) - ars(a.amount, a.currency)).map(f =>
        `<div class="it" data-fijo="${esc(f.id)}"><span>${esc(f.name)}</span><b>${fmt(ars(f.amount, f.currency))}` +
        (f.currency === 'USD' ? ` <u>${fmtU(f.amount)}</u>` : '') + '</b></div>').join('') +
      '</div>';
  }).join('') + `<div class="tot"><span>Total fijos</span><b>${fmt(total)}</b></div>`;
  $('#fxCount').textContent = fx.length + ' conceptos';
  $('#btnNuevoFijo').innerHTML = '<span class="ic">' + svg(IC.repite) + '</span>Agregar un gasto fijo';
}

/* -------------------------------- cuotas -------------------------------- */
function cuotasBox(){
  const lista = cuotasDe(mes).sort((a, b) => a.active_to.localeCompare(b.active_to));
  $('#cqCount').textContent = lista.length ? lista.length + (lista.length === 1 ? ' compra' : ' compras') : '';
  if (!lista.length){
    $('#cqList').innerHTML = `<p class="empty"><b>No hay cuotas este mes</b>` +
      `Cargá la compra una sola vez y cada cuota cae sola en su mes.</p>`;
  } else {
    const total = lista.reduce((s, f) => s + ars(f.amount, f.currency), 0);
    $('#cqList').innerHTML = '<div class="grp">' + lista.map(f => {
      const k = nroCuota(f, mes), n = +f.cuotas;
      const cola = k === n ? 'la última' : 'termina en ' + nomMes(f.active_to);
      return `<div class="it" data-cuota="${esc(f.id)}"><span>${esc(f.name)}` +
        `<small class="cqk">cuota ${k} de ${n} · ${cola}</small></span>` +
        `<b>${fmt(ars(f.amount, f.currency))}</b></div>`;
    }).join('') + `</div><div class="tot"><span>Cuotas de ${MESES[+mes.slice(5, 7) - 1]}</span><b>${fmt(total)}</b></div>`;
  }

  /* Lo comprometido desde este mes en adelante: cuándo se liberan las cuotas. */
  const base = mesDe(hoy());
  const prox = Array.from({ length: 6 }, (_, k) => {
    const m = mesMas(base, k);
    return { m, v: cuotasDe(m).reduce((s, f) => s + ars(f.amount, f.currency), 0) };
  });
  const max = Math.max(...prox.map(p => p.v));
  $('#cqNext').innerHTML = !max ? '' :
    `<p class="cqh">Ya comprometido en cuotas</p>` + prox.map((p, i) =>
      `<div class="cqrow"><span>${i ? MES3[+p.m.slice(5, 7) - 1] : 'este mes'}</span>` +
      `<span class="bar"><i style="width:${Math.round(p.v / max * 100)}%"></i></span>` +
      `<b>${p.v ? fmtK(p.v) : '—'}</b></div>`).join('');
  $('#btnNuevaCuota').innerHTML = '<span class="ic">' + svg(IC.cal) + '</span>Agregar una compra en cuotas';
}

/* Hoja de compra en cuotas. Se guarda en la tabla de fijos con kind='cuota',
   desde el mes de la primera cuota (active_from) hasta el de la última
   (active_to). Así los totales de cada mes ya la cuentan sin código extra. */
const cuo = { id:null, val:'', n:6, start:null };

/* Si ya pasó el cierre de la tarjeta, la compra entra en el resumen que viene. */
function inicioSugerido(){
  const h = hoy(), este = mesDe(h);
  return (cierre() && h.getDate() > cierre()) ? mesMas(este, 1) : este;
}

function abrirCuota(id){
  const f = id ? S.state.fixed.find(x => x.id === id) : null;
  cuo.id = f ? f.id : null;
  cuo.n = f ? +f.cuotas : 6;
  const total = f ? (f.total != null ? +f.total : +f.amount * cuo.n) : 0;
  cuo.val = f ? String(Math.round(total)) : '';
  cuo.start = f ? f.active_from : inicioSugerido();
  $('#cqTitle').textContent = f ? 'Corregir compra en cuotas' : 'Compra en cuotas';
  $('#cqName').value = f ? f.name : '';
  $('#cqOwner').innerHTML = duenios().map(d =>
    `<option value="${esc(d.id)}"${(f && (f.owner || 'comun') === d.id) ? ' selected' : ''}>${esc(d.nom)}</option>`).join('');
  const este = mesDe(hoy());
  const ops = [...new Set([cuo.start, este, mesMas(este, 1)])].sort();
  $('#cqStart').innerHTML = ops.map(m =>
    `<option value="${m}"${m === cuo.start ? ' selected' : ''}>Primera cuota en ${nomMes(m)}</option>`).join('');
  $('#cqDel').hidden = !f;
  pintarCuota();
  $('#cqScrim').hidden = false;
  if (!f) setTimeout(() => $('#cqName').focus(), 120);
}

function pintarCuota(){
  const total = +cuo.val || 0;
  const v = $('#cqVal');
  v.textContent = cuo.val ? total.toLocaleString('es-AR') : '0';
  v.classList.toggle('zero', !cuo.val);
  $$('#cqN button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.n === cuo.n)));
  const fin = mesMas(cuo.start, cuo.n - 1);
  $('#cqResumen').innerHTML = svg(IC.cal) +
    (total ? `${cuo.n} cuotas de ${fmt(total / cuo.n)}` : `${cuo.n} cuotas`) +
    ` · de ${nomMes(cuo.start)} a ${nomMes(fin)}`;
}

$('#btnNuevaCuota').onclick = () => abrirCuota(null);
$('#cqKeys').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  const k = b.dataset.k;
  if (k === 'del') cuo.val = cuo.val.slice(0, -1);
  else if (cuo.val.length < 10) cuo.val = (cuo.val === '0' ? '' : cuo.val) + k;
  pintarCuota();
});
$('#cqN').addEventListener('click', e => {
  const b = e.target.closest('button[data-n]'); if (!b) return;
  cuo.n = +b.dataset.n; pintarCuota();
});
$('#cqStart').addEventListener('change', e => { cuo.start = e.target.value; pintarCuota(); });
$('#cqX').onclick = () => { $('#cqScrim').hidden = true; };
$('#cqScrim').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });

$('#cqSave').onclick = async () => {
  const name = $('#cqName').value.trim();
  const total = num(cuo.val);
  if (!name) return toast('¿Qué compraste?');
  if (!total) return toast('Poné el monto total de la compra');
  const row = { name, kind:'cuota', cuotas: cuo.n, total,
                amount: Math.round(total / cuo.n * 100) / 100, currency:'ARS',
                category: categorizar(name), owner: $('#cqOwner').value,
                active_from: cuo.start, active_to: mesMas(cuo.start, cuo.n - 1) };
  $('#cqScrim').hidden = true;
  if (cuo.id) { await S.updateFixed(cuo.id, row); toast(name + ' corregido'); }
  else { await S.addFixed({ ...row, due_day:10 });
         /* Si la primera cuota es de un mes que viene, la lista de este mes no
            la muestra todavía: conviene decirlo para que no parezca que no guardó. */
         const dsp = cuo.start > mesDe(hoy()) ? ' · arranca en ' + nomMes(cuo.start) : '';
         toast(`${name}: ${cuo.n} cuotas de ${fmt(row.amount)}${dsp}`); }
  render();
};
$('#cqDel').onclick = async () => {
  if (!cuo.id || !confirm('¿Borrar esta compra? Se borran todas sus cuotas, también las de meses pasados.')) return;
  $('#cqScrim').hidden = true;
  await S.delFixed(cuo.id);
  render();
};

/* --------------------------------- metas --------------------------------- */
function metasBox(t){
  const gs = S.state.goals;
  if (!gs.length){
    $('#cachitoMetas').innerHTML = bocadillo('ok', 'Todavía no hay ninguna meta',
      'Ahorrar sin un para qué no dura. Ponele nombre: el viaje, la moto, el colchón para diciembre. ' +
      'Yo te digo cuánto falta y cuándo llegás.');
    $('#goals').innerHTML = '';
    return;
  }
  const juntado = g => S.state.contributions
    .filter(c => c.goal_id === g.id)
    .reduce((s, c) => s + (+c.amount || 0), 0);

  const cerca = gs.map(g => ({ g, falta: +g.target_amount - juntado(g) }))
                  .filter(x => x.falta > 0).sort((a, b) => a.falta - b.falta)[0];
  const sobra = ingreso() ? ingreso() - t.total : 0;
  $('#cachitoMetas').innerHTML = cerca
    ? bocadillo('feliz', 'Lo más cerca: ' + cerca.g.name,
        `Faltan ${cerca.g.currency === 'USD' ? fmtU(cerca.falta) : fmt(cerca.falta)}.` +
        (+cerca.g.monthly_plan > 0
          ? ` Poniendo ${cerca.g.currency === 'USD' ? fmtU(cerca.g.monthly_plan) : fmt(cerca.g.monthly_plan)} por mes llegás en ${Math.ceil(cerca.falta / +cerca.g.monthly_plan)} meses.`
          : ' Decime cuánto podés poner por mes y te digo cuándo llegás.') +
        (sobra > 0 ? ` Este mes te sobraron ${fmtK(sobra)}.` : ''))
    : bocadillo('festejo', '¡Están todas cumplidas!', 'Buen momento para ponerse una nueva.');

  $('#goals').innerHTML = gs.map(g => {
    const j = juntado(g), obj = +g.target_amount, pct = obj ? Math.min(j / obj, 1) : 0;
    const falta = Math.max(obj - j, 0), f = g.currency === 'USD' ? fmtU : fmt;
    const plan = +g.monthly_plan || 0;
    const meses = plan > 0 && falta > 0 ? Math.ceil(falta / plan) : null;
    return `<div class="card goal"><header style="align-items:flex-start">` +
      `<span class="em">${esc(g.emoji || '🎯')}</span>` +
      `<div style="flex:1;margin-left:11px"><h3>${esc(g.name)}</h3>` +
      `<p class="sub">${Math.round(pct*100)} % juntado</p></div>` +
      (falta > 0 ? `<span class="chip warn">faltan ${f(falta)}</span>`
                 : `<span class="chip good">cumplida</span>`) + `</header>` +
      `<div class="bar"><i style="width:${(pct*100).toFixed(1)}%;background:var(--gold)"></i></div>` +
      `<div class="figs"><span>Juntado <b>${f(j)}</b></span><span>de ${f(obj)}</span></div>` +
      (meses ? `<div class="eta">Poniendo ${f(plan)} por mes llegás en <b>${meses} meses</b>.</div>` : '') +
      `<div style="display:flex;gap:8px;margin-top:11px">` +
        `<button class="btn ghost" data-aportar="${esc(g.id)}">Poner plata</button>` +
        `<button class="btn danger" data-borrarmeta="${esc(g.id)}" style="flex:0 0 42px">✕</button>` +
      `</div></div>`;
  }).join('');
}

/* -------------------------------- números -------------------------------- */
function numerosBox(t){
  if (!t.total){
    $('#cachitoNum').innerHTML = bocadillo('dormido', 'Todavía no hay nada que mirar',
      'Cargá unos gastos y te armo los gráficos. Con un par de semanas ya se ve el patrón.');
    $('#donut').innerHTML = ''; $('#bars').innerHTML = ''; $('#revisa').innerHTML = '';
    $('#catCount').textContent = '';
    return;
  }
  const pctFijo  = Math.round(t.fijoArs / t.total * 100);
  const quienes  = t.cuotaArs ? 'Los fijos y las cuotas' : 'Los fijos';
  const pctEntra = ingreso() ? Math.round(t.fijoArs / ingreso() * 100) : 0;
  $('#cachitoNum').innerHTML = pctEntra
    ? bocadillo(pctEntra > 60 ? 'alerta' : 'ok', quienes + ' mandan',
        `De cada $100 que entran, $${pctEntra} ya están comprometidos antes del día 1. ` +
        `Y son el ${pctFijo} % de todo lo que gastás: ahí hay que meter mano, no en el kiosco.`)
    : bocadillo('ok', quienes + ' se llevan el ' + pctFijo + ' %',
        'Decime cuánto entra por mes en Ajustes y te digo si eso es mucho o está bien.');
  donut(t);
  barras(t);
  revisa(t);
}

function donut(t){
  const cats = Object.keys(t.porCat).filter(c => t.porCat[c] > 0)
    .sort((a, b) => t.porCat[b] - t.porCat[a]);
  if (!cats.length){ $('#donut').innerHTML = ''; return; }
  const sum = cats.reduce((s, c) => s + t.porCat[c], 0);
  const top = cats.slice(0, 6), resto = cats.slice(6);
  const datos = top.map(c => ({ k:c, v:t.porCat[c], col:catC(c) }));
  if (resto.length) datos.push({ k:'Otras ' + resto.length,
    v: resto.reduce((s, c) => s + t.porCat[c], 0), col:'var(--c-otros)' });

  const R = 58, r = 37, cx = 62, cy = 62, gap = 0.016;
  let a = -Math.PI/2, paths = '';
  for (const d of datos){
    const a2 = a + d.v/sum * Math.PI*2;
    const s0 = a + gap/2, s1 = Math.max(s0 + .004, a2 - gap/2);
    const p = (rad, an) => [(cx + rad*Math.cos(an)).toFixed(2), (cy + rad*Math.sin(an)).toFixed(2)];
    const A = p(R,s0), B = p(R,s1), C = p(r,s1), D = p(r,s0), lg = (s1-s0) > Math.PI ? 1 : 0;
    const on = donutSel === null || donutSel === d.k;
    paths += `<path d="M${A[0]} ${A[1]}A${R} ${R} 0 ${lg} 1 ${B[0]} ${B[1]}` +
      `L${C[0]} ${C[1]}A${r} ${r} 0 ${lg} 0 ${D[0]} ${D[1]}Z" fill="${d.col}" ` +
      `opacity="${on ? 1 : .3}"><title>${esc(d.k)}: ${fmt(d.v)}</title></path>`;
    a = a2;
  }
  const foco = (donutSel && datos.find(d => d.k === donutSel)) || datos[0];
  $('#catCount').textContent = cats.length + ' categorías';
  $('#donut').innerHTML =
    `<svg viewBox="0 0 124 124" width="124" height="124" role="img" aria-label="Gasto del mes por categoría">${paths}` +
    `<text x="62" y="59" text-anchor="middle" font-family="Baloo 2, sans-serif" font-size="21" font-weight="800" fill="${tok('--ink')}">` +
      Math.round(foco.v/sum*100) + `%</text>` +
    `<text x="62" y="74" text-anchor="middle" font-family="Nunito Sans, sans-serif" font-size="9" fill="${tok('--muted')}">` +
      esc(foco.k.length > 14 ? foco.k.slice(0,13) + '…' : foco.k) + `</text></svg>` +
    `<div class="catlist">` + datos.map(d =>
      `<button class="catrow" data-cat="${esc(d.k)}" aria-pressed="${donutSel === d.k}">` +
      `<i style="background:${d.col}"></i><span>${esc(d.k)} <em>${Math.round(d.v/sum*100)} %</em></span>` +
      `<b>${fmtK(d.v)}</b></button>`).join('') + `</div>`;
}

function barras(t){
  const data = [];
  for (let i = 5; i >= 0; i--){
    const m = mesAnterior(mes, i);
    const o = i === 0 ? t : totales(m);
    data.push({ m: MES3[+m.slice(5,7) - 1], f:o.fijoArs, v:o.varArs });
  }
  const max = Math.max(...data.map(d => d.f + d.v), 1);
  const cF = tok('--acc'), cV = tok('--gold');
  const cInk = tok('--ink'), cInk2 = tok('--ink-2'), cMute = tok('--muted');
  const opVieja = tok('--op-pasado') || '.55';
  const W = 328, H = 172, pt = 20, pb = 22, bw = W/6, inner = 26;
  let g = '';
  data.forEach((d, i) => {
    const tt = d.f + d.v;
    const h = tt ? (H-pt-pb) * (tt/max) : 0;
    const x = bw*i + (bw-inner)/2, y = H-pb-h;
    const hf = tt ? h * (d.f/tt) : 0, hv = h - hf;
    const ult = i === data.length-1, op = ult ? '1' : opVieja;
    if (hv > 4)
      g += `<path d="M${x} ${(y+hv).toFixed(1)} v${(-(hv-4)).toFixed(1)} a4 4 0 0 1 4 -4 h${inner-8}` +
           ` a4 4 0 0 1 4 4 v${(hv-4).toFixed(1)} z" fill="${cV}" fill-opacity="${op}"/>`;
    if (hf > 0)
      g += `<rect x="${x}" y="${(y+hv+2).toFixed(1)}" width="${inner}" height="${Math.max(0,hf-2).toFixed(1)}"` +
           ` rx="3" fill="${cF}" fill-opacity="${op}"/>`;
    if (tt) g += `<text x="${x+inner/2}" y="${(y-6).toFixed(1)}" text-anchor="middle" font-size="10" ` +
      `font-family="Baloo 2, sans-serif" font-weight="700" fill="${ult ? cInk : cMute}">${fmtK(tt)}</text>`;
    g += `<text x="${x+inner/2}" y="${H-6}" text-anchor="middle" font-size="11" ` +
      `font-family="Nunito Sans, sans-serif" fill="${ult ? cInk2 : cMute}">${d.m}</text>`;
  });
  const enCurso = mes === mesDe(hoy());
  $('#bars').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" ` +
    `aria-label="Gasto fijo y variable de los últimos seis meses">${g}</svg>` +
    `<div class="leg"><span><i style="background:${cF}"></i>Fijos</span>` +
    `<span><i style="background:${cV}"></i>Variables</span>` +
    (enCurso ? `<span style="margin-left:auto;color:var(--muted);font-size:11.5px">` +
      `${MESES[hoy().getMonth()]} va por el día ${hoy().getDate()}</span>` : '') + `</div>`;
}

/* "Revisá esto" — sale de los datos, no de una lista escrita a mano. */
const SEGURO = /seguro|sancor|federaci|patronal|riesgo|caucion|caución/i;
const SUSCRI = /netflix|disney|hbo|max|prime|spotify|paramount|star|claude|chatgpt|cable|tv |flow|directv/i;
function revisa(t){
  const fx = soloFijos(mes);
  const val = f => ars(f.amount, f.currency);
  const items = [];

  const seguros = fx.filter(f => SEGURO.test(f.name)).sort((a, b) => val(b) - val(a));
  if (seguros.length >= 2){
    const suma = seguros.reduce((s, f) => s + val(f), 0);
    const caro = seguros[0], barato = seguros[seguros.length - 1];
    const veces = (val(caro) / Math.max(val(barato), 1)).toFixed(1).replace('.', ',');
    items.push(['alerta','warn', `Seguros: ${fmt(suma)} por mes`,
      `${seguros.map(f => esc(f.name) + ' ' + fmt(val(f))).join(', ')}. ` +
      `Entre el más caro y el más barato hay ${veces}x. Si las coberturas son parecidas, esa diferencia ` +
      `vale una llamada: tres cotizaciones por lo mismo suelen diferir entre 15 % y 30 %.`]);
  } else if (seguros.length === 1){
    items.push(['alerta','warn', `El seguro: ${fmt(val(seguros[0]))} por mes`,
      `${esc(seguros[0].name)}. Pedí tres cotizaciones por la misma cobertura una vez al año: ` +
      `suele haber entre 15 % y 30 % de diferencia.`]);
  }

  const subs = fx.filter(f => SUSCRI.test(f.name));
  if (subs.length >= 2){
    const suma = subs.reduce((s, f) => s + val(f), 0);
    items.push(['alerta','warn', `${subs.length} suscripciones prendidas`,
      `${subs.map(f => esc(f.name)).join(', ')}. Juntas son ${fmt(suma)} por mes, ` +
      `${fmt(suma*12)} al año. ¿Se usan todas?`]);
  }

  /* Porcentajes sobre los fijos solos: las cuotas tienen su propia tarjeta. */
  const totFijos = fx.reduce((s, f) => s + val(f), 0);
  const porCat = {};
  for (const f of fx) porCat[f.category] = (porCat[f.category] || 0) + val(f);
  const mayor = Object.entries(porCat).sort((a, b) => b[1] - a[1])[0];
  if (mayor && totFijos){
    const pct = Math.round(mayor[1] / totFijos * 100);
    if (pct >= 30) items.push(['alerta','warn', `${mayor[0]} se lleva el ${pct} % de los fijos`,
      `${fmt(mayor[1])} por mes. Es la categoría más pesada de la casa: cualquier ahorro ahí ` +
      `pesa más que todo lo que puedas recortar en el kiosco.`]);
  }

  const ajenos = fx.filter(f => (f.owner || 'comun') !== 'comun' && /\s/.test(f.owner || ''));
  if (ajenos.length){
    const suma = ajenos.reduce((s, f) => s + val(f), 0);
    items.push(['ok','good', `${ajenos[0].owner}: ${fmt(suma)} aparte`,
      `Está bien que esté separado: son el ${Math.round(suma / totFijos * 100)} % de tus fijos ` +
      `y no son gastos de esta casa.`]);
  }

  const prev = totales(mesAnterior(mes));
  const saltos = Object.keys(t.porCat).map(c => ({
    c, ahora: t.porCat[c], antes: prev.porCat[c] || 0
  })).filter(x => x.antes > 0 && x.ahora > x.antes * 1.4 && x.ahora - x.antes > 20000);
  for (const s of saltos.slice(0, 1))
    items.push(['sube','warn', `${s.c} subió ${Math.round((s.ahora/s.antes - 1)*100)} %`,
      `Pasó de ${fmt(s.antes)} el mes pasado a ${fmt(s.ahora)} este. Puede ser normal, ` +
      `pero mejor mirarlo ahora que en tres meses.`]);

  $('#revisa').innerHTML = items.length ? items.map(r => {
    const col  = r[1] === 'good' ? 'var(--good-ink)' : 'var(--warn)';
    const wash = r[1] === 'good' ? 'var(--good-wash)' : 'var(--warn-wash)';
    return `<div class="rev"><span class="k" style="background:${wash};color:${col}">${svg(IC[r[0]])}</span>` +
      `<div><strong>${r[2]}</strong><p>${r[3]}</p></div></div>`;
  }).join('') : `<p class="empty">Cargá un par de meses y acá te voy a marcar lo que se puede bajar.</p>`;
}

/* ====================================================================
   HOJA DE CARGA
   El teclado tiene que verse sin scrollear: es lo que más se usa.
   Por eso, apenas elegís el lugar la grilla se pliega en un renglón,
   y el detalle y la foto viven detrás de dos botoncitos.
   ==================================================================== */
const pad = { lugar:null, val:'', mon:'ARS', foto:null, abierto:false, nota:false };

function abrirPad(id){
  pad.lugar = id === 'otro' ? null : (LUGARES.find(l => l.id === id) || null);
  pad.val = ''; pad.mon = 'ARS'; pad.foto = null;
  pad.abierto = !pad.lugar;          // sin lugar elegido, la grilla se muestra
  pad.nota = false;
  $('#padNote').value = ''; $('#padOtro').value = '';
  $('#padCur').textContent = 'ARS'; $('#padCur').dataset.c = 'ARS';
  $('#padShotPrev').hidden = true; $('#padShotPrev').innerHTML = '';
  $('#padShot').value = '';
  pintarPad();
  $('#scrim').hidden = false;
  if (!pad.lugar) setTimeout(() => $('#padOtro').focus(), 120);
}

function pintarPad(){
  /* lugar: grilla abierta, o el renglón con el elegido */
  $('#picks').hidden = !pad.abierto;
  $('#chosen').hidden = pad.abierto;
  if (pad.abierto){
    $('#picks').innerHTML = LUGARES.map(l =>
      `<button class="pick" data-pick="${l.id}" aria-pressed="${pad.lugar?.id === l.id}">` +
      `<span class="ic" style="background:${catC(l.cat)}">${svg(IC[l.ic])}</span>` +
      `<strong>${esc(l.nom)}</strong></button>`).join('') +
      `<button class="pick" data-pick="otro" aria-pressed="${!pad.lugar}">` +
      `<span class="ic" style="background:var(--card-2)">${svg(IC.mas)}</span>` +
      `<strong>Otro</strong></button>`;
  } else {
    $('#chosen').innerHTML = pad.lugar
      ? `<span class="ic" style="background:${catC(pad.lugar.cat)}">${svg(IC[pad.lugar.ic])}</span>` +
        `<strong>${esc(pad.lugar.nom)}</strong><span class="chg">cambiar</span>`
      : `<span class="ic" style="background:var(--card-2)">${svg(IC.mas)}</span>` +
        `<strong>Otro lugar</strong><span class="chg">cambiar</span>`;
  }
  $('#padOtroWrap').hidden = !!pad.lugar;

  /* fecha + quién, y los dos accesos */
  $('#padMeta').textContent = 'Hoy, ' + hoy().getDate() + ' de ' + MESES[hoy().getMonth()] +
    ' · como ' + (quien || '—');
  $('#padNoteBtn').innerHTML = svg(IC.lapiz);
  $('#padNoteBtn').setAttribute('aria-pressed', String(pad.nota));
  $('#padNoteWrap').hidden = !pad.nota;
  $('#padShotBtn').innerHTML = svg(IC.foto) +
    '<input id="padShot" type="file" accept="image/*" capture="environment">';
  $('#padShotBtn').classList.toggle('on', !!pad.foto);

  /* monto */
  const v = $('#padVal');
  v.textContent = pad.val ? (+pad.val).toLocaleString('es-AR') : '0';
  v.classList.toggle('zero', !pad.val);
  const c = $('#padConv');
  if (pad.mon === 'USD' && pad.val){
    c.hidden = false;
    c.innerHTML = '≈ ' + fmt(+pad.val * rate()) + ' a $' + rate().toLocaleString('es-AR');
  } else c.hidden = true;
}

$('#keys').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  const k = b.dataset.k;
  if (k === 'del') pad.val = pad.val.slice(0, -1);
  else if (pad.val.length < 10) pad.val = (pad.val === '0' ? '' : pad.val) + k;
  pintarPad();
});
$('#picks').addEventListener('click', e => {
  const b = e.target.closest('[data-pick]'); if (!b) return;
  pad.lugar = b.dataset.pick === 'otro' ? null : LUGARES.find(l => l.id === b.dataset.pick);
  pad.abierto = false;
  pintarPad();
  if (!pad.lugar) $('#padOtro').focus();
});
$('#chosen').onclick = () => { pad.abierto = true; pintarPad(); };
$('#chosen').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pad.abierto = true; pintarPad(); }
});
$('#padNoteBtn').onclick = () => {
  pad.nota = !pad.nota; pintarPad();
  if (pad.nota) $('#padNote').focus(); else $('#padNote').value = '';
};
$('#padCur').onclick = function(){
  pad.mon = pad.mon === 'ARS' ? 'USD' : 'ARS';
  this.textContent = pad.mon; this.dataset.c = pad.mon; pintarPad();
};
$('#padX').onclick = () => { $('#scrim').hidden = true; };
$('#scrim').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });

/* La foto se achica antes de subir: 1200px de lado y JPEG.
   Una foto de celular pesa 4 MB; así queda en 150 kB. */
async function achicar(file){
  const img = await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });
  const max = 1200, k = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  return new Promise(res => cv.toBlob(b => res(b || file), 'image/jpeg', .82));
}
/* el input se vuelve a dibujar en cada pintarPad, así que el listener va arriba */
document.addEventListener('change', async e => {
  if (e.target.id !== 'padShot') return;
  const f = e.target.files?.[0]; if (!f) return;
  try {
    pad.foto = await achicar(f);
    const url = URL.createObjectURL(pad.foto);
    $('#padShotPrev').innerHTML = `<img src="${url}" alt="Comprobante">`;
    $('#padShotPrev').hidden = false;
    $('#padShotBtn').classList.add('on');
  } catch { toast('No pude leer esa foto'); }
});

$('#padSave').onclick = async () => {
  const n = num(pad.val);
  if (!n) return toast('Poné un monto');
  const libre = $('#padOtro').value.trim();
  const lugar = pad.lugar ? pad.lugar.nom : libre;
  if (!lugar){ pad.abierto = true; pintarPad(); $('#padOtro').focus(); return toast('¿Dónde fue el gasto?'); }
  const nota = $('#padNote').value.trim();
  const row = {
    amount: n,
    currency: pad.mon,
    category: pad.lugar ? pad.lugar.cat : categorizar(libre + ' ' + nota),
    member_name: quien || S.state.memberName || '',
    note: nota,
    place: lugar,
    spent_on: new Date(Date.now() - hoy().getTimezoneOffset()*60000).toISOString().slice(0, 10)
  };
  $('#scrim').hidden = true;
  const foto = pad.foto; pad.foto = null;
  await S.addExpense(row, foto);
  toast((pad.mon === 'USD' ? fmtU(n) : fmt(n)) + ' en ' + lugar + ' · ' + row.category);
};

/* ====================================================================
   GASTO FIJO
   Tiene hoja propia y color propio: un fijo se carga una vez y vuelve
   todos los meses, así que no se mezcla con la carga del día a día.
   ==================================================================== */
const fijo = { id:null, val:'', mon:'ARS' };

function abrirFijo(id){
  const f = id ? S.state.fixed.find(x => x.id === id) : null;
  fijo.id = f ? f.id : null;
  fijo.val = f ? String(Math.round(+f.amount * 100) / 100) : '';
  fijo.mon = f ? f.currency : 'ARS';
  $('#fixTitle').textContent = f ? 'Corregir gasto fijo' : 'Nuevo gasto fijo';
  $('#fixName').value = f ? f.name : '';
  $('#fixRepite').innerHTML = svg(IC.repite) + 'se repite todos los meses';
  $('#fixOwner').innerHTML = duenios().map(d =>
    `<option value="${esc(d.id)}"${(f && (f.owner || 'comun') === d.id) ? ' selected' : ''}>${esc(d.nom)}</option>`).join('');
  $('#fixCur').textContent = fijo.mon; $('#fixCur').dataset.c = fijo.mon;
  $('#fixDel').hidden = !f;
  pintarFijo();
  $('#fixScrim').hidden = false;
  if (!f) setTimeout(() => $('#fixName').focus(), 120);
}

function pintarFijo(){
  const v = $('#fixVal');
  const n = +fijo.val || 0;
  v.textContent = fijo.val ? n.toLocaleString('es-AR') : '0';
  v.classList.toggle('zero', !fijo.val);
  const c = $('#fixConv');
  if (fijo.mon === 'USD' && n){
    c.hidden = false;
    c.innerHTML = '≈ ' + fmt(n * rate()) + ' a $' + rate().toLocaleString('es-AR');
  } else c.hidden = true;
  const nom = $('#fixName').value.trim();
  $('#fixCat').innerHTML = nom
    ? 'Va a quedar en <b>' + esc(categorizar(nom)) + '</b> — la categoría se asigna sola.'
    : 'La categoría se asigna sola por el nombre.';
}

$('#btnNuevoFijo').onclick = () => abrirFijo(null);
$('#fixKeys').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  const k = b.dataset.k;
  if (k === 'del') fijo.val = fijo.val.slice(0, -1);
  else if (fijo.val.length < 10) fijo.val = (fijo.val === '0' ? '' : fijo.val) + k;
  pintarFijo();
});
$('#fixName').addEventListener('input', pintarFijo);
$('#fixCur').onclick = function(){
  fijo.mon = fijo.mon === 'ARS' ? 'USD' : 'ARS';
  this.textContent = fijo.mon; this.dataset.c = fijo.mon; pintarFijo();
};
$('#fixX').onclick = () => { $('#fixScrim').hidden = true; };
$('#fixScrim').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });

$('#fixSave').onclick = async () => {
  const name = $('#fixName').value.trim();
  const amount = num(fijo.val);
  if (!name) return toast('¿Qué gasto es?');
  if (!amount) return toast('Poné el monto');
  const row = { name, amount, currency: fijo.mon,
                category: categorizar(name), owner: $('#fixOwner').value };
  $('#fixScrim').hidden = true;
  if (fijo.id) { await S.updateFixed(fijo.id, row); toast(name + ' corregido'); }
  else { await S.addFixed({ ...row, due_day:10, active_from: mesDe(hoy()) });
         toast(name + ' → ' + row.category); }
  render();
};
$('#fixDel').onclick = async () => {
  if (!fijo.id || !confirm('¿Borrar este gasto fijo? Deja de contar en todos los meses.')) return;
  $('#fixScrim').hidden = true;
  await S.delFixed(fijo.id);
  render();
};

/* ====================================================================
   AJUSTES
   ==================================================================== */
function abrirSet(){
  const s = S.state.settings;
  const fx = S.state.fixed;
  const gente = S.state.members;
  $('#setBody').innerHTML = `
    <div class="sect">
      <h3>Cómo se ve en este teléfono</h3>
      <div class="temas" id="temas">
        ${Object.entries(TEMAS).map(([id, t]) => `
          <button class="tema t-${id}" data-tema="${id}" aria-pressed="${temaActual() === id}">
            <span class="muestra"><i class="f"></i><i class="c"></i><i class="a"></i></span>
            <strong>${t.nom}</strong><span class="sub">${t.desc}</span>
          </button>`).join('')}
      </div>
      <p class="hint">Cada uno elige el suyo: no le cambia los colores a nadie más.</p>
    </div>

    <div class="sect">
      <h3>La plata que entra</h3>
      <div class="row2">
        <div class="fld"><label for="sIng">Por mes, entre todos</label>
          <input id="sIng" class="inp" type="text" inputmode="decimal" value="${s.income ? Math.round(s.income).toLocaleString('es-AR') : ''}" placeholder="0"></div>
        <div class="fld"><label for="sRate">Dólar de referencia</label>
          <input id="sRate" class="inp" type="text" inputmode="decimal" value="${s.usd_rate > 1 ? Math.round(s.usd_rate).toLocaleString('es-AR') : ''}" placeholder="1500"></div>
      </div>
      <div class="fld"><label for="sClose">Día que cierra la tarjeta</label>
        <input id="sClose" class="inp" type="number" min="1" max="31" value="${s.card_close_day || ''}" placeholder="1">
        <p class="hint">Para avisarte antes, y que los dólares los pagues en dólares.</p></div>
      <button class="btn" id="sSave">Guardar</button>
    </div>

    <div class="sect">
      <h3>Gastos fijos (${fx.length})</h3>
      <button class="btn fijo" id="nfAdd"><span class="ic"></span>Agregar un gasto fijo</button>
      <p class="hint">También está en "El mes", abajo de la lista. Tocá cualquiera de la lista para corregirlo.</p>
      <div style="margin-top:14px">
        ${fx.length ? fx.slice().sort((a,b) => ars(b.amount,b.currency) - ars(a.amount,a.currency)).map(f =>
          `<div class="mini"><span>${esc(f.name)} <span class="sub">· ${esc(f.category)}</span></span>` +
          `<span><b>${f.currency === 'USD' ? fmtU(f.amount) : fmt(f.amount)}</b>` +
          `<button class="x" data-delfixed="${esc(f.id)}" aria-label="Borrar">✕</button></span></div>`).join('')
        : '<p class="empty">Ninguno todavía.</p>'}
      </div>
    </div>

    <div class="sect">
      <h3>El hogar</h3>
      <div class="mini"><span>Nombre</span><b>${esc(S.state.householdName)}</b></div>
      <div class="mini"><span>Quiénes entraron</span><b>${gente.map(esc).join(', ') || '—'}</b></div>
      <div class="fld" style="margin-top:12px"><label for="sCode">Cambiar el código</label>
        <input id="sCode" class="inp" type="text" placeholder="Nuevo código, mínimo 4" autocapitalize="none">
        <p class="hint">El anterior deja de servir. Quien ya entró sigue adentro.</p></div>
      <button class="btn ghost" id="sCodeGo">Cambiar el código</button>
      <button class="btn danger" id="sOut" style="margin-top:10px">Salir de este hogar en este teléfono</button>
    </div>`;
  $('#setScrim').hidden = false;

  $('#temas').addEventListener('click', e => {
    const b = e.target.closest('[data-tema]'); if (!b) return;
    ponerTema(b.dataset.tema);
    abrirSet();                 // se redibuja con los colores nuevos
    render();
    toast('Tema ' + TEMAS[b.dataset.tema].nom.toLowerCase());
  });
  $('#sSave').onclick = async () => {
    await S.saveSettings({
      income: num($('#sIng').value),
      usd_rate: num($('#sRate').value) || 1,
      card_close_day: Math.min(31, Math.max(1, parseInt($('#sClose').value, 10) || 1))
    });
    $('#setScrim').hidden = true; toast('Guardado'); render();
  };
  $('#nfAdd').innerHTML = '<span class="ic">' + svg(IC.repite) + '</span>Agregar un gasto fijo';
  $('#nfAdd').onclick = () => { $('#setScrim').hidden = true; abrirFijo(null); };
  $('#sCodeGo').onclick = async () => {
    const c = $('#sCode').value.trim();
    if (c.length < 4) return toast('Mínimo 4 caracteres');
    try { await S.changeCode(c); toast('Código cambiado'); $('#sCode').value = ''; }
    catch (e){ toast(String(e.message || e)); }
  };
  $('#sOut').onclick = () => {
    if (confirm('¿Salir del hogar en este teléfono? Los datos quedan en la nube; volvés a entrar con el código.'))
      S.leaveHouse();
  };
  $('#setBody').addEventListener('click', async e => {
    const d = e.target.closest('[data-delfixed]'); if (!d) return;
    await S.delFixed(d.dataset.delfixed); abrirSet(); render();
  });
}
$('#btnSet').onclick = abrirSet;
$('#setX').onclick = () => { $('#setScrim').hidden = true; };
$('#setScrim').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });

/* ====================================================================
   NAVEGACIÓN
   ==================================================================== */
const TABS = [['inicio','Inicio','home'],['mes','El mes','cal'],['metas','Metas','meta'],['numeros','Números','stats']];
function pintarTabs(){
  Array.from($('#tabs').children).forEach(b => {
    if (b.id === 'fab'){ b.innerHTML = svg(IC.mas); return; }
    const t = TABS.find(x => x[0] === b.dataset.v);
    b.innerHTML = svg(IC[t[2]]) + t[1];
    b.setAttribute('aria-current', String(b.dataset.v === vista));
  });
}
function ir(v){
  vista = v;
  TABS.forEach(t => { $('#v-' + t[0]).hidden = t[0] !== v; });
  pintarTabs();
  window.scrollTo({ top:0, behavior:'smooth' });
}
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-v]'); if (b) ir(b.dataset.v);
});
$('#fab').onclick = () => abrirPad(pad.lugar ? pad.lugar.id : 'dasa');
$('#prevM').onclick = () => { mes = mesAnterior(mes); donutSel = null; render(); };
$('#nextM').onclick = () => {
  if (mes >= mesDe(hoy())) return;
  const [y, mm] = mes.split('-').map(Number);
  mes = mesDe(new Date(y, mm, 1)); donutSel = null; render();
};
$('#who').addEventListener('click', e => {
  const b = e.target.closest('button[data-q]'); if (!b) return;
  quien = b.dataset.q; render(); toast('Cargando como ' + quien);
});

document.addEventListener('click', async e => {
  const g = e.target.closest('[data-goto]');   if (g) ir(g.dataset.goto);
  const q = e.target.closest('[data-lugar]');  if (q) abrirPad(q.dataset.lugar);
  const nf = e.target.closest('[data-nuevofijo]'); if (nf) abrirFijo(null);
  const nc = e.target.closest('[data-nuevacuota]'); if (nc) abrirCuota(null);
  const cq = e.target.closest('[data-cuota]');      if (cq) abrirCuota(cq.dataset.cuota);
  const c = e.target.closest('[data-cat]');
  if (c){ donutSel = donutSel === c.dataset.cat ? null : c.dataset.cat; donut(totales(mes)); }

  const fj = e.target.closest('[data-fijo]');
  if (fj) abrirFijo(fj.dataset.fijo);

  const d = e.target.closest('[data-del]');
  if (d && confirm('¿Borrar este gasto?')) await S.delExpense(d.dataset.del);

  const ap = e.target.closest('[data-aportar]');
  if (ap){
    const g2 = S.state.goals.find(x => x.id === ap.dataset.aportar);
    const v = num(prompt(`¿Cuánto ponés en "${g2.name}"? (${g2.currency})`, ''));
    if (v > 0) await S.addContribution({ goal_id:g2.id, amount:v, currency:g2.currency,
                                         member_name:quien, note:'' });
  }
  const bm = e.target.closest('[data-borrarmeta]');
  if (bm && confirm('¿Borrar la meta y lo que llevás anotado?')) await S.delGoal(bm.dataset.borrarmeta);
});

$('#btnNuevaMeta').onclick = async () => {
  const name = prompt('¿Para qué querés ahorrar? Ej: Viaje a Portugal'); if (!name) return;
  const cur = confirm('¿La meta es en dólares?\nAceptar = USD · Cancelar = pesos') ? 'USD' : 'ARS';
  const target = num(prompt(`¿Cuánto necesitás juntar? (${cur})`, '')); if (!target) return;
  const plan = num(prompt(`¿Cuánto podés poner por mes? (${cur})`, '') || 0);
  await S.addGoal({ name, emoji:'🎯', target_amount:target, currency:cur, monthly_plan:plan });
  toast('Meta creada');
};

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  $('#scrim').hidden = true; $('#setScrim').hidden = true; $('#fixScrim').hidden = true; $('#cqScrim').hidden = true;
});

/* ====================================================================
   ARRANQUE
   ==================================================================== */
S.subscribe(() => { if (!$('#app').hidden) render(); else pintarEstado(); });

ponerTema(temaActual());

(async () => {
  pintarGate();
  pintarTabs();
  try {
    const dentro = await S.boot();
    if (dentro) entrar(); else $('#gate').hidden = false;
    if (dentro && S.state.problema)
      toast(S.state.problema + ' Estás viendo lo último guardado.');
  } catch (e){
    /* Sólo llega acá quien todavía no entró a ningún hogar: no hay nada
       guardado para mostrar, así que se explica y se ofrece reintentar. */
    $('#gate').hidden = false;
    const el = $('#gErr');
    el.innerHTML = esc(String(e.message || e)) +
      ' <button id="gRetry" style="text-decoration:underline;font-weight:800">Reintentar</button>';
    el.hidden = false;
    $('#gRetry').onclick = () => location.reload();
  }
})();

if ('serviceWorker' in navigator)
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
