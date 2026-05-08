import { 
  mcDemandLoss, 
  getEffectivePurchasePrice, 
  calculateInventoryStrike,
  annualizeLognormalVolatilityFromMoments,
  calibrateRevenueVolatilityFromSales,
  calculateExpectedRevenue, 
  calculateVolatility,
  computeWeeklyStatsForSeries,
  computeWeeklyStatsAdjustedForStockouts,
  getSeasonalDemand,
  getAverageSeasonalDemand,
  aggregateLatestStockSnapshots,
  updateProductsFromSales
} from './inventoryCalculations';
import { MonteCarloParams, VolumeDiscount, SeasonalityData, SalesRecord, StockRecord } from '../types';

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

  describe('calculateInventoryStrike', () => {
    it('should include purchase and holding costs without pre-accruing interest', () => {
      const strike = calculateInventoryStrike(10, 100, 2, 4);
      expect(strike).toBe(1080);
    });
  });

  describe('volatility calibration checks', () => {
    const endDate = new Date('2026-01-29T00:00:00.000Z');
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    const weeklySales = (revenues: number[]): SalesRecord[] => {
      const startMs = endDate.getTime() - revenues.length * weekMs;
      return revenues.map((revenue, index) => ({
        date: new Date(startMs + (index + 0.5) * weekMs).toISOString(),
        sku: 'SKU-1',
        units: revenue / 100,
        revenue
      }));
    };

    it('should annualize horizon volatility before using it in Black-Scholes', () => {
      const annualized = annualizeLognormalVolatilityFromMoments(100, 20, 0.25);
      expect(annualized).toBeCloseTo(0.3960844, 7);
    });

    it('should estimate higher revenue volatility for unstable weekly sales', () => {
      const stable = calibrateRevenueVolatilityFromSales(
        weeklySales([1000, 1000, 1000, 1000, 1000, 1000]),
        endDate,
        6
      );
      const volatile = calibrateRevenueVolatilityFromSales(
        weeklySales([500, 1500, 500, 1500, 500, 1500]),
        endDate,
        6
      );

      expect(stable.annualizedSigma).toBeCloseTo(0, 8);
      expect(volatile.annualizedSigma).toBeGreaterThan(stable.annualizedSigma);
      expect(volatile.weeksUsed).toBe(6);
    });

    it('should estimate true demand when a partial stockout hides sales', () => {
      const sales: SalesRecord[] = [
        { date: new Date(endDate.getTime() - 3.5 * weekMs).toISOString(), sku: 'SKU-1', units: 10, revenue: 1000 },
        { date: new Date(endDate.getTime() - 2.5 * weekMs).toISOString(), sku: 'SKU-1', units: 10, revenue: 1000 },
        { date: new Date(endDate.getTime() - 1.5 * weekMs).toISOString(), sku: 'SKU-1', units: 5, revenue: 500 },
        { date: new Date(endDate.getTime() - 0.5 * weekMs).toISOString(), sku: 'SKU-1', units: 10, revenue: 1000 }
      ];
      const stocks: StockRecord[] = [
        { date: new Date(endDate.getTime() - 3.5 * weekMs).toISOString(), sku: 'SKU-1', quantity: 10 },
        { date: new Date(endDate.getTime() - 2.5 * weekMs).toISOString(), sku: 'SKU-1', quantity: 10 },
        { date: new Date(endDate.getTime() - 1.75 * weekMs).toISOString(), sku: 'SKU-1', quantity: 10 },
        { date: new Date(endDate.getTime() - 1.25 * weekMs).toISOString(), sku: 'SKU-1', quantity: 0 },
        { date: new Date(endDate.getTime() - 0.5 * weekMs).toISOString(), sku: 'SKU-1', quantity: 10 }
      ];

      const raw = computeWeeklyStatsForSeries(sales, endDate, 4);
      const adjusted = computeWeeklyStatsAdjustedForStockouts(sales, stocks, endDate, 4);

      expect(raw.muWeek).toBeCloseTo(8.75, 2);
      expect(adjusted.muWeek).toBeCloseTo(10, 2);
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

    it('should reduce rush revenue by rushSave for deterministic demand', () => {
      const revenue = calculateExpectedRevenue(
        50, 25, 0, 4, 10, 5, 1, 3, mcDemandLoss, defaultMonteCarloParams
      );

      expect(revenue).toBe(1350);
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

  describe('WB data normalization', () => {
    it('should use the latest stock snapshot per sku, barcode and warehouse', () => {
      const { totalBySku, stockBySkuWarehouse } = aggregateLatestStockSnapshots([
        { date: '2026-01-01T00:00:00Z', sku: 'SKU-1', barcode: 'A', warehouse: 'Коледино', quantity: 10 },
        { date: '2026-01-02T00:00:00Z', sku: 'SKU-1', barcode: 'A', warehouse: 'Коледино', quantity: 3 },
        { date: '2026-01-01T00:00:00Z', sku: 'SKU-1', barcode: 'B', warehouse: 'Коледино', quantity: 4 },
        { date: '2026-01-02T00:00:00Z', sku: 'SKU-1', barcode: 'A', warehouse: 'Казань', quantity: 5 }
      ]);

      expect(totalBySku.get('SKU-1')).toBe(12);
      expect(stockBySkuWarehouse.get('SKU-1')).toEqual({ 'Коледино': 7, 'Казань': 5 });
    });

    it('should update demand and revenue fields from sales history', () => {
      const products = [{
        sku: 'SKU-1',
        muWeek: 0,
        sigmaWeek: 0,
        revenue: 0
      }];
      const sales: SalesRecord[] = [
        { date: '2024-01-26T00:00:00Z', sku: 'SKU-1', units: 2, revenue: 200 },
        { date: '2023-12-22T00:00:00Z', sku: 'SKU-1', units: 3, revenue: 300 }
      ];

      const [updated] = updateProductsFromSales(products, sales, { weeksWindow: 8 });
      expect(updated.revenue30d).toBe(200);
      expect(updated.revenue12m).toBe(500);
      expect(updated.revenue).toBe(500);
    });
  });
}); 