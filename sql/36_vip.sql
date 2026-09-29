-- =========================================================
-- Niveles VIP (piedras preciosas)
--
-- El nivel se define por cuánto cargó el jugador en total (histórico,
-- solo cargas aprobadas — sin bono ni cashback). SOLO sube, nunca baja.
-- El operador puede forzar un nivel a mano (piso, no pin).
--
-- Cada nivel puede tener un ícono: gema dibujada (default), una imagen,
-- o una animación Lottie de la biblioteca (tabla `animaciones`).
--
-- El % de cashback del nivel reemplaza al global.
-- El multiplicador se aplicará al premio del giro diario cuando exista.
--
-- Después de correr este archivo:  notify pgrst, 'reload schema';
-- =========================================================

create table if not exists vip_niveles (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  color               text not null default '#c7ccd1',
  orden               int not null,
  umbral_cargado      numeric(14,2) not null default 0 check (umbral_cargado >= 0),
  cashback_pct        numeric(5,2) not null default 5 check (cashback_pct >= 0 and cashback_pct <= 100),
  giro_multiplicador  numeric(4,2) not null default 1 check (giro_multiplicador >= 1),
  bono_cumple         numeric(14,2) not null default 0 check (bono_cumple >= 0),
  bono_mensual        numeric(14,2) not null default 0 check (bono_mensual >= 0),
  imagen_url          text,
  animacion_id        uuid references animaciones(id) on delete set null,
  created_at          timestamptz not null default now()
);

create unique index if not exists idx_vip_orden on vip_niveles (orden);
create index if not exists idx_vip_umbral on vip_niveles (umbral_cargado);

alter table vip_niveles enable row level security;
-- Lectura pública: el portal muestra la escalera completa. Igual la
-- pide por /api. Sin policy de update => se edita por /api (Service Role).
drop policy if exists "cualquiera lee los niveles vip" on vip_niveles;
create policy "cualquiera lee los niveles vip" on vip_niveles for select using (true);

-- Niveles por defecto (se pueden borrar / editar desde el panel).
insert into vip_niveles (nombre, color, orden, umbral_cargado, cashback_pct, giro_multiplicador, bono_cumple, bono_mensual)
values
  ('Cuarzo',    '#c7ccd1', 1, 0,          5,  1, 0,      0),
  ('Esmeralda', '#2fbf71', 2, 500000,     7,  1, 20000,  0),
  ('Rubí',      '#e0384f', 3, 2000000,    10, 2, 50000,  30000),
  ('Zafiro',    '#3b82f6', 4, 8000000,    12, 2, 100000, 80000),
  ('Diamante',  '#7fe3ee', 5, 25000000,   15, 3, 300000, 200000)
on conflict do nothing;

-- ---------------------------------------------------------
-- Datos del jugador
-- ---------------------------------------------------------
alter table players
  add column if not exists cargado_historico  numeric(14,2) not null default 0 check (cargado_historico >= 0),
  add column if not exists vip_nivel_id        uuid references vip_niveles(id) on delete set null,
  add column if not exists vip_nivel_forzado   uuid references vip_niveles(id) on delete set null;

