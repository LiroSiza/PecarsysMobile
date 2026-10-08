-- =====================================================================
-- PECARSYS Móvil — permisos para la Data API
-- Los proyectos nuevos de Supabase no otorgan permisos automáticos a los
-- roles de la API sobre tablas creadas por SQL. RLS sigue filtrando qué
-- filas ve cada usuario; estos GRANT sólo habilitan el acceso a los objetos.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Backend (llave secreta): acceso total.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Usuarios con sesión: sólo lectura (RLS limita a usuarios activos / admin).
grant select on public.catalog, public.inventory, public.inventory_snapshots,
    public.import_log, public.product_search to authenticated;
grant select, update (role, is_active, full_name) on public.profiles to authenticated;

-- Funciones usadas por las políticas RLS.
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
