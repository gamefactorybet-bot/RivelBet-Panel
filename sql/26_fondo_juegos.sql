-- =========================================================
-- Tercer fondo configurable: el del portal del jugador (donde están
-- los juegos), separado del fondo del login y del fondo del panel.
-- =========================================================

alter table casino_settings
  add column if not exists bg_juegos_url text,
  add column if not exists bg_juegos_dim int not null default 80;

comment on column casino_settings.bg_juegos_dim is 'Opacidad del velo sobre la imagen del portal del jugador (0-100)';
