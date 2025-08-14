-- Wildberries data tables for per-user storage
-- Run this SQL in Supabase (SQL editor) or via CLI (psql) against your project's DB

-- SALES
create table if not exists public.wb_sales (
  user_id uuid not null,
  date timestamptz not null,
  sku text not null,
  units integer not null default 1,
  revenue numeric,
  sale_id text not null,
  warehouse text,
  raw jsonb,
  inserted_at timestamptz not null default now(),
  primary key (user_id, sale_id)
);
create index if not exists wb_sales_user_date_idx on public.wb_sales (user_id, date);
create index if not exists wb_sales_user_sku_idx on public.wb_sales (user_id, sku);
alter table public.wb_sales enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_sales' and policyname='wb_sales_select_own') then
    create policy wb_sales_select_own on public.wb_sales for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_sales' and policyname='wb_sales_insert_own') then
    create policy wb_sales_insert_own on public.wb_sales for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- PURCHASES (INCOMES)
create table if not exists public.wb_purchases (
  user_id uuid not null,
  date timestamptz not null,
  sku text not null,
  quantity integer not null default 0,
  total_price numeric,
  income_id text not null,
  warehouse text,
  raw jsonb,
  inserted_at timestamptz not null default now(),
  primary key (user_id, income_id)
);
create index if not exists wb_purchases_user_date_idx on public.wb_purchases (user_id, date);
create index if not exists wb_purchases_user_sku_idx on public.wb_purchases (user_id, sku);
alter table public.wb_purchases enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_purchases' and policyname='wb_purchases_select_own') then
    create policy wb_purchases_select_own on public.wb_purchases for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_purchases' and policyname='wb_purchases_insert_own') then
    create policy wb_purchases_insert_own on public.wb_purchases for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- STOCKS (current balances)
create table if not exists public.wb_stocks (
  user_id uuid not null,
  date timestamptz not null,
  sku text not null,
  barcode text not null,
  tech_size text,
  quantity integer not null default 0,
  in_way_to_client integer not null default 0,
  in_way_from_client integer not null default 0,
  warehouse text,
  price numeric,
  discount numeric,
  raw jsonb,
  inserted_at timestamptz not null default now(),
  primary key (user_id, sku, barcode, date)
);
-- Дополнительный уникальный индекс для warehouse в составном ключе upsert
create unique index if not exists wb_stocks_user_sku_barcode_wh_date
  on public.wb_stocks (user_id, sku, barcode, warehouse, date);
create index if not exists wb_stocks_user_sku_idx on public.wb_stocks (user_id, sku);
alter table public.wb_stocks enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_stocks' and policyname='wb_stocks_select_own') then
    create policy wb_stocks_select_own on public.wb_stocks for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_stocks' and policyname='wb_stocks_insert_own') then
    create policy wb_stocks_insert_own on public.wb_stocks for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- ORDERS
create table if not exists public.wb_orders (
  user_id uuid not null,
  order_id text not null,
  created_at timestamptz,
  status text,
  nm_id text,
  price numeric,
  currency text,
  address text,
  raw jsonb,
  inserted_at timestamptz not null default now(),
  primary key (user_id, order_id)
);
create index if not exists wb_orders_user_created_idx on public.wb_orders (user_id, created_at);
alter table public.wb_orders enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_orders' and policyname='wb_orders_select_own') then
    create policy wb_orders_select_own on public.wb_orders for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_orders' and policyname='wb_orders_insert_own') then
    create policy wb_orders_insert_own on public.wb_orders for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- (Optional) PRICES
create table if not exists public.wb_prices (
  user_id uuid not null,
  nm_id text not null,
  size_id text not null,
  currency text,
  price numeric,
  discounted_price numeric,
  discount numeric,
  raw jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, nm_id, size_id)
);
alter table public.wb_prices enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_prices' and policyname='wb_prices_select_own') then
    create policy wb_prices_select_own on public.wb_prices for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_prices' and policyname='wb_prices_insert_own') then
    create policy wb_prices_insert_own on public.wb_prices for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- (Optional) ANALYTICS
create table if not exists public.wb_analytics (
  user_id uuid not null,
  nm_id text not null,
  period_begin timestamptz not null,
  period_end timestamptz not null,
  metrics jsonb,
  stocks_wb integer,
  raw jsonb,
  inserted_at timestamptz not null default now(),
  primary key (user_id, nm_id, period_begin, period_end)
);
alter table public.wb_analytics enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_analytics' and policyname='wb_analytics_select_own') then
    create policy wb_analytics_select_own on public.wb_analytics for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_analytics' and policyname='wb_analytics_insert_own') then
    create policy wb_analytics_insert_own on public.wb_analytics for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- (Optional) WAREHOUSES
create table if not exists public.wb_warehouses (
  id bigint primary key,
  name text not null,
  address text,
  is_active boolean,
  is_transit_active boolean,
  raw jsonb,
  updated_at timestamptz not null default now()
);


