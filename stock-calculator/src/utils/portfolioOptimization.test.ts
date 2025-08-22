import { PortfolioOptimizer } from './portfolioOptimization';

describe('PortfolioOptimizer - strict Black-Scholes integration', () => {
  const baseProducts: any[] = [
    { id: 1, name: 'SKU A', sku: 'A', purchase: 500, margin: 500, muWeek: 50, sigmaWeek: 20, volume: 1 },
    { id: 2, name: 'SKU B', sku: 'B', purchase: 400, margin: 400, muWeek: 40, sigmaWeek: 10, volume: 1 },
    { id: 3, name: 'SKU C', sku: 'C', purchase: 300, margin: 300, muWeek: 20, sigmaWeek: 5,  volume: 1 },
  ];

  const constraints = {
    totalBudget: 1_000_000,
    warehouseCapacity: 100_000,
    maxSuppliers: 10,
    minOrderValue: 0,
    targetServiceLevel: 0.95,
    maxSkuShare: 0.5,
    minDistinctSkus: 2,
  } as any;

  it('allocates across multiple SKUs (no concentration in one)', () => {
    const optimizer = new PortfolioOptimizer(
      baseProducts as any,
      constraints,
      0.1, // rushProb
      50,  // rushSave
      1,   // hold
      0.1, // r
      12,  // weeks
      { iterations: 200, randomSeed: 12345 },
      undefined,
      [{ probability: 0.6, muWeekMultiplier: 1.0, sigmaWeekMultiplier: 1.0 }, { probability: 0.4, muWeekMultiplier: 0.8, sigmaWeekMultiplier: 1.2 }]
    );

    const result = optimizer.optimize();
    const alloc = Array.from(result.allocations.entries());
    // должно быть не менее minDistinctSkus разных SKU
    expect(alloc.length).toBeGreaterThanOrEqual(constraints.minDistinctSkus);
    // доля одного SKU по отношению к бюджету не должна превышать cap
    const invById = alloc.map(([id, qty]) => {
      const p = baseProducts.find(pr => pr.id === id)!;
      return qty * p.purchase;
    });
    const maxBudgetShare = Math.max(...invById.map(v => v / constraints.totalBudget));
    expect(maxBudgetShare).toBeLessThanOrEqual(constraints.maxSkuShare + 1e-6);
  });
});

// Remaining test suite for optimizer core
import { Product } from '../types';
import { PortfolioConstraints } from '../types/portfolio';

