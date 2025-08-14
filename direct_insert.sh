#!/bin/bash

# Получаем user_id из wb_stocks
USER_ID=$(curl -s "https://fijmafxinhnvpytngzsu.supabase.co/rest/v1/wb_stocks?select=user_id&limit=1" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpam1hZnhpbmhudnB5dG5nenN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3NjA4NjYsImV4cCI6MjA2NzMzNjg2Nn0.za6-3Y5R7bT_xEZ_xME4au6UOTY5K72U-G6uT12cX5M" | \
  python3 -c "import sys, json; data = json.load(sys.stdin); print(data[0]['user_id'] if data else '')")

if [ -z "$USER_ID" ]; then
    echo "Could not get user_id"
    exit 1
fi

echo "Using user_id: $USER_ID"

# Вставляем тестовые данные
TODAY=$(date -u +"%Y-%m-%dT00:00:00.000Z")

curl -X POST "https://fijmafxinhnvpytngzsu.supabase.co/rest/v1/wb_costs" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpam1hZnhpbmhudnB5dG5nenN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3NjA4NjYsImV4cCI6MjA2NzMzNjg2Nn0.za6-3Y5R7bT_xEZ_xME4au6UOTY5K72U-G6uT12cX5M" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "[
    {\"user_id\":\"$USER_ID\", \"date\":\"$TODAY\", \"sku\":\"202342304\", \"purchase_amount\":21, \"purchase_currency\":\"CNY\", \"logistics_amount\":0.98, \"logistics_currency\":\"USD\", \"fx_rate\":13.0},
    {\"user_id\":\"$USER_ID\", \"date\":\"$TODAY\", \"sku\":\"364594869\", \"purchase_amount\":25, \"purchase_currency\":\"CNY\", \"logistics_amount\":null, \"logistics_currency\":null, \"fx_rate\":13.0},
    {\"user_id\":\"$USER_ID\", \"date\":\"$TODAY\", \"sku\":\"247956069\", \"purchase_amount\":26, \"purchase_currency\":\"CNY\", \"logistics_amount\":null, \"logistics_currency\":null, \"fx_rate\":13.0}
  ]"

echo ""
echo "Test data inserted into wb_costs"
