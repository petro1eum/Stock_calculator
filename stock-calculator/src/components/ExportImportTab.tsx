import React from 'react';
import { Product, SalesRecord, PurchaseRecord, LogisticsRecord } from '../types';
import { parseSalesCSV, parseSalesXLSX, updateProductsFromSales } from '../utils/inventoryCalculations';
import WildberriesImporter from './WildberriesImporter';
import toast from 'react-hot-toast';
import { usePortfolioSettings } from '../contexts/PortfolioSettingsContext';
import { supabase } from '../utils/supabaseClient';
import WbKeyManager from './WbKeyManager';

interface ExportImportTabProps {
  products: Product[];
  productsWithMetrics: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  exportToCSV: () => void;
  importFromCSV: (event: React.ChangeEvent<HTMLInputElement>) => void;
  selectedWarehouse?: 'wildberries';
}

const ExportImportTab: React.FC<ExportImportTabProps> = ({
  products,
  productsWithMetrics,
  setProducts,
  exportToCSV,
  importFromCSV,
  selectedWarehouse
}) => {
  const portfolioSettings = usePortfolioSettings();

  const loadFromDB = async (table: 'wb_sales' | 'wb_stocks' | 'wb_purchases' | 'wb_orders') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Не авторизован');
        return [] as any[];
      }
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', user.id)
        .limit(5000);
      if (error) {
        toast.error(error.message || 'Ошибка загрузки из БД');
        return [] as any[];
      }
      return (data || []) as any[];
    } catch (e) {
      toast.error('Ошибка загрузки из БД');
      return [] as any[];
    }
  };

  const applySalesFromDB = async () => {
    const rows = await loadFromDB('wb_sales');
    if (rows.length === 0) {
      toast('В БД нет записей продаж');
      return;
    }
    const sales: SalesRecord[] = rows.map((r: any) => ({
      date: r.date,
      sku: String(r.sku),
      units: Number(r.units || 1),
      revenue: typeof r.revenue === 'number' ? r.revenue : undefined
    }));
    setProducts(prev => {
      // автосоздание товаров по новым SKU
      const existing = new Set(prev.map(p => p.sku));
      const skus = Array.from(new Set(rows.map((r: any) => String(r.sku))));
      const missing = skus.filter(sku => !existing.has(sku));
      const baseSeasonality = { enabled: false, monthlyFactors: Array(12).fill(1), currentMonth: new Date().getMonth() } as any;
      const newItems: Product[] = missing.map((sku, idx) => ({
        id: prev.length + idx + 1,
        name: String(typeof rows.find((r: any) => String(r.sku) === String(sku))?.raw?.subject === 'string' ? rows.find((r: any) => String(r.sku) === String(sku))!.raw.subject : 'Товар WB'),
        sku: String(sku),
        purchase: 0,
        margin: 0,
        muWeek: 0,
        sigmaWeek: 0,
        revenue: 0,
        optQ: 0,
        optValue: 0,
        safety: 0,
        currentStock: 0,
        seasonality: baseSeasonality,
        currency: 'RUB',
        supplier: 'domestic',
        category: ''
      }));
      const combined = [...prev, ...newItems];
      return updateProductsFromSales(combined, sales, { weeksWindow: 26 });
    });
    toast.success(`Применены продажи из БД: ${sales.length}`);
  };

  const applyStocksFromDB = async () => {
    const rows = await loadFromDB('wb_stocks');
    if (rows.length === 0) {
      toast('В БД нет записей остатков');
      return;
    }
    const totals = new Map<string, number>();
    rows.forEach((r: any) => {
      const sku = String(r.sku);
      const qty = Number(r.quantity || 0);
      totals.set(sku, (totals.get(sku) || 0) + qty);
    });
    setProducts(prev => {
      const existing = new Set(prev.map(p => p.sku));
      const skus = Array.from(totals.keys());
      const missing = skus.filter(sku => !existing.has(sku));
      const baseSeasonality = { enabled: false, monthlyFactors: Array(12).fill(1), currentMonth: new Date().getMonth() } as any;
      const newItems: Product[] = missing.map((sku, idx) => ({
        id: prev.length + idx + 1,
        name: String(typeof rows.find((r: any) => String(r.sku) === String(sku))?.raw?.subject === 'string' ? rows.find((r: any) => String(r.sku) === String(sku))!.raw.subject : 'Товар WB'),
        sku: String(sku),
        purchase: 0,
        margin: 0,
        muWeek: 0,
        sigmaWeek: 0,
        revenue: 0,
        optQ: 0,
        optValue: 0,
        safety: 0,
        currentStock: totals.get(sku) || 0,
        seasonality: baseSeasonality,
        currency: 'RUB',
        supplier: 'domestic',
        category: ''
      }));
      return [...prev, ...newItems].map(p => ({
        ...p,
        currentStock: totals.has(p.sku) ? (totals.get(p.sku) || 0) : (p.currentStock || 0)
      }));
    });
    toast.success(`Обновлены остатки по SKU: ${totals.size}`);
  };

  // Импорт локальных WB JSON файлов
  const importWBSalesJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Не авторизован'); return; }
      const mapped = (data || []).map((s: any) => ({
        user_id: user.id,
        date: `${(s.date?.split('T')[0] || s.date)}T00:00:00Z`,
        sku: String(s.nmId),
        units: Number(s.quantity || 0),
        revenue: s.totalPrice !== undefined ? Number(s.totalPrice) : (s.finishedPrice !== undefined ? Number(s.finishedPrice) : null),
        sale_id: String(s.saleID || s.gNumber || s.srid || `${s.nmId}-${s.date}-${s.barcode || ''}`),
        warehouse: s.warehouseName || null,
        raw: s
      }));
      const { error } = await supabase.from('wb_sales').upsert(mapped as any, { onConflict: 'user_id,sale_id' as any });
      if (error) throw error;
      // Автосоздание товаров и пересчет спроса
      const salesRecords: SalesRecord[] = mapped.map((m: any) => ({ date: m.date, sku: m.sku, units: m.units, revenue: m.revenue ?? undefined }));
      setProducts(prev => {
        const existing = new Set(prev.map(p => p.sku));
        const skus: string[] = Array.from(new Set<string>(mapped.map((m: any) => String(m.sku))));
        const missing: string[] = skus.filter((sku: string) => !existing.has(String(sku)));
        const baseSeasonality = { enabled: false, monthlyFactors: Array(12).fill(1), currentMonth: new Date().getMonth() } as any;
        const newItems: Product[] = missing.map((sku, idx) => ({
          id: prev.length + idx + 1,
          name: String(typeof (data.find((s: any) => String(s.nmId) === sku)?.subject) === 'string' ? data.find((s: any) => String(s.nmId) === sku)!.subject : 'Товар WB'),
          sku: String(sku),
          purchase: 0,
          margin: 0,
          muWeek: 0,
          sigmaWeek: 0,
          revenue: 0,
          optQ: 0,
          optValue: 0,
          safety: 0,
          currentStock: 0,
          seasonality: baseSeasonality,
          currency: 'RUB',
          supplier: 'domestic',
          category: ''
        }));
        const combined = [...prev, ...newItems];
        return updateProductsFromSales(combined, salesRecords, { weeksWindow: 26 });
      });
      toast.success(`Импортировано продаж: ${mapped.length}`);
    } catch (err: any) {
      toast.error(`Ошибка импорта продаж: ${err.message || err}`);
    }
  };

  const importWBPurchasesJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Не авторизован'); return; }
      const mapped = (data || []).map((r: any) => ({
        user_id: user.id,
        date: `${(r.date?.split('T')[0] || r.date)}T00:00:00Z`,
        sku: String(r.nmId),
        quantity: Number(r.quantity || 0),
        total_price: r.totalPrice !== undefined ? Number(r.totalPrice) : null,
        income_id: r.incomeId ? String(r.incomeId) : `${r.nmId}-${r.date}`,
        warehouse: r.warehouseName || null,
        raw: r
      }));
      const { error } = await supabase.from('wb_purchases').upsert(mapped as any, { onConflict: 'user_id,income_id' as any });
      if (error) throw error;
      toast.success(`Импортировано поставок: ${mapped.length}`);
    } catch (err: any) {
      toast.error(`Ошибка импорта поставок: ${err.message || err}`);
    }
  };

  const importWBStocksJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Не авторизован'); return; }
      const mapped = (data || []).map((r: any) => {
        const isoDate = `${(r.lastChangeDate?.split('T')[0] || r.date)}T00:00:00Z`;
        const barcode = (r.barcode !== undefined && r.barcode !== null && String(r.barcode).trim() !== '')
          ? String(r.barcode)
          : String(r.nmId || r.nmid || 'NO_BARCODE');
        return {
          user_id: user.id,
          date: isoDate,
          sku: String(r.nmId),
          barcode,
          tech_size: r.techSize !== undefined && r.techSize !== null ? String(r.techSize) : null,
          quantity: Number(r.quantity || 0),
          in_way_to_client: Number(r.inWayToClient || 0),
          in_way_from_client: Number(r.inWayFromClient || 0),
          warehouse: r.warehouseName || null,
          price: r.Price !== undefined ? Number(r.Price) : null,
          discount: r.Discount !== undefined ? Number(r.Discount) : null,
          raw: r
        };
      });
      const { error } = await supabase.from('wb_stocks').upsert(mapped as any, { onConflict: 'user_id,sku,barcode,date' as any });
      if (error) throw error;
      // Автосоздание и обновление currentStock
      const totals = new Map<string, number>();
      mapped.forEach((m: any) => totals.set(m.sku, (totals.get(m.sku) || 0) + (m.quantity || 0)));
      setProducts(prev => {
        const existing = new Set(prev.map(p => p.sku));
        const skus = Array.from(totals.keys());
        const missing = skus.filter(sku => !existing.has(sku));
        const baseSeasonality = { enabled: false, monthlyFactors: Array(12).fill(1), currentMonth: new Date().getMonth() } as any;
        const newItems: Product[] = missing.map((sku, idx) => ({
          id: prev.length + idx + 1,
          name: String(typeof (data.find((s: any) => String(s.nmId) === sku)?.subject) === 'string' ? data.find((s: any) => String(s.nmId) === sku)!.subject : 'Товар WB'),
          sku: String(sku),
          purchase: 0,
          margin: 0,
          muWeek: 0,
          sigmaWeek: 0,
          revenue: 0,
          optQ: 0,
          optValue: 0,
          safety: 0,
          currentStock: totals.get(sku) || 0,
          seasonality: baseSeasonality,
          currency: 'RUB',
          supplier: 'domestic',
          category: ''
        }));
        return [...prev, ...newItems].map(p => ({ ...p, currentStock: totals.has(p.sku) ? (totals.get(p.sku) || 0) : (p.currentStock || 0) }));
      });
      toast.success(`Импортировано остатков: ${mapped.length}`);
    } catch (err: any) {
      toast.error(`Ошибка импорта остатков: ${err.message || err}`);
    }
  };

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

  const importSalesCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const sales = parseSalesCSV(text);
        if (sales.length === 0) {
          toast.error('Не удалось распознать продажи из CSV');
          return;
        }
        setProducts(prev => updateProductsFromSales(prev, sales, { weeksWindow: 26 }));
        toast.success(`Импортировано записей продаж: ${sales.length}. Параметры спроса пересчитаны.`);
      } catch {
        toast.error('Ошибка при чтении файла продаж');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const importSalesXLSX = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const sales = await parseSalesXLSX(file);
      if (sales.length === 0) {
        toast.error('Не удалось распознать продажи из Excel');
        return;
      }
      setProducts(prev => updateProductsFromSales(prev, sales, { weeksWindow: 26 }));
      toast.success(`Импортировано записей продаж (Excel): ${sales.length}. Параметры спроса пересчитаны.`);
    } catch {
      toast.error('Ошибка при чтении Excel файла продаж');
    }
    event.target.value = '';
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
          volume: p.volume,
          salesHistory: p.salesHistory as SalesRecord[] | undefined,
          purchaseHistory: p.purchaseHistory as PurchaseRecord[] | undefined,
          logisticsHistory: p.logisticsHistory as LogisticsRecord[] | undefined
        }));
        importedProducts.forEach(p => { p.revenue = p.muWeek * (p.purchase + p.margin) * 52; });
        setProducts(importedProducts);
        if (data.portfolioSettings && portfolioSettings) {
          if (data.portfolioSettings.currencies) portfolioSettings.setCurrencies(data.portfolioSettings.currencies);
          if (data.portfolioSettings.suppliers) portfolioSettings.setSuppliers(data.portfolioSettings.suppliers);
          if (data.portfolioSettings.categories) portfolioSettings.setCategories(data.portfolioSettings.categories);
          if (data.portfolioSettings.correlationRules) portfolioSettings.setCorrelationRules(data.portfolioSettings.correlationRules);
          toast.success(`Импортировано ${importedProducts.length} товаров и настройки портфеля`);
        } else {
          toast.success(`Импортировано ${importedProducts.length} товаров`);
        }
      } catch {
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
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="border-b border-gray-200 pb-6">
        <h1 className="text-3xl font-bold text-gray-900">Data Management</h1>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-gray-600">Import, export and manage your inventory data</p>
          <div className="text-sm text-gray-500">
            Products: <span className="font-semibold text-gray-900">{products.length}</span>
            {selectedWarehouse === 'wildberries' && (
              <span className="ml-4 text-green-600 font-medium">• Wildberries Connected</span>
            )}
          </div>
        </div>
      </div>

      {/* Export Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Export Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button 
            onClick={exportToCSV} 
            disabled={products.length === 0}
            className="px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            Export to CSV
          </button>
          <button 
            onClick={exportToJSON} 
            disabled={products.length === 0}
            className="px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            Export to JSON
          </button>
        </div>
      </div>

      {/* Import Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Import Data</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <input type="file" accept=".csv" onChange={importFromCSV} className="hidden" id="csv-import" />
              <label htmlFor="csv-import" className="block w-full px-6 py-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 cursor-pointer font-medium text-center">
                Import CSV Products
              </label>
            </div>
            <div>
              <input type="file" accept=".json" onChange={importFromJSON} className="hidden" id="json-import" />
              <label htmlFor="json-import" className="block w-full px-6 py-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 cursor-pointer font-medium text-center">
                Import JSON Full
              </label>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <input type="file" accept=".csv" onChange={importSalesCSV} className="hidden" id="sales-import" />
              <label htmlFor="sales-import" className="block w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer font-medium text-center">
                Sales CSV
              </label>
            </div>
            <div>
              <input type="file" accept=".xlsx,.xls" onChange={importSalesXLSX} className="hidden" id="sales-import-xlsx" />
              <label htmlFor="sales-import-xlsx" className="block w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 cursor-pointer font-medium text-center">
                Sales Excel
              </label>
            </div>
            <button 
              onClick={generateSampleCSV} 
              className="px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-medium"
            >
              Download Template
            </button>
          </div>
        </div>
      </div>

      {/* Database Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Database Operations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button 
            onClick={applySalesFromDB} 
            className="px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            Load Sales from Database
          </button>
          <button 
            onClick={applyStocksFromDB} 
            className="px-6 py-4 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium"
          >
            Load Stock from Database
          </button>
        </div>
      </div>

      {/* Wildberries Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Wildberries Integration</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-3">API Configuration</h3>
            <div className="p-4 bg-gray-50 rounded-lg">
              <WbKeyManager />
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-3">Live Import</h3>
            <div className="p-4 bg-gray-50 rounded-lg">
              <WildberriesImporter onUpdateProducts={setProducts} />
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Local JSON Files</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <input type="file" accept=".json" onChange={importWBSalesJSON} className="hidden" id="wb-sales-json" />
              <label htmlFor="wb-sales-json" className="block w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer font-medium text-center">
                Sales JSON
              </label>
            </div>
            <div>
              <input type="file" accept=".json" onChange={importWBPurchasesJSON} className="hidden" id="wb-purchases-json" />
              <label htmlFor="wb-purchases-json" className="block w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer font-medium text-center">
                Purchases JSON
              </label>
            </div>
            <div>
              <input type="file" accept=".json" onChange={importWBStocksJSON} className="hidden" id="wb-stocks-json" />
              <label htmlFor="wb-stocks-json" className="block w-full px-4 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 cursor-pointer font-medium text-center">
                Stock JSON
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Important Notes */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-yellow-900 mb-3">Important Notes</h3>
        <ul className="text-sm text-yellow-800 space-y-1">
          <li>• Product imports replace current data completely</li>
          <li>• Sales data recalculates demand parameters automatically</li>
          <li>• Always create backups before large imports</li>
          <li>• CSV files must include proper headers</li>
        </ul>
      </div>
    </div>
  );
};

export default ExportImportTab;