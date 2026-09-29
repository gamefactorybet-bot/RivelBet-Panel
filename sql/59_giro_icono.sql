-- Ícono Lottie del chip de giro diario en el portal.
alter table giro_diario_config
  add column if not exists icono_animacion_id uuid references animaciones(id) on delete set null;

create or replace function giro_estado(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'activo',  coalesce((select activo from giro_diario_config where id = 1), false),
    'premios', coalesce((select premios from giro_diario_config where id = 1), '[]'::jsonb),
    'icono_url', (
      select a.url
      from giro_diario_config c
      join animaciones a on a.id = c.icono_animacion_id
      where c.id = 1
    ),
    'giroHoy', (select jsonb_build_object('premio', premio, 'at', created_at)
                from giros_diarios
                where player_id = p_player_id
                  and fecha = (now() at time zone zona_casino())::date),
    'proximoAt', ((((now() at time zone zona_casino())::date + 1)::text || ' 00:00')
                  ::timestamp at time zone zona_casino())
  );
$$;

notify pgrst, 'reload schema';
