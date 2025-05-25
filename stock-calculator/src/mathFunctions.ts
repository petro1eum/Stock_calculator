// Математические функции, выделенные для тестирования

import { normalCDF as baseNormalCDF, inverseNormal as baseInverseNormal } from './utils/stats';
export const normalCDF = baseNormalCDF;
export const inverseNormal = baseInverseNormal;

// Обратная функция нормального распределения (Hastings, ±4e-4)

// Функция расчета стоимости опциона по модели Black-Scholes
export const blackScholesCall = (S: number, K: number, T: number, sigma: number, r: number): number => {
  // Защита от edge cases
  if (T <= 0) return Math.max(0, S - K);
  if (sigma <= 1e-6) return Math.max(0, S - K);
  
  // Защита от слишком малых значений S
  if (S <= 1e-6) {
    // Опцион глубоко out-of-the-money, но все еще имеет небольшую стоимость
    return 1e-10;
  }
  
  if (K <= 1e-6) return S; // Если страйк = 0, стоимость опциона = S
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  const callValue = S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  
  // Гарантируем неотрицательность
  return Math.max(0, callValue);
};

// Monte Carlo симуляция потерянных продаж
export const monteCarloDemandLoss = (
  units: number, 
  muWeek: number, 
  sigmaWeek: number, 
  weeks: number, 
  trials?: number
): number => {
  const mean = muWeek * weeks;
  const std = sigmaWeek * Math.sqrt(weeks);
  
  // Адаптивное количество итераций
  const cv = sigmaWeek / Math.max(muWeek, 1);
  const adaptiveTrials = trials || Math.max(1000, Math.ceil(5000 * cv));
  
  let lostSum = 0;
  for (let i = 0; i < adaptiveTrials; i++) {
    const u1 = Math.random(), u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const demand = Math.round(Math.max(0, mean + std * z));
    lostSum += Math.max(0, demand - units);
  }
  return lostSum / adaptiveTrials;
};

// Расчет ожидаемой выручки с улучшенной формулой
export const calculateExpectedRevenue = (
  q: number,
  muWeek: number,
  sigmaWeek: number,
  weeks: number,
  purchase: number,
  margin: number,
  rushProb: number,
  rushSave: number
): number => {
  const expectedDemand = muWeek * weeks;
  
  // Для случая без волатильности используем точный расчет
  if (sigmaWeek === 0) {
    const normalSales = Math.min(q, expectedDemand);
    const lostSales = Math.max(0, expectedDemand - q);
    const rushSales = lostSales * rushProb;
    const fullPrice = purchase + margin;
    
    return normalSales * fullPrice + rushSales * fullPrice;
  }
  
  // Для общего случая используем Monte Carlo
  const lost = monteCarloDemandLoss(q, muWeek, sigmaWeek, weeks);
  
  // Правильный расчет продаж
  const normalSales = Math.min(q, expectedDemand) - Math.min(lost, q);
  const rushSales = lost * rushProb;
  const fullPrice = purchase + margin;
  
  return normalSales * fullPrice + rushSales * fullPrice;
};

// Расчет волатильности с улучшенной моделью
export const calculateVolatility = (
  muWeek: number,
  sigmaWeek: number,
  weeks: number,
  q: number,
  rushProb: number = 0
): number => {
  const expectedDemand = muWeek * weeks;
  const demandStd = sigmaWeek * Math.sqrt(weeks);
  
  if (expectedDemand <= 0) return 0.1;
  
  const cvDemand = demandStd / expectedDemand;
  const fillRate = Math.min(1, q / expectedDemand);
  
  // Улучшенная модель с экспоненциальной зависимостью
  const revenueVolatility = cvDemand * (1 - Math.exp(-2 * fillRate));
  
  // Учет rush-поставок
  const rushFactor = 1 - 0.2 * rushProb;
  
  return Math.max(0.01, revenueVolatility * rushFactor);
};

// Интерфейс для скидок за объем
export interface VolumeDiscount {
  qty: number;
  discount: number;
}

// Расчет эффективной цены закупки с учетом скидок за объем
export const getEffectivePurchasePrice = (
  basePrice: number, 
  quantity: number, 
  volumeDiscounts?: VolumeDiscount[]
): number => {
  if (!volumeDiscounts || volumeDiscounts.length === 0) {
    return basePrice;
  }
  
  // Сортируем скидки по количеству и находим применимую
  const sortedDiscounts = [...volumeDiscounts].sort((a, b) => b.qty - a.qty);
  const applicableDiscount = sortedDiscounts.find(d => quantity >= d.qty);
  
  if (applicableDiscount) {
    return basePrice * (1 - applicableDiscount.discount / 100);
  }
  
  return basePrice;
}; 