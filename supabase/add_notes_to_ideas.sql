-- Migration to add notes column to ideas table
alter table public.ideas add column if not exists notes text;
