// Типы для портфельной оптимизации

export interface NormalizedProduct {
  id: number;
  name: string;
  sku: string;
  S: number;  // Ожидаемая выручка в базовой валюте
  K: number;  // Затраты в базовой валюте
  T: number;  // Время поставки в неделях
  sigma: number; // Комбинированная волатильность
  volume?: number; // Объем товара для складских ограничений
  supplier?: string; // Поставщик для группировки
  category?: string; // Категория товара
  optionValue?: number; // Ценность опциона
  sharpeRatio?: number; // Коэффициент Шарпа
  originalProduct: Product; // Ссылка на исходный продукт
}

export interface PortfolioConstraints {
  totalBudget: number;
  warehouseCapacity: number;
  maxSuppliers?: number;
  minOrderValue?: number;
  targetServiceLevel?: number;
  // Максимальная доля бюджета на один SKU (0..1)
  maxSkuShare?: number;
  // Минимальное число разных SKU в портфеле
  minDistinctSkus?: number;
}

export interface PortfolioAllocation {
  allocations: Map<number, number>; // productId -> quantity
  totalInvestment: number;
  expectedReturn: number;
  portfolioRisk: number;
  currencyExposure: Map<string, number>;
  supplierConcentration: Map<string, number>;
}

export interface PortfolioMetrics {
  roi: number;
  risk: number;
  sharpeRatio: number;
  diversificationScore: number;
  expectedShortfalls: number;
  valueAtRisk: number;
}

export interface OptimizationResult {
  current: PortfolioAllocation;
  optimal: PortfolioAllocation;
  improvement: {
    roi: number;
    risk: number;
    capital: number;
  };
  recommendations: string[];
}

export interface EfficientFrontierPoint {
  risk: number;
  return: number;
  allocation?: Map<number, number>;
}

export interface CorrelationRule {
  type: 'complement' | 'substitute' | 'seasonal';
  items: string[];
  factor: number;
  condition?: string;
}

export interface DeliverySchedule {
  week: Date;
  orders: Array<{
    productId: number;
    quantity: number;
    supplier: string;
    totalValue: number;
  }>;
}

export interface PortfolioDashboard {
  current: {
    totalInvestment: number;
    expectedReturn: number;
    portfolioRisk: number;
    currencyExposure: Map<string, number>;
  };
  optimal: {
    allocation: Map<number, {
      quantity: number;
      investment: number;
      expectedReturn: number;
      arrivalDate: Date;
    }>;
    improvement: {
      roi: number;
      risk: number;
      capital: number;
    };
  };
  efficientFrontier: {
    points: EfficientFrontierPoint[];
    current: EfficientFrontierPoint;
    optimal: EfficientFrontierPoint;
    conservative: EfficientFrontierPoint;
    aggressive: EfficientFrontierPoint;
  };
  deliveryCalendar: DeliverySchedule[];
}

export interface Currency {
  code: string;
  rate: number;
  volatility: number;
}

export interface ProductGroup {
  name: string;
  products: number[]; // product IDs
  intraCorrelation: number;
  interCorrelation: number;
}

import { Product } from './index'; 