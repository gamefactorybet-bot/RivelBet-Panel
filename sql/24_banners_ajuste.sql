-- =========================================================
-- Ajuste de imagen del banner: completa (sin recortar) o rellenar
-- el cuadro (puede recortar). Antes solo existía "completa" — se deja
-- como default para no cambiar el aspecto de los banners ya cargados.
-- =========================================================

alter table banners
  add column if not exists ajuste text not null default 'contain';

alter table banners
  drop constraint if exists banners_ajuste_check;

alter table banners
  add constraint banners_ajuste_check check (ajuste in ('contain', 'cover'));
