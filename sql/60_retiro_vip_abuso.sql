-- =========================================================
-- Espera entre retiros por nivel VIP + detección de abuso de bono
--
-- 1. Cada nivel VIP tiene `retiro_espera_horas`. El más bajo arranca
--    en 24 h y se baja a mano en los niveles altos (exclusividad).
--    0 = sin espera. El primer retiro de la cuenta no espera: el
--    reloj arranca en el pedido pendiente o ya pagado.
-- 2. Si en la ventana (desde el último retiro aprobado, o desde el
--    alta) el jugador cargó con bono y casi no jugó, el retiro se
--    marca `alerta_abuso` para que el cajero lo mire. No se bloquea.
--
-- Después de correr:  notify pgrst, 'reload schema';
-- =========================================================

alter table vip_niveles
  add column if not exists retiro_espera_horas numeric(6,2) not null default 24
    check (retiro_espera_horas >= 0);

comment on column vip_niveles.retiro_espera_horas is
  'Horas mínimas entre un retiro (pendiente o pagado) y el siguiente. 0 = sin espera.';

-- Escalonado de fábrica solo si el nivel sigue en el default (24).
-- Si el operador ya puso otro número, no se pisa.
update vip_niveles v
set retiro_espera_horas = x.horas
from (values
  (1, 24::numeric),
  (2, 18),
  (3, 12),
  (4, 8),
  (5, 4)
) as x(orden, horas)
where v.orden = x.orden
  and v.retiro_espera_horas = 24
  and x.horas <> 24;

alter table withdrawal_requests
  add column if not exists alerta_abuso boolean not null default false,
  add column if not exists alerta_abuso_detalle jsonb;

comment on column withdrawal_requests.alerta_abuso is
  'El jugador cargó con bono en este ciclo y apostó poco. Aviso, no bloqueo.';

