-- Ensure pg_cron exists
create extension if not exists pg_cron;

-- Runner for all users weekly stats
create or replace function public.run_all_users_weekly_stats(p_horizon_weeks int default 26)
returns void
language plpgsql
as $$
declare r record; begin
  for r in select distinct user_id from public.wb_sales loop
    perform public.refresh_weekly_stats(r.user_id, p_horizon_weeks);
  end loop;
end; $$;

-- Runner for all users portfolio covariance
create or replace function public.run_all_users_portfolio_cov(p_horizon_weeks int default 26)
returns void
language plpgsql
as $$
declare r record; begin
  for r in select distinct user_id from public.wb_sales loop
    perform public.refresh_portfolio_cov(r.user_id, p_horizon_weeks, 'correlation');
  end loop;
end; $$;

-- Schedule daily jobs via pg_cron using simple SELECT calls
select cron.unschedule('wb_weekly_stats_daily') where exists (select 1 from cron.job where jobname='wb_weekly_stats_daily');
select cron.unschedule('wb_portfolio_cov_daily') where exists (select 1 from cron.job where jobname='wb_portfolio_cov_daily');

select cron.schedule(
  'wb_weekly_stats_daily',
  '30 2 * * *',
  $$select public.run_all_users_weekly_stats(26);$$
);

select cron.schedule(
  'wb_portfolio_cov_daily',
  '45 2 * * *',
  $$select public.run_all_users_portfolio_cov(26);$$
);


