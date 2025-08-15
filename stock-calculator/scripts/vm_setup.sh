#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo bash vm_setup.sh \
#     --supabase-url https://YOUR.supabase.co \
#     --service-role YOUR_SERVICE_ROLE_KEY \
#     --user-id 00000000-0000-0000-0000-000000000000 \
#     [--horizon-weeks 12] [--root /opt/wb-ml]

SUPABASE_URL=""
SERVICE_ROLE=""
USER_ID=""
HORIZON_WEEKS="12"
ROOT="/opt/wb-ml"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --supabase-url)
      SUPABASE_URL="$2"; shift 2 ;;
    --service-role)
      SERVICE_ROLE="$2"; shift 2 ;;
    --user-id)
      USER_ID="$2"; shift 2 ;;
    --horizon-weeks)
      HORIZON_WEEKS="$2"; shift 2 ;;
    --root)
      ROOT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$SUPABASE_URL" || -z "$SERVICE_ROLE" || -z "$USER_ID" ]]; then
  echo "Missing required args. See usage in header." >&2
  exit 1
fi

echo "[+] Preparing VM at $ROOT"
apt-get update -y
apt-get install -y python3-venv git

mkdir -p "$ROOT"
chown "$SUDO_USER:$SUDO_USER" "$ROOT" || true
cd "$ROOT"

if [[ ! -d venv ]]; then
  echo "[+] Creating venv"
  python3 -m venv venv
fi

echo "[+] Installing Python deps"
"$ROOT/venv/bin/pip" install --upgrade pip >/dev/null
"$ROOT/venv/bin/pip" install supabase >/dev/null

echo "[+] Deploying trainer script"
cat > "$ROOT/train_demand.py" <<'PY'
#!/usr/bin/env python3
import os, json, math, datetime
from collections import defaultdict
from supabase import create_client, Client

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SERVICE_ROLE = os.environ.get('SUPABASE_SERVICE_ROLE')
HORIZON_WEEKS = int(os.environ.get('HORIZON_WEEKS') or 12)
USER_ID = os.environ.get('USER_ID')

def to_week_start(dt: datetime.datetime) -> datetime.date:
    d = dt.date()
    return d - datetime.timedelta(days=(d.weekday()))

def main():
    if not SUPABASE_URL or not SERVICE_ROLE or not USER_ID:
        print(json.dumps({"error":"Missing env SUPABASE_URL/SUPABASE_SERVICE_ROLE/USER_ID"}))
        return
    sb: Client = create_client(SUPABASE_URL, SERVICE_ROLE)

    sales = sb.table('wb_sales').select('sku, raw').eq('user_id', USER_ID).limit(500000).execute().data or []
    per_sku_weeks = defaultdict(lambda: defaultdict(lambda: {'units':0.0,'revenue':0.0}))
    now = datetime.datetime.now(datetime.timezone.utc)
    earliest = now - datetime.timedelta(days=540)

    for r in sales:
        sku = str(r.get('sku') or '')
        raw = r.get('raw') or {}
        ds = raw.get('date') or raw.get('acceptanceDate') or raw.get('saleDt') or raw.get('lastChangeDate')
        if not ds:
            continue
        dt = None
        for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S'):
            try:
                dt = datetime.datetime.strptime(ds[:19], fmt).replace(tzinfo=datetime.timezone.utc)
                break
            except Exception:
                pass
        if dt is None:
            try:
                dt = datetime.datetime.fromisoformat(ds.replace('Z','+00:00'))
            except Exception:
                continue
        if dt < earliest:
            continue
        wk = to_week_start(dt)
        revenue = float(raw.get('totalPrice') or raw.get('forPay') or 0)
        units = float(raw.get('quantity') or 0)
        if units <= 0 and revenue > 0:
            price = float(raw.get('retailPrice') or raw.get('priceWithDisc') or 0) or 1.0
            units = revenue / price
        per_sku_weeks[sku][wk]['units'] += max(0.0, units)
        per_sku_weeks[sku][wk]['revenue'] += max(0.0, revenue)

    forecasts = []
    for sku, week_map in per_sku_weeks.items():
        weeks = sorted(list(week_map.keys()))
        if not weeks:
            continue
        recent = weeks[-26:]
        series = [week_map[w]['units'] for w in recent]
        if not series:
            continue
        ema = 0.0
        alpha = 0.3
        for x in series:
            ema = alpha * x + (1 - alpha) * ema
        mu = ema
        m = sum(series)/len(series)
        var = sum((x - m)*(x - m) for x in series)/max(1, (len(series)-1))
        sigma = math.sqrt(max(0.0, var))

        base = to_week_start(now + datetime.timedelta(days=7))
        for h in range(HORIZON_WEEKS):
            wk = base + datetime.timedelta(days=7*h)
            forecasts.append({
                'user_id': USER_ID,
                'sku': sku,
                'week_start': wk.isoformat(),
                'mu': mu,
                'sigma': sigma,
                'model': 'vm_ema_v1'
            })

    batch = 500
    for i in range(0, len(forecasts), batch):
        chunk = forecasts[i:i+batch]
        sb.table('wb_demand_forecast').upsert(chunk, on_conflict='user_id,sku,week_start').execute()

    print(json.dumps({'ok': True, 'user_id': USER_ID, 'inserted': len(forecasts)}))

if __name__ == '__main__':
    main()
PY

chmod +x "$ROOT/train_demand.py"

echo "[+] Writing env file"
cat > "$ROOT/.env" <<EOF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE=$SERVICE_ROLE
USER_ID=$USER_ID
HORIZON_WEEKS=$HORIZON_WEEKS
EOF

echo "[+] Creating systemd unit and timer"
cat > /etc/systemd/system/wb-ml.service <<EOF
[Unit]
Description=WB ML demand training

[Service]
Type=oneshot
EnvironmentFile=$ROOT/.env
WorkingDirectory=$ROOT
ExecStart=$ROOT/venv/bin/python $ROOT/train_demand.py
EOF

cat > /etc/systemd/system/wb-ml.timer <<'EOF'
[Unit]
Description=Run WB ML daily at 02:00

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now wb-ml.timer

echo "[+] First run (ad-hoc)"
systemctl start wb-ml.service || true

echo "[+] Done. Check logs with: journalctl -u wb-ml.service -e"


