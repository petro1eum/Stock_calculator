import React, { useState, useEffect, useCallback, useMemo } from "react";
import toast, { Toaster } from "react-hot-toast";
import SimpleLayout from "./components/SimpleLayout";
import SuppliesTab from './components/SuppliesTab';
import Dashboard from "./components/Dashboard";
import TheoryTab from "./components/TheoryTab";
import SettingsTab from "./components/SettingsTab";
import AssortmentTab from "./components/AssortmentTab";
import ProductAnalysisTab from "./components/ProductAnalysisTab";
import ExportImportTab from "./components/ExportImportTab";
import ABCAnalysisTab from "./components/ABCAnalysisTab";
import ScenariosTab from "./components/ScenariosTab";
import PortfolioSettingsTab from "./components/PortfolioSettingsTab";

// Импорт типов
import {
  ChartPoint,
  Product,
  ProductWithCategory,
  Scenario,
  MonteCarloParams,
  ProductForm
} from "./types";

// Импорт математических и расчетных функций
import {
  inverseNormal,
  blackScholesCall
} from "./utils/mathFunctions";

import {
  mcDemandLoss,
  getEffectivePurchasePrice,
  calculateExpectedRevenue,
  calculateVolatility,
  getAverageSeasonalDemand,
  optimizeQuantity
} from "./utils/inventoryCalculations";
import { updateProductsFromSales, updateProductsFromSalesAndStocks } from "./utils/inventoryCalculations";
import { calculateAdjustedLeadTime, calculateHistoricalLeadTime, calculateLandedCost } from "./utils/logisticsCalculations";

import { fetchCbrRateToRub } from "./utils/fx";

