#!/usr/bin/env python3
import requests
import json
import os

# Данные для записи в wb_costs
costs_data = [
    {
        "user_id": os.getenv('USER_ID', 'YOUR_USER_ID_HERE'),  # ⚠️ SECURITY: Use environment variable
        "date": "2025-01-27T00:00:00.000Z",
        "sku": "EXAMPLE_SKU_1",  # Example product SKU 
        "purchase_amount": 21,
        "purchase_currency": "CNY",
        "logistics_amount": 0.98,  # 3 USD/kg * (382kg/1171units)
        "logistics_currency": "USD",
        "fx_rate": 13.0
    },
    {
        "user_id": os.getenv('USER_ID', 'YOUR_USER_ID_HERE'),
        "date": "2025-01-27T00:00:00.000Z", 
        "sku": "EXAMPLE_SKU_2",  # Example product SKU
        "purchase_amount": 25,
        "purchase_currency": "CNY",
        "logistics_amount": None,
        "logistics_currency": None,
        "fx_rate": 13.0
    },
    {
        "user_id": os.getenv('USER_ID', 'YOUR_USER_ID_HERE'),
        "date": "2025-01-27T00:00:00.000Z",
        "sku": "EXAMPLE_SKU_3",  # Example product SKU
        "purchase_amount": 26,
        "purchase_currency": "CNY", 
        "logistics_amount": None,
        "logistics_currency": None,
        "fx_rate": 13.0
    }
]

# Прямая запись в Supabase через REST API
# ⚠️ SECURITY: Use environment variables for URLs
SUPABASE_URL = os.getenv('SUPABASE_URL', 'YOUR_SUPABASE_URL_HERE')
url = f"{SUPABASE_URL}/rest/v1/wb_costs"
headers = {
    "apikey": os.getenv('SUPABASE_SERVICE_KEY', ''),  # ⚠️ SECURITY: Use environment variable
    "Authorization": f"Bearer {os.getenv('SUPABASE_SERVICE_KEY', '')}",  # ⚠️ SECURITY: Use environment variable
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

for item in costs_data:
    print(f"Записываю SKU {item['sku']}...")
    response = requests.post(url, headers=headers, json=item)
    print(f"Status: {response.status_code}")
    if response.text:
        print(f"Response: {response.text}")
    print("---")

print("Готово!")
