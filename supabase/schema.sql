-- =====================================================================
--  Nuestra Casa — base para sincronizar entre celulares
--
--  Cómo usarlo:
--   1. Entrá a https://supabase.com y creá un proyecto gratis.
--   2. Abrí "SQL Editor" → "New query".
--   3. Pegá TODO este archivo y apretá "Run".
--   4. Andá a Settings → API y copiá "Project URL" y la clave "anon public".
--   5. En la app: Ajustes → Sincronización → pegá los dos valores
--      y generá un "código del hogar". El mismo código va en los dos
--      teléfonos.
-- =====================================================================

create table if not exists public.records (
  space_id   text        not null,
  kind       text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted    boolean     not null default false,
  primary key (space_id, kind, id)
);

-- Consulta principal de la app: todo lo de un hogar.
create index if not exists records_space_idx on public.records (space_id, updated_at desc);

alter table public.records enable row level security;

-- --------------------------------------------------------------------
--  Permisos
--
--  La app no usa login: la llave de acceso es el "código del hogar", que
--  es un valor aleatorio de 128 bits que sólo tienen ustedes dos. Estas
--  policies permiten leer y escribir filas siempre que se indique un
--  space_id, y exigen que el código tenga al menos 16 caracteres para que
--  nadie entre probando códigos cortos.
--
--  Tratá el código como una contraseña: quien lo tenga (junto con la URL
--  y la anon key) puede ver y editar los gastos de ese hogar.
-- --------------------------------------------------------------------

drop policy if exists "leer por espacio" on public.records;
create policy "leer por espacio"
  on public.records for select
  using (length(space_id) >= 16);

drop policy if exists "escribir por espacio" on public.records;
create policy "escribir por espacio"
  on public.records for insert
  with check (length(space_id) >= 16);

drop policy if exists "actualizar por espacio" on public.records;
create policy "actualizar por espacio"
  on public.records for update
  using (length(space_id) >= 16)
  with check (length(space_id) >= 16);

-- Los borrados de la app son lógicos (deleted = true), así que no hace
-- falta habilitar DELETE. Si algún día querés limpiar de verdad, corré
-- un delete manual desde el editor de Supabase.

-- --------------------------------------------------------------------
--  Opcional: limpieza de tumbas viejas (registros borrados hace más de
--  un año). Ejecutalo cuando quieras; no es necesario para que funcione.
-- --------------------------------------------------------------------
-- delete from public.records
--  where deleted = true and updated_at < now() - interval '365 days';
