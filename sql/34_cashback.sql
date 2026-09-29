-- =========================================================
-- Cashback semanal
--
-- Al cerrar el período, cada jugador que perdió plata neta jugando
-- recibe un % de vuelta. El operador lo entrega desde el panel (en
-- fichas o pagándolo como retiro) o el jugador lo reclama del portal.
--
-- Reglas anti-abuso:
--  - Solo cuentas verificadas y con al menos una carga aprobada. Así
--    nunca se paga cashback sobre pérdidas que fueron fichas de bono,
--    y todo retiro de cashback está respaldado por plata real.
--  - Mínimo de apuestas en el período para calificar.
--  - Si el jugador quedó ganador neto, no hay cashback.
--
-- El cierre del período lo dispara el cron diario (/api/config?recurso=cron):
-- cierra cualquier período completo que todavía no se haya cerrado y
-- vence los que pasaron su fecha. Idempotente.
--
-- Después de correr este archivo:  notify pgrst, 'reload schema';
-- =========================================================

-- ---------------------------------------------------------
-- Config — una sola fila (id = 1)
-- ---------------------------------------------------------
create table if not exists cashback_config (
  id           int primary key default 1 check (id = 1),
  activo       boolean not null default false,
  porcentaje   numeric(5,2) not null default 10 check (porcentaje > 0 and porcentaje <= 100),
  periodo      text not null default 'semanal' check (periodo in ('semanal', 'mensual', 'diario')),
  min_apostado numeric(14,2) not null default 0 check (min_apostado >= 0),
  vence_dias   int not null default 7 check (vence_dias >= 0),   -- 0 = no vence
  updated_by   text,
  updated_at   timestamptz not null default now()
);

insert into cashback_config (id) values (1) on conflict (id) do nothing;

alter table cashback_config enable row level security;
drop policy if exists "staff lee cashback config" on cashback_config;
create policy "staff lee cashback config" on cashback_config for select using (es_staff());

-- ---------------------------------------------------------
-- Un cashback por jugador y período
-- ---------------------------------------------------------
create table if not exists cashback_periodos (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references players(id) on delete cascade,
  periodo_inicio date not null,
  periodo_fin    date not null,
  apostado       numeric(14,2) not null,
  ganado         numeric(14,2) not null,
  perdida        numeric(14,2) not null check (perdida > 0),
  porcentaje     numeric(5,2) not null,
  monto          numeric(14,2) not null check (monto > 0),
  estado         text not null default 'disponible' check (estado in ('disponible', 'cobrado', 'vencido')),
  modo           text check (modo in ('fichas', 'retiro')),
  tx_id          uuid references balance_transactions(id),
  withdrawal_id  uuid references withdrawal_requests(id),
  cobrado_por    text,
  cobrado_at     timestamptz,
  vence_at       timestamptz,
  created_at     timestamptz not null default now()
);

create unique index if not exists idx_cashback_uno on cashback_periodos (player_id, periodo_inicio);
create index if not exists idx_cashback_estado on cashback_periodos (estado, created_at desc);

alter table cashback_periodos enable row level security;
drop policy if exists "staff lee cashback" on cashback_periodos;
create policy "staff lee cashback" on cashback_periodos for select using (es_staff());

-- El retiro de cashback lleva una marca para que Solicitudes y el
-- aviso de Telegram lo identifiquen.
alter table withdrawal_requests
  add column if not exists es_cashback boolean not null default false;

