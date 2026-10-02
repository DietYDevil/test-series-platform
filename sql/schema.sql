-- ============================================================
-- Test Series Platform - Supabase schema
-- Run this whole file in: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  phone       text not null unique,
  name        text not null,
  role        text not null default 'student' check (role in ('student','admin')),
  approved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  description   text,
  icon          text,
  display_order int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.tests (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  subject       text,
  description   text,
  duration_min  int not null default 60,
  total_qs      int not null default 0,
  max_score     int not null default 0,
  all_users     boolean not null default true,
  status        text not null default 'active' check (status in ('active','archived')),
  category_id   uuid references public.categories(id) on delete set null,
  data          jsonb not null,
  created_at    timestamptz not null default now()
);

-- which specific students can take a test (used when all_users = false)
create table if not exists public.test_access (
  test_id uuid not null references public.tests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (test_id, user_id)
);

-- category access: admin controls which approved students can access each category
create table if not exists public.category_access (
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  approved    boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  primary key (category_id, user_id)
);

create table if not exists public.results (
  id            uuid primary key default gen_random_uuid(),
  test_id       uuid not null references public.tests(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  score         numeric not null default 0,
  max_score     int not null default 0,
  correct       int not null default 0,
  incorrect     int not null default 0,
  unattempted   int not null default 0,
  time_used_sec int not null default 0,
  answers       jsonb not null default '[]',
  time_spent    jsonb not null default '[]',
  marked        jsonb not null default '[]',
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz not null default now(),
  unique (test_id, user_id)
);

-- ------------------------------------------------------------
-- Helper functions
-- ------------------------------------------------------------
-- Is the current signed-in user an admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Can the current user access this category?
-- Only via explicit admin approval in category_access table
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

-- Can the current user view / take this test?
-- Requires: test active, category active (if categorized), AND
-- (admin OR (all_users with category access) OR explicit test_access)
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

-- Auto-create profile when a new user signs up.
-- The very FIRST account ever created automatically becomes the admin.
-- (Sign up your own admin account first!)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if exists (select 1 from public.profiles) then
    v_role := 'student';
  else
    v_role := 'admin';
  end if;
  insert into public.profiles (id, name, phone, role, approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.phone,
    v_role,
    v_role = 'admin'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Seed default categories if none exist
insert into public.categories (name, description, icon, display_order)
values
  ('Class Tests', 'General class tests', '📝', 1),
  ('CSIR NET Dec 2026', 'CSIR NET December 2026 test series', '🧪', 2),
  ('GATE 2027', 'GATE 2027 test series', '🎓', 3)
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.tests           enable row level security;
alter table public.test_access     enable row level security;
alter table public.category_access enable row level security;
alter table public.results         enable row level security;

-- profiles: users see only their own; admin sees everyone
create policy "profiles select own or admin"
  on public.profiles for select to authenticated
  using (auth.uid() = id or public.is_admin());

-- students must NEVER edit their profile (name + phone stay locked)
create policy "profiles admin update"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "profiles admin delete"
  on public.profiles for delete to authenticated
  using (public.is_admin());

-- categories: admin manages all; students see active categories they have access to
create policy "categories select for allowed users"
  on public.categories for select to authenticated
  using (public.can_access_category(id) or public.is_admin());

create policy "categories admin manage"
  on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- tests: approved students see allowed tests; admin sees all
create policy "tests select for allowed users"
  on public.tests for select to authenticated
  using (public.can_view_test(id));

create policy "tests admin manage"
  on public.tests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- test_access: students see their own assignments; admin manages all
create policy "test_access select own or admin"
  on public.test_access for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "test_access admin insert"
  on public.test_access for insert to authenticated
  with check (public.is_admin());

create policy "test_access admin update"
  on public.test_access for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "test_access admin delete"
  on public.test_access for delete to authenticated
  using (public.is_admin());

-- category_access: students see their own; admin manages all
create policy "category_access select own or admin"
  on public.category_access for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "category_access admin manage"
  on public.category_access for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- results: students see + create their own; admin sees/manages all
create policy "results select own or admin"
  on public.results for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "results insert own"
  on public.results for insert to authenticated
  with check (user_id = auth.uid());

create policy "results admin update"
  on public.results for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "results admin delete"
  on public.results for delete to authenticated
  using (public.is_admin());

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------
create index if not exists idx_tests_status      on public.tests(status);
create index if not exists idx_tests_category    on public.tests(category_id);
create index if not exists idx_access_user       on public.test_access(user_id);
create index if not exists idx_access_test       on public.test_access(test_id);
create index if not exists idx_category_access_user on public.category_access(user_id);
create index if not exists idx_category_access_cat on public.category_access(category_id);
create index if not exists idx_results_user      on public.results(user_id);
create index if not exists idx_results_test      on public.results(test_id);
create index if not exists idx_categories_order  on public.categories(display_order);

-- ------------------------------------------------------------
-- Permissions
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant all on table public.profiles        to anon, authenticated;
grant all on table public.categories      to anon, authenticated;
grant all on table public.tests           to anon, authenticated;
grant all on table public.test_access     to anon, authenticated;
grant all on table public.category_access to anon, authenticated;
grant all on table public.results         to anon, authenticated;

grant execute on function public.is_admin()             to anon, authenticated;
grant execute on function public.can_view_test(uuid)    to anon, authenticated;
grant execute on function public.can_access_category(uuid) to anon, authenticated;
grant execute on function public.handle_new_user() to authenticated;