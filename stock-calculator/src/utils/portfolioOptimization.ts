import { Product } from '../types';
import {
  NormalizedProduct,
  Currency,
  PortfolioConstraints,
  PortfolioAllocation,
  CorrelationRule,
  EfficientFrontierPoint,
  DeliverySchedule
} from '../types/portfolio';
import { blackScholesCall } from './mathFunctions';
import { optimizeQuantity, strictBSMixtureOptionValue } from './inventoryCalculations';

// Валюты и их волатильности (базовые значения)
const CURRENCIES: Map<string, Currency> = new Map([
  ['RUB', { code: 'RUB', rate: 1.0, volatility: 0.15 }],
  ['USD', { code: 'USD', rate: 92.5, volatility: 0.20 }],
  ['EUR', { code: 'EUR', rate: 100.2, volatility: 0.18 }],
  ['CNY', { code: 'CNY', rate: 12.8, volatility: 0.12 }],
]);

// Волатильность логистики по поставщикам
const LOGISTICS_VOLATILITY: Map<string, number> = new Map([
  ['domestic', 0.10],
  ['china', 0.25],
  ['europe', 0.20],
  ['usa', 0.22],
]);

export class PortfolioOptimizer {
  private baseCurrency = 'RUB';
  private baseTimeUnit = 'weeks';

  constructor(
    private products: Product[],
    private constraints: PortfolioConstraints,
    private rushProb: number,
    private rushSave: number,
    private hold: number,
    private r: number,
    private weeks: number,
    private monteCarloParams: any,
    // Опционально: ковариации/корреляции из ProbStates. Формат: productId -> (productId -> rho)
    private probStatesCorrById?: Map<number, Map<number, number>>,
    // Опционально: сценарии для строгого Black‑Scholes
    private bsScenarios?: Array<{ probability: number; muWeekMultiplier: number; sigmaWeekMultiplier: number }>
  ) { }

  // Построение недельных рядов выручки (₽) для каждого товара, для оценки ковариаций
  private buildWeeklyRevenueSeries(lookbackWeeks: number = 26): Map<number, number[]> {
    const series = new Map<number, number[]>();
    const now = new Date();
    const msWeek = 7 * 24 * 60 * 60 * 1000;
    const startMs = now.getTime() - lookbackWeeks * msWeek;
    for (const p of this.products) {
      const buckets: number[] = Array(lookbackWeeks).fill(0);
      const rawSales: any[] = Array.isArray((p as any).salesHistory) ? (p as any).salesHistory : [];
      for (const rec of rawSales) {
        const t = new Date(rec.date).getTime();
        if (isNaN(t) || t < startMs || t > now.getTime()) continue;
        const idx = Math.min(lookbackWeeks - 1, Math.floor((t - startMs) / msWeek));
        const revenueRub = typeof rec.revenue === 'number' && rec.revenue > 0
          ? Number(rec.revenue)
          : (Number(rec.units || 0) * (p.purchase + p.margin));
        buckets[idx] += Math.max(0, revenueRub || 0);
      }
      // Если нет истории — синтетика по μ/σ
      if (rawSales.length === 0) {
        const weeklyMean = Math.max(0, p.muWeek) * (p.purchase + p.margin);
        for (let i = 0; i < lookbackWeeks; i++) buckets[i] = weeklyMean;
      }
      series.set(p.id, buckets);
    }
    return series;
  }

