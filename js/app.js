/* ============================================================
   app.js — pantalla y comportamiento.
   Lee del store, dibuja, y le manda las acciones de vuelta.
   ============================================================ */

import * as store from './store.js';
import { state } from './store.js';
import { cachitoSVG, cachitoSay } from './cachito.js';

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio',
                'julio','agosto','septiembre','octubre','noviembre','diciembre'];
const CC = ['--c1','--c2','--c3','--c4','--c5','--c6','--c7','--c8','--c9'];

let cur  = mk(new Date());   // mes que se está mirando
let view = 'mes';
let disp = localStorage.getItem('libreta.disp') || 'ARS';
let fCat = null, fWho = null, fCur = 'ARS', fPhoto = null;
let xCat = null, xCur = 'ARS';
let mCur = 'ARS', pCur = 'ARS', putGoal = null;

/* ---------------- utilidades ---------------- */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function mk(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
function shift(k, n){ const p = k.split('-'); return mk(new Date(+p[0], +p[1]-1+n, 1)); }
function mLabel(k){ return MONTHS[+k.split('-')[1]-1]; }
function dim(k){ const p = k.split('-'); return new Date(+p[0], +p[1], 0).getDate(); }
const rate = () => Math.max(+state.settings.usd_rate || 1, 0.0001);
function toARS(amount, currency){ return (+amount || 0) * (currency === 'USD' ? rate() : 1); }
function inDisp(ars){ return disp === 'USD' ? ars / rate() : ars; }
function fmt(ars){
  const v = Math.round(inDisp(ars));
  return (disp === 'USD' ? 'US$' : '$') + v.toLocaleString('es-AR');
}
function fmtK(ars){
  const v = Math.round(inDisp(ars)), s = disp === 'USD' ? 'US$' : '$';
  if (Math.abs(v) >= 1e6) return s + (v/1e6).toFixed(1).replace('.',',') + 'M';
  if (Math.abs(v) >= 1e4) return s + Math.round(v/1e3) + 'k';
  return s + v.toLocaleString('es-AR');
}
function num(v){
  if (typeof v === 'number') return v;
  let s = String(v || '').replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  const c = s.includes(','), d = s.includes('.');
  if (c && d) s = s.replace(/\./g,'').replace(',','.');
  else if (c) s = s.replace(',','.');
  else if (d){ const t = s.split('.'); if (t.length > 2 || t[t.length-1].length === 3) s = t.join(''); }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function catColor(name){
  const i = state.settings.categories.indexOf(name);
  const j = i >= 0 ? i : Math.abs(hash(name)) % CC.length;
  return 'var(' + CC[j % CC.length] + ')';
}
function hash(s){ let h = 0; for (const ch of String(s)) h = (h*31 + ch.charCodeAt(0))|0; return h; }
function toast(m){
  const t = $('#toast'); t.textContent = m; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2800);
}
function today(){ return new Date().toISOString().slice(0,10); }

/* ---------------- cálculos del mes ---------------- */
function fixedFor(k){
  return state.fixed.filter(f => (!f.active_from || f.active_from <= k) && (!f.active_to || f.active_to >= k));
}
function expensesFor(k){
  return state.expenses.filter(e => String(e.spent_on || '').slice(0,7) === k);
}
function totals(k){
  const o = { fixed:0, variable:0, total:0, byCat:{}, byWho:{}, count:0 };
  fixedFor(k).forEach(f => {
    const a = toARS(f.amount, f.currency);
    o.fixed += a; o.byCat[f.category] = (o.byCat[f.category] || 0) + a;
  });
  expensesFor(k).forEach(e => {
    const a = toARS(e.amount, e.currency);
    o.variable += a; o.count++;
    o.byCat[e.category] = (o.byCat[e.category] || 0) + a;
    const w = e.member_name || '—';
    o.byWho[w] = (o.byWho[w] || 0) + a;
  });
  o.total = o.fixed + o.variable;
  return o;
}
function goalSaved(id){
  return state.contributions.filter(c => c.goal_id === id)
    .reduce((s,c) => s + toARS(c.amount, c.currency), 0);
}
function overdueCount(k){
  const now = new Date();
  if (k !== mk(now)) return 0;
  return fixedFor(k).filter(f => !state.payments[f.id + '|' + k] && f.due_day < now.getDate()).length;
}
function elapsedDays(k){
  const now = new Date(), days = dim(k);
  if (k !== mk(now)) return days;
  const last = expensesFor(k).reduce((a,e) => Math.max(a, +String(e.spent_on).slice(8,10) || 0), 0);
  return Math.min(Math.max(now.getDate(), last), days);
}

/* ============================================================
   RENDER
   ============================================================ */
function render(){
  if (!state.householdId) return;
  $('#houseName').textContent = state.householdName || 'Libreta de Casa';
  $('#brandAvatar').innerHTML = cachitoSVG(moodNow(), 34);
  $('#btnCur').textContent = disp === 'USD' ? 'US$' : '$';
  $('#mName').textContent = mLabel(cur);
  $('#mYear').textContent = cur.split('-')[0];
  $('#nextM').disabled = cur >= mk(new Date());

  const t = totals(cur), prev = totals(shift(cur,-1)), b = +state.settings.budget || 0;

  /* estado de conexión */
  const dot = $('#stDot'), txt = $('#stTxt');
  if (!state.online){ dot.className = 'dot off'; txt.textContent = 'sin señal · se guarda igual'; }
  else if (state.queue > 0){ dot.className = 'dot off'; txt.textContent = 'subiendo ' + state.queue + ' pendiente' + (state.queue>1?'s':''); }
  else { dot.className = 'dot'; txt.textContent = state.members.length > 1
    ? 'sincronizado · ' + state.members.length + ' personas' : 'sincronizado'; }

  renderNotices(t);
  renderCachito(t, prev);
  renderHero(t, prev, b);
  renderDonut(t);
  renderMovements(t);
  renderFixed();
  renderBars();
  renderWho(t);
  renderGoals();
  renderTips(t, prev);
  renderForms();
}

function ctx(t, prev){
  const b = +state.settings.budget || 0, now = new Date(), isNow = cur === mk(now);
  const el = elapsedDays(cur), days = dim(cur);
  const projection = isNow ? t.fixed + t.variable / Math.max(el,1) * days : t.total;
  const cats = Object.keys(t.byCat).filter(c => t.byCat[c] > 0).sort((a,c) => t.byCat[c] - t.byCat[a]);
  const lastExp = expensesFor(cur).reduce((a,e) => Math.max(a, +String(e.spent_on).slice(8,10) || 0), 0);
  // Se festeja sólo durante la semana siguiente a haberla completado.
  const done = state.goals.find(g => {
    if (goalSaved(g.id) < toARS(g.target_amount, g.currency)) return false;
    const last = state.contributions.filter(c => c.goal_id === g.id)
      .map(c => c.created_at || '').sort().pop();
    if (!last) return false;
    return (Date.now() - new Date(last).getTime()) < 7*24*3600*1000;
  });
  const close = state.goals.find(g => {
    const tgt = toARS(g.target_amount, g.currency), s = goalSaved(g.id);
    return s < tgt && s / tgt >= .8;
  });
  return {
    hasData: t.total > 0, isCurrentMonth: isNow, monthName: mLabel(cur),
    total: t.total, budget: b, projection, daysLeft: Math.max(days - now.getDate(), 1),
    daysSinceLast: isNow && lastExp ? now.getDate() - lastExp : (isNow ? now.getDate() : 0),
    overdueFixed: overdueCount(cur),
    goalDone: !!done, goalName: (done || close || {}).name,
    goalClose: !!close && !done,
    goalMissing: close ? toARS(close.target_amount, close.currency) - goalSaved(close.id) : 0,
    savings: (+state.settings.income || 0) - t.total,
    topCategory: cats[0], topShare: cats.length ? t.byCat[cats[0]] / t.total : 0
  };
}
function moodNow(){
  try { return cachitoSay(ctx(totals(cur), totals(shift(cur,-1)))).mood; } catch { return 'ok'; }
}
function renderCachito(t, prev){
  const say = cachitoSay(ctx(t, prev));
  const html = `<div class="av">${cachitoSVG(say.mood, 62)}</div>
    <div class="bubble"><span class="who">Cachito</span>
      <strong>${esc(say.title)}</strong><p>${esc(say.line)}</p></div>`;
  $('#cachitoBox').innerHTML = html;
  $('#cachitoGoals').innerHTML = html;
}

function renderNotices(t){
  const out = [];
  if (!state.online)
    out.push(`<div class="notice warn"><div><b>Estás sin conexión.</b> Cargá tranquilo: se guarda en el teléfono y se sube solo cuando vuelva internet.</div></div>`);
  else if (state.queue > 0)
    out.push(`<div class="notice warn"><div><span class="spin"></span> Subiendo ${state.queue} cambio${state.queue>1?'s':''} que quedaron pendientes.</div></div>`);
  const due = dueSoon();
  if (due.length && 'Notification' in window && Notification.permission === 'default')
    out.push(`<div class="notice ok"><div>¿Querés que te avise de los vencimientos aunque no tengas la app abierta?
      <button data-notif="1">Activar avisos</button></div></div>`);
  if (due.length)
    out.push(`<div class="notice ${due.some(d => d.late) ? 'bad' : 'warn'}"><div><b>${due.length === 1 ? 'Se te vence' : 'Se te vencen'}:</b> ${
      due.map(d => esc(d.name) + (d.late ? ' (venció el ' + d.due_day + ')' : ' el ' + d.due_day)).join(', ')}.
      <button data-goto="fijos">Ir a Fijos</button></div></div>`);
  $('#notices').innerHTML = out.join('');
}
function dueSoon(){
  const now = new Date(), k = mk(now);
  if (cur !== k) return [];
  return fixedFor(k)
    .filter(f => !state.payments[f.id + '|' + k])
    .map(f => ({ ...f, late: f.due_day < now.getDate() }))
    .filter(f => f.late || f.due_day - now.getDate() <= 3)
    .sort((a,b) => a.due_day - b.due_day);
}

function renderHero(t, prev, b){
  const hero = $('#hero'); hero.className = 'hero';
  const pct = b ? t.total / b : 0;
  if (b && pct > 1) hero.classList.add('over'); else if (b && pct > .85) hero.classList.add('warn');
  $('#heroTotal').textContent = fmt(t.total);
  $('#heroOf').textContent = b ? 'de ' + fmt(b) + ' de presupuesto' : 'Definí un presupuesto en ⚙ para seguirlo';
  const pill = $('#heroPill');
  if (!b){ pill.className = 'pill ok'; pill.textContent = t.count + ' mov.'; }
  else if (pct > 1){ pill.className = 'pill bad'; pill.textContent = '+' + Math.round((pct-1)*100) + '% pasado'; }
  else if (pct > .85){ pill.className = 'pill warn'; pill.textContent = Math.round(pct*100) + '% usado'; }
  else { pill.className = 'pill ok'; pill.textContent = Math.round(pct*100) + '% usado'; }
  const bar = $('#heroBar'), base = b ? Math.max(b, t.total) : Math.max(t.total, 1);
  bar.className = 'bar' + (b && pct > 1 ? ' over' : '');
  bar.children[0].style.width = (t.fixed/base*100) + '%';
  bar.children[1].style.width = (t.variable/base*100) + '%';
  $('#lgF').textContent = fmt(t.fixed);
  $('#lgV').textContent = fmt(t.variable);

  const el = elapsedDays(cur), days = dim(cur), isNow = cur === mk(new Date());
  $('#tDay').textContent  = fmtK(t.total / Math.max(el,1));
  $('#tProj').textContent = isNow ? fmtK(t.fixed + t.variable/Math.max(el,1)*days) : fmtK(t.total);
  $('#tLeft').textContent = b ? fmtK(b - t.total) : '—';
  const vs = $('#tVs');
  if (prev.total > 0){
    const d = (t.total - prev.total) / prev.total * 100;
    vs.textContent = (d >= 0 ? '+' : '') + Math.round(d) + '%';
    vs.style.color = d > 8 ? 'var(--brick)' : (d < -8 ? 'var(--moss)' : 'var(--text)');
  } else { vs.textContent = '—'; vs.style.color = ''; }
}

function renderDonut(t){
  const w = $('#donutWrap');
  const cats = Object.keys(t.byCat).filter(c => t.byCat[c] > 0).sort((a,b) => t.byCat[b] - t.byCat[a]);
  if (!cats.length){
    w.innerHTML = '<div class="empty" style="flex:1"><strong>Todavía no hay gastos</strong>Cargá el primero desde la pestaña Cargar.</div>';
    $('#catCount').textContent = ''; return;
  }
  $('#catCount').textContent = cats.length + (cats.length === 1 ? ' categoría' : ' categorías');
  const R = 57, r = 36, cx = 61, cy = 61;
  const sum = cats.reduce((s,c) => s + t.byCat[c], 0);
  let a = -Math.PI/2, paths = '';
  cats.forEach(c => {
    const ang = Math.min(t.byCat[c]/sum * Math.PI*2, Math.PI*2 - .001), a2 = a + ang;
    const p = (rad, ang2) => [(cx + rad*Math.cos(ang2)).toFixed(2), (cy + rad*Math.sin(ang2)).toFixed(2)];
    const [x1,y1] = p(R,a), [x2,y2] = p(R,a2), [x3,y3] = p(r,a2), [x4,y4] = p(r,a);
    const lg = ang > Math.PI ? 1 : 0;
    paths += `<path d="M${x1} ${y1}A${R} ${R} 0 ${lg} 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 ${lg} 0 ${x4} ${y4}Z"
      fill="${catColor(c)}"><title>${esc(c)}: ${fmt(t.byCat[c])}</title></path>`;
    a = a2;
  });
  const top = cats[0], topPc = Math.round(t.byCat[top]/sum*100);
  w.innerHTML = `<svg viewBox="0 0 122 122" width="122" height="122" role="img" aria-label="Gastos por categoría">${paths}
    <text x="61" y="58" text-anchor="middle" font-family="var(--mono)" font-size="19" font-weight="600" fill="var(--text)">${topPc}%</text>
    <text x="61" y="72" text-anchor="middle" font-family="var(--body)" font-size="8.5" fill="var(--text-3)">${esc(top.length > 13 ? top.slice(0,12)+'…' : top)}</text></svg>
    <div class="catlist">${cats.slice(0,6).map(c =>
      `<div class="catrow"><i class="tag" style="background:${catColor(c)}"></i>
        <span class="nm">${esc(c)} <span class="pc">${Math.round(t.byCat[c]/sum*100)}%</span></span>
        <b>${fmt(t.byCat[c])}</b></div>`).join('')}
      ${cats.length > 6 ? `<div class="catrow"><i></i><span class="nm pc">+${cats.length-6} más</span>
        <b class="pc">${fmt(cats.slice(6).reduce((s,c)=>s+t.byCat[c],0))}</b></div>` : ''}</div>`;
}

function expRow(e){
  const d = String(e.spent_on || '').split('-');
  const alt = e.currency === 'USD' && disp !== 'USD' ? `<small>US$${(+e.amount).toLocaleString('es-AR')}</small>` : '';
  return `<div class="row${e.pending ? ' queued' : ''}">
    <span class="day"><b>${+d[2] || ''}</b>${d[1] ? MONTHS[+d[1]-1].slice(0,3) : ''}</span>
    <span class="nm"><strong>${esc(e.note || e.category)}</strong>
      <em><i class="tag" style="background:${catColor(e.category)}"></i>${esc(e.category)}${
        e.member_name ? ' · ' + esc(e.member_name) : ''}${e.pending ? ' · se sube después' : ''}</em></span>
    <span class="amt">${fmt(toARS(e.amount, e.currency))}${alt}</span>
    ${e.receipt_path && e.receipt_path !== 'pending'
      ? `<button class="act ph" data-photo="${esc(e.receipt_path)}" aria-label="Ver comprobante">▣</button>`
      : `<button class="act" data-del="${esc(e.id)}" aria-label="Borrar">✕</button>`}
  </div>`;
}
function renderMovements(t){
  const list = expensesFor(cur).slice()
    .sort((a,b) => String(b.spent_on).localeCompare(String(a.spent_on)) ||
                   String(b.created_at || '').localeCompare(String(a.created_at || '')));
  $('#mvCount').textContent = list.length ? fmt(t.variable) + ' en ' + list.length : '';
  $('#mvList').innerHTML = list.length ? list.map(expRow).join('')
    : '<div class="empty"><strong>Mes limpio</strong>Los gastos fijos se cuentan aparte, en su pestaña.</div>';
  const recent = state.expenses.slice(0,5);
  $('#quickList').innerHTML = recent.length ? recent.map(expRow).join('')
    : '<div class="empty">Lo que cargues aparece acá.</div>';
}

function renderFixed(){
  const f = fixedFor(cur).slice().sort((a,b) => (a.due_day||31) - (b.due_day||31));
  const now = new Date(), isNow = cur === mk(now), d = now.getDate();
  let sum = 0, pend = 0;
  const html = f.map(x => {
    const ars = toARS(x.amount, x.currency); sum += ars;
    const paid = !!state.payments[x.id + '|' + cur];
    if (!paid) pend += ars;
    let cls = '', note = 'vence el ' + x.due_day;
    if (paid) note = 'pagado';
    else if (isNow && x.due_day < d){ cls = ' late'; note = 'venció el ' + x.due_day; }
    else if (isNow && x.due_day - d <= 4){ cls = ' soon'; note = 'en ' + (x.due_day - d) + ' días'; }
    return `<div class="row${x.pending ? ' queued' : ''}">
      <button class="check" data-paid="${esc(x.id)}" aria-pressed="${paid}" aria-label="Marcar pagado">✓</button>
      <span class="nm"><strong>${esc(x.name)}</strong>
        <em><i class="tag" style="background:${catColor(x.category)}"></i>${esc(x.category)}${
          x.currency === 'USD' ? ' · en dólares' : ''}</em></span>
      <span class="due${cls}"><b>${fmt(ars)}</b>${esc(note)}</span>
      <button class="act" data-delfix="${esc(x.id)}" aria-label="Borrar">✕</button></div>`;
  }).join('');
  $('#fxList').innerHTML = html ||
    '<div class="empty"><strong>Sin gastos fijos</strong>Alquiler, luz, gas, internet, cuotas: cargalos una vez y se repiten todos los meses.</div>';
  $('#fxSum').textContent = f.length ? fmt(sum) + (pend ? ' · ' + fmt(pend) + ' sin pagar' : ' · al día') : '';
}

function renderBars(){
  const keys = []; for (let i = 5; i >= 0; i--) keys.push(shift(cur,-i));
  const data = keys.map(k => { const t = totals(k); return { k, f:t.fixed, v:t.variable, tt:t.total }; });
  const max = Math.max(...data.map(d => d.tt), 1);
  const b = +state.settings.budget || 0;
  const W = 340, H = 170, pad = { l:6, r:6, t:14, b:26 }, bw = (W-pad.l-pad.r)/6, inner = bw*.56;
  let g = '';
  if (b && b <= max*1.4){
    const by = pad.t + (H-pad.t-pad.b)*(1 - b/max);
    g += `<line x1="${pad.l}" y1="${by.toFixed(1)}" x2="${W-pad.r}" y2="${by.toFixed(1)}"
            stroke="var(--ochre)" stroke-width="1" stroke-dasharray="3 3"/>
          <text x="${W-pad.r}" y="${(by-4).toFixed(1)}" text-anchor="end" font-size="8"
            font-family="var(--mono)" fill="var(--ochre)">presupuesto ${fmtK(b)}</text>`;
  }
  data.forEach((d,i) => {
    const x = pad.l + bw*i + (bw-inner)/2;
    const h = (H-pad.t-pad.b) * (d.tt/max), y = H-pad.b-h;
    const hf = d.tt ? h*(d.f/d.tt) : 0, isCur = d.k === cur;
    if (h > 0){
      g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${inner.toFixed(1)}"
              height="${Math.max(h-hf,0).toFixed(1)}" rx="3"
              fill="${isCur ? 'color-mix(in srgb,var(--teal) 45%,var(--surface-2))' : 'var(--surface-2)'}"/>
            <rect x="${x.toFixed(1)}" y="${(H-pad.b-hf).toFixed(1)}" width="${inner.toFixed(1)}"
              height="${hf.toFixed(1)}" rx="3"
              fill="${isCur ? 'var(--teal)' : 'color-mix(in srgb,var(--teal) 40%,var(--surface-2))'}"/>
            <text x="${(x+inner/2).toFixed(1)}" y="${(y-4).toFixed(1)}" text-anchor="middle" font-size="8.5"
              font-family="var(--mono)" font-weight="600"
              fill="${isCur ? 'var(--text)' : 'var(--text-3)'}">${fmtK(d.tt)}</text>`;
    }
    g += `<text x="${(x+inner/2).toFixed(1)}" y="${H-9}" text-anchor="middle" font-size="8.5"
            font-family="var(--body)" fill="${isCur ? 'var(--text-2)' : 'var(--text-3)'}"
            font-weight="${isCur ? 700 : 400}">${mLabel(d.k).slice(0,3)}</text>`;
  });
  $('#barsChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img"
      aria-label="Gasto de los últimos seis meses">${g}</svg>
    <div class="legend"><span><i class="sw" style="background:var(--teal)"></i>Fijos</span>
      <span><i class="sw" style="background:color-mix(in srgb,var(--teal) 45%,var(--surface-2))"></i>Variables</span></div>`;
}

function renderWho(t){
  const who = Object.keys(t.byWho).sort((a,b) => t.byWho[b] - t.byWho[a]);
  const tot = t.variable || 1;
  $('#whoList').innerHTML = who.length ? who.map(w =>
    `<div class="rule"><span>${esc(w)}</span>
      <span class="mini"><i style="width:${(t.byWho[w]/tot*100).toFixed(0)}%"></i></span>
      <b class="num">${fmt(t.byWho[w])}</b></div>`).join('')
    : '<div class="empty">Nadie cargó gastos este mes.</div>';
}

/* ---------------- metas ---------------- */
function goalETA(g){
  const target = toARS(g.target_amount, g.currency), saved = goalSaved(g.id);
  const missing = Math.max(target - saved, 0);
  const cs = state.contributions.filter(c => c.goal_id === g.id);
  const months = new Set(cs.map(c => String(c.created_at || today()).slice(0,7)));
  const avg = months.size ? cs.reduce((s,c) => s + toARS(c.amount, c.currency), 0) / months.size : 0;
  const plan = toARS(g.monthly_plan, g.currency);
  const pace = plan || avg;
  const left = pace > 0 ? Math.ceil(missing / pace) : null;
  let eta = null;
  if (left != null && left > 0){
    const d = new Date(); d.setMonth(d.getMonth() + left);
    eta = MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  let needed = null;
  if (g.deadline){
    const dl = new Date(g.deadline + 'T00:00:00'), now = new Date();
    const mLeft = Math.max((dl.getFullYear()-now.getFullYear())*12 + dl.getMonth()-now.getMonth(), 0);
    needed = mLeft > 0 ? missing / mLeft : missing;
  }
  return { target, saved, missing, pace, left, eta, needed, pct: target ? saved/target : 0 };
}
function renderGoals(){
  const box = $('#goalList');
  if (!state.goals.length){
    box.innerHTML = `<div class="card"><div class="empty"><strong>Todavía no hay ninguna meta</strong>
      Un viaje, una consola, el auto, el fondo de emergencia. Ponerle nombre y número es la mitad del trabajo.</div></div>`;
    return;
  }
  box.innerHTML = state.goals.map(g => {
    const e = goalETA(g), done = e.missing <= 0;
    const pct = Math.min(e.pct, 1);
    const marks = [.25,.5,.75,1].map(m => `<i class="${pct >= m ? 'on' : ''}"></i>`).join('');
    let etaLine;
    if (done) etaLine = '<b>¡Conseguida!</b> Ya juntaste todo.';
    else if (e.needed != null && e.pace > 0)
      etaLine = `Poniendo ${fmt(e.pace)} por mes llegás en <b>${e.eta}</b>. Para la fecha que pusiste harían falta ${fmt(e.needed)} por mes.`;
    else if (e.eta) etaLine = `Al ritmo actual (${fmt(e.pace)} por mes) llegás en <b>${e.eta}</b>.`;
    else if (e.needed != null) etaLine = `Para llegar a tiempo tenés que poner <b>${fmt(e.needed)}</b> por mes.`;
    else etaLine = 'Poné cuánto podés apartar por mes y te calculo la fecha.';
    return `<div class="goal${done ? ' done' : ''}">
      <header>
        <span class="em">${esc(g.emoji || '🎯')}</span>
        <div style="flex:1;min-width:0">
          <h3>${esc(g.name)}</h3>
          <p class="meta">${done ? 'Completada' : Math.round(pct*100) + '% juntado'}${
            g.deadline ? ' · para ' + new Date(g.deadline + 'T00:00:00').toLocaleDateString('es-AR',{month:'long',year:'numeric'}) : ''}</p>
        </div>
        <span class="pill ${done ? 'good' : 'ok'}">${done ? '✓' : fmt(e.missing) + ' falta'}</span>
      </header>
      <div class="track"><i style="width:${(pct*100).toFixed(1)}%"></i></div>
      <div class="milestones">${marks}</div>
      <div class="figs"><span>Juntado <b>${fmt(e.saved)}</b></span><span class="hint">de ${fmt(e.target)}</span></div>
      <div class="eta">${etaLine}</div>
      <div class="acts">
        <button class="btn sm" data-put="${esc(g.id)}">Poner plata</button>
        <button class="btn ghost sm" data-editgoal="${esc(g.id)}">Editar</button>
        <button class="btn danger sm" data-delgoal="${esc(g.id)}">✕</button>
      </div></div>`;
  }).join('');
}

/* ---------------- consejos ---------------- */
const STATIC = [
  ['Pagate primero','El día que entra la plata separá el ahorro antes que nada. Lo que queda es lo que hay para gastar; al revés nunca sobra.'],
  ['Revisá los débitos automáticos','Suscripciones, apps, planes que se renuevan solos. Una vuelta por el resumen de la tarjeta y cancelá lo que no usaste el último mes.'],
  ['Cuotas: son un gasto fijo','Mientras dure el plan, cargala en Fijos. Ver el total comprometido evita sumar cuotas nuevas sin darte cuenta.'],
  ['48 horas antes de comprar','Para cualquier compra no esencial, esperá dos días. Buena parte de las ganas se va sola.'],
  ['Fondo de emergencia','Apuntá a tener guardado entre tres y seis meses de tus gastos fijos. Es lo que evita endeudarse cuando aparece algo.'],
  ['Lista antes del super','Y comparar precio por kilo o por litro, no por envase. Es donde más se filtra el gasto variable.'],
  ['Una revisión al año','Seguros, internet, telefonía, planes: pedí presupuesto de la competencia una vez al año y renegociá.']
];
function renderTips(t, prev){
  const tips = [], b = +state.settings.budget || 0, inc = +state.settings.income || 0;
  const cats = Object.keys(t.byCat).filter(c => t.byCat[c] > 0).sort((a,c) => t.byCat[c] - t.byCat[a]);
  if (!t.total){
    $('#tipsAuto').innerHTML = '<div class="empty"><strong>Cargá un mes completo</strong>Con los primeros gastos ya empiezan a aparecer observaciones acá.</div>';
  } else {
    if (cats.length){
      const share = t.byCat[cats[0]] / t.total;
      tips.push([share > .4 ? 'hi' : 'mid', Math.round(share*100) + '%', cats[0] + ' se lleva la mayor parte',
        `Son ${fmt(t.byCat[cats[0]])} de ${fmt(t.total)}. ` + (share > .4
          ? `Bajar un 10% ahí libera ${fmt(t.byCat[cats[0]]*.1)} por mes, más que recortar en tres rubros chicos.`
          : 'Está dentro de lo esperable, pero es el rubro donde un ajuste rinde más.')]);
    }
    if (t.total && t.fixed/t.total > .6)
      tips.push(['hi', Math.round(t.fixed/t.total*100) + '%', 'Los fijos te comen el mes',
        `Con ${fmt(t.fixed)} comprometidos antes de arrancar, queda poco margen. Los fijos no se recortan apurado: se renegocian o se dan de baja, uno por mes.`]);
    if (prev.total > 0){
      const d = (t.total - prev.total) / prev.total;
      if (d > .15) tips.push(['hi','↑','Subiste fuerte contra ' + mLabel(shift(cur,-1)),
        `Gastaste ${fmt(t.total-prev.total)} más (${Math.round(d*100)}%). Mirá la tabla de categorías: casi siempre es una sola la que se movió.`]);
      else if (d < -.1) tips.push(['good','↓','Vas mejor que ' + mLabel(shift(cur,-1)),
        `Bajaste ${fmt(prev.total-t.total)}. Si podés, mandá esa diferencia a una meta antes de que se diluya.`]);
    }
    const now = new Date();
    if (cur === mk(now)){
      const el = elapsedDays(cur), proj = t.fixed + t.variable/Math.max(el,1)*dim(cur);
      if (b && proj > b) tips.push(['hi','!','Vas camino a pasarte del presupuesto',
        `Al ritmo de estos ${el} días terminás en ${fmt(proj)}, ${fmt(proj-b)} arriba. Te quedan ${dim(cur)-now.getDate()} días para bajar el promedio diario a ${fmt(Math.max(b-t.total,0)/Math.max(dim(cur)-now.getDate(),1))}.`]);
      else if (b) tips.push(['good','✓','El presupuesto te cierra',
        `Proyectando el ritmo actual terminás en ${fmt(proj)}, dentro de los ${fmt(b)}.`]);
    }
    const exps = expensesFor(cur);
    const avg = exps.length ? t.variable/exps.length : 0;
    const small = exps.filter(e => toARS(e.amount, e.currency) <= avg*.5);
    if (small.length >= 5){
      const ss = small.reduce((s,e) => s + toARS(e.amount, e.currency), 0);
      tips.push(['mid', String(small.length), 'Los gastos chicos suman ' + fmt(ss),
        `Son ${small.length} movimientos que por separado no parecen nada y juntos son ${Math.round(ss/t.variable*100)}% de lo variable.`]);
    }
    const big = exps.slice().sort((a,b2) => toARS(b2.amount,b2.currency) - toARS(a.amount,a.currency))[0];
    if (big && toARS(big.amount,big.currency) > t.variable*.3)
      tips.push(['mid','1','Un gasto explica buena parte del mes',
        `${esc(big.note || big.category)} por ${fmt(toARS(big.amount,big.currency))} es ${Math.round(toARS(big.amount,big.currency)/t.variable*100)}% de lo variable. Si fue algo puntual, el mes real es más bajo de lo que muestra el total.`]);
    if (inc > 0){
      const save = inc - t.total;
      tips.push([save > inc*.1 ? 'good' : (save > 0 ? 'mid' : 'hi'), save > 0 ? '+' : '–',
        save > 0 ? 'Podés ahorrar ' + fmt(save) + ' este mes' : 'Estás gastando más de lo que entra',
        save > 0
          ? `Es el ${Math.round(save/inc*100)}% de tu ingreso. Mandalo a una meta el día que cobrás y ya está resuelto.`
          : `Faltan ${fmt(-save)} para cubrir el mes. Empezá por los fijos: son ${fmt(t.fixed)} y son los que se pueden renegociar.`]);
    }
    $('#tipsAuto').innerHTML = tips.map(x =>
      `<div class="tip ${x[0]}"><span class="k">${esc(x[1])}</span><div><strong>${esc(x[2])}</strong><p>${x[3]}</p></div></div>`).join('');
  }

  const inc2 = +state.settings.income || 0, ref = inc2 || t.total || 1;
  $('#ruleBase').textContent = inc2 ? 'sobre ' + fmt(inc2) + ' de ingreso' : 'sobre tus gastos del mes';
  const need = t.fixed + (t.byCat['Supermercado']||0) + (t.byCat['Transporte']||0) + (t.byCat['Salud']||0);
  const want = Math.max(t.total - need, 0), saved = inc2 ? Math.max(inc2 - t.total, 0) : 0;
  const rows = [['Necesario (50%)', need, .5], ['Gustos (30%)', want, .3], ['Ahorro (20%)', saved, .2]];
  $('#ruleRows').innerHTML = rows.map(r => {
    const pct = r[1]/ref, isSaving = r[0].startsWith('Ahorro');
    const off = isSaving ? pct < r[2] : pct > r[2];
    return `<div class="rule"><span>${r[0]}<br><span class="pc">${Math.round(pct*100)}% · ${fmt(r[1])}</span></span>
      <span class="mini"><i class="${off ? 'over' : ''}" style="width:${Math.min(pct/Math.max(r[2],.01)*100,100).toFixed(0)}%"></i></span>
      <span class="pill ${off ? 'warn' : 'ok'}">${off ? (isSaving ? 'corto' : 'alto') : 'bien'}</span></div>`;
  }).join('') + (inc2 ? '' : '<p class="hint" style="margin-top:10px">Cargá tu ingreso del hogar en ⚙ para que esta comparación tenga sentido.</p>');

  const last3 = [shift(cur,-2), shift(cur,-1), cur], tt = last3.map(totals), all = {};
  tt.forEach(x => Object.keys(x.byCat).forEach(c => { all[c] = (all[c]||0) + x.byCat[c]; }));
  const order = Object.keys(all).sort((a,b) => all[b] - all[a]);
  $('#histTable').innerHTML = order.length
    ? `<table><thead><tr><th>Categoría</th>${last3.map(k => `<th class="r">${mLabel(k).slice(0,3)}</th>`).join('')}</tr></thead>
       <tbody>${order.map(c => `<tr><td><i class="tag" style="background:${catColor(c)}"></i> ${esc(c)}</td>${
         tt.map(x => `<td class="r">${x.byCat[c] ? fmtK(x.byCat[c]) : '–'}</td>`).join('')}</tr>`).join('')}
       <tr><td><b>Total</b></td>${tt.map(x => `<td class="r"><b>${fmtK(x.total)}</b></td>`).join('')}</tr></tbody></table>`
    : '<div class="empty">Cargá algunos meses y acá vas a ver la comparación.</div>';

  $('#tipsStatic').innerHTML = STATIC.map((s,i) =>
    `<div class="tip"><span class="k">${i+1}</span><div><strong>${s[0]}</strong><p>${s[1]}</p></div></div>`).join('');
}

function renderForms(){
  const cats = state.settings.categories;
  $('#fCats').innerHTML = cats.map(c =>
    `<button class="chip" data-cat="${esc(c)}" aria-pressed="${fCat===c}"><i class="tag" style="background:${catColor(c)}"></i>${esc(c)}</button>`).join('');
  $('#xCats').innerHTML = cats.map(c =>
    `<button class="chip" data-xcat="${esc(c)}" aria-pressed="${xCat===c}"><i class="tag" style="background:${catColor(c)}"></i>${esc(c)}</button>`).join('');
  const people = state.members.length ? state.members : [state.memberName || 'Yo'];
  if (!fWho || !people.includes(fWho)) fWho = state.memberName || people[0];
  $('#fWho').innerHTML = people.map(w =>
    `<button class="chip" data-who="${esc(w)}" aria-pressed="${fWho===w}">${esc(w)}</button>`).join('');
  $('#sCats').innerHTML = cats.map(c =>
    `<span class="chip"><i class="tag" style="background:${catColor(c)}"></i>${esc(c)}<button data-rmc="${esc(c)}" aria-label="Quitar">✕</button></span>`).join('');
  $('#fCur').textContent = fCur; $('#xCur').textContent = xCur;
  $('#mCur').textContent = mCur; $('#pCur').textContent = pCur;
  $('#sHouseInfo').textContent = `"${state.householdName}" · ${state.members.length} ${
    state.members.length === 1 ? 'integrante' : 'integrantes'}: ${state.members.join(', ')}.`;
}

/* ============================================================
   ACCIONES
   ============================================================ */
function setView(v){
  view = v;
  ['mes','cargar','fijos','metas','consejos'].forEach(x => { $('#v-'+x).hidden = x !== v; });
  Array.from($('#tabs').children).forEach(b => b.setAttribute('aria-current', String(b.dataset.v === v)));
  window.scrollTo({ top:0, behavior:'smooth' });
}
function openSheet(id){ $('#'+id).hidden = false; }
function closeSheet(id){ $('#'+id).hidden = true; }

async function saveExpense(){
  const amount = num($('#fAmount').value);
  if (amount <= 0) return toast('Poné un monto');
  if (!fCat) return toast('Elegí una categoría');
  const date = $('#fDate').value || today();
  await store.addExpense({
    amount, currency:fCur, category:fCat,
    member_name: fWho || state.memberName || '',
    note: $('#fNote').value.trim(),
    spent_on: date
  }, fPhoto);
  $('#fAmount').value = ''; $('#fNote').value = '';
  clearPhoto();
  if (date.slice(0,7) <= mk(new Date())) cur = date.slice(0,7);
  setView('mes');
  toast(state.online ? 'Gasto guardado' : 'Guardado. Se sube cuando vuelva internet');
}
function clearPhoto(){
  fPhoto = null;
  $('#fPhoto').value = '';
  $('#fPhotoPrev').hidden = true;
  $('#fPhotoPrev').removeAttribute('src');
  $('#fPhotoTxt').textContent = 'Sacale una foto al ticket y queda guardado con el gasto.';
  $('#fPhotoBtn').textContent = 'Adjuntar';
}
async function pickPhoto(file){
  if (!file) return;
  const blob = await shrink(file).catch(() => file);
  fPhoto = blob;
  const url = URL.createObjectURL(blob);
  const img = $('#fPhotoPrev'); img.src = url; img.hidden = false;
  $('#fPhotoTxt').textContent = 'Listo, va con el gasto (' + Math.round(blob.size/1024) + ' KB).';
  $('#fPhotoBtn').textContent = 'Cambiar';
}
/* Las fotos de celular pesan varios MB: las bajamos a 1200px de ancho. */
function shrink(file, max = 1200, quality = .72){
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('no se pudo')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('no se pudo leer')); };
    img.src = url;
  });
}
async function saveFixed(){
  const name = $('#xName').value.trim(), amount = num($('#xAmount').value);
  if (!name) return toast('Ponele un nombre');
  if (amount <= 0) return toast('Poné el monto mensual');
  if (!xCat) return toast('Elegí una categoría');
  await store.addFixed({
    name, amount, currency:xCur, category:xCat,
    due_day: Math.min(Math.max(+$('#xDay').value || 1, 1), 31),
    active_from: cur
  });
  $('#xName').value = ''; $('#xAmount').value = '';
  toast('Gasto fijo agregado');
}

let editingGoal = null;
function openGoal(g){
  editingGoal = g || null;
  $('#goalSheetTitle').textContent = g ? 'Editar meta' : 'Nueva meta';
  $('#mSave').textContent = g ? 'Guardar cambios' : 'Crear la meta';
  $('#mName2').value = g ? g.name : '';
  $('#mEmoji').value = g ? (g.emoji || '🎯') : '🎯';
  $('#mTarget').value = g ? String(g.target_amount) : '';
  $('#mPlan').value = g && +g.monthly_plan ? String(g.monthly_plan) : '';
  $('#mDeadline').value = g && g.deadline ? g.deadline : '';
  mCur = g ? g.currency : 'ARS';
  $('#mCur').textContent = mCur;
  openSheet('scrimGoal');
}
async function saveGoal(){
  const name = $('#mName2').value.trim(), target = num($('#mTarget').value);
  if (!name) return toast('Ponele un nombre a la meta');
  if (target <= 0) return toast('¿Cuánto sale?');
  const row = {
    name, emoji: $('#mEmoji').value.trim() || '🎯',
    target_amount: target, currency: mCur,
    monthly_plan: num($('#mPlan').value),
    deadline: $('#mDeadline').value || null
  };
  if (editingGoal) await store.updateGoal(editingGoal.id, row);
  else await store.addGoal(row);
  closeSheet('scrimGoal');
  toast(editingGoal ? 'Meta actualizada' : '¡Meta creada! A juntar.');
  editingGoal = null;
}
function openPut(g){
  putGoal = g;
  pCur = g.currency;
  $('#pCur').textContent = pCur;
  $('#putTitle').textContent = (g.emoji || '🎯') + ' ' + g.name;
  $('#pAmount').value = ''; $('#pNote').value = '';
  const cs = state.contributions.filter(c => c.goal_id === g.id).slice(0,8);
  $('#putHistory').innerHTML = cs.length
    ? '<h2 style="font-family:var(--display);font-size:.95rem;margin-bottom:8px">Lo que ya pusieron</h2><div class="mv">' +
      cs.map(c => `<div class="row"><span class="day"><b>${String(c.created_at || today()).slice(8,10)}</b>${
        MONTHS[+String(c.created_at || today()).slice(5,7)-1].slice(0,3)}</span>
        <span class="nm"><strong>${esc(c.note || 'Aporte')}</strong><em>${esc(c.member_name || '')}</em></span>
        <span class="amt">${fmt(toARS(c.amount, c.currency))}</span><span></span></div>`).join('') + '</div>'
    : '<p class="hint">Todavía no pusieron nada en esta meta.</p>';
  openSheet('scrimPut');
}
async function savePut(){
  const amount = num($('#pAmount').value);
  if (amount === 0) return toast('¿Cuánto ponés?');
  const before = goalSaved(putGoal.id), target = toARS(putGoal.target_amount, putGoal.currency);
  await store.addContribution({
    goal_id: putGoal.id, amount, currency: pCur,
    member_name: state.memberName || '', note: $('#pNote').value.trim()
  });
  closeSheet('scrimPut');
  const after = before + toARS(amount, pCur);
  if (before < target && after >= target) toast('¡Llegaste a la meta! 🎉');
  else toast('Sumado. Faltan ' + fmt(Math.max(target - after, 0)));
}

function exportCSV(){
  const rows = [['fecha','tipo','categoria','quien','detalle','monto','moneda','monto_en_pesos']];
  fixedFor(cur).forEach(f => rows.push([
    cur + '-' + String(f.due_day).padStart(2,'0'), 'fijo', f.category, '', f.name,
    f.amount, f.currency, Math.round(toARS(f.amount, f.currency))]));
  expensesFor(cur).forEach(e => rows.push([
    e.spent_on, 'variable', e.category, e.member_name || '', e.note || '',
    e.amount, e.currency, Math.round(toARS(e.amount, e.currency))]));
  const text = '﻿' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type:'text/csv;charset=utf-8' }));
  a.download = 'libreta-' + cur + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function showPhoto(path){
  toast('Abriendo comprobante…');
  const url = await store.receiptUrl(path);
  if (!url) return toast('No se pudo abrir la foto');
  $('#lightboxImg').src = url;
  $('#lightbox').hidden = false;
}

