import React from 'react';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Product, ProductWithCategory } from '../types';
import { formatNumber } from '../utils/mathFunctions';

interface ChartComponentProps {
  products: Product[];
  productsWithMetrics: ProductWithCategory[];
  series: Array<{
    qty: number;
    revenue: number;
    cost: number;
    profit: number;
    optionValue: number;
  }>;
  selectedProductId: number | null;
}

const ChartComponent: React.FC<ChartComponentProps> = ({
  products,
  productsWithMetrics,
  series,
  selectedProductId
}) => {
  const fmt = formatNumber;
  
  // Данные для pie chart категорий
  const categoryData = [
    { name: 'Категория A', value: productsWithMetrics.filter(p => p.category === 'A').length, color: '#10b981' },
    { name: 'Категория B', value: productsWithMetrics.filter(p => p.category === 'B').length, color: '#f59e0b' },
    { name: 'Категория C', value: productsWithMetrics.filter(p => p.category === 'C').length, color: '#ef4444' }
  ].filter(d => d.value > 0);
  
  // Топ-10 товаров по выручке
  const topProducts = [...productsWithMetrics]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(p => ({
      name: p.sku,
      revenue: p.revenue,
      optValue: p.optValue,
      profit: p.revenue - p.optQ * p.purchase
    }));
  
  // Данные для графика запасов по категориям
  const inventoryByCategory = [
    { 
      category: 'A', 
      optimal: productsWithMetrics.filter(p => p.category === 'A').reduce((sum, p) => sum + p.optQ, 0),
      current: productsWithMetrics.filter(p => p.category === 'A').reduce((sum, p) => sum + (p.currentStock || 0), 0),
      value: productsWithMetrics.filter(p => p.category === 'A').reduce((sum, p) => sum + p.optQ * p.purchase, 0)
    },
    { 
      category: 'B', 
      optimal: productsWithMetrics.filter(p => p.category === 'B').reduce((sum, p) => sum + p.optQ, 0),
      current: productsWithMetrics.filter(p => p.category === 'B').reduce((sum, p) => sum + (p.currentStock || 0), 0),
      value: productsWithMetrics.filter(p => p.category === 'B').reduce((sum, p) => sum + p.optQ * p.purchase, 0)
    },
    { 
      category: 'C', 
      optimal: productsWithMetrics.filter(p => p.category === 'C').reduce((sum, p) => sum + p.optQ, 0),
      current: productsWithMetrics.filter(p => p.category === 'C').reduce((sum, p) => sum + (p.currentStock || 0), 0),
      value: productsWithMetrics.filter(p => p.category === 'C').reduce((sum, p) => sum + p.optQ * p.purchase, 0)
    }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* График ценности опциона по количеству */}
      {series.length > 0 && selectedProductId && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-4">Анализ оптимального запаса</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="qty" />
              <YAxis />
              <Tooltip formatter={(value: number) => `₽${fmt(value)}`} />
              <Legend />
              <Line type="monotone" dataKey="optionValue" stroke="#8b5cf6" name="Ценность опциона" strokeWidth={2} />
              <Line type="monotone" dataKey="profit" stroke="#10b981" name="Прибыль" strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      
      {/* ABC распределение */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold mb-4">ABC-распределение ассортимента</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={categoryData}
              cx="50%"
              cy="50%"
              outerRadius={100}
              dataKey="value"
              label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
            >
              {categoryData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      {/* Топ товары по выручке */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold mb-4">Топ-10 товаров по выручке</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={topProducts} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={80} />
            <Tooltip formatter={(value: number) => `₽${fmt(value)}`} />
            <Legend />
            <Bar dataKey="revenue" fill="#3b82f6" name="Выручка" />
            <Bar dataKey="profit" fill="#10b981" name="Прибыль" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {/* Сравнение текущих и оптимальных запасов */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold mb-4">Текущие vs Оптимальные запасы</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={inventoryByCategory}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" />
            <YAxis />
            <Tooltip formatter={(value: number) => fmt(value)} />
            <Legend />
            <Bar dataKey="current" fill="#f59e0b" name="Текущий запас" />
            <Bar dataKey="optimal" fill="#3b82f6" name="Оптимальный запас" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {/* График сезонности для выбранного товара */}
      {selectedProductId && (() => {
        const product = products.find(p => p.id === selectedProductId);
        if (!product?.seasonality?.enabled) return null;
        
        const seasonalData = product.seasonality.monthlyFactors.map((factor, index) => ({
          month: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'][index],
          factor,
          demand: Math.round(product.muWeek * factor * 4.33), // Месячный спрос
          current: index === (product.seasonality?.currentMonth ?? 0)
        }));
        
        return (
          <div className="bg-white p-6 rounded-lg shadow-md lg:col-span-2">
            <h3 className="text-lg font-semibold mb-4">Сезонность спроса: {product.name}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={seasonalData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="demand" 
                  stroke="#8b5cf6" 
                  fill="#8b5cf6" 
                  fillOpacity={0.6}
                  name="Ожидаемый спрос (мес)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="factor" 
                  stroke="#f59e0b" 
                  fill="#f59e0b" 
                  fillOpacity={0.3}
                  name="Сезонный фактор" 
                  yAxisId="right"
                />
                <YAxis yAxisId="right" orientation="right" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      })()}
    </div>
  );
};

export default ChartComponent;