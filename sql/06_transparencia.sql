-- =========================================================
-- Transparencia de las superficies
-- Permite que las tarjetas dejen ver la imagen de fondo en
-- lugar de taparla con un color sólido.
-- =========================================================

alter table casino_settings
  add column if not exists surface_opacity int not null default 100,
  add column if not exists surface_blur    int not null default 0;

-- surface_opacity: 100 = tarjeta sólida (como hasta ahora),
--                  0   = tarjeta totalmente transparente.
-- surface_blur:    desenfoque del fondo detrás de la tarjeta, en px.
--                  Con transparencia alta conviene subirlo, porque el
--                  desenfoque es lo que mantiene legible el texto sin
--                  volver a tapar la imagen.

comment on column casino_settings.surface_opacity is 'Opacidad de tarjetas y paneles (0-100)';
comment on column casino_settings.surface_blur is 'Desenfoque detrás de las tarjetas, en px (0-30)';
