-- ============================================================
--  Libreta de Casa — esquema completo para Supabase
--  Pegá TODO este archivo en el SQL Editor de Supabase y ejecutalo.
--  Es idempotente: podés volver a correrlo sin romper nada.
-- ============================================================

-- pgcrypto: en Supabase se instala en el esquema "extensions", no en "public".
-- Por eso las funciones que usan crypt() y gen_salt() llevan
-- "set search_path = public, extensions".
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Tablas
-- ------------------------------------------------------------

-- Un hogar = una familia. El código se guarda hasheado, nunca en texto plano.
create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code_hash   text not null,
  created_at  timestamptz not null default now()
);

-- Quién pertenece a qué hogar. Se llena cuando alguien entra con el código.
create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Preferencias del hogar (una fila por hogar).
create table if not exists settings (
  household_id uuid primary key references households(id) on delete cascade,
  budget       numeric(14,2) not null default 0,
  income       numeric(14,2) not null default 0,
  usd_rate     numeric(14,2) not null default 1,
  -- Día que cierra la tarjeta, para avisar antes y pagar los dólares en dólares.
  card_close_day int not null default 1 check (card_close_day between 1 and 31),
  categories   jsonb not null default
    '["Supermercado","Kiosco","Panadería","Transporte","Salud","Educación","Servicios","Casa","Ocio","Ropa","Otros"]'::jsonb,
  updated_at   timestamptz not null default now()
);

-- Gastos fijos: se cargan una vez y valen todos los meses.
create table if not exists fixed_expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null,
  amount       numeric(14,2) not null check (amount >= 0),
  currency     text not null default 'ARS' check (currency in ('ARS','USD')),
  category     text not null,
  due_day      int  not null default 1 check (due_day between 1 and 31),
  active_from  text not null,                    -- 'YYYY-MM'
  active_to    text,                             -- null = sigue vigente
  -- De quién es el gasto: 'comun' o el nombre de quien lo banca.
  owner        text not null default 'comun',
  created_at   timestamptz not null default now()
);

-- Marca de pagado, por gasto fijo y por mes.
create table if not exists fixed_payments (
  household_id uuid not null references households(id) on delete cascade,
  fixed_id     uuid not null references fixed_expenses(id) on delete cascade,
  month        text not null,                    -- 'YYYY-MM'
  paid_at      timestamptz not null default now(),
  primary key (fixed_id, month)
);

-- Gastos variables.
create table if not exists expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  amount       numeric(14,2) not null check (amount >= 0),
  currency     text not null default 'ARS' check (currency in ('ARS','USD')),
  category     text not null,
  member_name  text not null default '',
  note         text not null default '',
  spent_on     date not null default current_date,
  place        text not null default '',         -- DASA, Imperio, Panadería…
  receipt_path text,                             -- ruta dentro del bucket 'receipts'
  created_at   timestamptz not null default now()
);

-- Metas de ahorro.
create table if not exists goals (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  emoji         text not null default '🎯',
  target_amount numeric(14,2) not null check (target_amount > 0),
  currency      text not null default 'ARS' check (currency in ('ARS','USD')),
  deadline      date,
  monthly_plan  numeric(14,2) not null default 0,
  achieved_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- Cada vez que se pone plata en una meta.
create table if not exists goal_contributions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  goal_id      uuid not null references goals(id) on delete cascade,
  amount       numeric(14,2) not null,
  currency     text not null default 'ARS' check (currency in ('ARS','USD')),
  member_name  text not null default '',
  note         text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists expenses_house_date_idx  on expenses (household_id, spent_on desc);
create index if not exists fixed_house_idx          on fixed_expenses (household_id);
create index if not exists goals_house_idx          on goals (household_id);
create index if not exists contrib_goal_idx         on goal_contributions (goal_id, created_at desc);
create index if not exists members_user_idx         on household_members (user_id);

-- ------------------------------------------------------------
-- 2. Función auxiliar: hogares del usuario actual
-- ------------------------------------------------------------
create or replace function my_households()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from household_members where user_id = auth.uid();
$$;

-- ------------------------------------------------------------
-- 3. Row Level Security
--    Sin fila en household_members no se ve absolutamente nada.
--    La anon key sola no alcanza para leer un solo peso.
-- ------------------------------------------------------------
alter table households         enable row level security;
alter table household_members  enable row level security;
alter table settings           enable row level security;
alter table fixed_expenses     enable row level security;
alter table fixed_payments     enable row level security;
alter table expenses           enable row level security;
alter table goals              enable row level security;
alter table goal_contributions enable row level security;

do $$
declare t text;
begin
  -- households: sólo lectura del propio hogar (el alta va por función)
  execute 'drop policy if exists house_select on households';
  execute 'create policy house_select on households for select to authenticated
             using (id in (select my_households()))';

  -- household_members: ves a los integrantes de tu hogar
  execute 'drop policy if exists members_select on household_members';
  execute 'create policy members_select on household_members for select to authenticated
             using (household_id in (select my_households()))';
  execute 'drop policy if exists members_update on household_members';
  execute 'create policy members_update on household_members for update to authenticated
             using (user_id = auth.uid()) with check (user_id = auth.uid())';

  -- El resto: lectura y escritura completa dentro del hogar
  foreach t in array array['settings','fixed_expenses','fixed_payments',
                           'expenses','goals','goal_contributions']
  loop
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format(
      'create policy %I_all on %I for all to authenticated
         using (household_id in (select my_households()))
         with check (household_id in (select my_households()))', t, t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. Crear un hogar / unirse con el código
--    SECURITY DEFINER: son la única puerta de entrada.
-- ------------------------------------------------------------
create or replace function create_household(
  p_name text, p_code text, p_display_name text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Necesitás una sesión iniciada';
  end if;
  if length(coalesce(p_code,'')) < 4 then
    raise exception 'El código tiene que tener al menos 4 caracteres';
  end if;

  insert into households (name, code_hash)
  values (coalesce(nullif(trim(p_name),''),'Mi casa'), crypt(p_code, gen_salt('bf')))
  returning id into v_id;

  insert into household_members (household_id, user_id, display_name)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_display_name),''),'Yo'));

  insert into settings (household_id) values (v_id);
  return v_id;
