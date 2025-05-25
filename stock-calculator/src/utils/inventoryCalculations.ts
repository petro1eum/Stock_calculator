import { normalCDF } from './mathFunctions';
import { SeasonalityData, VolumeDiscount, MonteCarloParams } from '../types';

// Monte-Carlo ожидание lost-sales при запасе q
export const mcDemandLoss = (
  units: number, 
  muWeek: number, 
  sigmaWeek: number, 
  weeks: number, 
  monteCarloParams: MonteCarloParams
): number => {
  const mean = muWeek * weeks;
  const std = sigmaWeek * Math.sqrt(weeks);
  
  // Используем настраиваемое количество итераций
  const cv = sigmaWeek / Math.max(muWeek, 1);
  const defaultTrials = Math.max(1000, Math.ceil(5000 * cv));
  const actualTrials = monteCarloParams.iterations || defaultTrials;
  
  let lostSum = 0;
  
  // Возможность использовать фиксированный seed
  let rng = Math.random;
  if (monteCarloParams.randomSeed !== null) {
    let seed = monteCarloParams.randomSeed;
    rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }
  
  for (let i = 0; i < actualTrials; i++) {
    const u1 = rng(), u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const demand = Math.round(Math.max(0, mean + std * z));
    lostSum += Math.max(0, demand - units);
  }
  return lostSum / actualTrials;
};

// Расчет эффективной цены закупки с учетом скидок за объем
export const getEffectivePurchasePrice = (
  basePrice: number, 
  quantity: number, 
  volumeDiscounts?: VolumeDiscount[]
): number => {
  if (!volumeDiscounts || volumeDiscounts.length === 0) {
    return basePrice;
  }
  
  const sortedDiscounts = [...volumeDiscounts].sort((a, b) => b.qty - a.qty);
  const applicableDiscount = sortedDiscounts.find(d => quantity >= d.qty);
  
  if (applicableDiscount) {
    return basePrice * (1 - applicableDiscount.discount / 100);
  }
  
  return basePrice;
};

// Расчет ожидаемой выручки
export const calculateExpectedRevenue = (
  q: number, 
  muWeek: number, 
  sigmaWeek: number, 
  weeks: number, 
  purchase: number, 
  margin: number, 
  rushProb: number, 
  rushSave: number,
  mcDemandLossFn: typeof mcDemandLoss,
  monteCarloParams: MonteCarloParams
): number => {
  if (q === 0) return 0;
  
  const expectedDemand = muWeek * weeks;
  const demandStd = sigmaWeek * Math.sqrt(weeks);
  const fullPrice = purchase + margin;
  
  let expectedSales: number;
  
  if (q >= expectedDemand + 3 * demandStd) {
    expectedSales = expectedDemand;
  } else {
    const z = (q - expectedDemand) / demandStd;
    const phi_z = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const Phi_z = normalCDF(z);
    
    expectedSales = q * Phi_z + expectedDemand * (1 - Phi_z) - demandStd * phi_z;
    expectedSales = Math.max(0, Math.min(q, expectedSales));
  }
  
  const lost = mcDemandLossFn(q, muWeek, sigmaWeek, weeks, monteCarloParams);
  const rushSales = lost * rushProb;
  
  return expectedSales * fullPrice + rushSales * fullPrice;
};

// Расчет волатильности для Black-Scholes
export const calculateVolatility = (
  muWeek: number, 
  sigmaWeek: number, 
  weeks: number, 
  q: number
): number => {
  const expectedDemand = muWeek * weeks;
  const demandStd = sigmaWeek * Math.sqrt(weeks);
  
  if (expectedDemand <= 0) return 0.1;
  
  const cvDemand = demandStd / expectedDemand;
  const fillRate = Math.min(1, q / expectedDemand);
  const revenueVolatility = cvDemand * (1 - Math.exp(-2 * fillRate));
  
  return Math.max(0.01, revenueVolatility);
};

// Расчет спроса с учетом сезонности
export const getSeasonalDemand = (
  baseWeeklyDemand: number, 
  seasonality?: SeasonalityData, 
  weeksAhead: number = 0
): number => {
  if (!seasonality || !seasonality.enabled) {
    return baseWeeklyDemand;
  }
  
  const currentMonth = seasonality.currentMonth;
  const monthsAhead = Math.floor(weeksAhead / 4.33);
  const targetMonth = (currentMonth + monthsAhead) % 12;
  const seasonalFactor = seasonality.monthlyFactors[targetMonth];
  
  return baseWeeklyDemand * seasonalFactor;
};

// Расчет среднего спроса за период с учетом сезонности
export const getAverageSeasonalDemand = (
  baseWeeklyDemand: number, 
  seasonality: SeasonalityData | undefined, 
  weeks: number
): number => {
  if (!seasonality || !seasonality.enabled) {
    return baseWeeklyDemand;
  }
  
  let totalDemand = 0;
  const weeksPerMonth = 4.33;
  
  for (let week = 0; week < weeks; week++) {
    const monthOffset = Math.floor(week / weeksPerMonth);
    const month = (seasonality.currentMonth + monthOffset) % 12;
    totalDemand += baseWeeklyDemand * seasonality.monthlyFactors[month];
  }
  
  return totalDemand / weeks;
}; 