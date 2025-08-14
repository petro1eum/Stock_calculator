import React, { useState, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label } from "recharts";
import { Product, ChartPoint, MonteCarloParams } from '../types';
import { formatNumber } from '../utils/mathFunctions';
import toast from 'react-hot-toast';

interface ProductAnalysisTabProps {
  selectedProduct: number | null;
  productsWithMetrics: Product[];
  editProduct: (product: Product) => void;
  setActiveTab: (tab: string) => void;
  // Параметры для расчетов
  maxUnits: number;
  rushProb: number;
  rushSave: number;
  hold: number;
  r: number;
  weeks: number;
  csl: number;
  // Функции для расчетов
  getEffectivePurchasePrice: (basePrice: number, quantity: number, volumeDiscounts?: any[]) => number;
  calculateExpectedRevenueWrapper: (q: number, muWeek: number, sigmaWeek: number, weeks: number, purchase: number, margin: number, rushProb: number, rushSave: number) => number;
  calculateVolatility: (muWeek: number, sigmaWeek: number, weeks: number, q: number, rushProb?: number, currency?: string, supplier?: string) => number;
  blackScholesCall: (S: number, K: number, T: number, sigma: number, r: number) => { optionValue: number };
  exportToCSV: () => void;
  monteCarloParams: MonteCarloParams;
  setMonteCarloParams: React.Dispatch<React.SetStateAction<MonteCarloParams>>;
}

