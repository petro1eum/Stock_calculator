import { normalCDF } from './mathFunctions';
import { SeasonalityData, VolumeDiscount, MonteCarloParams, SalesRecord, PurchaseRecord, LogisticsRecord, StockRecord } from '../types';
import { blackScholesCall } from './mathFunctions';
import { getCachedWasmModule } from './wasmBridge';

// Monte-Carlo ожидание lost-sales при запасе q
export const mcDemandLoss = (
  units: number,
  muWeek: number,
  sigmaWeek: number,
  weeks: number,
  monteCarloParams: MonteCarloParams
): number => {
  const mean = muWeek * weeks;
  const std = sigmaWeek * Math.sqrt(weeks);

  const cv = sigmaWeek / Math.max(muWeek, 1);
  const defaultTrials = Math.max(1000, Math.ceil(5000 * cv));
  const actualTrials = monteCarloParams.iterations || defaultTrials;

  // Wasm Fast Path
  const wasm = getCachedWasmModule();
  if (wasm) {
    return wasm.mcDemandLoss(units, muWeek, sigmaWeek, weeks, actualTrials);
  }

  let lostSum = 0;

  // Возможность использовать фиксированный seed
  let rng = Math.random;
  if (monteCarloParams.randomSeed !== null) {
    let seed = monteCarloParams.randomSeed;
    rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  for (let i = 0; i < actualTrials; i++) {
    const u1 = rng(), u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const demand = Math.round(Math.max(0, mean + std * z));
    lostSum += Math.max(0, demand - units);
  }
  return lostSum / actualTrials;
};

// Расчет эффективной цены закупки с учетом скидок за объем
export const getEffectivePurchasePrice = (
  basePrice: number,
  quantity: number,
  volumeDiscounts?: VolumeDiscount[]
): number => {
  if (!volumeDiscounts || volumeDiscounts.length === 0) {
    return basePrice;
  }

  const sortedDiscounts = [...volumeDiscounts].sort((a, b) => b.qty - a.qty);
  const applicableDiscount = sortedDiscounts.find(d => quantity >= d.qty);

  if (applicableDiscount) {
    return basePrice * (1 - applicableDiscount.discount / 100);
  }

  return basePrice;
};

// Расчет ожидаемой выручки
export const calculateExpectedRevenue = (
  q: number,
  muWeek: number,
  sigmaWeek: number,
  weeks: number,
  purchase: number,
  margin: number,
  rushProb: number,
  rushSave: number,
  mcDemandLossFn: typeof mcDemandLoss,
  monteCarloParams: MonteCarloParams
): number => {
  if (q === 0) return 0;

  const expectedDemand = muWeek * weeks;
  const demandStd = sigmaWeek * Math.sqrt(weeks);
  const fullPrice = purchase + margin;
  // Потери при экстренной закупке: снижаем эффективность rush-продаж на rushSave за единицу
  const rushUnitRevenue = Math.max(fullPrice - rushSave, 0);

  // Выбор метода: закрытая форма (по умолчанию) или Монте-Карло
  let method = monteCarloParams?.method ?? 'closed';
  if (method === 'auto') {
    const expectedDemand = muWeek * weeks;
    const demandStd = sigmaWeek * Math.sqrt(weeks);
    const cv = expectedDemand > 0 ? demandStd / expectedDemand : 0;
    const highCV = cv > 1.0; // 100%+
    const complexSeasonality = false; // признак можно пробрасывать извне при необходимости
    method = (highCV || complexSeasonality) ? 'mc' : 'closed';
  }

  if (method === 'mc') {
    // MC-путь: используем внешнюю функцию для ожидания потерь, продажи ограничены q
    const expectedDemand = muWeek * weeks;
    const expectedLost = mcDemandLossFn(q, muWeek, sigmaWeek, weeks, monteCarloParams);
    const normalSales = Math.max(0, expectedDemand - expectedLost);
    const rushSales = expectedLost * rushProb;
    return normalSales * fullPrice + rushSales * rushUnitRevenue;
  }

  // Закрытая форма: z = (q - μ) / σ, E[min(q, D)] = q Φ(z) + μ (1 - Φ(z)) - σ φ(z)
  // и E[(D - q)+] = σ φ(z) + (μ - q) (1 - Φ(z))
  if (demandStd <= 0) {
    const normalSales = Math.min(q, expectedDemand);
    const lostSales = Math.max(0, expectedDemand - q);
    const rushSales = lostSales * rushProb;
    return normalSales * fullPrice + rushSales * rushUnitRevenue;
  }
  const z = (q - expectedDemand) / demandStd;
  const phi_z = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const Phi_z = normalCDF(z);

  const expectedLost = Math.max(0, demandStd * phi_z + (expectedDemand - q) * (1 - Phi_z));
  const expectedSales = Math.max(0, expectedDemand - expectedLost);
  const rushSales = expectedLost * rushProb;

  return expectedSales * fullPrice + rushSales * rushUnitRevenue;
};

// Расчет волатильности для Black-Scholes
export const calculateVolatility = (
  muWeek: number,
  sigmaWeek: number,
  weeks: number,
  q: number,
  rushProb: number = 0,
  currency?: string,
  supplier?: string
): number => {
  const expectedDemand = muWeek * weeks;
  const demandStd = sigmaWeek * Math.sqrt(weeks);

  if (expectedDemand <= 0) return 0.1;

  const cvDemand = demandStd / expectedDemand;
  const fillRate = Math.min(1, q / expectedDemand);
  const revenueVolatility = cvDemand * (1 - Math.exp(-2 * fillRate));
  const rushFactor = 1 - 0.2 * rushProb;

  // Валютная и логистическая компоненты (как в портфеле)
  const CURRENCY_VOL: Record<string, number> = { RUB: 0.15, USD: 0.20, EUR: 0.18, CNY: 0.12 };
  const LOGISTICS_VOL: Record<string, number> = { domestic: 0.10, china: 0.25, europe: 0.20, usa: 0.22 };
  const currencyVol = CURRENCY_VOL[(currency || 'RUB').toUpperCase()] ?? 0.15;
  const logisticsVol = LOGISTICS_VOL[(supplier || 'domestic').toLowerCase()] ?? 0.15;

  const base = Math.max(0.01, revenueVolatility * rushFactor);
  const combined = Math.sqrt(base * base + currencyVol * currencyVol + logisticsVol * logisticsVol);
  return combined;
};

// Расчет спроса с учетом сезонности
export const getSeasonalDemand = (
  baseWeeklyDemand: number,
  seasonality?: SeasonalityData,
  weeksAhead: number = 0
): number => {
  if (!seasonality || !seasonality.enabled) {
    return baseWeeklyDemand;
  }

  const currentMonth = seasonality.currentMonth;
  const monthsAhead = Math.floor(weeksAhead / 4.33);
  const targetMonth = (currentMonth + monthsAhead) % 12;
  const seasonalFactor = seasonality.monthlyFactors[targetMonth];

  return baseWeeklyDemand * seasonalFactor;
};

// Расчет среднего спроса за период с учетом сезонности
export const getAverageSeasonalDemand = (
  baseWeeklyDemand: number,
  seasonality: SeasonalityData | undefined,
  weeks: number
): number => {
  if (!seasonality || !seasonality.enabled) {
    return baseWeeklyDemand;
  }

  let totalDemand = 0;
  const weeksPerMonth = 4.33;

  for (let week = 0; week < weeks; week++) {
    const monthOffset = Math.floor(week / weeksPerMonth);
    const month = (seasonality.currentMonth + monthOffset) % 12;
    totalDemand += baseWeeklyDemand * seasonality.monthlyFactors[month];
  }

  return totalDemand / weeks;
};

// Парсинг истории из CSV по типам записей
export const parseSalesCSV = (csv: string): SalesRecord[] => {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const [header, ...rows] = lines;
  const cols = header.split(',').map(h => h.trim().toLowerCase());
  const idx = (name: string) => cols.indexOf(name);
  const di = idx('date'), si = idx('sku'), ui = idx('units'), ri = idx('revenue');
  return rows.map(r => {
    const parts = r.split(',');
    return {
      date: parts[di]?.trim() || '',
      sku: parts[si]?.trim() || '',
      units: Number(parts[ui] || 0),
      revenue: parts[ri] ? Number(parts[ri]) : undefined
    } as SalesRecord;
  }).filter(r => r.date && r.sku);
};

export const parsePurchasesCSV = (csv: string): PurchaseRecord[] => {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const [header, ...rows] = lines;
  const cols = header.split(',').map(h => h.trim().toLowerCase());
  const di = cols.indexOf('date');
  const si = cols.indexOf('sku');
  const qi = cols.indexOf('quantity');
  const ci = cols.indexOf('unitcost');
  const curi = cols.indexOf('currency');
  const eri = cols.indexOf('exchangeratetorub');
  return rows.map(r => {
    const p = r.split(',');
    return {
      date: p[di]?.trim() || '',
      sku: p[si]?.trim() || '',
      quantity: Number(p[qi] || 0),
      unitCost: Number(p[ci] || 0),
      currency: p[curi]?.trim(),
      exchangeRateToRUB: p[eri] ? Number(p[eri]) : undefined
    } as PurchaseRecord;
  }).filter(r => r.date && r.sku);
};

export const parseLogisticsCSV = (csv: string): LogisticsRecord[] => {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const [header, ...rows] = lines;
  const cols = header.split(',').map(h => h.trim().toLowerCase());
  const di = cols.indexOf('date');
  const si = cols.indexOf('sku');
  const ci = cols.indexOf('cost');
  const curi = cols.indexOf('currency');
  const eri = cols.indexOf('exchangeratetorub');
  return rows.map(r => {
    const p = r.split(',');
    return {
      date: p[di]?.trim() || '',
      sku: p[si]?.trim() || '',
      cost: Number(p[ci] || 0),
      currency: p[curi]?.trim(),
      exchangeRateToRUB: p[eri] ? Number(p[eri]) : undefined
    } as LogisticsRecord;
  }).filter(r => r.date && r.sku);
};

// Парсинг XLSX (Excel) для продаж/закупок/логистики
export const parseSalesXLSX = async (file: File): Promise<SalesRecord[]> => {
  const xlsx: any = await import('xlsx');
  const data = await file.arrayBuffer();
  const wb = xlsx.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: '' }) as any[];
  return rows.map((r: any) => ({
    date: String(r.date || r.Date || r.DATE || ''),
    sku: String(r.sku || r.SKU || ''),
    units: Number(r.units ?? r.Units ?? r.UNITS ?? 0),
    revenue: r.revenue !== undefined ? Number(r.revenue) : undefined
  })).filter(r => r.date && r.sku);
};