-- ---------------------------------------------------------
-- Nivel que le corresponde a un cargado histórico, respetando el
-- forzado como PISO (nunca por debajo).
-- ---------------------------------------------------------
create or replace function nivel_vip_para(p_cargado numeric, p_forzado uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_calc    uuid;
  v_o_calc  int;
  v_o_forz  int;
begin
  select id into v_calc
  from vip_niveles
  where umbral_cargado <= coalesce(p_cargado, 0)
  order by umbral_cargado desc, orden desc
  limit 1;

  if p_forzado is null then
    return v_calc;
  end if;

  select orden into v_o_calc from vip_niveles where id = v_calc;
  select orden into v_o_forz from vip_niveles where id = p_forzado;

  if v_o_forz >= coalesce(v_o_calc, 0) then
    return p_forzado;
  end if;
  return v_calc;
end;
$$;

-- ---------------------------------------------------------
-- Recalcular el histórico y el nivel de todos.
-- Corre en el cron diario y también con el botón "Recalcular ahora".
-- ---------------------------------------------------------
create or replace function recalcular_vip()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int := 0;
  v_row record;
begin
  for v_row in
    select p.id, p.vip_nivel_forzado,
           coalesce((select sum(amount) from deposit_requests dr
                     where dr.player_id = p.id and dr.estado = 'aprobado'), 0) as cargado
    from players p
  loop
    update players
    set cargado_historico = v_row.cargado,
        vip_nivel_id = nivel_vip_para(v_row.cargado, v_row.vip_nivel_forzado)
    where id = v_row.id
      and (cargado_historico is distinct from v_row.cargado
           or vip_nivel_id is distinct from nivel_vip_para(v_row.cargado, v_row.vip_nivel_forzado));

    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------
-- aprobar_deposito: además de acreditar, sube el histórico y el nivel
-- del jugador al instante (no hay que esperar al cron).
-- Redefine la versión de 32_candado_retiro.sql sumando ese bloque.
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
  v_cargado    numeric;
  v_forzado    uuid;
begin
  select * into v_req from deposit_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_req.estado <> 'pendiente' then raise exception 'La solicitud ya fue %', v_req.estado; end if;

  v_monto := coalesce(p_monto_real, v_req.amount);
  if v_monto <= 0 then raise exception 'El monto acreditado debe ser mayor a 0'; end if;

  select cb.bono_id, cb.bono_monto, cb.bono_nombre
  into v_bono_id, v_bono_mon, v_bono_nom
  from calcular_bono(v_req.player_id, v_monto) cb;

  v_tx := wallet_movimiento(
    v_req.player_id, 'carga', v_monto,
    coalesce(p_nota, 'Carga solicitada desde el portal'), p_created_by
  );

  if coalesce(v_bono_mon, 0) > 0 then
    v_tx_bono_id := (wallet_movimiento(
      v_req.player_id, 'carga', v_bono_mon,
      'Bono: ' || coalesce(v_bono_nom, 'promoción'), p_created_by
    )).id;
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

  -- VIP: histórico + nivel (solo cuenta la carga real, no el bono)
  update players
  set cargado_historico = cargado_historico + v_monto
  where id = v_req.player_id
  returning cargado_historico, vip_nivel_forzado into v_cargado, v_forzado;

  update players
  set vip_nivel_id = nivel_vip_para(v_cargado, v_forzado)
  where id = v_req.player_id;

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

-- ---------------------------------------------------------
-- cerrar_periodo_cashback: el % ahora sale del nivel VIP del jugador
-- (si no hay VIP, cae al % global de cashback_config).
-- Redefine la versión de 34_cashback.sql.
-- ---------------------------------------------------------
create or replace function cerrar_periodo_cashback(p_inicio date, p_fin date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg   cashback_config;
  v_desde timestamptz;
  v_hasta timestamptz;
  v_vence timestamptz;
  v_ins   int := 0;
  v_row   record;
  v_pct   numeric;
  v_monto numeric;
begin
  select * into v_cfg from cashback_config where id = 1;
  if not coalesce(v_cfg.activo, false) then return 0; end if;

  v_desde := (p_inicio::text || ' 00:00')::timestamp at time zone zona_casino();
  v_hasta := ((p_fin + 1)::text || ' 00:00')::timestamp at time zone zona_casino();
  v_vence := case when v_cfg.vence_dias > 0
                  then now() + make_interval(days => v_cfg.vence_dias) else null end;

  for v_row in
    select gr.player_id,
           sum(gr.bet) as apostado,
           sum(gr.win) as ganado,
           coalesce(vn.cashback_pct, v_cfg.porcentaje) as pct
    from game_rounds gr
    join players p on p.id = gr.player_id
    left join vip_niveles vn on vn.id = p.vip_nivel_id
    where gr.created_at >= v_desde
      and gr.created_at <  v_hasta
      and p.estado_verificacion = 'verificado'
      and exists (select 1 from deposit_requests dr
                  where dr.player_id = gr.player_id and dr.estado = 'aprobado')
    group by gr.player_id, coalesce(vn.cashback_pct, v_cfg.porcentaje)
    having sum(gr.bet) - sum(gr.win) > 0
       and sum(gr.bet) >= v_cfg.min_apostado
  loop
    v_pct := v_row.pct;
    v_monto := round((v_row.apostado - v_row.ganado) * v_pct / 100, 2);
    if v_monto <= 0 then continue; end if;

    insert into cashback_periodos
      (player_id, periodo_inicio, periodo_fin, apostado, ganado, perdida, porcentaje, monto, vence_at)
    values
      (v_row.player_id, p_inicio, p_fin, v_row.apostado, v_row.ganado,
       v_row.apostado - v_row.ganado, v_pct, v_monto, v_vence)
    on conflict (player_id, periodo_inicio) do nothing;

    if found then v_ins := v_ins + 1; end if;
  end loop;

  return v_ins;
end;
$$;

-- ---------------------------------------------------------
-- Que el cron diario recalcule también el VIP.
-- Redefine cashback_cron() de 34 sumando el perform.
-- ---------------------------------------------------------
create or replace function cashback_cron()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg      cashback_config;
  v_hoy      date := (now() at time zone zona_casino())::date;
  v_inicio   date;
  v_fin      date;
  v_cerrados int := 0;
  v_i        int;
  v_vip      int := 0;
begin
  select * into v_cfg from cashback_config where id = 1;

  if coalesce(v_cfg.activo, false) then
    for v_i in 0..4 loop
      if v_cfg.periodo = 'diario' then
        v_fin := v_hoy - 1 - v_i;
        v_inicio := v_fin;
      elsif v_cfg.periodo = 'mensual' then
        v_inicio := (date_trunc('month', v_hoy) - make_interval(months => v_i + 1))::date;
        v_fin := (date_trunc('month', v_inicio) + interval '1 month - 1 day')::date;
      else
        v_inicio := (v_hoy - (extract(isodow from v_hoy)::int - 1) - 7 * (v_i + 1));
        v_fin := v_inicio + 6;
      end if;
      v_cerrados := v_cerrados + cerrar_periodo_cashback(v_inicio, v_fin);
    end loop;
  end if;

  update cashback_periodos
  set estado = 'vencido'
  where estado = 'disponible' and vence_at is not null and vence_at < now();

  v_vip := recalcular_vip();

  return jsonb_build_object('cerrados', v_cerrados, 'vip_actualizados', v_vip, 'ok', true);
end;
$$;

-- ---------------------------------------------------------
-- Lista de jugadores para el panel: histórico, nivel, actividad 30d
-- ---------------------------------------------------------
create or replace function vip_jugadores(p_nivel uuid default null, p_buscar text default null)
returns table (
  player_id        uuid,
  player_number    int,
  username         text,
  display_name     text,
  vip_nivel_id     uuid,
  vip_nivel_forzado uuid,
  cargado_historico numeric,
  dias_jugo_30     bigint,
  ultimo_ingreso   timestamptz,
  ultimo_giro      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.player_number, p.username, p.display_name,
    p.vip_nivel_id, p.vip_nivel_forzado, p.cargado_historico,
    coalesce((select count(distinct (gr.created_at at time zone zona_casino())::date)
              from game_rounds gr
              where gr.player_id = p.id and gr.created_at > now() - interval '30 days'), 0),
    (select max(la.created_at) from login_attempts la
     where la.exitoso = true and la.username = p.username),
    (select max(gr.created_at) from game_rounds gr where gr.player_id = p.id)
  from players p
  where (p_nivel is null or p.vip_nivel_id = p_nivel)
    and (p_buscar is null or p_buscar = ''
         or p.username ilike '%' || p_buscar || '%'
         or p.display_name ilike '%' || p_buscar || '%'
         or p.player_number::text = p_buscar)
    and p.cargado_historico > 0
  order by p.cargado_historico desc
  limit 200
$$;

grant execute on function vip_jugadores(uuid, text) to authenticated;

-- ---------------------------------------------------------
-- Forzar / soltar el nivel de un jugador
-- ---------------------------------------------------------
create or replace function forzar_nivel_vip(p_player_id uuid, p_nivel_id uuid)
returns players
language plpgsql
security definer
set search_path = public
as $$
declare v_p players;
begin
  update players
  set vip_nivel_forzado = p_nivel_id,
      vip_nivel_id = nivel_vip_para(cargado_historico, p_nivel_id)
  where id = p_player_id
  returning * into v_p;

  if not found then raise exception 'Jugador no encontrado'; end if;
  return v_p;
end;
$$;

-- ---------------------------------------------------------
-- Heartbeats: los cambios de nivel del jugador y de config de niveles
-- ---------------------------------------------------------
drop trigger if exists trg_hb_portal on vip_niveles;
create trigger trg_hb_portal after insert or update or delete on vip_niveles
  for each statement execute function bump_portal_heartbeat();

-- Redefine el trigger de players (de 35) sumando vip_nivel_id al WHEN.
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
    old.vip_nivel_id       is distinct from new.vip_nivel_id or
    old.sesion_revocada_at is distinct from new.sesion_revocada_at
  )
  execute function trg_bump_ph_player();

-- Poblar cargado_historico y nivel de los jugadores ya existentes.
select recalcular_vip();
