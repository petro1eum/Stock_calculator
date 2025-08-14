-- Align primary key with conflict target: include warehouse and ensure NOT NULL
do $$ begin
  -- Fill NULL or empty warehouse values with 'UNKNOWN' to satisfy NOT NULL PK
  perform 1;
  exception when others then null;
end $$;

update public.wb_stocks
set warehouse = 'UNKNOWN'
where warehouse is null or trim(warehouse) = '';

alter table public.wb_stocks
  alter column warehouse set not null;

-- Drop old PK (user_id, sku, barcode, date) and add new PK including warehouse
alter table public.wb_stocks
  drop constraint if exists wb_stocks_pkey;

alter table public.wb_stocks
  add primary key (user_id, sku, barcode, warehouse, date);


