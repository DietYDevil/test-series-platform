-- ============================================================
-- Migration: Add Categories & Category Access
-- Run this in Supabase SQL Editor if database already exists
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- New tables
-- ------------------------------------------------------------
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  description   text,
  icon          text,
  display_order int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.category_access (
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  approved    boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  primary key (category_id, user_id)
);

-- Add category_id to tests if not exists
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'tests' and column_name = 'category_id') then
    alter table public.tests add column category_id uuid references public.categories(id) on delete set null;
  end if;
end $$;

-- ------------------------------------------------------------
-- Helper functions (create or replace)
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.can_view_test(tid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tests t
    left join public.categories c on t.category_id = c.id
    where t.id = tid
      and (
        public.is_admin()
        or (
          t.status = 'active'
          and (c.id is null or c.is_active = true)
          and (
            (t.all_users = true and (c.id is null or public.can_access_category(c.id)))
            or exists (select 1 from public.test_access a where a.test_id = t.id and a.user_id = auth.uid())
          )
        )
      ));
$$;

create or replace function public.can_access_category(cid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.categories c
    where c.id = cid
      and c.is_active = true
      and (
        public.is_admin()
        or exists (
          select 1 from public.category_access ca
          where ca.category_id = c.id
            and ca.user_id = auth.uid()
            and ca.approved = true
        )
      ));
$$;

-- ------------------------------------------------------------
-- RLS Policies - drop existing first to avoid conflicts
-- ------------------------------------------------------------
-- Categories
drop policy if exists "categories select for allowed users" on public.categories;
drop policy if exists "categories admin manage" on public.categories;

alter table public.categories enable row level security;

create policy "categories select for allowed users"
  on public.categories for select to authenticated
  using (public.can_access_category(id) or public.is_admin());

create policy "categories admin manage"
  on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tests - update policy to use new can_view_test
drop policy if exists "tests select for allowed users" on public.tests;

create policy "tests select for allowed users"
  on public.tests for select to authenticated
  using (public.can_view_test(id));

-- Category Access
drop policy if exists "category_access select own or admin" on public.category_access;
drop policy if exists "category_access admin manage" on public.category_access;

alter table public.category_access enable row level security;

create policy "category_access select own or admin"
  on public.category_access for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "category_access admin manage"
  on public.category_access for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------
create index if not exists idx_tests_category    on public.tests(category_id);
create index if not exists idx_category_access_user on public.category_access(user_id);
create index if not exists idx_category_access_cat on public.category_access(category_id);
create index if not exists idx_categories_order  on public.categories(display_order);

-- ------------------------------------------------------------
-- Seed default categories
-- ------------------------------------------------------------
insert into public.categories (name, description, icon, display_order)
values
  ('Class Tests', 'General class tests', '📝', 1),
  ('CSIR NET Dec 2026', 'CSIR NET December 2026 test series', '🧪', 2),
  ('GATE 2027', 'GATE 2027 test series', '🎓', 3)
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- Permissions
-- ------------------------------------------------------------
grant all on table public.categories      to anon, authenticated;
grant all on table public.category_access to anon, authenticated;

grant execute on function public.can_view_test(uuid)    to anon, authenticated;
grant execute on function public.can_access_category(uuid) to anon, authenticated;