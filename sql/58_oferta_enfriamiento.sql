-- El reloj de cada oferta corre desde la última vez que ESE jugador
-- usó ESA promo (carga aprobada con oferta_id). Una carga normal
-- no lo reinicia. Si ya pasó el tiempo, queda disponible hasta que
-- la vuelva a usar.

create or replace function ofertas_carga_para(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_orden int := 0;
begin
  select coalesce(vn.orden, 0) into v_orden
  from players p
  left join vip_niveles vn on vn.id = p.vip_nivel_id
  where p.id = p_player_id;

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
        or u.usado_at is null
        or now() >= u.usado_at + make_interval(mins => o.enfriamiento_minutos)
      ),
      'espera_segundos', case
        when u.usado_at is null or o.enfriamiento_minutos = 0 then 0
        else greatest(0, extract(epoch from (
          (u.usado_at + make_interval(mins => o.enfriamiento_minutos)) - now()
        ))::int)
      end
    ) order by o.orden, o.created_at)
    from ofertas_carga o
    left join lateral (
      select max(d.resuelto_at) as usado_at
      from deposit_requests d
      where d.player_id = p_player_id
        and d.oferta_id = o.id
        and d.estado = 'aprobado'
    ) u on true
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
  v_uso timestamptz;
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

  select max(resuelto_at) into v_uso
  from deposit_requests
  where player_id = p_player_id
    and oferta_id = p_oferta_id
    and estado = 'aprobado';

  if o.enfriamiento_minutos > 0 and v_uso is not null
     and now() < v_uso + make_interval(mins => o.enfriamiento_minutos) then
    raise exception 'Esta oferta todavía está en espera. Volvé más tarde.';
  end if;

  v_bono := case when o.bono_tipo = 'porcentaje'
                 then round(p_monto * o.bono_valor / 100, 2)
                 else o.bono_valor end;

  return query select v_bono, coalesce(nullif(o.titulo, ''), o.nombre), o.rollover;
end;
$$;

notify pgrst, 'reload schema';
