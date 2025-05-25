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