create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  image_path text not null,
  dicom_path text,
  model text not null,
  top_label text,
  top_score double precision,
  predictions jsonb not null default '[]',
  regions jsonb not null default '[]',
  raw jsonb,
  created_at timestamptz not null default now()
);
alter table public.analyses enable row level security;
create policy "read own" on public.analyses for select using (auth.uid() = user_id);
create policy "insert own" on public.analyses for insert with check (auth.uid() = user_id);
create policy "delete own" on public.analyses for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public) values ('scans', 'scans', false);
create policy "read own scans" on storage.objects for select
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "upload own scans" on storage.objects for insert
  with check (bucket_id = 'scans' and (storage.foldername(name))[1] = auth.uid()::text);

-- One review per test result. Deleting the analysis deletes its review.
create table public.reviews (
  analysis_id uuid primary key references public.analyses(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  verdict text not null check (verdict in ('agree', 'disagree', 'unsure')),
  note text check (char_length(note) <= 2000),
  updated_at timestamptz not null default now()
);
create index reviews_user_id_idx on public.reviews (user_id);

alter table public.reviews enable row level security;
-- (select auth.uid()) is evaluated once per query instead of once per row.
create policy "read own reviews" on public.reviews for select
  using ((select auth.uid()) = user_id);
-- You can only review your own analyses.
create policy "add own reviews" on public.reviews for insert
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.analyses a where a.id = analysis_id and a.user_id = (select auth.uid()))
  );
create policy "change own reviews" on public.reviews for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "remove own reviews" on public.reviews for delete
  using ((select auth.uid()) = user_id);

-- Lets "Delete this scan" remove the image files as well as the results.
create policy "delete own scans" on storage.objects for delete
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = (select auth.uid())::text);
