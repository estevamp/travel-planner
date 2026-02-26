-- Add is_converted column to ideas table
alter table public.ideas add column if not exists is_converted boolean not null default false;
