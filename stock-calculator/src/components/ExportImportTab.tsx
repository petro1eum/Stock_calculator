import React from 'react';
import { Product } from '../types';
import toast from 'react-hot-toast';
import { usePortfolioSettings } from '../contexts/PortfolioSettingsContext';

interface ExportImportTabProps {
  products: Product[];
  productsWithMetrics: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  exportToCSV: () => void;
  importFromCSV: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const ExportImportTab: React.FC<ExportImportTabProps> = ({
  products,
  productsWithMetrics,
  setProducts,
  exportToCSV,
  importFromCSV
}) => {
  const portfolioSettings = usePortfolioSettings();

  const exportToJSON = () => {
    if (products.length === 0) {
      toast.error('Нет данных для экспорта');
      return;
    }
    
    const exportData = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      products: productsWithMetrics.map(p => ({
        ...p,
        optQ: undefined,
        optValue: undefined,
        safety: undefined,
        revenue: undefined
      })),
      portfolioSettings: portfolioSettings ? {
        currencies: portfolioSettings.currencies,
        suppliers: portfolioSettings.suppliers,
        categories: portfolioSettings.categories,
        correlationRules: portfolioSettings.correlationRules
      } : undefined
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_data_${new Date().toISOString().split('T')[0]}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Данные экспортированы в JSON (включая настройки портфеля)');
  };

  const importFromJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        
        if (!data.products || !Array.isArray(data.products)) {
          toast.error('Неверный формат файла');
          return;
        }
        
        const importedProducts: Product[] = data.products.map((p: any, index: number) => ({
          id: index + 1,
          name: p.name || 'Без названия',
          sku: p.sku || `SKU${(index + 1).toString().padStart(3, '0')}`,
          purchase: p.purchase || 0,
          margin: p.margin || 0,
          muWeek: p.muWeek || 0,
          sigmaWeek: p.sigmaWeek || 0,
          revenue: 0,
          optQ: 0,
          optValue: 0,
          safety: 0,
          currentStock: p.currentStock || 0,
          seasonality: p.seasonality || { enabled: false, monthlyFactors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], currentMonth: 0 },
          shelfLife: p.shelfLife,
          minOrderQty: p.minOrderQty,
          maxStorageQty: p.maxStorageQty,
          volumeDiscounts: p.volumeDiscounts,
          currency: p.currency || 'RUB',
          supplier: p.supplier || 'domestic',
          category: p.category || '',
          volume: p.volume
        }));
        
        importedProducts.forEach(p => {
          p.revenue = p.muWeek * (p.purchase + p.margin) * 52;
        });
        
        setProducts(importedProducts);
        
