-- =====================================================================
-- PECARSYS Móvil — endurecimiento de seguridad (ver Context/Security-Review.md)
-- 1. Segundo factor (MFA) exigido por la base de datos:
--    - Administradores: siempre aal2 (contraseña + código).
--    - Cualquier usuario que activó MFA: aal2 (una contraseña robada no basta).
-- 2. Nunca quedarse sin administradores activos.
-- =====================================================================

-- Nivel de la sesión actual: 'aal1' (sólo contraseña) o 'aal2' (con segundo factor).
create or replace function public.session_is_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
    select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- Lectura de datos comerciales: usuario activo y, si es admin o tiene MFA, sesión aal2.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_active
          and (
              public.session_is_aal2()
              or (
                  p.role <> 'admin'
                  and not exists (
                      select 1 from auth.mfa_factors f
                      where f.user_id = p.id and f.status = 'verified'
                  )
              )
          )
    );
$$;

-- Administración (usuarios, bitácora): admin activo con sesión aal2.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.session_is_aal2()
       and exists (
           select 1 from public.profiles
           where id = auth.uid() and is_active and role = 'admin'
       );
$$;

grant execute on function public.session_is_aal2() to authenticated;

-- Evita bloquear o degradar al último administrador activo.
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if old.role = 'admin' and old.is_active
       and (new.role <> 'admin' or not new.is_active)
       and not exists (
           select 1 from public.profiles
           where id <> old.id and role = 'admin' and is_active
       )
    then
        raise exception 'Debe existir al menos un administrador activo.';
    end if;
    return new;
end;
$$;

create trigger profiles_protect_last_admin
    before update of role, is_active on public.profiles
    for each row execute function public.protect_last_admin();
