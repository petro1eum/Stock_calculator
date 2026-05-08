import { Product, MonteCarloParams, Scenario } from '../types';
import { blackScholesCall, inverseNormal } from './mathFunctions';
import {
  calculateExpectedRevenue,
  calculateInventoryStrike,
  calculateVolatility,
  getAverageSeasonalDemand,
  getEffectivePurchasePrice,
  mcDemandLoss,
  optimizeQuantity
} from './inventoryCalculations';

export interface InventoryDecisionContext {
  weeks: number;
  hold: number;
  r: number;
  rushProb: number;
  rushSave: number;
  csl: number;
  maxUnits: number;
  monteCarloParams: MonteCarloParams;
}

export interface ScenarioAdjustment {
  muWeekMultiplier?: number;
  sigmaWeekMultiplier?: number;
}

export interface PlanningDemand {
  muWeek: number;
  sigmaWeek: number;
  weeks: number;
  expectedDemand: number;
  demandStd: number;
}

export interface InventoryDecisionResult {
  orderQty: number;
  totalInventory: number;
  effectivePurchase: number;
  expectedRevenue: number;
  strike: number;
  timeYears: number;
  sigma: number;
  optionValue: number;
  investment: number;
  storageCost: number;
  roi: number;
  planningDemand: PlanningDemand;
}

export interface InventoryOptimizationResult extends InventoryDecisionResult {
  safetyStock: number;
  analysisRevenue: number;
}

const defaultMonteCarloParams: MonteCarloParams = {
  iterations: 1000,
  showAdvanced: false,
  confidenceLevel: 0.95,
  randomSeed: null,
  method: 'closed'
};

export const buildDecisionContext = (settings: Partial<InventoryDecisionContext>): InventoryDecisionContext => ({
  weeks: Math.max(0, settings.weeks ?? 0),
  hold: Math.max(0, settings.hold ?? 0),
  r: settings.r ?? 0,
  rushProb: Math.min(1, Math.max(0, settings.rushProb ?? 0)),
  rushSave: Math.max(0, settings.rushSave ?? 0),
  csl: Math.min(0.999999, Math.max(0.000001, settings.csl ?? 0.95)),
  maxUnits: Math.max(0, Math.floor(settings.maxUnits ?? 0)),
  monteCarloParams: settings.monteCarloParams ?? defaultMonteCarloParams
});

export const getEffectivePlanningHorizon = (product: Product, context: InventoryDecisionContext): number => {
  const shelfLife = product.shelfLife && product.shelfLife > 0 ? product.shelfLife : context.weeks;
  return Math.max(0, Math.min(context.weeks, shelfLife));
};

export const getPlanningDemand = (
  product: Product,
  context: InventoryDecisionContext,
  scenario?: ScenarioAdjustment
): PlanningDemand => {
  const weeks = getEffectivePlanningHorizon(product, context);
  const seasonalMu = getAverageSeasonalDemand(product.muWeek, product.seasonality, weeks);
  const seasonalityScale = product.muWeek > 0 ? seasonalMu / product.muWeek : 1;
  const muWeek = Math.max(0, seasonalMu * (scenario?.muWeekMultiplier ?? 1));
  const sigmaWeek = Math.max(0, product.sigmaWeek * seasonalityScale * (scenario?.sigmaWeekMultiplier ?? 1));
  return {
    muWeek,
    sigmaWeek,
    weeks,
    expectedDemand: muWeek * weeks,
    demandStd: sigmaWeek * Math.sqrt(weeks)
  };
};

export const calculateSafetyStock = (
  product: Product,
  context: InventoryDecisionContext,
  scenario?: ScenarioAdjustment
): number => {
  const demand = getPlanningDemand(product, context, scenario);
  if (demand.weeks <= 0 || demand.sigmaWeek <= 0) return 0;
  return Math.ceil(inverseNormal(context.csl) * demand.sigmaWeek * Math.sqrt(demand.weeks));
};