        if (data.portfolioSettings && portfolioSettings) {
          if (data.portfolioSettings.currencies) {
            portfolioSettings.setCurrencies(data.portfolioSettings.currencies);
          }
          if (data.portfolioSettings.suppliers) {
            portfolioSettings.setSuppliers(data.portfolioSettings.suppliers);
          }
          if (data.portfolioSettings.categories) {
            portfolioSettings.setCategories(data.portfolioSettings.categories);
          }
          if (data.portfolioSettings.correlationRules) {
            portfolioSettings.setCorrelationRules(data.portfolioSettings.correlationRules);
          }
          toast.success(`Импортировано ${importedProducts.length} товаров и настройки портфеля`);
        } else {
          toast.success(`Импортировано ${importedProducts.length} товаров`);
        }
      } catch (error) {
        toast.error('Ошибка при чтении файла');
      }
    };
    
    reader.readAsText(file);
    event.target.value = '';
  };

  const generateSampleCSV = () => {
    const headers = 'SKU,Название,Закупочная цена,Маржа,Средний спрос/нед,Станд. откл./нед,Срок годности (нед),Мин. заказ,Макс. склад,Валюта,Поставщик,Категория,Объем,Текущий запас,Сезонность включена,"Сезонные факторы (через ;)",Текущий месяц';
    const sample = [
      headers,
      'SKU001,iPhone 15 Case,7.5,18,75,25,,,USD,china,Электроника,0.001,0,нет,,',
      'SKU002,Samsung TV 55",12.0,22,55,18,52,10,500,EUR,europe,Электроника,0.15,0,нет,,',
      'SKU003,Футболка Uniqlo,4.2,8.5,130,45,26,,1000,CNY,china,Одежда,0.002,50,да,"0.5;0.5;0.8;1.2;1.5;2.0;2.0;1.8;1.2;0.8;0.5;0.5",6'
    ].join('\n');
    
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'sample_inventory_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Шаблон CSV скачан');
  };

  return (
    <div className="space-y-6">
      {/* Экспорт данных */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Экспорт данных</h3>
        <p className="text-gray-600 mb-4">
          Экспортируйте ваши данные для резервного копирования или анализа в других программах.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium mb-2">CSV формат</h4>
            <p className="text-sm text-gray-600 mb-4">
              Универсальный формат для Excel, Google Sheets и других таблиц
            </p>
            <button
              onClick={exportToCSV}
              disabled={products.length === 0}
              className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              📄 Экспортировать в CSV
            </button>
          </div>
          
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium mb-2">JSON формат</h4>
            <p className="text-sm text-gray-600 mb-4">
              Полный экспорт с сохранением всех настроек и параметров
            </p>
            <button
              onClick={exportToJSON}
              disabled={products.length === 0}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              📊 Экспортировать в JSON
            </button>
          </div>
        </div>
        
        {products.length > 0 && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Совет:</strong> JSON формат сохраняет все данные включая сезонность, скидки за объем, настройки валют, поставщиков, категорий и правила корреляции товаров.
            </p>
          </div>
        )}
      </div>

      {/* Импорт данных */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Импорт данных</h3>
        <p className="text-gray-600 mb-4">
          Загрузите данные из файла. Поддерживаются форматы CSV и JSON.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium mb-2">Импорт из CSV</h4>
            <p className="text-sm text-gray-600 mb-4">
              Базовый импорт товаров из таблицы
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={importFromCSV}
              className="hidden"
              id="csv-import"
            />
            <label
              htmlFor="csv-import"
              className="block w-full text-center px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 cursor-pointer"
            >
              📥 Выбрать CSV файл
            </label>
            <button
              onClick={generateSampleCSV}
              className="mt-2 w-full px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Скачать шаблон CSV
            </button>
          </div>
          
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium mb-2">Импорт из JSON</h4>
            <p className="text-sm text-gray-600 mb-4">
              Полный импорт с восстановлением всех настроек
            </p>
            <input
              type="file"
              accept=".json"
              onChange={importFromJSON}
              className="hidden"
              id="json-import"
            />
            <label
              htmlFor="json-import"
              className="block w-full text-center px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer"
            >
              📥 Выбрать JSON файл
            </label>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
          <h5 className="font-medium text-yellow-800 mb-2">⚠️ Важно при импорте:</h5>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• Импорт <strong>заменит</strong> все текущие данные</li>
            <li>• Убедитесь, что у вас есть резервная копия важных данных</li>
            <li>• CSV должен содержать заголовки в первой строке</li>
            <li>• Пустые поля будут заполнены значениями по умолчанию</li>
          </ul>
        </div>
      </div>

      {/* Статистика текущих данных */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Текущие данные</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-800">{products.length}</div>
            <div className="text-sm text-gray-600">Товаров</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-800">
              {products.filter(p => p.seasonality?.enabled).length}
            </div>
            <div className="text-sm text-gray-600">С сезонностью</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-800">
              {products.filter(p => p.volumeDiscounts && p.volumeDiscounts.length > 0).length}
            </div>
            <div className="text-sm text-gray-600">Со скидками</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-800">
              {products.filter(p => p.currentStock && p.currentStock > 0).length}
            </div>
            <div className="text-sm text-gray-600">С запасами</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-800">
              {products.filter(p => p.currency && p.currency !== 'RUB').length}
            </div>
            <div className="text-sm text-gray-600">В валюте</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-800">
              {products.filter(p => p.supplier && p.supplier !== 'domestic').length}
            </div>
            <div className="text-sm text-gray-600">Импорт</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportImportTab; 