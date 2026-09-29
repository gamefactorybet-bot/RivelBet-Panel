-- Video corto en la portada: la foto sigue siendo la carta.
-- El clip solo se pide y se reproduce al pasar el mouse, nunca
-- todas juntas al abrir el lobby.
alter table games
  add column if not exists video_url text;

comment on column games.video_url is
  'MP4/WebM corto (2s, sin audio). Null = solo la foto.';
