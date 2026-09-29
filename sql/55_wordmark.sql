-- Imagen del nombre en el header del portal.
-- Si hay URL, reemplaza el texto de casino_name. El logo chico se queda.
alter table casino_settings
  add column if not exists wordmark_url text;

comment on column casino_settings.wordmark_url is
  'PNG del nombre (RivelBet.online). Null = se muestra el texto.';
