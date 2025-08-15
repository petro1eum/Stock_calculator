#!/usr/bin/env python3
import os, json, math, datetime
from collections import defaultdict
from supabase import create_client, Client

# Simple baseline ML: moving averages + seasonal factor; placeholder for CatBoost/XGBoost

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('REACT_APP_SUPABASE_URL')
SERVICE_ROLE = os.environ.get('SUPABASE_SERVICE_ROLE')
HORIZON_WEEKS = int(os.environ.get('HORIZON_WEEKS') or 12)

def to_week_start(dt: datetime.datetime) -> datetime.date:
    d = dt.date()
    return d - datetime.timedelta(days=(d.weekday()))

def main():
    if not SUPABASE_URL or not SERVICE_ROLE:
        print(json.dumps({"error":"Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE"}))
        return
    sb: Client = create_client(SUPABASE_URL, SERVICE_ROLE)

    # Resolve user
    user_id = os.environ.get('USER_ID')
    if not user_id:
        anyRow = sb.table('wb_stocks').select('user_id').limit(1).execute()
        rows = anyRow.data or []
        if rows:
            user_id = rows[0]['user_id']
    if not user_id:
        print(json.dumps({"error":"No user_id"}))
        return

    # Load sales (12-18 months)
    sales = sb.table('wb_sales').select('sku, raw').eq('user_id', user_id).limit(500000).execute().data or []

    # Aggregate weekly units & revenue
    per_sku_weeks = defaultdict(lambda: defaultdict(lambda: {'units':0.0,'revenue':0.0}))
    now = datetime.datetime.utcnow()
    earliest = now - datetime.timedelta(days=540)

    for r in sales:
        sku = str(r.get('sku') or '')
        raw = r.get('raw') or {}
        ds = raw.get('date') or raw.get('acceptanceDate') or raw.get('saleDt') or raw.get('lastChangeDate')
        if not ds:
            continue
        try:
            dt = datetime.datetime.fromisoformat(ds.replace('Z','+00:00'))
        except Exception:
            try:
                dt = datetime.datetime.strptime(ds[:19], '%Y-%m-%dT%H:%M:%S')
            except Exception:
                continue
        if dt < earliest:
            continue
        wk = to_week_start(dt)
        units = float(raw.get('quantity', 0) or raw.get('forPay', 0) and 0)  # WB raw may not have units; fallback later
        revenue = float(raw.get('totalPrice') or raw.get('forPay') or 0)
        if units <= 0 and revenue > 0:
            # approximate units by retailPrice if present
            price = float(raw.get('retailPrice') or raw.get('priceWithDisc') or 0) or 1.0
            units = revenue / price
        per_sku_weeks[sku][wk]['units'] += max(0.0, units)
        per_sku_weeks[sku][wk]['revenue'] += max(0.0, revenue)

    # Train simple baseline: mu = EMA units (last 8 weeks), sigma = std of last 12 weeks
    forecasts = []
    for sku, week_map in per_sku_weeks.items():
        weeks = sorted(list(week_map.keys()))
        if not weeks:
            continue
        # build series recent 26 weeks
        recent = weeks[-26:]
        series = [week_map[w]['units'] for w in recent]
        if not series:
            continue
        # EMA(α=0.3)
        ema = 0.0
        alpha = 0.3
        for x in series:
            ema = alpha * x + (1 - alpha) * ema
        mu = ema
        # sigma
        m = sum(series)/len(series)
        var = sum((x - m)*(x - m) for x in series)/max(1, (len(series)-1))
        sigma = math.sqrt(max(0.0, var))

        # horizon weeks from next Monday
        base = to_week_start(now + datetime.timedelta(days=7))
        for h in range(HORIZON_WEEKS):
            wk = base + datetime.timedelta(days=7*h)
            forecasts.append({
                'user_id': user_id,
                'sku': sku,
                'week_start': wk.isoformat(),
                'mu': mu,
                'sigma': sigma,
                'model': 'baseline_ema_v1'
            })

    # Upsert
    batch = 500
    for i in range(0, len(forecasts), batch):
        chunk = forecasts[i:i+batch]
        sb.table('wb_demand_forecast').upsert(chunk, on_conflict='user_id,sku,week_start').execute()

    print(json.dumps({'ok': True, 'user_id': user_id, 'inserted': len(forecasts)}))

if __name__ == '__main__':
    main()


