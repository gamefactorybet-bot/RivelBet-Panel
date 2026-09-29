-- =========================================================
-- Catálogo del panel a escala (miles de juegos)
--
-- El GET viejo traía TODOS los juegos y TODAS las rondas. Con 5.000
-- títulos se parte. Esta función pagina, busca y arma facetas
-- (categoría, proveedor, tipo/motor, estado, origen) en un viaje.
--
-- Después de correr:  notify pgrst, 'reload schema';
-- =========================================================

create index if not exists idx_games_categoria on games (categoria);
create index if not exists idx_games_proveedor on games (proveedor);
create index if not exists idx_games_motor on games (motor);
create index if not exists idx_games_activo_orden on games (activo, orden, nombre);

create or replace function juegos_panel(
  p_q          text default null,
  p_categoria  text default null,
  p_proveedor  text default null,
  p_motor      text default null,
  p_estado     text default null,
  p_origen     text default null,
  p_pagina     int  default 1,
  p_por_pagina int  default 50
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      nullif(replace(replace(btrim(coalesce(p_q, '')), '%', ''), '_', ''), '') as q,
      nullif(btrim(coalesce(p_categoria, '')), '') as categoria,
      nullif(btrim(coalesce(p_proveedor, '')), '') as proveedor,
      nullif(btrim(coalesce(p_motor, '')), '') as motor,
      case when p_estado in ('activo', 'oculto') then p_estado end as estado,
      case when p_origen in ('propio', 'externo') then p_origen end as origen,
      greatest(1, coalesce(p_pagina, 1)) as pagina,
      least(100, greatest(10, coalesce(p_por_pagina, 50))) as por
  ),
  base as (
    select
      g.*,
      case when g.launch_url is not null then 'externo' else 'propio' end as origen,
      coalesce(
        nullif(g.motor, ''),
        case when g.launch_url is not null then 'externo' else 'propio' end
      ) as tipo
    from games g, params p
    where p.q is null
       or g.nombre ilike '%' || p.q || '%'
       or g.slug   ilike '%' || p.q || '%'
  ),
  filtrado as (
    select b.* from base b, params p
    where (p.categoria is null or b.categoria = p.categoria)
      and (p.proveedor is null or b.proveedor = p.proveedor)
      and (p.motor     is null or b.tipo = p.motor)
      and (p.estado    is null or b.activo = (p.estado = 'activo'))
      and (p.origen    is null or b.origen = p.origen)
  )
  select jsonb_build_object(
    'total', (select count(*)::int from filtrado),
    'pagina', (select pagina from params),
    'porPagina', (select por from params),
    'juegos', coalesce((
      select jsonb_agg(to_jsonb(f) - 'config' - 'origen' - 'tipo' order by f.orden, f.nombre)
      from (
        select *
        from filtrado
        order by orden, nombre
        offset (select (pagina - 1) * por from params)
        limit  (select por from params)
      ) f
    ), '[]'::jsonb),
    'facets', jsonb_build_object(
      'categorias', coalesce((
        select jsonb_agg(jsonb_build_object('valor', categoria, 'n', n) order by n desc, categoria)
        from (
          select b.categoria, count(*)::int as n
          from base b, params p
          where (p.proveedor is null or b.proveedor = p.proveedor)
            and (p.motor     is null or b.tipo = p.motor)
            and (p.estado    is null or b.activo = (p.estado = 'activo'))
            and (p.origen    is null or b.origen = p.origen)
          group by b.categoria
        ) x
      ), '[]'::jsonb),
      'proveedores', coalesce((
        select jsonb_agg(jsonb_build_object('valor', proveedor, 'n', n) order by n desc, proveedor)
        from (
          select b.proveedor, count(*)::int as n
          from base b, params p
          where (p.categoria is null or b.categoria = p.categoria)
            and (p.motor     is null or b.tipo = p.motor)
            and (p.estado    is null or b.activo = (p.estado = 'activo'))
            and (p.origen    is null or b.origen = p.origen)
          group by b.proveedor
        ) x
      ), '[]'::jsonb),
      'motores', coalesce((
        select jsonb_agg(jsonb_build_object('valor', tipo, 'n', n) order by n desc, tipo)
        from (
          select b.tipo, count(*)::int as n
          from base b, params p
          where (p.categoria is null or b.categoria = p.categoria)
            and (p.proveedor is null or b.proveedor = p.proveedor)
            and (p.estado    is null or b.activo = (p.estado = 'activo'))
            and (p.origen    is null or b.origen = p.origen)
          group by b.tipo
        ) x
      ), '[]'::jsonb),
      'estados', jsonb_build_object(
        'activo', (select count(*)::int from base b, params p
                   where b.activo
                     and (p.categoria is null or b.categoria = p.categoria)
                     and (p.proveedor is null or b.proveedor = p.proveedor)
                     and (p.motor     is null or b.tipo = p.motor)
                     and (p.origen    is null or b.origen = p.origen)),
        'oculto', (select count(*)::int from base b, params p
                   where not b.activo
                     and (p.categoria is null or b.categoria = p.categoria)
                     and (p.proveedor is null or b.proveedor = p.proveedor)
                     and (p.motor     is null or b.tipo = p.motor)
                     and (p.origen    is null or b.origen = p.origen))
      ),
      'origen', jsonb_build_object(
        'propio', (select count(*)::int from base b, params p
                   where b.origen = 'propio'
                     and (p.categoria is null or b.categoria = p.categoria)
                     and (p.proveedor is null or b.proveedor = p.proveedor)
                     and (p.motor     is null or b.tipo = p.motor)
                     and (p.estado    is null or b.activo = (p.estado = 'activo'))),
        'externo', (select count(*)::int from base b, params p
                    where b.origen = 'externo'
                      and (p.categoria is null or b.categoria = p.categoria)
                      and (p.proveedor is null or b.proveedor = p.proveedor)
                      and (p.motor     is null or b.tipo = p.motor)
                      and (p.estado    is null or b.activo = (p.estado = 'activo')))
      )
    )
  );
$$;

grant execute on function juegos_panel(text, text, text, text, text, text, int, int) to authenticated;
