#!/bin/bash

# ⚠️ SECURITY: Use environment variables for secrets
# Set these variables before running:
# export SUPABASE_URL="your-supabase-url"
# export SUPABASE_ANON_KEY="your-anon-key"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required"
    echo "Please set them first:"
    echo "export SUPABASE_URL=\"https://your-project.supabase.co\""
    echo "export SUPABASE_ANON_KEY=\"your-anon-key\""
    exit 1
fi

# Direct insert via curl
curl -X POST "$SUPABASE_URL/rest/v1/wb_costs" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '[
    {
      "user_id": "'${USER_ID:-YOUR_USER_ID_HERE}'",
      "date": "2025-01-27T00:00:00.000Z",
      "sku": "EXAMPLE_SKU_1",
      "purchase_amount": 21,
      "purchase_currency": "CNY",
      "logistics_amount": 0.98,
      "logistics_currency": "USD",
      "fx_rate": 13.0
    }
  ]'

echo "✅ Direct insert completed"
