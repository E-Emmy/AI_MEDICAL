-- Full scans: a whole CT or MRI series viewed in 3D. The scan itself is one anonymised NIfTI file in
-- Cloudflare R2 (series/<user id>/<uuid>.nii.gz); this table keeps what it is and whose it is.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Already included in schema.sql for new projects.

create table public.series (
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
create index series_user_id_idx on public.series (user_id);
create index series_case_id_idx on public.series (case_id);

alter table public.series enable row level security;
create policy "read own series" on public.series for select using ((select auth.uid()) = user_id);
create policy "add own series" on public.series for insert
  with check (
    (select auth.uid()) = user_id
    and object_key like 'series/' || (select auth.uid())::text || '/%'
    and (case_id is null or exists (select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())))
  );
create policy "change own series" on public.series for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (case_id is null or exists (select 1 from public.cases c where c.id = case_id and c.user_id = (select auth.uid())))
  );
create policy "remove own series" on public.series for delete using ((select auth.uid()) = user_id);
