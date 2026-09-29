-- =========================================================
-- Retiros: método de cobro + resguardo de saldo mientras está
-- pendiente.
--
-- Antes: el jugador solo indicaba un monto, y el saldo se tocaba
-- recién cuando el cajero aprobaba. Eso dejaba una ventana donde el
-- jugador podía seguir jugando con fichas que ya había pedido retirar.
--
-- Ahora: al solicitar, las fichas se descuentan del saldo jugable de
-- una y pasan a "balance_retenido" (en proceso de retiro). Si el
-- cajero paga, quedan descontadas para siempre. Si rechaza, vuelven
-- al saldo jugable para que el jugador pueda corregir el dato y pedir
-- de nuevo.
-- =========================================================

alter table players
  add column if not exists balance_retenido numeric(14,2) not null default 0 check (balance_retenido >= 0);

alter table withdrawal_requests
  add column if not exists metodo_tipo   text check (metodo_tipo in ('alias', 'cuenta')),
  add column if not exists alias_tipo    text check (alias_tipo in ('ci', 'telefono', 'correo', 'ruc')),
  add column if not exists alias_valor   text,
  add column if not exists banco         text,
  add column if not exists numero_cuenta text,
  add column if not exists titular       text,
  add column if not exists documento     text,
  add column if not exists tx_reembolso_id uuid references balance_transactions(id);

-- ---------------------------------------------------------
-- Solicitar un retiro: valida y descuenta el saldo en el mismo
-- paso atómico en el que crea el pedido. Reemplaza el insert directo
-- que hacía antes /api/player-caja.
-- ---------------------------------------------------------
create or replace function solicitar_retiro(
  p_player_id     uuid,
  p_amount        numeric,
  p_nota          text default null,
  p_metodo_tipo   text default null,
  p_alias_tipo    text default null,
  p_alias_valor   text default null,
  p_banco         text default null,
  p_numero_cuenta text default null,
  p_titular       text default null,
  p_documento     text default null
)
returns withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player        players;
  v_balance_after numeric;
  v_tx            balance_transactions;
  v_req           withdrawal_requests;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;

  if p_metodo_tipo not in ('alias', 'cuenta') then
    raise exception 'Método de cobro inválido';
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

  if v_player.ban_retiros then
    raise exception 'El jugador tiene ban de retiros';
  end if;

  if p_amount > v_player.balance then
    raise exception 'Saldo insuficiente (actual: %, retiro: %)', v_player.balance, p_amount;
  end if;

  v_balance_after := v_player.balance - p_amount;

  update players
  set balance = v_balance_after,
      balance_retenido = balance_retenido + p_amount
  where id = p_player_id;

  -- Se descuenta de verdad ahora, así que el asiento del libro va acá
  -- (no en la aprobación): es el momento real en que salió del saldo
  -- jugable, aunque todavía no esté pagado.
  insert into balance_transactions
    (player_id, type, amount, balance_before, balance_after, note, created_by)
  values
    (p_player_id, 'retiro', p_amount, v_player.balance, v_balance_after,
     coalesce(p_nota, 'Retiro solicitado desde el portal'), 'jugador:' || v_player.username)
  returning * into v_tx;

  insert into withdrawal_requests
    (player_id, amount, nota_jugador, tx_id,
     metodo_tipo, alias_tipo, alias_valor, banco, numero_cuenta, titular, documento)
  values
    (p_player_id, p_amount, p_nota, v_tx.id,
     p_metodo_tipo, p_alias_tipo, p_alias_valor, p_banco, p_numero_cuenta, p_titular, p_documento)
  returning * into v_req;

  return v_req;
end;
$$;

-- ---------------------------------------------------------
-- Aprobar: el saldo ya se descontó al solicitar. Acá solo se libera
-- el resguardo de forma permanente (no se vuelve a tocar `balance`).
-- ---------------------------------------------------------
create or replace function aprobar_retiro(
  p_request_id uuid,
  p_created_by text,
  p_nota       text default null
)
returns withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req withdrawal_requests;
begin
  select * into v_req
  from withdrawal_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_req.estado <> 'pendiente' then
    raise exception 'La solicitud ya fue %', v_req.estado;
  end if;

  update players
  set balance_retenido = greatest(0, balance_retenido - v_req.amount)
  where id = v_req.player_id;

  update withdrawal_requests
  set estado = 'aprobado',
      resuelto_por = p_created_by,
      resuelto_at = now(),
      nota_staff = p_nota
  where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;

-- ---------------------------------------------------------
-- Rechazar un retiro: libera el resguardo y devuelve las fichas al
-- saldo jugable, con su propio asiento en el libro (una "carga" de
-- reembolso, no una carga real) para que quede trazado.
-- ---------------------------------------------------------
create or replace function rechazar_retiro(
  p_request_id uuid,
  p_created_by text,
  p_nota       text default null
)
returns withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req           withdrawal_requests;
  v_player        players;
  v_balance_after numeric;
  v_tx            balance_transactions;
