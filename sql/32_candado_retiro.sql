-- =========================================================
-- Candado de retiro del bono de registro + gate de juego
--
-- Modelo B (decidido con el operador):
--  - El bono de registro entra al saldo normal al registrarse (30).
--  - El retiro queda BLOQUEADO hasta que el jugador haga UNA carga
--    aprobada por un valor >= el bono. Así cada retiro queda
--    autofinanciado y no hace falta rollover.
--  - Una vez liberado, el monto retirable es  balance - bono_por_descontar.
--    El bono en sí nunca se retira; solo lo ganado con él.
--  - bono_por_descontar es un piso que solo BAJA (si el jugador funde
--    el bono jugando), nunca sube.
--
-- Este archivo redefine aprobar_deposito() y solicitar_retiro() (las
-- versiones de 12_bonos.sql y 27_retiro_metodo_cobro.sql) sumando esa
-- lógica, y agrega el gate de "solo verificado puede jugar" a
-- slot_jugada().
--
-- Después de correr este archivo:  notify pgrst, 'reload schema';
-- =========================================================

-- ---------------------------------------------------------
-- aprobar_deposito — igual que en 12_bonos.sql, + liberación del
-- candado del bono de registro si esta carga califica.
-- ---------------------------------------------------------
create or replace function aprobar_deposito(
  p_request_id uuid,
  p_created_by text,
  p_monto_real numeric default null,
  p_nota       text default null
)
returns deposit_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req        deposit_requests;
  v_monto      numeric;
  v_tx         balance_transactions;
  v_tx_bono_id uuid;
  v_bono_id    uuid;
  v_bono_mon   numeric;
  v_bono_nom   text;
  v_reg_bloq   boolean;
  v_reg_bal    numeric;
  v_reg_piso   numeric;
  v_reg_monto  numeric;
begin
  select * into v_req
  from deposit_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_req.estado <> 'pendiente' then
    raise exception 'La solicitud ya fue %', v_req.estado;
  end if;

  v_monto := coalesce(p_monto_real, v_req.amount);

  if v_monto <= 0 then
    raise exception 'El monto acreditado debe ser mayor a 0';
  end if;

  -- Bono por carga (reglas de 12_bonos, sobre el monto REAL acreditado)
  select cb.bono_id, cb.bono_monto, cb.bono_nombre
  into v_bono_id, v_bono_mon, v_bono_nom
  from calcular_bono(v_req.player_id, v_monto) cb;

  v_tx := wallet_movimiento(
    v_req.player_id, 'carga', v_monto,
    coalesce(p_nota, 'Carga solicitada desde el portal'),
    p_created_by
  );

  if coalesce(v_bono_mon, 0) > 0 then
    v_tx_bono_id := (wallet_movimiento(
      v_req.player_id, 'carga', v_bono_mon,
      'Bono: ' || coalesce(v_bono_nom, 'promoción'),
      p_created_by
    )).id;
  end if;

  -- ¿Esta carga levanta el candado del bono de registro?
  select retiro_bloqueado, balance, bono_por_descontar
  into v_reg_bloq, v_reg_bal, v_reg_piso
  from players where id = v_req.player_id;

  if coalesce(v_reg_bloq, false) then
    select monto into v_reg_monto
    from bonos_otorgados
    where player_id = v_req.player_id and estado = 'activo';

    -- La carga tiene que valer, sola, al menos el bono. Se mide el
    -- monto REAL acreditado, no el que declaró el jugador.
    if found and v_monto >= v_reg_monto then
      update players
      set retiro_bloqueado = false,
          -- Congelar el piso: la cara del bono, o lo que quede en el
          -- saldo ANTES de esta carga, lo que sea menor. Así el que
          -- fundió el bono y recién ahí cargó no queda con un piso
          -- que se comería su propia carga.
          bono_por_descontar = least(bono_por_descontar,
                                     greatest(0, v_reg_bal - v_monto - coalesce(v_bono_mon, 0)))
      where id = v_req.player_id;

      update bonos_otorgados
      set estado = 'liberado',
          carga_liberadora = p_request_id,
          liberado_at = now()
      where player_id = v_req.player_id and estado = 'activo';
    end if;
  end if;

  update deposit_requests
  set estado = 'aprobado',
      amount = v_monto,
      bono_id = v_bono_id,
      bono_monto = coalesce(v_bono_mon, 0),
      resuelto_por = p_created_by,
      resuelto_at = now(),
      nota_staff = p_nota,
      tx_id = v_tx.id,
      tx_bono_id = v_tx_bono_id
  where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;

-- ---------------------------------------------------------
-- solicitar_retiro — igual que en 27, + candado del bono y piso
-- no retirable.
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
  v_bono_monto    numeric;
  v_piso          numeric;
  v_retirable     numeric;
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

  if v_player.estado_verificacion <> 'verificado' then
    raise exception 'Verificá tu identidad antes de retirar';
  end if;

  -- Candado del bono de registro: no se retira nada hasta hacer una
  -- carga aprobada >= el valor del bono.
  if v_player.retiro_bloqueado then
    select monto into v_bono_monto
    from bonos_otorgados
    where player_id = p_player_id and estado = 'activo';
    raise exception 'Para retirar tenés que hacer una carga de al menos % y que un cajero la apruebe', coalesce(v_bono_monto, 0);
  end if;

  -- Piso no retirable = la cara del bono, o lo que quede en el saldo
  -- si ya fundió parte jugando (el piso solo baja, nunca sube).
  v_piso := least(v_player.bono_por_descontar, v_player.balance);
  v_retirable := v_player.balance - v_piso;

  if p_amount > v_retirable then
    raise exception 'Podés retirar hasta % (los % del bono no son retirables)', v_retirable, v_piso;
  end if;

  v_balance_after := v_player.balance - p_amount;

  update players
  set balance = v_balance_after,
      balance_retenido = balance_retenido + p_amount,
      bono_por_descontar = v_piso
  where id = p_player_id;

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
-- slot_jugada — igual que en 18_operacion.sql, + gate de "solo
-- verificado puede jugar". El portal ya lo frena en la UI y en
-- /api, pero el azar vive acá: la última barrera también.
-- ---------------------------------------------------------
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

  if v_player.estado_verificacion <> 'verificado' then
    raise exception 'Verificá tu identidad para jugar';
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