export const parsePurchasesXLSX = async (file: File): Promise<PurchaseRecord[]> => {
  const xlsx: any = await import('xlsx');
  const data = await file.arrayBuffer();
  const wb = xlsx.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: '' }) as any[];
  return rows.map((r: any) => ({
    date: String(r.date || r.Date || ''),
    sku: String(r.sku || r.SKU || ''),
    quantity: Number(r.quantity ?? 0),
    unitCost: Number(r.unitCost ?? r.cost ?? 0),
    currency: r.currency || undefined,
    exchangeRateToRUB: r.exchangeRateToRUB !== undefined ? Number(r.exchangeRateToRUB) : undefined
  })).filter(r => r.date && r.sku);
};

export const parseLogisticsXLSX = async (file: File): Promise<LogisticsRecord[]> => {
  const xlsx: any = await import('xlsx');
  const data = await file.arrayBuffer();
  const wb = xlsx.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: '' }) as any[];
  return rows.map((r: any) => ({
    date: String(r.date || r.Date || ''),
    sku: String(r.sku || r.SKU || ''),
    cost: Number(r.cost ?? 0),
    currency: r.currency || undefined,
    exchangeRateToRUB: r.exchangeRateToRUB !== undefined ? Number(r.exchangeRateToRUB) : undefined
  })).filter(r => r.date && r.sku);
};

