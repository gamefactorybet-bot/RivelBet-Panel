-- Ofertas de carga (opt-in): el jugador elige UNA en Recargar.
-- Condicionadas (monto mínimo), no acumulables, con enfriamiento
-- desde la última carga aprobada y filtro por nivel VIP.

create table if not exists ofertas_carga (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  titulo                text,
  subtitulo             text,
  imagen_url            text,
  video_url             text,
  monto_min             numeric(14,2) not null check (monto_min > 0),
  bono_tipo             text not null default 'fijo' check (bono_tipo in ('fijo', 'porcentaje')),
  bono_valor            numeric(14,2) not null check (bono_valor > 0),
  rollover              numeric(6,2) not null default 0 check (rollover >= 0),
  enfriamiento_minutos  int not null default 60 check (enfriamiento_minutos >= 0),
  vip_nivel_min         uuid references vip_niveles(id) on delete set null,
  vip_nivel_max         uuid references vip_niveles(id) on delete set null,
  activo                boolean not null default true,
  orden                 int not null default 0,
  desde                 timestamptz,
  hasta                 timestamptz,
  created_by            text,
  created_at            timestamptz not null default now()
);

create index if not exists idx_ofertas_carga_activos on ofertas_carga (activo, orden);

alter table ofertas_carga enable row level security;
drop policy if exists "cualquiera lee ofertas de carga activas" on ofertas_carga;
create policy "cualquiera lee ofertas de carga activas"
  on ofertas_carga for select using (activo = true);

alter table deposit_requests
  add column if not exists oferta_id uuid references ofertas_carga(id);

-- ---------------------------------------------------------
create or replace function ofertas_carga_para(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_orden int := 0;
  v_ultima timestamptz;
begin
  select coalesce(vn.orden, 0) into v_orden
  from players p
  left join vip_niveles vn on vn.id = p.vip_nivel_id
  where p.id = p_player_id;

  select max(resuelto_at) into v_ultima
  from deposit_requests
  where player_id = p_player_id and estado = 'aprobado';

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id,
      'nombre', o.nombre,
      'titulo', coalesce(nullif(o.titulo, ''), o.nombre),
      'subtitulo', o.subtitulo,
      'imagen_url', o.imagen_url,
      'video_url', o.video_url,
      'monto_min', o.monto_min,
      'bono_tipo', o.bono_tipo,
      'bono_valor', o.bono_valor,
      'rollover', o.rollover,
      'enfriamiento_minutos', o.enfriamiento_minutos,
      'disponible', (
        o.enfriamiento_minutos = 0
        or v_ultima is null
        or now() >= v_ultima + make_interval(mins => o.enfriamiento_minutos)
      ),
      'espera_segundos', case
        when v_ultima is null or o.enfriamiento_minutos = 0 then 0
        else greatest(0, extract(epoch from (
          (v_ultima + make_interval(mins => o.enfriamiento_minutos)) - now()
        ))::int)
      end
    ) order by o.orden, o.created_at)
    from ofertas_carga o
    where o.activo
      and (o.desde is null or o.desde <= now())
      and (o.hasta is null or o.hasta >= now())
      and (o.vip_nivel_min is null
           or v_orden >= coalesce((select orden from vip_niveles where id = o.vip_nivel_min), 0))
      and (o.vip_nivel_max is null
           or v_orden <= coalesce((select orden from vip_niveles where id = o.vip_nivel_max), 999))
  ), '[]'::jsonb);
end;
$$;
grant execute on function ofertas_carga_para(uuid) to anon, authenticated;

create or replace function validar_oferta_carga(p_oferta_id uuid, p_player_id uuid, p_monto numeric)
returns table (bono_monto numeric, bono_nombre text, rollover numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o ofertas_carga;
  v_orden int := 0;
  v_ultima timestamptz;
  v_bono numeric;
begin
  select * into o from ofertas_carga where id = p_oferta_id;
  if not found or not o.activo then
    raise exception 'Esa oferta ya no está disponible.';
  end if;
  if o.desde is not null and o.desde > now() then
    raise exception 'Esa oferta todavía no empezó.';
  end if;
  if o.hasta is not null and o.hasta < now() then
    raise exception 'Esa oferta ya venció.';
  end if;
  if p_monto < o.monto_min then
    raise exception 'Esta oferta pide una carga de al menos %', o.monto_min;
  end if;

  select coalesce(vn.orden, 0) into v_orden
  from players p
  left join vip_niveles vn on vn.id = p.vip_nivel_id
  where p.id = p_player_id;

  if o.vip_nivel_min is not null
     and v_orden < coalesce((select orden from vip_niveles where id = o.vip_nivel_min), 0) then
    raise exception 'Esta oferta es para otro nivel VIP.';
  end if;
  if o.vip_nivel_max is not null
     and v_orden > coalesce((select orden from vip_niveles where id = o.vip_nivel_max), 999) then
    raise exception 'Esta oferta es para otro nivel VIP.';
  end if;

  select max(resuelto_at) into v_ultima
  from deposit_requests
  where player_id = p_player_id and estado = 'aprobado';

  if o.enfriamiento_minutos > 0 and v_ultima is not null
     and now() < v_ultima + make_interval(mins => o.enfriamiento_minutos) then
    raise exception 'Esta oferta vuelve después de tu última carga.';
  end if;

  v_bono := case when o.bono_tipo = 'porcentaje'
                 then round(p_monto * o.bono_valor / 100, 2)
                 else o.bono_valor end;

  return query select v_bono, coalesce(nullif(o.titulo, ''), o.nombre), o.rollover;
end;
$$;
grant execute on function validar_oferta_carga(uuid, uuid, numeric) to anon, authenticated;

-- aprobar_deposito: si hay oferta_id, esa pisa código y bono automático.
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

  if v_req.oferta_id is not null then
    select voc.bono_monto, voc.bono_nombre, voc.rollover
    into v_bono_mon, v_bono_nom, v_roll
    from validar_oferta_carga(v_req.oferta_id, v_req.player_id, v_monto) voc;
    v_origen     := 'oferta';
    v_origen_id  := v_req.oferta_id;
    v_referencia := v_bono_nom;
    v_tope_mult  := null;
    v_bono_id    := null;
  elsif coalesce(trim(v_req.promo_codigo), '') <> '' then
    select cp.promo_id, cp.promo_monto, cp.promo_rollover, cp.promo_codigo
    into v_promo_id, v_promo_mon, v_promo_roll, v_promo_cod
    from calcular_promo(v_req.promo_codigo, v_monto, v_req.player_id) cp;

    if v_promo_id is not null and exists (
         select 1 from promo_canjes where codigo_id = v_promo_id and player_id = v_req.player_id) then
      v_promo_id := null;
    end if;

    if v_promo_id is not null and coalesce(v_promo_mon, 0) > 0 then
      v_bono_mon   := v_promo_mon;
      v_bono_nom   := 'Código ' || v_promo_cod;
      v_roll       := coalesce(v_promo_roll, 1);
      v_origen     := 'promo';
      v_origen_id  := v_promo_id;
      v_referencia := v_promo_cod;
      v_tope_mult  := (select tope_conversion_mult from promo_codigos where id = v_promo_id);
    end if;
  end if;

  if v_origen is null then
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

  update players
  set cargado_historico = cargado_historico + v_monto
  where id = v_req.player_id
  returning cargado_historico, vip_nivel_forzado into v_cargado, v_forzado;

  update players
  set vip_nivel_id = nivel_vip_para(v_cargado, v_forzado)
  where id = v_req.player_id;

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

notify pgrst, 'reload schema';