describe('PortfolioOptimizer', () => {
  // Тестовые продукты
  const testProducts: Product[] = [
    {
      id: 1,
      name: 'iPhone 15 Case',
      sku: 'SKU001',
      purchase: 7.5,
      margin: 18,
      muWeek: 75,
      sigmaWeek: 25,
      revenue: 0,
      optQ: 100,
      optValue: 1500,
      safety: 50,
      currency: 'USD',
      supplier: 'china',
      category: 'Электроника',
      volume: 0.001
    },
    {
      id: 2,
      name: 'Samsung TV 55"',
      sku: 'SKU002',
      purchase: 12.0,
      margin: 22,
      muWeek: 55,
      sigmaWeek: 18,
      revenue: 0,
      optQ: 80,
      optValue: 2000,
      safety: 40,
      currency: 'EUR',
      supplier: 'europe',
      category: 'Электроника',
      volume: 0.15
    },
    {
      id: 3,
      name: 'Футболка Uniqlo',
      sku: 'SKU003',
      purchase: 4.2,
      margin: 8.5,
      muWeek: 130,
      sigmaWeek: 45,
      revenue: 0,
      optQ: 200,
      optValue: 1200,
      safety: 80,
      currency: 'CNY',
      supplier: 'china',
      category: 'Одежда',
      volume: 0.002,
      seasonality: {
        enabled: true,
        monthlyFactors: [0.5, 0.5, 0.8, 1.2, 1.5, 2.0, 2.0, 1.8, 1.2, 0.8, 0.5, 0.5],
        currentMonth: 6
      }
    }
  ];

  const testConstraints: PortfolioConstraints = {
    totalBudget: 100000,
    warehouseCapacity: 1000,
    maxSuppliers: 3,
    minOrderValue: 1000,
    targetServiceLevel: 0.95
  };

  const defaultParams = {
    rushProb: 0.2,
    rushSave: 3,
    hold: 0.5,
    r: 0.06,
    weeks: 13,
    monteCarloParams: { iterations: 1000 }
  };

  describe('normalizeProduct', () => {
    it('should normalize product to base currency (RUB)', () => {
      const optimizer = new PortfolioOptimizer(
        testProducts,
        testConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const normalized = optimizer.normalizeProduct(testProducts[0]);
      
      expect(normalized.id).toBe(1);
      expect(normalized.name).toBe('iPhone 15 Case');
      expect(normalized.S).toBeGreaterThan(0); // Должна быть конвертирована в рубли
      expect(normalized.K).toBeGreaterThan(testProducts[0].purchase); // Должна быть конвертирована
      expect(normalized.T).toBeCloseTo(0.25); // 13 недель / 52
      expect(normalized.sigma).toBeGreaterThan(0);
      expect(normalized.supplier).toBe('china');
    });

    it('should calculate combined volatility correctly', () => {
      const optimizer = new PortfolioOptimizer(
        testProducts,
        testConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const normalized = optimizer.normalizeProduct(testProducts[0]);
      
      // Волатильность должна учитывать спрос, валюту и логистику
      const demandCV = testProducts[0].sigmaWeek / testProducts[0].muWeek;
      expect(normalized.sigma).toBeGreaterThan(demandCV);
    });
  });

  describe('optimize', () => {
    it('should return valid portfolio allocation', () => {
      const optimizer = new PortfolioOptimizer(
        testProducts,
        testConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const result = optimizer.optimize();
      
      expect(result.allocations).toBeInstanceOf(Map);
      expect(result.totalInvestment).toBeGreaterThan(0);
      expect(result.totalInvestment).toBeLessThanOrEqual(testConstraints.totalBudget);
      expect(result.expectedReturn).toBeGreaterThan(0);
      // Риск может быть 0 для константных рядов — разрешаем неотрицательный
      expect(result.portfolioRisk).toBeGreaterThanOrEqual(0);
      expect(result.portfolioRisk).toBeLessThanOrEqual(1);
    });

    it('should respect budget constraints', () => {
      const tightConstraints = {
        ...testConstraints,
        totalBudget: 10000 // Маленький бюджет
      };

      const optimizer = new PortfolioOptimizer(
        testProducts,
        tightConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const result = optimizer.optimize();
      
      expect(result.totalInvestment).toBeLessThanOrEqual(tightConstraints.totalBudget);
    });

    it('should respect warehouse capacity constraints', () => {
      const smallWarehouse = {
        ...testConstraints,
        warehouseCapacity: 100 // Маленький склад
      };

      const optimizer = new PortfolioOptimizer(
        testProducts,
        smallWarehouse,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const result = optimizer.optimize();
      
      // Проверяем общий объем
      let totalVolume = 0;
      result.allocations.forEach((qty, productId) => {
        const product = testProducts.find(p => p.id === productId);
        if (product) {
          totalVolume += qty * (product.volume || 1);
        }
      });
      
      expect(totalVolume).toBeLessThanOrEqual(smallWarehouse.warehouseCapacity);
    });

    it('should diversify across multiple currencies', () => {
      const optimizer = new PortfolioOptimizer(
        testProducts,
        testConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const result = optimizer.optimize();
      
      expect(result.currencyExposure.size).toBeGreaterThan(1);
      expect(result.currencyExposure.has('USD')).toBe(true);
      expect(result.currencyExposure.has('EUR')).toBe(true);
    });

    it('should track supplier concentration', () => {
      const optimizer = new PortfolioOptimizer(
        testProducts,
        testConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const result = optimizer.optimize();
      
      expect(result.supplierConcentration.size).toBeGreaterThan(0);
      
      // Сумма концентраций должна равняться общим инвестициям
      let totalSupplierInvestment = 0;
      result.supplierConcentration.forEach(value => {
        totalSupplierInvestment += value;
      });
      expect(totalSupplierInvestment).toBeCloseTo(result.totalInvestment, 2);
    });
  });

  describe('buildEfficientFrontier', () => {
    it('should generate efficient frontier points', () => {
      const optimizer = new PortfolioOptimizer(
        testProducts,
        testConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const frontier = optimizer.buildEfficientFrontier(10);
      
      expect(frontier).toHaveLength(11); // 10 шагов + 1
      expect(frontier[0].risk).toBeLessThan(frontier[frontier.length - 1].risk);
      
      // Проверяем, что каждая точка имеет правильную структуру
      frontier.forEach(point => {
        expect(point.risk).toBeGreaterThan(0);
        expect(point.return).toBeDefined();
        expect(point.allocation).toBeInstanceOf(Map);
      });
    });

    it('should have monotonically increasing risk', () => {
      const optimizer = new PortfolioOptimizer(
        testProducts,
        testConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const frontier = optimizer.buildEfficientFrontier(10);
      
      for (let i = 1; i < frontier.length; i++) {
        expect(frontier[i].risk).toBeGreaterThanOrEqual(frontier[i - 1].risk);
      }
    });
  });

  describe('createDeliverySchedule', () => {
    it('should create delivery schedule from allocation', () => {
      const optimizer = new PortfolioOptimizer(
        testProducts,
        testConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const allocation = new Map<number, number>([
        [1, 100],
        [2, 50],
        [3, 200]
      ]);

      const schedule = optimizer.createDeliverySchedule(allocation);
      
      expect(schedule.length).toBeGreaterThan(0);
      
      // Проверяем структуру расписания
      schedule.forEach(delivery => {
        expect(delivery.week).toBeInstanceOf(Date);
        expect(delivery.orders).toBeInstanceOf(Array);
        expect(delivery.orders.length).toBeGreaterThan(0);
        
        delivery.orders.forEach(order => {
          expect(order.productId).toBeDefined();
          expect(order.quantity).toBeGreaterThan(0);
          expect(order.supplier).toBeDefined();
          expect(order.totalValue).toBeGreaterThan(0);
        });
      });
    });

    it('should group orders by arrival week', () => {
      const optimizer = new PortfolioOptimizer(
        testProducts,
        testConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const allocation = new Map<number, number>([
        [1, 100],
        [2, 50]
      ]);

      const schedule = optimizer.createDeliverySchedule(allocation);
      
      // С одинаковым lead-time все должны прибыть в одну неделю
      expect(schedule).toHaveLength(1);
      expect(schedule[0].orders).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty product list', () => {
      const optimizer = new PortfolioOptimizer(
        [],
        testConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const result = optimizer.optimize();
      
      expect(result.allocations.size).toBe(0);
      expect(result.totalInvestment).toBe(0);
      expect(result.expectedReturn).toBe(0);
    });

    it('should handle products with missing optional fields', () => {
      const minimalProduct: Product = {
        id: 99,
        name: 'Test Product',
        sku: 'TEST001',
        purchase: 10,
        margin: 5,
        muWeek: 50,
        sigmaWeek: 10,
        revenue: 0,
        optQ: 50,
        optValue: 500,
        safety: 20
      };

      const optimizer = new PortfolioOptimizer(
        [minimalProduct],
        testConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const result = optimizer.optimize();
      
      expect(result.allocations.has(99)).toBe(true);
      expect(result.currencyExposure.has('RUB')).toBe(true);
      expect(result.supplierConcentration.has('domestic')).toBe(true);
    });

    it('should handle zero budget', () => {
      const zeroConstraints = {
        ...testConstraints,
        totalBudget: 0
      };

      const optimizer = new PortfolioOptimizer(
        testProducts,
        zeroConstraints,
        defaultParams.rushProb,
        defaultParams.rushSave,
        defaultParams.hold,
        defaultParams.r,
        defaultParams.weeks,
        defaultParams.monteCarloParams
      );

      const result = optimizer.optimize();
      
      expect(result.allocations.size).toBe(0);
      expect(result.totalInvestment).toBe(0);
    });
  });
}); 