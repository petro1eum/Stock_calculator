// Отладка расчетов Black-Scholes для понимания двух пиков на графике

// Функция нормального распределения
const normalCDF = (x: number): number => {
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

// Black-Scholes функция
const blackScholes = (S: number, K: number, T: number, sigma: number, r: number): number => {
  if (T <= 0) return Math.max(0, S - K);
  if (S <= 1e-6 || K <= 1e-6) return Math.max(0, S - K);
  if (sigma <= 1e-6) return Math.max(0, S - K);
  
  // Проверка на глубоко "в деньгах" опционы
  const ratio = S / K;
  if (ratio > 3) {
    return S - K * Math.exp(-r * T);
  }
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  // Проверка на экстремальные значения
  if (d1 > 10) {
    return S - K * Math.exp(-r * T);
  }
  if (d1 < -10) {
    return 0;
  }
  
  return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
};

// Тестовые параметры из демо данных
const testParams = {
  purchase: 7.5,
  margin: 18,
  muWeek: 75,
  sigmaWeek: 25,
  weeks: 13,
  rushProb: 0.2,
  rushSave: 3,
  hold: 0.5,
  r: 0.06
};

// Функция расчета выручки с новой логикой
const calculateRevenue = (q: number): number => {
  if (q === 0) return 0;
  
  const expectedDemand = testParams.muWeek * testParams.weeks; // 975
  const demandStd = testParams.sigmaWeek * Math.sqrt(testParams.weeks); // ~90
  const fullPrice = testParams.purchase + testParams.margin; // 25.5
  
  // Упрощенный расчет lost sales
  const lost = Math.max(0, expectedDemand - q) * 0.5; // примерная оценка
  
  let normalSales: number;
  if (q <= expectedDemand) {
    normalSales = q - lost;
  } else {
    // При большом запасе учитываем возможность продать больше среднего
    const probDemandExceedsStock = 1 - normalCDF((q - expectedDemand) / demandStd);
    const extraSales = demandStd * 0.4 * probDemandExceedsStock;
    normalSales = Math.min(q, expectedDemand + extraSales);
  }
  
  const rushSales = lost * testParams.rushProb;
  return normalSales * fullPrice + rushSales * fullPrice;
};

// Функция волатильности
const calculateVolatility = (q: number): number => {
  const expectedDemand = testParams.muWeek * testParams.weeks;
  const demandStd = testParams.sigmaWeek * Math.sqrt(testParams.weeks);
  const cvDemand = demandStd / expectedDemand;
  const fillRate = Math.min(1, q / expectedDemand);
  return Math.max(0.01, cvDemand * (1 - Math.exp(-2 * fillRate)));
};

// Анализ для разных количеств
console.log("Анализ после исправления логики выручки:");
console.log("q\tS (revenue)\tK (costs)\tSigma\tOption Value\tProfit\tS/K");
console.log("=" .repeat(100));

const quantities = [0, 100, 200, 400, 600, 800, 975, 1000, 1100, 1200, 1400, 1600, 1800, 2000, 2500, 3000];

quantities.forEach(q => {
  const S = calculateRevenue(q);
  const K = q * testParams.purchase * (1 + testParams.r * testParams.weeks / 52) + q * testParams.hold * testParams.weeks;
  const T = testParams.weeks / 52;
  const sigma = calculateVolatility(q);
  const optionValue = blackScholes(S, K, T, sigma, testParams.r);
  const simpleProfit = S - K;
  const ratio = K > 0 ? S/K : 0;
  
  console.log(`${q}\t${S.toFixed(0)}\t${K.toFixed(0)}\t${sigma.toFixed(3)}\t${optionValue.toFixed(0)}\t${simpleProfit.toFixed(0)}\t${ratio.toFixed(3)}`);
});

// Проверка точки оптимума
console.log("\nПоиск оптимума:");
let bestQ = 0, bestValue = -Infinity;
for (let q = 900; q <= 1100; q += 10) {
  const S = calculateRevenue(q);
  const K = q * testParams.purchase * (1 + testParams.r * testParams.weeks / 52) + q * testParams.hold * testParams.weeks;
  const T = testParams.weeks / 52;
  const sigma = calculateVolatility(q);
  const optionValue = blackScholes(S, K, T, sigma, testParams.r);
  
  if (optionValue > bestValue) {
    bestValue = optionValue;
    bestQ = q;
  }
}
console.log(`Оптимальное количество: ${bestQ} штук`);
console.log(`Максимальная ценность опциона: $${bestValue.toFixed(2)}`);

export {}; 