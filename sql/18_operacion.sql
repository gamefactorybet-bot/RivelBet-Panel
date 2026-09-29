-- =========================================================
-- Operación: lo que un casino real no puede no tener
--   1. Zona horaria local para los cortes del día
--   2. Anulación de movimientos con contraasiento
--   3. Idempotencia en los giros
--   4. Cierre de caja por cajero
--   5. Freno a la fuerza bruta en el login
-- =========================================================


-- ---------------------------------------------------------
-- 1. ZONA HORARIA
--
-- date_trunc('day', now()) corre en la zona del servidor, que es UTC.
-- En Paraguay eso significa que el "día" del sistema arranca a las
-- 20:00 hora local: el arqueo del lunes mezclaría la noche del
-- domingo. Todos los cortes tienen que usar la hora local.
-- ---------------------------------------------------------

alter table casino_settings
  add column if not exists zona_horaria text not null default 'America/Asuncion';

comment on column casino_settings.zona_horaria is
  'Zona IANA para los cortes del día: America/Asuncion, America/Argentina/Buenos_Aires, etc.';

create or replace function zona_casino()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select zona_horaria from casino_settings where id = 1), 'America/Asuncion');
$$;

/**
 * Comienzo del período en hora local, devuelto como timestamptz.
 * p_unidad: 'day' | 'week' | 'month'
 */
create or replace function inicio_periodo(p_unidad text default 'day')
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select (date_trunc(p_unidad, (now() at time zone zona_casino())) at time zone zona_casino());
$$;

grant execute on function zona_casino(), inicio_periodo(text) to anon, authenticated;

