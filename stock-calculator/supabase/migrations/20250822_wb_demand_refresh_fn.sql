create or replace function public.refresh_wb_demand_forecast(
  p_user_id uuid,
  p_horizon_weeks int default 12
)
returns void
language plpgsql
as $$
declare
  v_next_monday date;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- next Monday week start (00:00)
  v_next_monday := (date_trunc('week', now()) + interval '1 week')::date;

  -- Aggregate weekly units from sales raw
  with sales as (
    select
      s.sku::text as sku,
      coalesce( (s.raw->>'date'), (s.raw->>'acceptanceDate'), (s.raw->>'saleDt'), (s.raw->>'lastChangeDate') ) as ds,
      s.raw
    from public.wb_sales s
    where s.user_id = p_user_id
  ), parsed as (
    select
      sku,
      (case
         when ds ~* '^\\d{4}-\\d{2}-\\d{2}' then (ds)::timestamptz
         else null
       end) as dt,
      raw
    from sales
  ), weeks as (
    select
      sku,
      date_trunc('week', dt)::date as week_start,
      sum(
        greatest(0,
          coalesce((raw->>'quantity')::numeric,
                   case when nullif((raw->>'retailPrice')::numeric,0) is not null
                        then coalesce((raw->>'totalPrice')::numeric,(raw->>'forPay')::numeric,0)
                             / nullif((raw->>'retailPrice')::numeric,0)
                        else 0 end,
                   0)
        )
      ) as units
    from parsed
    where dt is not null
      and dt > now() - interval '540 days'
    group by 1,2
  ), last12 as (
    select sku,
           avg(units)::numeric as mu,
           coalesce(stddev_samp(units),0)::numeric as sigma
    from (
      select sku, units,
             row_number() over (partition by sku order by week_start desc) as rn
      from weeks
    ) t
    where rn <= 12
    group by sku
  ), horizon as (
    select g.sku,
           (v_next_monday + (g.w-1) * interval '1 week')::date as week_start,
           coalesce(l.mu,0) as mu,
           coalesce(l.sigma,0) as sigma
    from (
      select distinct sku from weeks
    ) g_skus(sku)
    cross join generate_series(1, p_horizon_weeks) g(w)
    left join last12 l on l.sku = g_skus.sku
  )
  insert into public.wb_demand_forecast(user_id, sku, week_start, mu, sigma, model, updated_at)
  select p_user_id, h.sku, h.week_start, h.mu, h.sigma, 'supabase_baseline_v1', now()
  from horizon h
  on conflict (user_id, sku, week_start)
  do update set mu = excluded.mu,
                sigma = excluded.sigma,
                model = excluded.model,
                updated_at = now();
end;
$$;


