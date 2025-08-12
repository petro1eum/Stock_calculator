# РЕАЛЬНЫЕ ДАННЫЕ WILDBERRIES API

Результаты тестирования с реальным API ключом от 12.08.2025

## 📊 Общая статистика
- **Продажи**: 2062 записи
- **Остатки**: 268 товаров  
- **Поступления**: 55 записей
- **Заказы**: ❌ Нет доступа (401 Unauthorized - "token scope not allowed")

## 🔑 Доступные эндпоинты

### ✅ Statistics API (работает)
- `https://statistics-api.wildberries.ru/api/v1/supplier/sales`
- `https://statistics-api.wildberries.ru/api/v1/supplier/stocks`  
- `https://statistics-api.wildberries.ru/api/v1/supplier/incomes`

### ❌ Marketplace API (нет доступа)
- `https://marketplace-api.wildberries.ru/api/v3/orders`

## 📈 ПРОДАЖИ - Реальный пример
```json
{
  "date": "2025-07-01T07:16:04",
  "lastChangeDate": "2025-07-01T07:24:46", 
  "warehouseName": "Электросталь",
  "warehouseType": "Склад WB",
  "countryName": "Россия",
  "oblastOkrugName": "Дальневосточный федеральный округ",
  "regionName": "Амурская область",
  "supplierArticle": "Сумка_кроссбоди_черная_1",
  "nmId": 202342304,
  "barcode": "2039346472606",
  "category": "Аксессуары", 
  "subject": "Сумки",
  "brand": "OllyMolly",
  "techSize": "0",
  "incomeID": 29060545,
  "isSupply": false,
  "isRealization": true,
  "totalPrice": 2600,         // Цена в копейках (26 руб)
  "discountPercent": 34,      // Скидка 34%
  "spp": 25,                  // СПП 25%
  "paymentSaleAmount": 39,    // Доплата
  "forPay": 1209.78,         // К доплате продавцу
  "finishedPrice": 1248,     // Финальная цена (12.48 руб)
  "priceWithDisc": 1716,     // Цена со скидкой (17.16 руб)
  "saleID": "S17650915522",
  "sticker": "31916108903",
  "gNumber": "97695901840956773788",
  "srid": "12290775610261262.0.0"
}
```

### Ключевые поля продаж:
- **totalPrice**: Первоначальная цена (в копейках)
- **finishedPrice**: Финальная цена после всех скидок
- **forPay**: Сумма к доплате продавцу
- **discountPercent**: Процент скидки продавца
- **spp**: Скидка постоянного покупателя

## 📦 ОСТАТКИ - Реальный пример
```json
{
  "lastChangeDate": "2025-07-03T00:44:31",
  "warehouseName": "Краснодар", 
  "supplierArticle": "Обвес коричневая сумка + ракетка",
  "nmId": 354915217,
  "barcode": "2043151832463",
  "quantity": 33,              // Доступно для продажи
  "inWayToClient": 0,         // В пути к клиенту
  "inWayFromClient": 0,       // Возвраты
  "quantityFull": 33,         // Общее количество
  "category": "Бижутерия",
  "subject": "Брелоки", 
  "brand": "OllyMolly",
  "techSize": "0",
  "Price": 2600,              // Цена в копейках (26 руб)
  "Discount": 48,             // Скидка 48%
  "isSupply": true,
  "isRealization": false,
  "SCCode": "Tech"
}
```

### Ключевые поля остатков:
- **quantity**: Доступное количество
- **Price**: Цена товара
- **Discount**: Размер скидки

## 💼 ПОСТУПЛЕНИЯ - Реальный пример  
```json
{
  "incomeId": 30506631,
  "number": "",
  "date": "2025-06-30T00:00:00",
  "lastChangeDate": "2025-07-06T08:10:57",
  "supplierArticle": "Сумка_кроссбоди_зерненая_коричневая",
  "techSize": "0", 
  "barcode": "2041144303617",
  "quantity": 90,             // Количество поступившего товара
  "totalPrice": 0,           // Стоимость поступления
  "dateClose": "2025-07-06T00:00:00",
  "warehouseName": "Самара (Новосемейкино)",
  "nmId": 258948361,
  "status": "Принято"
}
```

## 🏷️ Товары бренда OllyMolly
Основные категории:
- Аксессуары → Сумки
- Бижутерия → Брелоки
- Ценовой диапазон: 12-26 рублей за единицу
- Основные склады: Электросталь, Краснодар, Самара

## 🚀 Применение в приложении
Эти данные можно использовать для:
1. **Расчета μ и σ** - на основе исторических продаж
2. **Мониторинга остатков** - текущие quantity на складах
3. **Планирования закупок** - анализ поступлений
4. **Оптимизации inventory** - учет всех данных WB