const InventoryOptionCalculator = () => {
  /* ----- входные значения ----- */
  const [maxUnits, setMaxUnits] = useState(3000); // диапазон q
  const [rushSave, setRushSave] = useState(3);    // $/шт экономия rush
  const [rushProb, setRushProb] = useState(0.2);  // вероятность rush
  const [hold, setHold] = useState(0.5);          // $/шт хранение
  const [r, setR] = useState(0.06);               // ставка капитала
  const [weeks, setWeeks] = useState(13);         // lead-time
  const [csl, setCsl] = useState(0.95);           // целевой CSL
  // Выбор склада (на старте только Wildberries)
  const [selectedWarehouse, setSelectedWarehouse] = useState<'wildberries'>('wildberries');

  /* ----- состояние для одного товара (для графика) ----- */
  const [purchase] = useState(8.5);  // $/шт закуп
  const [margin] = useState(15);       // $/шт маржа
  const [muWeek] = useState(800 / 13); // средн. спрос неделя
  const [sigmaWeek] = useState(0.35 * (800 / 13)); // σ спроса
  const [series, setSeries] = useState<ChartPoint[]>([]);
  const [calcMethodUsed, setCalcMethodUsed] = useState<'closed' | 'mc'>('closed');

  /* ----- ассортимент ----- */
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);

  // Вкладки (восстанавливаем последнюю открытую)
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try { return window.localStorage.getItem('activeTab') || 'dashboard'; } catch { }
    }
    return 'dashboard';
  });
  useEffect(() => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem('activeTab', activeTab); } catch { }
  }, [activeTab]);

  // Сценарный анализ
  const [scenarios] = useState<Scenario[]>([
    { name: "Пессимистичный", muWeekMultiplier: 0.7, sigmaWeekMultiplier: 1.3, probability: 0.25 },
    { name: "Базовый", muWeekMultiplier: 1.0, sigmaWeekMultiplier: 1.0, probability: 0.5 },
    { name: "Оптимистичный", muWeekMultiplier: 1.3, sigmaWeekMultiplier: 0.8, probability: 0.25 }
  ]);

  // Для графиков
  const [selectedProductId] = useState<number | null>(null);



  // Форма для добавления/редактирования продукта
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>({
    name: "",
    sku: "",
    purchase: 0,
    margin: 0,
    muWeek: 0,
    sigmaWeek: 0,
    shelfLife: 0,
    minOrderQty: 0,
    maxStorageQty: 0,
    volumeDiscounts: [],
    currentStock: 0,
    seasonality: {
      enabled: false,
      monthlyFactors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      currentMonth: new Date().getMonth()
    },
    currency: 'RUB',
    supplier: 'domestic',
    category: '',
    volume: undefined
  });

  // Состояние для параметров Monte Carlo
  const [monteCarloParams, setMonteCarloParams] = useState<MonteCarloParams>(() => {
    let savedMethod: 'closed' | 'mc' | null = null;
    try {
      if (typeof window !== 'undefined') {
        const v = window.localStorage.getItem('calcMethod');
        if (v === 'closed' || v === 'mc') savedMethod = v;
      }
    } catch { }
    return {
      iterations: 1000,
      showAdvanced: false,
      confidenceLevel: 0.95,
      randomSeed: null,
      method: savedMethod ?? 'closed'
    };
  });

  // Сохраняем выбор метода в localStorage
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('calcMethod', monteCarloParams.method ?? 'closed');
      }
    } catch { }
  }, [monteCarloParams.method]);



  // Демо данные
  const demoProducts = useMemo((): Product[] => [
    {
      id: 1, name: "iPhone 15 Case", sku: "SKU001", purchase: 7.5, margin: 18,
      muWeek: 75, sigmaWeek: 25, revenue: 0, optQ: 0, optValue: 0, safety: 0,
      currency: 'USD', supplier: 'china', category: 'Электроника', volume: 0.001,
      importCnyPerUnit: 21, importUnitsPerBatch: 1171, importWeightKgPerBatch: 382, importUsdPerKg: 3
    },
    {
      id: 2, name: "Samsung TV 55\"", sku: "SKU002", purchase: 12.0, margin: 22,
      muWeek: 55, sigmaWeek: 18, revenue: 0, optQ: 0, optValue: 0, safety: 0,
      currency: 'EUR', supplier: 'europe', category: 'Электроника', volume: 0.15,
      importCnyPerUnit: 21, importUnitsPerBatch: 1171, importWeightKgPerBatch: 382, importUsdPerKg: 3
    },
    {
      id: 3, name: "Футболка Uniqlo", sku: "SKU003", purchase: 4.2, margin: 8.5,
      muWeek: 130, sigmaWeek: 45, revenue: 0, optQ: 0, optValue: 0, safety: 0,
      currency: 'CNY', supplier: 'china', category: 'Одежда', volume: 0.002,
      seasonality: {
        enabled: true,
        monthlyFactors: [0.5, 0.5, 0.8, 1.2, 1.5, 2.0, 2.0, 1.8, 1.2, 0.8, 0.5, 0.5],
        currentMonth: new Date().getMonth()
      },
      importCnyPerUnit: 21, importUnitsPerBatch: 1171, importWeightKgPerBatch: 382, importUsdPerKg: 3
    },
    {
      id: 4, name: "Кофемашина DeLonghi", sku: "SKU004", purchase: 18.5, margin: 35,
      muWeek: 25, sigmaWeek: 10, revenue: 0, optQ: 0, optValue: 0, safety: 0,
      currency: 'RUB', supplier: 'domestic', category: 'Бытовая техника', volume: 0.05,
      importCnyPerUnit: 21, importUnitsPerBatch: 1171, importWeightKgPerBatch: 382, importUsdPerKg: 3
    },
    {
      id: 5, name: "Наушники Sony WH-1000XM5", sku: "SKU005", purchase: 5.0, margin: 12,
      muWeek: 95, sigmaWeek: 30, revenue: 0, optQ: 0, optValue: 0, safety: 0,
      currency: 'USD', supplier: 'usa', category: 'Электроника', volume: 0.003,
      minOrderQty: 10, maxStorageQty: 500,
      importCnyPerUnit: 26, importUnitsPerBatch: 1171, importWeightKgPerBatch: 382, importUsdPerKg: 3
    },
  ], []);

  // ABC-анализ ассортимента
  const abcAnalysis = useCallback((items: Product[]): ProductWithCategory[] => {
    if (!items || items.length === 0) return [];

    const sortedItems = [...items].sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = sortedItems.reduce((sum, item) => sum + item.revenue, 0);
    let accumulatedPercent = 0;

    return sortedItems.map(item => {
      const percent = item.revenue / totalRevenue;
      accumulatedPercent += percent;

      let category: 'A' | 'B' | 'C';
      if (accumulatedPercent <= 0.8) {
        category = 'A';
      } else if (accumulatedPercent <= 0.95) {
        category = 'B';
      } else {
        category = 'C';
      }

      return { ...item, category, percent, accumPercent: accumulatedPercent };
    });
  }, []);

  // Обертка для mcDemandLoss с параметрами
  const mcDemandLossWrapper = useCallback((units: number, muWeek: number, sigmaWeek: number, weeks: number) => {
    return mcDemandLoss(units, muWeek, sigmaWeek, weeks, monteCarloParams);
  }, [monteCarloParams]);

  // Обертка для calculateExpectedRevenue
  const calculateExpectedRevenueWrapper = useCallback((
    q: number, muWeek: number, sigmaWeek: number, weeks: number,
    purchase: number, margin: number, rushProb: number, rushSave: number
  ) => {
    return calculateExpectedRevenue(q, muWeek, sigmaWeek, weeks, purchase, margin, rushProb, rushSave, mcDemandLossWrapper, monteCarloParams);
  }, [mcDemandLossWrapper, monteCarloParams]);

  // Расчет оптимальных параметров для текущего товара
  useEffect(() => {
    console.log('Пересчет оптимальных параметров. Monte Carlo итераций:', monteCarloParams.iterations);

    const z = inverseNormal(csl);
    const calculatedSafety = Math.ceil(z * sigmaWeek * Math.sqrt(weeks));

    const step = Math.max(1, Math.round(muWeek / 10));
    const evaluateQ = (q: number) => {
      const S = calculateExpectedRevenueWrapper(q, muWeek, sigmaWeek, weeks, purchase, margin, rushProb, rushSave);
      const K = q * purchase * (1 + r * weeks / 52) + q * hold * weeks;
      const T = weeks / 52;
      const sigma = calculateVolatility(muWeek, sigmaWeek, weeks, q, rushProb);
      const { optionValue } = blackScholesCall(S, K, T, sigma, r);
      return optionValue;
    };
    const { bestQ, bestValue: bestNet } = optimizeQuantity(0, maxUnits, step, evaluateQ);
    const pts = [] as { q: number; value: number }[];
    for (let q = 0; q <= maxUnits; q += step) {
      pts.push({ q, value: evaluateQ(q) });
    }
    // Эти значения не используются нигде в приложении, поэтому просто логируем для отладки
    // Фиксируем, какой метод был применен фактически
    const expectedDemand = muWeek * weeks;
    const demandStd = sigmaWeek * Math.sqrt(weeks);
    const cv = expectedDemand > 0 ? demandStd / expectedDemand : 0;
    const method = (monteCarloParams.method === 'mc' || (monteCarloParams.method === 'auto' && cv > 1.0)) ? 'mc' : 'closed';
    setCalcMethodUsed(method);
    console.log('Оптимальные параметры: Q =', bestQ, ', Value =', bestNet, ', Safety =', calculatedSafety, ', Method =', method);
    console.log('Оптимальные параметры: Q =', bestQ, ', Value =', bestNet, ', Safety =', calculatedSafety);
    setSeries(pts);
  }, [maxUnits, purchase, margin, rushSave, rushProb, hold, r, weeks, muWeek, sigmaWeek, csl, calculateExpectedRevenueWrapper, monteCarloParams]);

  // Расчет оптимальных параметров для всего ассортимента
  const productsWithMetrics = useMemo(() => {
    console.log('Пересчет productsWithMetrics. Monte Carlo итераций:', monteCarloParams.iterations);

    return products.map(product => {
      const z = inverseNormal(csl);

      // Используем средний сезонный спрос для расчетов
      const seasonalMuWeek = getAverageSeasonalDemand(product.muWeek, product.seasonality, weeks);
      const productSafety = Math.ceil(z * product.sigmaWeek * Math.sqrt(weeks));

      const step = Math.max(1, Math.round(seasonalMuWeek / 10));
      const minQ = product.minOrderQty || 0;
      const maxQ = product.maxStorageQty ? Math.min(maxUnits, product.maxStorageQty) : maxUnits;

      let effectiveWeeks = weeks;
      if (product.shelfLife && product.shelfLife > 0) {
        effectiveWeeks = Math.min(weeks, product.shelfLife);
      }
      const currentStock = product.currentStock || 0;
      const evaluateQ2 = (q: number) => {
        const effectivePurchase = getEffectivePurchasePrice(product.purchase, q, product.volumeDiscounts);
        const totalInventory = q + currentStock;
        const S = calculateExpectedRevenueWrapper(totalInventory, seasonalMuWeek, product.sigmaWeek, effectiveWeeks, effectivePurchase, product.margin, rushProb, rushSave);
        const K = q * effectivePurchase * (1 + r * effectiveWeeks / 52) + q * hold * effectiveWeeks;
        const T = effectiveWeeks / 52;
        const sigma = calculateVolatility(seasonalMuWeek, product.sigmaWeek, effectiveWeeks, totalInventory, rushProb, product.currency, product.supplier);
        const { optionValue } = blackScholesCall(S, K, T, sigma, r);
        return optionValue;
      };
      let { bestQ, bestValue: bestNet } = optimizeQuantity(minQ, maxQ, step, evaluateQ2);

      if (product.minOrderQty && bestQ < product.minOrderQty) {
        bestQ = product.minOrderQty;
      }

      return {
        ...product,
        optQ: bestQ,
        optValue: bestNet,
        safety: productSafety
      };
    });
  }, [products, rushSave, rushProb, hold, r, weeks, csl, maxUnits, calculateExpectedRevenueWrapper, monteCarloParams]);

  // ABC-анализ с использованием продуктов с рассчитанными метриками  
  const abcAnalysisResult = useMemo(() => {
    return abcAnalysis(productsWithMetrics);
  }, [productsWithMetrics, abcAnalysis]);

  // Функции управления продуктами
  const generateNextId = useCallback(() => {
    if (products.length === 0) return 1;
    return Math.max(...products.map(p => p.id)) + 1;
  }, [products]);

  const generateNextSku = useCallback(() => {
    const existingSkus = products.map(p => p.sku);
    let counter = 1;
    let newSku;
    do {
      newSku = `SKU${counter.toString().padStart(3, '0')}`;
      counter++;
    } while (existingSkus.includes(newSku));
    return newSku;
  }, [products]);

  const loadDemoData = useCallback(() => {
    const productsWithRevenue = demoProducts.map(product => ({
      ...product,
      revenue: product.muWeek * (product.purchase + product.margin) * 52
    }));
    setProducts(productsWithRevenue);
  }, [demoProducts]);

  const clearAllProducts = useCallback(() => {
    setProducts([]);
    setSelectedProduct(null);
  }, []);

  const addProduct = useCallback(() => {
    if (!productForm.name.trim() || !productForm.sku.trim()) {
      toast.error('Пожалуйста, заполните название и SKU товара');
      return;
    }

    const existingSku = products.find(p => p.sku === productForm.sku && p.id !== editingProductId);
    if (existingSku) {
      toast.error('SKU уже существует. Используйте другой SKU.');
      return;
    }

    const validationErrors: string[] = [];

    if (productForm.purchase <= 0) {
      validationErrors.push('Закупочная цена должна быть положительной');
    }

    if (productForm.margin <= 0) {
      validationErrors.push('Маржа должна быть положительной');
    }

    const marginRate = productForm.margin / productForm.purchase;
    if (marginRate < 0.1 && productForm.purchase > 0) {
      validationErrors.push('Слишком низкая рентабельность (< 10%)');
    }

    if (productForm.muWeek <= 0) {
      validationErrors.push('Средний спрос должен быть положительным');
    }

    if (productForm.sigmaWeek < 0) {
      validationErrors.push('Стандартное отклонение не может быть отрицательным');
    }

    if (productForm.muWeek > 0) {
      const cv = productForm.sigmaWeek / productForm.muWeek;
      if (cv > 2) {
        validationErrors.push('Слишком высокая волатильность спроса (CV > 200%)');
      }
    }

    if (validationErrors.length > 0) {
      toast.error('Ошибки валидации:\n' + validationErrors.join('\n'));
      return;
    }

    const newProduct: Product = {
      id: editingProductId || generateNextId(),
      name: productForm.name,
      sku: productForm.sku,
      purchase: productForm.purchase,
      margin: productForm.margin,
      muWeek: productForm.muWeek,
      sigmaWeek: productForm.sigmaWeek,
      revenue: productForm.muWeek * (productForm.purchase + productForm.margin) * 52,
      optQ: 0,
      optValue: 0,
      safety: 0,
      shelfLife: productForm.shelfLife || undefined,
      minOrderQty: productForm.minOrderQty || undefined,
      maxStorageQty: productForm.maxStorageQty || undefined,
      volumeDiscounts: productForm.volumeDiscounts.length > 0 ? productForm.volumeDiscounts : undefined,
      currentStock: productForm.currentStock || 0,
      seasonality: productForm.seasonality,
      currency: productForm.currency,
      supplier: productForm.supplier,
      category: productForm.category,
      volume: productForm.volume
    };

    if (editingProductId) {
      setProducts(prev => prev.map(p => p.id === editingProductId ? newProduct : p));
      toast.success('Товар успешно обновлен');
    } else {
      setProducts(prev => [...prev, newProduct]);
      toast.success('Товар успешно добавлен');
    }

    // Reset form
    setProductForm({
      name: "",
      sku: generateNextSku(),
      purchase: 0,
      margin: 0,
      muWeek: 0,
      sigmaWeek: 0,
      shelfLife: 0,
      minOrderQty: 0,
      maxStorageQty: 0,
      volumeDiscounts: [],
      currentStock: 0,
      seasonality: {
        enabled: false,
        monthlyFactors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        currentMonth: new Date().getMonth()
      },
      currency: 'RUB',
      supplier: 'domestic',
      category: '',
      volume: undefined
    });
    setEditingProductId(null);
    setShowProductForm(false);
  }, [productForm, products, editingProductId, generateNextId, generateNextSku]);

  const editProduct = useCallback((product: Product) => {
    setProductForm({
      name: product.name,
      sku: product.sku,
      purchase: product.purchase,
      margin: product.margin,
      muWeek: product.muWeek,
      sigmaWeek: product.sigmaWeek,
      shelfLife: product.shelfLife || 0,
      minOrderQty: product.minOrderQty || 0,
      maxStorageQty: product.maxStorageQty || 0,
      volumeDiscounts: product.volumeDiscounts || [],
      currentStock: product.currentStock || 0,
      seasonality: product.seasonality || {
        enabled: false,
        monthlyFactors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        currentMonth: new Date().getMonth()
      },
      currency: product.currency || 'RUB',
      supplier: product.supplier || 'domestic',
      category: product.category || '',
      volume: product.volume
    });
    setEditingProductId(product.id);
    setShowProductForm(true);
  }, []);

  const deleteProduct = useCallback((productId: number) => {
    if (window.confirm('Вы уверены, что хотите удалить этот товар?')) {
      setProducts(prev => prev.filter(p => p.id !== productId));
      if (selectedProduct === productId) {
        setSelectedProduct(null);
      }
      toast.success('Товар успешно удален');
    }
  }, [selectedProduct]);

  const selectProductForAnalysis = useCallback((product: Product) => {
    setSelectedProduct(product.id);
    setActiveTab("productAnalysis");
  }, []);

  // Инициализация формы при изменении списка продуктов
  useEffect(() => {
    if (!showProductForm && !editingProductId) {
      setProductForm(prev => ({
        ...prev,
        sku: generateNextSku()
      }));
    }
  }, [products, showProductForm, editingProductId, generateNextSku]);


  // Автозагрузка данных из БД (если пользователь авторизован и локальный список пуст)
  useEffect(() => {
    const hydrateFromDb = async () => {
      try {
        if (products.length > 0) return;

        const loadLocal = (key: string) => { const s = localStorage.getItem(key); return s ? JSON.parse(s) : []; };

        // 1) Остатки -> currentStock, разрез по складам и автосоздание карточек
        const stocks = loadLocal('wb_stocks');
        stocks.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        if (!stocks || stocks.length === 0) return;

        const totals = new Map<string, number>();
        const stockHistory: Array<{ sku: string; date: string; quantity: number }> = [];
        const subjBySku = new Map<string, string>();
        const nameBySku = new Map<string, string>();
        let priceSnapshot: Map<string, { price?: number; discounted?: number; discount?: number; vendor?: string }> | null = null;
        const byWarehouseLatest = new Map<string, Map<string, { qty: number; date: number }>>(); // sku -> wh -> {qty, ts}
        // Нормализация названий складов WB
        const normalizeWarehouse = (w?: string | null) => {
          let s = (w && String(w).trim()) ? String(w).trim() : 'UNKNOWN';
          const l = s.toLowerCase();
          if (l.includes('коледин')) return 'Коледино';
          if (l.includes('новосемейкин') || l.includes('новосемейкино')) return 'Самара (Новосемейкино)';
          if (l.includes('санкт') && l.includes('уткина')) return 'Санкт-Петербург Уткина Заводь';
          if (l.includes('виртуальный') && l.includes('краснодар')) return 'Виртуальный Краснодар';
          if (l.includes('сц ') && l.includes('ереван')) return 'СЦ Ереван';
          if (l.includes('рязан') && l.includes('тюшев')) return 'Рязань (Тюшевское)';
          if (l.includes('екатеринбург') && l.includes('испыт')) return 'Екатеринбург - Испытателей 14г';
          if (l.includes('екатеринбург') && l.includes('перспектив')) return 'Екатеринбург - Перспективный 12';
          if (l.includes('чашников')) return 'Чашниково';
          if (l.includes('обухов')) return 'Обухово';
          if (l.includes('котовск')) return 'Котовск';
          if (l.includes('волгоград')) return 'Волгоград';
          if (l.includes('череповец')) return 'Череповец';
          if (l.includes('раду')) return 'Радумля 1';
          if (l.includes('тула')) return 'Тула';
          if (l.includes('иванов')) return 'Иваново';
          if (l.includes('краснодар')) return 'Краснодар';
          if (l.includes('казан')) return 'Казань';
          if (l.includes('электрост')) return 'Электросталь';
          if (l.includes('невинномыс')) return 'Невинномысск';
          if (l.includes('новосибир')) return 'Новосибирск';
          return s;
        };

        (stocks || []).forEach((r: any) => {
          const sku = String(r.sku);
          const qty = Number(r.quantity || 0);
          const ts = new Date(r.date).getTime() || 0;
          stockHistory.push({ sku, date: (r.date || '').split('T')[0] + 'T00:00:00Z', quantity: qty });
          const subj = typeof r.raw?.subject === 'string' ? r.raw.subject : undefined;
          // Название берем строго из vendorCode / supplierArticle. Никаких raw.name
          const name = typeof r.raw?.vendorCode === 'string' ? r.raw.vendorCode
            : (typeof r.raw?.supplierArticle === 'string' ? r.raw.supplierArticle : undefined);
          if (subj && !subjBySku.has(sku)) subjBySku.set(sku, subj);
          if (name && !nameBySku.has(sku)) nameBySku.set(sku, name);
          const whRaw = (r.warehouse || r.raw?.warehouseName || 'Склад WB').toString();
          const wh = normalizeWarehouse(whRaw);
          if (!byWarehouseLatest.has(sku)) byWarehouseLatest.set(sku, new Map());
          const m = byWarehouseLatest.get(sku)!;
          const prev = m.get(wh);
          if (!prev || ts >= prev.date) {
            m.set(wh, { qty, date: ts });
          }
        });

        // Суммируем по последним записям для каждого склада
        byWarehouseLatest.forEach((m, sku) => {
          let sum = 0;
          m.forEach(v => { sum += v.qty; });
          totals.set(sku, sum);
        });

        // DEBUG: проверка остатков по конкретному SKU
        try {
          const debugSku = 'EXAMPLE_SKU_1';
          if (byWarehouseLatest.has(debugSku)) {
            const m = byWarehouseLatest.get(debugSku)!;
            const rows: any[] = [];
            m.forEach((v, wh) => rows.push({ warehouse: wh, qty: v.qty, ts: new Date(v.date).toISOString() }));
            const total = rows.reduce((s, r) => s + (r.qty || 0), 0);
            // eslint-disable-next-line no-console
            console.table(rows);
            // eslint-disable-next-line no-console
            console.log(`WB stocks debug for ${debugSku} total=${total}`);
          }
        } catch { }

        const baseSeasonality = { enabled: false, monthlyFactors: Array(12).fill(1), currentMonth: new Date().getMonth() } as any;
        let initialProducts: Product[] = Array.from(totals.keys()).map((sku, idx) => ({
          id: idx + 1,
          name: nameBySku.get(sku) || sku,
          sku,
          purchase: 0,
          margin: 0,
          muWeek: 0,
          sigmaWeek: 0,
          revenue: 0,
          optQ: 0,
          optValue: 0,
          safety: 0,
          currentStock: totals.get(sku) || 0,
          stockByWarehouse: (() => {
            const m = byWarehouseLatest.get(sku) || new Map<string, { qty: number; date: number }>();
            const obj: Record<string, number> = {};
            m.forEach((v, k) => { obj[k] = v.qty; });
            return obj;
          })(),
          seasonality: baseSeasonality,
          currency: 'RUB',
          supplier: 'domestic',
          category: subjBySku.get(sku) || ''
        }));

        // 2) Обогащение названий/категорий из цен/аналитики WB
        try {
          const prices = loadLocal('wb_prices');
          const byNm = new Map<string, { price?: number; discounted?: number; discount?: number; vendor?: string }>();
          (prices || []).forEach((p: any) => {
            const sku = String(p.nm_id);
            // Название строго vendorCode -> supplierArticle
            const vendor = typeof p.raw?.vendorCode === 'string' ? p.raw.vendorCode : (typeof p.raw?.supplierArticle === 'string' ? p.raw.supplierArticle : undefined);
            const cur = byNm.get(sku) || {};
            cur.price = p.price ?? cur.price;
            cur.discounted = p.discounted_price ?? cur.discounted;
            cur.discount = p.discount ?? cur.discount;
            cur.vendor = cur.vendor || vendor;
            byNm.set(sku, cur);
            if (vendor && !nameBySku.has(sku)) nameBySku.set(sku, vendor);
          });
          // применим к initialProducts позже
          priceSnapshot = byNm;
        } catch { }
        try {
          const an = loadLocal('wb_analytics');
          (an || []).forEach((a: any) => {
            const sku = String(a.nm_id);
            // Название строго vendorCode -> supplierArticle
            const vendor = typeof a.raw?.vendorCode === 'string' ? a.raw.vendorCode : (typeof a.raw?.supplierArticle === 'string' ? a.raw.supplierArticle : undefined);
            const cat = typeof a.raw?.object?.name === 'string' ? a.raw.object.name : undefined;
            if (vendor && !nameBySku.has(sku)) nameBySku.set(sku, vendor);
            if (cat) subjBySku.set(sku, cat);
          });
        } catch { }

        // 3) Продажи -> пересчет mu/sigma и метрик + дозаказ названий из supplierArticle
        const sales = loadLocal('wb_sales');
        if ((sales || []).length > 0) {
          const salesRecords = (sales || []).map((r: any) => ({
            date: r.date,
            sku: String(r.sku),
            units: Number(r.units || 0),
            revenue: typeof r.revenue === 'number' ? r.revenue : undefined
          }));
          // добираем названия
          (sales || []).forEach((r: any) => {
            const sku = String(r.sku);
            // Название строго supplierArticle (если есть)
            const vendor = typeof r.raw?.supplierArticle === 'string' ? r.raw.supplierArticle : undefined;
            const subj = typeof r.raw?.subject === 'string' ? r.raw.subject : undefined;
            if (vendor && !nameBySku.has(sku)) nameBySku.set(sku, vendor);
            if (subj && !subjBySku.has(sku)) subjBySku.set(sku, subj);
          });
          if (stockHistory.length > 0) {
            initialProducts = updateProductsFromSalesAndStocks(initialProducts, salesRecords, stockHistory as any, { weeksWindow: 26 });
          } else {
            initialProducts = updateProductsFromSales(initialProducts, salesRecords, { weeksWindow: 26 });
          }
        }

        // Применим цены и краткий анализ продаж (30 дней)
        if (initialProducts.length > 0) {
          // цены
          // Всегда применяем имя: vendorCode -> supplierArticle -> name -> sku
          // Принцип: если имя уже установлено — не трогаем. Иначе присваиваем vendorCode/supplierArticle; если нет — оставляем sku как fallback.
          initialProducts = initialProducts.map(p => ({ ...p, name: p.name && p.name !== p.sku ? p.name : (nameBySku.get(p.sku) || p.sku) }));
          // Категория из subject/object.name
          initialProducts = initialProducts.map(p => ({ ...p, category: subjBySku.get(p.sku) || p.category || '' }));
          // Цены (если есть)
          if (priceSnapshot) {
            initialProducts = initialProducts.map(p => {
              const pr = priceSnapshot!.get(p.sku);
              return pr ? { ...p, retailPrice: pr.discounted ?? pr.price, discountPercent: pr.discount } : p;
            });
          }

          // Подтянем затраты по SKU из wb_costs (самые свежие) и обновим purchase
          try {
            const costs = loadLocal('wb_costs').sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const latestBySku = new Map<string, any>();
            (costs || []).forEach((r: any) => { latestBySku.set(String(r.sku), r); });
            initialProducts = await Promise.all(initialProducts.map(async (p) => {
              const c = latestBySku.get(p.sku);
              if (!c) return p;
              const dateISO = c.date || new Date().toISOString();
              const purchCur = (c.purchase_currency || 'RUB').toUpperCase();
              const logCur = (c.logistics_currency || purchCur).toUpperCase();
              let fxPurch = typeof c.fx_rate === 'number' ? c.fx_rate : null;
              if (!fxPurch && purchCur !== 'RUB') fxPurch = await fetchCbrRateToRub(purchCur, dateISO) || null;
              const purchRub = typeof c.purchase_amount === 'number' ? (purchCur === 'RUB' ? c.purchase_amount : (fxPurch ? c.purchase_amount * fxPurch : null)) : null;
              let fxLog = purchCur === logCur ? fxPurch : null;
              if (!fxLog && logCur !== 'RUB') fxLog = await fetchCbrRateToRub(logCur, dateISO) || null;
              const logRub = typeof c.logistics_amount === 'number' ? (logCur === 'RUB' ? c.logistics_amount : (fxLog ? c.logistics_amount * fxLog : null)) : null;
              const newPurchase = (typeof purchRub === 'number' ? purchRub : p.purchase) + (typeof logRub === 'number' ? logRub : 0);
              const hasRetail = typeof p.retailPrice === 'number' && p.retailPrice! > 0;
              const margin = hasRetail ? Math.max(0, Number(p.retailPrice) - Number(newPurchase)) : p.margin;
              return { ...p, purchase: newPurchase, margin };
            }));
          } catch { }
          // Пересчитаем маржу как (розничная цена - себестоимость), если обе известны (fallback)
          initialProducts = initialProducts.map(p => {
            const hasRetail = typeof p.retailPrice === 'number' && p.retailPrice! > 0;
            const hasPurchase = typeof p.purchase === 'number' && p.purchase! > 0;
            const m = hasRetail && hasPurchase ? Math.max(0, Number(p.retailPrice) - Number(p.purchase)) : p.margin;
            return { ...p, margin: m };
          });
          // анализ продаж уже учтен при пересчете, но отдельно посчитаем 30д если есть sales в БД
          try {
            const since = new Date(); since.setDate(since.getDate() - 30);
            const sales30 = loadLocal('wb_sales').filter((r: any) => new Date(r.date) >= since);
            const agg = new Map<string, { units: number; revenue: number }>();
            (sales30 || []).forEach((r: any) => {
              const sku = String(r.sku);
              const cur = agg.get(sku) || { units: 0, revenue: 0 };
              cur.units += Number(r.units || 0);
              cur.revenue += Number(r.revenue || 0);
              agg.set(sku, cur);
            });
            initialProducts = initialProducts.map(p => {
              const s = agg.get(p.sku);
              return s ? { ...p, sales30d: s.units, revenue30d: s.revenue } : p;
            });
          } catch { }
          // 12 месяцев
          try {
            const since12 = new Date(); since12.setFullYear(since12.getFullYear() - 1);
            const sales12 = loadLocal('wb_sales').filter((r: any) => new Date(r.date) >= since12);
            const agg12 = new Map<string, { units: number; revenue: number }>();
            (sales12 || []).forEach((r: any) => {
              const sku = String(r.sku);
              const cur = agg12.get(sku) || { units: 0, revenue: 0 };
              cur.units += Number(r.units || 0);
              cur.revenue += Number(r.revenue || 0);
              agg12.set(sku, cur);
            });
            initialProducts = initialProducts.map(p => {
              const s = agg12.get(p.sku);
              return s ? { ...p, sales12m: s.units, revenue12m: s.revenue } : p;
            });
          } catch { }
          // анализ поставок — цикл пополнения и ROP с учетом рисков
          try {
            const purchases = loadLocal('wb_purchases').sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const ordersRaw = loadLocal('wb_purchase_orders');
            const itemsRaw = loadLocal('wb_purchase_order_items');

            const itemsByOrder = new Map<string, any[]>();
            (itemsRaw || []).forEach((it: any) => {
              if (!itemsByOrder.has(it.po_id)) itemsByOrder.set(it.po_id, []);
              itemsByOrder.get(it.po_id)!.push({ sku: it.sku, qty: it.qty, unit_cost: it.unit_cost, warehouse_target: it.warehouse_target });
            });

            const purchaseOrders = (ordersRaw || []).map((o: any) => ({
              ...o,
              items: itemsByOrder.get(o.id) || []
            }));

            const logisticsEvents = loadLocal('logistics_calendar');

            // Базовый анализ интервалов поставок WB
            const bySku = new Map<string, Array<Date>>();
            (purchases || []).forEach((r: any) => {
              const sku = String(r.sku);
              const d = new Date(r.date);
              if (!bySku.has(sku)) bySku.set(sku, []);
              bySku.get(sku)!.push(d);
            });

            const baseReplenishment = new Map<string, number>();
            bySku.forEach((dates, sku) => {
              if (dates.length < 2) return;
              let sum = 0; let cnt = 0;
              for (let i = 1; i < dates.length; i++) { sum += (dates[i].getTime() - dates[i - 1].getTime()); cnt++; }
              const avgMs = sum / cnt;
              const weeks = Math.max(1, Math.round(avgMs / (7 * 24 * 3600 * 1000)));
              baseReplenishment.set(sku, weeks);
            });

            // Обогащение данных с учетом заказов из Китая и рисков
            initialProducts = initialProducts.map(p => {
              // Базовый lead time из интервалов WB
              const baseLt = baseReplenishment.get(p.sku) ?? 0;

              // Исторический lead time из сопоставления заказов Китай → приемки WB
              const historicalLt = calculateHistoricalLeadTime(
                purchaseOrders || [],
                purchases || [],
                p.sku
              );

              // Берем лучший из доступных lead time
              const bestLt = historicalLt > 0 ? historicalLt : baseLt;

              // Корректируем с учетом календаря рисков
              const adjustedLt = calculateAdjustedLeadTime(
                bestLt,
                'China', // предполагаем, что большинство заказов из Китая
                logisticsEvents || []
              );

              // Себестоимость с учетом логистики
              const landedCost = calculateLandedCost(
                p.sku,
                purchaseOrders || [],
                purchases || []
              );

              // ROP = demand_per_week * adjusted_lead_time_weeks + safety
              const rop = Math.round((p.muWeek || 0) * adjustedLt + (p.safety || 0));

              const updates: Partial<Product> = {};
              if (adjustedLt > 0) {
                updates.procurementCycleWeeks = adjustedLt;
                updates.reorderPoint = rop;
              }
              if (landedCost.landedCost > 0) {
                updates.purchase = landedCost.landedCost; // обновляем себестоимость
              }

              return Object.keys(updates).length > 0 ? { ...p, ...updates } : p;
            });
          } catch (error) {
            console.warn('Ошибка анализа поставок:', error);
          }

          setProducts(initialProducts);
        }
      } catch { }
    };
    void hydrateFromDb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Функции экспорта/импорта
  const exportToCSV = useCallback(() => {
    if (products.length === 0) {
      toast.error('Нет данных для экспорта');
      return;
    }

    const headers = ['SKU', 'Название', 'Закупочная цена', 'Маржа', 'Средний спрос/нед', 'Станд. откл./нед',
      'Срок годности (нед)', 'Мин. заказ', 'Макс. склад', 'Валюта', 'Поставщик', 'Категория',
      'Объем', 'Текущий запас', 'Сезонность включена', 'Сезонные факторы', 'Текущий месяц',
      'Оптим. заказ', 'Ценность опциона', 'Safety-stock'];

    const data = productsWithMetrics.map(p => [
      p.sku,
      p.name,
      p.purchase,
      p.margin,
      p.muWeek,
      p.sigmaWeek,
      p.shelfLife || '',
      p.minOrderQty || '',
      p.maxStorageQty || '',
      p.currency || 'RUB',
      p.supplier || 'domestic',
      p.category || '',
      p.volume || '',
      p.currentStock || 0,
      p.seasonality?.enabled ? 'да' : 'нет',
      p.seasonality?.monthlyFactors?.join(';') || '',
      p.seasonality?.currentMonth || '',
      p.optQ,
      p.optValue.toFixed(2),
      p.safety
    ]);

    const csvContent = [headers, ...data].map(e => e.map(cell => {
      // Экранируем значения, содержащие запятые или кавычки
      const cellStr = String(cell);
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',')).join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_optimization_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Данные экспортированы в CSV');
  }, [products, productsWithMetrics]);

  const importFromCSV = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').map(line => line.trim()).filter(line => line);
      const header = lines[0].split(',').map(h => h.trim());

      if (!header.includes('SKU') || !header.includes('Название')) {
        toast.error('Неверный формат файла. Убедитесь, что первая строка содержит заголовки колонок.');
        return;
      }

      const newProducts: Product[] = [];

      // Функция для парсинга CSV строки с учетом кавычек
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];

          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
          } else {
            current += char;
          }
        }

        result.push(current);
        return result;
      };

      // Создаем индексы колонок
      const indices: { [key: string]: number } = {};
      header.forEach((col, index) => {
        indices[col] = index;
      });

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);
        if (values.length < 6) continue;

        const product: Product = {
          id: generateNextId() + i - 1,
          sku: values[indices['SKU']] || generateNextSku(),
          name: values[indices['Название']] || 'Без названия',
          purchase: parseFloat(values[indices['Закупочная цена']]) || 0,
          margin: parseFloat(values[indices['Маржа']]) || 0,
          muWeek: parseFloat(values[indices['Средний спрос/нед']]) || 0,
          sigmaWeek: parseFloat(values[indices['Станд. откл./нед']]) || 0,
          shelfLife: values[indices['Срок годности (нед)']] ? parseFloat(values[indices['Срок годности (нед)']]) : undefined,
          minOrderQty: values[indices['Мин. заказ']] ? parseFloat(values[indices['Мин. заказ']]) : undefined,
          maxStorageQty: values[indices['Макс. склад']] ? parseFloat(values[indices['Макс. склад']]) : undefined,
          currency: (values[indices['Валюта']] || 'RUB') as 'RUB' | 'USD' | 'EUR' | 'CNY',
          supplier: (values[indices['Поставщик']] || 'domestic') as 'domestic' | 'china' | 'europe' | 'usa',
          category: values[indices['Категория']] || '',
          volume: values[indices['Объем']] ? parseFloat(values[indices['Объем']]) : undefined,
          currentStock: parseFloat(values[indices['Текущий запас']] || '0') || 0,
          revenue: 0,
          optQ: 0,
          optValue: 0,
          safety: 0,
          seasonality: {
            enabled: values[indices['Сезонность включена']] === 'да',
            monthlyFactors: values[indices['Сезонные факторы']]
              ? values[indices['Сезонные факторы']].split(';').map(f => parseFloat(f) || 1)
              : [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            currentMonth: parseInt(values[indices['Текущий месяц']] || '0') || new Date().getMonth()
          }
        };

        // Убедимся, что у нас есть 12 факторов сезонности
        if (product.seasonality && product.seasonality.monthlyFactors.length !== 12) {
          product.seasonality.monthlyFactors = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
        }

        product.revenue = product.muWeek * (product.purchase + product.margin) * 52;
        newProducts.push(product);
      }

      if (newProducts.length > 0) {
        setProducts(newProducts);
        toast.success(`Импортировано ${newProducts.length} товаров`);
      } else {
        toast.error('Не удалось импортировать данные. Проверьте формат файла.');
      }
    };

    reader.readAsText(file);
    event.target.value = '';
  }, [generateNextId, generateNextSku]);

  const totalOptimalStock = productsWithMetrics.reduce((sum, p) => sum + p.optQ, 0);
  const totalOptionValue = productsWithMetrics.reduce((sum, p) => sum + p.optValue, 0);

  // Автозаполнение себестоимости ОТКЛЮЧЕНО - заполняется вручную через карточки товаров
  // useEffect(() => { ... }, [products]);

  // КОМПОНЕНТ ВЕРНЕТСЯ ЗДЕСЬ
  return (
    <>
      <Toaster position="top-right" />
      <SimpleLayout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        productsCount={products.length}
      >
        {activeTab === "dashboard" && (
          <Dashboard
            products={products}
            productsWithMetrics={abcAnalysisResult}
            totalOptimalStock={totalOptimalStock}
            totalOptionValue={totalOptionValue}
            series={series.map(point => ({
              qty: point.q,
              revenue: 0, // Будем вычислять если нужно
              cost: 0,
              profit: 0,
              optionValue: point.value
            }))}
            selectedProductId={selectedProductId}
            onNavigate={setActiveTab}
            calcMethodUsed={calcMethodUsed}
            scenarios={scenarios}
            riskConfidence={monteCarloParams.confidenceLevel}
          />
        )}

        {activeTab === "theory" && <TheoryTab />}

        {activeTab === "settings" && (
          <SettingsTab
            maxUnits={maxUnits}
            setMaxUnits={setMaxUnits}
            weeks={weeks}
            setWeeks={setWeeks}
            r={r}
            setR={setR}
            hold={hold}
            setHold={setHold}
            rushProb={rushProb}
            setRushProb={setRushProb}
            rushSave={rushSave}
            setRushSave={setRushSave}
            csl={csl}
            setCsl={setCsl}
            selectedWarehouse={selectedWarehouse}
            setSelectedWarehouse={setSelectedWarehouse}
            monteCarloParams={monteCarloParams}
            setMonteCarloParams={setMonteCarloParams}
          />
        )}

        {activeTab === "supplies" && (
          // eslint-disable-next-line react/jsx-no-undef
          <SuppliesTab />
        )}

        {activeTab === "assortment" && (
          <AssortmentTab
            products={productsWithMetrics}
            showProductForm={showProductForm}
            setShowProductForm={setShowProductForm}
            productForm={productForm}
            setProductForm={setProductForm}
            editingProductId={editingProductId}
            loadDemoData={loadDemoData}
            clearAllProducts={clearAllProducts}
            addProduct={addProduct}
            editProduct={editProduct}
            deleteProduct={deleteProduct}
            selectProductForAnalysis={selectProductForAnalysis}
          />
        )}

        {activeTab === "productAnalysis" && (
          <ProductAnalysisTab
            selectedProduct={selectedProduct}
            productsWithMetrics={productsWithMetrics}
            editProduct={editProduct}
            setActiveTab={setActiveTab}
            maxUnits={maxUnits}
            rushProb={rushProb}
            rushSave={rushSave}
            hold={hold}
            r={r}
            weeks={weeks}
            csl={csl}
            getEffectivePurchasePrice={getEffectivePurchasePrice}
            calculateExpectedRevenueWrapper={calculateExpectedRevenueWrapper}
            calculateVolatility={calculateVolatility}
            blackScholesCall={blackScholesCall}
            exportToCSV={exportToCSV}
            monteCarloParams={monteCarloParams}
            setMonteCarloParams={setMonteCarloParams}
          />
        )}

        {activeTab === "export" && (
          <ExportImportTab
            products={products}
            productsWithMetrics={productsWithMetrics}
            setProducts={setProducts}
            exportToCSV={exportToCSV}
            importFromCSV={importFromCSV}
            selectedWarehouse={selectedWarehouse}
          />
        )}

        {activeTab === "abc" && (
          <ABCAnalysisTab products={abcAnalysisResult} />
        )}

        {activeTab === "scenarios" && (
          <ScenariosTab
            products={productsWithMetrics}
            scenarios={scenarios}
            maxUnits={maxUnits}
            rushProb={rushProb}
            rushSave={rushSave}
            hold={hold}
            r={r}
            weeks={weeks}
            csl={csl}
            monteCarloParams={monteCarloParams}
          />
        )}

        {activeTab === "portfolioSettings" && (
          <PortfolioSettingsTab />
        )}

      </SimpleLayout>
    </>
  );
};

export default InventoryOptionCalculator; 