export const evaluateInventoryDecision = (
  product: Product,
  orderQty: number,
  context: InventoryDecisionContext,
  scenario?: ScenarioAdjustment
): InventoryDecisionResult => {
  const normalizedOrderQty = Math.max(0, Math.floor(orderQty || 0));
  const planningDemand = getPlanningDemand(product, context, scenario);
  const totalInventory = normalizedOrderQty + Math.max(0, product.currentStock || 0);
  const effectivePurchase = getEffectivePurchasePrice(product.purchase, normalizedOrderQty, product.volumeDiscounts);
  const expectedRevenue = calculateExpectedRevenue(
    totalInventory,
    planningDemand.muWeek,
    planningDemand.sigmaWeek,
    planningDemand.weeks,
    effectivePurchase,
    product.margin,
    context.rushProb,
    context.rushSave,
    mcDemandLoss,
    context.monteCarloParams
  );
  const strike = calculateInventoryStrike(normalizedOrderQty, effectivePurchase, context.hold, planningDemand.weeks);
  const timeYears = planningDemand.weeks / 52;
  const sigma = calculateVolatility(
    planningDemand.muWeek,
    planningDemand.sigmaWeek,
    planningDemand.weeks,
    totalInventory,
    context.rushProb,
    product.currency,
    product.supplier
  );
  const { optionValue } = blackScholesCall(expectedRevenue, Math.max(strike, 1e-6), timeYears, sigma, context.r);
  const investment = normalizedOrderQty * effectivePurchase;
  const storageCost = normalizedOrderQty * context.hold * planningDemand.weeks;

  return {
    orderQty: normalizedOrderQty,
    totalInventory,
    effectivePurchase,
    expectedRevenue,
    strike,
    timeYears,
    sigma,
    optionValue,
    investment,
    storageCost,
    roi: investment > 0 ? (optionValue / investment) * 100 : 0,
    planningDemand
  };
};

export const getSyntheticAnnualRevenue = (product: Product, context?: InventoryDecisionContext): number => {
  const baseWeeklyRevenue = Math.max(0, product.muWeek || 0) * ((product.purchase || 0) + (product.margin || 0));
  if (!context) return baseWeeklyRevenue * 52;
  const seasonalMu = getAverageSeasonalDemand(product.muWeek, product.seasonality, 52);
  return Math.max(0, seasonalMu) * ((product.purchase || 0) + (product.margin || 0)) * 52;
};

export const getAnalysisRevenue = (product: Product, context?: InventoryDecisionContext): number => {
  if (typeof product.revenue12m === 'number' && product.revenue12m > 0) return product.revenue12m;
  if (typeof product.revenue === 'number' && product.revenue > 0) return product.revenue;
  return getSyntheticAnnualRevenue(product, context);
};

export const optimizeInventoryDecision = (
  product: Product,
  context: InventoryDecisionContext,
  scenario?: ScenarioAdjustment
): InventoryOptimizationResult => {
  const minQ = Math.max(0, Math.floor(product.minOrderQty || 0));
  const maxByProduct = product.maxStorageQty && product.maxStorageQty > 0
    ? Math.floor(product.maxStorageQty)
    : context.maxUnits;
  const maxQ = Math.max(minQ, Math.floor(Math.min(context.maxUnits, maxByProduct)));
  const demand = getPlanningDemand(product, context, scenario);
  const step = Math.max(1, Math.round(Math.max(demand.muWeek, 1) / 10));
  const { bestQ } = optimizeQuantity(minQ, maxQ, step, q =>
    evaluateInventoryDecision(product, q, context, scenario).optionValue
  );
  const decision = evaluateInventoryDecision(product, bestQ, context, scenario);
  return {
    ...decision,
    safetyStock: calculateSafetyStock(product, context, scenario),
    analysisRevenue: getAnalysisRevenue(product, context)
  };
};

export const scenarioToAdjustment = (scenario: Scenario): ScenarioAdjustment => ({
  muWeekMultiplier: scenario.muWeekMultiplier,
  sigmaWeekMultiplier: scenario.sigmaWeekMultiplier
});
