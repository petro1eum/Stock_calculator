import React, { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// Типы данных
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

interface ChartPoint {
  q: number;
  value: number;
}

// Добавим типы для SliderWithValue компонента
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

const InventoryCalculator = () => {
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
  const [products, setProducts] = useState<Product[]>([
    { id: 1, name: "Товар A", sku: "SKU001", purchase: 7.5, margin: 18, muWeek: 75, sigmaWeek: 25, revenue: 120000, optQ: 0, optValue: 0, safety: 0 },
    { id: 2, name: "Товар B", sku: "SKU002", purchase: 12.0, margin: 22, muWeek: 55, sigmaWeek: 18, revenue: 95000, optQ: 0, optValue: 0, safety: 0 },
    { id: 3, name: "Товар C", sku: "SKU003", purchase: 4.2, margin: 8.5, muWeek: 130, sigmaWeek: 45, revenue: 85000, optQ: 0, optValue: 0, safety: 0 },
    { id: 4, name: "Товар D", sku: "SKU004", purchase: 18.5, margin: 35, muWeek: 25, sigmaWeek: 10, revenue: 75000, optQ: 0, optValue: 0, safety: 0 },
    { id: 5, name: "Товар E", sku: "SKU005", purchase: 5.0, margin: 12, muWeek: 95, sigmaWeek: 30, revenue: 65000, optQ: 0, optValue: 0, safety: 0 },
  ]);
  
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [abcAnalysisResult, setAbcAnalysisResult] = useState<ProductWithCategory[]>([]);
  
  // Вкладки
  const [activeTab, setActiveTab] = useState("input");

  /* ---------------- helpers ---------------- */
  const cdf = (x: number): number => {
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
  };

  const pdf = (x: number): number => (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);

  // Обратная функция нормального распределения (Hastings, ±4e-4)
  const invNorm = (p: number): number => {
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
  };

  const blackScholes = useCallback((S: number, K: number, T: number, sigma: number, r: number) => {
    if (T <= 0) return { optionValue: Math.max(0, S - K) };
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return {
      optionValue: S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2),
    };
  }, [cdf]);

  // Monte-Carlo ожидание lost-sales при запасе q
  function mcDemandLoss(units: number, muWeek: number, sigmaWeek: number, weeks: number, trials: number = 1000): number {
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
  }

  // Monte-Carlo для расчета относительной волатильности S
  function calcSimpleSigmaBS(muWeek: number, sigmaWeek: number, weeks: number): number {
    // Простая формула для волатильности с защитой от деления на близкие к нулю значения
    const denom = Math.max(1e-6, muWeek * weeks);
    return sigmaWeek * Math.sqrt(weeks) / denom;
  }

  // ABC-анализ ассортимента
  function abcAnalysis(items: Product[]): ProductWithCategory[] {
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
  }

  // Рассчитываем оптимальные параметры для текущего товара
  useEffect(() => {
    // safety-stock
    const z = invNorm(csl);
    setSafety(Math.ceil(z * sigmaWeek * Math.sqrt(weeks)));

    let bestQ = 0, bestNet = -Infinity;
    const pts = [];
    // Делаем шаг динамическим, зависящим от объема спроса (минимум 1)
    const step = Math.max(1, Math.round(muWeek / 10));
    
    // Рассчитываем волатильность упрощенным методом (для стабильности артефакта)
    const sigmaBS = calcSimpleSigmaBS(muWeek, sigmaWeek, weeks);
    
    for (let q = 0; q <= maxUnits; q += step) {
      const lost = Math.round(mcDemandLoss(q, muWeek, sigmaWeek, weeks));
      const served = q - lost;
      const S = served * margin + lost * rushSave * rushProb;
      
      // Исправленная формула для K (затраты в момент исполнения опциона)
      const K = q * purchase * (1 + r * weeks / 52) + q * hold * weeks;
      
      const T = weeks / 52;
      
      // Расчет опционной стоимости с использованием модели Блэка-Шоулза
      const { optionValue } = blackScholes(S, K, T, sigmaBS, r);
      
      // ИСПРАВЛЕНИЕ: Чистая ценность опциона - это просто optionValue,
      // так как в модели Блэка-Шоулза K уже учтен как дисконтированная цена исполнения
      const net = optionValue;
      
      if (net > bestNet) { bestNet = net; bestQ = q; }
      pts.push({ q, value: net });
    }
    setOptQ(bestQ);
    setOptValue(bestNet);
    setSeries(pts);
  }, [maxUnits, purchase, margin, rushSave, rushProb, hold, r, weeks, muWeek, sigmaWeek, csl, blackScholes]);

  // Рассчитываем оптимальные параметры для всего ассортимента
  useEffect(() => {
    const updatedProducts = products.map(product => {
      const z = invNorm(csl);
      const productSafety = Math.ceil(z * product.sigmaWeek * Math.sqrt(weeks));
      
      let bestQ = 0, bestNet = -Infinity;
      // Динамический шаг в зависимости от объема спроса (минимум 1)
      const step = Math.max(1, Math.round(product.muWeek / 10));
      
      // Рассчитываем волатильность упрощенным методом
      const sigmaBS = calcSimpleSigmaBS(product.muWeek, product.sigmaWeek, weeks);
      
      for (let q = 0; q <= 3000; q += step) {
        const lost = Math.round(mcDemandLoss(q, product.muWeek, product.sigmaWeek, weeks));
        const served = q - lost;
        const S = served * product.margin + lost * rushSave * rushProb;
        
        // Исправленная формула для K (затраты в момент исполнения опциона)
        const K = q * product.purchase * (1 + r * weeks / 52) + q * hold * weeks;
        
        const T = weeks / 52;
        
        const { optionValue } = blackScholes(S, K, T, sigmaBS, r);
        // ИСПРАВЛЕНИЕ: Чистая ценность опциона - это просто optionValue
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
    
    setProducts(updatedProducts);
    // Выполняем ABC-анализ
    setAbcAnalysisResult(abcAnalysis(updatedProducts));
  }, [rushSave, rushProb, hold, r, weeks, csl, products, blackScholes]);

  // Загрузка параметров выбранного товара
  const loadProduct = (product: Product) => {
    setSelectedProduct(product.id);
    setPurchase(product.purchase);
    setMargin(product.margin);
    setMuWeek(product.muWeek);
    setSigmaWeek(product.sigmaWeek);
  };

  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const badgeColor = optQ < safety ? "bg-yellow-500 text-white" : optValue > 0 ? "bg-green-500 text-white" : "bg-red-500 text-white";

  // Расчет капитальных затрат и процентов отдельно
  const frozenCapital = optQ * purchase;
  const capitalInterest = optQ * purchase * r * weeks / 52;

  // Компонент слайдера с полем ввода значения
  const SliderWithValue = ({ 
    label,
    value, 
    onChange, 
    min, 
    max, 
    step, 
    tooltip, 
    unit = "" 
  }: SliderWithValueProps) => {
    const [inputValue, setInputValue] = useState(value.toString());
    
    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      onChange(newValue);
      setInputValue(newValue.toString());
    };
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    };
    
    const handleInputBlur = () => {
      let newValue = parseFloat(inputValue);
      if (isNaN(newValue)) {
        newValue = value;
      } else {
        newValue = Math.max(min, Math.min(max, newValue));
      }
      onChange(newValue);
      setInputValue(newValue.toString());
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      <h1 className="text-2xl font-bold text-center mb-4">Опционный анализ запаса (SKU)</h1>
      
      {/* Вкладки */}
      <div className="flex border-b border-gray-200">
        <button 
          className={`px-4 py-2 font-medium text-sm ${activeTab === "input" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"}`}
          onClick={() => setActiveTab("input")}
        >
          Данные
        </button>
        <button 
          className={`px-4 py-2 font-medium text-sm ${activeTab === "chart" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"}`}
          onClick={() => setActiveTab("chart")}
        >
          График Net(q)
        </button>
        <button 
          className={`px-4 py-2 font-medium text-sm ${activeTab === "assortment" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"}`}
          onClick={() => setActiveTab("assortment")}
        >
          Управление ассортиментом
        </button>
        <button 
          className={`px-4 py-2 font-medium text-sm ${activeTab === "abc" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"}`}
          onClick={() => setActiveTab("abc")}
        >
          ABC-анализ
        </button>
      </div>
      
      {/* Вкладка Данные */}
      {activeTab === "input" && (
        <>
          <div className="bg-white rounded-lg shadow-md mb-4 p-4">
            <h3 className="text-lg font-semibold mb-4">Параметры модели</h3>
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
                label="Закуп $/шт" 
                value={purchase} 
                onChange={setPurchase} 
                min={1} 
                max={20} 
                step={0.1} 
                unit="$"
                tooltip="Закупочная стоимость единицы товара"
              />
              
              <SliderWithValue 
                label="Маржа $/шт" 
                value={margin} 
                onChange={setMargin} 
                min={1} 
                max={40} 
                step={0.5} 
                unit="$"
                tooltip="Маржинальная прибыль с единицы товара"
              />
              
              <SliderWithValue 
                label="Rush-saving $/шт" 
                value={rushSave} 
                onChange={setRushSave} 
                min={0} 
                max={10} 
                step={0.1} 
                unit="$"
                tooltip="Экономия на единицу товара при использовании rush-поставки вместо полной потери продажи"
              />
              
              <SliderWithValue 
                label="Вер-ть rush" 
                value={rushProb} 
                onChange={setRushProb} 
                min={0} 
                max={1} 
                step={0.01}
                tooltip="Доля отказов (lost sales), которые будут закрыты через rush-поставку"
              />
              
              <SliderWithValue 
                label="Хранение $/шт" 
                value={hold} 
                onChange={setHold} 
                min={0.1} 
                max={2} 
                step={0.05} 
                unit="$"
                tooltip="Стоимость хранения единицы товара в неделю"
              />
              
              <SliderWithValue 
                label="Ставка r" 
                value={r * 100} 
                onChange={v => setR(v / 100)} 
                min={1} 
                max={20} 
                step={0.5} 
                unit="%"
                tooltip="Годовая процентная ставка стоимости капитала"
              />
              
              <SliderWithValue 
                label="Недель вып." 
                value={weeks} 
                onChange={setWeeks} 
                min={1} 
                max={26} 
                step={1}
                tooltip="Количество недель на выполнение заказа или период анализа"
              />
              
              <SliderWithValue 
                label="Спрос μ, шт/нед" 
                value={muWeek} 
                onChange={setMuWeek} 
                min={10} 
                max={200} 
                step={5}
                tooltip="Средний недельный спрос на товар"
              />
              
              <SliderWithValue 
                label="Спрос σ, шт/нед" 
                value={sigmaWeek} 
                onChange={setSigmaWeek} 
                min={1} 
                max={100} 
                step={1}
                tooltip="Стандартное отклонение недельного спроса"
              />
              
              <SliderWithValue 
                label="Целевой CSL" 
                value={csl} 
                onChange={setCsl} 
                min={0.5} 
                max={0.99} 
                step={0.01}
                tooltip="Целевой уровень сервиса (вероятность удовлетворения спроса)"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg shadow-md">
              <div className="p-4">
                <h3 className="text-lg font-semibold mb-4">Оптимальные параметры</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col items-center justify-center bg-gray-100 p-4 rounded-lg">
                    <span className="text-sm text-gray-500 mb-1">Оптимальный объём заказа</span>
                    <span className={`py-1 px-3 rounded-full text-xl font-bold ${badgeColor}`}>
                      {fmt(optQ)} шт
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center bg-gray-100 p-4 rounded-lg">
                    <span className="text-sm text-gray-500 mb-1">Чистая ценность опциона</span>
                    <span className={`text-xl font-bold ${optValue > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${fmt(optValue)}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center bg-gray-100 p-4 rounded-lg">
                    <span className="text-sm text-gray-500 mb-1">Safety-stock при CSL {(csl * 100).toFixed(0)}%</span>
                    <span className="text-xl font-bold">{fmt(safety)} шт</span>
                  </div>
                  <div className="flex flex-col items-center justify-center bg-gray-100 p-4 rounded-lg">
                    <span className="text-sm text-gray-500 mb-1">Спрос за период</span>
                    <span className="text-xl font-bold">{fmt(muWeek * weeks)} ± {fmt(sigmaWeek * Math.sqrt(weeks))}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center bg-gray-100 p-4 rounded-lg">
                    <span className="text-sm text-gray-500 mb-1">Замороженный капитал</span>
                    <span className="text-xl font-bold">${fmt(frozenCapital)}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center bg-gray-100 p-4 rounded-lg">
                    <span className="text-sm text-gray-500 mb-1">Стоимость хранения</span>
                    <span className="text-xl font-bold">${fmt(optQ * hold * weeks)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md">
              <div className="p-4">
                <h3 className="text-lg font-semibold mb-2">Рекомендации</h3>
                {optValue <= 0 ? (
                  <div className="p-4 mb-2 bg-red-50 border-l-4 border-red-500 text-red-700">
                    <h4 className="font-semibold">Отрицательная ценность опциона</h4>
                    <p>Запасать товар невыгодно при текущих параметрах. Рассмотрите возможность замены поставщика или увеличения маржи.</p>
                  </div>
                ) : optQ < safety ? (
                  <div className="p-4 mb-2 bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700">
                    <h4 className="font-semibold">Внимание</h4>
                    <p>Оптимальный запас ниже уровня safety-stock. Высокий риск stockout. Рекомендуется увеличить запас до {fmt(safety)} шт.</p>
                  </div>
                ) : (
                  <div className="p-4 mb-2 bg-green-50 border-l-4 border-green-500 text-green-700">
                    <h4 className="font-semibold">Оптимальный заказ найден</h4>
                    <p>Запас {fmt(optQ)} шт максимизирует экономический эффект. Ожидаемая чистая прибыль ${fmt(optValue)}.</p>
                  </div>
                )}
                
                <div className="mt-4">
                  <h4 className="font-medium mb-2">Ключевые метрики</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Оборачиваемость:</div>
                    <div className="font-medium">{(52 / weeks).toFixed(1)}x в год</div>
                    <div>Проценты на капитал:</div>
                    <div className="font-medium">${fmt(capitalInterest)}</div>
                    <div>Общие затраты:</div>
                    <div className="font-medium">${fmt(frozenCapital + capitalInterest + optQ * hold * weeks)}</div>
                    <div>Вероятность rush:</div>
                    <div className="font-medium">{(rushProb * 100).toFixed(0)}% потерянных продаж</div>
                  </div>
                </div>
                
                <div className="p-4 bg-blue-50 border-l-4 border-blue-500 mt-6">
                  <h3 className="font-semibold text-blue-800 mb-2">Техническая информация о модели</h3>
                  <p className="text-sm text-blue-900">
                    Модель использует подход реальных опционов, где решение о заказе рассматривается как опцион колл.
                    Оптимальное количество товара (q*) максимизирует ценность опциона от заказа.
                  </p>
                  <ul className="text-sm text-blue-900 list-disc ml-4 mt-2">
                    <li>S (актив) - ожидаемая выгода от наличия товара</li>
                    <li>K (страйк) - затраты, связанные с заказом и хранением товара</li>
                    <li>σ - относительное стандартное отклонение S</li>
                    <li>Чистая ценность опциона = опционная премия</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      
      {/* Вкладка График */}
      {activeTab === "chart" && (
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-4">Зависимость экономического эффекта от объёма заказа</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="q"
                    label={{ value: 'Объём заказа, шт', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis
                    label={{ value: 'Чистый эффект, $', angle: -90, position: 'insideLeft' }}
                    tickFormatter={(value) => fmt(value)}
                  />
                  <Tooltip
                    formatter={(value: any) => ['$' + fmt(Number(value)), 'Чистый эффект']}
                    labelFormatter={(value: any) => `Заказ: ${value} шт`}
                  />
                  <ReferenceLine x={optQ} stroke="#ff9800" strokeDasharray="3 3" label={{ value: 'q*', position: 'top' }} />
                  <ReferenceLine y={0} stroke="#000" strokeDasharray="3 3" />
                  <ReferenceLine x={safety} stroke="#2196f3" strokeDasharray="3 3" label={{ value: 'safety', position: 'bottom' }} />
                  <Line type="monotone" dataKey="value" stroke="#8884d8" activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 text-sm text-gray-500">
              <div className="flex items-center">
                <div className="w-4 h-0 border-t-2 border-orange-500 border-dashed mr-2"></div>
                <span>q* — оптимальный объём заказа: {fmt(optQ)} шт</span>
              </div>
              <div className="flex items-center mt-1">
                <div className="w-4 h-0 border-t-2 border-blue-500 border-dashed mr-2"></div>
                <span>safety — минимальный запас для CSL {(csl * 100).toFixed(0)}%: {fmt(safety)} шт</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Вкладка Управление ассортиментом */}
      {activeTab === "assortment" && (
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-4">Анализ ассортимента</h3>
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
                  {products.map((product) => (
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
                        <button 
                          className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                          onClick={() => loadProduct(product)}
                        >
                          Загрузить
                        </button>
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
                  <div className="text-xl font-bold">{products.length}</div>
                </div>
                <div className="bg-gray-100 p-4 rounded-lg">
                  <div className="text-sm text-gray-500 mb-1">Общий оптимальный запас</div>
                  <div className="text-xl font-bold">{fmt(products.reduce((sum, p) => sum + p.optQ, 0))} шт</div>
                </div>
                <div className="bg-gray-100 p-4 rounded-lg">
                  <div className="text-sm text-gray-500 mb-1">Суммарная ценность опционов</div>
                  <div className="text-xl font-bold">${fmt(products.reduce((sum, p) => sum + p.optValue, 0))}</div>
                </div>
              </div>
            </div>
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

export default InventoryCalculator;