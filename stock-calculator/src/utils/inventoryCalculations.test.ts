import { 
  mcDemandLoss, 
  getEffectivePurchasePrice, 
  calculateExpectedRevenue, 
  calculateVolatility,
  getSeasonalDemand,
  getAverageSeasonalDemand 
} from './inventoryCalculations';
import { MonteCarloParams, VolumeDiscount, SeasonalityData } from '../types';

describe('Inventory Calculations', () => {
  
  const defaultMonteCarloParams: MonteCarloParams = {
    iterations: 100,
    showAdvanced: false,
    confidenceLevel: 0.95,
    randomSeed: null
  };
  
  describe('mcDemandLoss', () => {
    it('should return 0 loss when supply exceeds demand', () => {
      const loss = mcDemandLoss(200, 10, 2, 4, defaultMonteCarloParams);
      expect(loss).toBeLessThan(1); // Almost no loss
    });
    
    it('should return positive loss when demand exceeds supply', () => {
      const loss = mcDemandLoss(10, 50, 5, 4, defaultMonteCarloParams);
      expect(loss).toBeGreaterThan(100); // Significant loss
    });
    
    it('should use fixed seed for reproducible results', () => {
      const paramsWithSeed: MonteCarloParams = {
        ...defaultMonteCarloParams,
        randomSeed: 12345
      };
      
      const loss1 = mcDemandLoss(50, 20, 5, 4, paramsWithSeed);
      const loss2 = mcDemandLoss(50, 20, 5, 4, paramsWithSeed);
      
      expect(loss1).toBe(loss2);
    });
  });
  
  describe('getEffectivePurchasePrice', () => {
    it('should return base price when no discounts', () => {
      const price = getEffectivePurchasePrice(100, 50);
      expect(price).toBe(100);
    });
    
    it('should apply volume discount correctly', () => {
      const discounts: VolumeDiscount[] = [
        { qty: 100, discount: 10 },
        { qty: 200, discount: 15 },
        { qty: 500, discount: 20 }
      ];
      
      expect(getEffectivePurchasePrice(100, 50, discounts)).toBe(100); // No discount
      expect(getEffectivePurchasePrice(100, 150, discounts)).toBe(90); // 10% off
      expect(getEffectivePurchasePrice(100, 250, discounts)).toBe(85); // 15% off
      expect(getEffectivePurchasePrice(100, 600, discounts)).toBe(80); // 20% off
    });
  });
  
  describe('calculateExpectedRevenue', () => {
    it('should return 0 for zero quantity', () => {
      const revenue = calculateExpectedRevenue(
        0, 50, 10, 4, 10, 5, 0.2, 3, mcDemandLoss, defaultMonteCarloParams
      );
      expect(revenue).toBe(0);
    });
    
    it('should calculate revenue correctly without rush', () => {
      const revenue = calculateExpectedRevenue(
        100, 25, 0, 4, 10, 5, 0, 0, mcDemandLoss, defaultMonteCarloParams
      );
      expect(revenue).toBeCloseTo(1500, -1); // 100 * 15
    });
    
    it('should include rush sales when applicable', () => {
      const revenueWithoutRush = calculateExpectedRevenue(
        50, 25, 5, 4, 10, 5, 0, 3, mcDemandLoss, defaultMonteCarloParams
      );
      
      const revenueWithRush = calculateExpectedRevenue(
        50, 25, 5, 4, 10, 5, 1, 3, mcDemandLoss, defaultMonteCarloParams
      );
      
      expect(revenueWithRush).toBeGreaterThan(revenueWithoutRush);
    });
  });
  
  describe('calculateVolatility', () => {
    it('should return minimum volatility for zero demand', () => {
      const vol = calculateVolatility(0, 10, 4, 100);
      expect(vol).toBe(0.1);
    });
    

  });
  
  describe('getSeasonalDemand', () => {
    it('should return base demand when seasonality disabled', () => {
      const seasonality: SeasonalityData = {
        enabled: false,
        monthlyFactors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        currentMonth: 0
      };
      
      const demand = getSeasonalDemand(100, seasonality, 0);
      expect(demand).toBe(100);
    });
    
    it('should apply seasonal factor when enabled', () => {
      const seasonality: SeasonalityData = {
        enabled: true,
        monthlyFactors: [0.5, 1, 1.5, 2, 2, 2, 2, 1.5, 1, 0.5, 0.5, 0.5],
        currentMonth: 0 // January
      };
      
      expect(getSeasonalDemand(100, seasonality, 0)).toBe(50); // Current month
      expect(getSeasonalDemand(100, seasonality, 13)).toBe(200); // April (3 months ahead)
    });
  });
  
  describe('getAverageSeasonalDemand', () => {
    it('should return base demand when seasonality disabled', () => {
      const avg = getAverageSeasonalDemand(100, undefined, 12);
      expect(avg).toBe(100);
    });
    
    it('should calculate average over period', () => {
      const seasonality: SeasonalityData = {
        enabled: true,
        monthlyFactors: [1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1], // Summer peak
        currentMonth: 0
      };
      
      // Average over 52 weeks should be (9*1 + 3*2) / 12 = 1.25
      const avg = getAverageSeasonalDemand(100, seasonality, 52);
      expect(avg).toBeCloseTo(125, 0);
    });
  });
}); 