-- Activa el tema visual RivelBet Carmesí en instalaciones existentes.
update public.casino_settings
set theme_key = 'carmesi-rivelbet'
where theme_key in ('mesa-verde', 'oro-real');
