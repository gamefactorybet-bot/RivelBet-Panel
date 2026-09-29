-- =========================================================
-- Fondos de cajero: fichas ≠ dinero
--
-- Las fichas no valen plata. El admin las fabrica en la bóveda y
-- se las asigna a los cajeros como tope operativo. El cajero solo
-- puede entregar las que tiene. El dinero real se anota aparte:
-- depósitos aprobados (entró) y retiros pagados (salió).
--
-- Interruptor caja_con_fondo (default false): apagado, todo igual
-- que hoy. Encendido, wallet_movimiento deja de fabricar.
--
--   · Carga de caja  (p_staff_id) → resta el fondo del cajero
--   · Retiro de caja (p_staff_id) → suma el fondo del cajero
--   · Carga sin staff (portal, bono, giro, VIP) → resta la bóveda
--   · Aprobar retiro del portal → las fichas vuelven a la bóveda
--
-- Aditivo y repetible. Después:  notify pgrst, 'reload schema';
-- =========================================================

create table if not exists caja_config (
  id             int primary key default 1 check (id = 1),
  caja_con_fondo boolean not null default false,
  updated_by     text,
  updated_at     timestamptz not null default now()
);
insert into caja_config (id) values (1) on conflict (id) do nothing;

alter table caja_config enable row level security;
drop policy if exists "staff lee caja_config" on caja_config;
create policy "staff lee caja_config" on caja_config for select using (es_staff());

create table if not exists casino_boveda (
  id              int primary key default 1 check (id = 1),
  fichas          numeric(14,2) not null default 0 check (fichas >= 0),
  fabricadas_acum numeric(14,2) not null default 0 check (fabricadas_acum >= 0)
);
insert into casino_boveda (id) values (1) on conflict (id) do nothing;

alter table casino_boveda enable row level security;
drop policy if exists "staff lee boveda" on casino_boveda;
create policy "staff lee boveda" on casino_boveda for select using (es_staff());

create table if not exists staff_fondos (
  staff_id   uuid primary key references staff_profiles(id) on delete cascade,
  fichas     numeric(14,2) not null default 0 check (fichas >= 0),
  updated_at timestamptz not null default now()
);

alter table staff_fondos enable row level security;
drop policy if exists "staff lee fondos" on staff_fondos;
create policy "staff lee fondos" on staff_fondos for select using (es_staff());

create table if not exists staff_fondo_txs (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in (
                  'fabricar', 'asignar', 'devolver',
                  'carga_caja', 'retiro_caja',
                  'carga_boveda', 'retiro_boveda'
                )),
  staff_id      uuid references staff_profiles(id) on delete set null,
  player_id     uuid references players(id) on delete set null,
  player_tx_id  uuid references balance_transactions(id) on delete set null,
  amount        numeric(14,2) not null check (amount > 0),
  boveda_before numeric(14,2),
  boveda_after  numeric(14,2),
  fondo_before  numeric(14,2),
  fondo_after   numeric(14,2),
  note          text,
  created_by    text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_fondo_txs_created on staff_fondo_txs (created_at desc);
create index if not exists idx_fondo_txs_staff on staff_fondo_txs (staff_id, created_at desc);
create index if not exists idx_fondo_txs_player_tx on staff_fondo_txs (player_tx_id)
  where player_tx_id is not null;

alter table staff_fondo_txs enable row level security;
drop policy if exists "staff lee fondo txs" on staff_fondo_txs;
create policy "staff lee fondo txs" on staff_fondo_txs for select using (es_staff());

alter table deposit_requests
  add column if not exists origen text not null default 'portal';
alter table deposit_requests drop constraint if exists deposit_requests_origen_check;
alter table deposit_requests add constraint deposit_requests_origen_check
  check (origen in ('portal', 'caja'));

alter table withdrawal_requests
  add column if not exists origen text not null default 'portal';
alter table withdrawal_requests drop constraint if exists withdrawal_requests_origen_check;
alter table withdrawal_requests add constraint withdrawal_requests_origen_check
  check (origen in ('portal', 'caja'));

insert into staff_fondos (staff_id)
select id from staff_profiles
on conflict (staff_id) do nothing;

create or replace function trg_fondo_nuevo_staff()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into staff_fondos (staff_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists trg_fondo_nuevo_staff on staff_profiles;
create trigger trg_fondo_nuevo_staff after insert on staff_profiles
  for each row execute function trg_fondo_nuevo_staff();

drop trigger if exists trg_hb_staff_fondos on staff_fondos;
create trigger trg_hb_staff_fondos after insert or update or delete on staff_fondos
  for each statement execute function bump_staff_heartbeat();

drop trigger if exists trg_hb_staff_boveda on casino_boveda;
create trigger trg_hb_staff_boveda after update on casino_boveda
  for each statement execute function bump_staff_heartbeat();

create or replace function caja_con_fondo()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select caja_con_fondo from caja_config where id = 1), false);
$$;

