-- =========================================================
-- Bonos por carga N + Hitos de carga (escalera de lealtad)
--
--  Parte 1 — objetivo "carga N": un bono o un código promo que solo
--  aplica en la carga número X del jugador (o en un rango).
--
--  Parte 2 — hitos: "cada N cargas de >= X → bono", con el valor subiendo
--  en cada hito completado, ventana opcional (racha) y gate por VIP.
--
--  Todo pasa por sumar_bono_billetera → respeta billetera_config.modo_avanzado.
--
-- Después de correr este archivo:  notify pgrst, 'reload schema';
-- =========================================================

-- ---------------------------------------------------------
-- Parte 1 — columnas de "carga N"
-- ---------------------------------------------------------
alter table bonos
  add column if not exists carga_num_min int not null default 0 check (carga_num_min >= 0),
  add column if not exists carga_num_max int not null default 0 check (carga_num_max >= 0);

alter table promo_codigos
  add column if not exists carga_num_min int not null default 0 check (carga_num_min >= 0),
  add column if not exists carga_num_max int not null default 0 check (carga_num_max >= 0);

-- =========================================================
-- calcular_bono — redefine sql/40: + filtro de carga N.
-- =========================================================
create or replace function calcular_bono(
  p_player_id uuid,
  p_monto     numeric
)
returns table (bono_id uuid, bono_monto numeric, bono_nombre text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_es_primera boolean;
  v_bono       bonos;
  v_monto      numeric;
  v_vip_orden  int;
  v_carga_num  int;
begin
  select not exists (
    select 1 from deposit_requests
    where player_id = p_player_id and estado = 'aprobado'
  ) into v_es_primera;

  -- Número de esta carga = aprobadas hasta ahora + 1.
  select coalesce(count(*), 0) + 1 into v_carga_num
  from deposit_requests where player_id = p_player_id and estado = 'aprobado';

  select coalesce(vn.orden, 0) into v_vip_orden
  from players p left join vip_niveles vn on vn.id = p.vip_nivel_id
  where p.id = p_player_id;

  select * into v_bono
  from bonos b
  where b.activo = true
    and (b.desde is null or b.desde <= now())
    and (b.hasta is null or b.hasta >= now())
    and p_monto >= b.monto_min
    and (b.monto_max is null or p_monto <= b.monto_max)
    and (b.aplica = 'todas' or v_es_primera)
    and (b.vip_nivel_min is null
         or v_vip_orden >= (select orden from vip_niveles where id = b.vip_nivel_min))
    and (b.dias_sin_cargar = 0 or not exists (
          select 1 from deposit_requests dr
          where dr.player_id = p_player_id and dr.estado = 'aprobado'
            and dr.resuelto_at > now() - make_interval(days => b.dias_sin_cargar)))
    and (not b.solo_sin_deposito or v_es_primera)
    and (b.tope_usos = 0 or b.usos < b.tope_usos)
    and (b.presupuesto = 0 or b.repartido < b.presupuesto)
    -- [carga N]
    and (b.carga_num_min = 0 or v_carga_num >= b.carga_num_min)
    and (b.carga_num_max = 0 or v_carga_num <= b.carga_num_max)
  order by b.orden asc, b.monto_min desc
  limit 1;

  if not found then
    return query select null::uuid, 0::numeric, null::text;
    return;
  end if;

  if v_bono.tipo = 'porcentaje' then
    v_monto := round(p_monto * v_bono.valor / 100, 2);
    if v_bono.tope is not null and v_monto > v_bono.tope then
      v_monto := v_bono.tope;
    end if;
  else
    v_monto := v_bono.valor;
  end if;

  return query select v_bono.id, v_monto, v_bono.nombre;
end;
$$;

-- =========================================================
-- calcular_promo — gana p_player_id y el filtro de carga N.
-- =========================================================
drop function if exists calcular_promo(text, numeric);

create or replace function calcular_promo(
  p_codigo    text,
  p_monto     numeric,
  p_player_id uuid default null
)
returns table (promo_id uuid, promo_monto numeric, promo_rollover numeric, promo_codigo text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p         promo_codigos;
  v_monto     numeric;
  v_carga_num int;
begin
  select * into v_p from promo_codigos
  where codigo = upper(trim(coalesce(p_codigo, '')));

  if not found or not v_p.activo then
    return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
  end if;
  if v_p.desde is not null and v_p.desde > now() then
    return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
  end if;
  if v_p.hasta is not null and v_p.hasta < now() then
    return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
  end if;
  if v_p.tope_usos > 0 and v_p.usos >= v_p.tope_usos then
    return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
  end if;
  if coalesce(p_monto, 0) < v_p.min_carga then
    return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
  end if;

  -- [carga N] solo si sabemos quién es el jugador
  if (v_p.carga_num_min > 0 or v_p.carga_num_max > 0) then
    if p_player_id is null then
      return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
    end if;
    select coalesce(count(*), 0) + 1 into v_carga_num
    from deposit_requests where player_id = p_player_id and estado = 'aprobado';
    if v_p.carga_num_min > 0 and v_carga_num < v_p.carga_num_min then
      return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
    end if;
    if v_p.carga_num_max > 0 and v_carga_num > v_p.carga_num_max then
      return query select null::uuid, 0::numeric, 0::numeric, null::text; return;
    end if;
  end if;

  if v_p.tipo = 'porcentaje' then
    v_monto := round(coalesce(p_monto, 0) * v_p.valor / 100, 2);
    if v_p.tope is not null and v_monto > v_p.tope then v_monto := v_p.tope; end if;
  else
    v_monto := v_p.valor;
  end if;

  return query select v_p.id, v_monto, v_p.rollover, v_p.codigo;
end;
$$;

-- =========================================================
-- Parte 2 — Hitos de carga
-- =========================================================
create table if not exists bono_hitos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  activo           boolean not null default true,
  cada_cargas      int not null check (cada_cargas > 0),
  min_por_carga    numeric(14,2) not null default 0 check (min_por_carga >= 0),
  ventana_dias     int not null default 0 check (ventana_dias >= 0),   -- 0 = sin ventana
  tipo             text not null check (tipo in ('porcentaje','fijo')),
  valor            numeric(14,2) not null check (valor > 0),           -- valor del 1er hito
  valor_incremento numeric(14,2) not null default 0 check (valor_incremento >= 0),
  valor_max        numeric(14,2),                                      -- null = sin techo
  tope             numeric(14,2),                                      -- techo del monto si es %
  rollover         numeric(6,2) not null default 1 check (rollover >= 0),
  vip_nivel_min    uuid references vip_niveles(id) on delete set null,
  tope_hitos       int not null default 0 check (tope_hitos >= 0),     -- 0 = infinito
  created_by       text,
  created_at       timestamptz not null default now()
);

alter table bono_hitos enable row level security;
drop policy if exists "staff lee bono_hitos" on bono_hitos;
create policy "staff lee bono_hitos" on bono_hitos for select using (es_staff());

create table if not exists player_hitos (
  player_id         uuid not null references players(id) on delete cascade,
  hito_id           uuid not null references bono_hitos(id) on delete cascade,
  cargas_contadas   int not null default 0,
  hitos_completados int not null default 0,
  ultima_carga_at   timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (player_id, hito_id)
);
create index if not exists idx_player_hitos_hito on player_hitos (hito_id);

alter table player_hitos enable row level security;
drop policy if exists "staff lee player_hitos" on player_hitos;
create policy "staff lee player_hitos" on player_hitos for select using (es_staff());

-- El origen 'hito' en el ledger de bonos.
alter table bono_movimientos drop constraint if exists bono_movimientos_origen_check;
alter table bono_movimientos add constraint bono_movimientos_origen_check
  check (origen in ('registro','carga','referido','cashback','giro','promo','manual','hito','otro'));

-- =========================================================
-- aprobar_deposito — redefine sql/40:
--   + calcular_promo con p_player_id
--   + bloque de hitos de carga tras la acreditación
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
  -- hitos
  v_vip_orden  int;
  h            bono_hitos;
  ph           player_hitos;
  v_cont       int;
  v_valor      numeric;
  v_bono_h     numeric;
  v_txh        balance_transactions;
begin
  select * into v_req from deposit_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_req.estado <> 'pendiente' then raise exception 'La solicitud ya fue %', v_req.estado; end if;

  v_monto := coalesce(p_monto_real, v_req.amount);
  if v_monto <= 0 then raise exception 'El monto acreditado debe ser mayor a 0'; end if;

  -- ¿Vino con código promocional válido? El código REEMPLAZA al bono automático.
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
    v_bono_mon  := v_promo_mon;
    v_bono_nom  := 'Código ' || v_promo_cod;
    v_roll      := coalesce(v_promo_roll, 1);
    v_origen    := 'promo';
    v_origen_id := v_promo_id;
    v_referencia := v_promo_cod;
  else
    select cb.bono_id, cb.bono_monto, cb.bono_nombre
    into v_bono_id, v_bono_mon, v_bono_nom
    from calcular_bono(v_req.player_id, v_monto) cb;
    v_roll      := coalesce((select rollover from bonos where id = v_bono_id), 1);
    v_origen    := 'carga';
    v_origen_id := v_bono_id;
    v_referencia := v_bono_nom;
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
      true, v_origen, v_referencia, v_origen_id, v_tx_bono_id
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
  -- Hitos de carga: esta carga suma al contador de cada hito que califica.
  -- Se acredita ENCIMA del bono automático / la promo (es lealtad, no
  -- este depósito puntual).
  -- ---------------------------------------------------------
  select coalesce(vn.orden, 0) into v_vip_orden
  from players p left join vip_niveles vn on vn.id = p.vip_nivel_id
  where p.id = v_req.player_id;

  for h in select * from bono_hitos where activo loop
    if v_monto < h.min_por_carga then continue; end if;
    if h.vip_nivel_min is not null
       and v_vip_orden < coalesce((select orden from vip_niveles where id = h.vip_nivel_min), 0)
    then continue; end if;

    select * into ph from player_hitos
    where player_id = v_req.player_id and hito_id = h.id;

    if h.tope_hitos > 0 and coalesce(ph.hitos_completados, 0) >= h.tope_hitos then
      continue;
    end if;

    v_cont := coalesce(ph.cargas_contadas, 0);
    -- racha rota: pasó demasiado tiempo desde la última carga que contó
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
          true, 'hito', h.nombre, h.id, v_txh.id
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
-- mis_hitos — progreso del jugador en los hitos que califica.
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
    'nombre',           h.nombre,
    'cada_cargas',      h.cada_cargas,
    'min_por_carga',    h.min_por_carga,
    'tipo',             h.tipo,
    'ventana_dias',     h.ventana_dias,
    'cargas_contadas',  coalesce(ph.cargas_contadas, 0),
    'faltan',           greatest(0, h.cada_cargas - coalesce(ph.cargas_contadas, 0)),
    'hitos_completados', coalesce(ph.hitos_completados, 0),
    'proximo_valor',    h.valor + h.valor_incremento * coalesce(ph.hitos_completados, 0),
    'vence_at',         case when h.ventana_dias > 0 and ph.ultima_carga_at is not null
                             then ph.ultima_carga_at + make_interval(days => h.ventana_dias)
                             else null end
  ) order by h.created_at), '[]'::jsonb)
  from bono_hitos h
  cross join vip
  left join player_hitos ph on ph.hito_id = h.id and ph.player_id = p_player_id
  where h.activo
    and (h.tope_hitos = 0 or coalesce(ph.hitos_completados, 0) < h.tope_hitos)
    and (h.vip_nivel_min is null
         or vip.orden >= coalesce((select orden from vip_niveles where id = h.vip_nivel_min), 0));
$$;
grant execute on function mis_hitos(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
