create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_url text,
  data jsonb,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.extractions enable row level security;

drop policy if exists "Users can view own extractions" on public.extractions;
create policy "Users can view own extractions"
  on public.extractions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own extractions" on public.extractions;
create policy "Users can insert own extractions"
  on public.extractions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own extractions" on public.extractions;
create policy "Users can update own extractions"
  on public.extractions for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own extractions" on public.extractions;
create policy "Users can delete own extractions"
  on public.extractions for delete
  using (auth.uid() = user_id);

create index if not exists extractions_user_id_idx on public.extractions (user_id);

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

drop policy if exists "Users can upload own images" on storage.objects;
create policy "Users can upload own images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can view own images" on storage.objects;
create policy "Users can view own images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own images" on storage.objects;
create policy "Users can delete own images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );