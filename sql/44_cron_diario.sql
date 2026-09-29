-- =========================================================
-- Cron diario: limpieza + bonos VIP que sí se pagan
--
-- Hasta ahora /api/config?recurso=cron solo corría cashback_cron():
-- cierra períodos de cashback, vence los viejos y recalcula niveles.
-- Faltaban dos cosas que ya existían en el esquema y nadie disparaba:
--
--  1. limpiar_intentos() — login_attempts de más de 7 días. Sin esto
--     la tabla crece para siempre.
--  2. bono_cumple / bono_mensual de vip_niveles — se configuran en el
--     panel y se muestran en el portal, pero no había quién los
--     acreditara.
--
-- Esta corrida redefine cashback_cron() (el nombre se queda: lo llama
-- el cron de Vercel) y le suma las dos. Cada bloque va en su propio
-- begin/exception: si VIP falla, el cashback igual corre, y al revés.
--
-- Reglas de los bonos VIP
--  · Solo cuentas verificadas, sin ban permanente ni de recargas
--    (wallet_movimiento trata el crédito como 'carga').
--  · Cumpleaños: el día (zona del casino). Si el cron se salteó ayer,
--    se paga ayer. Feb 29 en año no bisiesto cae el 28. Una vez por
--    año (periodo = YYYY). No retroactivo más allá de ayer: desplegar
--    esto a mitad de año no acredita todos los cumpleaños de enero.
--  · Mensual: los días 1 y 2 del mes (el 2 cubre un cron caído el 1).
--    Una vez por mes (periodo = YYYY-MM), al nivel que tenga el
--    jugador en ese momento. Desplegar el día 15 no paga el mes en
--    curso: espera al 1 siguiente.
--  · Idempotente: vip_pagos tiene unique (player_id, tipo, periodo).
--    Si el crédito falla, se borra la reserva para que el próximo
--    cron reintente.
--  · Pasa por sumar_bono_billetera con origen 'vip' y rollover 0:
--    en modo simple es plata libre; en avanzado tampoco se pega
--    (mismo criterio que el giro diario por defecto).
--
-- Aditivo y repetible. Después:  notify pgrst, 'reload schema';
-- =========================================================

-- ---------------------------------------------------------
-- Auditoría de cada pago VIP. La unicidad es el candado.
-- ---------------------------------------------------------
create table if not exists vip_pagos (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  tipo         text not null check (tipo in ('cumple', 'mensual')),
  periodo      text not null,                 -- '2026' o '2026-09'
  monto        numeric(14,2) not null check (monto > 0),
  vip_nivel_id uuid references vip_niveles(id) on delete set null,
  tx_id        uuid references balance_transactions(id),
  created_at   timestamptz not null default now()
);

create unique index if not exists idx_vip_pagos_uno
  on vip_pagos (player_id, tipo, periodo);
create index if not exists idx_vip_pagos_created
  on vip_pagos (created_at desc);

alter table vip_pagos enable row level security;
drop policy if exists "staff lee vip_pagos" on vip_pagos;
create policy "staff lee vip_pagos" on vip_pagos
  for select using (es_staff());

comment on table vip_pagos is
  'Un pago de bono VIP por jugador y período. El cron inserta acá antes de acreditar.';

-- El ledger de bonos (modo avanzado) acepta origen 'vip'.
alter table bono_movimientos drop constraint if exists bono_movimientos_origen_check;
alter table bono_movimientos add constraint bono_movimientos_origen_check
  check (origen in (
    'registro','carga','referido','cashback','giro','promo',
    'manual','hito','vip','otro'
  ));

-- ---------------------------------------------------------
-- ¿Hoy (o la fecha dada) es el cumpleaños, en calendario civil?
-- Feb 29 en año no bisiesto se celebra el 28.
-- ---------------------------------------------------------
create or replace function es_cumpleanos(p_nacimiento date, p_dia date)
returns boolean
language sql
immutable
as $$
  select p_nacimiento is not null
     and p_dia is not null
     and (
       (extract(month from p_nacimiento) = extract(month from p_dia)
        and extract(day from p_nacimiento) = extract(day from p_dia))
       or (
         extract(month from p_nacimiento) = 2
         and extract(day from p_nacimiento) = 29
         and extract(month from p_dia) = 2
         and extract(day from p_dia) = 28
         and not (
           extract(year from p_dia)::int % 4 = 0
           and (extract(year from p_dia)::int % 100 <> 0
                or extract(year from p_dia)::int % 400 = 0)
         )
       )
     );
$$;

