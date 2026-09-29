-- =========================================================
-- Cuentas bancarias del casino + solicitudes de carga
-- Las cuentas se cargan desde el panel y el jugador elige a
-- cuál transferir. El saldo se acredita recién cuando un
-- cajero confirma que la plata llegó.
-- =========================================================

create table if not exists bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  banco         text not null,
  titular       text not null,
  numero_cuenta text not null,
  alias         text,
  documento     text,               -- CI, DNI, RUC: el número
  documento_tipo text,              -- 'CI' | 'DNI' | 'RUC' | 'CUIT'
  mostrar_documento boolean not null default false,
  orden         int not null default 0,
  activa        boolean not null default true,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_bank_activas on bank_accounts (activa, orden);

alter table bank_accounts enable row level security;

-- Lectura pública de las activas: el portal del jugador las muestra.
-- Igual el portal las pide por /api, pero dejamos la policy por si
-- más adelante se leen directo.
drop policy if exists "cualquiera lee cuentas activas" on bank_accounts;

create policy "cualquiera lee cuentas activas"
  on bank_accounts for select
  using (activa = true);

-- ---------------------------------------------------------
-- Solicitudes de carga
-- ---------------------------------------------------------
create table if not exists deposit_requests (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  account_id   uuid references bank_accounts(id),
  amount       numeric(14,2) not null check (amount > 0),
  estado       text not null default 'pendiente'
                 check (estado in ('pendiente', 'aprobado', 'rechazado', 'cancelado')),
  comprobante_url text,
  nota_jugador text,
  nota_staff   text,
  resuelto_por text,
  resuelto_at  timestamptz,
  tx_id        uuid references balance_transactions(id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_dr_estado on deposit_requests (estado, created_at desc);
create index if not exists idx_dr_player on deposit_requests (player_id, created_at desc);

-- Una sola carga pendiente por jugador, igual que con los retiros.
create unique index if not exists idx_dr_una_pendiente
  on deposit_requests (player_id)
  where estado = 'pendiente';

alter table deposit_requests enable row level security;

drop policy if exists "staff autenticado lee cargas" on deposit_requests;

create policy "staff autenticado lee cargas"
  on deposit_requests for select
  using (
    exists (
      select 1 from staff_profiles sp
      where sp.id = auth.uid() and sp.active = true
    )
  );

-- ---------------------------------------------------------
-- Aprobar una carga, de forma atómica
-- El monto que se acredita puede diferir del solicitado: si el
-- jugador dijo 50.000 pero transfirió 45.000, el cajero acredita
-- lo que realmente entró.
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
  v_req   deposit_requests;
  v_monto numeric;
  v_tx    balance_transactions;
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

  v_tx := wallet_movimiento(
    v_req.player_id,
    'carga',
    v_monto,
    coalesce(p_nota, 'Carga solicitada desde el portal'),
    p_created_by
  );

  update deposit_requests
  set estado = 'aprobado',
      amount = v_monto,
      resuelto_por = p_created_by,
      resuelto_at = now(),
      nota_staff = p_nota,
      tx_id = v_tx.id
  where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;
