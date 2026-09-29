-- =========================================================
-- Tope de conversión (max cashout) + Juegos para bonos + banner y
-- rango VIP en los hitos.
--
--  · tope_conversion: por más que el jugador gane jugando el bono, se
--    lleva a saldo real como máximo `mult × bono`; el resto se descarta
--    al liberar. Default global en billetera_config, override por bono.
--  · games.para_bonos: el rollover solo avanza jugando esos juegos (si
--    hay al menos uno marcado; si no, todos cuentan como hasta ahora).
--  · bono_hitos: vip_nivel_max, tope_conversion_mult, banner.
--
-- Aditivo sobre sql/41 (que ya está corrido). Repetible.
-- Después de correr:  notify pgrst, 'reload schema';
-- =========================================================

-- ---------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------
alter table billetera_config
  add column if not exists tope_conversion_mult numeric(6,2) not null default 0 check (tope_conversion_mult >= 0);

-- null = usar el global de billetera_config
alter table bonos              add column if not exists tope_conversion_mult numeric(6,2);
alter table bono_registro      add column if not exists tope_conversion_mult numeric(6,2);
alter table referidos_config   add column if not exists tope_conversion_mult numeric(6,2);
alter table cashback_config    add column if not exists tope_conversion_mult numeric(6,2);
alter table giro_diario_config add column if not exists tope_conversion_mult numeric(6,2);
alter table promo_codigos      add column if not exists tope_conversion_mult numeric(6,2);

alter table bono_movimientos
  add column if not exists tope_conversion numeric(14,2) not null default 0;

alter table bono_hitos
  add column if not exists vip_nivel_max        uuid references vip_niveles(id) on delete set null,
  add column if not exists tope_conversion_mult numeric(6,2),
  add column if not exists banner_url           text,
  add column if not exists banner_public_id     text,
  add column if not exists banner_titulo        text,
  add column if not exists banner_texto         text;

alter table games
  add column if not exists para_bonos boolean not null default false;

-- ganancia_bono ahora es neta: puede bajar de 0.
alter table players drop constraint if exists players_ganancia_bono_check;

-- =========================================================
-- hay_juegos_bono — ¿hay al menos un juego marcado "para bonos"?
-- Si no, el rollover avanza en todos (comportamiento actual).
-- =========================================================
create or replace function hay_juegos_bono()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from games where para_bonos = true and activo = true);
$$;

-- =========================================================
-- sumar_bono_billetera — gana p_tope_mult: guarda el tope de conversión
-- absoluto en el bono_movimientos (monto × mult, o el global).
-- =========================================================
drop function if exists sumar_bono_billetera(uuid, numeric, numeric, boolean, text, text, uuid, uuid);

