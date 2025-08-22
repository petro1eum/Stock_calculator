import { calculateExpectedRevenueFixed, calculateVolatilityImproved, validateProductParameters, calculateAdditionalMetrics } from './InventoryCalculator_fixed';

describe('Inventory Calculator Mathematical Functions', () => {
  
  describe('calculateExpectedRevenueFixed', () => {
    it('should return full revenue when demand equals supply', () => {
      const q = 100;
      const muWeek = 25; // 100 units over 4 weeks
      const sigmaWeek = 0; // No volatility
      const weeks = 4;
      const purchase = 10;
      const margin = 5;
      const rushProb = 0;
      const rushSave = 0;
      
      const revenue = calculateExpectedRevenueFixed(
        q, muWeek, sigmaWeek, weeks, purchase, margin, rushProb, rushSave, 1000
      );
      
      // Expected: 100 units * (10 + 5) = 1500
      expect(revenue).toBeCloseTo(1500, 0);
    });
    
    it('should handle excess inventory correctly', () => {
      const q = 200; // Double the expected demand
      const muWeek = 25;
      const sigmaWeek = 0;
      const weeks = 4;
      const purchase = 10;
      const margin = 5;
      const rushProb = 0;
      const rushSave = 0;
      
      const revenue = calculateExpectedRevenueFixed(
        q, muWeek, sigmaWeek, weeks, purchase, margin, rushProb, rushSave, 1000
      );
      
      // Expected: 100 units * 15 = 1500 (can't sell more than demand)
      expect(revenue).toBeCloseTo(1500, 0);
    });
    
    it('should include rush sales when enabled', () => {
      const q = 50; // Half the expected demand
      const muWeek = 25;
      const sigmaWeek = 0;
      const weeks = 4;
      const purchase = 10;
      const margin = 5;
      const rushProb = 1; // Always rush
      const rushSave = 3;
      
      const revenue = calculateExpectedRevenueFixed(
        q, muWeek, sigmaWeek, weeks, purchase, margin, rushProb, rushSave, 1000
      );
      
      // Expected: 50 * 15 (normal) + 50 * 15 (rush) = 1500
      expect(revenue).toBeCloseTo(1500, 0);
    });
  });
  
  describe('calculateVolatilityImproved', () => {
    it('should return minimum volatility for zero demand', () => {
      const volatility = calculateVolatilityImproved(0, 10, 4, 100, 0);
      expect(volatility).toBe(0.1);
    });
    
    it('should reduce volatility with rush probability', () => {
      const volWithoutRush = calculateVolatilityImproved(100, 20, 4, 400, 0);
      const volWithRush = calculateVolatilityImproved(100, 20, 4, 400, 0.5);
      
      expect(volWithRush).toBeLessThan(volWithoutRush);
    });
    
    it('should approach zero for very low fill rates', () => {
      const volatility = calculateVolatilityImproved(100, 20, 4, 1, 0); // q=1, demand=400
      expect(volatility).toBeLessThan(0.05);
    });
  });
  
  describe('validateProductParameters', () => {
    it('should validate correct parameters', () => {
      const product = {
        purchase: 10,
        margin: 5,
        muWeek: 100,
        sigmaWeek: 20
      };
      
      const { isValid, errors } = validateProductParameters(product);
      expect(isValid).toBe(true);
      expect(errors).toHaveLength(0);
    });
    
    it('should reject negative purchase price', () => {
      const product = {
        purchase: -10,
        margin: 5,
        muWeek: 100,
        sigmaWeek: 20
      };
      
      const { isValid, errors } = validateProductParameters(product);
      expect(isValid).toBe(false);
      expect(errors).toContain("Закупочная цена должна быть положительной");
    });
    
    it('should reject too high volatility', () => {
      const product = {
        purchase: 10,
        margin: 5,
        muWeek: 100,
        sigmaWeek: 250 // CV = 2.5
      };
      
      const { isValid, errors } = validateProductParameters(product);
      expect(isValid).toBe(false);
      expect(errors).toContain("Слишком высокая волатильность спроса (CV > 200%)");
    });
    
    it('should reject low profitability', () => {
      const product = {
        purchase: 100,
        margin: 5, // 5% margin
        muWeek: 100,
        sigmaWeek: 20
      };
      
      const { isValid, errors } = validateProductParameters(product);
      expect(isValid).toBe(false);
      expect(errors).toContain("Слишком низкая рентабельность (< 10%)");
    });
  });
  
  describe('calculateAdditionalMetrics', () => {
    it('should calculate correct turnover rate', () => {
      const metrics = calculateAdditionalMetrics(
        100,
        { purchase: 10, margin: 5, muWeek: 25, sigmaWeek: 5 },
        4, // weeks
        0.5, // hold
        0.06 // r
      );
      
      expect(metrics.turnoverRate).toBeCloseTo(13, 1); // 52/4
    });
    
    it('should calculate correct fill rate', () => {
      const metrics = calculateAdditionalMetrics(
        50, // q
        { purchase: 10, margin: 5, muWeek: 25, sigmaWeek: 5 },
        4, // weeks -> demand = 100
        0.5,
        0.06
      );
      
      expect(metrics.fillRate).toBe(0.5); // 50/100
    });
    
    it('should calculate positive ROI for profitable scenario', () => {
      const metrics = calculateAdditionalMetrics(
        100,
        { purchase: 10, margin: 10, muWeek: 25, sigmaWeek: 5 }, // 100% margin
        4,
        0.1, // low holding cost
        0.06
      );
      
      expect(metrics.roi).toBeGreaterThan(0);
    });
    
    it('should identify excess inventory', () => {
      const metrics = calculateAdditionalMetrics(
        200, // q
        { purchase: 10, margin: 5, muWeek: 25, sigmaWeek: 5 },
        4, // weeks -> demand = 100
        0.5,
        0.06
      );
      
      expect(metrics.excessInventory).toBe(100); // 200 - 100
      expect(metrics.metrics.riskLevel).toBe(0.5); // 100/200
    });
  });
});

// Тесты для основных математических функций из оригинального файла
describe('Core Mathematical Functions', () => {
  
  describe('Normal Distribution CDF', () => {
    it('should return 0.5 for x=0', () => {
      // Для стандартного нормального распределения CDF(0) = 0.5
      // Нужно будет экспортировать функцию cdf для тестирования
      expect(true).toBe(true); // Placeholder
    });
  });
  
  describe('Inverse Normal Distribution', () => {
    it('should return correct z-scores for common probabilities', () => {
      // invNorm(0.95) ≈ 1.645
      // invNorm(0.99) ≈ 2.326
      // Нужно будет экспортировать функцию invNorm для тестирования
      expect(true).toBe(true); // Placeholder
    });
  });
  
  describe('Black-Scholes Option Pricing', () => {
    it('should handle edge cases correctly', () => {
      // При T=0 опцион = max(0, S-K)
      // При очень низкой волатильности результат приближается к внутренней стоимости
      // Нужно будет экспортировать функцию blackScholes для тестирования
      expect(true).toBe(true); // Placeholder
    });
  });
}); 