// Группировка продаж по SKU
export const groupSalesBySKU = (sales: SalesRecord[]): Map<string, SalesRecord[]> => {
  const map = new Map<string, SalesRecord[]>();
  for (const rec of sales) {
    const arr = map.get(rec.sku) || [];
    arr.push(rec);
    map.set(rec.sku, arr);
  }
  return map;
};

// Подсчет средних продаж и ст. отклонения по неделям за окно weeksWindow, заканчивающееся endDate
export const computeWeeklyStatsForSeries = (
  series: SalesRecord[],
  endDate: Date = new Date(),
  weeksWindow: number = 26
): { muWeek: number; sigmaWeek: number; totalUnits: number; totalRevenue?: number } => {
  if (weeksWindow <= 0) return { muWeek: 0, sigmaWeek: 0, totalUnits: 0 };
  const msInWeek = 7 * 24 * 60 * 60 * 1000;
  const startMs = endDate.getTime() - weeksWindow * msInWeek;
  const buckets: number[] = Array(weeksWindow).fill(0);
  let totalRevenue = 0;
  for (const rec of series) {
    const t = new Date(rec.date).getTime();
    if (isNaN(t) || t < startMs || t > endDate.getTime()) continue;
    const idx = Math.min(weeksWindow - 1, Math.floor((t - startMs) / msInWeek));
    buckets[idx] += Math.max(0, rec.units || 0);
    if (typeof rec.revenue === 'number') totalRevenue += rec.revenue;
  }
  const n = buckets.length;
  const sum = buckets.reduce((a, b) => a + b, 0);
  const mean = n > 0 ? sum / n : 0;
  const variance = n > 1 ? buckets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const sigma = Math.sqrt(variance);
  return { muWeek: mean, sigmaWeek: sigma, totalUnits: sum, totalRevenue: totalRevenue || undefined };
};

