-- =========================================================
-- Imágenes de fondo
-- Dos fondos separados: uno para el login (a pantalla completa,
-- es la primera impresión) y otro para el panel (más tenue, no
-- puede competir con las tablas de números).
-- =========================================================

alter table casino_settings
  add column if not exists bg_login_url   text,
  add column if not exists bg_panel_url   text,
  add column if not exists bg_login_dim   int not null default 55,
  add column if not exists bg_panel_dim   int not null default 88;

-- bg_*_dim: cuánto se oscurece la imagen, de 0 a 100.
-- 0 = imagen a full, 100 = fondo sólido del tema.
-- El panel arranca en 88 porque ahí lo que importa es leer los montos,
-- no la foto.

comment on column casino_settings.bg_login_dim is 'Opacidad del velo sobre la imagen del login (0-100)';
comment on column casino_settings.bg_panel_dim is 'Opacidad del velo sobre la imagen del panel (0-100)';
