-- For a Supabase project that already has the analyses and reviews tables (the teammate's project).
-- Adds only what is missing: cases, share links, full scans (series), the scans bucket if absent,
-- and the three demo accounts. Safe to run more than once; it doesn't change existing rows.

insert into storage.buckets (id, name, public) values ('scans', 'scans', false) on conflict (id) do nothing;

-- A case groups one patient's scans. `label` is the doctor's own reference, never a name.
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists cases_user_id_idx on public.cases (user_id);

alter table public.cases enable row level security;
drop policy if exists "read own cases" on public.cases;
create policy "read own cases" on public.cases for select using ((select auth.uid()) = user_id);
drop policy if exists "add own cases" on public.cases;
create policy "add own cases" on public.cases for insert with check ((select auth.uid()) = user_id);
drop policy if exists "change own cases" on public.cases;
create policy "change own cases" on public.cases for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "remove own cases" on public.cases;
create policy "remove own cases" on public.cases for delete using ((select auth.uid()) = user_id);

-- Deleting a case keeps its scans; they just stop belonging to a case.
alter table public.analyses add column if not exists case_id uuid references public.cases(id) on delete set null;
create index if not exists analyses_case_id_idx on public.analyses (case_id);

-- Lets a scan be moved into or out of a case, but only into one of your own cases.
drop policy if exists "change own" on public.analyses;
create policy "change own" on public.analyses for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (case_id is null or exists (select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())))
  );

-- A share link shows one scan and its results, read-only, to anyone with the link until it expires.
-- `image_url` is a signed storage link made by the owner when sharing, with the same expiry,
-- so viewers never get access to the storage bucket itself.
create table if not exists public.shares (
  token text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  image_path text not null,
  image_url text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists shares_user_id_idx on public.shares (user_id);

alter table public.shares enable row level security;
drop policy if exists "read own shares" on public.shares;
create policy "read own shares" on public.shares for select using ((select auth.uid()) = user_id);
drop policy if exists "add own shares" on public.shares;
create policy "add own shares" on public.shares for insert
  with check (
    (select auth.uid()) = user_id
    and image_path like (select auth.uid())::text || '/%'
    and expires_at <= now() + interval '30 days'
  );
drop policy if exists "remove own shares" on public.shares;
create policy "remove own shares" on public.shares for delete using ((select auth.uid()) = user_id);

-- What a share link shows. Runs with the owner's rights but returns only the shared scan's results
-- and reviews, and only while the link is valid. The case label is left out on purpose.
create or replace function public.shared_scan(p_token text)
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

-- Full scans (CT/MRI series viewed in 3D). The scan file lives in Cloudflare R2; see migrations/004_series.sql.
create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  kind text not null check (kind in ('brain-mri', 'chest-ct', 'other-ct', 'other-mri')),
  label text check (char_length(label) <= 80),
  object_key text not null unique,
  -- Size, spacing, modality and similar. Never patient details.
  facts jsonb not null default '{}'::jsonb,
  -- Filled in once the series has been analysed slice by slice.
  results jsonb,
  created_at timestamptz not null default now()
);
create index if not exists series_user_id_idx on public.series (user_id);
create index if not exists series_case_id_idx on public.series (case_id);

alter table public.series enable row level security;
drop policy if exists "read own series" on public.series;
create policy "read own series" on public.series for select using ((select auth.uid()) = user_id);
drop policy if exists "add own series" on public.series;
create policy "add own series" on public.series for insert
  with check (
    (select auth.uid()) = user_id
    and object_key like 'series/' || (select auth.uid())::text || '/%'
    and (case_id is null or exists (select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())))
  );
drop policy if exists "change own series" on public.series;
create policy "change own series" on public.series for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (case_id is null or exists (select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())))
  );
drop policy if exists "remove own series" on public.series;
create policy "remove own series" on public.series for delete using ((select auth.uid()) = user_id);

-- Creates the three demo accounts used by the sign-in box (components/SignInGate.tsx), already
-- confirmed, each with its role. Run it once in the Supabase SQL editor; running it again does nothing.
--   doctor@orbinova-demo.com, radiologist@orbinova-demo.com, student@orbinova-demo.com
--   password: OrbinovaDemo2026
do $$
declare
  r text;
  uid uuid;
  mail text;
begin
  foreach r in array array['doctor', 'radiologist', 'student'] loop
    mail := r || '@orbinova-demo.com';
    if exists (select 1 from auth.users where email = mail) then
      continue;
    end if;
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
      extensions.crypt('OrbinovaDemo2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('role', r), now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;
end $$;
