import React from 'react';
import { Product, SalesRecord, Scenario } from '../types';
import { formatNumber } from '../utils/mathFunctions';

interface RiskPanelProps {
  products: Product[];
  confidence?: number; // e.g. 0.95
  lookbackWeeks?: number; // e.g. 26
  scenarios?: Scenario[]; // optional probabilistic states (weights sum to 1)
}

// Standard normal PDF
const normalPDF = (x: number): number => {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
};

// Aggregate weekly revenue from sales history
const aggregateWeeklyRevenue = (sales: SalesRecord[], weeksWindow: number): number[] => {
  if (!sales || sales.length === 0 || weeksWindow <= 0) return [];
  const endDate = new Date();
  const msWeek = 7 * 24 * 60 * 60 * 1000;
  const startMs = endDate.getTime() - weeksWindow * msWeek;
  const buckets: number[] = Array(weeksWindow).fill(0);
  for (const rec of sales) {
    if (rec.revenue === undefined || rec.revenue === null) continue;
    const t = new Date(rec.date).getTime();
    if (isNaN(t) || t < startMs || t > endDate.getTime()) continue;
    const idx = Math.min(weeksWindow - 1, Math.floor((t - startMs) / msWeek));
    buckets[idx] += Number(rec.revenue) || 0;
  }
  return buckets;
};

// Compute mean and std from an array
const meanStd = (arr: number[]): { mean: number; std: number } => {
  if (!arr || arr.length === 0) return { mean: 0, std: 0 };
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, std: Math.sqrt(variance) };
};

// Fallback estimation from product weekly demand μ/σ
const estimateWeeklyRevenueFromProducts = (products: Product[], muMultiplier = 1, sigmaMultiplier = 1): { mean: number; std: number } => {
  let totalMean = 0;
  let totalVar = 0;
  for (const p of products) {
    const unitRevenue = (p.purchase || 0) + (p.margin || 0);
    const muUnits = Math.max(0, (p.muWeek || 0) * muMultiplier);
    const sigmaUnits = Math.max(0, (p.sigmaWeek || 0) * sigmaMultiplier);
    const meanRevenue = muUnits * unitRevenue;
    const cv = muUnits > 0 ? sigmaUnits / muUnits : 0;
    const varRevenue = (cv * meanRevenue) * (cv * meanRevenue); // (CV * μ)^2
    totalMean += meanRevenue;
    totalVar += varRevenue; // предположим нулевую корреляцию между товарами
  }
  return { mean: totalMean, std: Math.sqrt(totalVar) };
};

// Mixture-of-normals VaR/ES (discrete states)
const mixtureVaR_ES = (
  states: Array<{ mean: number; std: number; weight: number }>,
  alpha: number
): { var: number; es: number; mixtureMean: number; quantile: number } => {
  // normalize weights
  const weightSum = states.reduce((s, st) => s + (st.weight || 0), 0) || 1;
  const normStates = states.map(s => ({ ...s, weight: (s.weight || 0) / weightSum }));
  const mixMean = normStates.reduce((s, st) => s + st.weight * st.mean, 0);

  const cdf = (x: number) => normStates.reduce((acc, st) => acc + st.weight * (st.std > 0 ? 0.5 * (1 + erf((x - st.mean) / (Math.SQRT2 * st.std))) : (x >= st.mean ? 1 : 0)), 0);
  // fast erf
  function erf(x: number) {
    // Abramowitz-Stegun approximation
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + p * ax);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
    return sign * y;
  }

  // bracket search range
  let lo = Infinity, hi = -Infinity;
  normStates.forEach(st => {
    if (st.std > 0) {
      lo = Math.min(lo, st.mean - 6 * st.std);
      hi = Math.max(hi, st.mean + 6 * st.std);
    } else {
      lo = Math.min(lo, st.mean);
      hi = Math.max(hi, st.mean);
    }
  });
  if (!isFinite(lo) || !isFinite(hi)) { lo = -1; hi = 1; }

  // bisection to find q where CDF(q) = 1 - (1 - alpha) = alpha? We want lower-tail 1-alpha (loss) ⇒ revenue quantile q_alpha = F^{-1}(1-alpha)
  const target = 1 - (1 - alpha);
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    if (cdf(mid) < target) lo = mid; else hi = mid;
  }
  const q = 0.5 * (lo + hi);

  // ES for mixture: E[R | R ≤ q]
  const phi = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  let num = 0; // sum p_i Φ(a_i) E[X|X≤q]
  let den = 0; // sum p_i Φ(a_i)
  normStates.forEach(st => {
    if (st.std <= 0) {
      if (q >= st.mean) { num += st.weight * st.mean; den += st.weight; }
      return;
    }
    const a = (q - st.mean) / st.std;
    const Ph = 0.5 * (1 + erf(a / Math.SQRT2));
    if (Ph <= 1e-12) return;
    const truncatedMean = st.mean - st.std * (phi(a) / Ph);
    num += st.weight * Ph * truncatedMean;
    den += st.weight * Ph;
  });
  const condMean = den > 0 ? num / den : q; // fallback
  const varLoss = Math.max(0, mixMean - q);
  const esLoss = Math.max(0, mixMean - condMean);
  return { var: varLoss, es: esLoss, mixtureMean: mixMean, quantile: q };
};

