-- =========================================================
-- Auto-refresh en vivo (portal y panel)
--
-- El problema: el jugador (y el cajero) tienen que refrescar a mano
-- para ver un cambio hecho desde otro lado.
--
-- La solución sin generar tráfico: un contador de versión que sube
-- por trigger cada vez que cambia algo. El cliente lo consulta cada
-- ~20 s (una llamada chiquita, ~80 bytes) y SOLO cuando el número
-- cambió hace el refetch pesado de verdad.
--
--  - portal_heartbeat: config global (settings, banners, bonos, juegos…)
--  - player_heartbeat: lo que le cambia a un jugador puntual
--  - staff_heartbeat:  novedades para el panel (solicitudes, KYC, cashback…)
--
-- Después de correr este archivo:  notify pgrst, 'reload schema';
-- =========================================================

-- Los dos solo guardan un entero sin sentido fuera de contexto: la
-- lectura pública es inofensiva y evita cualquier duda con RLS.
create table if not exists portal_heartbeat (
  id      boolean primary key default true check (id),
  version bigint not null default 0
);
insert into portal_heartbeat (id) values (true) on conflict (id) do nothing;
alter table portal_heartbeat enable row level security;
drop policy if exists "lectura del portal_heartbeat" on portal_heartbeat;
create policy "lectura del portal_heartbeat" on portal_heartbeat for select using (true);

create table if not exists player_heartbeat (
  player_id uuid primary key references players(id) on delete cascade,
  version   bigint not null default 0
);
alter table player_heartbeat enable row level security;
drop policy if exists "lectura del player_heartbeat" on player_heartbeat;
create policy "lectura del player_heartbeat" on player_heartbeat for select using (true);

create table if not exists staff_heartbeat (
  id      boolean primary key default true check (id),
  version bigint not null default 0
);
insert into staff_heartbeat (id) values (true) on conflict (id) do nothing;
alter table staff_heartbeat enable row level security;
drop policy if exists "staff lee staff_heartbeat" on staff_heartbeat;
create policy "staff lee staff_heartbeat" on staff_heartbeat for select using (es_staff());

-- ---------------------------------------------------------
-- Bumpers
-- ---------------------------------------------------------
create or replace function bump_portal_heartbeat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update portal_heartbeat set version = version + 1 where id;
  return null;
end $$;

create or replace function bump_staff_heartbeat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update staff_heartbeat set version = version + 1 where id;
  return null;
end $$;

create or replace function bump_player_heartbeat(p_player_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into player_heartbeat (player_id, version) values (p_player_id, 1)
  on conflict (player_id) do update set version = player_heartbeat.version + 1;
$$;

create or replace function trg_bump_ph_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform bump_player_heartbeat(coalesce(new.player_id, old.player_id));
  return null;
end $$;

create or replace function trg_bump_ph_player()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform bump_player_heartbeat(new.id);
  return null;
end $$;

-- ---------------------------------------------------------
-- Consulta del cliente: una sola llamada, dos enteros
-- ---------------------------------------------------------
create or replace function heartbeat(p_player_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'g', coalesce((select version from portal_heartbeat where id), 0),
    'p', coalesce((select version from player_heartbeat where player_id = p_player_id), 0)
  );
$$;
grant execute on function heartbeat(uuid) to anon, authenticated;

-- ---------------------------------------------------------
-- Triggers — portal (por statement: un bump por operación, no por fila)
-- ---------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'casino_settings','banners','bonos','bono_registro','cashback_config',
    'games','animaciones','bank_accounts'
  ] loop
    execute format('drop trigger if exists trg_hb_portal on %I', t);
    execute format(
      'create trigger trg_hb_portal after insert or update or delete on %I
       for each statement execute function bump_portal_heartbeat()', t);
  end loop;
end $$;

-- ---------------------------------------------------------
-- Triggers — jugador
-- ---------------------------------------------------------
drop trigger if exists trg_hb_player_bt on balance_transactions;
create trigger trg_hb_player_bt after insert on balance_transactions
  for each row execute function trg_bump_ph_row();

-- players: solo columnas "notables" (NO el saldo suelto — cada giro lo
-- toca y el cliente que juega ya sabe su saldo por la respuesta).
drop trigger if exists trg_hb_player_players on players;
create trigger trg_hb_player_players after update on players
  for each row
  when (
    old.ban_permanente     is distinct from new.ban_permanente or
    old.ban_recargas       is distinct from new.ban_recargas or
    old.ban_retiros        is distinct from new.ban_retiros or
    old.estado_verificacion is distinct from new.estado_verificacion or
    old.retiro_bloqueado   is distinct from new.retiro_bloqueado or
    old.bono_por_descontar is distinct from new.bono_por_descontar or
    old.balance_retenido   is distinct from new.balance_retenido or
    old.sesion_revocada_at is distinct from new.sesion_revocada_at
  )
  execute function trg_bump_ph_player();

do $$
declare t text;
begin
  foreach t in array array[
    'verificaciones','cashback_periodos','deposit_requests','withdrawal_requests','soporte_tickets'
  ] loop
    execute format('drop trigger if exists trg_hb_player_row on %I', t);
    execute format(
      'create trigger trg_hb_player_row after insert or update on %I
       for each row execute function trg_bump_ph_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------
-- Triggers — panel
-- ---------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'deposit_requests','withdrawal_requests','verificaciones','cashback_periodos',
    'soporte_tickets','ban_history'
  ] loop
    execute format('drop trigger if exists trg_hb_staff on %I', t);
    execute format(
      'create trigger trg_hb_staff after insert or update or delete on %I
       for each statement execute function bump_staff_heartbeat()', t);
  end loop;
end $$;

-- Jugadores: solo el alta (un nuevo registro), NO cada update — el
-- saldo se toca en cada giro y eso haría vibrar el panel sin motivo.
drop trigger if exists trg_hb_staff on players;
drop trigger if exists trg_hb_staff_players on players;
create trigger trg_hb_staff_players after insert on players
  for each statement execute function bump_staff_heartbeat();
