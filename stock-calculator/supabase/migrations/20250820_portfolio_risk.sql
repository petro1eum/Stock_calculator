-- Create tables for probabilistic states and portfolio covariance
create table if not exists public.prob_states (
  user_id uuid not null,
  horizon_weeks int not null default 26,
  states jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, horizon_weeks)
);

create table if not exists public.portfolio_cov (
  user_id uuid not null,
  horizon_weeks int not null default 26,
  cov_type text not null check (cov_type in ('correlation','covariance')),
  skus jsonb not null,
  matrix jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, horizon_weeks, cov_type)
);

-- Function: refresh portfolio covariance matrix from wb_sales weekly revenue
create or replace function public.refresh_portfolio_cov(p_user_id uuid, p_horizon_weeks int default 26, p_cov_type text default 'correlation')
returns void
language plpgsql
as $$
declare
  v_skus text[];
  v_json_skus jsonb;
  v_matrix jsonb := '[]'::jsonb;
  i int;
  j int;
  v_corr float8;
  v_cov float8;
begin
  -- Collect SKUs with any sales in horizon
  with weekly as (
    select 
      s.sku::text as sku,
      date_trunc('week', (s.raw->>'date')::timestamp)::date as week,
      coalesce((s.raw->>'totalPrice')::numeric, (s.raw->>'forPay')::numeric, 0) as revenue
    from public.wb_sales s
    where s.user_id = p_user_id
      and (s.raw->>'date')::timestamp >= now() - (p_horizon_weeks || ' weeks')::interval
  )
  select array_agg(distinct sku order by sku) into v_skus from weekly;

  if v_skus is null or array_length(v_skus,1) is null then
    -- nothing to compute
    return;
  end if;

  v_json_skus := to_jsonb(v_skus);

  -- Build matrix row by row
  v_matrix := '[]'::jsonb;
  for i in 1..array_length(v_skus,1) loop
    -- build row i
    declare v_row jsonb := '[]'::jsonb; begin
      for j in 1..array_length(v_skus,1) loop
        -- Join weekly revenues by week for pair (i,j)
        with wi as (
          select week, sum(revenue) as r from (
            select w.week, w.revenue from (
              select * from (
                select date_trunc('week', (s.raw->>'date')::timestamp)::date as week,
                       coalesce((s.raw->>'totalPrice')::numeric, (s.raw->>'forPay')::numeric, 0) as revenue
                from public.wb_sales s
                where s.user_id = p_user_id and s.sku::text = v_skus[i]
                  and (s.raw->>'date')::timestamp >= now() - (p_horizon_weeks || ' weeks')::interval
              ) q
            ) w
          ) t group by week
        ),
        wj as (
          select week, sum(revenue) as r from (
            select w.week, w.revenue from (
              select * from (
                select date_trunc('week', (s.raw->>'date')::timestamp)::date as week,
                       coalesce((s.raw->>'totalPrice')::numeric, (s.raw->>'forPay')::numeric, 0) as revenue
                from public.wb_sales s
                where s.user_id = p_user_id and s.sku::text = v_skus[j]
                  and (s.raw->>'date')::timestamp >= now() - (p_horizon_weeks || ' weeks')::interval
              ) q
            ) w
          ) t group by week
        ),
        pair as (
          select coalesce(wi.week, wj.week) as week, wi.r as ri, wj.r as rj
          from wi full join wj on wi.week = wj.week
        )
        select case when p_cov_type = 'correlation'
                    then corr(rj, ri)
                    else covar_pop(rj, ri)
               end into v_corr from pair;

        if p_cov_type = 'correlation' then
          v_row := v_row || to_jsonb(coalesce(v_corr, case when i=j then 1.0 else 0.0 end));
        else
          -- covariance: if null and i=j, set variance, else 0
          if v_corr is null then
            if i=j then
              select var_pop(ri) into v_cov from (select ri from (
                select wi.week, wi.r as ri from wi
              ) z) z2;
              v_row := v_row || to_jsonb(coalesce(v_cov, 0.0));
            else
              v_row := v_row || to_jsonb(0.0);
            end if;
          else
            v_row := v_row || to_jsonb(v_corr);
          end if;
        end if;
      end loop;
      v_matrix := v_matrix || jsonb_build_array(v_row);
    end;
  end loop;

  insert into public.portfolio_cov(user_id, horizon_weeks, cov_type, skus, matrix, updated_at)
  values (p_user_id, p_horizon_weeks, p_cov_type, v_json_skus, v_matrix, now())
  on conflict (user_id, horizon_weeks, cov_type)
  do update set skus = excluded.skus, matrix = excluded.matrix, updated_at = excluded.updated_at;
end;
$$;