// Оценка спроса с учетом out-of-stock: если неделя была полностью без стока, не считаем ее как нулевую продажу;
// если частично, масштабируем продажи на долю наличия.
export const computeWeeklyStatsAdjustedForStockouts = (
  sales: SalesRecord[],
  stocks: StockRecord[],
  endDate: Date = new Date(),
  weeksWindow: number = 26
): { muWeek: number; sigmaWeek: number; totalUnits: number } => {
  if (weeksWindow <= 0) return { muWeek: 0, sigmaWeek: 0, totalUnits: 0 };
  const msInWeek = 7 * 24 * 60 * 60 * 1000;
  const startMs = endDate.getTime() - weeksWindow * msInWeek;

  // Продажи по неделям
  const salesBuckets: number[] = Array(weeksWindow).fill(0);
  for (const rec of sales) {
    const t = new Date(rec.date).getTime();
    if (isNaN(t) || t < startMs || t > endDate.getTime()) continue;
    const idx = Math.min(weeksWindow - 1, Math.floor((t - startMs) / msInWeek));
    salesBuckets[idx] += Math.max(0, rec.units || 0);
  }

  // Доля наличия по неделям (0..1) — по дневным снапшотам складских остатков
  const availBuckets: number[] = Array(weeksWindow).fill(0);
  const daysCount: number[] = Array(weeksWindow).fill(0);
  for (const st of stocks) {
    const t = new Date(st.date).getTime();
    if (isNaN(t) || t < startMs || t > endDate.getTime()) continue;
    const idx = Math.min(weeksWindow - 1, Math.floor((t - startMs) / msInWeek));
    availBuckets[idx] += (st.quantity || 0) > 0 ? 1 : 0; // день в наличии
    daysCount[idx] += 1;
  }
  const availability: number[] = availBuckets.map((n, i) => {
    const denom = daysCount[i] || 0;
    return denom > 0 ? Math.min(1, Math.max(0, n / denom)) : 1; // если нет данных по стоку — считаем доступным
  });

  // Скорректированный спрос: if availability ~ a, ожидаемый спрос ≈ sales / max(a, eps)
  const adj: number[] = salesBuckets.map((s, i) => {
    const a = Math.max(0.05, availability[i]);
    // Если неделя без данных по стоку и без продаж — не искажаем (оставим 0)
    if (daysCount[i] === 0) return s;
    return s / a;
  });

  // Исключаем недели с отсутствием стока целиком и отсутствием продаж из оценки дисперсии
  const filtered = adj.filter((v, i) => !(availability[i] === 0 && salesBuckets[i] === 0));
  if (filtered.length === 0) return { muWeek: 0, sigmaWeek: 0, totalUnits: 0 };

  const n = filtered.length;
  const mean = filtered.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? filtered.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const sigma = Math.sqrt(variance);
  return { muWeek: mean, sigmaWeek: sigma, totalUnits: salesBuckets.reduce((a, b) => a + b, 0) };
};

