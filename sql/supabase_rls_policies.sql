-- Supabase RLS policies for public read access to `public.trends`.
-- Run this in Supabase Dashboard → SQL Editor.
--
-- WARNING:
-- This enables *public* (anon) read access. Use only if your `trends` data is meant to be public.

alter table public.trends enable row level security;

drop policy if exists "Public read trends" on public.trends;

create policy "Public read trends"
on public.trends
for select
to anon
using (true);

