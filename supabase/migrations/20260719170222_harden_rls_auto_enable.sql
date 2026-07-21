-- The event trigger is invoked internally by Postgres during DDL. API roles
-- never need to call this SECURITY DEFINER function directly.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
