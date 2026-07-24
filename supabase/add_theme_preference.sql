-- Adiciona a preferência de tema (light | dark | system) ao perfil.
-- O booleano legado dark_mode continua sendo persistido como valor efetivo
-- resolvido pelo app, garantindo compatibilidade com componentes existentes.

alter table public.profiles
  add column if not exists theme_preference text not null default 'light';

-- Backfill: usuários existentes herdam a preferência a partir do dark_mode atual.
update public.profiles
  set theme_preference = case when dark_mode then 'dark' else 'light' end
  where theme_preference is null
     or theme_preference not in ('light', 'dark', 'system');

alter table public.profiles
  add constraint profiles_theme_preference_check
  check (theme_preference in ('light', 'dark', 'system'));
