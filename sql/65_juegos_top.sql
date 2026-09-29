-- Top de juegos más jugados (últimos 7 días) para el lobby.
-- No es una categoría del panel: se arma sola con las rondas.

create or replace function juegos_mas_jugados(
  p_dias   int default 7,
  p_limite int default 10
)
returns table (slug text, rondas bigint)
language sql
stable
security definer
set search_path = public
as $$
  select r.game_slug as slug, count(*)::bigint as rondas
  from game_rounds r
  where r.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 90)))
    and r.game_slug is not null
  group by r.game_slug
  order by count(*) desc, r.game_slug
  limit greatest(1, least(coalesce(p_limite, 10), 20));
$$;

grant execute on function juegos_mas_jugados(int, int) to authenticated;

notify pgrst, 'reload schema';
