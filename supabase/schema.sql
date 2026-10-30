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
