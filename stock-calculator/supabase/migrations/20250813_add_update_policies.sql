-- Add UPDATE policies to allow upsert updates for own rows

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='wb_sales' and policyname='wb_sales_update_own'
  ) then
    create policy wb_sales_update_own on public.wb_sales for update using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='wb_purchases' and policyname='wb_purchases_update_own'
  ) then
    create policy wb_purchases_update_own on public.wb_purchases for update using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='wb_stocks' and policyname='wb_stocks_update_own'
  ) then
    create policy wb_stocks_update_own on public.wb_stocks for update using (auth.uid() = user_id);
  end if;
end $$;


