import React, { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label } from "recharts";
import toast, { Toaster } from "react-hot-toast";
import SimpleLayout from "./components/SimpleLayout";
import Dashboard from "./components/Dashboard";

// Импорт математических функций для возможности их использования и тестирования
// import { normalCDF, inverseNormal, blackScholesCall, calculateExpectedRevenue as calcRevenue, calculateVolatility as calcVol } from './mathFunctions';

// TypeScript interfaces
interface ChartPoint {
  q: number;
  value: number;
}

interface VolumeDiscount {
  qty: number;
  discount: number;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  purchase: number;
  margin: number;
  muWeek: number;
  sigmaWeek: number;
  revenue: number;
  optQ: number;
  optValue: number;
  safety: number;
  // Новые поля для расширенных ограничений
  shelfLife?: number;        // Срок годности в неделях
  minOrderQty?: number;       // Минимальный размер заказа
  maxStorageQty?: number;     // Максимальная вместимость склада
  volumeDiscounts?: VolumeDiscount[];  // Скидки за объем
}

interface ProductWithCategory extends Product {
  category: 'A' | 'B' | 'C';
  percent: number;
  accumPercent: number;
}

interface Scenario {
  name: string;
  muWeekMultiplier: number;
  sigmaWeekMultiplier: number;
  probability: number;
}

interface SliderWithValueProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  tooltip?: string;
  unit?: string;
}

