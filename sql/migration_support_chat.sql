-- ============================================================
-- Support Chat migration
-- Run this whole file in: Supabase Dashboard -> SQL Editor -> New query
-- Adds a WhatsApp-style message table between students and admin.
-- ============================================================

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_user uuid not null references public.profiles(id) on delete cascade, -- conversation owner (the student)
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  is_admin    boolean not null default false,
  body        text not null,
  created_at  timestamptz not null default now()
);

alter table public.support_messages enable row level security;

-- students see only their own conversation; admin sees everything
create policy "support select own thread or admin"
  on public.support_messages for select to authenticated
  using (thread_user = auth.uid() or public.is_admin());

-- a student can only post inside their own thread; admin can reply in any
create policy "support insert own"
  on public.support_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (public.is_admin() or thread_user = auth.uid())
  );

create index if not exists idx_support_thread on public.support_messages(thread_user, created_at);

grant all on table public.support_messages to authenticated;

-- enable realtime so new messages appear live without refresh
do $$
begin
  alter publication supabase_realtime add table public.support_messages;
exception
  when duplicate_object then null; -- already added
  when others then null;           -- realtime not available; chat still works with polling
end $$;
