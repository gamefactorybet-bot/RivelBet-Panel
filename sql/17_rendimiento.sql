-- =========================================================
-- Rendimiento: políticas de RLS
--
-- El problema: cada política hacía
--   exists (select 1 from staff_profiles where id = auth.uid() ...)
-- y eso se evalúa UNA VEZ POR FILA devuelta. Listar 1.000 rondas
-- disparaba 1.000 subconsultas idénticas.
--
-- La solución: envolver la verificación en una función marcada
-- `stable`. Postgres sabe que dentro de una misma consulta el
-- resultado no cambia, así que la evalúa una sola vez y reusa el
-- valor para todas las filas.
--
-- Esto importa más ahora que van a ser tres despliegues (panel,
-- portal y juegos) pegándole a la misma base.
-- =========================================================

create or replace function es_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_profiles
    where id = auth.uid() and active = true
  );
$$;

-- La función corre con permisos del dueño, así que hay que
-- asegurarse de que cualquiera la pueda llamar.
grant execute on function es_staff() to anon, authenticated;

-- ---------------------------------------------------------
-- Reemplazo de las políticas, una por una
-- ---------------------------------------------------------

drop policy if exists "staff autenticado lee jugadores" on players;
create policy "staff autenticado lee jugadores"
  on players for select using (es_staff());

drop policy if exists "staff autenticado lee movimientos" on balance_transactions;
create policy "staff autenticado lee movimientos"
  on balance_transactions for select using (es_staff());

drop policy if exists "staff autenticado lee reseteos" on password_resets;
create policy "staff autenticado lee reseteos"
  on password_resets for select using (es_staff());

drop policy if exists "staff autenticado lee historial de bans" on ban_history;
create policy "staff autenticado lee historial de bans"
  on ban_history for select using (es_staff());

drop policy if exists "staff autenticado lee historial de staff" on staff_history;
create policy "staff autenticado lee historial de staff"
  on staff_history for select using (es_staff());

drop policy if exists "staff autenticado lee solicitudes" on withdrawal_requests;
create policy "staff autenticado lee solicitudes"
  on withdrawal_requests for select using (es_staff());

drop policy if exists "staff autenticado lee cargas" on deposit_requests;
create policy "staff autenticado lee cargas"
  on deposit_requests for select using (es_staff());

drop policy if exists "staff autenticado lee tickets" on soporte_tickets;
create policy "staff autenticado lee tickets"
  on soporte_tickets for select using (es_staff());

drop policy if exists "staff autenticado lee mensajes" on soporte_mensajes;
create policy "staff autenticado lee mensajes"
  on soporte_mensajes for select using (es_staff());

drop policy if exists "staff autenticado lee rondas" on game_rounds;
create policy "staff autenticado lee rondas"
  on game_rounds for select using (es_staff());

-- ---------------------------------------------------------
-- Índices que faltaban y sobraban
-- ---------------------------------------------------------

-- Este sí hace falta: la pantalla de Juegos agrupa por juego para
-- calcular el retorno real de cada título.
create index if not exists idx_rounds_game on game_rounds (game_slug, created_at desc);

-- El índice sobre lower(username) quedó de la primera versión: hoy
-- las búsquedas se hacen sobre la columna directa, que ya tiene su
-- índice único. Cada índice de más frena las escrituras, y en un
-- casino se escribe todo el tiempo.
drop index if exists idx_players_username;

-- ---------------------------------------------------------
-- Estadísticas al día
-- Postgres decide cómo resolver cada consulta usando estadísticas
-- de las tablas. Después de una migración conviene refrescarlas.
-- ---------------------------------------------------------
analyze players;
analyze balance_transactions;
analyze game_rounds;
analyze deposit_requests;
analyze withdrawal_requests;
