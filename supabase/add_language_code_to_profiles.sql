alter table public.profiles
  add column if not exists language_code text not null default 'pt-BR';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_language_code_chk'
  ) then
    alter table public.profiles
      add constraint profiles_language_code_chk
      check (language_code in ('pt-BR', 'en'));
  end if;
end
$$;
