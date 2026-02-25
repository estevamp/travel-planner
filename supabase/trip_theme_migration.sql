-- Migration to add theme_palette to trips table
alter table public.trips add column if not exists theme_palette text not null default 'default';
