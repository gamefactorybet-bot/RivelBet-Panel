-- Clip corto opcional en el banner. La imagen sigue siendo la foto
-- de fondo. El video solo se pide y se reproduce en el slide visible.
alter table banners
  add column if not exists video_url text;

comment on column banners.video_url is
  'MP4/WebM ~3s, sin audio. Null = solo la imagen.';
