create table if not exists public.wb_weekly_stats (
  user_id uuid not null,
  sku text not null,
  horizon_weeks int not null default 26,
  mu_week numeric not null default 0,
  sigma_week numeric not null default 0,
  mu_week_raw numeric not null default 0,
  sigma_week_raw numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, sku, horizon_weeks)
);

create index if not exists wb_weekly_stats_updated_at_idx on public.wb_weekly_stats (updated_at desc);