// Массовое обновление μ/σ по продажам и остаткам (если есть)
export const updateProductsFromSalesAndStocks = (
  products: Array<{ sku: string } & any>,
  sales: SalesRecord[],
  stocks: StockRecord[],
  options?: { weeksWindow?: number }
) => {
  const weeksWindow = options?.weeksWindow ?? 26;
  const groupedSales = groupSalesBySKU(sales);
  const groupedStocks = (() => {
    const m = new Map<string, StockRecord[]>();
    for (const r of stocks) {
      const sku = r.sku;
      const arr = m.get(sku) || [];
      arr.push(r);
      m.set(sku, arr);
    }
    return m;
  })();

  const endDate = new Date();
  return products.map(prod => {
    const sSeries = groupedSales.get(prod.sku) || [];
    const kSeries = groupedStocks.get(prod.sku) || [];
    if (sSeries.length === 0) return prod;
    const stats = computeWeeklyStatsAdjustedForStockouts(sSeries, kSeries, endDate, weeksWindow);
    return { ...prod, muWeek: stats.muWeek, sigmaWeek: stats.sigmaWeek, salesHistory: sSeries };
  });
};

// Обновление списка товаров на основе истории продаж: пересчитываем muWeek и sigmaWeek (по SKU)
export const updateProductsFromSales = (
  products: Array<{ sku: string } & any>,
  sales: SalesRecord[],
  options?: { weeksWindow?: number }
) => {
  const weeksWindow = options?.weeksWindow ?? 26;
  const grouped = groupSalesBySKU(sales);
  const endDate = new Date();
  return products.map(prod => {
    const series = grouped.get(prod.sku);
    if (!series || series.length === 0) return prod;
    const stats = computeWeeklyStatsForSeries(series, endDate, weeksWindow);
    return {
      ...prod,
      muWeek: stats.muWeek,
      sigmaWeek: stats.sigmaWeek,
      salesHistory: series
    };
  });
};

// Быстрая оптимизация q: грубая сетка + тернарный поиск на целых значениях
export const optimizeQuantity = (
  minQ: number,
  maxQ: number,
  coarseStep: number,
  evaluate: (q: number) => number
): { bestQ: number; bestValue: number } => {
  const step = Math.max(1, Math.round(coarseStep));
  let bestQ = minQ;
  let bestV = -Infinity;
  const cache = new Map<number, number>();
  const evalQ = (q: number) => {
    if (cache.has(q)) return cache.get(q)!;
    const v = evaluate(q);
    cache.set(q, v);
    return v;
  };
  for (let q = minQ; q <= maxQ; q += step) {
    const v = evalQ(q);
    if (v > bestV) { bestV = v; bestQ = q; }
  }
  let L = Math.max(minQ, bestQ - 3 * step);
  let R = Math.min(maxQ, bestQ + 3 * step);
  while (R - L > 6) {
    const m1 = Math.floor(L + (R - L) / 3);
    const m2 = Math.floor(R - (R - L) / 3);
    const v1 = evalQ(m1);
    const v2 = evalQ(m2);
    if (v1 < v2) L = m1 + 1; else R = m2 - 1;
  }
  for (let q = L; q <= R; q++) {
    const v = evalQ(q);
    if (v > bestV) { bestV = v; bestQ = q; }
  }
  return { bestQ, bestValue: bestV };
};

