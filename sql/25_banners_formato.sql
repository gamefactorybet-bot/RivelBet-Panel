-- =========================================================
-- Formato (proporción) del cuadro del banner, elegible por banner.
-- '2-1' es el nuevo default (menos aire en los costados); '16-7' es
-- el formato viejo, más ancho y bajo, para quien lo prefiera.
-- =========================================================

alter table banners
  add column if not exists formato text not null default '2-1';

alter table banners
  drop constraint if exists banners_formato_check;

alter table banners
  add constraint banners_formato_check check (formato in ('2-1', '16-7'));
