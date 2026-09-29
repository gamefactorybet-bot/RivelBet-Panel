-- =========================================================
-- Perfil del jugador a pantalla completa (panel)
--
-- Dos cosas:
--  1. player_notas: notas internas del staff sobre un jugador
--     (solo las ve el equipo, nunca el jugador).
--  2. resumen_jugador(): junta en una sola llamada los totales
--     que hoy habría que sacar con varias consultas — cargado,
--     retirado, apostado/ganado en juegos y últimas fechas de
--     actividad.
--
-- Después de correr este archivo:  notify pgrst, 'reload schema';
-- =========================================================

create table if not exists player_notas (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  texto      text not null,
  autor      text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_player_notas on player_notas (player_id, created_at desc);

alter table player_notas enable row level security;

-- Lectura solo staff. Las escrituras pasan por /api con Service Role.
drop policy if exists "staff lee notas del jugador" on player_notas;
create policy "staff lee notas del jugador"
  on player_notas for select using (es_staff());

-- ---------------------------------------------------------
-- resumen_jugador — totales y última actividad, en una fila
--
-- security invoker (el default): corre con los permisos de quien
-- llama, así RLS ya filtra — un no-staff no puede leer game_rounds
-- ni login_attempts, y la función le devuelve vacío.
-- ---------------------------------------------------------
create or replace function resumen_jugador(p_player_id uuid)
returns table (
  cargado        numeric,
  retirado       numeric,
  bono           numeric,
  giros          bigint,
  apostado       numeric,
  ganado         numeric,
  ultimo_giro    timestamptz,
  juego_top      text,
  ultima_carga   timestamptz,
  ultimo_retiro  timestamptz,
  ultimo_ingreso timestamptz
)
language sql
stable
as $$
  select
    coalesce((select sum(amount) from deposit_requests
              where player_id = p_player_id and estado = 'aprobado'), 0),
    coalesce((select sum(amount) from withdrawal_requests
              where player_id = p_player_id and estado = 'aprobado'), 0),
    coalesce((select sum(monto) from bonos_otorgados where player_id = p_player_id), 0),
    coalesce((select count(*) from game_rounds where player_id = p_player_id), 0),
    coalesce((select sum(bet) from game_rounds where player_id = p_player_id), 0),
    coalesce((select sum(win) from game_rounds where player_id = p_player_id), 0),
    (select max(created_at) from game_rounds where player_id = p_player_id),
    (select game_slug from game_rounds where player_id = p_player_id
     group by game_slug order by count(*) desc limit 1),
    (select max(resuelto_at) from deposit_requests
     where player_id = p_player_id and estado = 'aprobado'),
    (select max(resuelto_at) from withdrawal_requests
     where player_id = p_player_id and estado = 'aprobado'),
    (select max(la.created_at) from login_attempts la
     where la.exitoso = true
       and la.username = (select username from players where id = p_player_id))
$$;

grant execute on function resumen_jugador(uuid) to authenticated;