-- ---------------------------------------------------------
-- Cerrar un período: calcula e inserta el cashback de cada jugador
-- que califica. on conflict do nothing => se puede volver a llamar.
-- ---------------------------------------------------------
create or replace function cerrar_periodo_cashback(p_inicio date, p_fin date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg    cashback_config;
  v_desde  timestamptz;
  v_hasta  timestamptz;
  v_vence  timestamptz;
  v_ins    int := 0;
  v_row    record;
  v_monto  numeric;
begin
  select * into v_cfg from cashback_config where id = 1;
  if not coalesce(v_cfg.activo, false) then
    return 0;
  end if;

  v_desde := (p_inicio::text || ' 00:00')::timestamp at time zone zona_casino();
  v_hasta := ((p_fin + 1)::text || ' 00:00')::timestamp at time zone zona_casino();
  v_vence := case when v_cfg.vence_dias > 0
                  then now() + make_interval(days => v_cfg.vence_dias)
                  else null end;

  for v_row in
    select
      gr.player_id,
      sum(gr.bet) as apostado,
      sum(gr.win) as ganado
    from game_rounds gr
    join players p on p.id = gr.player_id
    where gr.created_at >= v_desde
      and gr.created_at <  v_hasta
      and p.estado_verificacion = 'verificado'
      and exists (
        select 1 from deposit_requests dr
        where dr.player_id = gr.player_id and dr.estado = 'aprobado'
      )
    group by gr.player_id
    having sum(gr.bet) - sum(gr.win) > 0
       and sum(gr.bet) >= v_cfg.min_apostado
  loop
    v_monto := round((v_row.apostado - v_row.ganado) * v_cfg.porcentaje / 100, 2);
    if v_monto <= 0 then
      continue;
    end if;

    insert into cashback_periodos
      (player_id, periodo_inicio, periodo_fin, apostado, ganado, perdida, porcentaje, monto, vence_at)
    values
      (v_row.player_id, p_inicio, p_fin, v_row.apostado, v_row.ganado,
       v_row.apostado - v_row.ganado, v_cfg.porcentaje, v_monto, v_vence)
    on conflict (player_id, periodo_inicio) do nothing;

    if found then
      v_ins := v_ins + 1;
    end if;
  end loop;

  return v_ins;
end;
$$;

-- ---------------------------------------------------------
-- Lo que llama el cron: cierra los últimos períodos completos que
-- falten y vence los que pasaron su fecha.
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
begin
  select * into v_cfg from cashback_config where id = 1;

  if coalesce(v_cfg.activo, false) then
    -- Cierra hasta 5 períodos completos hacia atrás (self-heal si el
    -- cron se saltea algún día).
    for v_i in 0..4 loop
      if v_cfg.periodo = 'diario' then
        v_fin := v_hoy - 1 - v_i;
        v_inicio := v_fin;
      elsif v_cfg.periodo = 'mensual' then
        v_inicio := (date_trunc('month', v_hoy) - make_interval(months => v_i + 1))::date;
        v_fin := (date_trunc('month', v_inicio) + interval '1 month - 1 day')::date;
      else  -- semanal: lunes a domingo
        v_inicio := (v_hoy - (extract(isodow from v_hoy)::int - 1) - 7 * (v_i + 1));
        v_fin := v_inicio + 6;
      end if;

      v_cerrados := v_cerrados + cerrar_periodo_cashback(v_inicio, v_fin);
    end loop;
  end if;

  update cashback_periodos
  set estado = 'vencido'
  where estado = 'disponible'
    and vence_at is not null
    and vence_at < now();

  return jsonb_build_object('cerrados', v_cerrados, 'ok', true);
end;
$$;

-- ---------------------------------------------------------
-- Cobrar un cashback: en fichas (al saldo) o como retiro (solicitud
-- pendiente que aprueba un cajero, sin pasar por el piso del bono).
-- ---------------------------------------------------------
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
  if not found then
    raise exception 'Cashback no encontrado';
  end if;
  if v_cb.estado <> 'disponible' then
    raise exception 'Ese cashback ya fue % ', v_cb.estado;
  end if;

  select * into v_p from players where id = v_cb.player_id for update;
  if v_p.ban_permanente then
    raise exception 'La cuenta está suspendida';
  end if;

  v_nota := 'Cashback semana ' || to_char(v_cb.periodo_inicio, 'DD/MM') ||
            '–' || to_char(v_cb.periodo_fin, 'DD/MM');

  if p_modo = 'fichas' then
    v_tx := wallet_movimiento(v_p.id, 'carga', v_cb.monto, v_nota, p_actor);

    update cashback_periodos
    set estado = 'cobrado', modo = 'fichas', tx_id = v_tx.id,
        cobrado_por = p_actor, cobrado_at = now()
    where id = p_periodo_id
    returning * into v_cb;

    return v_cb;
  end if;

  -- modo 'retiro'
  if p_metodo_tipo not in ('alias', 'cuenta') then
    raise exception 'Elegí cómo cobrar el retiro';
  end if;
  if exists (select 1 from withdrawal_requests
             where player_id = v_p.id and estado = 'pendiente') then
    raise exception 'El jugador ya tiene un retiro pendiente. Dáselo en fichas o esperá a que se resuelva.';
  end if;

  -- Entra como carga y sale como retiro reservado: el saldo queda
  -- igual, el libro tiene las dos patas y queda una solicitud pendiente.
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