-- ---------------------------------------------------------
-- Cuándo puede volver a pedir un retiro este jugador.
-- ---------------------------------------------------------
create or replace function retiro_espera(p_player_id uuid)
returns table (
  horas               numeric,
  ultimo_at           timestamptz,
  disponible_at       timestamptz,
  segundos_restantes  int,
  nivel_nombre        text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_horas  numeric;
  v_nombre text;
  v_ultimo timestamptz;
  v_disp   timestamptz;
begin
  select coalesce(vn.retiro_espera_horas, 24), vn.nombre
  into v_horas, v_nombre
  from players p
  left join vip_niveles vn on vn.id = p.vip_nivel_id
  where p.id = p_player_id;

  if not found then
    return;
  end if;

  v_horas := coalesce(v_horas, 24);

  if v_horas <= 0 then
    horas := 0;
    ultimo_at := null;
    disponible_at := now();
    segundos_restantes := 0;
    nivel_nombre := v_nombre;
    return next;
    return;
  end if;

  -- Solo los ya pagados arrancan el reloj. Uno pendiente lo frena el
  -- índice único; uno rechazado no cuenta, puede volver a pedir.
  select max(wr.created_at) into v_ultimo
  from withdrawal_requests wr
  where wr.player_id = p_player_id
    and wr.estado = 'aprobado';

  if v_ultimo is null then
    horas := v_horas;
    ultimo_at := null;
    disponible_at := now();
    segundos_restantes := 0;
    nivel_nombre := v_nombre;
    return next;
    return;
  end if;

  v_disp := v_ultimo + (v_horas * interval '1 hour');

  horas := v_horas;
  ultimo_at := v_ultimo;
  disponible_at := v_disp;
  segundos_restantes := greatest(0, ceil(extract(epoch from (v_disp - now()))))::int;
  nivel_nombre := v_nombre;
  return next;
end;
$$;

grant execute on function retiro_espera(uuid) to anon, authenticated;

create or replace function assert_retiro_disponible(p_player_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_esp record;
  v_horas text;
begin
  select * into v_esp from retiro_espera(p_player_id);
  if coalesce(v_esp.segundos_restantes, 0) <= 0 then
    return;
  end if;

  v_horas := rtrim(rtrim(to_char(v_esp.horas, 'FM999990.99'), '0'), '.');

  raise exception 'Podés solicitar otro retiro a partir del % (cada % h por tu nivel %)',
    to_char(timezone(zona_casino(), v_esp.disponible_at), 'DD/MM HH24:MI'),
    v_horas,
    coalesce(nullif(v_esp.nivel_nombre, ''), 'base');
end;
$$;

-- ---------------------------------------------------------
-- ¿Este jugador viene de acumular bono sin jugarlo?
-- Ventana: desde el último retiro aprobado, o desde el alta.
-- ---------------------------------------------------------
create or replace function evaluar_abuso_bono(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde        timestamptz;
  v_cargado      numeric := 0;
  v_bonos        numeric := 0;
  v_con_bono     int := 0;
  v_ultima_bono  timestamptz;
  v_apostado     numeric := 0;
  v_ganado       numeric := 0;
  v_jugadas      int := 0;
  v_jug_post     int := 0;
  v_ap_post      numeric := 0;
  v_razones      jsonb := '[]'::jsonb;
  v_espera       numeric := 24;
begin
  select coalesce(vn.retiro_espera_horas, 24) into v_espera
  from players p
  left join vip_niveles vn on vn.id = p.vip_nivel_id
  where p.id = p_player_id;

  select coalesce(
    (select max(coalesce(wr.resuelto_at, wr.created_at))
     from withdrawal_requests wr
     where wr.player_id = p_player_id and wr.estado = 'aprobado'),
    (select p.created_at from players p where p.id = p_player_id)
  ) into v_desde;

  select
    coalesce(sum(dr.amount), 0),
    coalesce(sum(dr.bono_monto), 0),
    count(*) filter (where coalesce(dr.bono_monto, 0) > 0)::int,
    max(coalesce(dr.resuelto_at, dr.created_at))
      filter (where coalesce(dr.bono_monto, 0) > 0)
  into v_cargado, v_bonos, v_con_bono, v_ultima_bono
  from deposit_requests dr
  where dr.player_id = p_player_id
    and dr.estado = 'aprobado'
    and coalesce(dr.resuelto_at, dr.created_at) >= v_desde;

  select
    coalesce(sum(gr.bet), 0),
    coalesce(sum(gr.win), 0),
    count(*)::int
  into v_apostado, v_ganado, v_jugadas
  from game_rounds gr
  where gr.player_id = p_player_id
    and gr.created_at >= v_desde;

  if v_ultima_bono is not null then
    select count(*)::int, coalesce(sum(gr.bet), 0)
    into v_jug_post, v_ap_post
    from game_rounds gr
    where gr.player_id = p_player_id
      and gr.created_at >= v_ultima_bono;
  end if;

  if coalesce(v_bonos, 0) <= 0 then
    return jsonb_build_object(
      'alerta', false,
      'razones', v_razones,
      'ciclo_desde', v_desde,
      'cargado', v_cargado,
      'bonos', v_bonos,
      'cargas_con_bono', v_con_bono,
      'apostado', v_apostado,
      'ganado', v_ganado,
      'jugadas', v_jugadas,
      'retiro_espera_horas', v_espera
    );
  end if;

  -- 1. Cargó con bono y no jugó nada después de la última de esas cargas.
  if v_con_bono > 0 and v_jug_post = 0 then
    v_razones := v_razones || jsonb_build_array('sin_juego_post_bono');
  end if;

  -- 2. Ni siquiera recorrió 1× la suma de bonos del ciclo.
  if v_apostado < v_bonos then
    v_razones := v_razones || jsonb_build_array('bono_no_jugado');
  end if;

  -- 3. Varias cargas con promo y el apostado no cubre ni 1× (carga+bono).
  if v_con_bono >= 2 and v_apostado < (v_cargado + v_bonos) then
    v_razones := v_razones || jsonb_build_array('cazador');
  end if;

  -- 4. Hit and run: pidió el retiro a los pocos minutos de una carga con bono.
  if v_ultima_bono is not null
     and v_ultima_bono > now() - interval '30 minutes'
     and v_ap_post < v_bonos * 0.5 then
    v_razones := v_razones || jsonb_build_array('hit_and_run');
  end if;

  return jsonb_build_object(
    'alerta', jsonb_array_length(v_razones) > 0,
    'razones', v_razones,
    'ciclo_desde', v_desde,
    'cargado', v_cargado,
    'bonos', v_bonos,
    'cargas_con_bono', v_con_bono,
    'apostado', v_apostado,
    'ganado', v_ganado,
    'jugadas', v_jugadas,
    'jugadas_desde_ultima_carga_bono', v_jug_post,
    'apostado_desde_ultima_carga_bono', v_ap_post,
    'retiro_espera_horas', v_espera
  );
end;
$$;

grant execute on function evaluar_abuso_bono(uuid) to authenticated;

-- =========================================================
-- solicitar_retiro — última versión (sql/40) + espera VIP.
-- =========================================================
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
  v_bille         billetera_config;
  v_forfeit       numeric := 0;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;

  if p_metodo_tipo not in ('alias', 'cuenta') then
    raise exception 'Método de cobro inválido';
  end if;

  select * into v_player from players where id = p_player_id for update;
  if not found then raise exception 'Jugador no encontrado'; end if;
  if v_player.ban_permanente then raise exception 'El jugador tiene ban permanente'; end if;
  if v_player.ban_retiros then raise exception 'El jugador tiene ban de retiros'; end if;
  if v_player.estado_verificacion <> 'verificado' then
    raise exception 'Verificá tu identidad antes de retirar';
  end if;

  if v_player.retiro_bloqueado then
    select monto into v_bono_monto from bonos_otorgados
    where player_id = p_player_id and estado = 'activo';
    raise exception 'Para retirar tenés que hacer una carga de al menos % y que un cajero la apruebe', coalesce(v_bono_monto, 0);
  end if;

  -- Espera entre retiros según el nivel VIP. El primer pedido no espera.
  perform assert_retiro_disponible(p_player_id);

  v_piso := least(v_player.bono_por_descontar, v_player.balance);

  select * into v_bille from billetera_config where id = 1;
  if coalesce(v_bille.modo_avanzado, false) and coalesce(v_player.requisito_apuesta, 0) > 0 then
    v_forfeit := coalesce(v_player.saldo_bono, 0)
      + case when coalesce(v_bille.retener_ganancias, false)
             then coalesce(v_player.ganancia_bono, 0) else 0 end;
  end if;

  v_retirable := v_player.balance - v_piso - v_forfeit;

  if p_amount > v_retirable then
    raise exception 'Podés retirar hasta % (% del bono no son retirables)', v_retirable, v_piso + v_forfeit;
  end if;

  v_balance_after := v_player.balance - v_forfeit - p_amount;

  update players
  set balance = v_balance_after,
      balance_retenido = balance_retenido + p_amount,
      bono_por_descontar = v_piso,
      saldo_bono        = case when v_forfeit > 0 then 0 else saldo_bono end,
      ganancia_bono     = case when v_forfeit > 0 then 0 else ganancia_bono end,
      requisito_apuesta = case when v_forfeit > 0 then 0 else requisito_apuesta end
  where id = p_player_id;

  if v_forfeit > 0 then
    update bonos_otorgados
    set estado = 'perdido', liberado_at = now()
    where player_id = p_player_id and estado = 'activo';

    update bono_movimientos
    set estado = 'perdido', resuelto_at = now()
    where player_id = p_player_id and estado = 'activo';
  end if;

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

-- =========================================================
-- cobrar_cashback — última versión (sql/40) + espera VIP en modo retiro.
-- Cobrar en fichas no espera: no es un retiro.
-- =========================================================
create or replace function cobrar_cashback(
  p_periodo_id    uuid,
  p_actor         text,
  p_modo          text,
  p_metodo_tipo   text default null,
  p_alias_tipo    text default null,
  p_alias_valor   text default null,
  p_banco         text default null,
  p_numero_cuenta text default null,
  p_titular       text default null,
  p_documento     text default null
)
returns cashback_periodos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cb    cashback_periodos;
  v_p     players;
  v_nota  text;
  v_tx    balance_transactions;
  v_after numeric;
  v_req   withdrawal_requests;
begin
  if p_modo not in ('fichas', 'retiro') then
    raise exception 'Modo inválido';
  end if;

  select * into v_cb from cashback_periodos where id = p_periodo_id for update;
  if not found then raise exception 'Cashback no encontrado'; end if;
  if v_cb.estado <> 'disponible' then
    raise exception 'Ese cashback ya fue % ', v_cb.estado;
  end if;

  select * into v_p from players where id = v_cb.player_id for update;
  if v_p.ban_permanente then raise exception 'La cuenta está suspendida'; end if;

  v_nota := 'Cashback semana ' || to_char(v_cb.periodo_inicio, 'DD/MM') ||
            '–' || to_char(v_cb.periodo_fin, 'DD/MM');

  if p_modo = 'fichas' then
    v_tx := wallet_movimiento(v_p.id, 'carga', v_cb.monto, v_nota, p_actor);

    perform sumar_bono_billetera(
      v_p.id, v_cb.monto,
      coalesce((select rollover from cashback_config where id = 1), 0),
      true, 'cashback', v_nota, null, v_tx.id
    );

    update cashback_periodos
    set estado = 'cobrado', modo = 'fichas', tx_id = v_tx.id,
        cobrado_por = p_actor, cobrado_at = now()
    where id = p_periodo_id
    returning * into v_cb;

    return v_cb;
  end if;

  perform assert_retiro_disponible(v_p.id);

  if p_metodo_tipo not in ('alias', 'cuenta') then
    raise exception 'Elegí cómo cobrar el retiro';
  end if;
  if exists (select 1 from withdrawal_requests
             where player_id = v_p.id and estado = 'pendiente') then
    raise exception 'El jugador ya tiene un retiro pendiente. Dáselo en fichas o esperá a que se resuelva.';
  end if;

  v_tx := wallet_movimiento(v_p.id, 'carga', v_cb.monto, v_nota || ' (a cobrar)', p_actor);

  select balance into v_after from players where id = v_p.id;

  update players
  set balance = v_after - v_cb.monto,
      balance_retenido = balance_retenido + v_cb.monto
  where id = v_p.id;

  insert into balance_transactions
    (player_id, type, amount, balance_before, balance_after, note, created_by)
  values
    (v_p.id, 'retiro', v_cb.monto, v_after, v_after - v_cb.monto, v_nota, p_actor);

  insert into withdrawal_requests
    (player_id, amount, nota_jugador, es_cashback,
     metodo_tipo, alias_tipo, alias_valor, banco, numero_cuenta, titular, documento)
  values
    (v_p.id, v_cb.monto, v_nota, true,
     p_metodo_tipo, p_alias_tipo, p_alias_valor, p_banco, p_numero_cuenta, p_titular, p_documento)
  returning * into v_req;

  update cashback_periodos
  set estado = 'cobrado', modo = 'retiro', tx_id = v_tx.id, withdrawal_id = v_req.id,
      cobrado_por = p_actor, cobrado_at = now()
  where id = p_periodo_id
  returning * into v_cb;

  return v_cb;
end;
$$;
