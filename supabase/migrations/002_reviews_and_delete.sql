-- Clinician reviews of each test result, and deleting your own scans.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Already included in schema.sql for new projects.

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
