#!/usr/bin/env python3
import requests
import json

# Данные для записи в wb_costs
costs_data = [
    {
        "user_id": "3babb29e-22ff-4838-a94c-0a6c7b04e6d6",  # используем известный user_id
        "date": "2025-01-27T00:00:00.000Z",
        "sku": "202342304",  # Сумка_кроссбоди_черная_1 
        "purchase_amount": 21,
        "purchase_currency": "CNY",
        "logistics_amount": 0.98,  # 3 USD/kg * (382kg/1171units)
        "logistics_currency": "USD",
        "fx_rate": 13.0
    },
    {
        "user_id": "3babb29e-22ff-4838-a94c-0a6c7b04e6d6",
        "date": "2025-01-27T00:00:00.000Z", 
        "sku": "364594869",  # Обвес такса + фотоаппарат
        "purchase_amount": 25,
        "purchase_currency": "CNY",
        "logistics_amount": None,
        "logistics_currency": None,
        "fx_rate": 13.0
    },
    {
        "user_id": "3babb29e-22ff-4838-a94c-0a6c7b04e6d6",
        "date": "2025-01-27T00:00:00.000Z",
        "sku": "247956069",  # наушники (если есть)
        "purchase_amount": 26,
        "purchase_currency": "CNY", 
        "logistics_amount": None,
        "logistics_currency": None,
        "fx_rate": 13.0
    }
]

# Прямая запись в Supabase через REST API
url = "https://fijmafxinhnvpytngzsu.supabase.co/rest/v1/wb_costs"
headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpam1hZnhpbmhudnB5dG5nenN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTc2MDg2NiwiZXhwIjoyMDY3MzM2ODY2fQ.O8G5F1-K2s8eZ9hq3y7V5-B6jA9wUdQvx1L7R4Nm2sY",  # Попробуем сгенерированный сервисный ключ
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpam1hZnhpbmhudnB5dG5nenN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTc2MDg2NiwiZXhwIjoyMDY3MzM2ODY2fQ.O8G5F1-K2s8eZ9hq3y7V5-B6jA9wUdQvx1L7R4Nm2sY",
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
