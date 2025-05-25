// Исправленная версия функции расчета ожидаемой выручки
// Эта версия корректно учитывает соотношение между запасом и спросом

export const calculateExpectedRevenueFixed = (
  q: number,
  muWeek: number,
  sigmaWeek: number,
  weeks: number,
  purchase: number,
  margin: number,
  rushProb: number,
  rushSave: number,
  mcTrials: number = 5000
): number => {
  const fullPrice = purchase + margin;
  const rushPrice = fullPrice; // Rush-продажи по полной цене
  const rushCost = purchase + rushSave; // Но обходятся дороже
  
  let totalRevenue = 0;
  
  // Monte Carlo симуляция для точного расчета выручки
  for (let i = 0; i < mcTrials; i++) {
    // Генерируем случайный спрос
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const demand = Math.max(0, muWeek * weeks + sigmaWeek * Math.sqrt(weeks) * z);
    
    // Продажи из имеющегося запаса
    const normalSales = Math.min(q, demand);
    
    // Потерянные продажи
    const lostSales = Math.max(0, demand - q);
    
    // Rush-продажи (с вероятностью rushProb)
    const rushSales = Math.random() < rushProb ? lostSales : 0;
    
    // Выручка от обычных продаж
    const normalRevenue = normalSales * fullPrice;
    
    // Выручка от rush-продаж (с учетом дополнительных затрат)
    const rushRevenue = rushSales * rushPrice;
    
    // Общая выручка для этого сценария
    const scenarioRevenue = normalRevenue + rushRevenue;
    
    totalRevenue += scenarioRevenue;
  }
  
  // Возвращаем среднюю выручку
  return totalRevenue / mcTrials;
};

// Улучшенная модель волатильности
export const calculateVolatilityImproved = (
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
  
  // Более точная модель, учитывающая нелинейность
  // При низком fillRate волатильность выручки приближается к 0
  // При высоком fillRate волатильность выручки приближается к волатильности спроса
  const revenueVolatility = cvDemand * (1 - Math.exp(-2 * fillRate));
  
  // Дополнительный фактор для учета rush-поставок
  // Rush-поставки снижают волатильность выручки
  const rushFactor = 1 - 0.2 * rushProb;
  
  return Math.max(0.01, revenueVolatility * rushFactor);
};

// Валидация параметров продукта
export const validateProductParameters = (product: {
  purchase: number;
  margin: number;
  muWeek: number;
  sigmaWeek: number;
}): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Проверка закупочной цены
  if (product.purchase <= 0) {
    errors.push("Закупочная цена должна быть положительной");
  }
  
  // Проверка маржи
  if (product.margin <= 0) {
    errors.push("Маржа должна быть положительной");
  }
  
  // Проверка рентабельности
  const marginRate = product.margin / product.purchase;
  if (marginRate < 0.1) {
    errors.push("Слишком низкая рентабельность (< 10%)");
  }
  
  // Проверка спроса
  if (product.muWeek <= 0) {
    errors.push("Средний спрос должен быть положительным");
  }
  
  // Проверка волатильности
  if (product.sigmaWeek < 0) {
    errors.push("Стандартное отклонение не может быть отрицательным");
  }
  
  const cv = product.sigmaWeek / product.muWeek;
  if (cv > 2) {
    errors.push("Слишком высокая волатильность спроса (CV > 200%)");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Расчет дополнительных метрик для анализа
export const calculateAdditionalMetrics = (
  q: number,
  product: {
    purchase: number;
    margin: number;
    muWeek: number;
    sigmaWeek: number;
  },
  weeks: number,
  hold: number,
  r: number
) => {
  const expectedDemand = product.muWeek * weeks;
  
  // Показатели эффективности
  const turnoverRate = 52 / weeks; // Оборачиваемость в год
  const fillRate = Math.min(1, q / expectedDemand); // Уровень удовлетворения спроса
  const excessInventory = Math.max(0, q - expectedDemand); // Избыточный запас
  
  // Финансовые показатели
  const workingCapital = q * product.purchase; // Оборотный капитал
  const holdingCost = q * hold * weeks; // Затраты на хранение
  const capitalCost = workingCapital * r * weeks / 52; // Стоимость капитала
  const totalCost = workingCapital + holdingCost + capitalCost;
  
  // ROI расчет
  const expectedRevenue = Math.min(q, expectedDemand) * (product.purchase + product.margin);
  const expectedProfit = expectedRevenue - totalCost;
  const roi = expectedProfit / workingCapital;
  
  return {
    turnoverRate,
    fillRate,
    excessInventory,
    workingCapital,
    holdingCost,
    capitalCost,
    totalCost,
    expectedRevenue,
    expectedProfit,
    roi,
    metrics: {
      efficiency: fillRate * turnoverRate, // Комбинированный показатель эффективности
      riskLevel: excessInventory / q, // Уровень риска затоваривания
      profitability: roi * turnoverRate // Годовая рентабельность
    }
  };
}; 