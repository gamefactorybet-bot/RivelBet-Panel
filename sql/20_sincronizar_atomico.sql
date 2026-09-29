-- =========================================================
-- Corrige una condición de carrera real en sincronizar_juego.
--
-- La versión anterior hacía "SELECT para ver si existe" y RECIÉN
-- DESPUÉS decidía insertar o actualizar, en dos pasos separados. Si
-- dos sincronizaciones del mismo juego caen casi juntas (dos clicks
-- en "Sincronizar", o un reintento automático de la plataforma ante
-- una respuesta lenta del catálogo), las dos pueden ver "no existe"
-- al mismo tiempo — y la segunda choca contra games_slug_key al
-- intentar insertar un slug que la primera ya insertó un instante
-- antes. Es la misma clase de bug que se cerró en el motor de Mines
-- del lado del ensamblador de juegos: dos pasos separados en vez de
-- una escritura atómica.
--
-- La solución es un INSERT ... ON CONFLICT DO UPDATE de una sola
-- sentencia: la base de datos resuelve el choque a nivel de fila, sin
-- la ventana de tiempo donde dos pedidos pueden pisarse. El truco
-- "xmax = 0" es la forma estándar de Postgres de saber, después de
-- una sentencia así, si esa fila se acaba de insertar (xmax=0) o si
-- ya existía y se actualizó (xmax≠0) — así se puede seguir devolviendo
-- 'nuevo' / 'actualizado' / 'sin cambios' igual que antes.
--
-- Se mantiene EXACTO el resto del comportamiento: los juegos nuevos
-- entran desactivados, se salta la escritura si la versión entrante
-- no es más nueva, y lo que decide el operador (activo, orden,
-- categoría, límites) nunca se toca en una sincronización.
-- =========================================================

create or replace function sincronizar_juego(
  p_slug       text,
  p_nombre     text,
  p_motor      text,
  p_proveedor  text,
  p_config     jsonb,
  p_launch_url text,
  p_version    int,
  p_descripcion text default null,
  p_imagen_url  text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fue_insert boolean;
begin
  insert into games (slug, nombre, motor, proveedor, config, launch_url, version,
                     descripcion, imagen_url, activo, sincronizado_at)
  values (p_slug, p_nombre, p_motor, p_proveedor, p_config, p_launch_url, p_version,
          p_descripcion, p_imagen_url, false, now())
  on conflict (slug) do update set
    nombre = p_nombre,
    motor = p_motor,
    proveedor = p_proveedor,
    config = p_config,
    launch_url = p_launch_url,
    version = p_version,
    descripcion = coalesce(p_descripcion, games.descripcion),
    imagen_url = coalesce(p_imagen_url, games.imagen_url),
    sincronizado_at = now()
  -- Si la versión que llega no es más nueva que la que ya está
  -- guardada, esta condición da falso y Postgres no toca la fila —
  -- ahí abajo eso se traduce en "sin cambios", sin ninguna escritura
  -- de por medio.
  where coalesce(games.version, 0) < coalesce(p_version, 1)
  returning (xmax = 0) into v_fue_insert;

  if v_fue_insert is null then
    return 'sin cambios';
  elsif v_fue_insert then
    return 'nuevo';
  else
    return 'actualizado';
  end if;
end;
$$;
