-- Enable pg_cron and schedule daily demand refresh inside DB
create extension if not exists pg_cron;

-- Replace user_id below if needed
-- unschedule only if exists (ignore errors)
select cron.unschedule('wb_demand_refresh_daily')
where exists (
  select 1 from cron.job where jobname='wb_demand_refresh_daily'
);

select cron.schedule(
  'wb_demand_refresh_daily',
  '0 2 * * *',
  $$select public.refresh_wb_demand_forecast('YOUR_USER_ID_HERE', 12);$$
);


