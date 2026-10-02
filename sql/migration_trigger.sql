-- ============================================================
-- Migration: Replace create_profile RPC with auth.users trigger
-- Run this in: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- 1. Create the trigger function
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

-- 2. Create the trigger on auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Drop the old RPC function (no longer needed)
drop function if exists public.create_profile(text, text);

-- 4. Fix the stuck user (replace with actual values from the error)
-- First, find the stuck user's UUID:
-- select id, phone from auth.users where phone = 'USER_PHONE_HERE';
-- Then insert their profile:
-- insert into public.profiles (id, name, phone, role, approved)
-- values ('USER_UUID_HERE', 'USER_NAME', 'USER_PHONE_HERE', 'student', false);
