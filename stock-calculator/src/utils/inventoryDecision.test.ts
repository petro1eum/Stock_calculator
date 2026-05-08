import { Product, MonteCarloParams } from '../types';
import {
  buildDecisionContext,
  calculateSafetyStock,
  evaluateInventoryDecision,
  getAnalysisRevenue,
  getEffectivePlanningHorizon,
  getPlanningDemand,
  optimizeInventoryDecision
} from './inventoryDecision';

const monteCarloParams: MonteCarloParams = {
  iterations: 100,
  showAdvanced: false,
  confidenceLevel: 0.95,
  randomSeed: 123,
  method: 'closed'
};

const baseContext = buildDecisionContext({
  weeks: 4,
  hold: 0.5,
  r: 0.06,
  rushProb: 0,
  rushSave: 0,
  csl: 0.95,
  maxUnits: 300,
  monteCarloParams
});

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 1,
  name: 'Тестовый товар',
  sku: 'SKU-1',
  purchase: 10,
  margin: 5,
  muWeek: 25,
  sigmaWeek: 5,
  revenue: 0,
  optQ: 0,
  optValue: 0,
  safety: 0,
  currentStock: 0,
  ...overrides
});

describe('inventory decision core', () => {
  it('should use shelf life as the planning horizon cap', () => {
    const product = makeProduct({ shelfLife: 2 });
    expect(getEffectivePlanningHorizon(product, baseContext)).toBe(2);
  });

  it('should apply seasonality and scenarios to planning demand', () => {
    const product = makeProduct({
      seasonality: {
        enabled: true,
        currentMonth: 0,
        monthlyFactors: [2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1]
      }
    });
    const demand = getPlanningDemand(product, baseContext, { muWeekMultiplier: 0.5, sigmaWeekMultiplier: 2 });
    expect(demand.muWeek).toBeCloseTo(25, 5);
    expect(demand.sigmaWeek).toBeCloseTo(20, 5);
  });

  it('should treat order quantity and current stock separately', () => {
    const product = makeProduct({ currentStock: 40 });
    const decision = evaluateInventoryDecision(product, 10, baseContext);
    expect(decision.orderQty).toBe(10);
    expect(decision.totalInventory).toBe(50);
    expect(decision.investment).toBe(100);
  });

  it('should reduce recommended order when current stock is already available', () => {
    const withoutStock = optimizeInventoryDecision(makeProduct(), baseContext);
    const withStock = optimizeInventoryDecision(makeProduct({ currentStock: 80 }), baseContext);
    expect(withStock.orderQty).toBeLessThan(withoutStock.orderQty);
  });

  it('should respect max storage as an order cap', () => {
    const product = makeProduct({ maxStorageQty: 40 });
    const result = optimizeInventoryDecision(product, baseContext);
    expect(result.orderQty).toBeLessThanOrEqual(40);
  });

  it('should calculate safety stock on the same horizon', () => {
    const full = calculateSafetyStock(makeProduct(), baseContext);
    const short = calculateSafetyStock(makeProduct({ shelfLife: 1 }), baseContext);
    expect(short).toBeLessThan(full);
  });

  it('should prefer actual revenue history for analysis revenue', () => {
    const product = makeProduct({ revenue: 1000, revenue12m: 5000 });
    expect(getAnalysisRevenue(product, baseContext)).toBe(5000);
  });
});
