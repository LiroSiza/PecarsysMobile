-- =====================================================================
-- PECARSYS Móvil — esquema inicial
-- Ejecutar completo en Supabase > SQL Editor (una sola vez).
-- Escrituras: sólo el backend con la llave secreta (service_role omite RLS).
-- Lecturas: usuarios autenticados y activos, vía RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Perfiles de usuario
-- ---------------------------------------------------------------------
create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null unique,
    full_name text not null default '',
    role text not null default 'vendedor' check (role in ('admin', 'vendedor')),
    is_active boolean not null default false,
    created_at timestamptz not null default now()
);

-- Cada registro en Auth crea su perfil pendiente de aprobación.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, email, full_name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Ayudantes para las políticas (security definer evita recursión de RLS).
create function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.profiles where id = auth.uid() and is_active and role = 'admin');
$$;

-- ---------------------------------------------------------------------
-- 2. Catálogo y precios (lista diaria; upsert, nunca se borra)
-- ---------------------------------------------------------------------
create table public.catalog (
    pecarsys text primary key,
    medida text,
    marca text,
    modelo text,
    indice text,
    categoria text,                       -- Pestaña de origen: LLANTAS, CAMION…
    esquema_precio text check (esquema_precio in ('escalones', 'unico')),
    inventario_matriz integer not null default 0,
    precio_1 numeric(12, 2),              -- $1 a $199,999 / PRECIO UNICO
    precio_2 numeric(12, 2),              -- $200,000 a $499,999
    precio_3 numeric(12, 2),              -- $500,000 o más acumulativo
    precio_4 numeric(12, 2),              -- $1,000,000 o más acumulativo
    precio_5 numeric(12, 2),              -- $1,500,000 en 1 exhibición
    precio_especial numeric(12, 2),
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Existencias por sucursal (foto completa del reporte ERP)
-- ---------------------------------------------------------------------
create table public.inventory (
    pecarsys text not null,               -- Sin FK: puede haber inventario sin precio
    sucursal text not null,
    descripcion text not null default '',
    linea text,
    marca text,
    existencia integer not null default 0,
    apartados integer not null default 0,
    primary key (pecarsys, sucursal)
);

create table public.inventory_snapshots (
    sucursal text primary key,
    taken_at timestamptz,                 -- Fecha/hora impresa en el reporte
    imported_at timestamptz not null default now(),
    row_count integer not null default 0
);

-- ---------------------------------------------------------------------
-- 4. Bitácora de importaciones
-- ---------------------------------------------------------------------
create table public.import_log (
    id bigint generated always as identity primary key,
    kind text not null check (kind in ('inventory', 'prices')),
    filename text,
    sucursal text,
    summary jsonb,
    warnings jsonb,
    imported_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Vista de consulta para el celular
-- ---------------------------------------------------------------------
create view public.product_search
with (security_invoker = true)
as
select
    coalesce(i.pecarsys, c.pecarsys) as pecarsys,
    i.sucursal,
    coalesce(i.descripcion, '') as descripcion,
    coalesce(i.marca, c.marca) as marca,
    i.linea,
    c.medida,
    c.modelo,
    c.indice,
    c.categoria,
    c.esquema_precio,
    coalesce(i.existencia, 0) as existencia,
    coalesce(i.apartados, 0) as apartados,
    coalesce(i.existencia, 0) - coalesce(i.apartados, 0) as disponible,
    c.inventario_matriz,
    c.precio_1,
    c.precio_2,
    c.precio_3,
    c.precio_4,
    c.precio_5,
    c.precio_especial,
    case
        when i.pecarsys is not null and c.pecarsys is not null then 'both'
        when i.pecarsys is not null then 'left_only'
        else 'right_only'
    end as match_status
from public.inventory i
full outer join public.catalog c on c.pecarsys = i.pecarsys;

-- ---------------------------------------------------------------------
-- 6. Funciones de importación (atómicas; sólo el backend las ejecuta)
-- ---------------------------------------------------------------------
create function public.import_inventory(
    p_sucursal text,
    p_taken_at timestamptz,
    p_rows jsonb,
    p_filename text default null,
    p_summary jsonb default null,
    p_warnings jsonb default null,
    p_imported_by uuid default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
    inserted integer;
begin
    -- El reporte sólo trae existencias positivas: lo que no viene quedó en 0.
    delete from public.inventory where sucursal = p_sucursal;

    insert into public.inventory (pecarsys, sucursal, descripcion, linea, marca, existencia, apartados)
    select r.pecarsys, p_sucursal, coalesce(r.descripcion, ''), r.linea, r.marca,
           coalesce(r.existencia, 0), coalesce(r.apartados, 0)
    from jsonb_to_recordset(p_rows) as r (
        pecarsys text, descripcion text, linea text, marca text, existencia integer, apartados integer
    );
    get diagnostics inserted = row_count;

    insert into public.inventory_snapshots (sucursal, taken_at, imported_at, row_count)
    values (p_sucursal, p_taken_at, now(), inserted)
    on conflict (sucursal) do update
        set taken_at = excluded.taken_at, imported_at = excluded.imported_at, row_count = excluded.row_count;

    insert into public.import_log (kind, filename, sucursal, summary, warnings, imported_by)
    values ('inventory', p_filename, p_sucursal, p_summary, p_warnings, p_imported_by);

    return inserted;
end;
$$;

create function public.upsert_catalog(
    p_rows jsonb,
    p_filename text default null,
    p_summary jsonb default null,
    p_warnings jsonb default null,
    p_imported_by uuid default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
    affected integer;
begin
    insert into public.catalog as c (
        pecarsys, medida, marca, modelo, indice, categoria, esquema_precio, inventario_matriz,
        precio_1, precio_2, precio_3, precio_4, precio_5, precio_especial, updated_at
    )
    select r.pecarsys, r.medida, r.marca, r.modelo, r.indice, r.categoria, r.esquema_precio,
           coalesce(r.inventario_matriz, 0),
           r.precio_1, r.precio_2, r.precio_3, r.precio_4, r.precio_5, r.precio_especial, now()
    from jsonb_to_recordset(p_rows) as r (
        pecarsys text, medida text, marca text, modelo text, indice text, categoria text,
        esquema_precio text, inventario_matriz integer,
        precio_1 numeric, precio_2 numeric, precio_3 numeric, precio_4 numeric, precio_5 numeric,
        precio_especial numeric
    )
    on conflict (pecarsys) do update set
        medida = excluded.medida,
        marca = excluded.marca,
        modelo = excluded.modelo,
        indice = excluded.indice,
        categoria = excluded.categoria,
        esquema_precio = excluded.esquema_precio,
        inventario_matriz = excluded.inventario_matriz,
        precio_1 = excluded.precio_1,
        precio_2 = excluded.precio_2,
        precio_3 = excluded.precio_3,
        precio_4 = excluded.precio_4,
        precio_5 = excluded.precio_5,
        precio_especial = excluded.precio_especial,
        updated_at = excluded.updated_at;
    get diagnostics affected = row_count;

    insert into public.import_log (kind, filename, summary, warnings, imported_by)
    values ('prices', p_filename, p_summary, p_warnings, p_imported_by);

    return affected;
end;
$$;

-- Las funciones son ejecutables por PUBLIC por defecto: se restringen al backend.
revoke execute on function public.import_inventory(text, timestamptz, jsonb, text, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.upsert_catalog(jsonb, text, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.import_inventory(text, timestamptz, jsonb, text, jsonb, jsonb, uuid) to service_role;
grant execute on function public.upsert_catalog(jsonb, text, jsonb, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 7. Seguridad a nivel de fila (RLS)
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.catalog enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_snapshots enable row level security;
alter table public.import_log enable row level security;

-- Perfiles: cada quien ve el suyo (para saber si está aprobado); el admin ve y edita todos.
create policy "profiles: ver propio o admin" on public.profiles
    for select to authenticated
    using (id = auth.uid() or public.is_admin());

create policy "profiles: admin actualiza" on public.profiles
    for update to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- Datos comerciales: sólo usuarios aprobados. Sin políticas de escritura:
-- únicamente el backend (service_role) puede modificarlos.
create policy "catalog: usuarios activos" on public.catalog
    for select to authenticated using (public.is_active_user());

create policy "inventory: usuarios activos" on public.inventory
    for select to authenticated using (public.is_active_user());

create policy "snapshots: usuarios activos" on public.inventory_snapshots
    for select to authenticated using (public.is_active_user());

create policy "import_log: admin" on public.import_log
    for select to authenticated using (public.is_admin());

-- La vista no debe ser visible para anónimos.
revoke all on public.product_search from anon;
