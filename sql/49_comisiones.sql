-- =========================================================
-- Comisión del externo comisionista
-- Se acredita cuando la casa APRUEBA una carga de un jugador
-- de su cartera. No se acredita en retiros ni en pedidos.
-- =========================================================

create table if not exists staff_comisiones (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff_profiles(id) on delete cascade,
  player_id  uuid references players(id) on delete set null,
  deposit_id uuid unique references deposit_requests(id) on delete set null,
  carga      numeric(14,2) not null check (carga > 0),
  pct        numeric(5,2) not null check (pct >= 0 and pct <= 100),
  monto      numeric(14,2) not null check (monto >= 0),
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_comisiones_staff on staff_comisiones (staff_id, created_at desc);

alter table staff_comisiones enable row level security;
drop policy if exists "staff lee comisiones" on staff_comisiones;
create policy "staff lee comisiones"
  on staff_comisiones for select using (es_staff());

create or replace function acreditar_comision_carga(
  p_player_id  uuid,
  p_deposit_id uuid,
  p_carga      numeric,
  p_created_by text
)
returns staff_comisiones
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_modo  text;
  v_pct   numeric;
  v_row   staff_comisiones;
begin
  if p_carga is null or p_carga <= 0 then return null; end if;

  select owner_staff_id into v_owner from players where id = p_player_id;
  if v_owner is null then return null; end if;

  select externo_modo, comision_pct into v_modo, v_pct
  from staff_profiles
  where id = v_owner and perfil = 'externo' and active = true;

  if v_modo is distinct from 'comisionista' then return null; end if;
  if coalesce(v_pct, 0) <= 0 then return null; end if;

  insert into staff_comisiones (staff_id, player_id, deposit_id, carga, pct, monto, created_by)
  values (v_owner, p_player_id, p_deposit_id, p_carga, v_pct, round(p_carga * v_pct / 100.0, 2), p_created_by)
  on conflict (deposit_id) do nothing
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function acreditar_comision_carga(uuid, uuid, numeric, text) to service_role;

notify pgrst, 'reload schema';