create or replace function sumar_bono_billetera(
  p_player_id  uuid,
  p_monto      numeric,
  p_rollover   numeric,
  p_es_bono    boolean default true,
  p_origen     text    default 'otro',
  p_referencia text    default null,
  p_origen_id  uuid    default null,
  p_tx_id      uuid    default null,
  p_tope_mult  numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adv   boolean;
  v_mult  numeric;
  v_tope  numeric;
begin
  if coalesce(p_monto, 0) <= 0 or coalesce(p_rollover, 0) <= 0 then
    return;
  end if;

  select modo_avanzado, tope_conversion_mult into v_adv, v_mult
  from billetera_config where id = 1;
  if not coalesce(v_adv, false) then
    return;
  end if;

  update players
  set saldo_bono        = saldo_bono + case when p_es_bono then p_monto else 0 end,
      requisito_apuesta = requisito_apuesta + p_monto * p_rollover
  where id = p_player_id;

  if p_es_bono then
    -- tope de conversión: el override del bono, o el global
    v_tope := p_monto * coalesce(p_tope_mult, v_mult, 0);
    insert into bono_movimientos
      (player_id, origen, origen_id, referencia, monto, rollover, requisito_inicial, tx_id, tope_conversion)
    values
      (p_player_id, p_origen, p_origen_id, p_referencia, p_monto, p_rollover,
       p_monto * p_rollover, p_tx_id, greatest(0, coalesce(v_tope, 0)));
  end if;
end;
$$;

-- =========================================================
-- consumir_apuesta_billetera — gana p_cuenta_rollover (el juego cuenta
-- para el rollover). ganancia_bono pasa a neta (ganado - apostado).
-- Al liberar: cierra el ledger y aplica el tope de conversión.
-- =========================================================
drop function if exists consumir_apuesta_billetera(uuid, numeric, numeric);

create or replace function consumir_apuesta_billetera(
  p_player_id       uuid,
  p_bet             numeric,
  p_win             numeric,
  p_cuenta_rollover boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg        billetera_config;
  v_req        numeric;
  v_bono       numeric;
  v_gan        numeric;
  v_new_req    numeric;
  v_gan_final  numeric;
  v_bet_roll   numeric;
  v_bono_tot   numeric;
  v_tope       numeric;
  v_atribuible numeric;
begin
  select * into v_cfg from billetera_config where id = 1;
  if not coalesce(v_cfg.modo_avanzado, false) then
    return;
  end if;

  select requisito_apuesta, saldo_bono, ganancia_bono
  into v_req, v_bono, v_gan
  from players where id = p_player_id;

  if coalesce(v_req, 0) <= 0 and coalesce(v_bono, 0) <= 0 then
    return;
  end if;

  -- el rollover solo avanza si el juego cuenta
  v_bet_roll := case when coalesce(p_cuenta_rollover, true) then coalesce(p_bet, 0) else 0 end;
  v_new_req  := greatest(0, coalesce(v_req, 0) - v_bet_roll);

  -- ganancia del bono: neta, mientras el requisito estaba pendiente
  v_gan_final := coalesce(v_gan, 0)
    + case when coalesce(v_req, 0) > 0 then coalesce(p_win, 0) - coalesce(p_bet, 0) else 0 end;

  update players
  set requisito_apuesta = v_new_req,
      saldo_bono = case when v_new_req <= 0 then 0
                        else greatest(0, saldo_bono - coalesce(p_bet, 0)) end,
      ganancia_bono = case when v_new_req <= 0 then 0 else v_gan_final end
  where id = p_player_id;

  if v_new_req <= 0 and coalesce(v_req, 0) > 0 then
    select coalesce(sum(monto), 0), coalesce(sum(tope_conversion), 0)
    into v_bono_tot, v_tope
    from bono_movimientos
    where player_id = p_player_id and estado = 'activo';

    update bono_movimientos
    set estado = 'liberado', resuelto_at = now()
    where player_id = p_player_id and estado = 'activo';

    -- tope de conversión: lo atribuible al bono (capital + ganancia neta)
    -- no puede superar el tope; el excedente se descarta del saldo.
    if coalesce(v_tope, 0) > 0 then
      v_atribuible := v_bono_tot + greatest(0, v_gan_final);
      if v_atribuible > v_tope then
        update players
        set balance = greatest(0, balance - (v_atribuible - v_tope))
        where id = p_player_id;
      end if;
    end if;
  end if;
end;
$$;

-- =========================================================
-- slot_jugada — pasa a consumir_apuesta_billetera si el juego cuenta
-- para el rollover (redefine la de sql/39_billetera.sql).
-- =========================================================
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
  v_player  players;
  v_after   numeric;
  v_ronda   game_rounds;
  v_bille   billetera_config;
  v_cuenta  boolean;
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
  if not found then raise exception 'Jugador no encontrado'; end if;
  if v_player.ban_permanente then raise exception 'Tu cuenta está suspendida'; end if;
  if v_player.estado_verificacion <> 'verificado' then
    raise exception 'Verificá tu identidad para jugar';
  end if;
  if v_player.balance < p_bet then raise exception 'Saldo insuficiente'; end if;

  -- tope de apuesta mientras hay bono pegajoso
  select * into v_bille from billetera_config where id = 1;
  if coalesce(v_bille.modo_avanzado, false)
     and coalesce(v_bille.apuesta_max_bono, 0) > 0
     and coalesce(v_player.saldo_bono, 0) > 0
     and p_bet > v_bille.apuesta_max_bono then
    raise exception 'Con bono activo la apuesta máxima es %', v_bille.apuesta_max_bono;
  end if;

  -- ¿este juego cuenta para el rollover?
  if hay_juegos_bono() then
    v_cuenta := coalesce((select para_bonos from games where slug = p_game_slug), false);
  else
    v_cuenta := true;
  end if;

  v_after := v_player.balance - p_bet + coalesce(p_win, 0);
  update players set balance = v_after where id = p_player_id;

  insert into game_rounds
    (player_id, game_slug, bet, win, balance_before, balance_after, detalle, client_id)
  values
    (p_player_id, p_game_slug, p_bet, coalesce(p_win, 0), v_player.balance, v_after, p_detalle, p_client_id)
  returning * into v_ronda;

  perform consumir_apuesta_billetera(p_player_id, p_bet, coalesce(p_win, 0), v_cuenta);

  return v_ronda;
end;
$$;

-- =========================================================
-- aprobar_deposito — redefine sql/41:
--   + tope_conversion_mult del bono / promo / hito
--   + rango VIP en los hitos (vip_nivel_min .. vip_nivel_max)
-- =========================================================
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
  v_cargado    numeric;
  v_forzado    uuid;
  v_promo_id   uuid;
  v_promo_mon  numeric;
  v_promo_roll numeric;
  v_promo_cod  text;
  v_origen     text;
  v_origen_id  uuid;
  v_referencia text;
  v_roll       numeric;
  v_tope_mult  numeric;
  -- hitos
  v_vip_orden  int;
  h            bono_hitos;
  ph           player_hitos;
  v_cont       int;
  v_valor      numeric;
  v_bono_h     numeric;
  v_txh        balance_transactions;
  v_omax       int;
begin
  select * into v_req from deposit_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_req.estado <> 'pendiente' then raise exception 'La solicitud ya fue %', v_req.estado; end if;

  v_monto := coalesce(p_monto_real, v_req.amount);
  if v_monto <= 0 then raise exception 'El monto acreditado debe ser mayor a 0'; end if;

  if coalesce(trim(v_req.promo_codigo), '') <> '' then
    select cp.promo_id, cp.promo_monto, cp.promo_rollover, cp.promo_codigo
    into v_promo_id, v_promo_mon, v_promo_roll, v_promo_cod
    from calcular_promo(v_req.promo_codigo, v_monto, v_req.player_id) cp;

    if v_promo_id is not null and exists (
         select 1 from promo_canjes where codigo_id = v_promo_id and player_id = v_req.player_id) then
      v_promo_id := null;
    end if;
  end if;

  if v_promo_id is not null and coalesce(v_promo_mon, 0) > 0 then
    v_bono_mon   := v_promo_mon;
    v_bono_nom   := 'Código ' || v_promo_cod;
    v_roll       := coalesce(v_promo_roll, 1);
    v_origen     := 'promo';
    v_origen_id  := v_promo_id;
    v_referencia := v_promo_cod;
    v_tope_mult  := (select tope_conversion_mult from promo_codigos where id = v_promo_id);
  else
    select cb.bono_id, cb.bono_monto, cb.bono_nombre
    into v_bono_id, v_bono_mon, v_bono_nom
    from calcular_bono(v_req.player_id, v_monto) cb;
    v_roll       := coalesce((select rollover from bonos where id = v_bono_id), 1);
    v_origen     := 'carga';
    v_origen_id  := v_bono_id;
    v_referencia := v_bono_nom;
    v_tope_mult  := (select tope_conversion_mult from bonos where id = v_bono_id);
  end if;

  v_tx := wallet_movimiento(
    v_req.player_id, 'carga', v_monto,
    coalesce(p_nota, 'Carga solicitada desde el portal'), p_created_by
  );

  perform sumar_bono_billetera(
    v_req.player_id, v_monto,
    coalesce((select rollover_carga from billetera_config where id = 1), 0),
    false
  );

  if coalesce(v_bono_mon, 0) > 0 then
    v_tx_bono_id := (wallet_movimiento(
      v_req.player_id, 'carga', v_bono_mon,
      'Bono: ' || coalesce(v_bono_nom, 'promoción'), p_created_by
    )).id;

    perform sumar_bono_billetera(
      v_req.player_id, v_bono_mon, v_roll,
      true, v_origen, v_referencia, v_origen_id, v_tx_bono_id, v_tope_mult
    );

    if v_origen = 'promo' then
      update promo_codigos set usos = usos + 1 where id = v_promo_id;
      insert into promo_canjes (codigo_id, player_id, deposit_request_id, monto)
      values (v_promo_id, v_req.player_id, p_request_id, v_bono_mon)
      on conflict (codigo_id, player_id) do nothing;
    elsif v_bono_id is not null then
      update bonos
      set usos = usos + 1, repartido = repartido + v_bono_mon
      where id = v_bono_id;
    end if;
  end if;

  -- Candado del bono de registro
  select retiro_bloqueado, balance, bono_por_descontar
  into v_reg_bloq, v_reg_bal, v_reg_piso
  from players where id = v_req.player_id;

  if coalesce(v_reg_bloq, false) then
    select monto into v_reg_monto from bonos_otorgados
    where player_id = v_req.player_id and estado = 'activo';

    if found and v_monto >= v_reg_monto then
      update players
      set retiro_bloqueado = false,
          bono_por_descontar = least(bono_por_descontar,
                                     greatest(0, v_reg_bal - v_monto - coalesce(v_bono_mon, 0)))
      where id = v_req.player_id;

      update bonos_otorgados
      set estado = 'liberado', carga_liberadora = p_request_id, liberado_at = now()
      where player_id = v_req.player_id and estado = 'activo';
    end if;
  end if;

  -- VIP
  update players
  set cargado_historico = cargado_historico + v_monto
  where id = v_req.player_id
  returning cargado_historico, vip_nivel_forzado into v_cargado, v_forzado;

  update players
  set vip_nivel_id = nivel_vip_para(v_cargado, v_forzado)
  where id = v_req.player_id;

  -- ---------------------------------------------------------
  -- Hitos de carga
  -- ---------------------------------------------------------
  select coalesce(vn.orden, 0) into v_vip_orden
  from players p left join vip_niveles vn on vn.id = p.vip_nivel_id
  where p.id = v_req.player_id;

  for h in select * from bono_hitos where activo loop
    if v_monto < h.min_por_carga then continue; end if;
    if h.vip_nivel_min is not null
       and v_vip_orden < coalesce((select orden from vip_niveles where id = h.vip_nivel_min), 0)
    then continue; end if;
    if h.vip_nivel_max is not null then
      select orden into v_omax from vip_niveles where id = h.vip_nivel_max;
      if v_omax is not null and v_vip_orden > v_omax then continue; end if;
    end if;

    select * into ph from player_hitos
    where player_id = v_req.player_id and hito_id = h.id;

    if h.tope_hitos > 0 and coalesce(ph.hitos_completados, 0) >= h.tope_hitos then
      continue;
    end if;

    v_cont := coalesce(ph.cargas_contadas, 0);
    if h.ventana_dias > 0 and ph.ultima_carga_at is not null
       and ph.ultima_carga_at < now() - make_interval(days => h.ventana_dias)
    then v_cont := 0; end if;

    v_cont := v_cont + 1;

    if v_cont >= h.cada_cargas then
      v_valor := h.valor + h.valor_incremento * coalesce(ph.hitos_completados, 0);
      if h.valor_max is not null then v_valor := least(v_valor, h.valor_max); end if;
      v_bono_h := case when h.tipo = 'porcentaje'
                       then round(v_monto * v_valor / 100, 2)
                       else v_valor end;
      if h.tope is not null and v_bono_h > h.tope then v_bono_h := h.tope; end if;

      if v_bono_h > 0 then
        v_txh := wallet_movimiento(v_req.player_id, 'carga', v_bono_h,
          'Hito: ' || h.nombre, p_created_by);
        perform sumar_bono_billetera(
          v_req.player_id, v_bono_h, coalesce(h.rollover, 1),
          true, 'hito', h.nombre, h.id, v_txh.id, h.tope_conversion_mult
        );
      end if;

      insert into player_hitos (player_id, hito_id, cargas_contadas, hitos_completados, ultima_carga_at, updated_at)
      values (v_req.player_id, h.id, v_cont - h.cada_cargas, 1, now(), now())
      on conflict (player_id, hito_id) do update
        set cargas_contadas = v_cont - h.cada_cargas,
            hitos_completados = player_hitos.hitos_completados + 1,
            ultima_carga_at = now(), updated_at = now();
    else
      insert into player_hitos (player_id, hito_id, cargas_contadas, ultima_carga_at, updated_at)
      values (v_req.player_id, h.id, v_cont, now(), now())
      on conflict (player_id, hito_id) do update
        set cargas_contadas = v_cont,
            ultima_carga_at = now(), updated_at = now();
    end if;
  end loop;

  update deposit_requests
  set estado = 'aprobado', amount = v_monto,
      bono_id = v_bono_id, bono_monto = coalesce(v_bono_mon, 0),
      resuelto_por = p_created_by, resuelto_at = now(), nota_staff = p_nota,
      tx_id = v_tx.id, tx_bono_id = v_tx_bono_id
  where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;

-- =========================================================
-- mis_hitos — + rango VIP + banner + tope de conversión.
-- =========================================================
create or replace function mis_hitos(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with vip as (
    select coalesce(vn.orden, 0) as orden
    from players p left join vip_niveles vn on vn.id = p.vip_nivel_id
    where p.id = p_player_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'nombre',            h.nombre,
    'cada_cargas',       h.cada_cargas,
    'min_por_carga',     h.min_por_carga,
    'tipo',              h.tipo,
    'ventana_dias',      h.ventana_dias,
    'cargas_contadas',   coalesce(ph.cargas_contadas, 0),
    'faltan',            greatest(0, h.cada_cargas - coalesce(ph.cargas_contadas, 0)),
    'hitos_completados', coalesce(ph.hitos_completados, 0),
    'proximo_valor',     h.valor + h.valor_incremento * coalesce(ph.hitos_completados, 0),
    'tope_conversion_mult', coalesce(h.tope_conversion_mult,
                                     (select tope_conversion_mult from billetera_config where id = 1), 0),
    'vence_at',          case when h.ventana_dias > 0 and ph.ultima_carga_at is not null
                              then ph.ultima_carga_at + make_interval(days => h.ventana_dias)
                              else null end,
    'banner_url',        h.banner_url,
    'banner_titulo',     h.banner_titulo,
    'banner_texto',      h.banner_texto
  ) order by h.created_at), '[]'::jsonb)
  from bono_hitos h
  cross join vip
  left join player_hitos ph on ph.hito_id = h.id and ph.player_id = p_player_id
  where h.activo
    and (h.tope_hitos = 0 or coalesce(ph.hitos_completados, 0) < h.tope_hitos)
    and (h.vip_nivel_min is null
         or vip.orden >= coalesce((select orden from vip_niveles where id = h.vip_nivel_min), 0))
    and (h.vip_nivel_max is null
         or vip.orden <= coalesce((select orden from vip_niveles where id = h.vip_nivel_max), 999));
$$;
grant execute on function mis_hitos(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
