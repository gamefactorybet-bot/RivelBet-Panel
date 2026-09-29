-- =========================================================
-- Carteles sobre la miniatura del juego (VIP / Hot / Nuevo /
-- animación propia) y portada elegible (proveedor o personalizada)
-- =========================================================

-- Biblioteca de animaciones Lottie reutilizables. Se suben una vez acá
-- y cualquier juego las puede usar — así no se repite la misma URL
-- pegada en 30 juegos, y borrar/renombrar una no rompe nada porque
-- games solo guarda el id.
create table if not exists animaciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  url         text not null,
  creado_por  text,
  created_at  timestamptz not null default now()
);

alter table animaciones enable row level security;

drop policy if exists "staff autenticado lee animaciones" on animaciones;
create policy "staff autenticado lee animaciones"
  on animaciones for select
  using (es_staff());

alter table games
  -- Portada: por defecto se usa imagen_url (la que sincroniza el
  -- proveedor). Si usar_imagen_personalizada es true, se usa esta otra
  -- en su lugar — así cambiar de una a otra no borra la que no se usa.
  add column if not exists imagen_personalizada_url text,
  add column if not exists usar_imagen_personalizada boolean not null default false,

  -- Cartel: null = sin cartel. 'vip' / 'hot' / 'nuevo' son presets fijos,
  -- sin datos extra. 'personalizado' apunta a una fila de animaciones.
  add column if not exists cartel_tipo text,
  add column if not exists cartel_animacion_id uuid references animaciones(id) on delete set null,

  -- Solo para 'nuevo': después de esta fecha se deja de mostrar solo,
  -- sin que nadie tenga que acordarse de sacarlo a mano.
  add column if not exists cartel_hasta date;
