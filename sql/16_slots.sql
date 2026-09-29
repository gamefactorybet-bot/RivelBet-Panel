-- =========================================================
-- Catálogo de juegos y rondas de slot
-- =========================================================

create table if not exists games (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- 'fortune', 'gems', 'hot7'
  nombre      text not null,
  descripcion text,
  imagen_url  text,
  categoria   text not null default 'Populares',
  min_bet     numeric(14,2) not null default 1000,
  max_bet     numeric(14,2) not null default 100000,
  activo      boolean not null default true,
  orden       int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_games_activos on games (activo, orden);

alter table games enable row level security;

drop policy if exists "cualquiera lee juegos activos" on games;
create policy "cualquiera lee juegos activos"
  on games for select
  using (activo = true);

-- ---------------------------------------------------------
-- Rondas jugadas
-- No van a balance_transactions: ese libro es de la caja (cargas y
-- retiros) y miles de giros por día lo volverían ilegible. Acá queda
-- el detalle de cada jugada, con el saldo antes y después.
-- ---------------------------------------------------------
create table if not exists game_rounds (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references players(id) on delete cascade,
  game_slug      text not null,
  bet            numeric(14,2) not null check (bet > 0),
  win            numeric(14,2) not null default 0 check (win >= 0),
  balance_before numeric(14,2) not null,
  balance_after  numeric(14,2) not null,
  detalle        jsonb,                       -- símbolos, línea, multiplicador
  created_at     timestamptz not null default now()
);

create index if not exists idx_rounds_player on game_rounds (player_id, created_at desc);
create index if not exists idx_rounds_created on game_rounds (created_at desc);

alter table game_rounds enable row level security;

drop policy if exists "staff autenticado lee rondas" on game_rounds;
create policy "staff autenticado lee rondas"
  on game_rounds for select
  using (
    exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.active = true)
  );

-- ---------------------------------------------------------
-- Resolver una jugada de forma atómica
-- Bloquea al jugador, valida saldo y bans, descuenta la apuesta,
-- acredita el premio y deja la ronda registrada, todo o nada.
--
-- El resultado (win) lo calcula el servidor ANTES de llamar a esta
-- función. La función no decide si ganó: solo mueve el saldo.
-- ---------------------------------------------------------
create or replace function slot_jugada(
  p_player_id uuid,
  p_game_slug text,
  p_bet       numeric,
  p_win       numeric,
  p_detalle   jsonb
)
returns game_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player  players;
  v_after   numeric;
  v_ronda   game_rounds;
begin
  if p_bet is null or p_bet <= 0 then
    raise exception 'La apuesta debe ser mayor a 0';
  end if;

  select * into v_player from players where id = p_player_id for update;

  if not found then
    raise exception 'Jugador no encontrado';
  end if;

  if v_player.ban_permanente then
    raise exception 'Tu cuenta está suspendida';
  end if;

  if v_player.balance < p_bet then
    raise exception 'Saldo insuficiente';
  end if;

  v_after := v_player.balance - p_bet + coalesce(p_win, 0);

  update players set balance = v_after where id = p_player_id;

  insert into game_rounds
    (player_id, game_slug, bet, win, balance_before, balance_after, detalle)
  values
    (p_player_id, p_game_slug, p_bet, coalesce(p_win, 0), v_player.balance, v_after, p_detalle)
  returning * into v_ronda;

  return v_ronda;
end;
$$;

-- ---------------------------------------------------------
-- Juegos iniciales
-- ---------------------------------------------------------
insert into games (slug, nombre, descripcion, categoria, orden, min_bet, max_bet)
values
  ('fortune', 'Fortune', 'Clásico de 3 rodillos con comodín', 'Populares', 0, 1000, 100000),
  ('gems',    'Gems',    'Piedras preciosas, 3 rodillos',      'Populares', 1, 1000, 100000),
  ('hot7',    'Hot 7',   'Frutas y sietes ardientes',          'Populares', 2, 1000, 100000)
on conflict (slug) do nothing;
