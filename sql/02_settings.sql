-- =========================================================
-- Apariencia del casino — tema + plantilla
-- Una sola fila (id = 1). El panel la lee al arrancar y
-- el portal del jugador va a leer la misma fila, así ambos
-- lados se ven igual sin duplicar configuración.
-- =========================================================

create table if not exists casino_settings (
  id            int primary key default 1 check (id = 1),
  casino_name   text not null default 'Casino',
  logo_url      text,
  theme_key     text not null default 'carmesi-rivelbet',
  template_key  text not null default 'clasico',
  updated_by    text,
  updated_at    timestamptz not null default now()
);

insert into casino_settings (id) values (1)
on conflict (id) do nothing;

alter table casino_settings enable row level security;

-- Lectura pública: el portal del jugador necesita leer el tema
-- antes de que nadie se loguee (para pintar la pantalla de login).
drop policy if exists "cualquiera lee la apariencia" on casino_settings;

create policy "cualquiera lee la apariencia"
  on casino_settings for select
  using (true);

-- Sin policy de update => el cliente no puede escribir.
-- El cambio de apariencia pasa por /api/settings con Service Role,
-- y ahí se valida que quien lo pide sea admin.
