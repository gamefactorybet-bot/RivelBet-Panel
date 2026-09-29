-- =========================================================
-- Rotación de cuentas bancarias
-- Dos modos, elegibles desde el panel:
--   'monto'  -> le toca a la que menos recibió (desempata por usos)
--   'turnos' -> round-robin: sigue la que viene después de la última usada
-- =========================================================

alter table casino_settings
  add column if not exists rotacion_modo     text not null default 'monto'
    check (rotacion_modo in ('monto', 'turnos', 'manual')),
  add column if not exists rotacion_reinicio text not null default 'diario'
    check (rotacion_reinicio in ('diario', 'mensual', 'nunca'));

-- 'manual' = sin rotación: el jugador ve todas y elige, como hasta ahora.

alter table bank_accounts
  add column if not exists tope_periodo numeric(14,2);

comment on column bank_accounts.tope_periodo is
  'Máximo que puede recibir en el período. Al llegar, sale de la rotación. Nulo = sin techo.';

-- ---------------------------------------------------------
-- Cuánto lleva recibido cada cuenta en el período vigente
-- ---------------------------------------------------------
create or replace function stats_cuentas()
returns table (
  account_id  uuid,
  recibido    numeric,
  usos        bigint,
  ultimo_uso  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reinicio text;
  v_desde    timestamptz;
begin
  select rotacion_reinicio into v_reinicio from casino_settings where id = 1;

  v_desde := case coalesce(v_reinicio, 'diario')
    when 'diario'  then date_trunc('day', now())
    when 'mensual' then date_trunc('month', now())
    else '-infinity'::timestamptz
  end;

  return query
  select
    ba.id,
    coalesce(sum(dr.amount), 0)::numeric,
    count(dr.id)::bigint,
    max(dr.resuelto_at)
  from bank_accounts ba
  left join deposit_requests dr
    on dr.account_id = ba.id
   and dr.estado = 'aprobado'
   and dr.resuelto_at >= v_desde
  where ba.activa = true
  group by ba.id;
end;
$$;

-- ---------------------------------------------------------
-- Elegir la cuenta que le toca al próximo jugador
-- Se llama al abrir la pantalla de recarga; la cuenta elegida queda
-- fijada a esa solicitud, aunque después la rotación avance.
-- ---------------------------------------------------------
create or replace function elegir_cuenta()
returns bank_accounts
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_modo    text;
  v_cuenta  bank_accounts;
  v_ultimo  int;
begin
  select rotacion_modo into v_modo from casino_settings where id = 1;

  if v_modo = 'turnos' then
    -- Round-robin por el campo `orden`: buscamos el orden de la última
    -- cuenta usada y tomamos la siguiente. Si no hay ninguna usada o
    -- era la última de la lista, arrancamos de nuevo por la primera.
    select ba.orden into v_ultimo
    from deposit_requests dr
    join bank_accounts ba on ba.id = dr.account_id
    where dr.estado = 'aprobado'
    order by dr.resuelto_at desc nulls last
    limit 1;

    select ba.* into v_cuenta
    from bank_accounts ba
    left join stats_cuentas() s on s.account_id = ba.id
    where ba.activa = true
      and (ba.tope_periodo is null or coalesce(s.recibido, 0) < ba.tope_periodo)
      and ba.orden > coalesce(v_ultimo, -1)
    order by ba.orden asc
    limit 1;

    if found then
      return v_cuenta;
    end if;

    -- Dio la vuelta: volvemos al principio
    select ba.* into v_cuenta
    from bank_accounts ba
    left join stats_cuentas() s on s.account_id = ba.id
    where ba.activa = true
      and (ba.tope_periodo is null or coalesce(s.recibido, 0) < ba.tope_periodo)
    order by ba.orden asc
    limit 1;

    return v_cuenta;
  end if;

  -- Modo 'monto' (por defecto): la que menos recibió en el período.
  -- Desempata por cantidad de usos, y después por orden, para que el
  -- resultado sea siempre el mismo ante los mismos datos.
  select ba.* into v_cuenta
  from bank_accounts ba
  left join stats_cuentas() s on s.account_id = ba.id
  where ba.activa = true
    and (ba.tope_periodo is null or coalesce(s.recibido, 0) < ba.tope_periodo)
  order by coalesce(s.recibido, 0) asc, coalesce(s.usos, 0) asc, ba.orden asc
  limit 1;

  return v_cuenta;
end;
$$;