begin
  select * into v_req
  from withdrawal_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_req.estado <> 'pendiente' then
    raise exception 'La solicitud ya fue %', v_req.estado;
  end if;

  select * into v_player
  from players
  where id = v_req.player_id
  for update;

  v_balance_after := v_player.balance + v_req.amount;

  update players
  set balance = v_balance_after,
      balance_retenido = greatest(0, balance_retenido - v_req.amount)
  where id = v_req.player_id;

  insert into balance_transactions
    (player_id, type, amount, balance_before, balance_after, note, created_by)
  values
    (v_req.player_id, 'carga', v_req.amount, v_player.balance, v_balance_after,
     coalesce('Retiro rechazado: ' || p_nota, 'Retiro rechazado: devolución de saldo'), p_created_by)
  returning * into v_tx;

  update withdrawal_requests
  set estado = 'rechazado',
      resuelto_por = p_created_by,
      resuelto_at = now(),
      nota_staff = p_nota,
      tx_reembolso_id = v_tx.id
  where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;

-- ---------------------------------------------------------
-- Cancelar (el propio jugador, antes de que un cajero lo resuelva):
-- misma devolución que un rechazo, pero valida que el pedido sea
-- del jugador que llama.
-- ---------------------------------------------------------
create or replace function cancelar_retiro(
  p_request_id uuid,
  p_player_id  uuid
)
returns withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req           withdrawal_requests;
  v_player        players;
  v_balance_after numeric;
  v_tx            balance_transactions;
begin
  select * into v_req
  from withdrawal_requests
  where id = p_request_id and player_id = p_player_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_req.estado <> 'pendiente' then
    raise exception 'La solicitud ya fue %', v_req.estado;
  end if;

  select * into v_player
  from players
  where id = p_player_id
  for update;

  v_balance_after := v_player.balance + v_req.amount;

  update players
  set balance = v_balance_after,
      balance_retenido = greatest(0, balance_retenido - v_req.amount)
  where id = p_player_id;

  insert into balance_transactions
    (player_id, type, amount, balance_before, balance_after, note, created_by)
  values
    (p_player_id, 'carga', v_req.amount, v_player.balance, v_balance_after,
     'Retiro cancelado por el jugador', 'jugador:' || v_player.username)
  returning * into v_tx;

  update withdrawal_requests
  set estado = 'cancelado',
      resuelto_at = now(),
      tx_reembolso_id = v_tx.id
  where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;

-- ---------------------------------------------------------
-- vista_eventos: un retiro rechazado ahora SÍ deja movimiento (la
-- devolución, vía balance_transactions), así que el bloque 3 de la
-- vista original ("Retiros rechazados", pensado para rechazos que no
-- movían plata) quedaría duplicado con la carga de reembolso. Se
-- redefine sin ese bloque; el de cargas rechazadas sigue igual,
-- porque esas siguen sin mover saldo.
-- ---------------------------------------------------------
create or replace view vista_eventos as

select
  bt.id,
  bt.created_at                       as fecha,
  bt.type                             as categoria,
  case when bt.type = 'carga' then 'Carga' else 'Retiro' end as evento,
  case
    when bt.note ilike 'bono:%' then 'bono'
    when bt.note ilike '%portal%' then 'portal'
    else 'manual'
  end                                 as origen,
  bt.note                             as detalle,
  bt.created_by                       as actor,
  bt.amount                           as monto,
  bt.balance_after                    as saldo,
  p.player_number,
  coalesce(p.display_name, p.username) as sujeto
from balance_transactions bt
join players p on p.id = bt.player_id

union all

select
  dr.id,
  coalesce(dr.resuelto_at, dr.created_at),
  'rechazo',
  'Carga rechazada',
  'portal',
  dr.nota_staff,
  coalesce(dr.resuelto_por, '—'),
  dr.amount,
  null,
  p.player_number,
  coalesce(p.display_name, p.username)
from deposit_requests dr
join players p on p.id = dr.player_id
where dr.estado = 'rechazado'

union all

select
  bh.id,
  bh.created_at,
  'ban',
  case when bh.activo then 'Ban de ' || bh.ban_tipo else 'Ban de ' || bh.ban_tipo || ' levantado' end,
  null,
  bh.motivo,
  bh.created_by,
  null,
  null,
  p.player_number,
  coalesce(p.display_name, p.username)
from ban_history bh
join players p on p.id = bh.player_id

union all

select
  p.id,
  p.created_at,
  'jugador',
  'Jugador creado',
  null,
  null,
  coalesce(p.created_by, '—'),
  null,
  null,
  p.player_number,
  coalesce(p.display_name, p.username)
from players p

union all

select
  pr.id,
  pr.created_at,
  'jugador',
  'Contraseña reseteada',
  null,
  null,
  pr.reset_by,
  null,
  null,
  p.player_number,
  coalesce(p.display_name, p.username)
from password_resets pr
join players p on p.id = pr.player_id

union all

select
  sh.id,
  sh.created_at,
  'staff',
  'Staff ' || sh.accion,
  null,
  sh.detalle::text,
  sh.created_by,
  null,
  null,
  null,
  coalesce(sp.display_name, sp.email)
from staff_history sh
left join staff_profiles sp on sp.id = sh.staff_id;
