import { normalCDF, inverseNormal, blackScholesCall, formatNumber } from './mathFunctions';

describe('Mathematical Functions', () => {
  
  describe('normalCDF', () => {
    it('should return 0.5 for x=0', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 5);
    });
    
    it('should return close to 0 for very negative values', () => {
      expect(normalCDF(-5)).toBeLessThan(0.001);
    });
    
    it('should return close to 1 for very positive values', () => {
      expect(normalCDF(5)).toBeGreaterThan(0.999);
    });
    

  });
  
  describe('inverseNormal', () => {
    it('should return 0 for p=0.5', () => {
      expect(inverseNormal(0.5)).toBeCloseTo(0, 5);
    });
    
    it('should return correct z-scores for common probabilities', () => {
      expect(inverseNormal(0.95)).toBeCloseTo(1.645, 3);
      expect(inverseNormal(0.99)).toBeCloseTo(2.326, 3);
      expect(inverseNormal(0.975)).toBeCloseTo(1.96, 2);
    });
    
    it('should throw error for invalid probabilities', () => {
      expect(() => inverseNormal(0)).toThrow();
      expect(() => inverseNormal(1)).toThrow();
      expect(() => inverseNormal(-0.1)).toThrow();
      expect(() => inverseNormal(1.1)).toThrow();
    });
  });
  
  describe('blackScholesCall', () => {
    it('should return intrinsic value when T=0', () => {
      const S = 100;
      const K = 90;
      const T = 0.001; // Close to 0
      const sigma = 0.3;
      const r = 0.05;
      
      const { optionValue } = blackScholesCall(S, K, T, sigma, r);
      expect(optionValue).toBeCloseTo(10, 1); // S - K = 10
    });
    
    it('should return 0 for deeply out-of-the-money options', () => {
      const S = 50;
      const K = 100;
      const T = 0.25;
      const sigma = 0.3;
      const r = 0.05;
      
      const { optionValue } = blackScholesCall(S, K, T, sigma, r);
      expect(optionValue).toBeLessThan(0.01);
    });
    
    it('should handle high volatility correctly', () => {
      const S = 100;
      const K = 100;
      const T = 1;
      const sigmaLow = 0.1;
      const sigmaHigh = 0.5;
      const r = 0.05;
      
      const { optionValue: valueLow } = blackScholesCall(S, K, T, sigmaLow, r);
      const { optionValue: valueHigh } = blackScholesCall(S, K, T, sigmaHigh, r);
      
      expect(valueHigh).toBeGreaterThan(valueLow);
    });
  });
  
  describe('formatNumber', () => {
    it('should format numbers correctly', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(1000000)).toBe('1,000,000');
      expect(formatNumber(123.456)).toBe('123');
      expect(formatNumber(0)).toBe('0');
    });
    
    it('should handle negative numbers', () => {
      expect(formatNumber(-1000)).toBe('-1,000');
      expect(formatNumber(-1234567)).toBe('-1,234,567');
    });
  });
}); 