-- =========================================================
-- Overrides de apariencia
-- El admin pinta cada capa (colores, botones, tipografía) a
-- mano. Se guarda como JSON encima del tema de partida, así
-- no hay que inventar un tema nuevo cada vez que se mueve un
-- color.
-- =========================================================

alter table casino_settings
  add column if not exists theme_overrides jsonb not null default '{}'::jsonb;

comment on column casino_settings.theme_overrides is
  'Pintura a mano de cada capa del portal. Pisa al tema de partida.';
