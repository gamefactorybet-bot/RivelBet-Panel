-- =========================================================
-- Catálogo desacoplado
--
-- El objetivo: agregar un juego nuevo sin tocar el código del panel
-- ni el del portal. Para eso el panel deja de saber qué juegos
-- existen — solo lista filas de esta tabla.
--
-- Tres niveles de juego nuevo:
--   1. Mismo motor, otra config  -> una fila. Cero código.
--   2. Motor nuevo (5x3, ruleta) -> un archivo en el proyecto de juegos.
--   3. Proveedor externo         -> una fila con launch_url.
-- =========================================================

alter table games
  add column if not exists motor      text not null default 'clasico-3x3',
  add column if not exists proveedor  text not null default 'propio',
  add column if not exists config     jsonb,
  add column if not exists launch_url text,
  add column if not exists version    int not null default 1,
  add column if not exists sincronizado_at timestamptz;

comment on column games.motor is 'Qué motor resuelve el juego. Vacío si es de proveedor externo.';
comment on column games.config is 'Símbolos, pesos y tabla de pagos. Lo que hace que dos juegos del mismo motor sean distintos.';
comment on column games.launch_url is 'Solo para juegos de terceros: a dónde se manda al jugador.';
comment on column games.version is 'Sube cuando cambia la config, para saber si hay que resincronizar.';

-- ---------------------------------------------------------
-- Configuración de los tres juegos iniciales
--
-- Hasta ahora los tres compartían la misma tabla: eran el mismo juego
-- con distinto nombre. Ahora cada uno tiene su propia personalidad.
--
-- Los tres rondan el 92% de retorno, pero con volatilidad distinta:
--   fortune -> 91.8% · volatilidad 4.4 · mayor 330x  (equilibrado)
--   gems    -> 92.4% · volatilidad 3.6 · mayor 140x  (tranquilo)
--   hot7    -> 92.3% · volatilidad 5.7 · mayor 1150x (arriesgado)
--
-- Mismo retorno, experiencia distinta. Verificado con analizarConfig().
-- ---------------------------------------------------------

update games set
  motor = 'clasico-3x3',
  version = 1,
  config = jsonb_build_object(
    'simbolos', jsonb_build_array('cereza','limon','campana','trebol','corona','diamante','siete','wild'),
    'pesos',    jsonb_build_object('cereza',22,'limon',20,'campana',16,'trebol',13,'corona',9,'diamante',6,'siete',3,'wild',2),
    'pagos',    jsonb_build_object('cereza',4,'limon',6,'campana',12,'trebol',22,'corona',46,'diamante',82,'siete',165,'wild',330),
    'pagosDos', jsonb_build_object('cereza',1,'limon',1,'campana',2,'trebol',3,'corona',5,'diamante',10,'siete',22,'wild',40)
  )
where slug = 'fortune';

update games set
  motor = 'clasico-3x3',
  version = 1,
  config = jsonb_build_object(
    'simbolos', jsonb_build_array('cereza','limon','campana','trebol','corona','diamante','siete','wild'),
    -- Menos símbolos raros: se gana más seguido, pero más chico
    'pesos',    jsonb_build_object('cereza',20,'limon',18,'campana',16,'trebol',14,'corona',11,'diamante',8,'siete',5,'wild',3),
    'pagos',    jsonb_build_object('cereza',4,'limon',6,'campana',11,'trebol',17,'corona',27,'diamante',45,'siete',74,'wild',140),
    'pagosDos', jsonb_build_object('cereza',1,'limon',1,'campana',2,'trebol',3,'corona',4,'diamante',6,'siete',11,'wild',18)
  )
where slug = 'gems';

update games set
  motor = 'clasico-3x3',
  version = 1,
  config = jsonb_build_object(
    'simbolos', jsonb_build_array('cereza','limon','campana','trebol','corona','diamante','siete','wild'),
    -- Más símbolos raros: se gana menos seguido, pero el premio pesa
    'pesos',    jsonb_build_object('cereza',26,'limon',22,'campana',16,'trebol',12,'corona',8,'diamante',5,'siete',2,'wild',1),
    'pagos',    jsonb_build_object('cereza',4,'limon',6,'campana',16,'trebol',34,'corona',80,'diamante',168,'siete',520,'wild',1150),
    'pagosDos', jsonb_build_object('cereza',1,'limon',1,'campana',2,'trebol',4,'corona',7,'diamante',16,'siete',42,'wild',85)
  )
where slug = 'hot7';

-- ---------------------------------------------------------
-- Sincronización desde el manifiesto del proveedor
--
-- El panel trae el catálogo del proyecto de juegos y hace upsert.
-- Nunca pisa lo que decidió el operador: activo, orden, categoría y
-- límites de apuesta quedan como los dejó cada país.
-- ---------------------------------------------------------
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
  v_existente games;
begin
  select * into v_existente from games where slug = p_slug;

  if not found then
    -- Los juegos nuevos entran DESACTIVADOS a propósito: que aparezcan
    -- solos en el portal sin que nadie los revise es pedir problemas.
    insert into games (slug, nombre, motor, proveedor, config, launch_url, version,
                       descripcion, imagen_url, activo, sincronizado_at)
    values (p_slug, p_nombre, p_motor, p_proveedor, p_config, p_launch_url, p_version,
            p_descripcion, p_imagen_url, false, now());
    return 'nuevo';
  end if;

  if coalesce(v_existente.version, 0) >= coalesce(p_version, 1) then
    return 'sin cambios';
  end if;

  -- Actualizamos solo lo que define el proveedor. Lo que decide el
  -- operador (activo, orden, categoría, límites) no se toca.
  update games set
    nombre = p_nombre,
    motor = p_motor,
    proveedor = p_proveedor,
    config = p_config,
    launch_url = p_launch_url,
    version = p_version,
    descripcion = coalesce(p_descripcion, descripcion),
    imagen_url = coalesce(p_imagen_url, imagen_url),
    sincronizado_at = now()
  where slug = p_slug;

  return 'actualizado';
end;
$$;
