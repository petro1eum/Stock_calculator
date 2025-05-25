import { Product, MonteCarloParams } from '../types';
import {
  NormalizedProduct,
  Currency,
  PortfolioConstraints,
  PortfolioAllocation,
  CorrelationRule,
  EfficientFrontierPoint,
  DeliverySchedule
} from '../types/portfolio';
import { inverseNormal, blackScholesCall } from './mathFunctions';
import { getEffectivePurchasePrice } from './inventoryCalculations';

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
    private monteCarloParams: any
  ) {}
  
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
    return Math.sqrt(demandVol**2 + currencyVol**2 + logisticsVol**2);
  }
  
  // Основная функция оптимизации
  optimize(): PortfolioAllocation {
    // 1. Нормализуем все продукты
    const normalizedProducts = this.products.map(p => this.normalizeProduct(p));
    
    // 2. Рассчитываем опционы и Sharpe Ratio
    const productsWithMetrics = normalizedProducts.map(np => {
      const optionValue = this.calculateOptionValue(np);
      const sharpeRatio = (optionValue - np.K) / (np.K * np.sigma);
      
      return {
        ...np,
        optionValue,
        sharpeRatio
      };
    });
    
    // 3. Ранжируем по Sharpe Ratio
    const rankedProducts = productsWithMetrics
      .sort((a, b) => b.sharpeRatio - a.sharpeRatio);
    
    // 4. Жадно заполняем портфель
    const allocation = new Map<number, number>();
    let remainingBudget = this.constraints.totalBudget;
    let remainingSpace = this.constraints.warehouseCapacity;
    
    for (const product of rankedProducts) {
      const originalProduct = product.originalProduct;
      
      // Сколько можем купить?
      const maxByBudget = Math.floor(remainingBudget / product.K);
      const maxBySpace = Math.floor(remainingSpace / (product.volume || 1));
      const maxByConstraints = Math.min(maxByBudget, maxBySpace);
      
      // Учитываем ограничения продукта
      const minQty = originalProduct.minOrderQty || 0;
      const maxQty = originalProduct.maxStorageQty || Infinity;
      
      // Оптимальное количество для этого товара
      const optimalQty = Math.min(
        Math.max(originalProduct.optQ || 0, minQty),
        Math.min(maxQty, maxByConstraints)
      );
      
      if (optimalQty > 0) {
        allocation.set(product.id, optimalQty);
        remainingBudget -= optimalQty * product.K;
        remainingSpace -= optimalQty * (product.volume || 1);
      }
    }
    
    // 5. Применяем корреляционные правила
    const adjustedAllocation = this.applyCorrelationRules(allocation, normalizedProducts);
    
    // 6. Проверяем, не превышаем ли бюджет после корреляционных правил
    const finalAllocation = this.enforceConstraints(adjustedAllocation, normalizedProducts);
    
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
      
      // Пересчитываем опционную стоимость для данного продукта
      const optionValue = this.calculateOptionValue(product);
      expectedReturn += optionValue * qty;
      
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
    // Упрощенный расчет риска через диверсификацию
    const activeProducts = Array.from(allocation.keys()).length;
    const diversificationFactor = 1 / Math.sqrt(activeProducts);
    
    // Средневзвешенная волатильность
    let weightedVolatility = 0;
    let totalWeight = 0;
    
    Array.from(allocation.entries()).forEach(([id, qty]) => {
      const product = products.find(p => p.id === id);
      if (!product) return;
      
      const weight = qty * product.K;
      weightedVolatility += product.sigma * weight;
      totalWeight += weight;
    });
    
    if (totalWeight > 0) {
      weightedVolatility /= totalWeight;
    }
    
    return weightedVolatility * diversificationFactor;
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