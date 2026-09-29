-- =========================================================
-- Bonos por carga
-- El jugador ve el bono que le toca mientras escribe el monto,
-- y al aprobar el servidor lo vuelve a calcular y lo acredita.
-- El cajero no lo puede modificar: si la regla dice 20%, es 20%.
-- =========================================================

create table if not exists bonos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  tipo        text not null check (tipo in ('porcentaje', 'fijo')),
  valor       numeric(14,2) not null check (valor > 0),

  -- Tramo de monto al que aplica. monto_max nulo = sin techo.
  monto_min   numeric(14,2) not null default 0,
  monto_max   numeric(14,2),

  -- 'todas' = cualquier carga | 'primera' = solo la primera del jugador
  aplica      text not null default 'todas' check (aplica in ('todas', 'primera')),

  -- Techo del bono para reglas de porcentaje (evita regalar de más
  -- en una carga enorme). Nulo = sin techo.
  tope        numeric(14,2),

  orden       int not null default 0,
  activo      boolean not null default true,
  desde       timestamptz,
  hasta       timestamptz,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_bonos_activos on bonos (activo, orden);

alter table bonos enable row level security;

-- drop previo para que este archivo se pueda volver a correr entero:
-- sin esto, un segundo intento aborta con "policy already exists" y
-- Postgres revierte TODO el script, incluidas las funciones de abajo.
drop policy if exists "cualquiera lee bonos activos" on bonos;

create policy "cualquiera lee bonos activos"
  on bonos for select
  using (activo = true);

-- ---------------------------------------------------------
-- Guardar qué bono se aplicó a cada carga
-- ---------------------------------------------------------
alter table deposit_requests
  add column if not exists bono_id     uuid references bonos(id),
  add column if not exists bono_monto  numeric(14,2) not null default 0,
  add column if not exists tx_bono_id  uuid references balance_transactions(id);

-- ---------------------------------------------------------
-- Calcular el bono que corresponde a un monto
-- Elige la primera regla vigente que encaje, por `orden`.
-- Devuelve el id de la regla y el monto del bono.
-- ---------------------------------------------------------
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
begin
  -- ¿Es su primera carga aprobada? Sirve para las reglas de bienvenida.
  select not exists (
    select 1 from deposit_requests
    where player_id = p_player_id and estado = 'aprobado'
  ) into v_es_primera;

  select * into v_bono
  from bonos b
  where b.activo = true
    and (b.desde is null or b.desde <= now())
    and (b.hasta is null or b.hasta >= now())
    and p_monto >= b.monto_min
    and (b.monto_max is null or p_monto <= b.monto_max)
    and (b.aplica = 'todas' or v_es_primera)
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

-- ---------------------------------------------------------
-- Aprobar una carga, ahora con bono
-- El bono entra como un movimiento aparte en el libro: así el
-- extracto bancario cuadra contra la carga sola, y el bono queda
-- identificado por separado para auditar cuánto se regaló.
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
  -- uuid suelto y no un record: si no hay bono, la variable queda NULL.
  -- Un record sin asignar hace fallar el UPDATE con "record is not
  -- assigned yet", justo en el caso más común (sin bonos cargados).
  v_tx_bono_id uuid;
  v_bono_id    uuid;
  v_bono_mon   numeric;
  v_bono_nom   text;
begin
  select * into v_req
  from deposit_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_req.estado <> 'pendiente' then
    raise exception 'La solicitud ya fue %', v_req.estado;
  end if;

  v_monto := coalesce(p_monto_real, v_req.amount);

  if v_monto <= 0 then
    raise exception 'El monto acreditado debe ser mayor a 0';
  end if;

  -- El bono se calcula acá, sobre el monto REAL acreditado, no sobre
  -- el que declaró el jugador. Si transfirió menos, el bono baja.
  select cb.bono_id, cb.bono_monto, cb.bono_nombre
  into v_bono_id, v_bono_mon, v_bono_nom
  from calcular_bono(v_req.player_id, v_monto) cb;

  v_tx := wallet_movimiento(
    v_req.player_id, 'carga', v_monto,
    coalesce(p_nota, 'Carga solicitada desde el portal'),
    p_created_by
  );

  if coalesce(v_bono_mon, 0) > 0 then
    v_tx_bono_id := (wallet_movimiento(
      v_req.player_id, 'carga', v_bono_mon,
      'Bono: ' || coalesce(v_bono_nom, 'promoción'),
      p_created_by
    )).id;
  end if;

  update deposit_requests
  set estado = 'aprobado',
      amount = v_monto,
      bono_id = v_bono_id,
      bono_monto = coalesce(v_bono_mon, 0),
      resuelto_por = p_created_by,
      resuelto_at = now(),
      nota_staff = p_nota,
      tx_id = v_tx.id,
      tx_bono_id = v_tx_bono_id
  where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;
