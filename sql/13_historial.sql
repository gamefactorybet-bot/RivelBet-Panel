-- =========================================================
-- Historial de eventos
-- Una VISTA que une lo que ya existe en cinco tablas. No duplica
-- datos ni agrega escrituras: es una consulta con nombre.
--
-- Cuidado con el doble conteo: una carga aprobada desde el portal
-- genera una fila en balance_transactions Y otra en deposit_requests.
-- Tomamos el movimiento de balance_transactions (es la verdad del
-- dinero) y de las solicitudes solo los RECHAZOS, que no generan
-- movimiento y si no quedarían invisibles.
-- =========================================================

create or replace view vista_eventos as

-- 1. Movimientos de saldo (cargas y retiros, manuales y del portal)
select
  bt.id,
  bt.created_at                       as fecha,
  bt.type                             as categoria,      -- 'carga' | 'retiro'
  case when bt.type = 'carga' then 'Carga' else 'Retiro' end as evento,
  case
    when bt.note ilike 'bono:%' then 'bono'
    when bt.note ilike '%portal%' then 'portal'
    else 'manual'
  end                                 as origen,
  bt.note                             as detalle,
  bt.created_by                       as actor,
  bt.amount                           as monto,
  bt.balance_after                    as saldo,
  p.player_number,
  coalesce(p.display_name, p.username) as sujeto
from balance_transactions bt
join players p on p.id = bt.player_id

union all

-- 2. Cargas rechazadas (no dejan movimiento)
select
  dr.id,
  coalesce(dr.resuelto_at, dr.created_at),
  'rechazo',
  'Carga rechazada',
  'portal',
  dr.nota_staff,
  coalesce(dr.resuelto_por, '—'),
  dr.amount,
  null,
  p.player_number,
  coalesce(p.display_name, p.username)
from deposit_requests dr
join players p on p.id = dr.player_id
where dr.estado = 'rechazado'

union all

-- 3. Retiros rechazados
select
  wr.id,
  coalesce(wr.resuelto_at, wr.created_at),
  'rechazo',
  'Retiro rechazado',
  'portal',
  wr.nota_staff,
  coalesce(wr.resuelto_por, '—'),
  wr.amount,
  null,
  p.player_number,
  coalesce(p.display_name, p.username)
from withdrawal_requests wr
join players p on p.id = wr.player_id
where wr.estado = 'rechazado'

union all

-- 4. Bans aplicados y levantados
select
  bh.id,
  bh.created_at,
  'ban',
  case when bh.activo then 'Ban de ' || bh.ban_tipo else 'Ban de ' || bh.ban_tipo || ' levantado' end,
  null,
  bh.motivo,
  bh.created_by,
  null,
  null,
  p.player_number,
  coalesce(p.display_name, p.username)
from ban_history bh
join players p on p.id = bh.player_id

union all

-- 5. Jugadores creados
select
  p.id,
  p.created_at,
  'jugador',
  'Jugador creado',
  null,
  null,
  coalesce(p.created_by, '—'),
  null,
  null,
  p.player_number,
  coalesce(p.display_name, p.username)
from players p

union all

-- 6. Contraseñas de jugadores reseteadas
select
  pr.id,
  pr.created_at,
  'jugador',
  'Contraseña reseteada',
  null,
  null,
  pr.reset_by,
  null,
  null,
  p.player_number,
  coalesce(p.display_name, p.username)
from password_resets pr
join players p on p.id = pr.player_id

union all

-- 7. Altas y cambios de staff
select
  sh.id,
  sh.created_at,
  'staff',
  'Staff ' || sh.accion,
  null,
  sh.detalle::text,
  sh.created_by,
  null,
  null,
  null,
  coalesce(sp.display_name, sp.email)
from staff_history sh
left join staff_profiles sp on sp.id = sh.staff_id;

-- Índices que hacen rápida la consulta ordenada por fecha
create index if not exists idx_bt_created_desc on balance_transactions (created_at desc);
create index if not exists idx_bh_created_desc on ban_history (created_at desc);
create index if not exists idx_sh_created_desc on staff_history (created_at desc);
create index if not exists idx_players_created_desc on players (created_at desc);