create or replace function ensure_fondo(p_staff_id uuid)
returns void
language sql security definer set search_path = public as $$
  insert into staff_fondos (staff_id) values (p_staff_id) on conflict do nothing;
$$;

create or replace function boveda_fabricar(p_amount numeric, p_created_by text, p_note text default null)
returns casino_boveda
language plpgsql security definer set search_path = public as $$
declare
  v_b casino_boveda;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;

  select * into v_b from casino_boveda where id = 1 for update;

  update casino_boveda
  set fichas = fichas + p_amount,
      fabricadas_acum = fabricadas_acum + p_amount
  where id = 1
  returning * into v_b;

  insert into staff_fondo_txs
    (tipo, amount, boveda_before, boveda_after, note, created_by)
  values
    ('fabricar', p_amount, v_b.fichas - p_amount, v_b.fichas, p_note, p_created_by);

  return v_b;
end;
$$;

create or replace function fondo_asignar(
  p_staff_id   uuid,
  p_amount     numeric,
  p_created_by text,
  p_note       text default null
)
returns staff_fondos
language plpgsql security definer set search_path = public as $$
declare
  v_b     casino_boveda;
  v_fondo staff_fondos;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;
  if not exists (select 1 from staff_profiles where id = p_staff_id) then
    raise exception 'Cajero no encontrado';
  end if;

  perform ensure_fondo(p_staff_id);

  select * into v_b from casino_boveda where id = 1 for update;
  if v_b.fichas < p_amount then
    raise exception 'La bóveda no tiene suficientes fichas (hay %)', v_b.fichas;
  end if;

  select * into v_fondo from staff_fondos where staff_id = p_staff_id for update;

  update casino_boveda set fichas = fichas - p_amount where id = 1
    returning * into v_b;
  update staff_fondos
  set fichas = fichas + p_amount, updated_at = now()
  where staff_id = p_staff_id
  returning * into v_fondo;

  insert into staff_fondo_txs
    (tipo, staff_id, amount, boveda_before, boveda_after, fondo_before, fondo_after, note, created_by)
  values
    ('asignar', p_staff_id, p_amount,
     v_b.fichas + p_amount, v_b.fichas,
     v_fondo.fichas - p_amount, v_fondo.fichas,
     p_note, p_created_by);

  return v_fondo;
end;
$$;

create or replace function fondo_devolver(
  p_staff_id   uuid,
  p_amount     numeric,
  p_created_by text,
  p_note       text default null
)
returns staff_fondos
language plpgsql security definer set search_path = public as $$
declare
  v_b     casino_boveda;
  v_fondo staff_fondos;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;

  perform ensure_fondo(p_staff_id);

  select * into v_b from casino_boveda where id = 1 for update;
  select * into v_fondo from staff_fondos where staff_id = p_staff_id for update;
  if not found then raise exception 'Cajero no encontrado'; end if;
  if v_fondo.fichas < p_amount then
    raise exception 'Ese cajero no tiene tantas fichas (hay %)', v_fondo.fichas;
  end if;

  update staff_fondos
  set fichas = fichas - p_amount, updated_at = now()
  where staff_id = p_staff_id
  returning * into v_fondo;
  update casino_boveda set fichas = fichas + p_amount where id = 1
    returning * into v_b;

  insert into staff_fondo_txs
    (tipo, staff_id, amount, boveda_before, boveda_after, fondo_before, fondo_after, note, created_by)
  values
    ('devolver', p_staff_id, p_amount,
     v_b.fichas - p_amount, v_b.fichas,
     v_fondo.fichas + p_amount, v_fondo.fichas,
     p_note, p_created_by);

  return v_fondo;
end;
$$;

drop function if exists wallet_movimiento(uuid, text, numeric, text, text);

create or replace function wallet_movimiento(
  p_player_id  uuid,
  p_type       text,
  p_amount     numeric,
  p_note       text,
  p_created_by text,
  p_staff_id   uuid default null
)
returns balance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player         players;
  v_balance_after  numeric;
  v_tx             balance_transactions;
  v_flag           boolean;
  v_b              casino_boveda;
  v_fondo          staff_fondos;
  v_tipo_fondo     text;
