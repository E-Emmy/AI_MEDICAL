-- Cases (scans grouped under an anonymous patient reference) and read-only share links.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Already included in schema.sql for new projects.

-- A case groups one patient's scans. `label` is the doctor's own reference, never a name.
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index cases_user_id_idx on public.cases (user_id);

alter table public.cases enable row level security;
create policy "read own cases" on public.cases for select using ((select auth.uid()) = user_id);
create policy "add own cases" on public.cases for insert with check ((select auth.uid()) = user_id);
create policy "change own cases" on public.cases for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "remove own cases" on public.cases for delete using ((select auth.uid()) = user_id);

-- Deleting a case keeps its scans; they just stop belonging to a case.
alter table public.analyses add column case_id uuid references public.cases(id) on delete set null;
create index analyses_case_id_idx on public.analyses (case_id);

-- Lets a scan be moved into or out of a case, but only into one of your own cases.
create policy "change own" on public.analyses for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (case_id is null or exists (select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())))
  );

-- A share link shows one scan and its results, read-only, to anyone with the link until it expires.
-- `image_url` is a signed storage link made by the owner when sharing, with the same expiry,
-- so viewers never get access to the storage bucket itself.
create table public.shares (
  token text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  image_path text not null,
  image_url text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index shares_user_id_idx on public.shares (user_id);

alter table public.shares enable row level security;
create policy "read own shares" on public.shares for select using ((select auth.uid()) = user_id);
create policy "add own shares" on public.shares for insert
  with check (
    (select auth.uid()) = user_id
    and image_path like (select auth.uid())::text || '/%'
    and expires_at <= now() + interval '30 days'
  );
create policy "remove own shares" on public.shares for delete using ((select auth.uid()) = user_id);

-- What a share link shows. Runs with the owner's rights but returns only the shared scan's results
-- and reviews, and only while the link is valid. The case label is left out on purpose.
create function public.shared_scan(p_token text)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'image_url', s.image_url,
    'expires_at', s.expires_at,
    'runs', coalesce((
      select json_agg(json_build_object(
        'id', a.id, 'image_path', a.image_path, 'model', a.model, 'created_at', a.created_at,
        'predictions', a.predictions, 'regions', a.regions,
        'raw', a.raw
      ) order by a.created_at)
      from public.analyses a where a.image_path = s.image_path and a.user_id = s.user_id
    ), '[]'::json),
    'reviews', coalesce((
      select json_agg(json_build_object('analysis_id', r.analysis_id, 'verdict', r.verdict, 'note', r.note, 'updated_at', r.updated_at))
      from public.reviews r join public.analyses a on a.id = r.analysis_id
      where a.image_path = s.image_path and a.user_id = s.user_id
    ), '[]'::json)
  )
  from public.shares s
  where s.token = p_token and s.expires_at > now();
$$;
revoke all on function public.shared_scan(text) from public;
grant execute on function public.shared_scan(text) to anon, authenticated;
