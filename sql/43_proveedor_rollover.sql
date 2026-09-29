-- =========================================================
-- El rollover también avanza con los juegos de proveedor externo.
--
-- proveedor_apostar / proveedor_premiar (sql/21) no llamaban a
-- consumir_apuesta_billetera, así que el requisito del bono solo bajaba
-- con el slot propio (slot_jugada). Los juegos del ensamblador se
-- liquidan por acá, en dos fases.
--
-- Requiere sql/42 (la versión de 4 args de consumir_apuesta_billetera).
-- Aditivo y repetible. Después:  notify pgrst, 'reload schema';
-- =========================================================

-- ---------------------------------------------------------
-- proveedor_apostar — redefine sql/21 + consumir_apuesta_billetera.
-- ---------------------------------------------------------
create or replace function proveedor_apostar(
  p_player_id uuid,
  p_game_slug text,
  p_bet       numeric,
  p_round_id  text
)
returns game_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game   games;
  v_player players;
  v_after  numeric;
  v_ronda  game_rounds;
  v_cuenta boolean;
begin
  select * into v_ronda from game_rounds where player_id = p_player_id and client_id = p_round_id;
  if found then return v_ronda; end if;

  select * into v_game from games where slug = p_game_slug and activo = true;
  if not found then raise exception 'Juego no encontrado o inactivo'; end if;
  if v_game.launch_url is null then raise exception 'Ese juego no es de un proveedor externo'; end if;

  if p_bet is null or p_bet <= 0 then raise exception 'La apuesta debe ser mayor a 0'; end if;
  if p_bet < v_game.min_bet or p_bet > v_game.max_bet then
    raise exception 'Apuesta fuera de los límites del juego (% a %)', v_game.min_bet, v_game.max_bet;
  end if;

  select * into v_player from players where id = p_player_id for update;
  if not found then raise exception 'Jugador no encontrado'; end if;
  if v_player.ban_permanente then raise exception 'El jugador está suspendido'; end if;
  if v_player.balance < p_bet then raise exception 'Saldo insuficiente'; end if;

  -- [billetera] tope de apuesta mientras hay bono pegajoso
  if exists (select 1 from billetera_config where id = 1 and modo_avanzado
             and apuesta_max_bono > 0)
     and coalesce(v_player.saldo_bono, 0) > 0
     and p_bet > (select apuesta_max_bono from billetera_config where id = 1) then
    raise exception 'Con bono activo la apuesta máxima es %',
      (select apuesta_max_bono from billetera_config where id = 1);
  end if;

  v_after := v_player.balance - p_bet;
  update players set balance = v_after where id = p_player_id;

  insert into game_rounds
    (player_id, game_slug, bet, win, balance_before, balance_after, detalle, client_id)
  values
    (p_player_id, p_game_slug, p_bet, 0, v_player.balance, v_after,
     jsonb_build_object('proveedor_externo', true, 'estado', 'apostado'), p_round_id)
  returning * into v_ronda;

  -- [billetera] baja el requisito del rollover con esta apuesta
  if hay_juegos_bono() then
    v_cuenta := coalesce(v_game.para_bonos, false);
  else
    v_cuenta := true;
  end if;
  perform consumir_apuesta_billetera(p_player_id, p_bet, 0, v_cuenta);

  return v_ronda;
end;
$$;

-- ---------------------------------------------------------
-- proveedor_premiar — redefine sql/21 + suma la ganancia al tracking
-- del bono (bet 0: no vuelve a bajar el requisito).
-- ---------------------------------------------------------
create or replace function proveedor_premiar(
  p_player_id uuid,
  p_round_id  text,
  p_win       numeric
)
returns game_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ronda  game_rounds;
  v_player players;
  v_after  numeric;
begin
  select * into v_ronda from game_rounds where player_id = p_player_id and client_id = p_round_id for update;
  if not found then
    raise exception 'No existe una apuesta con ese round_id para este jugador';
  end if;

  if v_ronda.detalle->>'estado' = 'pagado' then
    return v_ronda;
  end if;

  select * into v_player from players where id = p_player_id for update;

  v_after := v_player.balance + coalesce(p_win, 0);
  update players set balance = v_after where id = p_player_id;

  update game_rounds
  set win = coalesce(p_win, 0), balance_after = v_after,
      detalle = detalle || jsonb_build_object('estado', 'pagado')
  where id = v_ronda.id
  returning * into v_ronda;

  -- [billetera] la ganancia cuenta para el tracking del bono (bet 0 =>
  -- el requisito no se mueve, solo se acumula ganancia_bono si el bono
  -- sigue trabado; si ya se liberó, es no-op).
  perform consumir_apuesta_billetera(p_player_id, 0, coalesce(p_win, 0), true);

  return v_ronda;
end;
$$;

notify pgrst, 'reload schema';
