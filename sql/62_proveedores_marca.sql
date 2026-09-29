-- =========================================================
-- Marcas de proveedor para el lobby
--
-- Distinto de proveedores_externos: esa tabla es el secreto de la
-- API de plata. Esta es la cara que ve el jugador (icono 1:1 + nombre).
-- Se engancha a games.proveedor (el texto que trae Haty / el catálogo).
--
-- Después de correr:  notify pgrst, 'reload schema';
-- =========================================================

create table if not exists proveedores_marca (
  id         uuid primary key default gen_random_uuid(),
  clave      text not null,          -- = games.proveedor
  nombre     text not null,          -- lo que se lee en el portal
  slug       text not null,
  icono_url  text,                   -- cuadrado 1:1
  orden      int not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_prov_marca_clave on proveedores_marca (clave);
create unique index if not exists idx_prov_marca_slug on proveedores_marca (slug);
create index if not exists idx_prov_marca_lobby on proveedores_marca (activo, orden);

comment on table proveedores_marca is
  'Marca de estudio para el lobby: icono 1:1 y nombre. No guarda secretos de API.';
comment on column proveedores_marca.clave is
  'Debe coincidir con games.proveedor (texto del catálogo).';

alter table proveedores_marca enable row level security;
drop policy if exists "staff lee marcas de proveedor" on proveedores_marca;
create policy "staff lee marcas de proveedor"
  on proveedores_marca for select using (es_staff());
