import { 
  normalCDF, 
  inverseNormal, 
  blackScholesCall, 
  monteCarloDemandLoss,
  calculateExpectedRevenue,
  calculateVolatility,
  getEffectivePurchasePrice,
  VolumeDiscount
} from './mathFunctions';

describe('Mathematical Functions Tests', () => {
  
  describe('Normal Distribution CDF', () => {
    it('should return 0.5 for x=0', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 6);
    });
    
    it('should return correct values for standard normal', () => {
      expect(normalCDF(1)).toBeCloseTo(0.8413, 4);
      expect(normalCDF(-1)).toBeCloseTo(0.1587, 4);
      expect(normalCDF(1.96)).toBeCloseTo(0.975, 3);
      expect(normalCDF(-1.96)).toBeCloseTo(0.025, 3);
    });
    
    it('should handle extreme values', () => {
      expect(normalCDF(5)).toBeCloseTo(1, 6);
      expect(normalCDF(-5)).toBeCloseTo(0, 6);
    });
  });
  
  describe('Inverse Normal Distribution', () => {
    it('should return correct z-scores for common probabilities', () => {
      expect(inverseNormal(0.5)).toBeCloseTo(0, 4);
      expect(inverseNormal(0.95)).toBeCloseTo(1.645, 3);
      expect(inverseNormal(0.99)).toBeCloseTo(2.326, 3);
      expect(inverseNormal(0.025)).toBeCloseTo(-1.96, 2);
    });
    
    it('should handle edge cases', () => {
      expect(inverseNormal(0)).toBeNaN();
      expect(inverseNormal(1)).toBeNaN();
      expect(inverseNormal(0.001)).toBeCloseTo(-3.09, 2);
      expect(inverseNormal(0.999)).toBeCloseTo(3.09, 2);
    });
  });
  
  describe('Black-Scholes Option Pricing', () => {
    it('should handle edge case when T=0', () => {
      const S = 100, K = 90, T = 0, sigma = 0.2, r = 0.05;
      expect(blackScholesCall(S, K, T, sigma, r)).toBe(10); // max(0, S-K)
    });
    
    it('should handle case when option is deep in the money', () => {
      const S = 200, K = 100, T = 1, sigma = 0.2, r = 0.05;
      const callValue = blackScholesCall(S, K, T, sigma, r);
      expect(callValue).toBeGreaterThan(95); // Should be close to S-K*exp(-r*T)
      expect(callValue).toBeLessThan(105);
    });
    
    it('should handle case when option is out of the money', () => {
      const S = 50, K = 100, T = 0.25, sigma = 0.2, r = 0.05;
      const callValue = blackScholesCall(S, K, T, sigma, r);
      expect(callValue).toBeGreaterThan(0);
      expect(callValue).toBeLessThan(1); // Should be very small
    });
    
    it('should handle zero volatility', () => {
      const S = 100, K = 90, T = 1, sigma = 0, r = 0.05;
      const callValue = blackScholesCall(S, K, T, sigma, r);
      expect(callValue).toBeCloseTo(10, 0); // Should be max(0, S-K) for zero volatility
    });
  });
  
  describe('Monte Carlo Demand Loss', () => {
    it('should return zero loss when supply exceeds demand significantly', () => {
      const loss = monteCarloDemandLoss(1000, 10, 2, 4, 1000);
      expect(loss).toBeCloseTo(0, 1);
    });
    
    it('should return high loss when supply is much less than demand', () => {
      const muWeek = 100;
      const weeks = 4;
      const expectedDemand = muWeek * weeks;
      const supply = 50;
      const loss = monteCarloDemandLoss(supply, muWeek, 0, weeks, 1000);
      expect(loss).toBeCloseTo(expectedDemand - supply, 0);
    });
    
    it('should increase trials for high volatility', () => {
      // High volatility case
      const startTime = Date.now();
      monteCarloDemandLoss(100, 50, 100, 4); // CV = 2
      const highVolTime = Date.now() - startTime;
      
      // Low volatility case
      const startTime2 = Date.now();
      monteCarloDemandLoss(100, 50, 5, 4); // CV = 0.1
      const lowVolTime = Date.now() - startTime2;
      
      // High volatility should take more time due to more iterations
      expect(highVolTime).toBeGreaterThan(lowVolTime);
    });
  });
  
  describe('Expected Revenue Calculation', () => {
    it('should calculate correct revenue when demand equals supply', () => {
      const revenue = calculateExpectedRevenue(
        100, // q
        25,  // muWeek (100 over 4 weeks)
        0,   // sigmaWeek (no volatility)
        4,   // weeks
        10,  // purchase
        5,   // margin
        0,   // rushProb
        0    // rushSave
      );
      expect(revenue).toBeCloseTo(1500, 0); // 100 * (10 + 5)
    });
    
    it('should not exceed demand revenue when oversupplied', () => {
      const revenue = calculateExpectedRevenue(
        200, // q (double the demand)
        25,  // muWeek
        0,   // sigmaWeek
        4,   // weeks
        10,  // purchase
        5,   // margin
        0,   // rushProb
        0    // rushSave
      );
      expect(revenue).toBeCloseTo(1500, 0); // Still 100 * 15
    });
    
    it('should include rush revenue when enabled', () => {
      const revenue = calculateExpectedRevenue(
        50,  // q (half the demand)
        25,  // muWeek
        0,   // sigmaWeek
        4,   // weeks
        10,  // purchase
        5,   // margin
        1,   // rushProb (always rush)
        3    // rushSave
      );
      // 50 normal + 50 rush, all at full price
      expect(revenue).toBeCloseTo(1500, 0);
    });
  });
  
  describe('Volatility Calculation', () => {
    it('should return minimum volatility for zero demand', () => {
      const vol = calculateVolatility(0, 10, 4, 100);
      expect(vol).toBe(0.1);
    });
    
    it('should approach zero for very low fill rates', () => {
      const vol = calculateVolatility(100, 20, 4, 1); // q=1, demand=400
      expect(vol).toBeLessThan(0.05);
    });
    
    it('should approach CV for high fill rates', () => {
      const muWeek = 100;
      const sigmaWeek = 20;
      const weeks = 4;
      const q = 1000; // Much higher than demand
      const vol = calculateVolatility(muWeek, sigmaWeek, weeks, q);
      const cv = (sigmaWeek * Math.sqrt(weeks)) / (muWeek * weeks);
      expect(vol).toBeCloseTo(cv * (1 - Math.exp(-2)), 2);
    });
    
    it('should reduce with rush probability', () => {
      const volNoRush = calculateVolatility(100, 20, 4, 400, 0);
      const volWithRush = calculateVolatility(100, 20, 4, 400, 0.5);
      expect(volWithRush).toBeLessThan(volNoRush);
      expect(volWithRush).toBeCloseTo(volNoRush * 0.9, 2); // 1 - 0.2 * 0.5
    });
  });
  
  describe('Volume Discount Pricing', () => {
    it('should return base price when no discounts provided', () => {
      const price = getEffectivePurchasePrice(100, 50);
      expect(price).toBe(100);
    });
    
    it('should return base price when quantity below discount threshold', () => {
      const discounts: VolumeDiscount[] = [
        { qty: 100, discount: 10 }
      ];
      const price = getEffectivePurchasePrice(100, 50, discounts);
      expect(price).toBe(100);
    });
    
    it('should apply discount when quantity meets threshold', () => {
      const discounts: VolumeDiscount[] = [
        { qty: 100, discount: 10 }
      ];
      const price = getEffectivePurchasePrice(100, 100, discounts);
      expect(price).toBe(90); // 100 * (1 - 0.1)
    });
    
    it('should apply highest applicable discount with multiple tiers', () => {
      const discounts: VolumeDiscount[] = [
        { qty: 50, discount: 5 },
        { qty: 100, discount: 10 },
        { qty: 200, discount: 15 }
      ];
      const price150 = getEffectivePurchasePrice(100, 150, discounts);
      expect(price150).toBe(90); // 100 qty discount applies
      
      const price250 = getEffectivePurchasePrice(100, 250, discounts);
      expect(price250).toBe(85); // 200 qty discount applies
    });
    
    it('should handle unsorted discount tiers correctly', () => {
      const discounts: VolumeDiscount[] = [
        { qty: 200, discount: 15 },
        { qty: 50, discount: 5 },
        { qty: 100, discount: 10 }
      ];
      const price = getEffectivePurchasePrice(100, 150, discounts);
      expect(price).toBe(90); // Should still find correct 10% discount
    });
  });
});

// Performance tests
describe('Performance Tests', () => {
  it('should complete Monte Carlo simulation in reasonable time', () => {
    const startTime = Date.now();
    const iterations = 10;
    
    for (let i = 0; i < iterations; i++) {
      monteCarloDemandLoss(100, 50, 20, 4);
    }
    
    const totalTime = Date.now() - startTime;
    const avgTime = totalTime / iterations;
    
    // Should complete in less than 100ms on average
    expect(avgTime).toBeLessThan(100);
  });
  
  it('should handle extreme parameters gracefully', () => {
    // Test with very large numbers
    expect(() => {
      calculateExpectedRevenue(10000, 1000, 500, 52, 100, 50, 0.5, 10);
    }).not.toThrow();
    
    // Test with very small numbers
    expect(() => {
      calculateVolatility(0.1, 0.01, 1, 0.1);
    }).not.toThrow();
  });
}); 