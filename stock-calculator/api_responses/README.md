# Wildberries API Documentation

Эта папка содержит документацию по всем используемым эндпоинтам Wildberries API.

## Структура файлов

- `sales.md` - API продаж (статистика)
- `purchases.md` - API поступлений/закупок  
- `stocks.md` - API остатков товаров
- `orders.md` - API управления заказами
- `test_results.md` - Результаты тестирования с реальными данными

## Общая информация

### Аутентификация
```
Authorization: YOUR_JWT_TOKEN
```
**Без префикса Bearer!**

### Базовые домены
- **Статистика**: `https://statistics-api.wildberries.ru`
- **Маркетплейс**: `https://marketplace-api.wildberries.ru`
- **Контент**: `https://content-api.wildberries.ru`
- **Аналитика**: `https://seller-analytics-api.wildberries.ru`

### Лимиты
- **Маркетплейс**: 300 запросов в минуту
- **Статистика**: 1 запрос в минуту для некоторых эндпоинтов

### Формат дат
RFC3339: `2025-08-01T00:00:00` или `2025-08-01T00:00:00Z`
