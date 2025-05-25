import React, { useState, useMemo } from 'react';
import { Product, Scenario } from '../types';
import { formatNumber } from '../utils/mathFunctions';
import { inverseNormal, blackScholesCall } from '../utils/mathFunctions';
import { calculateExpectedRevenue, calculateVolatility, mcDemandLoss, getEffectivePurchasePrice } from '../utils/inventoryCalculations';

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
  const fmt = formatNumber;
  
  const product = products.find(p => p.id === selectedProduct);
  
  // Расчет для каждого сценария
  const scenarioResults = useMemo(() => {
    if (!product) return [];
    
    return scenarios.map(scenario => {
      const adjustedMuWeek = product.muWeek * scenario.muWeekMultiplier;
      const adjustedSigmaWeek = product.sigmaWeek * scenario.sigmaWeekMultiplier;
      
      // Пересчитываем оптимальные параметры для сценария
      let bestQ = 0, bestNet = -Infinity;
      const step = Math.max(1, Math.round(adjustedMuWeek / 10));
      
      const minQ = product.minOrderQty || 0;
      const maxQ = product.maxStorageQty ? Math.min(maxUnits, product.maxStorageQty) : maxUnits;
      
      for (let q = minQ; q <= maxQ; q += step) {
        const effectivePurchase = getEffectivePurchasePrice(product.purchase, q, product.volumeDiscounts);
        const S = calculateExpectedRevenue(
          q, adjustedMuWeek, adjustedSigmaWeek, weeks, 
          effectivePurchase, product.margin, rushProb, rushSave, 
          mcDemandLoss, monteCarloParams
        );
        const K = q * effectivePurchase * (1 + r * weeks / 52) + q * hold * weeks;
        const T = weeks / 52;
        const sigma = calculateVolatility(adjustedMuWeek, adjustedSigmaWeek, weeks, q);
        const { optionValue } = blackScholesCall(S, K, T, sigma, r);
        
        if (optionValue > bestNet) { 
          bestNet = optionValue; 
          bestQ = q; 
        }
      }
      
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
    </div>
  );
};

export default ScenariosTab; 