// Основные интерфейсы и типы

export interface ChartPoint {
  q: number;
  value: number;
}

export interface VolumeDiscount {
  qty: number;
  discount: number;
}

export interface SeasonalityData {
  enabled: boolean;
  monthlyFactors: number[]; // 12 месяцев, коэффициенты спроса (1.0 = обычный спрос)
  currentMonth: number; // Текущий месяц (0-11)
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  purchase: number;
  margin: number;
  muWeek: number;
  sigmaWeek: number;
  revenue: number;
  optQ: number;
  optValue: number;
  safety: number;
  // Расширенные поля
  shelfLife?: number;
  minOrderQty?: number;
  maxStorageQty?: number;
  volumeDiscounts?: VolumeDiscount[];
  currentStock?: number;
  seasonality?: SeasonalityData;
  // Новые поля для портфельной оптимизации
  currency?: string;
  supplier?: string;
  category?: string;
  volume?: number; // объем единицы товара для складских расчетов
  // Разбивка остатков по складам WB: { "Коледино": 12, "Казань": 5 }
  stockByWarehouse?: Record<string, number>;
  // Цены WB
  retailPrice?: number; // текущая розничная (discounted)
  discountPercent?: number; // текущая скидка, %
  // Краткий анализ продаж
  sales30d?: number; // шт за 30 дней
  revenue30d?: number; // выручка за 30 дней (по розничной цене)
  sales12m?: number; // шт за 12 месяцев
  revenue12m?: number; // выручка за 12 месяцев
  // Поставки / логистика
  procurementCycleWeeks?: number; // средний цикл пополнения (по интервалам поставок)
  reorderPoint?: number; // точка заказа (ROP)
  // Тестовые параметры импорта из Китая
  importCnyPerUnit?: number; // цена закупки в юанях за единицу
  importWeightKgPerBatch?: number; // вес партии в килограммах
  importUnitsPerBatch?: number; // количество единиц в партии
  importUsdPerKg?: number; // логистика $/кг
  // История продаж/закупок/логистики (опционально)
  salesHistory?: SalesRecord[];
  purchaseHistory?: PurchaseRecord[];
  logisticsHistory?: LogisticsRecord[];
}

export interface ProductWithCategory extends Product {
  category: 'A' | 'B' | 'C';
  percent: number;
  accumPercent: number;
}

export interface Scenario {
  name: string;
  muWeekMultiplier: number;
  sigmaWeekMultiplier: number;
  probability: number;
}

export interface SliderWithValueProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  tooltip?: string;
  unit?: string;
}

export interface MonteCarloParams {
  iterations: number;
  showAdvanced: boolean;
  confidenceLevel: number;
  randomSeed: number | null;
  // Метод расчета ожиданий: закрытая форма (по умолчанию) или Монте-Карло
  method?: 'closed' | 'mc' | 'auto';
}

// Исторические записи
export interface SalesRecord {
  date: string; // ISO дата
  sku: string;
  units: number; // штук
  revenue?: number; // выручка в базовой валюте
}

export interface PurchaseRecord {
  date: string; // ISO дата
  sku: string;
  quantity: number;
  unitCost: number; // цена за единицу в исходной валюте
  currency?: 'RUB' | 'USD' | 'EUR' | 'CNY' | string;
  exchangeRateToRUB?: number; // если указано — используем для конвертации
}

export interface LogisticsRecord {
  date: string; // ISO дата
  sku: string;
  cost: number; // стоимость логистики
  currency?: 'RUB' | 'USD' | 'EUR' | 'CNY' | string;
  exchangeRateToRUB?: number;
}

export interface StockRecord {
  date: string; // ISO дата (день)
  sku: string;
  quantity: number; // суммарный остаток (по всем складам) на дату
}

export interface ProductForm {
  name: string;
  sku: string;
  purchase: number;
  margin: number;
  muWeek: number;
  sigmaWeek: number;
  shelfLife: number;
  minOrderQty: number;
  maxStorageQty: number;
  volumeDiscounts: VolumeDiscount[];
  currentStock: number;
  seasonality: SeasonalityData;
  // Новые поля для портфельной оптимизации
  currency?: string;
  supplier?: string;
  category?: string;
  volume?: number;
}

export interface PurchaseOrder {
  id: string;
  po_number?: string;
  created_at: string;
  supplier?: string;
  country?: string;
  incoterms?: string;
  currency?: string;
  total_cost?: number;
  logistics_cost?: number;
  comment?: string;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: number;
  po_id: string;
  sku: string;
  qty: number;
  unit_cost?: number;
  warehouse_target?: string;
}

export interface LogisticsEvent {
  id: number;
  country?: string;
  region?: string;
  kind: string;
  start_date: string;
  end_date: string;
  delay_days: number;
  note?: string;
} 