// Строгая оценка BS-ценности для смеси сценариев: Σ p_s · BS_s(q)
// Для каждого сценария оцениваем моменты выручки через Монте‑Карло (μ_rev, σ_rev)
// затем переводим в логнормальную волатильность: sigma_BS = sqrt(ln(1 + (σ/μ)^2))
export const strictBSMixtureOptionValue = (
  q: number,
  baseMuWeek: number,
  baseSigmaWeek: number,
  weeks: number,
  purchase: number,
  margin: number,
  rushProb: number,
  rushSave: number,
  scenarios: Array<{ probability: number; muWeekMultiplier: number; sigmaWeekMultiplier: number }>,
  r: number,
  hold: number,
  volumeDiscounts?: VolumeDiscount[],
  monteCarloParams?: MonteCarloParams
): number => {
  if (q <= 0 || weeks <= 0) return 0;

  // эффективная закупочная цена с учетом скидок
  const effectivePurchase = getEffectivePurchasePrice(purchase, q, volumeDiscounts);
  const fullPrice = effectivePurchase + margin;
  const rushUnitRevenue = Math.max(fullPrice - rushSave, 0);
  const T = weeks / 52;
  const K = q * effectivePurchase * (1 + r * T) + q * hold * weeks;

  // ограничиваем нагрузки: итерации для Монте‑Карло в пределах [300..2000]
  const trialsBase = (() => {
    const it = monteCarloParams?.iterations;
    if (typeof it === 'number' && isFinite(it) && it > 0) return Math.min(2000, Math.max(300, Math.floor(it)));
    return 1000;
  })();
  let total = 0;

  for (const s of scenarios) {
    const muW = Math.max(0, baseMuWeek * (s.muWeekMultiplier || 1));
    const sigmaW = Math.max(0, baseSigmaWeek * (s.sigmaWeekMultiplier || 1));
    const mean = muW * weeks;
    const std = sigmaW * Math.sqrt(weeks);

    // Монте‑Карло по выручке
    let sum = 0;
    let sumsq = 0;
    const trials = trialsBase;
    let seed = (monteCarloParams?.randomSeed ?? 1234567) + Math.floor(muW * 1000);
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed & 0xfffffff) / 0x10000000; };
    for (let i = 0; i < trials; i++) {
      const u1 = Math.max(1e-12, rng());
      const u2 = Math.max(1e-12, rng());
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const demand = Math.max(0, Math.round(mean + std * z));
      const normalSales = Math.min(q, demand);
      const lost = Math.max(0, demand - q);
      const rushSales = lost * rushProb;
      const rev = normalSales * fullPrice + rushSales * rushUnitRevenue;
      sum += rev;
      sumsq += rev * rev;
    }
    const muRev = sum / trials;
    const varRev = Math.max(0, sumsq / trials - muRev * muRev);
    const sigmaRev = Math.sqrt(varRev);
    const sigmaBS = muRev > 0 ? Math.sqrt(Math.log(1 + (sigmaRev / muRev) ** 2)) : 0.2;

    const { optionValue } = blackScholesCall(Math.max(muRev, 1e-6), Math.max(K, 1e-6), T, Math.max(sigmaBS, 1e-6), r);
    total += (s.probability || 0) * optionValue;
  }
  return total;
};