import React, { useState, useMemo } from 'react';
import { Product, Scenario } from '../types';
import { PortfolioConstraints, PortfolioAllocation } from '../types/portfolio';
import { formatNumber } from '../utils/mathFunctions';
import { inverseNormal, blackScholesCall } from '../utils/mathFunctions';
<<<<<<< HEAD
import { calculateExpectedRevenue, calculateVolatility, mcDemandLoss, getEffectivePurchasePrice, optimizeQuantity } from '../utils/inventoryCalculations';
=======
import { calculateExpectedRevenue, calculateVolatility, mcDemandLoss, getEffectivePurchasePrice } from '../utils/inventoryCalculations';
>>>>>>> feba5701a4ce16c9be0fd3d343f2f4f1799a7d94
import { PortfolioOptimizer } from '../utils/portfolioOptimization';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Scatter, ScatterChart } from 'recharts';

interface ScenariosTabProps {
  products: Product[];
  scenarios: Scenario[];
  maxUnits: number;
  rushProb: number;
  rushSave: number;
  hold: number;
  r: number;
  weeks: number;
  csl: number;
  monteCarloParams: any;
}

const ScenariosTab: React.FC<ScenariosTabProps> = ({
  products,
  scenarios,
  maxUnits,
  rushProb,
  rushSave,
  hold,
  r,
  weeks,
  csl,
  monteCarloParams
}) => {
  const [selectedProduct, setSelectedProduct] = useState<number | null>(products[0]?.id || null);
  const [activeView, setActiveView] = useState<'scenarios' | 'portfolio'>('scenarios');
  
  // Состояние для портфельной оптимизации
  const [portfolioConstraints, setPortfolioConstraints] = useState<PortfolioConstraints>({
    totalBudget: 1000000, // 1 млн руб
    warehouseCapacity: 10000, // 10000 единиц
    maxSuppliers: 5,
    minOrderValue: 10000, // мин заказ 10к руб
    targetServiceLevel: 0.95
  });
  
  const fmt = formatNumber;
  
  const product = products.find(p => p.id === selectedProduct);
  
  // Расчет для каждого сценария
  const scenarioResults = useMemo(() => {
    if (!product) return [];
    
    return scenarios.map(scenario => {
      const adjustedMuWeek = product.muWeek * scenario.muWeekMultiplier;
      const adjustedSigmaWeek = product.sigmaWeek * scenario.sigmaWeekMultiplier;
      
      // Пересчитываем оптимальные параметры для сценария
      const step = Math.max(1, Math.round(adjustedMuWeek / 10));
      
      const minQ = product.minOrderQty || 0;
      const maxQ = product.maxStorageQty ? Math.min(maxUnits, product.maxStorageQty) : maxUnits;
      
      const evaluateQ = (q: number) => {
        const effectivePurchase = getEffectivePurchasePrice(product.purchase, q, product.volumeDiscounts);
        const S = calculateExpectedRevenue(
          q, adjustedMuWeek, adjustedSigmaWeek, weeks, 
          effectivePurchase, product.margin, rushProb, rushSave, 
          mcDemandLoss, monteCarloParams
        );
        const K = q * effectivePurchase * (1 + r * weeks / 52) + q * hold * weeks;
        const T = weeks / 52;
        const sigma = calculateVolatility(adjustedMuWeek, adjustedSigmaWeek, weeks, q, rushProb, product.currency, product.supplier);
        const { optionValue } = blackScholesCall(S, K, T, sigma, r);
        return optionValue;
      };
      const { bestQ, bestValue: bestNet } = optimizeQuantity(minQ, maxQ, step, evaluateQ);
      
      const z = inverseNormal(csl);
      const safety = Math.ceil(z * adjustedSigmaWeek * Math.sqrt(weeks));
      
      return {
        scenario,
        optQ: bestQ,
        optValue: bestNet,
        safety,
        expectedDemand: adjustedMuWeek * weeks,
        demandStd: adjustedSigmaWeek * Math.sqrt(weeks)
      };
    });
  }, [product, scenarios, maxUnits, rushProb, rushSave, hold, r, weeks, csl, monteCarloParams]);
  
  // Взвешенные оптимальные параметры
  const weightedOptimal = useMemo(() => {
    if (scenarioResults.length === 0) return { optQ: 0, optValue: 0, safety: 0 };
    
    const weightedQ = scenarioResults.reduce((sum, result) => 
      sum + result.optQ * result.scenario.probability, 0
    );
    
    const weightedValue = scenarioResults.reduce((sum, result) => 
      sum + result.optValue * result.scenario.probability, 0
    );
    
    const weightedSafety = scenarioResults.reduce((sum, result) => 
      sum + result.safety * result.scenario.probability, 0
    );
    
    return {
      optQ: Math.round(weightedQ),
      optValue: weightedValue,
      safety: Math.round(weightedSafety)
    };
  }, [scenarioResults]);
  
  // Портфельная оптимизация
  const portfolioOptimization = useMemo(() => {
    if (products.length === 0) return null;
    
    const optimizer = new PortfolioOptimizer(
      products,
      portfolioConstraints,
      rushProb,
      rushSave,
      hold,
      r,
      weeks,
      monteCarloParams
    );
    
    const optimal = optimizer.optimize();
    const frontier = optimizer.buildEfficientFrontier(15);
    const schedule = optimizer.createDeliverySchedule(optimal.allocations);
    
    // Текущее состояние (просто сумма оптимальных количеств)
    const current: PortfolioAllocation = {
      allocations: new Map(products.map(p => [p.id, p.optQ || 0])),
      totalInvestment: products.reduce((sum, p) => sum + (p.optQ || 0) * p.purchase, 0),
      expectedReturn: products.reduce((sum, p) => sum + (p.optValue || 0), 0),
      portfolioRisk: 0.3, // примерное значение
      currencyExposure: new Map([['RUB', products.reduce((sum, p) => sum + (p.optQ || 0) * p.purchase, 0)]]),
      supplierConcentration: new Map([['domestic', 1.0]])
    };
    
    return {
      current,
      optimal,
      frontier,
      schedule,
      improvement: {
        roi: ((optimal.expectedReturn - optimal.totalInvestment) / optimal.totalInvestment - 
              (current.expectedReturn - current.totalInvestment) / current.totalInvestment) * 100,
        risk: (optimal.portfolioRisk - current.portfolioRisk) / current.portfolioRisk * 100,
        capital: optimal.totalInvestment - current.totalInvestment
      }
    };
  }, [products, portfolioConstraints, rushProb, rushSave, hold, r, weeks, monteCarloParams]);
  
  if (products.length === 0) {
    return (
      <div className="bg-gray-100 rounded-lg p-8 text-center">
        <p className="text-gray-500 mb-4">Нет товаров для анализа</p>
        <p className="text-sm text-gray-400">
          Добавьте товары в ассортимент для проведения сценарного анализа
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Переключатель режимов */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveView('scenarios')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeView === 'scenarios' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Сценарный анализ
          </button>
          <button
            onClick={() => setActiveView('portfolio')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeView === 'portfolio' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Портфельная оптимизация
          </button>
        </div>
      </div>

      {activeView === 'scenarios' ? (
        <>
          {/* Выбор товара */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Сценарный анализ</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Выберите товар для анализа
              </label>
              <select
                value={selectedProduct || ''}
                onChange={(e) => setSelectedProduct(Number(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
            
            {product && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded">
                <div>
                  <span className="text-sm text-gray-600">Базовый спрос/нед:</span>
                  <div className="font-semibold">{fmt(product.muWeek)} ± {fmt(product.sigmaWeek)}</div>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Закуп/Маржа:</span>
                  <div className="font-semibold">${product.purchase} / ${product.margin}</div>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Текущий оптимум:</span>
                  <div className="font-semibold">{fmt(product.optQ)} шт</div>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Ценность опциона:</span>
                  <div className="font-semibold">${fmt(product.optValue)}</div>
                </div>
              </div>
            )}
          </div>
          
          {/* Результаты по сценариям */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">Результаты по сценариям</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Сценарий
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Вероятность
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ожид. спрос
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Станд. откл.
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Оптим. запас
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Safety stock
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ценность опциона
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {scenarioResults.map((result, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {result.scenario.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(result.scenario.probability * 100).toFixed(0)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {fmt(result.expectedDemand)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {fmt(result.demandStd)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          result.scenario.name === 'Пессимистичный' ? 'bg-red-100 text-red-800' :
                          result.scenario.name === 'Оптимистичный' ? 'bg-green-100 text-green-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {fmt(result.optQ)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {fmt(result.safety)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={result.optValue > 0 ? 'text-green-600' : 'text-red-600'}>
                          ${fmt(result.optValue)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Взвешенный результат */}
                  <tr className="bg-blue-50 font-semibold">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-900">
                      Взвешенный оптимум
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-900">
                      100%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-900">
                      —
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-900">
                      —
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-600 text-white">
                        {fmt(weightedOptimal.optQ)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-900">
                      {fmt(weightedOptimal.safety)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-900">
                      ${fmt(weightedOptimal.optValue)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Визуализация сравнения */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Сравнение решений</h3>
            <div className="space-y-4">
              {/* Оптимальный запас по сценариям */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Оптимальный запас</h4>
                <div className="space-y-2">
                  {scenarioResults.map((result, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <span className="w-32 text-sm">{result.scenario.name}:</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                        <div
                          className={`h-full rounded-full ${
                            result.scenario.name === 'Пессимистичный' ? 'bg-red-500' :
                            result.scenario.name === 'Оптимистичный' ? 'bg-green-500' :
                            'bg-blue-500'
                          }`}
                          style={{ width: `${(result.optQ / Math.max(...scenarioResults.map(r => r.optQ))) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 text-sm text-right">{fmt(result.optQ)}</span>
                    </div>
                  ))}
                  <div className="flex items-center space-x-2 pt-2 border-t">
                    <span className="w-32 text-sm font-semibold">Взвешенный:</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                      <div
                        className="h-full rounded-full bg-purple-600"
                        style={{ width: `${(weightedOptimal.optQ / Math.max(...scenarioResults.map(r => r.optQ))) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 text-sm text-right font-semibold">{fmt(weightedOptimal.optQ)}</span>
                  </div>
                </div>
              </div>
              
              {/* Ценность опциона по сценариям */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Ценность опциона</h4>
                <div className="space-y-2">
                  {scenarioResults.map((result, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <span className="w-32 text-sm">{result.scenario.name}:</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                        <div
                          className={`h-full rounded-full ${
                            result.scenario.name === 'Пессимистичный' ? 'bg-red-500' :
                            result.scenario.name === 'Оптимистичный' ? 'bg-green-500' :
                            'bg-blue-500'
                          }`}
                          style={{ width: `${Math.max(0, (result.optValue / Math.max(...scenarioResults.map(r => r.optValue))) * 100)}%` }}
                        />
                      </div>
                      <span className="w-20 text-sm text-right">${fmt(result.optValue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* Рекомендации */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Рекомендации</h3>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border-l-4 border-blue-500">
                <h4 className="font-medium text-blue-900 mb-2">Взвешенное решение</h4>
                <p className="text-sm text-blue-800">
                  Рекомендуемый заказ с учетом всех сценариев: <strong>{fmt(weightedOptimal.optQ)} единиц</strong>
                </p>
                <p className="text-sm text-blue-800 mt-1">
                  Это решение учитывает вероятности всех сценариев и минимизирует риски.
                </p>
              </div>
              
              {weightedOptimal.optQ < scenarioResults.find(r => r.scenario.name === 'Оптимистичный')?.optQ! && (
                <div className="p-4 bg-yellow-50 border-l-4 border-yellow-500">
                  <h4 className="font-medium text-yellow-900 mb-2">Упущенная выгода</h4>
                  <p className="text-sm text-yellow-800">
                    При оптимистичном сценарии вы можете упустить потенциальную прибыль из-за недостатка запасов.
                  </p>
                </div>
              )}
              
              {weightedOptimal.optQ > scenarioResults.find(r => r.scenario.name === 'Пессимистичный')?.optQ! && (
                <div className="p-4 bg-orange-50 border-l-4 border-orange-500">
                  <h4 className="font-medium text-orange-900 mb-2">Риск затоваривания</h4>
                  <p className="text-sm text-orange-800">
                    При пессимистичном сценарии возможны излишки запасов. Рассмотрите возможность поэтапных закупок.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Портфельная оптимизация */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Настройки портфеля</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Общий бюджет (₽)
                </label>
                <input
                  type="number"
                  value={portfolioConstraints.totalBudget}
                  onChange={(e) => setPortfolioConstraints(prev => ({
                    ...prev,
                    totalBudget: Number(e.target.value)
                  }))}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Вместимость склада (ед.)
                </label>
                <input
                  type="number"
                  value={portfolioConstraints.warehouseCapacity}
                  onChange={(e) => setPortfolioConstraints(prev => ({
                    ...prev,
                    warehouseCapacity: Number(e.target.value)
                  }))}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Макс. поставщиков
                </label>
                <input
                  type="number"
                  value={portfolioConstraints.maxSuppliers || 0}
                  onChange={(e) => setPortfolioConstraints(prev => ({
                    ...prev,
                    maxSuppliers: Number(e.target.value)
                  }))}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          </div>

          {portfolioOptimization && (
            <>
              {/* Сравнение текущего и оптимального портфеля */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold mb-4">Сравнение портфелей</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Текущий портфель */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-700 mb-3">Текущий портфель</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Инвестиции:</span>
                        <span className="font-medium">₽{fmt(portfolioOptimization.current.totalInvestment)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Ожид. доход:</span>
                        <span className="font-medium">₽{fmt(portfolioOptimization.current.expectedReturn)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">ROI:</span>
                        <span className="font-medium">
                          {((portfolioOptimization.current.expectedReturn - portfolioOptimization.current.totalInvestment) / 
                            portfolioOptimization.current.totalInvestment * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Риск:</span>
                        <span className="font-medium">{(portfolioOptimization.current.portfolioRisk * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Оптимальный портфель */}
                  <div className="bg-blue-50 rounded-lg p-4">
                    <h4 className="font-medium text-blue-700 mb-3">Оптимальный портфель</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-600">Инвестиции:</span>
                        <span className="font-medium">₽{fmt(portfolioOptimization.optimal.totalInvestment)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-600">Ожид. доход:</span>
                        <span className="font-medium">₽{fmt(portfolioOptimization.optimal.expectedReturn)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-600">ROI:</span>
                        <span className="font-medium">
                          {((portfolioOptimization.optimal.expectedReturn - portfolioOptimization.optimal.totalInvestment) / 
                            portfolioOptimization.optimal.totalInvestment * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-blue-600">Риск:</span>
                        <span className="font-medium">{(portfolioOptimization.optimal.portfolioRisk * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Улучшения */}
                  <div className="bg-green-50 rounded-lg p-4">
                    <h4 className="font-medium text-green-700 mb-3">Улучшения</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-green-600">ROI:</span>
                        <span className={`font-medium ${portfolioOptimization.improvement.roi > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {portfolioOptimization.improvement.roi > 0 ? '+' : ''}{portfolioOptimization.improvement.roi.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-green-600">Риск:</span>
                        <span className={`font-medium ${portfolioOptimization.improvement.risk < 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {portfolioOptimization.improvement.risk.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-green-600">Капитал:</span>
                        <span className="font-medium">
                          {portfolioOptimization.improvement.capital > 0 ? '+' : ''}₽{fmt(portfolioOptimization.improvement.capital)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* График эффективной границы */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold mb-4">Эффективная граница</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="risk" 
                        label={{ value: 'Риск (%)', position: 'insideBottom', offset: -10 }}
                        tickFormatter={(value) => `${(value * 100).toFixed(0)}`}
                      />
                      <YAxis 
                        dataKey="return" 
                        label={{ value: 'Доходность (%)', angle: -90, position: 'insideLeft' }}
                        tickFormatter={(value) => `${(value * 100).toFixed(0)}`}
                      />
                      <Tooltip 
                        formatter={(value: number, name: string) => {
                          if (name === 'risk' || name === 'return') {
                            return `${(value * 100).toFixed(1)}%`;
                          }
                          return value;
                        }}
                      />
                      
                      {/* Эффективная граница */}
                      <Line
                        data={portfolioOptimization.frontier}
                        type="monotone"
                        dataKey="return"
                        stroke="#8884d8"
                        strokeWidth={2}
                        dot={false}
                        name="Эффективная граница"
                      />
                      
                      {/* Точки портфелей */}
                      <Scatter
                        data={[
                          {
                            risk: portfolioOptimization.current.portfolioRisk,
                            return: (portfolioOptimization.current.expectedReturn - portfolioOptimization.current.totalInvestment) / 
                                   portfolioOptimization.current.totalInvestment,
                            name: 'Текущий'
                          },
                          {
                            risk: portfolioOptimization.optimal.portfolioRisk,
                            return: (portfolioOptimization.optimal.expectedReturn - portfolioOptimization.optimal.totalInvestment) / 
                                   portfolioOptimization.optimal.totalInvestment,
                            name: 'Оптимальный'
                          }
                        ]}
                        fill="#82ca9d"
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Детальная аллокация */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <h3 className="text-lg font-semibold">Оптимальная аллокация</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Товар
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Текущее кол-во
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Оптим. кол-во
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Изменение
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Инвестиции
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ожид. доход
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {products.map(product => {
                        const currentQty = portfolioOptimization.current.allocations.get(product.id) || 0;
                        const optimalQty = portfolioOptimization.optimal.allocations.get(product.id) || 0;
                        const change = optimalQty - currentQty;
                        
                        return (
                          <tr key={product.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {product.name} ({product.sku})
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {fmt(currentQty)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className="font-medium">{fmt(optimalQty)}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <span className={change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500'}>
                                {change > 0 ? '+' : ''}{fmt(change)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              ₽{fmt(optimalQty * product.purchase)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              ₽{fmt(product.optValue * optimalQty / (product.optQ || 1))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Календарь поставок */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <h3 className="text-lg font-semibold">Календарь поставок</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Неделя
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Поставщик
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Кол-во товаров
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Общая сумма
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {portfolioOptimization.schedule.map((delivery, index) => {
                        const groupedBySupplier = delivery.orders.reduce((acc, order) => {
                          if (!acc[order.supplier]) {
                            acc[order.supplier] = { count: 0, value: 0 };
                          }
                          acc[order.supplier].count++;
                          acc[order.supplier].value += order.totalValue;
                          return acc;
                        }, {} as Record<string, { count: number; value: number }>);
                        
                        return Object.entries(groupedBySupplier).map(([supplier, data], subIndex) => (
                          <tr key={`${index}-${subIndex}`} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {delivery.week.toLocaleDateString('ru-RU', { 
                                day: 'numeric', 
                                month: 'short', 
                                year: 'numeric' 
                              })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {supplier}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {data.count}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              ₽{fmt(data.value)}
                            </td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Рекомендации по портфелю */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold mb-4">Рекомендации по портфелю</h3>
                <div className="space-y-4">
                  {portfolioOptimization.improvement.roi > 10 && (
                    <div className="p-4 bg-green-50 border-l-4 border-green-500">
                      <h4 className="font-medium text-green-900 mb-2">Высокий потенциал улучшения</h4>
                      <p className="text-sm text-green-800">
                        Оптимизация портфеля может увеличить ROI на {portfolioOptimization.improvement.roi.toFixed(1)}%. 
                        Рекомендуем пересмотреть текущую структуру закупок.
                      </p>
                    </div>
                  )}
                  
                  {portfolioOptimization.improvement.risk < -10 && (
                    <div className="p-4 bg-blue-50 border-l-4 border-blue-500">
                      <h4 className="font-medium text-blue-900 mb-2">Снижение риска</h4>
                      <p className="text-sm text-blue-800">
                        Диверсификация портфеля снизит риск на {Math.abs(portfolioOptimization.improvement.risk).toFixed(1)}%.
                        Это обеспечит более стабильные результаты.
                      </p>
                    </div>
                  )}
                  
                  {Array.from(portfolioOptimization.optimal.currencyExposure).length > 1 && (
                    <div className="p-4 bg-yellow-50 border-l-4 border-yellow-500">
                      <h4 className="font-medium text-yellow-900 mb-2">Валютная диверсификация</h4>
                      <p className="text-sm text-yellow-800">
                        Портфель включает товары в разных валютах. Рассмотрите хеджирование валютных рисков.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ScenariosTab; 