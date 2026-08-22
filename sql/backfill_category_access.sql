-- ============================================================
-- One-time fix: sync existing TEST-level assignments into
-- CATEGORY (folder) access.
--
-- Run this ONCE in: Supabase Dashboard -> SQL Editor -> New query
--
-- Why: assigning a student to a test only writes to `test_access`.
-- Folders check `category_access`, so students with test-level
-- access saw no folders/tests. This copies those grants over.
-- ============================================================

insert into public.category_access (category_id, user_id, approved, approved_at)
select distinct t.category_id, ta.user_id, true, now()
from public.test_access ta
join public.tests t on t.id = ta.test_id
where t.category_id is not null
on conflict (category_id, user_id) do nothing;
