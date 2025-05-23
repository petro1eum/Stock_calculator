import React, { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// TypeScript interfaces
interface ChartPoint {
  q: number;
  value: number;
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
}

interface ProductWithCategory extends Product {
  category: 'A' | 'B' | 'C';
  percent: number;
  accumPercent: number;
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
  const [purchase, setPurchase] = useState(8.5);  // $/шт закуп
  const [margin, setMargin] = useState(15);       // $/шт маржа
  const [rushSave, setRushSave] = useState(3);    // $/шт экономия rush
  const [rushProb, setRushProb] = useState(0.2);  // вероятность rush
  const [hold, setHold] = useState(0.5);          // $/шт хранение
  const [r, setR] = useState(0.06);               // ставка капитала
  const [weeks, setWeeks] = useState(13);         // lead-time
  const [muWeek, setMuWeek] = useState(800 / 13); // средн. спрос неделя
  const [sigmaWeek, setSigmaWeek] = useState(0.35 * (800 / 13)); // σ спроса
  const [csl, setCsl] = useState(0.95);           // целевой CSL

  /* ----- вывод ----- */
  const [optQ, setOptQ] = useState(0);
  const [optValue, setOptValue] = useState(0);
  const [safety, setSafety] = useState(0);
  const [series, setSeries] = useState<ChartPoint[]>([]);
  
  /* ----- ассортимент ----- */
  const [products, setProducts] = useState<Product[]>([]);
  
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  
  // Вкладки
  const [activeTab, setActiveTab] = useState("assortment");

  // Форма для добавления/редактирования продукта
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [productForm, setProductForm] = useState({
    name: "",
    sku: "",
    purchase: 0,
    margin: 0,
    muWeek: 0,
    sigmaWeek: 0
  });

  // Демо данные (загружаются по кнопке)
  const demoProducts: Product[] = [
    { id: 1, name: "Товар A", sku: "SKU001", purchase: 7.5, margin: 18, muWeek: 75, sigmaWeek: 25, revenue: 0, optQ: 0, optValue: 0, safety: 0 },
    { id: 2, name: "Товар B", sku: "SKU002", purchase: 12.0, margin: 22, muWeek: 55, sigmaWeek: 18, revenue: 0, optQ: 0, optValue: 0, safety: 0 },
    { id: 3, name: "Товар C", sku: "SKU003", purchase: 4.2, margin: 8.5, muWeek: 130, sigmaWeek: 45, revenue: 0, optQ: 0, optValue: 0, safety: 0 },
    { id: 4, name: "Товар D", sku: "SKU004", purchase: 18.5, margin: 35, muWeek: 25, sigmaWeek: 10, revenue: 0, optQ: 0, optValue: 0, safety: 0 },
    { id: 5, name: "Товар E", sku: "SKU005", purchase: 5.0, margin: 12, muWeek: 95, sigmaWeek: 30, revenue: 0, optQ: 0, optValue: 0, safety: 0 },
  ];

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
  const mcDemandLoss = useCallback((units: number, muWeek: number, sigmaWeek: number, weeks: number, trials: number = 1000): number => {
    const mean = muWeek * weeks;
    const std = sigmaWeek * Math.sqrt(weeks);
    let lostSum = 0;
    for (let i = 0; i < trials; i++) {
      const u1 = Math.random(), u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      // Округляем demand до целого числа - мы работаем со штуками
      const demand = Math.round(Math.max(0, mean + std * z));
      lostSum += Math.max(0, demand - units);
    }
    return lostSum / trials;
  }, []);

  // ИСПРАВЛЕНО: Расчет ожидаемой выручки (S - spot price)
  const calculateExpectedRevenue = useCallback((q: number, muWeek: number, sigmaWeek: number, weeks: number, purchase: number, margin: number, rushProb: number, rushSave: number): number => {
    // Ожидаемый спрос за период
    const expectedDemand = muWeek * weeks;
    
    // Рассчитываем потерянные продажи через Monte Carlo
    const lost = mcDemandLoss(q, muWeek, sigmaWeek, weeks);
    
    // Продано через обычный канал
    const normalSales = Math.min(q, Math.max(0, expectedDemand - lost));
    
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
    
    // Эмпирическая формула для волатильности выручки
    // При fillRate = 1, волатильность максимальна
    // При fillRate → 0, волатильность → 0
    const revenueVolatility = cvDemand * Math.sqrt(fillRate);
    
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
      
      for (let q = 0; q <= maxUnits; q += step) {
        // ИСПРАВЛЕНО: Используем новые функции расчета
        const S = calculateExpectedRevenue(q, product.muWeek, product.sigmaWeek, weeks, product.purchase, product.margin, rushProb, rushSave);
        const K = q * product.purchase * (1 + r * weeks / 52) + q * hold * weeks;
        const T = weeks / 52;
        const sigma = calculateVolatility(product.muWeek, product.sigmaWeek, weeks, q);
        
        const { optionValue } = blackScholes(S, K, T, sigma, r);
        const net = optionValue;
        
        if (net > bestNet) { bestNet = net; bestQ = q; }
      }
      
      return {
        ...product,
        optQ: bestQ,
        optValue: bestNet,
        safety: productSafety
      };
    });
  }, [products, rushSave, rushProb, hold, r, weeks, csl, blackScholes, calculateExpectedRevenue, calculateVolatility, invNorm, maxUnits]);

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
      alert('Пожалуйста, заполните название и SKU товара');
      return;
    }

    const existingSku = products.find(p => p.sku === productForm.sku && p.id !== editingProductId);
    if (existingSku) {
      alert('SKU уже существует. Используйте другой SKU.');
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
      safety: 0
    };

    if (editingProductId) {
      setProducts(prev => prev.map(p => p.id === editingProductId ? newProduct : p));
    } else {
      setProducts(prev => [...prev, newProduct]);
    }

    resetProductForm();
  }, [productForm, products, editingProductId, generateNextId]);

  const editProduct = useCallback((product: Product) => {
    setProductForm({
      name: product.name,
      sku: product.sku,
      purchase: product.purchase,
      margin: product.margin,
      muWeek: product.muWeek,
      sigmaWeek: product.sigmaWeek
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
    }
  }, [selectedProduct]);

  const resetProductForm = useCallback(() => {
    setProductForm({
      name: "",
      sku: generateNextSku(),
      purchase: 0,
      margin: 0,
      muWeek: 0,
      sigmaWeek: 0
    });
    setEditingProductId(null);
    setShowProductForm(false);
  }, [generateNextSku]);

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
  const badgeColor = optQ < safety ? "bg-yellow-500 text-white" : optValue > 0 ? "bg-green-500 text-white" : "bg-red-500 text-white";

  // Расчет капитальных затрат и процентов отдельно
  const frozenCapital = optQ * purchase;
  const capitalInterest = optQ * purchase * r * weeks / 52;

  // Компонент слайдера с полем ввода значения
  const SliderWithValue: React.FC<SliderWithValueProps> = ({ label, value, onChange, min, max, step, tooltip, unit = "" }) => {
    const [inputValue, setInputValue] = useState(value.toString());
    
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
          <label className="text-sm font-medium text-gray-700">
            {label}
            {tooltip && (
              <span 
                className="ml-1 px-1 bg-blue-100 text-blue-800 rounded-full text-xs cursor-help"
                title={tooltip}
              >
                ?
              </span>
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

  return (
    <div className="p-6 space-y-6 bg-gray-50 font-sans">
      <h1 className="text-2xl font-bold text-center mb-4">Опционный анализ запаса (Black-Scholes)</h1>
      
      {/* Вкладки */}
      <div className="flex border-b border-gray-200">
        <button 
          className={`px-4 py-2 font-medium text-sm ${activeTab === "assortment" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"}`}
          onClick={() => setActiveTab("assortment")}
        >
          Управление ассортиментом
        </button>
        <button 
          className={`px-4 py-2 font-medium text-sm ${activeTab === "settings" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"}`}
          onClick={() => setActiveTab("settings")}
        >
          Настройки модели
        </button>
        <button 
          className={`px-4 py-2 font-medium text-sm ${activeTab === "productAnalysis" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"} ${!selectedProduct ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => selectedProduct && setActiveTab("productAnalysis")}
          disabled={!selectedProduct}
        >
          Анализ товара {selectedProduct && productsWithMetrics.find(p => p.id === selectedProduct) ? `(${productsWithMetrics.find(p => p.id === selectedProduct)?.name})` : ''}
        </button>
        <button 
          className={`px-4 py-2 font-medium text-sm ${activeTab === "abc" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"} ${products.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => products.length > 0 && setActiveTab("abc")}
          disabled={products.length === 0}
        >
          ABC-анализ
        </button>
        <button 
          className={`px-4 py-2 font-medium text-sm ${activeTab === "theory" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"}`}
          onClick={() => setActiveTab("theory")}
        >
          📚 Теория
        </button>
      </div>
      
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
          <h3 className="text-lg font-semibold mb-4">Параметры модели</h3>
          <p className="text-gray-600 mb-6">
            Эти параметры применяются ко всем товарам в вашем ассортименте. 
            Изменение этих настроек повлияет на расчеты для всех продуктов.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SliderWithValue 
              label="Макс. q, шт" 
              value={maxUnits} 
              onChange={setMaxUnits} 
              min={500} 
              max={5000} 
              step={100} 
              tooltip="Максимальный объем заказа для анализа"
            />
            
            <SliderWithValue 
              label="Rush-saving $/шт" 
              value={rushSave} 
              onChange={setRushSave} 
              min={0} 
              max={10} 
              step={0.1} 
              unit="$"
              tooltip="Дополнительные затраты на единицу товара при rush-поставке (снижение маржи)"
            />
            
            <SliderWithValue 
              label="Вероятность rush" 
              value={rushProb} 
              onChange={setRushProb} 
              min={0} 
              max={1} 
              step={0.01}
              tooltip="Доля lost sales, которые будут закрыты через rush-поставку"
            />
            
            <SliderWithValue 
              label="Хранение $/шт/нед" 
              value={hold} 
              onChange={setHold} 
              min={0.01} 
              max={5} 
              step={0.01} 
              unit="$"
              tooltip="Стоимость хранения единицы товара в неделю"
            />
            
            <SliderWithValue 
              label="Ставка капитала (%/год)" 
              value={r * 100} 
              onChange={v => setR(v / 100)} 
              min={1} 
              max={30} 
              step={0.5} 
              unit="%"
              tooltip="Годовая процентная ставка стоимости капитала"
            />
            
            <SliderWithValue 
              label="Период поставки (недель)" 
              value={weeks} 
              onChange={setWeeks} 
              min={1} 
              max={26} 
              step={1}
              tooltip="Количество недель на выполнение заказа или период анализа"
            />
            
            <SliderWithValue 
              label="Целевой уровень сервиса (CSL)" 
              value={csl} 
              onChange={setCsl} 
              min={0.5} 
              max={0.99} 
              step={0.01}
              tooltip="Целевой уровень сервиса (вероятность удовлетворения спроса)"
            />
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 border-l-4 border-blue-500">
            <h4 className="font-semibold text-blue-800 mb-2">Информация о модели</h4>
            <p className="text-sm text-blue-900">
              Модель использует теорию реальных опционов (Black-Scholes) для определения оптимального уровня запаса. 
              Закупка товара рассматривается как покупка колл-опциона на будущую выручку.
              Индивидуальные параметры товаров (цена, маржа, спрос) настраиваются для каждого SKU отдельно.
            </p>
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
                    onClick={() => editProduct(product)}
                  >
                    Редактировать параметры
                  </button>
                </div>
                
                {/* Основные характеристики товара */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-100 p-3 rounded">
                    <div className="text-sm text-gray-500">Закупочная цена</div>
                    <div className="text-lg font-bold">${product.purchase}</div>
                  </div>
                  <div className="bg-gray-100 p-3 rounded">
                    <div className="text-sm text-gray-500">Маржа</div>
                    <div className="text-lg font-bold">${product.margin}</div>
                  </div>
                  <div className="bg-gray-100 p-3 rounded">
                    <div className="text-sm text-gray-500">Спрос в неделю</div>
                    <div className="text-lg font-bold">{fmt(product.muWeek)} ± {fmt(product.sigmaWeek)}</div>
                  </div>
                  <div className="bg-gray-100 p-3 rounded">
                    <div className="text-sm text-gray-500">Годовая выручка</div>
                    <div className="text-lg font-bold">${fmt(product.revenue)}</div>
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

                {/* График зависимости */}
                <div className="bg-white border rounded-lg p-4">
                  <h4 className="text-md font-semibold mb-4">Зависимость ценности опциона от объёма заказа</h4>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="q"
                          label={{ value: 'Объём заказа, шт', position: 'insideBottom', offset: -5 }}
                        />
                        <YAxis
                          label={{ value: 'Ценность опциона, $', angle: -90, position: 'insideLeft' }}
                          tickFormatter={(value) => fmt(Number(value))}
                        />
                        <Tooltip
                          formatter={(value) => ['$' + fmt(Number(value)), 'Ценность опциона']}
                          labelFormatter={(value) => `Заказ: ${value} шт`}
                        />
                        <ReferenceLine x={product.optQ} stroke="#ff9800" strokeDasharray="3 3" label={{ value: 'q*', position: 'top' }} />
                        <ReferenceLine y={0} stroke="#000" strokeDasharray="3 3" />
                        <ReferenceLine x={product.safety} stroke="#2196f3" strokeDasharray="3 3" label={{ value: 'safety', position: 'bottom' }} />
                        <Line type="monotone" dataKey="value" stroke="#8884d8" activeDot={{ r: 8 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 text-sm text-gray-500">
                    <div className="flex items-center">
                      <div className="w-4 h-0 border-t-2 border-orange-500 border-dashed mr-2"></div>
                      <span>q* — оптимальный объём заказа: {fmt(product.optQ)} шт</span>
                    </div>
                    <div className="flex items-center mt-1">
                      <div className="w-4 h-0 border-t-2 border-blue-500 border-dashed mr-2"></div>
                      <span>safety — минимальный запас для CSL {(csl * 100).toFixed(0)}%: {fmt(product.safety)} шт</span>
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
              <h3 className="text-lg font-semibold">Управление ассортиментом</h3>
              <div className="flex space-x-2">
                <button 
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  onClick={() => {
                    resetProductForm();
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
                <div className="flex space-x-2 mt-4">
                  <button 
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                    onClick={addProduct}
                  >
                    {editingProductId ? 'Сохранить изменения' : 'Добавить товар'}
                  </button>
                  <button 
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                    onClick={resetProductForm}
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
                    resetProductForm();
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
    </div>
  );
};

export default InventoryOptionCalculator;