/* Aviso local de vencimientos (no es push: sirve con la app instalada). */
async function notifyDue(){
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const due = dueSoon();
  if (!due.length) return;
  const stamp = 'libreta.notified.' + today();
  if (localStorage.getItem(stamp)) return;
  localStorage.setItem(stamp, '1');
  new Notification('Libreta de Casa', {
    body: due.length === 1
      ? `${due[0].name} ${due[0].late ? 'venció' : 'vence'} el ${due[0].due_day}.`
      : `Tenés ${due.length} gastos fijos por vencer.`,
    icon: './icons/icon-192.png', badge: './icons/icon-192.png'
  });
}
export async function askNotifications(){
  if (!('Notification' in window)) return toast('Tu navegador no soporta avisos');
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? 'Listo, te aviso de los vencimientos' : 'Quedó sin avisos');
  render();
}

/* ============================================================
   EVENTOS
   ============================================================ */
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-v]'); if (b) setView(b.dataset.v);
});
$('#prevM').onclick = () => { cur = shift(cur,-1); render(); };
$('#nextM').onclick = () => { if (cur < mk(new Date())){ cur = shift(cur,1); render(); } };
$('#btnCur').onclick = () => {
  disp = disp === 'ARS' ? 'USD' : 'ARS';
  if (disp === 'USD' && rate() <= 1){ disp = 'ARS'; return toast('Cargá la cotización del dólar en ⚙'); }
  localStorage.setItem('libreta.disp', disp); render();
};
$('#btnSettings').onclick = () => {
  $('#sBudget').value = state.settings.budget || '';
  $('#sIncome').value = state.settings.income || '';
  $('#sRate').value   = state.settings.usd_rate > 1 ? state.settings.usd_rate : '';
  openSheet('scrimSet');
};
$('#fCur').onclick = () => { fCur = fCur === 'ARS' ? 'USD' : 'ARS'; $('#fCur').textContent = fCur; };
$('#xCur').onclick = () => { xCur = xCur === 'ARS' ? 'USD' : 'ARS'; $('#xCur').textContent = xCur; };
$('#mCur').onclick = () => { mCur = mCur === 'ARS' ? 'USD' : 'ARS'; $('#mCur').textContent = mCur; };
$('#pCur').onclick = () => { pCur = pCur === 'ARS' ? 'USD' : 'ARS'; $('#pCur').textContent = pCur; };
$('#fCats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b){ fCat = b.dataset.cat; renderForms(); } });
$('#xCats').addEventListener('click', e => { const b = e.target.closest('[data-xcat]'); if (b){ xCat = b.dataset.xcat; renderForms(); } });
$('#fWho').addEventListener('click', e => { const b = e.target.closest('[data-who]'); if (b){ fWho = b.dataset.who; renderForms(); } });
$('#fSave').onclick = saveExpense;
$('#xSave').onclick = saveFixed;
$('#fPhoto').addEventListener('change', e => pickPhoto(e.target.files[0]));
$('#gNew').onclick = () => openGoal(null);
$('#mSave').onclick = saveGoal;
$('#pSave').onclick = savePut;
$('#sExport').onclick = exportCSV;
$('#sAddCat').onclick = () => {
  const v = $('#sNewCat').value.trim(); if (!v) return;
  if (!state.settings.categories.includes(v))
    store.saveSettings({ categories: [...state.settings.categories, v] });
  $('#sNewCat').value = '';
};
$('#sCode').onclick = async () => {
  const v = prompt('Nuevo código para el hogar (mínimo 4 caracteres).\nLos que ya entraron siguen adentro; el código nuevo es para los que entren de ahora en más.');
  if (!v) return;
  try { await store.changeCode(v.trim()); toast('Código cambiado'); }
  catch (e){ toast(e.message); }
};
$('#sLeave').onclick = () => {
  if (confirm('Se borra el acceso en este teléfono. Los datos siguen en la nube y podés volver a entrar con el código. ¿Seguimos?'))
    store.leaveHouse();
};
['sBudget','sIncome','sRate'].forEach(id => $('#'+id).addEventListener('change', () => {
  store.saveSettings({
    budget: num($('#sBudget').value),
    income: num($('#sIncome').value),
    usd_rate: Math.max(num($('#sRate').value), 1)
  });
}));
$('#lightbox').onclick = () => { $('#lightbox').hidden = true; $('#lightboxImg').removeAttribute('src'); };

document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]'); if (c) return closeSheet(c.dataset.close);
  if (e.target.classList.contains('scrim')) return closeSheet(e.target.id);
  const g = e.target.closest('[data-goto]'); if (g) return setView(g.dataset.goto);
  const ph = e.target.closest('[data-photo]'); if (ph) return showPhoto(ph.dataset.photo);
  const d = e.target.closest('[data-del]'); if (d) return store.delExpense(d.dataset.del);
  const p = e.target.closest('[data-paid]');
  if (p) return store.setPaid(p.dataset.paid, cur, p.getAttribute('aria-pressed') !== 'true');
  const f = e.target.closest('[data-delfix]');
  if (f && confirm('¿Borrar este gasto fijo? Desaparece de todos los meses.')) return store.delFixed(f.dataset.delfix);
  const rc = e.target.closest('[data-rmc]');
  if (rc) return store.saveSettings({ categories: state.settings.categories.filter(x => x !== rc.dataset.rmc) });
  const pu = e.target.closest('[data-put]');
  if (pu) return openPut(state.goals.find(x => x.id === pu.dataset.put));
  const eg = e.target.closest('[data-editgoal]');
  if (eg) return openGoal(state.goals.find(x => x.id === eg.dataset.editgoal));
  const dg = e.target.closest('[data-delgoal]');
  if (dg && confirm('¿Borrar la meta y todo lo que anotaron en ella?')) return store.delGoal(dg.dataset.delgoal);
  const nt = e.target.closest('[data-notif]'); if (nt) return askNotifications();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape'){ ['scrimSet','scrimGoal','scrimPut'].forEach(closeSheet); $('#lightbox').hidden = true; }
  if (e.key === 'Enter' && document.activeElement === $('#fAmount')) saveExpense();
});

