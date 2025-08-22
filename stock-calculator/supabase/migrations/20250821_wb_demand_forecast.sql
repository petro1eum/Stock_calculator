create table if not exists public.wb_demand_forecast (
  user_id uuid not null,
  sku text not null,
  week_start date not null,
  mu numeric not null,
  sigma numeric not null,
  model text not null default 'baseline_v1',
  updated_at timestamptz not null default now(),
  primary key (user_id, sku, week_start)
);


