-- Per-SKU per-date cost entries with currencies and FX
create table if not exists public.wb_costs (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  date timestamptz not null,
  sku text not null,
  purchase_amount numeric,
  purchase_currency text, -- CNY, USD, RUB, etc.
  logistics_amount numeric,
  logistics_currency text,
  fx_rate numeric, -- to RUB at that day, optional
  note text,
  inserted_at timestamptz not null default now(),
  unique (user_id, date, sku)
);

alter table public.wb_costs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_costs' and policyname='wb_costs_select_own') then
    create policy wb_costs_select_own on public.wb_costs for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_costs' and policyname='wb_costs_insert_own') then
    create policy wb_costs_insert_own on public.wb_costs for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_costs' and policyname='wb_costs_update_own') then
    create policy wb_costs_update_own on public.wb_costs for update using (auth.uid() = user_id);
  end if;
end $$;


