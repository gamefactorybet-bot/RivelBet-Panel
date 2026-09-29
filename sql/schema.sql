-- =========================================================
-- Panel de Caja Multi-País (Win777 / Gana777) — Schema completo
-- Proyecto Supabase nuevo e independiente.
-- Ejecutar los archivos de sql/ en orden numérico.
-- =========================================================

-- ---------------------------------------------------------
-- 1. staff_profiles — cajeros y admins (vinculado a Supabase Auth)
-- ---------------------------------------------------------
create table if not exists staff_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text not null,
  role         text not null check (role in ('admin', 'cajero')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 2. players — usuarios del casino
--    player_number: ID corto y secuencial que arranca en 1.
--    Es el que ve y usa el cajero para buscar; el uuid queda
--    para las relaciones internas.
-- ---------------------------------------------------------
create sequence if not exists player_number_seq start 1;

create table if not exists players (
  id             uuid primary key default gen_random_uuid(),
  player_number  int not null unique default nextval('player_number_seq'),
  username       text not null unique,
  display_name   text,
  password_hash  text not null,
  balance        numeric(14,2) not null default 0 check (balance >= 0),

  -- Los tres bans son independientes entre sí.
  ban_recargas   boolean not null default false,
  ban_retiros    boolean not null default false,
  ban_permanente boolean not null default false,
  ban_motivo     text,
  ban_updated_by text,
  ban_updated_at timestamptz,

  created_by     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_players_username on players (username);
create index if not exists idx_players_number on players (player_number);

-- ---------------------------------------------------------
-- 3. balance_transactions — libro de movimientos
--    Nunca se borra ni se actualiza, solo se inserta.
-- ---------------------------------------------------------
create table if not exists balance_transactions (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references players(id) on delete restrict,
  type           text not null check (type in ('carga', 'retiro')),
  amount         numeric(14,2) not null check (amount > 0),
  balance_before numeric(14,2) not null,
  balance_after  numeric(14,2) not null,
  note           text,
  created_by     text not null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_tx_player_created on balance_transactions (player_id, created_at desc);
create index if not exists idx_tx_created on balance_transactions (created_at desc);

-- ---------------------------------------------------------
-- 4. Función atómica: carga o retiro de saldo
--    - Bloquea la fila del jugador (FOR UPDATE) para que dos
--      cajeros tocando al mismo usuario a la vez no se pisen
--    - Valida los bans acá adentro, no solo en la UI: aunque
--      alguien llame la API salteándose la pantalla, el ban
--      igual frena la operación
--    - Valida que el retiro no deje saldo negativo
--    - Inserta el movimiento en el mismo paso (todo o nada)
-- ---------------------------------------------------------
create or replace function wallet_movimiento(
  p_player_id  uuid,
  p_type       text,
  p_amount     numeric,
  p_note       text,
  p_created_by text
)
returns balance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player         players;
  v_balance_after  numeric;
  v_tx             balance_transactions;
begin
  if p_type not in ('carga', 'retiro') then
    raise exception 'Tipo de movimiento inválido: %', p_type;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;

  select * into v_player
  from players
  where id = p_player_id
  for update;

  if not found then
    raise exception 'Jugador no encontrado';
  end if;

  if v_player.ban_permanente then
    raise exception 'El jugador tiene ban permanente';
  end if;

  if p_type = 'carga' and v_player.ban_recargas then
    raise exception 'El jugador tiene ban de recargas';
  end if;

  if p_type = 'retiro' and v_player.ban_retiros then
    raise exception 'El jugador tiene ban de retiros';
  end if;

  if p_type = 'carga' then
    v_balance_after := v_player.balance + p_amount;
  else
    v_balance_after := v_player.balance - p_amount;
    if v_balance_after < 0 then
      raise exception 'Saldo insuficiente (actual: %, retiro: %)', v_player.balance, p_amount;
    end if;
  end if;

  update players set balance = v_balance_after where id = p_player_id;

  insert into balance_transactions
    (player_id, type, amount, balance_before, balance_after, note, created_by)
  values
    (p_player_id, p_type, p_amount, v_player.balance, v_balance_after, p_note, p_created_by)
  returning * into v_tx;

  return v_tx;
end;
$$;

-- ---------------------------------------------------------
-- 5. Row Level Security
--    Las escrituras van SIEMPRE por Service Role desde /api.
--    Acá solo habilitamos LECTURA para el staff logueado.
-- ---------------------------------------------------------
alter table staff_profiles enable row level security;
alter table players enable row level security;
alter table balance_transactions enable row level security;

drop policy if exists "staff lee su propio perfil" on staff_profiles;

create policy "staff lee su propio perfil"
  on staff_profiles for select
  using (auth.uid() = id);

drop policy if exists "staff autenticado lee jugadores" on players;

create policy "staff autenticado lee jugadores"
  on players for select
  using (
    exists (
      select 1 from staff_profiles sp
      where sp.id = auth.uid() and sp.active = true
    )
  );

drop policy if exists "staff autenticado lee movimientos" on balance_transactions;

create policy "staff autenticado lee movimientos"
  on balance_transactions for select
  using (
    exists (
      select 1 from staff_profiles sp
      where sp.id = auth.uid() and sp.active = true
    )
  );