/* ============================================================
   ENTRADA
   ============================================================ */
let gateMode = 'join';
$('#gateSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-mode]'); if (!b) return;
  gateMode = b.dataset.mode;
  Array.from($('#gateSeg').children).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.mode === gateMode)));
  $('#gateNameWrap').hidden = gateMode !== 'new';
  $('#gCodeHint').textContent = gateMode === 'new'
    ? 'Inventalo vos y pasáselo a la familia. Se escribe una sola vez en cada teléfono.'
    : 'Pedíselo a quien creó la libreta. Se escribe una sola vez.';
  $('#gGo').textContent = gateMode === 'new' ? 'Crear el hogar' : 'Entrar';
});
$('#gGo').onclick = async () => {
  const code = $('#gCode').value.trim(), name = $('#gName').value.trim();
  const err = $('#gErr');
  err.hidden = true;
  if (code.length < 4) return show('El código tiene que tener al menos 4 caracteres.');
  if (!name) return show('Poné tu nombre para firmar los gastos.');
  $('#gGo').disabled = true; $('#gGo').innerHTML = '<span class="spin"></span> Entrando…';
  try {
    if (gateMode === 'new') await store.createHouse($('#gHouse').value.trim() || 'Mi casa', code, name);
    else await store.joinHouse(code, name);
    $('#gate').hidden = true; $('#app').hidden = false;
    render();
  } catch (e){ show(e.message); }
  finally { $('#gGo').disabled = false; $('#gGo').textContent = gateMode === 'new' ? 'Crear el hogar' : 'Entrar'; }
  function show(m){ err.textContent = m; err.hidden = false; }
};

/* ============================================================
   ARRANQUE
   ============================================================ */
$('#fDate').value = today();
$('#gateAvatar').innerHTML = cachitoSVG('feliz', 64);
store.subscribe(() => { if (!$('#app').hidden) render(); });

(async () => {
  try {
    const inside = await store.boot();
    if (inside){ $('#app').hidden = false; render(); notifyDue(); }
    else { $('#gate').hidden = false; }
  } catch (e){
    $('#gate').hidden = false;
    $('#gErr').textContent = e.message;
    $('#gErr').hidden = false;
  }
})();

if ('serviceWorker' in navigator)
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
