-- Global FX rates cache (CBR). One row per currency per date, rate in RUB per 1 unit
create table if not exists public.fx_rates (
  date date not null,
  currency text not null,
  rate numeric not null,
  source text default 'CBR',
  inserted_at timestamptz not null default now(),
  primary key (date, currency)
);

alter table public.fx_rates enable row level security;

-- Allow all authenticated users to read/write cached rates
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fx_rates' and policyname='fx_rates_select') then
    create policy fx_rates_select on public.fx_rates for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fx_rates' and policyname='fx_rates_upsert') then
    create policy fx_rates_upsert on public.fx_rates for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fx_rates' and policyname='fx_rates_update') then
    create policy fx_rates_update on public.fx_rates for update using (true);
  end if;
end $$;