begin
  if p_type not in ('carga', 'retiro') then
    raise exception 'Tipo de movimiento inválido: %', p_type;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;

  v_flag := caja_con_fondo();

  if v_flag then
    if p_staff_id is not null then
      perform ensure_fondo(p_staff_id);
      select * into v_fondo from staff_fondos where staff_id = p_staff_id for update;
      if not found then raise exception 'Cajero no encontrado'; end if;
    else
      select * into v_b from casino_boveda where id = 1 for update;
    end if;
  end if;

  select * into v_player
  from players
  where id = p_player_id
  for update;

  if not found then
    raise exception 'Jugador no encontrado';
  end if;

  if v_player.ban_permanente then
    raise exception 'El jugador tiene ban permanente';
  end if;

  if p_type = 'carga' and v_player.ban_recargas then
    raise exception 'El jugador tiene ban de recargas';
  end if;

  if p_type = 'retiro' and v_player.ban_retiros then
    raise exception 'El jugador tiene ban de retiros';
  end if;

  if p_type = 'carga' then
    v_balance_after := v_player.balance + p_amount;
  else
    v_balance_after := v_player.balance - p_amount;
    if v_balance_after < 0 then
      raise exception 'Saldo insuficiente (actual: %, retiro: %)', v_player.balance, p_amount;
    end if;
  end if;

  if v_flag and p_type = 'carga' then
    if p_staff_id is not null then
      if v_fondo.fichas < p_amount then
        raise exception 'No te alcanzan las fichas (tenés %)', v_fondo.fichas;
      end if;
    else
      if v_b.fichas < p_amount then
        raise exception 'La bóveda no tiene suficientes fichas (hay %). Fabricá o devolvé fondos ociosos.', v_b.fichas;
      end if;
    end if;
  end if;

  update players set balance = v_balance_after where id = p_player_id;

  insert into balance_transactions
    (player_id, type, amount, balance_before, balance_after, note, created_by)
  values
    (p_player_id, p_type, p_amount, v_player.balance, v_balance_after, p_note, p_created_by)
  returning * into v_tx;

  if v_flag then
    if p_staff_id is not null then
      if p_type = 'carga' then
        update staff_fondos
        set fichas = fichas - p_amount, updated_at = now()
        where staff_id = p_staff_id
        returning * into v_fondo;
        v_tipo_fondo := 'carga_caja';

        insert into deposit_requests
          (player_id, amount, estado, origen, nota_staff, resuelto_por, resuelto_at, tx_id)
        values
          (p_player_id, p_amount, 'aprobado', 'caja',
           coalesce(p_note, 'Carga de caja'), p_created_by, now(), v_tx.id);
      else
        update staff_fondos
        set fichas = fichas + p_amount, updated_at = now()
        where staff_id = p_staff_id
        returning * into v_fondo;
        v_tipo_fondo := 'retiro_caja';

        insert into withdrawal_requests
          (player_id, amount, estado, origen, nota_staff, resuelto_por, resuelto_at, tx_id)
        values
          (p_player_id, p_amount, 'aprobado', 'caja',
           coalesce(p_note, 'Retiro de caja'), p_created_by, now(), v_tx.id);
      end if;

      insert into staff_fondo_txs
        (tipo, staff_id, player_id, player_tx_id, amount,
         fondo_before, fondo_after, note, created_by)
      values
        (v_tipo_fondo, p_staff_id, p_player_id, v_tx.id, p_amount,
         case when p_type = 'carga' then v_fondo.fichas + p_amount else v_fondo.fichas - p_amount end,
         v_fondo.fichas, p_note, p_created_by);
    else
      if p_type = 'carga' then
        update casino_boveda set fichas = fichas - p_amount where id = 1 returning * into v_b;
        v_tipo_fondo := 'carga_boveda';
      else
        update casino_boveda set fichas = fichas + p_amount where id = 1 returning * into v_b;
        v_tipo_fondo := 'retiro_boveda';
      end if;

      insert into staff_fondo_txs
        (tipo, player_id, player_tx_id, amount, boveda_before, boveda_after, note, created_by)
      values
        (v_tipo_fondo, p_player_id, v_tx.id, p_amount,
         case when p_type = 'carga' then v_b.fichas + p_amount else v_b.fichas - p_amount end,
         v_b.fichas, p_note, p_created_by);
    end if;
  end if;

  return v_tx;
end;
$$;

create or replace function anular_movimiento(
  p_tx_id      uuid,
  p_created_by text,
  p_motivo     text
)
returns balance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig    balance_transactions;
  v_player  players;
  v_after   numeric;
  v_inversa balance_transactions;
  v_tipo    text;
  v_ft      staff_fondo_txs;
  v_fondo   staff_fondos;
  v_b       casino_boveda;
