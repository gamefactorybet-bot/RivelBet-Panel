-- =========================================================
-- Banners del portal del jugador
-- La imagen vive en Cloudinary (o una URL externa); acá va
-- la referencia, el texto encima y cuándo mostrarlo.
-- =========================================================

create table if not exists banners (
  id           uuid primary key default gen_random_uuid(),
  imagen_url   text not null,
  imagen_public_id text,              -- ID en Cloudinary, para poder borrarla
  titulo       text,
  subtitulo    text,
  link_url     text,                  -- opcional: a dónde lleva al tocarlo
  orden        int not null default 0,
  activo       boolean not null default true,
  desde        timestamptz,           -- opcional: programar una promo
  hasta        timestamptz,
  created_by   text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_banners_activos on banners (activo, orden);

alter table banners enable row level security;

-- Lectura pública de los activos: el portal los muestra sin login.
drop policy if exists "cualquiera lee banners activos" on banners;

create policy "cualquiera lee banners activos"
  on banners for select
  using (activo = true);

-- Sin policy de escritura: se administran desde /api/banners con
-- Service Role, validando el permiso 'ajustes'.