-- ---------------------------------------------------------
-- Acredita un bono VIP a un jugador. Reserva la fila primero
-- (unique), mueve el saldo, anota el tx. Si el movimiento falla,
-- borra la reserva para que el próximo cron reintente.
-- Devuelve true si acreditó, false si ya estaba pago o el monto
-- no aplica.
-- ---------------------------------------------------------
create or replace function pagar_vip_uno(
  p_player_id    uuid,
  p_tipo         text,
  p_periodo      text,
  p_monto        numeric,
  p_vip_nivel_id uuid,
  p_nivel_nombre text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago_id uuid;
  v_tx      balance_transactions;
  v_nota    text;
begin
  if coalesce(p_monto, 0) <= 0 then
    return false;
  end if;

  v_nota := case p_tipo
    when 'cumple'  then 'Bono VIP cumpleaños (' || coalesce(p_nivel_nombre, 'VIP') || ')'
    when 'mensual' then 'Bono VIP mensual ('    || coalesce(p_nivel_nombre, 'VIP') || ')'
    else 'Bono VIP'
  end;

  begin
    insert into vip_pagos (player_id, tipo, periodo, monto, vip_nivel_id)
    values (p_player_id, p_tipo, p_periodo, p_monto, p_vip_nivel_id)
    returning id into v_pago_id;
  exception when unique_violation then
    return false;
  end;

  begin
    v_tx := wallet_movimiento(
      p_player_id, 'carga', p_monto, v_nota, 'sistema:vip'
    );

    perform sumar_bono_billetera(
      p_player_id, p_monto, 0, true,
      'vip', v_nota, v_pago_id, v_tx.id
    );

    update vip_pagos set tx_id = v_tx.id where id = v_pago_id;
    return true;
  exception when others then
    delete from vip_pagos where id = v_pago_id;
    raise warning 'vip % %: %', p_tipo, p_player_id, sqlerrm;
    return false;
  end;
end;
$$;

-- ---------------------------------------------------------
-- Recorre a quién le toca hoy y paga. Idempotente.
-- ---------------------------------------------------------
create or replace function pagar_vip_beneficios()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy     date := (now() at time zone zona_casino())::date;
  v_ayer    date := v_hoy - 1;
  v_cumple  int := 0;
  v_mensual int := 0;
  v_row     record;
  v_fecha   date;
begin
  -- Cumpleaños: hoy, o ayer si el cron de ayer no corrió.
  for v_row in
    select p.id, p.fecha_nacimiento, p.vip_nivel_id,
           vn.nombre, vn.bono_cumple
    from players p
    join vip_niveles vn on vn.id = p.vip_nivel_id
    where p.fecha_nacimiento is not null
      and vn.bono_cumple > 0
      and p.estado_verificacion = 'verificado'
      and not coalesce(p.ban_permanente, false)
      and not coalesce(p.ban_recargas, false)
      and (
        es_cumpleanos(p.fecha_nacimiento, v_hoy)
        or es_cumpleanos(p.fecha_nacimiento, v_ayer)
      )
  loop
    v_fecha := case
      when es_cumpleanos(v_row.fecha_nacimiento, v_hoy) then v_hoy
      else v_ayer
    end;

    if pagar_vip_uno(
      v_row.id, 'cumple', to_char(v_fecha, 'YYYY'),
      v_row.bono_cumple, v_row.vip_nivel_id, v_row.nombre
    ) then
      v_cumple := v_cumple + 1;
    end if;
  end loop;

  -- Mensual: solo los primeros 2 días del mes (zona del casino).
  if extract(day from v_hoy) <= 2 then
    for v_row in
      select p.id, p.vip_nivel_id, vn.nombre, vn.bono_mensual
      from players p
      join vip_niveles vn on vn.id = p.vip_nivel_id
      where vn.bono_mensual > 0
        and p.estado_verificacion = 'verificado'
        and not coalesce(p.ban_permanente, false)
        and not coalesce(p.ban_recargas, false)
    loop
      if pagar_vip_uno(
        v_row.id, 'mensual', to_char(v_hoy, 'YYYY-MM'),
        v_row.bono_mensual, v_row.vip_nivel_id, v_row.nombre
      ) then
        v_mensual := v_mensual + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object('cumple', v_cumple, 'mensual', v_mensual);
end;
$$;

-- ---------------------------------------------------------
-- Limpieza de logins fallidos. Ahora devuelve cuántos borró.
-- ---------------------------------------------------------
drop function if exists limpiar_intentos();

create or replace function limpiar_intentos()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  delete from login_attempts where created_at < now() - interval '7 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------
-- cashback_cron — el cron de Vercel sigue llamando a este nombre.
-- Cada bloque aislado: un fallo no cancela el resto.
-- Redefine sql/36_vip.sql.
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
  v_intentos int := 0;
  v_pagos    jsonb := '{"cumple":0,"mensual":0}'::jsonb;
begin
  -- 1. Cashback: cerrar períodos completos y vencer los viejos.
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
  exception when others then
    raise warning 'cron cashback: %', sqlerrm;
  end;

  -- 2. Niveles VIP (histórico de cargas).
  begin
    v_vip := recalcular_vip();
  exception when others then
    raise warning 'cron recalcular_vip: %', sqlerrm;
  end;

  -- 3. Logins fallidos de más de 7 días.
  begin
    v_intentos := limpiar_intentos();
  exception when others then
    raise warning 'cron limpiar_intentos: %', sqlerrm;
  end;

  -- 4. Bonos de cumpleaños y mensual.
  begin
    v_pagos := pagar_vip_beneficios();
  exception when others then
    raise warning 'cron pagar_vip: %', sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'cerrados', v_cerrados,
    'vip_actualizados', v_vip,
    'intentos_borrados', v_intentos,
    'vip_cumple', coalesce((v_pagos->>'cumple')::int, 0),
    'vip_mensual', coalesce((v_pagos->>'mensual')::int, 0)
  );
end;
$$;

notify pgrst, 'reload schema';