  // Нормализация продукта к единой базе
  normalizeProduct(product: Product): NormalizedProduct {
    const currency = product.currency || 'RUB';
    const exchangeRate = this.getExchangeRate(currency);

    // Конвертируем в рубли
    const S = product.muWeek * (product.purchase + product.margin) * this.weeks * exchangeRate;
    const K = product.purchase * exchangeRate;

    // Приводим время к неделям
    const T = this.weeks / 52;

    // Комбинированная волатильность
    const sigma = this.calculateCombinedVolatility(product);

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      S,
      K,
      T,
      sigma,
      volume: product.volume || 1,
      supplier: product.supplier || 'domestic',
      category: product.category,
      originalProduct: product
    };
  }

  private getExchangeRate(currency: string): number {
    return CURRENCIES.get(currency)?.rate || 1.0;
  }

  private getCurrencyVolatility(currency: string): number {
    return CURRENCIES.get(currency)?.volatility || 0.15;
  }

  private getLogisticsVolatility(supplier: string): number {
    return LOGISTICS_VOLATILITY.get(supplier) || 0.15;
  }

  private calculateCombinedVolatility(product: Product): number {
    const demandVol = product.sigmaWeek / product.muWeek; // CV спроса
    const currencyVol = this.getCurrencyVolatility(product.currency || 'RUB');
    const logisticsVol = this.getLogisticsVolatility(product.supplier || 'domestic');

    // Простое правило: корень из суммы квадратов
    return Math.sqrt(demandVol ** 2 + currencyVol ** 2 + logisticsVol ** 2);
  }

  // Основная функция оптимизации
  optimize(): PortfolioAllocation {
    // 1. Нормализуем все продукты (для стоимости/объема); строгую ценность считаем по смеси сценариев
    const normalizedProducts = this.products.map(p => this.normalizeProduct(p));

    // 2. Для ранжирования используем строгую BS-ценность по смеси сценариев на оптимальном q*;
    //    score = value_best / (bestQ * unitCostApprox)
    const scenarios = (this.bsScenarios && this.bsScenarios.length > 0)
      ? this.bsScenarios
      : [{ probability: 1, muWeekMultiplier: 1, sigmaWeekMultiplier: 1 }];

    const rankedProducts = normalizedProducts
      .map(np => {
        const p = np.originalProduct;
        const unitCostApprox = Math.max(1, p.purchase || np.K);
        const minQty = p.minOrderQty || 0;
        const maxQty = isFinite(p.maxStorageQty || NaN) ? (p.maxStorageQty as number) : Math.floor(this.constraints.totalBudget / unitCostApprox);
        const upperBound = Math.max(0, maxQty);
        if (upperBound <= 0) {
          return { ...np, score: 0, bestQ: 0, bestValue: 0 } as any;
        }
        const evalQ = (q: number) => strictBSMixtureOptionValue(
          q,
          Math.max(0, p.muWeek || 0),
          Math.max(0, p.sigmaWeek || 0),
          this.weeks,
          Math.max(0, p.purchase || 0),
          Math.max(0, p.margin || 0),
          this.rushProb,
          this.rushSave,
          scenarios,
          this.r,
          this.hold,
          p.volumeDiscounts,
          this.monteCarloParams
        );
        const { bestQ, bestValue } = optimizeQuantity(Math.max(0, minQty), Math.max(0, upperBound), Math.max(5, Math.round((p.muWeek || 1) / 5)), evalQ);
        const denom = Math.max(1, bestQ * unitCostApprox);
        const score = bestValue / denom;
        return { ...np, score, bestQ, bestValue } as any;
      })
      .sort((a: any, b: any) => b.score - a.score);

    // 4. Жадно заполняем портфель
    const allocation = new Map<number, number>();
    let remainingBudget = this.constraints.totalBudget;
    let remainingSpace = this.constraints.warehouseCapacity;

    const maxShare = this.constraints.maxSkuShare && this.constraints.maxSkuShare > 0 && this.constraints.maxSkuShare <= 1
      ? this.constraints.maxSkuShare
      : 0.5; // по умолчанию не больше 50% бюджета в один SKU

    const minKinds = Math.max(0, this.constraints.minDistinctSkus || 0);


    for (const product of rankedProducts as any[]) {
      const originalProduct = product.originalProduct;

      // Бюджетные и складские ограничения
      const perSkuBudgetCap = (this.constraints.totalBudget * maxShare);
      const remainingPerSku = perSkuBudgetCap;
      const unitCostApprox = Math.max(1, originalProduct.purchase || product.K);
      const maxByBudget = Math.floor(Math.min(remainingBudget, remainingPerSku) / unitCostApprox);
      const maxBySpace = Math.floor(remainingSpace / (product.volume || 1));
      const maxByConstraints = Math.min(maxByBudget, maxBySpace);

      const minQty = originalProduct.minOrderQty || 0;
      const maxQty = isFinite(originalProduct.maxStorageQty || NaN) ? (originalProduct.maxStorageQty as number) : Infinity;
      const upperBound = Math.max(0, Math.min(maxByConstraints, isFinite(maxQty) ? maxQty : maxByConstraints));
      if (upperBound <= 0) continue;
      // Используем уже рассчитанный bestQ из ранжирования, но ограничиваем текущими бюджетными лимитами
      const estimatedBestQ = Math.max(0, product.bestQ || 0);
      const optimalQty = Math.min(upperBound, Math.max(minQty, estimatedBestQ));

      if (optimalQty > 0) {
        allocation.set(product.id, optimalQty);
        remainingBudget -= optimalQty * unitCostApprox;
        remainingSpace -= optimalQty * (product.volume || 1);
      }
    }

    // 5. Применяем корреляционные правила
    const adjustedAllocation = this.applyCorrelationRules(allocation, normalizedProducts);

    // 6. Проверяем, не превышаем ли бюджет после корреляционных правил
    const finalAllocation = this.enforceConstraints(adjustedAllocation, normalizedProducts);

    // Если выбрали меньше, чем требуется по minDistinctSkus, распределим минимальные объемы
    if (minKinds > 0 && Array.from(finalAllocation.keys()).length < minKinds) {
      for (const np of rankedProducts) {
        if (Array.from(finalAllocation.keys()).includes(np.id)) continue;
        const canBuy = Math.floor((remainingBudget) / np.K);
        if (canBuy <= 0) continue;
        finalAllocation.set(np.id, 1);
        remainingBudget -= np.K;
        if (Array.from(finalAllocation.keys()).length >= minKinds) break;
      }
    }

    // 7. Рассчитываем метрики портфеля
    return this.calculatePortfolioMetrics(finalAllocation, normalizedProducts);
  }

  private calculateOptionValue(product: NormalizedProduct): number {
    const { optionValue } = blackScholesCall(
      product.S,
      product.K,
      product.T,
      product.sigma,
      this.r
    );

    // Если опцион имеет нулевую стоимость, возвращаем хотя бы внутреннюю стоимость
    if (optionValue === 0 && product.S > product.K) {
      return product.S - product.K;
    }

    return optionValue;
  }

  private applyCorrelationRules(
    allocation: Map<number, number>,
    products: NormalizedProduct[]
  ): Map<number, number> {
    const rules: CorrelationRule[] = [
      // Комплементарные товары
      { type: 'complement', items: ['phone', 'case'], factor: 1.2 },
      { type: 'complement', items: ['printer', 'ink'], factor: 1.3 },
      // Субституты
      { type: 'substitute', items: ['brand_a', 'brand_b'], factor: 0.8 },
      // Сезонные группы
      { type: 'seasonal', items: ['summer'], factor: 2.0, condition: 'summer' },
      { type: 'seasonal', items: ['winter'], factor: 2.0, condition: 'winter' }
    ];

    const adjusted = new Map(allocation);

    for (const rule of rules) {
      if (rule.type === 'complement') {
        // Проверяем наличие всех товаров из группы
        const hasAll = rule.items.every(item =>
          Array.from(allocation.keys()).some(id => {
            const product = products.find(p => p.id === id);
            return product?.name.toLowerCase().includes(item);
          })
        );

        if (hasAll) {
          // Увеличиваем количество комплементов
          Array.from(adjusted.entries()).forEach(([id, qty]) => {
            const product = products.find(p => p.id === id);
            if (rule.items.some(item => product?.name.toLowerCase().includes(item))) {
              adjusted.set(id, Math.round(qty * rule.factor));
            }
          });
        }
      }
    }

    return adjusted;
  }

  private enforceConstraints(
    allocation: Map<number, number>,
    products: NormalizedProduct[]
  ): Map<number, number> {
    // Проверяем общие затраты
    let totalCost = 0;
    let totalVolume = 0;

    Array.from(allocation.entries()).forEach(([id, qty]) => {
      const product = products.find(p => p.id === id);
      if (!product) return;

      totalCost += qty * product.K;
      totalVolume += qty * (product.volume || 1);
    });

    // Если превышаем бюджет или объем, пропорционально сокращаем
    if (totalCost > this.constraints.totalBudget || totalVolume > this.constraints.warehouseCapacity) {
      const budgetRatio = this.constraints.totalBudget / totalCost;
      const volumeRatio = this.constraints.warehouseCapacity / totalVolume;
      const scaleFactor = Math.min(budgetRatio, volumeRatio);

      const scaledAllocation = new Map<number, number>();
      Array.from(allocation.entries()).forEach(([id, qty]) => {
        const scaledQty = Math.floor(qty * scaleFactor);
        if (scaledQty > 0) {
          scaledAllocation.set(id, scaledQty);
        }
      });

      return scaledAllocation;
    }

    return allocation;
  }

  private calculatePortfolioMetrics(
    allocation: Map<number, number>,
    products: NormalizedProduct[]
  ): PortfolioAllocation {
    let totalInvestment = 0;
    let expectedReturn = 0;
    const currencyExposure = new Map<string, number>();
    const supplierConcentration = new Map<string, number>();

    Array.from(allocation.entries()).forEach(([id, qty]) => {
      const product = products.find(p => p.id === id);
      if (!product) return;

      const investment = qty * product.K;
      totalInvestment += investment;

      // Строгий BS: ценность для данного товара при количестве qty
      const p = product.originalProduct;
      const scenarios = (this.bsScenarios && this.bsScenarios.length > 0)
        ? this.bsScenarios
        : [{ probability: 1, muWeekMultiplier: 1, sigmaWeekMultiplier: 1 }];
      const value = strictBSMixtureOptionValue(
        qty,
        Math.max(0, p.muWeek || 0),
        Math.max(0, p.sigmaWeek || 0),
        this.weeks,
        Math.max(0, p.purchase || 0),
        Math.max(0, p.margin || 0),
        this.rushProb,
        this.rushSave,
        scenarios,
        this.r,
        this.hold,
        p.volumeDiscounts,
        this.monteCarloParams
      );
      expectedReturn += Math.max(0, value);

      // Валютная экспозиция
      const currency = product.originalProduct.currency || 'RUB';
      currencyExposure.set(
        currency,
        (currencyExposure.get(currency) || 0) + investment
      );

      // Концентрация поставщиков
      const supplier = product.supplier || 'domestic';
      supplierConcentration.set(
        supplier,
        (supplierConcentration.get(supplier) || 0) + investment
      );
    });

    // Расчет риска портфеля (упрощенный)
    const portfolioRisk = this.calculatePortfolioRisk(allocation, products);

    return {
      allocations: allocation,
      totalInvestment,
      expectedReturn,
      portfolioRisk,
      currencyExposure,
      supplierConcentration
    };
  }

  private calculatePortfolioRisk(
    allocation: Map<number, number>,
    products: NormalizedProduct[]
  ): number {
    // Оценим риск портфеля как CV недельной выручки: std(Σ w_i*R_i) / mean(Σ w_i*R_i)
    const lookbackWeeks = 26;
    const seriesByProduct = this.buildWeeklyRevenueSeries(lookbackWeeks);

    // Веса по инвестициям
    let totalInvestment = 0;
    const weightById = new Map<number, number>();
    allocation.forEach((qty, id) => {
      const np = products.find(p => p.id === id);
      if (!np) return;
      const inv = qty * np.K;
      totalInvestment += inv;
      weightById.set(id, inv);
    });
    if (totalInvestment <= 0) return 0;
    Array.from(weightById.keys()).forEach(id => {
      weightById.set(id, (weightById.get(id)! / totalInvestment));
    });

    // Если есть ProbStates корреляции — используем ковариационную формулу для std портфеля
    if (this.probStatesCorrById && this.probStatesCorrById.size > 0) {
      // Соберем μ_i и σ_i для каждого id
      const ids = Array.from(weightById.keys());
      if (ids.length === 0) return 0;
      const meanById = new Map<number, number>();
      const stdById = new Map<number, number>();
      ids.forEach(id => {
        const s = seriesByProduct.get(id) || [];
        const n = s.length || 0;
        const mu = n > 0 ? s.reduce((a, b) => a + b, 0) / n : 0;
        const var_ = n > 1 ? s.reduce((a, b) => a + (b - mu) ** 2, 0) / (n - 1) : 0;
        meanById.set(id, mu);
        stdById.set(id, Math.sqrt(Math.max(0, var_)));
      });
      // Средняя портфельная выручка
      const meanPort = ids.reduce((acc, id) => acc + (weightById.get(id)! * (meanById.get(id) || 0)), 0);
      if (meanPort <= 0) return 0;
      // Дисперсия портфеля по матрице корреляций
      let varPort = 0;
      for (let i = 0; i < ids.length; i++) {
        for (let j = 0; j < ids.length; j++) {
          const idI = ids[i], idJ = ids[j];
          const wi = weightById.get(idI)!;
          const wj = weightById.get(idJ)!;
          const si = stdById.get(idI) || 0;
          const sj = stdById.get(idJ) || 0;
          const rho = this.probStatesCorrById.get(idI)?.get(idJ) ?? (i === j ? 1 : 0);
          varPort += wi * wj * rho * si * sj;
        }
      }
      const stdPort = Math.sqrt(Math.max(0, varPort));
      return stdPort / meanPort;
    }

    // Синтез портфельного ряда (исторический метод)
    const portfolio: number[] = Array(lookbackWeeks).fill(0);
    weightById.forEach((w, id) => {
      const s = seriesByProduct.get(id);
      if (!s) return;
      for (let t = 0; t < lookbackWeeks; t++) {
        portfolio[t] += w * s[t];
      }
    });
    const n = portfolio.length;
    if (n === 0) return 0;
    const mean = portfolio.reduce((a, b) => a + b, 0) / n;
    if (mean <= 0) return 0;
    const variance = n > 1 ? portfolio.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
    const std = Math.sqrt(variance);
    return std / mean;
  }

  // Построение эффективной границы
  buildEfficientFrontier(points: number = 20): EfficientFrontierPoint[] {
    const frontier: EfficientFrontierPoint[] = [];

    // Минимальный и максимальный риск
    const minRisk = 0.1;
    const maxRisk = 0.5;
    const step = (maxRisk - minRisk) / points;

    for (let risk = minRisk; risk <= maxRisk; risk += step) {
      // Для каждого уровня риска находим максимальную доходность
      const allocation = this.optimizeForRisk(risk);

      frontier.push({
        risk,
        return: allocation.expectedReturn / allocation.totalInvestment,
        allocation: allocation.allocations
      });
    }

    return frontier;
  }

  private optimizeForRisk(targetRisk: number): PortfolioAllocation {
    // Упрощенная оптимизация для заданного уровня риска
    // В реальности здесь был бы более сложный алгоритм
    const baseAllocation = this.optimize();

    // Корректируем аллокацию для достижения целевого риска
    const riskRatio = targetRisk / baseAllocation.portfolioRisk;
    const adjusted = new Map<number, number>();

    Array.from(baseAllocation.allocations.entries()).forEach(([id, qty]) => {
      adjusted.set(id, Math.round(qty * riskRatio));
    });

    return this.calculatePortfolioMetrics(
      adjusted,
      this.products.map(p => this.normalizeProduct(p))
    );
  }

  // Создание календаря поставок
  createDeliverySchedule(allocation: Map<number, number>): DeliverySchedule[] {
    const schedule: Map<string, DeliverySchedule> = new Map();

    Array.from(allocation.entries()).forEach(([id, qty]) => {
      const product = this.products.find(p => p.id === id);
      if (!product) return;

      const arrivalDate = new Date();
      arrivalDate.setDate(arrivalDate.getDate() + this.weeks * 7);

      // Округляем до начала недели
      const weekStart = new Date(arrivalDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!schedule.has(weekKey)) {
        schedule.set(weekKey, {
          week: weekStart,
          orders: []
        });
      }

      schedule.get(weekKey)!.orders.push({
        productId: id,
        quantity: qty,
        supplier: product.supplier || 'domestic',
        totalValue: qty * product.purchase * this.getExchangeRate(product.currency || 'RUB')
      });
    });

    return Array.from(schedule.values()).sort((a, b) =>
      a.week.getTime() - b.week.getTime()
    );
  }
} 