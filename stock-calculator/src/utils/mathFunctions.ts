// Математические функции для расчетов Black-Scholes и оптимизации запасов

// Функция нормального распределения (CDF)
import { normalCDF as baseNormalCDF, inverseNormal as baseInverseNormal } from './stats';
export const normalCDF = baseNormalCDF;
export const inverseNormal = (p: number): number => {
  if (p <= 0 || p >= 1) {
    throw new Error('Probability must be between 0 and 1 (exclusive)');
  }
  return baseInverseNormal(p);
};

// Обратная функция нормального распределения
// Прежнее поведение inverseNormal (кидать исключение) оставим здесь при необходимости реэкспорта

// Расчет Black-Scholes для колл-опциона
export const blackScholesCall = (
  S: number, 
  K: number, 
  T: number, 
  sigma: number, 
  r: number
): { optionValue: number } => {
  // Защита от edge cases
  if (T <= 0) return { optionValue: Math.max(0, S - K) };
  if (S <= 1e-6 || K <= 1e-6) return { optionValue: Math.max(0, S - K) };
  if (sigma <= 1e-6) return { optionValue: Math.max(0, S - K) };
  
  // Для случаев глубоко "в деньгах" (S >> K)
  const ratio = S / K;
  if (ratio > 3) {
    return { optionValue: S - K * Math.exp(-r * T) };
  }
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  // Проверка на экстремальные значения
  if (d1 > 10) {
    return { optionValue: S - K * Math.exp(-r * T) };
  }
  if (d1 < -10) {
    return { optionValue: 0 };
  }
  
  return {
    optionValue: S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2),
  };
};

// Форматирование числа
export const formatNumber = (n: number): string => 
  n.toLocaleString(undefined, { maximumFractionDigits: 0 }); 