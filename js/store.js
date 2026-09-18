/* ============================================================
   store.js — todo lo que toca datos.
   Supabase para la nube, IndexedDB para el caché y la cola offline.
   El resto de la app no sabe que Supabase existe.
   ============================================================ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const HOUSE_KEY = 'libreta.household';
const NAME_KEY  = 'libreta.member';
export const state = {
  online: navigator.onLine,
  ready: false,
  householdId: null,
  householdName: '',
  memberName: '',
  members: [],
  settings: { budget:0, income:0, usd_rate:1, card_close_day:0,
    categories:['Supermercado','Servicios','Casa','Transporte','Salud','Educación','Ocio','Ropa','Otros'] },
  fixed: [],
  payments: {},          // 'fixedId|YYYY-MM' -> true
  expenses: [],
  goals: [],
  contributions: [],
  queue: 0
};

let sb = null;
let onChange = () => {};
export function subscribe(fn){ onChange = fn; }
function emit(){ onChange(state); }

/* ------------------------------------------------------------
   IndexedDB mínimo: dos almacenes, 'cache' y 'queue'.
   ------------------------------------------------------------ */
let dbp = null;
function idb(){
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('libreta', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache');
      if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath:'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror  = () => rej(r.error);
  });
  return dbp;
}
async function idbPut(store, value, key){
  const d = await idb();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readwrite');
    const rq = key === undefined ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
}
async function idbGet(store, key){
  const d = await idb();
  return new Promise((res, rej) => {
    const rq = d.transaction(store).objectStore(store).get(key);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
}
async function idbAll(store){
  const d = await idb();
  return new Promise((res, rej) => {
    const rq = d.transaction(store).objectStore(store).getAll();
    rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error);
  });
}
async function idbDel(store, key){
  const d = await idb();
  return new Promise((res, rej) => {
    const rq = d.transaction(store, 'readwrite').objectStore(store).delete(key);
    rq.onsuccess = () => res(); rq.onerror = () => rej(rq.error);
  });
}

/* ------------------------------------------------------------
   Arranque
   ------------------------------------------------------------ */
export async function boot(){
  const cached = await idbGet('cache', 'state').catch(() => null);
  if (cached) Object.assign(state, cached, { ready:false, online:navigator.onLine });
  state.memberName = localStorage.getItem(NAME_KEY) || state.memberName || '';
  state.householdId = localStorage.getItem(HOUSE_KEY) || null;
  await refreshQueueCount();
  emit();

  if (!window.supabase) throw new Error('No cargó la librería de Supabase');
  if (!/^https:\/\/.+\.supabase\.co/.test(SUPABASE_URL))
    throw new Error('Falta configurar js/config.js con los datos de tu proyecto');

  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession:true, autoRefreshToken:true }
  });

  let { data:{ session } } = await sb.auth.getSession();
  if (!session) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) throw new Error('No se pudo iniciar sesión: ' + error.message
      + '. ¿Activaste "Anonymous sign-ins" en Supabase?');
    session = data.session;
  }

  if (state.householdId) {
    await loadAll();
    listen();
    flush();
  }
  state.ready = true;
  emit();
  return !!state.householdId;
}

export function isConfigured(){
  return /^https:\/\/.+\.supabase\.co/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
}

/* ------------------------------------------------------------
   Entrar / crear hogar
   ------------------------------------------------------------ */
