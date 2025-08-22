#!/usr/bin/env python3
import json
import requests
import os

# Загружаем данные
with open('/tmp/wb_stocks_data.json', 'r') as f:
    stocks_data = json.load(f)

# Классифицируем SKU
sku_info = {}
for item in stocks_data:
    sku = item['sku']
    raw = item.get('raw', {})
    if sku not in sku_info:
        subject = (raw.get('subject') or '').lower()
        name = (raw.get('name') or raw.get('vendorCode') or raw.get('supplierArticle') or '').lower()
        search_text = f"{subject} {name}"
        
        # Классификация товаров
        if any(keyword in search_text for keyword in ['сумк', 'кроссбоди', 'bag']):
            product_type = 'bag'
            purchase_amount = 21
            logistics_amount = 0.98  # 3 USD/kg * (382kg/1171units)
            logistics_currency = 'USD'
        elif any(keyword in search_text for keyword in ['наушник', 'headphone']):
            product_type = 'headphones'
            purchase_amount = 26
            logistics_amount = None
            logistics_currency = None
        elif any(keyword in search_text for keyword in ['брелок', 'брелоки', 'keychain', 'обвес']):
            product_type = 'keychain'
            purchase_amount = 25
            logistics_amount = None
            logistics_currency = None
        else:
            # Неопознанный товар - ставим базовую цену
            product_type = 'unknown'
            purchase_amount = 25
            logistics_amount = None
            logistics_currency = None
        
        sku_info[sku] = {
            'type': product_type,
            'purchase_amount': purchase_amount,
            'logistics_amount': logistics_amount,
            'logistics_currency': logistics_currency,
            'subject': subject,
            'name': name
        }

print(f"Классифицировано {len(sku_info)} уникальных SKU:")
for sku, info in sku_info.items():
    print(f"  {sku}: {info['type']} - {info['purchase_amount']} CNY")

# Подготавливаем данные для вставки
# ⚠️ SECURITY: User ID should also be configurable
user_id = os.getenv('USER_ID', "YOUR_USER_ID_HERE")
today = "2025-01-27T00:00:00.000Z"
costs_data = []

for sku, info in sku_info.items():
    costs_data.append({
        "user_id": user_id,
        "date": today,
        "sku": sku,
        "purchase_amount": info['purchase_amount'],
        "purchase_currency": "CNY",
        "logistics_amount": info['logistics_amount'],
        "logistics_currency": info['logistics_currency'],
        "fx_rate": 13.0
    })

# Вставляем данные в wb_costs
# ⚠️ SECURITY: Use environment variables for URLs too
SUPABASE_URL = os.getenv('SUPABASE_URL', 'YOUR_SUPABASE_URL_HERE')
url = f"{SUPABASE_URL}/rest/v1/wb_costs"

# ⚠️ SECURITY: Use environment variables for secrets
SUPABASE_SECRET_KEY = os.getenv('SUPABASE_SECRET_KEY')
if not SUPABASE_SECRET_KEY:
    raise ValueError("SUPABASE_SECRET_KEY environment variable is required")

headers = {
    "apikey": SUPABASE_SECRET_KEY,
    "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

print(f"\nЗаписываю {len(costs_data)} записей в wb_costs (upsert)...")
# Используем PATCH для upsert с onConflict
headers["Prefer"] = "resolution=merge-duplicates"
response = requests.post(f"{url}?on_conflict=user_id,date,sku", headers=headers, json=costs_data)
print(f"Status: {response.status_code}")
if response.text:
    print(f"Response: {response.text}")

if response.status_code in [200, 201]:
    print(f"\n✅ Успешно заполнено {len(costs_data)} товаров!")
else:
    print(f"\n❌ Ошибка при записи данных")
