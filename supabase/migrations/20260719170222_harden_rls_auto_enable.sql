-- Older Supabase projects may contain this platform helper. New projects do
-- not, so harden it only when present instead of making fresh setup fail.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable()
      from public, anon, authenticated;
  end if;
end
$$;