-- La rotación de cuentas usaba el día en UTC: se corrige acá.
create or replace function stats_cuentas()
returns table (account_id uuid, recibido numeric, usos bigint, ultimo_uso timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reinicio text;
  v_desde    timestamptz;
begin
  select rotacion_reinicio into v_reinicio from casino_settings where id = 1;

  v_desde := case coalesce(v_reinicio, 'diario')
    when 'diario'  then inicio_periodo('day')
    when 'mensual' then inicio_periodo('month')
    else '-infinity'::timestamptz
  end;

  return query
  select ba.id, coalesce(sum(dr.amount), 0)::numeric, count(dr.id)::bigint, max(dr.resuelto_at)
  from bank_accounts ba
  left join deposit_requests dr
    on dr.account_id = ba.id and dr.estado = 'aprobado' and dr.resuelto_at >= v_desde
  where ba.activa = true
  group by ba.id;
end;
$$;


-- ---------------------------------------------------------
-- 2. ANULACIÓN DE MOVIMIENTOS
--
-- Un cajero se equivoca de jugador o de monto: pasa y va a pasar.
-- La corrección NUNCA es editar o borrar el asiento original — eso
-- destruye la auditoría. Se hace un contraasiento: un movimiento
-- inverso que deja los dos visibles y registra quién lo autorizó.
-- ---------------------------------------------------------

alter table balance_transactions
  add column if not exists anula_a    uuid references balance_transactions(id),
  add column if not exists anulada    boolean not null default false,
  add column if not exists anulada_por text,
  add column if not exists anulada_at timestamptz;

create index if not exists idx_bt_anula on balance_transactions (anula_a) where anula_a is not null;

create or replace function anular_movimiento(
  p_tx_id      uuid,
  p_created_by text,
  p_motivo     text
)
returns balance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig    balance_transactions;
  v_player  players;
  v_after   numeric;
  v_inversa balance_transactions;
  v_tipo    text;
begin
  select * into v_orig from balance_transactions where id = p_tx_id for update;

  if not found then
    raise exception 'Movimiento no encontrado';
  end if;

  if v_orig.anulada then
    raise exception 'Ese movimiento ya fue anulado';
  end if;

  if v_orig.anula_a is not null then
    raise exception 'No se puede anular una anulación';
  end if;

  -- Una carga se revierte con un retiro y viceversa
  v_tipo := case when v_orig.type = 'carga' then 'retiro' else 'carga' end;

  select * into v_player from players where id = v_orig.player_id for update;

  v_after := case when v_tipo = 'carga'
    then v_player.balance + v_orig.amount
    else v_player.balance - v_orig.amount
  end;

  -- Si el jugador ya gastó la plata mal acreditada, el saldo quedaría
  -- negativo. Preferimos frenar y que un humano decida qué hacer.
  if v_after < 0 then
    raise exception 'El jugador ya no tiene ese saldo (actual %, hay que revertir %)',
      v_player.balance, v_orig.amount;
  end if;

  update players set balance = v_after where id = v_orig.player_id;

  insert into balance_transactions
    (player_id, type, amount, balance_before, balance_after, note, created_by, anula_a)
  values
    (v_orig.player_id, v_tipo, v_orig.amount, v_player.balance, v_after,
     'Anulación: ' || coalesce(p_motivo, 'sin motivo'), p_created_by, v_orig.id)
  returning * into v_inversa;

  update balance_transactions
  set anulada = true, anulada_por = p_created_by, anulada_at = now()
  where id = p_tx_id;

  return v_inversa;
end;
$$;


-- ---------------------------------------------------------
-- 3. IDEMPOTENCIA EN LOS GIROS
--
-- Si al jugador se le corta internet justo después de apostar, o
-- toca dos veces el botón, hoy se le descuenta dos veces. El cliente
-- manda un identificador único por giro; si ya lo procesamos,
-- devolvemos la ronda que ya existe en vez de cobrar de nuevo.
-- ---------------------------------------------------------

alter table game_rounds
  add column if not exists client_id text;

create unique index if not exists idx_rounds_client
  on game_rounds (player_id, client_id)
  where client_id is not null;

create or replace function slot_jugada(
  p_player_id uuid,
  p_game_slug text,
  p_bet       numeric,
  p_win       numeric,
  p_detalle   jsonb,
  p_client_id text default null
)
returns game_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player players;
  v_after  numeric;
  v_ronda  game_rounds;
begin
  -- ¿Este giro ya fue procesado? Devolvemos el resultado original.
  if p_client_id is not null then
    select * into v_ronda
    from game_rounds
    where player_id = p_player_id and client_id = p_client_id;

    if found then
      return v_ronda;
    end if;
  end if;

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
    (player_id, game_slug, bet, win, balance_before, balance_after, detalle, client_id)
  values
    (p_player_id, p_game_slug, p_bet, coalesce(p_win, 0), v_player.balance, v_after, p_detalle, p_client_id)
  returning * into v_ronda;

  return v_ronda;
end;
$$;


-- ---------------------------------------------------------
-- 4. CIERRE DE CAJA
--
-- Cuánto movió cada cajero en un período: es lo primero que pide
-- alguien que trabaja en una caja de verdad.
-- ---------------------------------------------------------

create or replace function cierre_caja(
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns table (
  cajero            text,
  cargas_cantidad   bigint,
  cargas_monto      numeric,
  retiros_cantidad  bigint,
  retiros_monto     numeric,
  anulaciones       bigint,
  neto              numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with rango as (
    select
      coalesce(p_desde, inicio_periodo('day')) as desde,
      coalesce(p_hasta, now()) as hasta
  )
  select
    bt.created_by,
    count(*) filter (where bt.type = 'carga'  and bt.anula_a is null),
    coalesce(sum(bt.amount) filter (where bt.type = 'carga'  and bt.anula_a is null), 0),
    count(*) filter (where bt.type = 'retiro' and bt.anula_a is null),
    coalesce(sum(bt.amount) filter (where bt.type = 'retiro' and bt.anula_a is null), 0),
    count(*) filter (where bt.anula_a is not null),
    -- Neto: lo que entró de fichas menos lo que salió. Es lo que el
    -- cajero debería tener de más en efectivo al cerrar.
    coalesce(sum(case when bt.type = 'carga' then bt.amount else -bt.amount end), 0)
  from balance_transactions bt, rango r
  where bt.created_at >= r.desde and bt.created_at <= r.hasta
  group by bt.created_by
  order by bt.created_by;
$$;


-- ---------------------------------------------------------
-- 5. FRENO A LA FUERZA BRUTA
--
-- Hoy se pueden probar contraseñas sin límite. Con usuarios cortos
-- y contraseñas de 6 caracteres es cuestión de tiempo.
-- ---------------------------------------------------------

create table if not exists login_attempts (
  id         bigserial primary key,
  username   text not null,
  ip         text,
  exitoso    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_intentos_user on login_attempts (username, created_at desc);
create index if not exists idx_intentos_ip on login_attempts (ip, created_at desc);

alter table login_attempts enable row level security;

drop policy if exists "staff autenticado lee intentos" on login_attempts;
create policy "staff autenticado lee intentos"
  on login_attempts for select using (es_staff());

/**
 * ¿Está bloqueado? Cinco fallos en 15 minutos por usuario, o veinte
 * por IP (para el caso de alguien probando muchos usuarios distintos).
 * Un login exitoso limpia el contador de ese usuario.
 */
create or replace function login_bloqueado(p_username text, p_ip text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde  timestamptz := now() - interval '15 minutes';
  v_ultimo timestamptz;
  v_user   int;
  v_ip     int;
begin
  select max(created_at) into v_ultimo
  from login_attempts
  where username = p_username and exitoso = true;

  select count(*) into v_user
  from login_attempts
  where username = p_username
    and exitoso = false
    and created_at >= greatest(v_desde, coalesce(v_ultimo, v_desde));

  if v_user >= 5 then return true; end if;

  if p_ip is not null then
    select count(*) into v_ip
    from login_attempts
    where ip = p_ip and exitoso = false and created_at >= v_desde;

    if v_ip >= 20 then return true; end if;
  end if;

  return false;
end;
$$;

/** Limpieza: los intentos viejos no sirven para nada. */
create or replace function limpiar_intentos()
returns void
language sql
security definer
set search_path = public
as $$
  delete from login_attempts where created_at < now() - interval '7 days';
$$;