export async function createHouse(name, code, displayName){
  const { data, error } = await sb.rpc('create_household',
    { p_name:name, p_code:code, p_display_name:displayName });
  if (error) throw new Error(error.message);
  await settle(data, displayName);
}
export async function joinHouse(code, displayName){
  const { data, error } = await sb.rpc('join_household',
    { p_code:code, p_display_name:displayName });
  if (error) throw new Error(
    /ningún hogar/i.test(error.message) ? 'Ese código no existe. Fijate mayúsculas y espacios.' : error.message);
  await settle(data, displayName);
}
async function settle(id, displayName){
  state.householdId = id;
  state.memberName = displayName;
  localStorage.setItem(HOUSE_KEY, id);
  localStorage.setItem(NAME_KEY, displayName);
  await loadAll();
  listen();
  emit();
}
export async function leaveHouse(){
  localStorage.removeItem(HOUSE_KEY);
  await idbDel('cache','state').catch(()=>{});
  location.reload();
}
export async function changeCode(newCode){
  const { error } = await sb.rpc('change_household_code',
    { p_household_id: state.householdId, p_new_code: newCode });
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------
   Lectura
   ------------------------------------------------------------ */
const since = () => {
  const d = new Date(); d.setMonth(d.getMonth() - 13); d.setDate(1);
  return d.toISOString().slice(0,10);
};

export async function loadAll(){
  if (!sb || !state.householdId || !navigator.onLine) return;
  const h = state.householdId;
  const [house, mem, set, fx, pay, exp, gl, con] = await Promise.all([
    sb.from('households').select('name').eq('id', h).maybeSingle(),
    sb.from('household_members').select('display_name,user_id').eq('household_id', h),
    sb.from('settings').select('*').eq('household_id', h).maybeSingle(),
    sb.from('fixed_expenses').select('*').eq('household_id', h),
    sb.from('fixed_payments').select('fixed_id,month').eq('household_id', h),
    sb.from('expenses').select('*').eq('household_id', h).gte('spent_on', since()).order('spent_on',{ascending:false}),
    sb.from('goals').select('*').eq('household_id', h).order('created_at'),
    sb.from('goal_contributions').select('*').eq('household_id', h).order('created_at',{ascending:false})
  ]);
  const err = [house,mem,set,fx,pay,exp,gl,con].find(r => r.error);
  if (err) { console.warn('Error leyendo', err.error); return; }

  state.householdName = house.data?.name || 'Mi casa';
  state.members = (mem.data || []).map(m => m.display_name);
  if (set.data) state.settings = {
    budget:+set.data.budget || 0, income:+set.data.income || 0,
    usd_rate:+set.data.usd_rate || 1, card_close_day:+set.data.card_close_day || 0,
    categories: Array.isArray(set.data.categories) && set.data.categories.length
      ? set.data.categories : state.settings.categories
  };
  state.fixed = fx.data || [];
  state.payments = {};
  (pay.data || []).forEach(p => { state.payments[p.fixed_id + '|' + p.month] = true; });
  state.expenses = exp.data || [];
  state.goals = gl.data || [];
  state.contributions = con.data || [];
  await idbPut('cache', snapshot(), 'state');
  emit();
}
function snapshot(){
  const { online, ready, queue, ...rest } = state;
  return JSON.parse(JSON.stringify(rest));
}

/* ------------------------------------------------------------
   Realtime
   ------------------------------------------------------------ */
let channel = null, tmr = null;
function listen(){
  if (!sb || channel || !state.householdId) return;
  const soon = () => { clearTimeout(tmr); tmr = setTimeout(loadAll, 350); };
  channel = sb.channel('casa:' + state.householdId);
  ['expenses','fixed_expenses','fixed_payments','settings','goals','goal_contributions','household_members']
    .forEach(t => channel.on('postgres_changes',
      { event:'*', schema:'public', table:t, filter:'household_id=eq.' + state.householdId }, soon));
  channel.subscribe();
}

/* ------------------------------------------------------------
   Cola offline: toda escritura pasa por acá.
   Si hay internet se manda al toque; si no, queda guardada
   y se sube sola cuando vuelve.
   ------------------------------------------------------------ */
async function refreshQueueCount(){
  state.queue = (await idbAll('queue').catch(() => [])).length;
}

async function enqueue(op){
  op.id = op.id || (Date.now() + '-' + Math.random().toString(36).slice(2,8));
  op.at = Date.now();
  await idbPut('queue', op);
  await refreshQueueCount();
  emit();
  if (navigator.onLine) flush();
}

let flushing = false;
export async function flush(){
  if (flushing || !sb || !navigator.onLine || !state.householdId) return;
  flushing = true;
  try {
    const ops = (await idbAll('queue')).sort((a,b) => a.at - b.at);
    for (const op of ops) {
      try { await run(op); await idbDel('queue', op.id); }
      catch (e) {
        // 4xx = la operación está mal, no sirve reintentar: la descartamos.
        if (e && e.permanent) { await idbDel('queue', op.id); console.warn('Descartada', op, e); }
        else break;  // problema de red: dejamos el resto para después
      }
    }
    await refreshQueueCount();
    await loadAll();
  } finally { flushing = false; emit(); }
}

function fail(error){
  const e = new Error(error.message || 'error');
  e.permanent = !/fetch|network|timeout|failed/i.test(e.message);
  throw e;
}

async function run(op){
  const h = state.householdId;
  if (op.kind === 'expense.add') {
    let receipt_path = null;
    if (op.photo) {
      const path = `${h}/${op.id}.jpg`;
      const up = await sb.storage.from('receipts').upload(path, op.photo,
        { contentType: op.photo.type || 'image/jpeg', upsert:true });
      if (up.error) fail(up.error);
      receipt_path = path;
    }
    const r = await sb.from('expenses').insert({ ...op.row, household_id:h, receipt_path });
    if (r.error) fail(r.error);
  }
  else if (op.kind === 'expense.del') {
    if (op.receipt_path) await sb.storage.from('receipts').remove([op.receipt_path]).catch(()=>{});
    const r = await sb.from('expenses').delete().eq('id', op.id2).eq('household_id', h);
    if (r.error) fail(r.error);
  }
  else if (op.kind === 'fixed.add') {
    const r = await sb.from('fixed_expenses').insert({ ...op.row, household_id:h });
    if (r.error) fail(r.error);
  }
  else if (op.kind === 'fixed.upd') {
    const r = await sb.from('fixed_expenses').update(op.patch).eq('id', op.id2).eq('household_id', h);
    if (r.error) fail(r.error);
  }
  else if (op.kind === 'fixed.del') {
    const r = await sb.from('fixed_expenses').delete().eq('id', op.id2).eq('household_id', h);
    if (r.error) fail(r.error);
  }
  else if (op.kind === 'paid.set') {
    const r = op.value
      ? await sb.from('fixed_payments').upsert({ household_id:h, fixed_id:op.fixedId, month:op.month })
      : await sb.from('fixed_payments').delete().eq('fixed_id', op.fixedId).eq('month', op.month);
    if (r.error) fail(r.error);
  }
  else if (op.kind === 'settings.save') {
    const r = await sb.from('settings').upsert({ household_id:h, ...op.patch, updated_at:new Date().toISOString() });
    if (r.error) fail(r.error);
  }
  else if (op.kind === 'goal.add') {
    const r = await sb.from('goals').insert({ ...op.row, household_id:h });
    if (r.error) fail(r.error);
  }
  else if (op.kind === 'goal.update') {
    const r = await sb.from('goals').update(op.patch).eq('id', op.id2).eq('household_id', h);
    if (r.error) fail(r.error);
  }
  else if (op.kind === 'goal.del') {
    const r = await sb.from('goals').delete().eq('id', op.id2).eq('household_id', h);
    if (r.error) fail(r.error);
  }
  else if (op.kind === 'contrib.add') {
    const r = await sb.from('goal_contributions').insert({ ...op.row, household_id:h });
    if (r.error) fail(r.error);
  }
}

/* ------------------------------------------------------------
   API optimista: cambiamos el estado local y encolamos.
   La pantalla responde al instante, esté o no online.
   ------------------------------------------------------------ */
const tmpId = () => 'tmp-' + Math.random().toString(36).slice(2,10);

export function addExpense(row, photo){
  const local = { ...row, id: tmpId(), household_id: state.householdId, pending:true,
                  receipt_path: photo ? 'pending' : null };
  state.expenses = [local, ...state.expenses];
  emit();
  return enqueue({ kind:'expense.add', row, photo });
}
export function delExpense(id){
  const e = state.expenses.find(x => x.id === id);
  state.expenses = state.expenses.filter(x => x.id !== id);
  emit();
  if (!e || e.pending) return Promise.resolve();
  return enqueue({ kind:'expense.del', id2:id, receipt_path:e.receipt_path });
}
export function addFixed(row){
  state.fixed = [...state.fixed, { ...row, id: tmpId(), pending:true }];
  emit();
  return enqueue({ kind:'fixed.add', row });
}
export function updateFixed(id, patch){
  state.fixed = state.fixed.map(f => f.id === id ? { ...f, ...patch } : f);
  emit();
  return enqueue({ kind:'fixed.upd', id2:id, patch });
}
export function delFixed(id){
  state.fixed = state.fixed.filter(f => f.id !== id);
  emit();
  return enqueue({ kind:'fixed.del', id2:id });
}
export function setPaid(fixedId, month, value){
  const k = fixedId + '|' + month;
  if (value) state.payments[k] = true; else delete state.payments[k];
  emit();
  return enqueue({ kind:'paid.set', fixedId, month, value });
}
export function saveSettings(patch){
  state.settings = { ...state.settings, ...patch };
  emit();
  return enqueue({ kind:'settings.save', patch });
}
export function addGoal(row){
  state.goals = [...state.goals, { ...row, id: tmpId(), pending:true }];
  emit();
  return enqueue({ kind:'goal.add', row });
}
export function updateGoal(id, patch){
  state.goals = state.goals.map(g => g.id === id ? { ...g, ...patch } : g);
  emit();
  return enqueue({ kind:'goal.update', id2:id, patch });
}
export function delGoal(id){
  state.goals = state.goals.filter(g => g.id !== id);
  state.contributions = state.contributions.filter(c => c.goal_id !== id);
  emit();
  return enqueue({ kind:'goal.del', id2:id });
}
export function addContribution(row){
  state.contributions = [{ ...row, id: tmpId(), pending:true }, ...state.contributions];
  emit();
  return enqueue({ kind:'contrib.add', row });
}

/* Foto de comprobante: URL temporal firmada, válida una hora. */
export async function receiptUrl(path){
  if (!sb || !path || path === 'pending') return null;
  const { data } = await sb.storage.from('receipts').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

window.addEventListener('online',  () => { state.online = true;  emit(); flush(); });
window.addEventListener('offline', () => { state.online = false; emit(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && navigator.onLine) { flush(); loadAll(); }
});
