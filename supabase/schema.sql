-- Dotlyt: 한 사람당 노트 한 권을 통째로(JSON) 저장한다.
-- 행 수준 보안(RLS): 로그인한 본인 행만 읽고 쓸 수 있다.

create table if not exists public.notebooks (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.notebooks enable row level security;

drop policy if exists "own notebook: select" on public.notebooks;
drop policy if exists "own notebook: insert" on public.notebooks;
drop policy if exists "own notebook: update" on public.notebooks;
drop policy if exists "own notebook: delete" on public.notebooks;

create policy "own notebook: select" on public.notebooks for select to authenticated using ((select auth.uid()) = user_id);
create policy "own notebook: insert" on public.notebooks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own notebook: update" on public.notebooks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own notebook: delete" on public.notebooks for delete to authenticated using ((select auth.uid()) = user_id);