begin
  select * into v_orig from balance_transactions where id = p_tx_id for update;

  if not found then
    raise exception 'Movimiento no encontrado';
  end if;

  if v_orig.anulada then
    raise exception 'Ese movimiento ya fue anulado';
  end if;

  if v_orig.anula_a is not null then
    raise exception 'No se puede anular una anulación';
  end if;

  v_tipo := case when v_orig.type = 'carga' then 'retiro' else 'carga' end;

  select * into v_ft from staff_fondo_txs where player_tx_id = p_tx_id limit 1;

  if v_ft.staff_id is not null then
    select * into v_fondo from staff_fondos where staff_id = v_ft.staff_id for update;
  elsif v_ft.id is not null then
    select * into v_b from casino_boveda where id = 1 for update;
  end if;

  select * into v_player from players where id = v_orig.player_id for update;

  v_after := case when v_tipo = 'carga'
    then v_player.balance + v_orig.amount
    else v_player.balance - v_orig.amount
  end;

  if v_after < 0 then
    raise exception 'El jugador ya no tiene ese saldo (actual %, hay que revertir %)',
      v_player.balance, v_orig.amount;
  end if;

  if v_ft.tipo = 'carga_caja' then
    update staff_fondos
    set fichas = fichas + v_orig.amount, updated_at = now()
    where staff_id = v_ft.staff_id;
    update deposit_requests set estado = 'cancelado'
      where tx_id = p_tx_id and origen = 'caja' and estado = 'aprobado';
  elsif v_ft.tipo = 'retiro_caja' then
    if coalesce(v_fondo.fichas, 0) < v_orig.amount then
      raise exception 'El cajero ya no tiene esas fichas para devolver (tiene %)', v_fondo.fichas;
    end if;
    update staff_fondos
    set fichas = fichas - v_orig.amount, updated_at = now()
    where staff_id = v_ft.staff_id;
    update withdrawal_requests set estado = 'cancelado'
      where tx_id = p_tx_id and origen = 'caja' and estado = 'aprobado';
  elsif v_ft.tipo = 'carga_boveda' then
    update casino_boveda set fichas = fichas + v_orig.amount where id = 1;
  elsif v_ft.tipo = 'retiro_boveda' then
    if coalesce(v_b.fichas, 0) < v_orig.amount then
      raise exception 'La bóveda no tiene esas fichas para devolver (hay %)', v_b.fichas;
    end if;
    update casino_boveda set fichas = fichas - v_orig.amount where id = 1;
  end if;

  update players set balance = v_after where id = v_orig.player_id;

  insert into balance_transactions
    (player_id, type, amount, balance_before, balance_after, note, created_by, anula_a)
  values
    (v_orig.player_id, v_tipo, v_orig.amount, v_player.balance, v_after,
     'Anulación: ' || coalesce(p_motivo, 'sin motivo'), p_created_by, v_orig.id)
  returning * into v_inversa;

  update balance_transactions
  set anulada = true, anulada_por = p_created_by, anulada_at = now()
  where id = p_tx_id;

  return v_inversa;
end;
$$;

create or replace function aprobar_retiro(
  p_request_id uuid,
  p_created_by text,
  p_nota       text default null
)
returns withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req withdrawal_requests;
  v_b   casino_boveda;
begin
  select * into v_req
  from withdrawal_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_req.estado <> 'pendiente' then
    raise exception 'La solicitud ya fue %', v_req.estado;
  end if;

  if caja_con_fondo() then
    select * into v_b from casino_boveda where id = 1 for update;
    update casino_boveda set fichas = fichas + v_req.amount where id = 1 returning * into v_b;
    insert into staff_fondo_txs
      (tipo, player_id, amount, boveda_before, boveda_after, note, created_by)
    values
      ('retiro_boveda', v_req.player_id, v_req.amount,
       v_b.fichas - v_req.amount, v_b.fichas,
       'Retiro de portal aprobado', p_created_by);
  end if;

  update players
  set balance_retenido = greatest(0, balance_retenido - v_req.amount)
  where id = v_req.player_id;

  update withdrawal_requests
  set estado = 'aprobado',
      resuelto_por = p_created_by,
      resuelto_at = now(),
      nota_staff = p_nota
  where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;

create or replace function cierre_plata(
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select
      coalesce(p_desde, inicio_periodo('day')) as desde,
      coalesce(p_hasta, now()) as hasta
  ),
  ent as (
    select
      coalesce(sum(d.amount), 0) as monto,
      count(*) as cantidad
    from deposit_requests d, r
    where d.estado = 'aprobado'
      and d.resuelto_at >= r.desde and d.resuelto_at <= r.hasta
  ),
  sal as (
    select
      coalesce(sum(w.amount), 0) as monto,
      count(*) as cantidad
    from withdrawal_requests w, r
    where w.estado = 'aprobado'
      and coalesce(w.resuelto_at, w.created_at) >= r.desde
      and coalesce(w.resuelto_at, w.created_at) <= r.hasta
  )
  select jsonb_build_object(
    'entrada', (select monto from ent),
    'entrada_cantidad', (select cantidad from ent),
    'salida', (select monto from sal),
    'salida_cantidad', (select cantidad from sal),
    'neto', (select monto from ent) - (select monto from sal)
  );
$$;

notify pgrst, 'reload schema';
