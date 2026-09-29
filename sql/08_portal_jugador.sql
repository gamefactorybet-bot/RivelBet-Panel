-- =========================================================
-- Portal del jugador — solicitudes de retiro
-- El jugador no mueve su propio saldo: pide, y un cajero aprueba.
-- Recién en la aprobación se ejecuta wallet_movimiento(), que es la
-- única puerta por donde se toca el saldo.
-- =========================================================

create table if not exists withdrawal_requests (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  amount       numeric(14,2) not null check (amount > 0),
  estado       text not null default 'pendiente'
                 check (estado in ('pendiente', 'aprobado', 'rechazado', 'cancelado')),
  nota_jugador text,
  nota_staff   text,
  resuelto_por text,
  resuelto_at  timestamptz,
  tx_id        uuid references balance_transactions(id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_wr_estado on withdrawal_requests (estado, created_at desc);
create index if not exists idx_wr_player on withdrawal_requests (player_id, created_at desc);

-- Un jugador no puede tener dos pedidos pendientes a la vez: evita que
-- pida 100 tres veces y se lleve 300 con un saldo de 100.
create unique index if not exists idx_wr_una_pendiente
  on withdrawal_requests (player_id)
  where estado = 'pendiente';

alter table withdrawal_requests enable row level security;

-- El portal del jugador NO lee directo con la anon key: todo pasa por
-- /api con su token propio. Acá solo habilitamos lectura al staff.
drop policy if exists "staff autenticado lee solicitudes" on withdrawal_requests;

create policy "staff autenticado lee solicitudes"
  on withdrawal_requests for select
  using (
    exists (
      select 1 from staff_profiles sp
      where sp.id = auth.uid() and sp.active = true
    )
  );

-- ---------------------------------------------------------
-- Aprobar una solicitud, de forma atómica
-- Bloquea la solicitud, verifica que siga pendiente, y recién ahí
-- ejecuta el retiro. Si dos cajeros aprueban al mismo tiempo, el
-- segundo encuentra el estado ya cambiado y falla sin pagar dos veces.
-- ---------------------------------------------------------
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
  v_tx  balance_transactions;
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

  -- wallet_movimiento valida bans, saldo suficiente y deja el asiento
  v_tx := wallet_movimiento(
    v_req.player_id,
    'retiro',
    v_req.amount,
    coalesce(p_nota, 'Retiro solicitado desde el portal'),
    p_created_by
  );

  update withdrawal_requests
  set estado = 'aprobado',
      resuelto_por = p_created_by,
      resuelto_at = now(),
      nota_staff = p_nota,
      tx_id = v_tx.id
  where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;
