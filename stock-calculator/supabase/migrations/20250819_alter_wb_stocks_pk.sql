-- Align primary key with conflict target: include warehouse and ensure NOT NULL
-- 1) Backfill null/empty warehouses
update public.wb_stocks
set warehouse = 'UNKNOWN'
where warehouse is null or trim(warehouse) = '';

-- 2) Make warehouse NOT NULL
alter table public.wb_stocks
  alter column warehouse set not null;

-- 3) Switch primary key to include warehouse
alter table public.wb_stocks
  drop constraint if exists wb_stocks_pkey;

alter table public.wb_stocks
  add primary key (user_id, sku, barcode, warehouse, date);


