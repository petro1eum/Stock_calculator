-- Add per-user secrets table to store Wildberries API key
create table if not exists public.user_secrets (
  user_id uuid primary key,
  wb_api_key text,
  updated_at timestamptz not null default now()
);

alter table public.user_secrets enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname='public' and tablename='user_secrets' and policyname='user_secrets_select_own'
  ) then
    create policy user_secrets_select_own on public.user_secrets for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname='public' and tablename='user_secrets' and policyname='user_secrets_insert_own'
  ) then
    create policy user_secrets_insert_own on public.user_secrets for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname='public' and tablename='user_secrets' and policyname='user_secrets_update_own'
  ) then
    create policy user_secrets_update_own on public.user_secrets for update using (auth.uid() = user_id);
  end if;
end $$;