end $$;

create or replace function join_household(
  p_code text, p_display_name text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Necesitás una sesión iniciada';
  end if;

  select id into v_id from households
   where code_hash = crypt(p_code, code_hash)
   limit 1;

  if v_id is null then
    raise exception 'Ese código no corresponde a ningún hogar';
  end if;

  insert into household_members (household_id, user_id, display_name)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_display_name),''),'Alguien'))
  on conflict (household_id, user_id)
    do update set display_name = excluded.display_name;

  return v_id;
end $$;

-- Cambiar el código del hogar (por si se filtró)
create or replace function change_household_code(
  p_household_id uuid, p_new_code text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from household_members
                  where household_id = p_household_id and user_id = auth.uid()) then
    raise exception 'No pertenecés a ese hogar';
  end if;
  if length(coalesce(p_new_code,'')) < 4 then
    raise exception 'El código tiene que tener al menos 4 caracteres';
  end if;
  update households set code_hash = crypt(p_new_code, gen_salt('bf'))
   where id = p_household_id;
end $$;

revoke all on function create_household(text,text,text)     from public, anon;
revoke all on function join_household(text,text)            from public, anon;
revoke all on function change_household_code(uuid,text)     from public, anon;
grant execute on function create_household(text,text,text)  to authenticated;
grant execute on function join_household(text,text)         to authenticated;
grant execute on function change_household_code(uuid,text)  to authenticated;

-- ------------------------------------------------------------
-- 4b. Permisos para la Data API
--     Por si el proyecto se creó con "Automatically expose new
--     tables" apagado: sin esto el cliente no ve las tablas.
--     Es seguro: RLS sigue decidiendo qué filas devuelve cada una.
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['households','household_members','settings',
                           'fixed_expenses','fixed_payments','expenses',
                           'goals','goal_contributions']
  loop
    execute format('grant select, insert, update, delete on table %I to authenticated', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. Realtime — para que los cambios se vean al instante
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['expenses','fixed_expenses','fixed_payments',
                           'settings','goals','goal_contributions','household_members']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 6. Bucket de comprobantes
--    Cada archivo se guarda como  <household_id>/<archivo>
--    y sólo lo ve quien pertenece a ese hogar.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts','receipts', false)
on conflict (id) do nothing;

drop policy if exists receipts_read   on storage.objects;
drop policy if exists receipts_write  on storage.objects;
drop policy if exists receipts_delete on storage.objects;

create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts'
         and (storage.foldername(name))[1]::uuid in (select my_households()));

create policy receipts_write on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts'
              and (storage.foldername(name))[1]::uuid in (select my_households()));

create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts'
         and (storage.foldername(name))[1]::uuid in (select my_households()));

-- Listo. Volvé al README y seguí con el paso 3.

-- ============================================================
-- Migración para bases que ya existían (2026-09-11)
-- ============================================================
alter table fixed_expenses add column if not exists owner text not null default 'comun';
alter table expenses       add column if not exists place text not null default '';
alter table settings       add column if not exists card_close_day int not null default 1;
create index if not exists expenses_place_idx on expenses (household_id, place);

-- ============================================================
-- Migración: compras en cuotas (2026-09-23)
-- Una compra en cuotas vive en fixed_expenses con kind = 'cuota':
-- amount es el valor de cada cuota, total el de la compra, cuotas la
-- cantidad, y active_from / active_to marcan la primera y la última.
-- ============================================================
alter table fixed_expenses add column if not exists kind text not null default 'fijo';
alter table fixed_expenses add column if not exists cuotas int;
alter table fixed_expenses add column if not exists total numeric(14,2);
do $$ begin
  alter table fixed_expenses add constraint fixed_kind_chk check (kind in ('fijo','cuota'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table fixed_expenses add constraint fixed_cuotas_chk
    check (kind = 'fijo' or (cuotas between 2 and 60 and active_to is not null));
exception when duplicate_object then null; end $$;