const ProductAnalysisTab: React.FC<ProductAnalysisTabProps> = ({
  selectedProduct,
  productsWithMetrics,
  editProduct,
  setActiveTab,
  maxUnits,
  rushProb,
  rushSave,
  hold,
  r,
  weeks,
  csl,
  getEffectivePurchasePrice,
  calculateExpectedRevenueWrapper,
  calculateVolatility,
  blackScholesCall,
  exportToCSV,
  monteCarloParams,
  setMonteCarloParams
}) => {
  const [testQuantity, setTestQuantity] = useState(0);
  
  const product = productsWithMetrics.find(p => p.id === selectedProduct);
  const fmtRub = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
  
  // Обновляем testQuantity при смене товара
  React.useEffect(() => {
    if (product) {
      setTestQuantity(product.optQ);
    }
  }, [product]);

  // Расчет данных для графика
  const chartData: ChartPoint[] = useMemo(() => {
    if (!product) return [];
    const data: ChartPoint[] = [];
    const targetPoints = 50;
    const step = Math.max(10, Math.round(maxUnits / targetPoints));
    
    for (let q = 0; q <= maxUnits; q += step) {
      const effectivePurchase = getEffectivePurchasePrice(product.purchase, q, product.volumeDiscounts);
      const S = calculateExpectedRevenueWrapper(q, product.muWeek, product.sigmaWeek, weeks, effectivePurchase, product.margin, rushProb, rushSave);
      const K = q * effectivePurchase * (1 + r * weeks / 52) + q * hold * weeks;
      const T = weeks / 52;
      const sigma = calculateVolatility(product.muWeek, product.sigmaWeek, weeks, q, rushProb, product.currency, product.supplier);
      const { optionValue } = blackScholesCall(S, K, T, sigma, r);
      data.push({ q, value: optionValue });
    }
    
    // Добавляем ключевые точки
    const keyPoints = [product.optQ, product.safety];
    keyPoints.forEach(keyPoint => {
      if (!data.find(point => Math.abs(point.q - keyPoint) < step / 2)) {
        const effectivePurchase = getEffectivePurchasePrice(product.purchase, keyPoint, product.volumeDiscounts);
        const S = calculateExpectedRevenueWrapper(keyPoint, product.muWeek, product.sigmaWeek, weeks, effectivePurchase, product.margin, rushProb, rushSave);
        const K = keyPoint * effectivePurchase * (1 + r * weeks / 52) + keyPoint * hold * weeks;
        const T = weeks / 52;
        const sigma = calculateVolatility(product.muWeek, product.sigmaWeek, weeks, keyPoint, rushProb, product.currency, product.supplier);
        const { optionValue } = blackScholesCall(S, K, T, sigma, r);
        data.push({ q: keyPoint, value: optionValue });
      }
    });
    
    return data.sort((a, b) => a.q - b.q);
  }, [product, maxUnits, weeks, rushProb, rushSave, hold, r, getEffectivePurchasePrice, calculateExpectedRevenueWrapper, calculateVolatility, blackScholesCall]);

  // Расчет метрик для калькулятора "Что если"
  const calcMetricsForQ = useCallback((q: number) => {
    if (!product) return {
      value: 0,
      investment: 0,
      storage: 0,
      revenue: 0,
      roi: 0
    };
    
    const effectivePurchase = getEffectivePurchasePrice(product.purchase, q, product.volumeDiscounts);
    const S = calculateExpectedRevenueWrapper(q, product.muWeek, product.sigmaWeek, weeks, effectivePurchase, product.margin, rushProb, rushSave);
    const K = q * effectivePurchase * (1 + r * weeks / 52) + q * hold * weeks;
    const T = weeks / 52;
    const sigma = calculateVolatility(product.muWeek, product.sigmaWeek, weeks, q, rushProb, product.currency, product.supplier);
    const { optionValue } = blackScholesCall(S, K, T, sigma, r);
    
    return {
      value: optionValue,
      investment: q * effectivePurchase,
      storage: q * hold * weeks,
      revenue: S,
      roi: q > 0 ? (optionValue / (q * effectivePurchase)) * 100 : 0
    };
  }, [product, weeks, rushProb, rushSave, hold, r, getEffectivePurchasePrice, calculateExpectedRevenueWrapper, calculateVolatility, blackScholesCall]);
  
  const currentMetrics = calcMetricsForQ(testQuantity);
  const optimalMetrics = calcMetricsForQ(product?.optQ || 0);

  // Тестовый блок: оценка себестоимости для партии 1171 шт из Китая
  const testChinaBatch = React.useMemo(() => {
    if (!product) return null as any;
    const qty = product.importUnitsPerBatch ?? 1171;
    const yuanPerUnit = product.importCnyPerUnit ?? 21; // 21 юань за единицу
    const kgTotal = product.importWeightKgPerBatch ?? 382; // общий вес партии, кг (с обрешеткой)
    const usdPerKg = product.importUsdPerKg ?? 3; // логистика $/кг
    const cnyToRub = (window as any)?.FX_CNY_RUB || 13; // временно из глобала/стора, ниже покажем актуальный
    const usdToRub = (window as any)?.FX_USD_RUB || 90; // временно
    const unitCostRub = yuanPerUnit * cnyToRub; // себестоимость за единицу в рублях
    const logisticsRubTotal = kgTotal * usdPerKg * usdToRub; // логистика на всю партию в рублях
    const logisticsPerUnitRub = logisticsRubTotal / qty;
    const fullUnitCostRub = unitCostRub + logisticsPerUnitRub;
    return {
      qty,
      unitCostRub,
      logisticsPerUnitRub,
      fullUnitCostRub,
      logisticsRubTotal
    };
  }, [product]);

  const annualRevenueRub = React.useMemo(() => {
    if (!product) return 0;
    const sales = (product as any)?.salesHistory as Array<{ date: string; revenue?: number }> | undefined;
    if (!sales || sales.length === 0) return product.revenue || 0;
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    let sum = 0;
    for (const s of sales) {
      const t = new Date(s.date).getTime();
      if (!isNaN(t) && t >= oneYearAgo.getTime() && t <= now.getTime()) {
        if (typeof s.revenue === 'number') sum += s.revenue;
      }
    }
    return sum || product.revenue || 0;
  }, [product]);

  // Консистентный расчет продаж и выручки за периоды из истории продаж (если есть)
  const periodStats = React.useMemo(() => {
    const fallback = { units30d: product?.sales30d || 0, revenue30d: product?.revenue30d || 0, units12m: product?.sales12m || 0, revenue12m: product?.revenue12m || 0 };
    if (!product) return fallback;
    const sales = (product as any)?.salesHistory as Array<{ date: string; units?: number; revenue?: number }>|undefined;
    if (!sales || sales.length === 0) return fallback;
    const now = new Date();
    const msDay = 24 * 60 * 60 * 1000;
    const start30d = now.getTime() - 30 * msDay;
    const start12m = now.getTime() - 365 * msDay;
    let u30 = 0, r30 = 0, u12 = 0, r12 = 0;
    for (const s of sales) {
      const t = new Date(s.date).getTime();
      if (isNaN(t)) continue;
      if (t >= start12m && t <= now.getTime()) {
        u12 += Math.max(0, Number((s as any).units || 0));
        if (typeof s.revenue === 'number') r12 += s.revenue;
      }
      if (t >= start30d && t <= now.getTime()) {
        u30 += Math.max(0, Number((s as any).units || 0));
        if (typeof s.revenue === 'number') r30 += s.revenue;
      }
    }
    return { units30d: u30, revenue30d: r30, units12m: u12, revenue12m: r12 };
  }, [product]);

  if (!product) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <p className="text-gray-500">Товар не найден. Выберите товар для анализа.</p>
        <button 
          onClick={() => setActiveTab('assortment')}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Перейти к ассортименту
        </button>
      </div>
    );
  }

  const badgeColor = product.optQ < product.safety && product.optValue > 0 ? "bg-yellow-500 text-white" : product.optValue > 0 ? "bg-green-500 text-white" : "bg-red-500 text-white";
  const frozenCapital = product.optQ * product.purchase;
  const fmt = formatNumber;

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Анализ товара: {product.name} ({product.sku})</h3>
        <div className="flex gap-2">
          <button 
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded border hover:bg-gray-50"
            onClick={async () => {
              try {
                const today = new Date().toISOString().split('T')[0];
                const cnyRes = await fetch(`/api/db-load?table=fx_rates&limit=1`, { headers: { Authorization: 'Bearer dummy' } }).catch(() => null);
                // Поскольку серверного токена нет в клиенте, просто дернем CBR напрямую
                const cbrCny = await fetch(`https://www.cbr-xml-daily.ru/daily_json.js`).then(r => r.json()).catch(() => null);
                const val = cbrCny?.Valute?.CNY;
                const usd = cbrCny?.Valute?.USD;
                if (val?.Value) (window as any).FX_CNY_RUB = val.Value / (val.Nominal || 1);
                if (usd?.Value) (window as any).FX_USD_RUB = usd.Value / (usd.Nominal || 1);
                toast.success('Курсы ЦБ обновлены для расчета тестовой партии');
              } catch {}
            }}
          >
            Обновить курсы ЦБ
          </button>
          <button 
            className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
            onClick={() => {
              editProduct(product);
              setActiveTab('assortment');
            }}
          >
            Редактировать параметры
          </button>
        </div>
      </div>
      
      {/* Основные характеристики товара */}
      <div className="mb-6">
        <h4 className="text-md font-semibold mb-3">Параметры товара</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-100 p-3 rounded">
            <div className="text-sm text-gray-500">Закупочная цена</div>
            <div className="text-lg font-bold">₽{fmtRub(product.purchase)}</div>
          </div>
          <div className="bg-gray-100 p-3 rounded">
            <div className="text-sm text-gray-500">Маржа</div>
            <div className="text-lg font-bold">₽{fmtRub(product.margin)}</div>
            <div className="text-xs text-gray-500">{product.purchase > 0 ? ((product.margin / product.purchase) * 100).toFixed(0) : '—'}% рентабельность</div>
          </div>
          <div className="bg-gray-100 p-3 rounded">
            <div className="text-sm text-gray-500">Спрос в неделю</div>
            <div className="text-lg font-bold">{fmt(product.muWeek)} ± {fmt(product.sigmaWeek)}</div>
            <div className="text-xs text-gray-500">CV: {product.muWeek > 0 ? ((product.sigmaWeek / product.muWeek) * 100).toFixed(0) : '—'}%</div>
          </div>
          <div className="bg-gray-100 p-3 rounded">
            <div className="text-sm text-gray-500">Годовая выручка</div>
            <div className="text-lg font-bold">₽{fmtRub(annualRevenueRub)}</div>
          </div>
        </div>
        
        {/* Розничная цена и продажи */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-gray-100 p-3 rounded">
            <div className="text-sm text-gray-500">Розничная цена (WB)</div>
            <div className="text-lg font-bold">{product.retailPrice ? `₽${fmtRub(product.retailPrice)}` : '—'}</div>
            {typeof product.discountPercent === 'number' && (
              <div className="text-xs text-gray-500">Скидка: {product.discountPercent}%</div>
            )}
          </div>
          <div className="bg-gray-100 p-3 rounded">
            <div className="text-sm text-gray-500">Продажи 30 дней</div>
            <div className="text-lg font-bold">{fmt(periodStats.units30d)} шт</div>
            <div className="text-xs text-gray-500">Выручка: ₽{fmtRub(periodStats.revenue30d)}</div>
          </div>
          <div className="bg-gray-100 p-3 rounded">
            <div className="text-sm text-gray-500">Продажи 12 мес</div>
            <div className="text-lg font-bold">{fmt(periodStats.units12m)} шт</div>
            <div className="text-xs text-gray-500">Выручка: ₽{fmtRub(periodStats.revenue12m)}</div>
          </div>
        </div>

        {/* Текущий запас и сезонность */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
            <div className="text-sm text-gray-600">Текущий запас на складе</div>
            <div className="text-lg font-bold text-blue-600">{fmt(product.currentStock || 0)} штук</div>
            {product.currentStock && product.currentStock > 0 && (
              <div className="text-xs text-gray-600 mt-1">
                Хватит на ~{Math.round((product.currentStock / product.muWeek))} недель
              </div>
            )}
          </div>
          <div className="bg-purple-50 p-3 rounded border-l-4 border-purple-500">
            <div className="text-sm text-gray-600">Сезонность спроса</div>
            <div className="text-lg font-bold text-purple-600">
              {product.seasonality?.enabled ? 'Включена' : 'Отключена'}
            </div>
            {product.seasonality?.enabled && (
              <div className="text-xs text-gray-600 mt-1">
                Текущий коэф.: {product.seasonality.monthlyFactors[product.seasonality.currentMonth].toFixed(1)}x
              </div>
            )}
          </div>
          <div className="bg-orange-50 p-3 rounded border-l-4 border-orange-500">
            <div className="text-sm text-gray-600">Цикл пополнения</div>
            <div className="text-lg font-bold text-orange-600">{product.procurementCycleWeeks ? `${product.procurementCycleWeeks.toFixed(1)} нед` : '—'}</div>
            {typeof product.reorderPoint === 'number' && (
              <div className="text-xs text-gray-600 mt-1">Точка заказа (ROP): {fmt(product.reorderPoint)} шт</div>
            )}
          </div>
        </div>

        {/* Разбивка остатков по складам WB */}
        {product.stockByWarehouse && Object.keys(product.stockByWarehouse).length > 0 && (
          <div className="mt-4">
            <h5 className="text-sm font-medium text-gray-600 mb-2">Остатки по складам WB:</h5>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(product.stockByWarehouse)
                .filter(([_, qty]) => Number(qty) > 0)
                .sort((a, b) => Number(b[1]) - Number(a[1]))
                .map(([warehouse, qty]) => (
                  <div key={warehouse} className="bg-gray-50 p-2 rounded text-xs">
                    <div className="font-medium">{warehouse}</div>
                    <div className="text-gray-600">{fmt(qty)} шт</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Анализ себестоимости (если есть данные из заказов Китая) */}
        <div className="mt-4 bg-green-50 border border-green-200 rounded p-3">
          <h5 className="text-sm font-medium text-green-800 mb-2">Анализ себестоимости:</h5>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-green-600 font-medium">Текущая себестоимость</div>
              <div className="text-green-800">₽{fmtRub(product.purchase)}</div>
            </div>
            <div>
              <div className="text-green-600 font-medium">Маржа за единицу</div>
              <div className="text-green-800">₽{fmtRub(product.margin)}</div>
            </div>
            <div>
              <div className="text-green-600 font-medium">Валюта/Поставщик</div>
              <div className="text-green-800">{product.currency || 'RUB'} / {product.supplier || 'Domestic'}</div>
            </div>
          </div>
          {testChinaBatch && (
          <div className="mt-3 p-2 bg-white border rounded text-xs text-green-800">
            <div className="font-semibold mb-1">Тестовая партия из Китая (для оценки)</div>
            <div>Количество: {testChinaBatch.qty} шт</div>
            <div>Себестоимость ({product?.importCnyPerUnit ?? 21} юань/шт): ₽{fmtRub(testChinaBatch.unitCostRub)} за шт</div>
            <div>Логистика ({product?.importUsdPerKg ?? 3} $/кг, {product?.importWeightKgPerBatch ?? 382} кг): всего ₽{fmtRub(testChinaBatch.logisticsRubTotal)} ≈ ₽{fmtRub(testChinaBatch.logisticsPerUnitRub)} за шт</div>
            <div className="font-medium">Итого ориентировочно: ₽{fmtRub(testChinaBatch.fullUnitCostRub)} за шт</div>
          </div>
          )}
        </div>
      </div>

      {/* Результаты оптимизации */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <h4 className="text-md font-semibold mb-4">Оптимальные параметры</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center justify-center bg-gray-100 p-3 rounded">
              <span className="text-xs text-gray-500 mb-1">Оптимальный заказ</span>
              <span className={`py-1 px-2 rounded-full text-lg font-bold ${badgeColor}`}>
                {fmt(product.optQ)} шт
              </span>
            </div>
            <div className="flex flex-col items-center justify-center bg-gray-100 p-3 rounded">
              <span className="text-xs text-gray-500 mb-1">Ценность опциона</span>
              <span className={`text-lg font-bold ${product.optValue > 0 ? 'text-green-600' : 'text-red-600'}`}>₽{fmtRub(product.optValue)}</span>
            </div>
            <div className="flex flex-col items-center justify-center bg-gray-100 p-3 rounded">
              <span className="text-xs text-gray-500 mb-1">Safety-stock</span>
              <span className="text-lg font-bold">{fmt(product.safety)} шт</span>
            </div>
            <div className="flex flex-col items-center justify-center bg-gray-100 p-3 rounded">
              <span className="text-xs text-gray-500 mb-1">Замороженный капитал</span>
              <span className="text-lg font-bold">₽{fmtRub(frozenCapital)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <h4 className="text-md font-semibold mb-2">Рекомендации</h4>
          {product.optValue <= 0 ? (
            <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700">
              <h5 className="font-semibold">Отрицательная ценность</h5>
              <p className="text-sm">Запасать товар невыгодно. Пересмотрите параметры.</p>
            </div>
          ) : product.optQ < product.safety ? (
            <div className="p-3 bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700">
              <h5 className="font-semibold">Внимание</h5>
              <p className="text-sm">Оптимальный запас ниже safety-stock. Риск дефицита.</p>
            </div>
          ) : (
            <div className="p-3 bg-green-50 border-l-4 border-green-500 text-green-700">
              <h5 className="font-semibold">Оптимальное решение</h5>
              <p className="text-sm">Запас {fmt(product.optQ)} шт максимизирует прибыль.</p>
            </div>
          )}
        </div>
      </div>

      {/* Калькулятор "Что если" */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <h4 className="text-md font-semibold mb-4">Калькулятор "Что если?"</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Если я закажу:</label>
            <input
              type="number"
              value={testQuantity}
              onChange={(e) => setTestQuantity(parseInt(e.target.value) || 0)}
              min="0"
              max={maxUnits}
              className="mt-1 w-full p-2 border border-gray-300 rounded font-bold text-lg"
            />
            <span className="text-xs text-gray-500">штук товара</span>
          </div>
          <div className={`p-3 rounded ${currentMetrics.value > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="text-sm text-gray-600">То заработаю:</div>
            <div className={`text-lg font-bold ${currentMetrics.value > 0 ? 'text-green-600' : 'text-red-600'}`}>₽{fmtRub(currentMetrics.value)}</div>
            <div className="text-xs text-gray-500">ROI: {currentMetrics.roi.toFixed(1)}%</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">Вложу денег:</div>
            <div className="text-lg font-bold">₽{fmtRub(currentMetrics.investment)}</div>
            <div className="text-xs text-gray-500">+ ₽{fmtRub(currentMetrics.storage)} хранение</div>
          </div>
          <div className="bg-blue-50 p-3 rounded">
            <div className="text-sm text-gray-600">Сравнение с оптимальным:</div>
            <div className={`text-lg font-bold ${currentMetrics.value >= optimalMetrics.value ? 'text-green-600' : 'text-orange-600'}`}>
              {currentMetrics.value >= optimalMetrics.value ? '✓ Оптимально' : `−₽${fmtRub(optimalMetrics.value - currentMetrics.value)}`}
            </div>
            <div className="text-xs text-gray-500">
              Оптимум: {product.optQ} шт
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <button 
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            onClick={() => {
              setTestQuantity(product.optQ);
              toast.success(`Установлено оптимальное количество: ${product.optQ} штук`);
            }}
          >
            💡 Применить оптимальное количество
          </button>
          <button 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={() => exportToCSV()}
          >
            📊 Экспортировать анализ
          </button>
        </div>
      </div>

      {/* Настройки Monte Carlo */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-md font-semibold">Настройки прогнозирования (Monte Carlo)</h4>
          <button 
            onClick={() => setMonteCarloParams(prev => ({ ...prev, showAdvanced: !prev.showAdvanced }))}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {monteCarloParams.showAdvanced ? 'Скрыть дополнительные' : 'Показать дополнительные'}
          </button>
        </div>
        
        <div className="text-sm text-gray-600 mb-4">
          Модель симулирует тысячи сценариев спроса для расчета ожидаемых продаж и потерь.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Количество симуляций
              <span className="ml-2 text-xs text-gray-500">
                (больше = точнее, но медленнее)
              </span>
            </label>
            <div className="flex space-x-2">
              <button
                onClick={() => setMonteCarloParams(prev => ({ ...prev, iterations: 100 }))}
                className={`px-3 py-1 rounded ${monteCarloParams.iterations === 100 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              >
                Быстро (100)
              </button>
              <button
                onClick={() => setMonteCarloParams(prev => ({ ...prev, iterations: 1000 }))}
                className={`px-3 py-1 rounded ${monteCarloParams.iterations === 1000 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              >
                Нормально (1,000)
              </button>
              <button
                onClick={() => setMonteCarloParams(prev => ({ ...prev, iterations: 5000 }))}
                className={`px-3 py-1 rounded ${monteCarloParams.iterations === 5000 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              >
                Точно (5,000)
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Текущие настройки
            </label>
            <div className="bg-gray-100 p-3 rounded text-sm">
              <div>Симуляций: <span className="font-bold">{monteCarloParams.iterations.toLocaleString()}</span></div>
              <div>Распределение спроса: <span className="font-bold">Нормальное</span></div>
              <div>Средний спрос за период: <span className="font-bold">{fmt(product.muWeek * weeks)}</span></div>
              <div>Станд. откл. за период: <span className="font-bold">{fmt(product.sigmaWeek * Math.sqrt(weeks))}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* График зависимости */}
      <div className="bg-white border rounded-lg p-4">
        <h4 className="text-md font-semibold mb-2">График анализа прибыльности</h4>
        <div className="text-sm text-gray-600 mb-4 space-y-1">
          <p>Показывает чистую прибыль при разных объемах заказа с учетом:</p>
          <ul className="list-disc list-inside ml-2 text-xs">
            <li>Выручки от продаж (обычных и экстренных)</li>
            <li>Минус: затраты на закупку товара</li>
            <li>Минус: затраты на хранение</li>
            <li>Минус: проценты на замороженный капитал</li>
          </ul>
        </div>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 40, bottom: 60 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="q"
                label={{ value: 'Количество заказа (штук)', position: 'insideBottom', offset: -10, style: { fontSize: 14 } }}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                label={{ value: 'Прибыль (₽)', angle: -90, position: 'insideLeft', style: { fontSize: 14 } }}
                tickFormatter={(value) => `₽${fmtRub(Number(value))}`}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value) => ['₽' + fmtRub(Number(value)), 'Прибыль']}
                labelFormatter={(value) => `При заказе ${value} шт`}
                contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              />
              
              <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} strokeDasharray="2 2" />
              
              <ReferenceLine 
                x={product.optQ} 
                stroke="#f59e0b" 
                strokeWidth={3}
                strokeDasharray="8 4"
              >
                <Label 
                  value={`Оптимум: ${fmt(product.optQ)} шт`} 
                  position="top" 
                  offset={15} 
                  style={{ 
                    fontSize: 14, 
                    fill: '#f59e0b', 
                    fontWeight: 'bold',
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    padding: '4px 8px',
                    borderRadius: '4px'
                  }} 
                />
              </ReferenceLine>
              
              <ReferenceLine 
                x={product.safety} 
                stroke="#3b82f6" 
                strokeWidth={2}
                strokeDasharray="4 4"
              >
                <Label 
                  value={`Мин. запас: ${fmt(product.safety)} шт`} 
                  position="bottom" 
                  offset={15} 
                  style={{ 
                    fontSize: 12, 
                    fill: '#3b82f6',
                    fontWeight: 'bold',
                    backgroundColor: 'rgba(255, 255, 255, 0.8)'
                  }} 
                />
              </ReferenceLine>
              
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#10b981" 
                strokeWidth={2}
                fill="url(#colorValue)"
                activeDot={{ r: 6, fill: '#10b981' }}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        {/* Легенда */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center space-x-3 p-3 bg-orange-50 rounded-lg">
            <div className="w-1 h-8 bg-orange-500 rounded"></div>
            <div>
              <div className="text-sm font-medium text-orange-900">Оптимальный заказ</div>
              <div className="text-lg font-bold text-orange-600">{fmt(product.optQ)} штук</div>
              <div className="text-xs text-orange-700">Макс. прибыль: ₽{fmtRub(product.optValue)}</div>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
            <div className="w-1 h-8 bg-blue-500 rounded"></div>
            <div>
              <div className="text-sm font-medium text-blue-900">Страховой запас</div>
              <div className="text-lg font-bold text-blue-600">{fmt(product.safety)} штук</div>
              <div className="text-xs text-blue-700">Для {(csl * 100).toFixed(0)}% доступности</div>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-red-50 rounded-lg">
            <div className="w-1 h-8 bg-red-500 rounded"></div>
            <div>
              <div className="text-sm font-medium text-red-900">Зона убытков</div>
              <div className="text-lg font-bold text-red-600">Ниже 0 ₽</div>
              <div className="text-xs text-red-700">Невыгодно закупать</div>
            </div>
          </div>
        </div>
      </div>

      {/* График сезонности если включена */}
      {product.seasonality?.enabled && (
        <div className="mt-6 p-4 bg-purple-50 border-l-4 border-purple-500 rounded-lg">
          <h5 className="font-semibold text-purple-800 mb-3">📈 Профиль сезонности спроса</h5>
          <div className="grid grid-cols-12 gap-1 mb-2">
            {['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'].map((month, index) => (
              <div key={index} className="text-center">
                <div className="text-xs text-gray-600 mb-1">{month}</div>
                <div 
                  className={`relative bg-purple-200 rounded-t transition-all duration-300 ${
                    index === product.seasonality!.currentMonth ? 'ring-2 ring-purple-600' : ''
                  }`}
                  style={{ 
                    height: `${Math.max(20, product.seasonality!.monthlyFactors[index] * 60)}px`,
                    backgroundColor: index === product.seasonality!.currentMonth ? '#7c3aed' : '#ddd6fe'
                  }}
                >
                  <span className="absolute -top-5 left-1/2 transform -translate-x-1/2 text-xs font-bold">
                    {product.seasonality!.monthlyFactors[index].toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-purple-700 mt-2">
            <span className="inline-block w-3 h-3 bg-purple-600 rounded mr-1"></span>
            Текущий месяц
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductAnalysisTab; 