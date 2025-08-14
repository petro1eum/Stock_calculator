-- Ensure unique index for wb_stocks includes warehouse to avoid collisions between warehouses
do $$ begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='wb_stocks_user_sku_barcode_wh_date'
  ) then
    execute 'create unique index wb_stocks_user_sku_barcode_wh_date on public.wb_stocks (user_id, sku, barcode, warehouse, date)';
  end if;
end $$;