const RiskPanel: React.FC<RiskPanelProps> = ({ products, confidence = 0.95, lookbackWeeks = 26, scenarios }) => {
  const fmt = formatNumber;

  // Собираем историю продаж по всем товарам
  const allSales: SalesRecord[] = React.useMemo(() => {
    const arr: SalesRecord[] = [];
    for (const p of products) {
      if (Array.isArray(p.salesHistory)) arr.push(...p.salesHistory);
    }
    return arr;
  }, [products]);

  // Считаем недельную выручку из истории, если есть
  const weeklyRevenue = React.useMemo(() => aggregateWeeklyRevenue(allSales, lookbackWeeks), [allSales, lookbackWeeks]);

  // μ и σ еженедельной выручки либо смесь состояний
  const riskNumbers = React.useMemo(() => {
    // 1) если есть история — базовые μ/σ от истории
    if (weeklyRevenue.length >= Math.min(8, lookbackWeeks / 2) && (!scenarios || scenarios.length === 0)) {
      const { mean, std } = meanStd(weeklyRevenue);
      const alpha = confidence;
      const z = alpha >= 0.99 ? 2.3263478740408408 : 1.6448536269514722;
      const phi = normalPDF(z);
      return {
        mu: mean,
        sigma: std,
        VaR: std * z,
        ES: std * (phi / (1 - alpha))
      };
    }
    // 2) если заданы вероятностные сценарии — смесь нормалей
    if (scenarios && scenarios.length > 0) {
      const states = scenarios.map(s => {
        const est = estimateWeeklyRevenueFromProducts(products, s.muWeekMultiplier, s.sigmaWeekMultiplier);
        return { mean: est.mean, std: est.std, weight: s.probability };
      });
      const { var: VaR, es: ES, mixtureMean, quantile } = mixtureVaR_ES(states, confidence);
      // Аппроксимация эфф. σ из смеси: по центральной дисперсии
      const mixVar = states.reduce((acc, st) => acc + st.weight * ((st.std ** 2) + (st.mean - mixtureMean) ** 2), 0);
      return { mu: mixtureMean, sigma: Math.sqrt(Math.max(0, mixVar)), VaR, ES };
    }
    // 3) иначе — оценка из параметров товаров (одиночная нормаль)
    const { mean, std } = estimateWeeklyRevenueFromProducts(products);
    const alpha = confidence;
    const z = alpha >= 0.99 ? 2.3263478740408408 : 1.6448536269514722;
    const phi = normalPDF(z);
    return { mu: mean, sigma: std, VaR: std * z, ES: std * (phi / (1 - alpha)) };
  }, [weeklyRevenue, products, lookbackWeeks, scenarios, confidence]);

  // Отображение времени
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="bg-gray-900 text-gray-100 rounded-2xl p-6" data-testid="risk-panel">
      <div className="flex items-center justify-between mb-4">
        <div className="text-lg font-semibold">RISK ({Math.round(confidence * 100)}%)</div>
        <div className="text-sm text-gray-400">{timeStr}</div>
      </div>
      <div className="grid grid-cols-2 gap-y-3">
        <div className="text-gray-300">VaR:</div>
        <div className="text-right">{isFinite(riskNumbers.VaR) && riskNumbers.VaR > 0 ? `₽${fmt(riskNumbers.VaR)}` : '—'}</div>
        <div className="text-gray-300">ES:</div>
        <div className="text-right">{isFinite(riskNumbers.ES) && riskNumbers.ES > 0 ? `₽${fmt(riskNumbers.ES)}` : '—'}</div>
        <div className="text-gray-300">σ (1-bar):</div>
        <div className="text-right">{isFinite(riskNumbers.sigma) && riskNumbers.sigma > 0 ? `₽${fmt(riskNumbers.sigma)}` : '—'}</div>
        <div className="text-gray-300">μ (1-bar):</div>
        <div className="text-right">{isFinite(riskNumbers.mu) && riskNumbers.mu > 0 ? `₽${fmt(riskNumbers.mu)}` : '—'}</div>
      </div>
      {weeklyRevenue.length > 0 && (!scenarios || scenarios.length === 0) && (
        <div className="mt-3 text-xs text-gray-400">Источник: фактическая выручка за {lookbackWeeks} недель</div>
      )}
      {scenarios && scenarios.length > 0 && (
        <div className="mt-3 text-xs text-gray-400">Источник: смесь сценариев (вероятностные состояния)</div>
      )}
      {weeklyRevenue.length === 0 && (!scenarios || scenarios.length === 0) && (
        <div className="mt-3 text-xs text-gray-400">Источник: оценка из μ/σ спроса и цены</div>
      )}
    </div>
  );
};

export default RiskPanel;


