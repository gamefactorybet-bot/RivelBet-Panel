-- =========================================================
-- Cartera del cajero externo (mini-distribuidor)
--
-- Un externo te paga, vos le asignás fichas, y él las reparte a
-- SUS jugadores. No puede ver ni tocar la cartera de otro, ni las
-- cuentas del casino, ni las solicitudes del portal.
--
-- owner_staff_id: quién "tiene" al jugador. Lo pone el alta desde
-- el panel. El autorregistro del portal queda sin dueño (casa).
--
-- RLS: es_externo() es stable (una vez por query). El resto del
-- staff sigue viendo todo, para poder ayudar.
--
-- Aditivo y repetible. Después:  notify pgrst, 'reload schema';
-- =========================================================

alter table players
  add column if not exists owner_staff_id uuid references staff_profiles(id) on delete set null;

create index if not exists idx_players_owner on players (owner_staff_id)
  where owner_staff_id is not null;

comment on column players.owner_staff_id is
  'Cajero dueño de la cartera. Null = jugador de la casa (portal o alta vieja).';

-- Backfill: el created_by era el email del cajero.
update players p
set owner_staff_id = s.id
from staff_profiles s
where p.owner_staff_id is null
  and p.created_by is not null
  and lower(p.created_by) = lower(s.email);

create or replace function es_externo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select perfil = 'externo' from staff_profiles where id = auth.uid() and active = true),
    false
  );
$$;
grant execute on function es_externo() to anon, authenticated;

create or replace function jugador_de_cartera(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not es_externo()
      or exists (
        select 1 from players
        where id = p_player_id and owner_staff_id = auth.uid()
      );
$$;
grant execute on function jugador_de_cartera(uuid) to anon, authenticated;

drop policy if exists "staff autenticado lee jugadores" on players;
create policy "staff autenticado lee jugadores"
  on players for select using (
    es_staff() and (not es_externo() or owner_staff_id = auth.uid())
  );

drop policy if exists "staff autenticado lee movimientos" on balance_transactions;
create policy "staff autenticado lee movimientos"
  on balance_transactions for select using (
    es_staff() and jugador_de_cartera(player_id)
  );

drop policy if exists "staff autenticado lee solicitudes" on withdrawal_requests;
create policy "staff autenticado lee solicitudes"
  on withdrawal_requests for select using (
    es_staff() and jugador_de_cartera(player_id)
  );

drop policy if exists "staff autenticado lee cargas" on deposit_requests;
create policy "staff autenticado lee cargas"
  on deposit_requests for select using (
    es_staff() and jugador_de_cartera(player_id)
  );

drop policy if exists "staff autenticado lee rondas" on game_rounds;
create policy "staff autenticado lee rondas"
  on game_rounds for select using (
    es_staff() and jugador_de_cartera(player_id)
  );

drop policy if exists "staff autenticado lee historial de bans" on ban_history;
create policy "staff autenticado lee historial de bans"
  on ban_history for select using (
    es_staff() and jugador_de_cartera(player_id)
  );

drop policy if exists "staff autenticado lee tickets" on soporte_tickets;
create policy "staff autenticado lee tickets"
  on soporte_tickets for select using (
    es_staff() and jugador_de_cartera(player_id)
  );

drop policy if exists "staff lee notas del jugador" on player_notas;
create policy "staff lee notas del jugador"
  on player_notas for select using (
    es_staff() and jugador_de_cartera(player_id)
  );

notify pgrst, 'reload schema';
