// Математические функции для расчетов Black-Scholes и оптимизации запасов

// Функция нормального распределения (CDF)
export const normalCDF = (x: number): number => {
  // Аппроксимация Абрамовица-Стегуна
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  
  return 0.5 * (1.0 + sign * y);
};

// Обратная функция нормального распределения
export const inverseNormal = (p: number): number => {
  if (p <= 0 || p >= 1) {
    throw new Error('Probability must be between 0 and 1 (exclusive)');
  }
  const a1 = -39.696830, a2 = 220.946098, a3 = -275.928510, a4 = 138.357751, a5 = -30.664798, a6 = 2.506628;
  const b1 = -54.476098, b2 = 161.585836, b3 = -155.698979, b4 = 66.801311, b5 = -13.280681;
  const c1 = -0.007784894, c2 = -0.322396, c3 = -2.400758, c4 = -2.549732, c5 = 4.374664, c6 = 2.938163;
  const d1 = 0.007784695, d2 = 0.322467, d3 = 2.445134, d4 = 3.754408;
  const plow = 0.02425, phigh = 1 - plow;
  let q, r;
  
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  if (phigh < p) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  q = p - 0.5; 
  r = q * q;
  return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
    (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
};

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