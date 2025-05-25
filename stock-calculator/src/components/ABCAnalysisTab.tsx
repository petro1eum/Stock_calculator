import React, { useMemo } from 'react';
import { ProductWithCategory } from '../types';
import { formatNumber } from '../utils/mathFunctions';

interface ABCAnalysisTabProps {
  products: ProductWithCategory[];
}

const ABCAnalysisTab: React.FC<ABCAnalysisTabProps> = ({ products }) => {
  const fmt = formatNumber;
  
  // Группировка по категориям
  const categorySummary = useMemo(() => {
    const summary = {
      A: { count: 0, revenue: 0, optValue: 0 },
      B: { count: 0, revenue: 0, optValue: 0 },
      C: { count: 0, revenue: 0, optValue: 0 }
    };
    
    products.forEach(product => {
      summary[product.category].count++;
      summary[product.category].revenue += product.revenue;
      summary[product.category].optValue += product.optValue;
    });
    
    return summary;
  }, [products]);
  
  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
  
  const getCategoryColor = (category: 'A' | 'B' | 'C') => {
    switch(category) {
      case 'A': return 'bg-green-100 text-green-800 border-green-200';
      case 'B': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'C': return 'bg-red-100 text-red-800 border-red-200';
    }
  };
  
  const getCategoryDescription = (category: 'A' | 'B' | 'C') => {
    switch(category) {
      case 'A': return 'Высокоприоритетные товары (80% выручки)';
      case 'B': return 'Среднеприоритетные товары (15% выручки)';
      case 'C': return 'Низкоприоритетные товары (5% выручки)';
    }
  };

  if (products.length === 0) {
    return (
      <div className="bg-gray-100 rounded-lg p-8 text-center">
        <p className="text-gray-500 mb-4">Нет данных для ABC-анализа</p>
        <p className="text-sm text-gray-400">
          Добавьте товары в ассортимент для проведения анализа
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Сводка по категориям */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">ABC-анализ ассортимента</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['A', 'B', 'C'] as const).map(category => (
            <div key={category} className={`border rounded-lg p-4 ${getCategoryColor(category)}`}>
              <h4 className="text-xl font-bold mb-2">Категория {category}</h4>
              <p className="text-sm mb-3">{getCategoryDescription(category)}</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Товаров:</span>
                  <span className="font-semibold">{categorySummary[category].count}</span>
                </div>
                <div className="flex justify-between">
                  <span>Выручка:</span>
                  <span className="font-semibold">${fmt(categorySummary[category].revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span>% от общей:</span>
                  <span className="font-semibold">
                    {totalRevenue > 0 ? ((categorySummary[category].revenue / totalRevenue) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Ценность опционов:</span>
                  <span className="font-semibold">${fmt(categorySummary[category].optValue)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Детальная таблица */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">Детальный анализ по товарам</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Категория
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Название
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Годовая выручка
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  % от общей
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Накопленный %
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Оптим. запас
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ценность
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getCategoryColor(product.category)}`}>
                      {product.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {product.sku}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${fmt(product.revenue)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(product.percent * 100).toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(product.accumPercent * 100).toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {fmt(product.optQ)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={product.optValue > 0 ? 'text-green-600' : 'text-red-600'}>
                      ${fmt(product.optValue)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Визуализация Парето */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Диаграмма Парето</h3>
        <div className="space-y-2">
          {products.map((product, index) => (
            <div key={product.id} className="relative">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{product.name}</span>
                <span className="text-sm text-gray-500">{(product.accumPercent * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-6 relative overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    product.category === 'A' ? 'bg-green-500' :
                    product.category === 'B' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${product.percent * 100}%` }}
                />
                {/* Линия накопленного процента */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-gray-800"
                  style={{ left: `${product.accumPercent * 100}%` }}
                />
              </div>
            </div>
          ))}
          {/* Разделители 80% и 95% */}
          <div className="relative h-4 mt-4">
            <div className="absolute top-0 bottom-0 w-0.5 bg-gray-400" style={{ left: '80%' }}>
              <span className="absolute -top-6 -left-4 text-xs text-gray-600">80%</span>
            </div>
            <div className="absolute top-0 bottom-0 w-0.5 bg-gray-400" style={{ left: '95%' }}>
              <span className="absolute -top-6 -left-4 text-xs text-gray-600">95%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Рекомендации */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Рекомендации по управлению ассортиментом</h3>
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-green-600 font-bold">A</span>
            </div>
            <div>
              <h4 className="font-medium">Категория A ({categorySummary.A.count} товаров)</h4>
              <ul className="mt-1 text-sm text-gray-600 space-y-1">
                <li>• Обеспечить постоянное наличие на складе</li>
                <li>• Минимизировать риск дефицита</li>
                <li>• Регулярно пересматривать параметры спроса</li>
                <li>• Приоритет при распределении складского пространства</li>
              </ul>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
              <span className="text-yellow-600 font-bold">B</span>
            </div>
            <div>
              <h4 className="font-medium">Категория B ({categorySummary.B.count} товаров)</h4>
              <ul className="mt-1 text-sm text-gray-600 space-y-1">
                <li>• Поддерживать умеренный уровень запасов</li>
                <li>• Возможны периодические дефициты</li>
                <li>• Оптимизировать размеры заказов</li>
                <li>• Рассмотреть возможность скидок за объем</li>
              </ul>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
              <span className="text-red-600 font-bold">C</span>
            </div>
            <div>
              <h4 className="font-medium">Категория C ({categorySummary.C.count} товаров)</h4>
              <ul className="mt-1 text-sm text-gray-600 space-y-1">
                <li>• Минимальные запасы или работа под заказ</li>
                <li>• Рассмотреть возможность исключения из ассортимента</li>
                <li>• Объединить заказы для снижения затрат</li>
                <li>• Увеличить минимальный объем заказа</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ABCAnalysisTab; 