const InventoryOptionCalculator = () => {
  /* ----- входные значения ----- */
  const [maxUnits, setMaxUnits] = useState(3000); // диапазон q
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [purchase, setPurchase] = useState(8.5);  // $/шт закуп
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [margin, setMargin] = useState(15);       // $/шт маржа
  const [rushSave, setRushSave] = useState(3);    // $/шт экономия rush
  const [rushProb, setRushProb] = useState(0.2);  // вероятность rush
  const [hold, setHold] = useState(0.5);          // $/шт хранение
  const [r, setR] = useState(0.06);               // ставка капитала
  const [weeks, setWeeks] = useState(13);         // lead-time
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [muWeek, setMuWeek] = useState(800 / 13); // средн. спрос неделя
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [sigmaWeek, setSigmaWeek] = useState(0.35 * (800 / 13)); // σ спроса
  const [csl, setCsl] = useState(0.95);           // целевой CSL

  /* ----- вывод ----- */
  const [optQ, setOptQ] = useState(0);
  const [optValue, setOptValue] = useState(0);
  const [safety, setSafety] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [series, setSeries] = useState<ChartPoint[]>([]);
  
  /* ----- ассортимент ----- */
  const [products, setProducts] = useState<Product[]>([]);
  
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  
  // Вкладки
  const [activeTab, setActiveTab] = useState("dashboard");

  // Сценарный анализ
  const [scenarios] = useState<Scenario[]>([
    { name: "Пессимистичный", muWeekMultiplier: 0.7, sigmaWeekMultiplier: 1.3, probability: 0.25 },
    { name: "Базовый", muWeekMultiplier: 1.0, sigmaWeekMultiplier: 1.0, probability: 0.5 },
    { name: "Оптимистичный", muWeekMultiplier: 1.3, sigmaWeekMultiplier: 0.8, probability: 0.25 }
  ]);

  // Форма для добавления/редактирования продукта
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [productForm, setProductForm] = useState({
    name: "",
    sku: "",
    purchase: 0,
    margin: 0,
    muWeek: 0,
    sigmaWeek: 0,
    shelfLife: 0,
    minOrderQty: 0,
    maxStorageQty: 0,
    volumeDiscounts: [] as VolumeDiscount[]
  });

  // Демо данные (загружаются по кнопке)
  const demoProducts = useMemo((): Product[] => [
    { id: 1, name: "Товар A", sku: "SKU001", purchase: 7.5, margin: 18, muWeek: 75, sigmaWeek: 25, revenue: 0, optQ: 0, optValue: 0, safety: 0 },
    { id: 2, name: "Товар B", sku: "SKU002", purchase: 12.0, margin: 22, muWeek: 55, sigmaWeek: 18, revenue: 0, optQ: 0, optValue: 0, safety: 0 },
    { id: 3, name: "Товар C", sku: "SKU003", purchase: 4.2, margin: 8.5, muWeek: 130, sigmaWeek: 45, revenue: 0, optQ: 0, optValue: 0, safety: 0 },
    { id: 4, name: "Товар D", sku: "SKU004", purchase: 18.5, margin: 35, muWeek: 25, sigmaWeek: 10, revenue: 0, optQ: 0, optValue: 0, safety: 0 },
    { id: 5, name: "Товар E", sku: "SKU005", purchase: 5.0, margin: 12, muWeek: 95, sigmaWeek: 30, revenue: 0, optQ: 0, optValue: 0, safety: 0 },
  ], []);

  /* ---------------- helpers ---------------- */
  const cdf = useCallback((x: number): number => {
    // Аппроксимация Абрамовица-Стегуна
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    
    return 0.5 * (1.0 + sign * y);
  }, []);

  // Обратная функция нормального распределения (Hastings, ±4e-4)
  const invNorm = useCallback((p: number): number => {
    if (p <= 0 || p >= 1) return NaN;
    const a1 = -39.696830, a2 = 220.946098, a3 = -275.928510, a4 = 138.357751, a5 = -30.664798, a6 = 2.506628;
    const b1 = -54.476098, b2 = 161.585836, b3 = -155.698979, b4 = 66.801311, b5 = -13.280681;
    const c1 = -0.007784894, c2 = -0.322396, c3 = -2.400758, c4 = -2.549732, c5 = 4.374664, c6 = 2.938163;
    const d1 = 0.007784695, d2 = 0.322467, d3 = 2.445134, d4 = 3.754408;
    const plow = 0.02425, phigh = 1 - plow;
    let q, r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
        ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
    }
    if (phigh < p) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
        ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
    }
    q = p - 0.5; r = q * q;
    return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
  }, []);

  const blackScholes = useCallback((S: number, K: number, T: number, sigma: number, r: number): { optionValue: number } => {
    // Защита от edge cases
    if (T <= 0) return { optionValue: Math.max(0, S - K) };
    if (S <= 1e-6 || K <= 1e-6) return { optionValue: Math.max(0, S - K) };
    if (sigma <= 1e-6) return { optionValue: Math.max(0, S - K) };
    
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return {
      optionValue: S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2),
    };
  }, [cdf]);

  // Monte-Carlo ожидание lost-sales при запасе q
  const mcDemandLoss = useCallback((units: number, muWeek: number, sigmaWeek: number, weeks: number, trials?: number): number => {
    const mean = muWeek * weeks;
    const std = sigmaWeek * Math.sqrt(weeks);
    
    // УЛУЧШЕНО: Адаптивное количество итераций в зависимости от волатильности
    const cv = sigmaWeek / Math.max(muWeek, 1); // Коэффициент вариации
    const adaptiveTrials = trials || Math.max(1000, Math.ceil(5000 * cv)); // Больше итераций для высокой волатильности
    
    let lostSum = 0;
    for (let i = 0; i < adaptiveTrials; i++) {
      const u1 = Math.random(), u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      // Округляем demand до целого числа - мы работаем со штуками
      const demand = Math.round(Math.max(0, mean + std * z));
      lostSum += Math.max(0, demand - units);
    }
    return lostSum / adaptiveTrials;
  }, []);

  // Расчет эффективной цены закупки с учетом скидок за объем
  const getEffectivePurchasePrice = useCallback((basePrice: number, quantity: number, volumeDiscounts?: VolumeDiscount[]): number => {
    if (!volumeDiscounts || volumeDiscounts.length === 0) {
      return basePrice;
    }
    
    // Сортируем скидки по количеству и находим применимую
    const sortedDiscounts = [...volumeDiscounts].sort((a, b) => b.qty - a.qty);
    const applicableDiscount = sortedDiscounts.find(d => quantity >= d.qty);
    
    if (applicableDiscount) {
      return basePrice * (1 - applicableDiscount.discount / 100);
    }
    
    return basePrice;
  }, []);

  // ИСПРАВЛЕНО: Расчет ожидаемой выручки (S - spot price)
  const calculateExpectedRevenue = useCallback((q: number, muWeek: number, sigmaWeek: number, weeks: number, purchase: number, margin: number, rushProb: number, rushSave: number): number => {
    // Ожидаемый спрос за период
    const expectedDemand = muWeek * weeks;
    
    // Рассчитываем потерянные продажи через Monte Carlo
    const lost = mcDemandLoss(q, muWeek, sigmaWeek, weeks);
    
    // ИСПРАВЛЕНО: Правильный расчет продаж через обычный канал
    // Если запас (q) меньше ожидаемого спроса, то продаем весь запас минус потери
    // Если запас больше спроса, то продаем только то, что есть спрос
    const normalSales = Math.min(q, expectedDemand) - Math.min(lost, q);
    
    // Продано через rush-поставки (с вероятностью rushProb)
    const rushSales = lost * rushProb;
    
    // Полная цена продажи
    const fullPrice = purchase + margin;
    
    // Rush-продажи идут по полной цене, но нам обходятся дороже на rushSave
    // Экономия rushSave означает, что rush-поставка дороже обычной на эту сумму
    // Поэтому маржа от rush-продажи = margin - rushSave
    const rushRevenue = rushSales * fullPrice;
    
    // ИСПРАВЛЕНО: S = полная выручка от всех продаж
    const S = normalSales * fullPrice + rushRevenue;
    
    return S;
  }, [mcDemandLoss]);

  // ИСПРАВЛЕНО: Расчет волатильности для Black-Scholes
  const calculateVolatility = useCallback((muWeek: number, sigmaWeek: number, weeks: number, q: number): number => {
    // Волатильность выручки зависит от волатильности спроса
    // и от того, насколько мы можем удовлетворить спрос
    
    const expectedDemand = muWeek * weeks;
    const demandStd = sigmaWeek * Math.sqrt(weeks);
    
    // Защита от деления на ноль
    if (expectedDemand <= 0) return 0.1;
    
    // Коэффициент вариации спроса
    const cvDemand = demandStd / expectedDemand;
    
    // Если q >> expectedDemand, то волатильность выручки ≈ волатильность спроса
    // Если q << expectedDemand, то волатильность выручки меньше
    const fillRate = Math.min(1, q / expectedDemand);
    
    // УЛУЧШЕНО: Более точная модель, учитывающая нелинейность
    // При низком fillRate волатильность выручки приближается к 0
    // При высоком fillRate волатильность выручки приближается к волатильности спроса
    const revenueVolatility = cvDemand * (1 - Math.exp(-2 * fillRate));
    
    // Минимальная волатильность для численной стабильности
    return Math.max(0.01, revenueVolatility);
  }, []);

  // ABC-анализ ассортимента
  const abcAnalysis = useCallback((items: Product[]): ProductWithCategory[] => {
    if (!items || items.length === 0) return [];
    
    // Сортируем по выручке (от большей к меньшей)
    const sortedItems = [...items].sort((a, b) => b.revenue - a.revenue);
    
    // Рассчитываем накопленный процент от общей выручки
    const totalRevenue = sortedItems.reduce((sum, item) => sum + item.revenue, 0);
    let accumulatedPercent = 0;
    
    return sortedItems.map(item => {
      const percent = item.revenue / totalRevenue;
      accumulatedPercent += percent;
      
      // Определяем категорию
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

  // ИСПРАВЛЕНО: Рассчитываем оптимальные параметры для текущего товара
  useEffect(() => {
    // safety-stock
    const z = invNorm(csl);
    setSafety(Math.ceil(z * sigmaWeek * Math.sqrt(weeks)));

    let bestQ = 0, bestNet = -Infinity;
    const pts = [];
    // Делаем шаг динамическим, зависящим от объема спроса (минимум 1)
    const step = Math.max(1, Math.round(muWeek / 10));
    
    for (let q = 0; q <= maxUnits; q += step) {
      // ИСПРАВЛЕНО: Рассчитываем S как полную выручку
      const S = calculateExpectedRevenue(q, muWeek, sigmaWeek, weeks, purchase, margin, rushProb, rushSave);
      
      // K - полные затраты (закупка + хранение + проценты)
      const K = q * purchase * (1 + r * weeks / 52) + q * hold * weeks;
      
      // Время до "исполнения" в годах
      const T = weeks / 52;
      
      // ИСПРАВЛЕНО: Волатильность зависит от q
      const sigma = calculateVolatility(muWeek, sigmaWeek, weeks, q);
      
      // Расчет стоимости опциона
      const { optionValue } = blackScholes(S, K, T, sigma, r);
      
      // Чистая приведенная стоимость решения о закупке q единиц
      const net = optionValue;
      
      if (net > bestNet) { bestNet = net; bestQ = q; }
      pts.push({ q, value: net });
    }
    setOptQ(bestQ);
    setOptValue(bestNet);
    setSeries(pts);
  }, [maxUnits, purchase, margin, rushSave, rushProb, hold, r, weeks, muWeek, sigmaWeek, csl, blackScholes, calculateExpectedRevenue, calculateVolatility, invNorm]);

  // ИСПРАВЛЕНО: Рассчитываем оптимальные параметры для всего ассортимента
  const productsWithMetrics = useMemo(() => {
    return products.map(product => {
      const z = invNorm(csl);
      const productSafety = Math.ceil(z * product.sigmaWeek * Math.sqrt(weeks));
      
      let bestQ = 0, bestNet = -Infinity;
      // Динамический шаг в зависимости от объема спроса (минимум 1)
      const step = Math.max(1, Math.round(product.muWeek / 10));
      
      // Учитываем ограничения
      const minQ = product.minOrderQty || 0;
      const maxQ = product.maxStorageQty ? Math.min(maxUnits, product.maxStorageQty) : maxUnits;
      
      // Учитываем срок годности
      let effectiveWeeks = weeks;
      if (product.shelfLife && product.shelfLife > 0) {
        effectiveWeeks = Math.min(weeks, product.shelfLife);
      }
      
      for (let q = minQ; q <= maxQ; q += step) {
        // Получаем эффективную цену с учетом скидок
        const effectivePurchase = getEffectivePurchasePrice(product.purchase, q, product.volumeDiscounts);
        
        // ИСПРАВЛЕНО: Используем новые функции расчета
        const S = calculateExpectedRevenue(q, product.muWeek, product.sigmaWeek, effectiveWeeks, effectivePurchase, product.margin, rushProb, rushSave);
        const K = q * effectivePurchase * (1 + r * effectiveWeeks / 52) + q * hold * effectiveWeeks;
        const T = effectiveWeeks / 52;
        const sigma = calculateVolatility(product.muWeek, product.sigmaWeek, effectiveWeeks, q);
        
        const { optionValue } = blackScholes(S, K, T, sigma, r);
        const net = optionValue;
        
        if (net > bestNet) { bestNet = net; bestQ = q; }
      }
      
      // Проверяем минимальный заказ
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
  }, [products, rushSave, rushProb, hold, r, weeks, csl, blackScholes, calculateExpectedRevenue, calculateVolatility, invNorm, maxUnits, getEffectivePurchasePrice]);

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

    // ДОБАВЛЕНО: Валидация параметров продукта
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
      volumeDiscounts: productForm.volumeDiscounts.length > 0 ? productForm.volumeDiscounts : undefined
    };

    if (editingProductId) {
      setProducts(prev => prev.map(p => p.id === editingProductId ? newProduct : p));
      toast.success('Товар успешно обновлен');
    } else {
      setProducts(prev => [...prev, newProduct]);
      toast.success('Товар успешно добавлен');
    }

    // Reset form inline to avoid dependency issues
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
      volumeDiscounts: [] as VolumeDiscount[]
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
      volumeDiscounts: product.volumeDiscounts || []
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

  const fmt = (n: number): string => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const badgeColor = optQ < safety ? "bg-yellow-500 text-white" : optValue > 0 ? "bg-green-500 text-white" : "bg-red-500 text-white";

  // Расчет капитальных затрат и процентов отдельно
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const frozenCapital = optQ * purchase;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const capitalInterest = optQ * purchase * r * weeks / 52;

  // Компонент слайдера с полем ввода значения
  const SliderWithValue: React.FC<SliderWithValueProps> = ({ label, value, onChange, min, max, step, tooltip, unit = "" }) => {
    const [inputValue, setInputValue] = useState(value.toString());
    const [showTooltip, setShowTooltip] = useState(false);
    
    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
      const newValue = parseFloat(e.target.value);
      onChange(newValue);
      setInputValue(newValue.toString());
    };
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
      setInputValue(e.target.value);
    };
    
    const handleInputBlur = (): void => {
      let newValue = parseFloat(inputValue);
      if (isNaN(newValue)) {
        newValue = value;
      } else {
        newValue = Math.max(min, Math.min(max, newValue));
      }
      onChange(newValue);
      setInputValue(newValue.toString());
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        handleInputBlur();
      }
    };
    
    return (
      <div className="space-y-1">
        <div className="flex justify-between items-center mb-1">
          <label className="text-sm font-medium text-gray-700 flex items-center relative">
            {label}
            {tooltip && (
              <>
                <span 
                  className="ml-2 inline-flex items-center justify-center w-4 h-4 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-full text-xs cursor-help transition-colors"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                >
                  ?
                </span>
                {showTooltip && (
                  <div className="absolute z-10 left-0 top-6 w-80 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg">
                    {tooltip}
                    <div className="absolute -top-2 left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-800"></div>
                  </div>
                )}
              </>
            )}
          </label>
          <div className="flex items-center">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleKeyDown}
              className="w-16 p-1 text-center text-sm border border-gray-300 rounded"
            />
            <span className="ml-1 text-sm font-bold text-blue-700">{unit}</span>
          </div>
        </div>
        <input 
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleSliderChange}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>{min}{unit}</span>
          <span>{max}{unit}</span>
        </div>
      </div>
    );
  };

  // Функции экспорта/импорта
  const exportToCSV = useCallback(() => {
    if (products.length === 0) {
      toast.error('Нет данных для экспорта');
      return;
    }
    
    // Заголовки
    const headers = ['SKU', 'Название', 'Закупочная цена', 'Маржа', 'Средний спрос/нед', 'Станд. откл./нед', 
                     'Срок годности (нед)', 'Мин. заказ', 'Макс. склад', 'Оптим. заказ', 'Ценность опциона', 'Safety-stock'];
    
    // Данные
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
      p.optQ,
      p.optValue.toFixed(2),
      p.safety
    ]);
    
    // Создаем CSV
    const csvContent = [headers, ...data].map(e => e.join(',')).join('\n');
    
    // Скачиваем файл
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_optimization_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [products, productsWithMetrics]);

  const importFromCSV = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const header = lines[0].split(',');
      
      // Проверяем формат файла
      if (!header.includes('SKU') || !header.includes('Название')) {
        toast.error('Неверный формат файла. Убедитесь, что первая строка содержит заголовки колонок.');
        return;
      }
      
      const newProducts: Product[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(',');
        if (values.length < 6) continue;
        
        const product: Product = {
          id: generateNextId() + i - 1,
          sku: values[0] || generateNextSku(),
          name: values[1] || 'Без названия',
          purchase: parseFloat(values[2]) || 0,
          margin: parseFloat(values[3]) || 0,
          muWeek: parseFloat(values[4]) || 0,
          sigmaWeek: parseFloat(values[5]) || 0,
          shelfLife: values[6] ? parseFloat(values[6]) : undefined,
          minOrderQty: values[7] ? parseFloat(values[7]) : undefined,
          maxStorageQty: values[8] ? parseFloat(values[8]) : undefined,
          revenue: 0,
          optQ: 0,
          optValue: 0,
          safety: 0
        };
        
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
    // Сбрасываем input для возможности повторной загрузки того же файла
    event.target.value = '';
  }, [generateNextId, generateNextSku]);

  // Состояние для калькулятора "Что если"
  const [testQuantity, setTestQuantity] = useState(0);

  // Обновляем testQuantity при смене товара
  useEffect(() => {
    const product = productsWithMetrics.find(p => p.id === selectedProduct);
    if (product) {
      setTestQuantity(product.optQ);
    }
  }, [selectedProduct, productsWithMetrics]);

  // Расчет метрик для дашборда
  const totalOptimalStock = productsWithMetrics.reduce((sum, p) => sum + p.optQ, 0);
  const totalOptionValue = productsWithMetrics.reduce((sum, p) => sum + p.optValue, 0);

  return (
    <>
      <Toaster position="top-right" />
      <SimpleLayout 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        productsCount={products.length}
      >
        {/* Dashboard */}
        {activeTab === "dashboard" && (
        <Dashboard 
          products={productsWithMetrics}
          totalOptimalStock={totalOptimalStock}
          totalOptionValue={totalOptionValue}
          onNavigate={setActiveTab}
        />
      )}
      
      {/* Вкладка Теория */}
      {activeTab === "theory" && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Теория: Black-Scholes для управления запасами</h3>
          
          <div className="space-y-4">
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
              <h4 className="font-semibold text-blue-800 mb-2">Ключевая идея</h4>
              <p className="text-sm text-blue-900">
                Решение о закупке запаса рассматривается как покупка колл-опциона на будущую выручку. 
                Мы имеем право (но не обязанность) продать товар и получить выручку, заплатив за это право 
                стоимость закупки и хранения.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Параметры модели Black-Scholes</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-3">
                  <h5 className="font-medium text-blue-600">S (Spot Price)</h5>
                  <p className="text-sm">Ожидаемая выручка от продажи товара:</p>
                  <code className="text-xs bg-gray-100 p-1 rounded block mt-1">
                    S = Обычные продажи × (Закуп + Маржа) + Rush-продажи × (Закуп + Маржа)
                  </code>
                </div>
                <div className="border rounded-lg p-3">
                  <h5 className="font-medium text-blue-600">K (Strike Price)</h5>
                  <p className="text-sm">Полные затраты на закупку и хранение:</p>
                  <code className="text-xs bg-gray-100 p-1 rounded block mt-1">
                    K = q × Закуп × (1 + r × t) + q × Хранение × Недели
                  </code>
                </div>
                <div className="border rounded-lg p-3">
                  <h5 className="font-medium text-blue-600">σ (Volatility)</h5>
                  <p className="text-sm">Волатильность выручки, зависит от:</p>
                  <ul className="text-xs list-disc list-inside mt-1">
                    <li>Вариабельности спроса (CV = σ/μ)</li>
                    <li>Уровня сервиса (fill rate = q/спрос)</li>
                  </ul>
                </div>
                <div className="border rounded-lg p-3">
                  <h5 className="font-medium text-blue-600">T (Time)</h5>
                  <p className="text-sm">Время до "исполнения опциона":</p>
                  <code className="text-xs bg-gray-100 p-1 rounded block mt-1">
                    T = Lead Time / 52 недель
                  </code>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Экономическая интерпретация</h4>
              <div className="space-y-2">
                <div className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <p className="text-sm"><strong>Если спрос &gt; q:</strong> Опцион полностью "в деньгах", продаем все единицы</p>
                </div>
                <div className="flex items-start">
                  <span className="text-yellow-500 mr-2">⚠</span>
                  <p className="text-sm"><strong>Если спрос &lt; q:</strong> Опцион частично "в деньгах", остаются непроданные единицы</p>
                </div>
                <div className="flex items-start">
                  <span className="text-blue-500 mr-2">💡</span>
                  <p className="text-sm"><strong>Rush-поставки:</strong> Дополнительная гибкость, увеличивающая ценность опциона</p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-100 rounded-lg p-4">
              <h4 className="font-semibold mb-2">Формула Black-Scholes для колл-опциона</h4>
              <div className="font-mono text-sm">
                C = S × N(d₁) - K × e^(-r×T) × N(d₂)
              </div>
              <div className="mt-2 text-xs">
                где: d₁ = [ln(S/K) + (r + σ²/2)×T] / (σ×√T), d₂ = d₁ - σ×√T
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Вкладка Настройки модели */}
      {activeTab === "settings" && (
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-4">Глобальные параметры модели</h3>
          <p className="text-gray-600 mb-6">
            Эти параметры являются общими для всего ассортимента и влияют на расчеты всех товаров.
            Индивидуальные параметры товаров (цена, маржа, спрос, срок годности, мин/макс заказ, скидки) 
            настраиваются отдельно для каждого SKU в разделе "Товары".
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SliderWithValue 
              label="Максимум для графиков (технический параметр)" 
              value={maxUnits} 
              onChange={setMaxUnits} 
              min={500} 
              max={5000} 
              step={100} 
              unit="штук"
              tooltip="ТЕХНИЧЕСКИЙ ПАРАМЕТР: До скольки штук строить график при анализе товара. НЕ ВЛИЯЕТ на расчеты! Только на масштаб графика. КОГДА МЕНЯТЬ: Если оптимальный заказ получается близко к правому краю графика - увеличьте это значение."
            />
            
            <SliderWithValue 
              label="Период поставки" 
              value={weeks} 
              onChange={setWeeks} 
              min={1} 
              max={26} 
              step={1}
              unit="нед"
              tooltip="Сколько недель проходит от размещения заказа до получения товара. Пример: 2-4 недели для России, 8-12 для Китая, 1 неделя для местных поставщиков."
            />
            
            <SliderWithValue 
              label="Альтернативная доходность ваших денег" 
              value={r * 100} 
              onChange={v => setR(v / 100)} 
              min={1} 
              max={30} 
              step={0.5} 
              unit="%/год"
              tooltip="ВОПРОС: Если бы вы НЕ вложили деньги в товар, а вложили их куда-то еще (банковский депозит, другой бизнес, акции), сколько бы заработали за год? ЗАЧЕМ: Деньги в товаре 'замораживаются' и не приносят доход. Это скрытые потери. ПРИМЕР: Депозит 15% годовых = ваша альтернативная доходность 15%."
            />
            
            <SliderWithValue 
              label="Затраты на хранение 1 штуки товара" 
              value={hold} 
              onChange={setHold} 
              min={0.01} 
              max={5} 
              step={0.01} 
              unit="$ за штуку в неделю"
              tooltip="ВОПРОС: Сколько денег вы тратите, чтобы хранить 1 единицу товара на складе 1 неделю? КАК СЧИТАТЬ: 1) Возьмите все затраты на склад за месяц (аренда + зарплаты + охрана + свет), 2) Поделите на количество товаров на складе, 3) Поделите на 4 недели. ПРИМЕР: Затраты $4000/мес, товаров 2000 шт = $2/шт/мес = $0.50/шт/нед."
            />
            
            <SliderWithValue 
              label="Экстренные закупки у поставщика" 
              value={rushProb * 100} 
              onChange={(v) => setRushProb(v / 100)} 
              min={0} 
              max={100} 
              step={1}
              unit="% случаев"
              tooltip="СИТУАЦИЯ: У вас кончился товар, а покупатель хочет купить. ВОПРОС: Сможете ли вы БЫСТРО купить у своего поставщика и продать клиенту? ОТВЕТ: 0% = никогда (товар из Китая, долго везти), 50% = в половине случаев, 100% = всегда (поставщик рядом, привезет за час)"
            />
            
            <SliderWithValue 
              label="Ваши потери при экстренной закупке" 
              value={rushSave} 
              onChange={setRushSave} 
              min={0} 
              max={10} 
              step={0.1} 
              unit="$/шт"
              tooltip="СИТУАЦИЯ: Товар кончился, вы звоните поставщику: 'Привези СРОЧНО!'. Он говорит: 'Могу, но дороже'. ВОПРОС: На сколько меньше вы заработаете с каждой штуки? ПРИМЕР: Обычно покупаете за $10, продаете за $20 (заработок $10). При срочной закупке покупаете за $13, продаете за $20 (заработок $7). Потеря = $3."
            />
            
            <SliderWithValue 
              label="Сколько клиентов НЕ должны уйти без товара" 
              value={csl * 100} 
              onChange={(v) => setCsl(v / 100)} 
              min={50} 
              max={99} 
              step={1}
              unit="% из 100"
              tooltip="СИТУАЦИЯ: К вам приходят 100 покупателей. У некоторых товар есть, у некоторых - кончился. ВОПРОС: Скольким из 100 вы хотите продать? КОМПРОМИСС: 99% = почти всем продадите (но нужен БОЛЬШОЙ запас), 90% = 10 из 100 уйдут без покупки (но запас МЕНЬШЕ). РЕКОМЕНДАЦИЯ: 95% - золотая середина."
            />
          </div>
          
                      <div className="mt-6 space-y-4">
              <div className="p-4 bg-blue-50 border-l-4 border-blue-500">
                <h4 className="font-semibold text-blue-800 mb-2">Разделение параметров</h4>
                <div className="text-sm text-blue-900 space-y-2">
                  <p><strong>Глобальные параметры (здесь):</strong></p>
                  <ul className="list-disc list-inside ml-2">
                    <li>Период поставки и логистика</li>
                    <li>Стоимость капитала и хранения</li>
                    <li>Rush-поставки и целевой уровень сервиса</li>
                  </ul>
                  <p className="mt-2"><strong>Индивидуальные параметры (в разделе "Товары"):</strong></p>
                  <ul className="list-disc list-inside ml-2">
                    <li>Закупочная цена и маржа</li>
                    <li>Спрос и его волатильность</li>
                    <li>Срок годности, мин/макс заказ</li>
                    <li>Скидки за объем</li>
                  </ul>
                </div>
              </div>
              
              <div className="p-4 bg-green-50 border-l-4 border-green-500">
                <h4 className="font-semibold text-green-800 mb-2">Шпаргалка: типичные значения</h4>
                <div className="text-sm text-green-900 space-y-1">
                  <p>• <strong>Период поставки:</strong> 1 неделя (сосед-поставщик), 2-4 недели (из другого города), 8-12 недель (из Китая)</p>
                  <p>• <strong>Альтернативная доходность:</strong> 10-15% (у вас есть деньги), 20-30% (деньги в кредит)</p>
                  <p>• <strong>Хранение:</strong> $0.1-0.5 (мелкие товары), $1-3 (обычные), $5+ (холодильники, мебель)</p>
                  <p>• <strong>Экстренные закупки:</strong> 0-30% (импорт), 50-80% (город рядом), 90%+ (свое производство)</p>
                  <p>• <strong>Потери при срочности:</strong> $1-2 (мелкая маржа), $5-10 (обычно), $20+ (дорогие товары)</p>
                  <p>• <strong>Обслужить клиентов:</strong> 90% (дешевые товары), 95% (обычные), 99% (дорогие/важные)</p>
                </div>
              </div>
            </div>
        </div>
      )}
      
      {/* Вкладка Анализ товара */}
      {activeTab === "productAnalysis" && selectedProduct && (
        <div className="bg-white rounded-lg shadow-md p-4">
          {(() => {
            const product = productsWithMetrics.find(p => p.id === selectedProduct);
            if (!product) return <p>Товар не найден</p>;
            
            // Расчет данных для графика
            const chartData: ChartPoint[] = [];
            const step = Math.max(1, Math.round(product.muWeek / 10));
            
            for (let q = 0; q <= maxUnits; q += step) {
              const S = calculateExpectedRevenue(q, product.muWeek, product.sigmaWeek, weeks, product.purchase, product.margin, rushProb, rushSave);
              const K = q * product.purchase * (1 + r * weeks / 52) + q * hold * weeks;
              const T = weeks / 52;
              const sigma = calculateVolatility(product.muWeek, product.sigmaWeek, weeks, q);
              const { optionValue } = blackScholes(S, K, T, sigma, r);
              chartData.push({ q, value: optionValue });
            }
            
            const badgeColor = product.optQ < product.safety && product.optValue > 0 ? "bg-yellow-500 text-white" : product.optValue > 0 ? "bg-green-500 text-white" : "bg-red-500 text-white";
            const frozenCapital = product.optQ * product.purchase;
            const capitalInterest = product.optQ * product.purchase * r * weeks / 52;
            
            return (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Анализ товара: {product.name} ({product.sku})</h3>
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
                
                {/* Основные характеристики товара */}
                <div className="mb-6">
                  <h4 className="text-md font-semibold mb-3">Параметры товара</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-100 p-3 rounded">
                      <div className="text-sm text-gray-500">Закупочная цена</div>
                      <div className="text-lg font-bold">${product.purchase}</div>
                    </div>
                    <div className="bg-gray-100 p-3 rounded">
                      <div className="text-sm text-gray-500">Маржа</div>
                      <div className="text-lg font-bold">${product.margin}</div>
                      <div className="text-xs text-gray-500">{((product.margin / product.purchase) * 100).toFixed(0)}% рентабельность</div>
                    </div>
                    <div className="bg-gray-100 p-3 rounded">
                      <div className="text-sm text-gray-500">Спрос в неделю</div>
                      <div className="text-lg font-bold">{fmt(product.muWeek)} ± {fmt(product.sigmaWeek)}</div>
                      <div className="text-xs text-gray-500">CV: {((product.sigmaWeek / product.muWeek) * 100).toFixed(0)}%</div>
                    </div>
                    <div className="bg-gray-100 p-3 rounded">
                      <div className="text-sm text-gray-500">Годовая выручка</div>
                      <div className="text-lg font-bold">${fmt(product.revenue)}</div>
                    </div>
                  </div>
                  
                  {/* Дополнительные ограничения если есть */}
                  {(product.shelfLife || product.minOrderQty || product.maxStorageQty || product.volumeDiscounts?.length) && (
                    <div className="mt-4 p-3 bg-yellow-50 border-l-4 border-yellow-500">
                      <h5 className="font-semibold text-yellow-800 mb-2">Индивидуальные ограничения товара:</h5>
                      <div className="text-sm text-yellow-900 space-y-1">
                        {product.shelfLife && <p>• Срок годности: {product.shelfLife} недель</p>}
                        {product.minOrderQty && <p>• Минимальный заказ: {product.minOrderQty} штук</p>}
                        {product.maxStorageQty && <p>• Максимум на складе: {product.maxStorageQty} штук</p>}
                        {product.volumeDiscounts && product.volumeDiscounts.length > 0 && (
                          <p>• Скидки за объем: {product.volumeDiscounts.map(d => `${d.qty}шт = -${d.discount}%`).join(', ')}</p>
                        )}
                      </div>
                    </div>
                  )}
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
                        <span className={`text-lg font-bold ${product.optValue > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${fmt(product.optValue)}
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-center bg-gray-100 p-3 rounded">
                        <span className="text-xs text-gray-500 mb-1">Safety-stock</span>
                        <span className="text-lg font-bold">{fmt(product.safety)} шт</span>
                      </div>
                      <div className="flex flex-col items-center justify-center bg-gray-100 p-3 rounded">
                        <span className="text-xs text-gray-500 mb-1">Замороженный капитал</span>
                        <span className="text-lg font-bold">${fmt(frozenCapital)}</span>
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
                    
                    <div className="mt-3 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div>Оборачиваемость:</div>
                        <div className="font-medium">{(52 / weeks).toFixed(1)}x в год</div>
                        <div>Проценты на капитал:</div>
                        <div className="font-medium">${fmt(capitalInterest)}</div>
                        <div>Стоимость хранения:</div>
                        <div className="font-medium">${fmt(product.optQ * hold * weeks)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Калькулятор "Что если" */}
                {(() => {
                  // Используем локальное состояние для количества текущего товара
                  const currentTestQty = selectedProduct === product.id ? testQuantity : product.optQ;
                  
                  // Расчет метрик для выбранного количества
                  const calcMetricsForQ = (q: number) => {
                    const effectivePurchase = getEffectivePurchasePrice(product.purchase, q, product.volumeDiscounts);
                    const S = calculateExpectedRevenue(q, product.muWeek, product.sigmaWeek, weeks, effectivePurchase, product.margin, rushProb, rushSave);
                    const K = q * effectivePurchase * (1 + r * weeks / 52) + q * hold * weeks;
                    const T = weeks / 52;
                    const sigma = calculateVolatility(product.muWeek, product.sigmaWeek, weeks, q);
                    const { optionValue } = blackScholes(S, K, T, sigma, r);
                    
                    return {
                      value: optionValue,
                      investment: q * effectivePurchase,
                      storage: q * hold * weeks,
                      revenue: S,
                      roi: q > 0 ? (optionValue / (q * effectivePurchase)) * 100 : 0
                    };
                  };
                  
                  const currentMetrics = calcMetricsForQ(currentTestQty);
                  const optimalMetrics = calcMetricsForQ(product.optQ);
                  
                  return (
                    <div className="bg-white border rounded-lg p-4 mb-6">
                      <h4 className="text-md font-semibold mb-4">Калькулятор "Что если?"</h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-700">Если я закажу:</label>
                          <input
                            type="number"
                            value={currentTestQty}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value) || 0;
                              setTestQuantity(newValue);
                            }}
                            min="0"
                            max={maxUnits}
                            className="mt-1 w-full p-2 border border-gray-300 rounded font-bold text-lg"
                          />
                          <span className="text-xs text-gray-500">штук товара</span>
                        </div>
                        <div className={`p-3 rounded ${currentMetrics.value > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                          <div className="text-sm text-gray-600">То заработаю:</div>
                          <div className={`text-lg font-bold ${currentMetrics.value > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${fmt(currentMetrics.value)}
                          </div>
                          <div className="text-xs text-gray-500">ROI: {currentMetrics.roi.toFixed(1)}%</div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="text-sm text-gray-600">Вложу денег:</div>
                          <div className="text-lg font-bold">${fmt(currentMetrics.investment)}</div>
                          <div className="text-xs text-gray-500">+ ${fmt(currentMetrics.storage)} хранение</div>
                        </div>
                        <div className="bg-blue-50 p-3 rounded">
                          <div className="text-sm text-gray-600">Сравнение с оптимальным:</div>
                          <div className={`text-lg font-bold ${currentMetrics.value >= optimalMetrics.value ? 'text-green-600' : 'text-orange-600'}`}>
                            {currentMetrics.value >= optimalMetrics.value ? '✓ Оптимально' : 
                             `−$${fmt(optimalMetrics.value - currentMetrics.value)}`}
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
                  );
                })()}

                {/* График зависимости */}
                <div className="bg-white border rounded-lg p-4">
                  <h4 className="text-md font-semibold mb-2">График анализа прибыльности</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Показывает, сколько вы заработаете при разных объемах заказа
                  </p>
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
                          label={{ value: 'Прибыль ($)', angle: -90, position: 'insideLeft', style: { fontSize: 14 } }}
                          tickFormatter={(value) => `$${fmt(Number(value))}`}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={(value) => ['$' + fmt(Number(value)), 'Прибыль']}
                          labelFormatter={(value) => `При заказе ${value} шт`}
                          contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                        />
                        
                        {/* Зона убытков */}
                        <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} />
                        
                        {/* Оптимальное количество */}
                        <ReferenceLine 
                          x={product.optQ} 
                          stroke="#f59e0b" 
                          strokeWidth={2}
                          strokeDasharray="5 5"
                        >
                          <Label value={`Оптимум: ${fmt(product.optQ)} шт`} position="top" offset={10} style={{ fontSize: 12, fill: '#f59e0b' }} />
                        </ReferenceLine>
                        
                        {/* Страховой запас */}
                        <ReferenceLine 
                          x={product.safety} 
                          stroke="#3b82f6" 
                          strokeWidth={1}
                          strokeDasharray="3 3"
                        >
                          <Label value={`Мин. запас: ${fmt(product.safety)} шт`} position="bottom" offset={10} style={{ fontSize: 12, fill: '#3b82f6' }} />
                        </ReferenceLine>
                        
                        {/* Основная линия */}
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="#10b981" 
                          strokeWidth={3}
                          fill="url(#colorValue)"
                          activeDot={{ r: 6, fill: '#10b981' }} 
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
                        <div className="text-xs text-orange-700">Макс. прибыль: ${fmt(product.optValue)}</div>
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
                        <div className="text-lg font-bold text-red-600">Ниже $0</div>
                        <div className="text-xs text-red-700">Невыгодно закупать</div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
      
      {/* Вкладка Управление ассортиментом */}
      {activeTab === "assortment" && (
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold">Управление ассортиментом</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Здесь настраиваются индивидуальные параметры каждого товара
                </p>
              </div>
              <div className="flex space-x-2">
                <button 
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  onClick={() => {
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
                      volumeDiscounts: [] as VolumeDiscount[]
                    });
                    setShowProductForm(true);
                  }}
                >
                  + Добавить товар
                </button>
                <button 
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  onClick={loadDemoData}
                >
                  Загрузить демо-данные
                </button>
                {products.length > 0 && (
                  <button 
                    className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                    onClick={clearAllProducts}
                  >
                    Очистить все
                  </button>
                )}
              </div>
            </div>

            {/* Форма добавления/редактирования товара */}
            {showProductForm && (
              <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <h4 className="text-md font-semibold mb-4">
                  {editingProductId ? 'Редактировать товар' : 'Добавить новый товар'}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Название товара *
                    </label>
                    <input
                      type="text"
                      value={productForm.name}
                      onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full p-2 border border-gray-300 rounded"
                      placeholder="Введите название"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SKU *
                    </label>
                    <input
                      type="text"
                      value={productForm.sku}
                      onChange={(e) => setProductForm(prev => ({ ...prev, sku: e.target.value }))}
                      className="w-full p-2 border border-gray-300 rounded"
                      placeholder="SKU001"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Закупочная цена, $
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={productForm.purchase}
                      onChange={(e) => setProductForm(prev => ({ ...prev, purchase: parseFloat(e.target.value) || 0 }))}
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Маржа, $
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={productForm.margin}
                      onChange={(e) => setProductForm(prev => ({ ...prev, margin: parseFloat(e.target.value) || 0 }))}
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Средний спрос, шт/нед
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={productForm.muWeek}
                      onChange={(e) => setProductForm(prev => ({ ...prev, muWeek: parseFloat(e.target.value) || 0 }))}
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Стандартное отклонение спроса, шт/нед
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={productForm.sigmaWeek}
                      onChange={(e) => setProductForm(prev => ({ ...prev, sigmaWeek: parseFloat(e.target.value) || 0 }))}
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                  </div>
                </div>
                
                {/* Расширенные индивидуальные параметры */}
                <h5 className="text-md font-semibold mt-4 mb-3 text-gray-700">Дополнительные ограничения товара</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Срок годности, недель
                      <span className="text-xs text-gray-500 ml-1">(необязательно)</span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={productForm.shelfLife || ''}
                      onChange={(e) => setProductForm(prev => ({ ...prev, shelfLife: parseFloat(e.target.value) || 0 }))}
                      className="w-full p-2 border border-gray-300 rounded"
                      placeholder="0 = без ограничений"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Минимальный заказ, шт
                      <span className="text-xs text-gray-500 ml-1">(необязательно)</span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={productForm.minOrderQty || ''}
                      onChange={(e) => setProductForm(prev => ({ ...prev, minOrderQty: parseFloat(e.target.value) || 0 }))}
                      className="w-full p-2 border border-gray-300 rounded"
                      placeholder="0 = без ограничений"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Макс. вместимость склада, шт
                      <span className="text-xs text-gray-500 ml-1">(необязательно)</span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={productForm.maxStorageQty || ''}
                      onChange={(e) => setProductForm(prev => ({ ...prev, maxStorageQty: parseFloat(e.target.value) || 0 }))}
                      className="w-full p-2 border border-gray-300 rounded"
                      placeholder="0 = без ограничений"
                    />
                  </div>
                </div>
                
                {/* Секция для скидок за объем */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Скидки за объем
                    <span className="text-xs text-gray-500 ml-1">(необязательно)</span>
                  </label>
                  <div className="space-y-2">
                    {productForm.volumeDiscounts.map((discount, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="number"
                          value={discount.qty}
                          onChange={(e) => {
                            const newDiscounts = [...productForm.volumeDiscounts];
                            newDiscounts[index].qty = parseFloat(e.target.value) || 0;
                            setProductForm(prev => ({ ...prev, volumeDiscounts: newDiscounts }));
                          }}
                          className="w-32 p-2 border border-gray-300 rounded"
                          placeholder="Количество"
                        />
                        <span>шт →</span>
                        <input
                          type="number"
                          value={discount.discount}
                          onChange={(e) => {
                            const newDiscounts = [...productForm.volumeDiscounts];
                            newDiscounts[index].discount = parseFloat(e.target.value) || 0;
                            setProductForm(prev => ({ ...prev, volumeDiscounts: newDiscounts }));
                          }}
                          className="w-24 p-2 border border-gray-300 rounded"
                          placeholder="Скидка %"
                        />
                        <span>%</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newDiscounts = productForm.volumeDiscounts.filter((_, i) => i !== index);
                            setProductForm(prev => ({ ...prev, volumeDiscounts: newDiscounts }));
                          }}
                          className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setProductForm(prev => ({
                          ...prev,
                          volumeDiscounts: [...prev.volumeDiscounts, { qty: 0, discount: 0 }]
                        }));
                      }}
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    >
                      + Добавить скидку
                    </button>
                  </div>
                </div>
                
                <div className="flex space-x-2 mt-4">
                  <button 
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                    onClick={addProduct}
                  >
                    {editingProductId ? 'Сохранить изменения' : 'Добавить товар'}
                  </button>
                  <button 
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                    onClick={() => {
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
                        volumeDiscounts: [] as VolumeDiscount[]
                      });
                      setEditingProductId(null);
                      setShowProductForm(false);
                    }}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {/* Таблица товаров */}
            {products.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">Пока нет добавленных товаров</p>
                <button 
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 mr-2"
                  onClick={() => {
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
                      volumeDiscounts: [] as VolumeDiscount[]
                    });
                    setShowProductForm(true);
                  }}
                >
                  Добавить первый товар
                </button>
                <button 
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  onClick={loadDemoData}
                >
                  Или загрузить демо-данные
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Наименование</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Закуп, $</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Маржа, $</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Спрос нед.</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Оптим. q*</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Safety</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Опцион, $</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {productsWithMetrics.map((product) => (
                        <tr key={product.id} className={product.id === selectedProduct ? 'bg-blue-50' : ''}>
                          <td className="px-6 py-3 text-sm">{product.sku}</td>
                          <td className="px-6 py-3 text-sm">{product.name}</td>
                          <td className="px-6 py-3 text-sm">{product.purchase.toFixed(2)}</td>
                          <td className="px-6 py-3 text-sm">{product.margin.toFixed(2)}</td>
                          <td className="px-6 py-3 text-sm">{fmt(product.muWeek)}</td>
                          <td className="px-6 py-3 text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                              product.optQ < product.safety ? 'bg-yellow-500 text-white' : 
                              product.optValue > 0 ? 'bg-green-500 text-white' : 
                              'bg-red-500 text-white'
                            }`}>
                              {fmt(product.optQ)}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm">{fmt(product.safety)}</td>
                          <td className={`px-6 py-3 text-sm ${product.optValue > 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}`}>
                            ${fmt(product.optValue)}
                          </td>
                          <td className="px-6 py-3 text-sm">
                            <div className="flex space-x-2">
                              <button 
                                className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                                onClick={() => selectProductForAnalysis(product)}
                              >
                                Анализ
                              </button>
                              <button 
                                className="px-3 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600"
                                onClick={() => editProduct(product)}
                              >
                                Изменить
                              </button>
                              <button 
                                className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                                onClick={() => deleteProduct(product.id)}
                              >
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Сводный анализ</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-100 p-4 rounded-lg">
                      <div className="text-sm text-gray-500 mb-1">Всего товаров</div>
                      <div className="text-xl font-bold">{productsWithMetrics.length}</div>
                    </div>
                    <div className="bg-gray-100 p-4 rounded-lg">
                      <div className="text-sm text-gray-500 mb-1">Общий оптимальный запас</div>
                      <div className="text-xl font-bold">{fmt(productsWithMetrics.reduce((sum, p) => sum + p.optQ, 0))} шт</div>
                    </div>
                    <div className="bg-gray-100 p-4 rounded-lg">
                      <div className="text-sm text-gray-500 mb-1">Суммарная ценность опционов</div>
                      <div className="text-xl font-bold">${fmt(productsWithMetrics.reduce((sum, p) => sum + p.optValue, 0))}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Вкладка ABC-анализ */}
      {activeTab === "abc" && (
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-4">ABC-анализ ассортимента</h3>
            
            <div className="mb-6">
              <div className="bg-gray-100 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Ключевые показатели</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Категория A (80% выручки)</div>
                    <div className="text-lg font-bold">{abcAnalysisResult.filter(p => p.category === 'A').length} SKU</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Категория B (15% выручки)</div>
                    <div className="text-lg font-bold">{abcAnalysisResult.filter(p => p.category === 'B').length} SKU</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Категория C (5% выручки)</div>
                    <div className="text-lg font-bold">{abcAnalysisResult.filter(p => p.category === 'C').length} SKU</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Наименование</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Выручка, $</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% от общей</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Накопленный %</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Категория</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Оптим. q*</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CSL</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Рекомендации</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {abcAnalysisResult.map((product) => (
                    <tr key={product.id}>
                      <td className="px-6 py-3 text-sm">{product.sku}</td>
                      <td className="px-6 py-3 text-sm">{product.name}</td>
                      <td className="px-6 py-3 text-sm">${fmt(product.revenue)}</td>
                      <td className="px-6 py-3 text-sm">{(product.percent * 100).toFixed(1)}%</td>
                      <td className="px-6 py-3 text-sm">{(product.accumPercent * 100).toFixed(1)}%</td>
                      <td className="px-6 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                          product.category === 'A' ? 'bg-red-500 text-white' : 
                          product.category === 'B' ? 'bg-yellow-500 text-white' : 
                          'bg-green-500 text-white'
                        }`}>
                          {product.category}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm">{fmt(product.optQ)}</td>
                      <td className="px-6 py-3 text-sm">{
                        product.category === 'A' ? '99%' :
                        product.category === 'B' ? '95%' :
                        '90%'
                      }</td>
                      <td className="px-6 py-3 text-sm">
                        {product.category === 'A' ? (
                          <span className="text-red-600 font-medium">Высокий приоритет</span>
                        ) : product.category === 'B' ? (
                          <span className="text-yellow-600 font-medium">Средний приоритет</span>
                        ) : (
                          <span className="text-green-600 font-medium">Низкий приоритет</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6">
              <h4 className="font-medium mb-2">Рекомендации по категориям</h4>
              <div className="space-y-2">
                <div className="p-3 border border-red-200 rounded bg-red-50">
                  <strong>Категория A:</strong> Постоянный мониторинг, высокий CSL (99%), минимальный safety-stock, частые поставки, персональный контроль.
                </div>
                <div className="p-3 border border-yellow-200 rounded bg-yellow-50">
                  <strong>Категория B:</strong> Регулярный контроль, средний CSL (95%), умеренный safety-stock, стандартные сроки поставок.
                </div>
                <div className="p-3 border border-green-200 rounded bg-green-50">
                  <strong>Категория C:</strong> Периодический контроль, низкий CSL (90%), минимальные запасы, увеличенные периоды пополнения.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Вкладка Сценарный анализ */}
      {activeTab === "scenarios" && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Сценарный анализ</h3>
          
          <div className="mb-6">
            <p className="text-gray-600">
              Анализ оптимальных параметров запасов при различных сценариях развития спроса. 
              Помогает оценить риски и возможности при изменении рыночной ситуации.
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {scenarios.map((scenario, index) => (
              <div key={index} className={`border rounded-lg p-4 ${
                scenario.name === 'Базовый' ? 'border-blue-500 bg-blue-50' : 
                scenario.name === 'Пессимистичный' ? 'border-red-500 bg-red-50' : 
                'border-green-500 bg-green-50'
              }`}>
                <h4 className="font-semibold mb-2">{scenario.name} сценарий</h4>
                <div className="space-y-1 text-sm">
                  <div>Спрос: {scenario.muWeekMultiplier > 1 ? '+' : ''}{((scenario.muWeekMultiplier - 1) * 100).toFixed(0)}%</div>
                  <div>Волатильность: {scenario.sigmaWeekMultiplier > 1 ? '+' : ''}{((scenario.sigmaWeekMultiplier - 1) * 100).toFixed(0)}%</div>
                  <div>Вероятность: {(scenario.probability * 100).toFixed(0)}%</div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Товар</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase" colSpan={3}>
                    Пессимистичный
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase" colSpan={3}>
                    Базовый
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase" colSpan={3}>
                    Оптимистичный
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Средневзвешенный
                  </th>
                </tr>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-400"></th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-400">q*</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-400">Value</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-400">ROI</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-400">q*</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-400">Value</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-400">ROI</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-400">q*</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-400">Value</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-400">ROI</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-400">Value</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {productsWithMetrics.map((product) => {
                  // Рассчитываем для каждого сценария
                  const scenarioResults = scenarios.map(scenario => {
                    const adjustedMuWeek = product.muWeek * scenario.muWeekMultiplier;
                    const adjustedSigmaWeek = product.sigmaWeek * scenario.sigmaWeekMultiplier;
                    
                    let bestQ = 0, bestNet = -Infinity;
                    const step = Math.max(1, Math.round(adjustedMuWeek / 10));
                    const minQ = product.minOrderQty || 0;
                    const maxQ = product.maxStorageQty ? Math.min(maxUnits, product.maxStorageQty) : maxUnits;
                    
                    let effectiveWeeks = weeks;
                    if (product.shelfLife && product.shelfLife > 0) {
                      effectiveWeeks = Math.min(weeks, product.shelfLife);
                    }
                    
                    for (let q = minQ; q <= maxQ; q += step) {
                      const effectivePurchase = getEffectivePurchasePrice(product.purchase, q, product.volumeDiscounts);
                      const S = calculateExpectedRevenue(q, adjustedMuWeek, adjustedSigmaWeek, effectiveWeeks, effectivePurchase, product.margin, rushProb, rushSave);
                      const K = q * effectivePurchase * (1 + r * effectiveWeeks / 52) + q * hold * effectiveWeeks;
                      const T = effectiveWeeks / 52;
                      const sigma = calculateVolatility(adjustedMuWeek, adjustedSigmaWeek, effectiveWeeks, q);
                      const { optionValue } = blackScholes(S, K, T, sigma, r);
                      
                      if (optionValue > bestNet) { 
                        bestNet = optionValue; 
                        bestQ = q; 
                      }
                    }
                    
                    if (product.minOrderQty && bestQ < product.minOrderQty) {
                      bestQ = product.minOrderQty;
                    }
                    
                    const investment = bestQ * product.purchase;
                    const roi = investment > 0 ? (bestNet / investment) * 100 : 0;
                    
                    return { q: bestQ, value: bestNet, roi };
                  });
                  
                  const weightedValue = scenarioResults.reduce((sum, result, index) => 
                    sum + result.value * scenarios[index].probability, 0
                  );
                  
                  return (
                    <tr key={product.id}>
                      <td className="px-4 py-3 text-sm font-medium">{product.name}</td>
                      {scenarioResults.map((result, index) => (
                        <React.Fragment key={index}>
                          <td className="px-2 py-3 text-sm text-center">{fmt(result.q)}</td>
                          <td className={`px-2 py-3 text-sm text-center font-medium ${
                            result.value > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            ${fmt(result.value)}
                          </td>
                          <td className="px-2 py-3 text-sm text-center">{result.roi.toFixed(1)}%</td>
                        </React.Fragment>
                      ))}
                      <td className={`px-4 py-3 text-sm text-center font-bold ${
                        weightedValue > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        ${fmt(weightedValue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-500">
            <h4 className="font-semibold text-yellow-800 mb-2">Как использовать результаты</h4>
            <ul className="text-sm text-yellow-900 space-y-1 list-disc list-inside">
              <li>Если оптимальные количества сильно различаются между сценариями - товар имеет высокий риск</li>
              <li>Средневзвешенная ценность показывает ожидаемую выгоду с учетом всех сценариев</li>
              <li>ROI помогает сравнить эффективность инвестиций в разные товары</li>
              <li>Для товаров с отрицательной ценностью в пессимистичном сценарии рассмотрите минимальные заказы</li>
            </ul>
          </div>
        </div>
      )}
      
      {/* Вкладка Экспорт/Импорт */}
      {activeTab === "dataIO" && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Экспорт и импорт данных</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border rounded-lg p-4">
              <h4 className="font-semibold mb-3">📤 Экспорт данных</h4>
              <p className="text-sm text-gray-600 mb-4">
                Скачайте текущий ассортимент и результаты оптимизации в формате CSV для анализа в Excel или других программах.
              </p>
              <button
                onClick={exportToCSV}
                className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300"
                disabled={products.length === 0}
              >
                Скачать CSV файл
              </button>
              {products.length === 0 && (
                <p className="text-sm text-red-500 mt-2">Добавьте товары для экспорта</p>
              )}
            </div>
            
            <div className="border rounded-lg p-4">
              <h4 className="font-semibold mb-3">📥 Импорт данных</h4>
              <p className="text-sm text-gray-600 mb-4">
                Загрузите данные о товарах из CSV файла. Файл должен содержать колонки: SKU, Название, Закупочная цена, Маржа, Средний спрос/нед, Станд. откл./нед.
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={importFromCSV}
                className="hidden"
                id="csv-upload"
              />
              <label
                htmlFor="csv-upload"
                className="block w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer text-center"
              >
                Выбрать CSV файл
              </label>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-gray-100 rounded-lg">
            <h4 className="font-semibold mb-2">📋 Формат CSV файла</h4>
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left pr-4">Колонка</th>
                    <th className="text-left pr-4">Обязательная</th>
                    <th className="text-left">Описание</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-1 pr-4 font-mono">SKU</td>
                    <td className="py-1 pr-4">✓</td>
                    <td className="py-1">Уникальный код товара</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 pr-4 font-mono">Название</td>
                    <td className="py-1 pr-4">✓</td>
                    <td className="py-1">Наименование товара</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 pr-4 font-mono">Закупочная цена</td>
                    <td className="py-1 pr-4">✓</td>
                    <td className="py-1">Цена закупки у поставщика</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 pr-4 font-mono">Маржа</td>
                    <td className="py-1 pr-4">✓</td>
                    <td className="py-1">Прибыль с единицы товара</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 pr-4 font-mono">Средний спрос/нед</td>
                    <td className="py-1 pr-4">✓</td>
                    <td className="py-1">Ожидаемые продажи в неделю</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 pr-4 font-mono">Станд. откл./нед</td>
                    <td className="py-1 pr-4">✓</td>
                    <td className="py-1">Волатильность спроса</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 pr-4 font-mono">Срок годности (нед)</td>
                    <td className="py-1 pr-4"></td>
                    <td className="py-1">Максимальный срок хранения</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 pr-4 font-mono">Мин. заказ</td>
                    <td className="py-1 pr-4"></td>
                    <td className="py-1">Минимальная партия заказа</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 pr-4 font-mono">Макс. склад</td>
                    <td className="py-1 pr-4"></td>
                    <td className="py-1">Максимальная вместимость</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="mt-4 text-sm text-gray-500">
            <p>💡 Совет: Сначала экспортируйте демо-данные, чтобы увидеть правильный формат файла.</p>
          </div>
        </div>
      )}
    </SimpleLayout>
    </>
  );
};

export default InventoryOptionCalculator;