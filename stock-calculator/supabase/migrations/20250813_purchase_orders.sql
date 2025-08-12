-- Purchase Orders (China) and Logistics Risk Calendar

create table if not exists public.wb_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  po_number text,
  created_at timestamptz not null,
  supplier text,
  country text,
  incoterms text,
  currency text,
  total_cost numeric,
  logistics_cost numeric,
  comment text,
  inserted_at timestamptz not null default now()
);
alter table public.wb_purchase_orders enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_purchase_orders' and policyname='wb_purchase_orders_select_own') then
    create policy wb_purchase_orders_select_own on public.wb_purchase_orders for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_purchase_orders' and policyname='wb_purchase_orders_ins_own') then
    create policy wb_purchase_orders_ins_own on public.wb_purchase_orders for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_purchase_orders' and policyname='wb_purchase_orders_upd_own') then
    create policy wb_purchase_orders_upd_own on public.wb_purchase_orders for update using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.wb_purchase_order_items (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  po_id uuid not null references public.wb_purchase_orders(id) on delete cascade,
  sku text not null,
  qty integer not null default 0,
  unit_cost numeric,
  warehouse_target text,
  inserted_at timestamptz not null default now()
);
alter table public.wb_purchase_order_items enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_purchase_order_items' and policyname='wb_po_items_select_own') then
    create policy wb_po_items_select_own on public.wb_purchase_order_items for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_purchase_order_items' and policyname='wb_po_items_ins_own') then
    create policy wb_po_items_ins_own on public.wb_purchase_order_items for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wb_purchase_order_items' and policyname='wb_po_items_upd_own') then
    create policy wb_po_items_upd_own on public.wb_purchase_order_items for update using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.logistics_calendar (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  country text,
  region text,
  kind text, -- holiday, rain, lockdown, other
  start_date timestamptz not null,
  end_date timestamptz not null,
  delay_days integer not null default 0,
  note text,
  inserted_at timestamptz not null default now()
);
alter table public.logistics_calendar enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='logistics_calendar' and policyname='log_calendar_select_own') then
    create policy log_calendar_select_own on public.logistics_calendar for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='logistics_calendar' and policyname='log_calendar_ins_own') then
    create policy log_calendar_ins_own on public.logistics_calendar for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='logistics_calendar' and policyname='log_calendar_upd_own') then
    create policy log_calendar_upd_own on public.logistics_calendar for update using (auth.uid() = user_id);
  end if;
end $$;


