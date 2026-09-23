/* Supabase falso, en memoria, para probar la app sin backend real. */
(function(){
  const HID = '11111111-1111-1111-1111-111111111111';
  const now = new Date(), Y = now.getFullYear(), Mo = now.getMonth();
  const mk = n => { const d = new Date(Y, Mo+n, 1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); };
  const day = (k,d) => k+'-'+String(d).padStart(2,'0');
  let seq = 0; const id = () => 'id-' + (++seq);

  const DB = {
    households: [{ id:HID, name:'Casa de prueba' }],
    household_members: [{ household_id:HID, user_id:'u1', display_name:'Ana' },
                        { household_id:HID, user_id:'u2', display_name:'Bruno' }],
    settings: [{ household_id:HID, budget:0, income:3000000, usd_rate:1500, card_close_day:1,
      categories:['Supermercado','Kiosco','Panadería','Transporte','Salud','Educación','Servicios','Casa','Ocio','Ropa','Otros'] }],
    /* Datos INVENTADOS, sólo para probar la app. No son de nadie. */
    fixed_expenses: [
      ['Colegio de los chicos',200000,'ARS','Educación','comun'],
      ['Prepaga',180000,'ARS','Salud','comun'],
      ['Clases de inglés',60000,'ARS','Educación','comun'],
      ['Luz',45000,'ARS','Servicios','comun'],
      ['Gas',30000,'ARS','Servicios','comun'],
      ['Internet',40000,'ARS','Servicios','comun'],
      ['Streaming',10,'USD','Ocio','comun'],
      ['Nafta',100000,'ARS','Transporte','Ana'],
      ['Seguro del auto',50000,'ARS','Transporte','Ana'],
      ['Suscripción',15,'USD','Servicios','Ana'],
      ['Celular',15000,'ARS','Servicios','Ana'],
      ['Nafta',100000,'ARS','Transporte','Bruno'],
      ['Seguro de la moto',35000,'ARS','Transporte','Bruno'],
      ['Facultad',120000,'ARS','Educación','Bruno'],
      ['Gimnasio',25000,'ARS','Ocio','Bruno'],
      ['Celulares',30000,'ARS','Servicios','Bruno'],
      ['Gas (casa de campo)',20000,'ARS','Servicios','Casa de campo']
    ].map((r,i) => ({ id:'f'+i, household_id:HID, name:r[0], amount:r[1], currency:r[2],
                      category:r[3], owner:r[4], due_day:10, kind:'fijo', active_from:mk(-8) })),
    fixed_payments: [],
    expenses: [],
    goals: [
      { id:'g1', household_id:HID, name:'Viaje', emoji:'✈️', target_amount:5000, currency:'USD',
        monthly_plan:400, deadline:(Y+2)+'-01-15', created_at:new Date(Y,Mo-6,1).toISOString() },
      { id:'g2', household_id:HID, name:'Consola', emoji:'🎮', target_amount:500000, currency:'ARS',
        monthly_plan:90000, deadline:null, created_at:new Date(Y,Mo-3,1).toISOString() }
    ],
    goal_contributions: []
  };
  /* Una compra en cuotas de ejemplo (inventada). */
  DB.fixed_expenses.push({ id:'fc1', household_id:HID, name:'Heladera', amount:100000, currency:'ARS',
    category:'Casa', owner:'comun', due_day:10, kind:'cuota', cuotas:12, total:1200000,
    active_from:mk(-2), active_to:mk(9) });

  const lug = [['DASA','Supermercado'],['Imperio','Kiosco'],['Panadería','Panadería'],
               ['MaxiConsumo','Supermercado'],['Milhouse','Kiosco'],['Ruta 3','Kiosco'],
               ['Farmacia','Salud'],['Ferretería','Casa']];
  const notes = ['compra semanal','','','del mes','','','',''];
  for (let n = -5; n <= 0; n++){
    const k = mk(n), last = n === 0 ? Math.min(now.getDate(), 28) : 28, cnt = n === 0 ? 9 : 12;
    for (let i = 0; i < cnt; i++){
      const d = 1 + Math.floor(i * (last-1) / Math.max(cnt-1,1));
      const L = lug[(i+n+8)%lug.length];
      DB.expenses.push({ id:id(), household_id:HID, amount:Math.round((9000 + Math.abs((i*7919+(n+12)*104729)%62000))/500)*500,
        currency:'ARS', category:L[1], place:L[0], member_name: i%3 ? 'Ana':'Bruno',
        note: notes[(i+n+8)%notes.length], spent_on: day(k,d), receipt_path: null,
        created_at: new Date(k+'-'+String(d).padStart(2,'0')+'T12:00:00').toISOString() });
    }
  }
  for (let n = -6; n <= 0; n++)
    DB.goal_contributions.push({ id:id(), household_id:HID, goal_id:'g1', amount:380, currency:'USD',
      member_name:'Ana', note:'ahorro del mes', created_at:new Date(Y,Mo+n,5).toISOString() });
  for (let n = -3; n <= 0; n++)
    DB.goal_contributions.push({ id:id(), household_id:HID, goal_id:'g2', amount:95000, currency:'ARS',
      member_name:'Bruno', note:'', created_at:new Date(Y,Mo+n,8).toISOString() });

  function builder(table){
    let rows = () => (DB[table] || []).slice();
    const filters = [];
    const q = {
      select(){ return q; },
      eq(f,v){ filters.push(r => String(r[f]) === String(v)); return q; },
      gte(f,v){ filters.push(r => String(r[f]) >= String(v)); return q; },
      order(f,o){ q._order = [f, o && o.ascending === false ? -1 : 1]; return q; },
      limit(){ return q; },
      maybeSingle(){ q._single = true; return q; },
      single(){ q._single = true; return q; },
      insert(v){ (Array.isArray(v)?v:[v]).forEach(x => DB[table].push({ id:id(), created_at:new Date().toISOString(), ...x }));
                 return Promise.resolve({ data:null, error:null }); },
      upsert(v){ const arr = Array.isArray(v)?v:[v];
        arr.forEach(x => { const i = (DB[table]||[]).findIndex(r =>
          (x.household_id ? r.household_id === x.household_id : true) &&
          (x.fixed_id ? r.fixed_id === x.fixed_id && r.month === x.month : true));
          if (i >= 0) DB[table][i] = { ...DB[table][i], ...x }; else DB[table].push({ id:id(), ...x }); });
        return Promise.resolve({ data:null, error:null }); },
      update(patch){ q._patch = patch; return q; },
      delete(){ q._del = true; return q; },
      then(res){
        let out = rows().filter(r => filters.every(f => f(r)));
        if (q._del){ DB[table] = (DB[table]||[]).filter(r => !filters.every(f => f(r))); return res({ data:null, error:null }); }
        if (q._patch){ out.forEach(r => Object.assign(r, q._patch)); return res({ data:null, error:null }); }
        if (q._order){ const [f,d] = q._order; out.sort((a,b) => String(a[f]).localeCompare(String(b[f]))*d); }
        return res({ data: q._single ? (out[0] || null) : out, error:null });
      }
    };
    return q;
  }

  window.supabase = {
    createClient(){
      return {
        auth: {
          getSession: async () => ({ data:{ session:{ user:{ id:'u1' } } } }),
          signInAnonymously: async () => ({ data:{ session:{ user:{ id:'u1' } } }, error:null })
        },
        rpc: async (fn, args) => {
          if (fn === 'create_household' || fn === 'join_household'){
            if (fn === 'join_household' && args.p_code !== 'casa2026')
              return { data:null, error:{ message:'Ese código no corresponde a ningún hogar' } };
            return { data:HID, error:null };
          }
          return { data:null, error:null };
        },
        from: builder,
        channel(){ const c = { on(){ return c; }, subscribe(){ return c; } }; return c; },
        storage: { from(){ return {
          upload: async () => ({ data:{}, error:null }),
          remove: async () => ({ data:{}, error:null }),
          createSignedUrl: async () => ({ data:{ signedUrl:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22400%22%3E%3Crect width=%22300%22 height=%22400%22 fill=%22%23eee%22/%3E%3Ctext x=%22150%22 y=%22200%22 text-anchor=%22middle%22%3Eticket%3C/text%3E%3C/svg%3E' } })
        }; } }
      };
    }
  };
  window.__MOCK_HID = HID;
})();
