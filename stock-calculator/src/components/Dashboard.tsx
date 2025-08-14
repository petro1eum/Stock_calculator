import React from 'react';
import { motion } from 'framer-motion';
import { 
  ChartBarIcon, 
  CubeIcon, 
  ArrowTrendingUpIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon
} from '@heroicons/react/24/outline';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { Product, ProductWithCategory, Scenario } from '../types';
import ChartComponent from './ChartComponent';
import RiskPanel from './RiskPanel';

interface DashboardProps {
  products: Product[];
  productsWithMetrics: ProductWithCategory[];
  totalOptimalStock: number;
  totalOptionValue: number;
  series: Array<{
    qty: number;
    revenue: number;
    cost: number;
    profit: number;
    optionValue: number;
  }>;
  selectedProductId: number | null;
  onNavigate: (tab: string) => void;
  calcMethodUsed?: 'closed' | 'mc';
  scenarios?: Scenario[];
  riskConfidence?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  products, 
  productsWithMetrics,
  totalOptimalStock, 
  totalOptionValue, 
  series,
  selectedProductId,
  onNavigate,
  calcMethodUsed,
  scenarios,
  riskConfidence
}) => {
  const totalInvestment = products.reduce((sum, p) => sum + p.optQ * p.purchase, 0);
  const avgROI = totalInvestment > 0 ? (totalOptionValue / totalInvestment) * 100 : 0;
  const criticalProducts = products.filter(p => p.optValue < 0).length;
  const healthyProducts = products.filter(p => p.optValue > 0 && p.optQ >= p.safety).length;
  const warningProducts = products.filter(p => p.optValue > 0 && p.optQ < p.safety).length;
  
  const healthScore = products.length > 0 ? (healthyProducts / products.length) * 100 : 0;

  const metrics = [
    {
      title: 'Общий оптимальный запас',
      value: totalOptimalStock.toLocaleString(),
      unit: 'шт',
      icon: CubeIcon,
      color: 'blue',
      trend: null,
      bgGradient: 'from-blue-500 to-blue-600'
    },
    {
      title: 'Суммарная ценность',
      value: `$${totalOptionValue.toLocaleString()}`,
      unit: '',
      icon: ArrowTrendingUpIcon,
      color: totalOptionValue > 0 ? 'green' : 'red',
      trend: totalOptionValue > 0 ? 'up' : 'down',
      bgGradient: totalOptionValue > 0 ? 'from-green-500 to-green-600' : 'from-red-500 to-red-600'
    },
    {
      title: 'Инвестиции в запасы',
      value: `$${totalInvestment.toLocaleString()}`,
      unit: '',
      icon: ChartBarIcon,
      color: 'purple',
      trend: null,
      bgGradient: 'from-purple-500 to-purple-600'
    },
    {
      title: 'Средний ROI',
      value: avgROI.toFixed(1),
      unit: '%',
      icon: ArrowTrendingUpIcon,
      color: avgROI > 10 ? 'green' : avgROI > 0 ? 'yellow' : 'red',
      trend: avgROI > 10 ? 'up' : avgROI < 0 ? 'down' : null,
      bgGradient: avgROI > 10 ? 'from-green-500 to-green-600' : avgROI > 0 ? 'from-yellow-500 to-yellow-600' : 'from-red-500 to-red-600'
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100
      }
    }
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
        <h1 className="text-3xl font-bold mb-2">Панель управления запасами</h1>
        <p className="text-blue-100">Мониторинг и оптимизация вашего ассортимента в реальном времени</p>
        {calcMethodUsed && (
          <div className="mt-4 inline-flex items-center space-x-2 bg-white/15 backdrop-blur px-3 py-2 rounded-lg">
            <span className="text-xs uppercase tracking-wide text-blue-50">Как мы считаем сейчас</span>
            <span className={`text-xs font-semibold px-2 py-1 rounded ${calcMethodUsed === 'mc' ? 'bg-indigo-500/60' : 'bg-green-500/60'}`}>
              {calcMethodUsed === 'mc' ? 'Monte Carlo' : 'Закрытая формула'}
            </span>
            <span className="text-xs text-blue-50">
              {calcMethodUsed === 'mc' 
                ? 'Прогоняем много маленьких историй, чтобы учесть случайность.' 
                : 'Считаем по готовой формуле — быстро и точно для обычных случаев.'}
            </span>
          </div>
        )}
      </motion.div>

      {/* Key Metrics */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => (
          <motion.div 
            key={index}
            variants={itemVariants}
            whileHover={{ scale: 1.02 }}
            className="bg-white rounded-xl shadow-lg overflow-hidden"
          >
            <div className={`h-2 bg-gradient-to-r ${metric.bgGradient}`} />
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 bg-gradient-to-r ${metric.bgGradient} rounded-lg`}>
                  <metric.icon className="h-6 w-6 text-white" />
                </div>
                {metric.trend && (
                  <div className={`flex items-center text-sm ${metric.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                    {metric.trend === 'up' ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
                  </div>
                )}
              </div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">{metric.title}</h3>
              <p className="text-2xl font-bold text-gray-900">
                {metric.value}<span className="text-sm font-normal text-gray-500 ml-1">{metric.unit}</span>
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Health Score and Product Status */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health Score */}
        <motion.div 
          variants={itemVariants}
          className="bg-white rounded-xl shadow-lg p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Здоровье ассортимента</h3>
          <div className="flex items-center justify-center">
            <div style={{ width: 150, height: 150 }}>
              <CircularProgressbar
                value={healthScore}
                text={`${Math.round(healthScore)}%`}
                styles={buildStyles({
                  pathColor: healthScore > 70 ? '#10b981' : healthScore > 40 ? '#f59e0b' : '#ef4444',
                  textColor: '#1f2937',
                  trailColor: '#e5e7eb',
                  pathTransitionDuration: 0.5,
                })}
              />
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Оптимальных товаров</span>
              <span className="font-semibold text-green-600">{healthyProducts}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Требуют внимания</span>
              <span className="font-semibold text-yellow-600">{warningProducts}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Критических</span>
              <span className="font-semibold text-red-600">{criticalProducts}</span>
            </div>
          </div>
        </motion.div>

        {/* Product Status Distribution */}
        <motion.div 
          variants={itemVariants}
          className="bg-white rounded-xl shadow-lg p-6 lg:col-span-2"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Статус товаров</h3>
          <div className="space-y-4">
            {[
              { label: 'Оптимальные', count: healthyProducts, color: 'green', icon: CheckCircleIcon },
              { label: 'Риск дефицита', count: warningProducts, color: 'yellow', icon: ExclamationTriangleIcon },
              { label: 'Невыгодные', count: criticalProducts, color: 'red', icon: ExclamationTriangleIcon }
            ].map((status, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <status.icon className={`h-5 w-5 mr-2 text-${status.color}-600`} />
                    <span className="text-sm font-medium text-gray-700">{status.label}</span>
                  </div>
                  <span className={`text-sm font-semibold text-${status.color}-600`}>{status.count}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${products.length > 0 ? (status.count / products.length) * 100 : 0}%` }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className={`h-2 rounded-full bg-${status.color}-500`}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* Risk Panel */}
      <motion.div variants={itemVariants}>
        <RiskPanel 
          products={products} 
          confidence={typeof riskConfidence === 'number' ? riskConfidence : 0.95} 
          lookbackWeeks={26} 
          scenarios={scenarios}
        />
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('assortment')}
          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow"
        >
          <CubeIcon className="h-8 w-8 mb-2" />
          <h3 className="font-semibold">Управление товарами</h3>
          <p className="text-sm text-blue-100 mt-1">Добавить или изменить товары</p>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('scenarios')}
          className="bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow"
        >
          <ChartBarIcon className="h-8 w-8 mb-2" />
          <h3 className="font-semibold">Сценарный анализ</h3>
          <p className="text-sm text-purple-100 mt-1">Оценить риски и возможности</p>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('abc')}
          className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow"
        >
          <ArrowTrendingUpIcon className="h-8 w-8 mb-2" />
          <h3 className="font-semibold">ABC-анализ</h3>
          <p className="text-sm text-green-100 mt-1">Приоритизация ассортимента</p>
        </motion.button>
      </motion.div>

      {/* Recent Activity */}
      <motion.div variants={itemVariants} className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Рекомендации</h3>
        <div className="space-y-3">
          {criticalProducts > 0 && (
            <div className="flex items-start p-3 bg-red-50 rounded-lg">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Обратите внимание на критические товары</p>
                <p className="text-sm text-red-700 mt-1">
                  {criticalProducts} товар(ов) имеют отрицательную ценность. Рекомендуем пересмотреть параметры.
                </p>
              </div>
            </div>
          )}
          {warningProducts > 0 && (
            <div className="flex items-start p-3 bg-yellow-50 rounded-lg">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-900">Риск дефицита</p>
                <p className="text-sm text-yellow-700 mt-1">
                  {warningProducts} товар(ов) имеют оптимальный запас ниже страхового. Возможен дефицит.
                </p>
              </div>
            </div>
          )}
          {healthScore > 70 && (
            <div className="flex items-start p-3 bg-green-50 rounded-lg">
              <CheckCircleIcon className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">Отличное состояние</p>
                <p className="text-sm text-green-700 mt-1">
                  Большинство товаров оптимизированы правильно. Продолжайте в том же духе!
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Графики и аналитика */}
      <motion.div variants={itemVariants}>
        <ChartComponent
          products={products}
          productsWithMetrics={productsWithMetrics}
          series={series}
          selectedProductId={selectedProductId}
        />
      </motion.div>
    </motion.div>
  );
};

export default Dashboard; 