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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Data Management</h1>
              <p className="text-gray-600 mt-1">Import, export and synchronize inventory data</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center bg-green-50 px-3 py-1.5 rounded-md border border-green-200">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                <span className="text-green-700 text-sm font-medium">
                  {selectedWarehouse === 'wildberries' ? 'Wildberries Connected' : 'No Connection'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{products.length}</p>
                <p className="text-sm text-gray-600">Products</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{products.filter(p => p.seasonality?.enabled).length}</p>
                <p className="text-sm text-gray-600">Seasonal</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{products.filter(p => p.currentStock && p.currentStock > 0).length}</p>
                <p className="text-sm text-gray-600">In Stock</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{products.filter(p => p.currency && p.currency !== 'RUB').length}</p>
                <p className="text-sm text-gray-600">Foreign</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{products.filter(p => p.volumeDiscounts && p.volumeDiscounts.length > 0).length}</p>
                <p className="text-sm text-gray-600">Discounted</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{products.filter(p => p.supplier && p.supplier !== 'domestic').length}</p>
                <p className="text-sm text-gray-600">Imported</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Export */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Export</h3>
                <p className="text-sm text-gray-600">Save data to files</p>
              </div>
            </div>
            <div className="space-y-3">
              <button 
                onClick={exportToCSV} 
                disabled={products.length === 0}
                className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                CSV (Excel)
              </button>
              <button 
                onClick={exportToJSON} 
                disabled={products.length === 0}
                className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2v0a2 2 0 01-2-2v-1" />
                </svg>
                JSON (Full)
              </button>
            </div>
          </div>

          {/* Import */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Import</h3>
                <p className="text-sm text-gray-600">Load from files</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <input type="file" accept=".csv" onChange={importFromCSV} className="hidden" id="csv-import" />
                <label htmlFor="csv-import" className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer transition-colors">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  CSV Products
                </label>
              </div>
              <div>
                <input type="file" accept=".json" onChange={importFromJSON} className="hidden" id="json-import" />
                <label htmlFor="json-import" className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2v0a2 2 0 01-2-2v-1" />
                  </svg>
                  JSON Full
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input type="file" accept=".csv" onChange={importSalesCSV} className="hidden" id="sales-import" />
                  <label htmlFor="sales-import" className="w-full flex items-center justify-center px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer transition-colors">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    Sales CSV
                  </label>
                </div>
                <div>
                  <input type="file" accept=".xlsx,.xls" onChange={importSalesXLSX} className="hidden" id="sales-import-xlsx" />
                  <label htmlFor="sales-import-xlsx" className="w-full flex items-center justify-center px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 cursor-pointer transition-colors">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Excel
                  </label>
                </div>
              </div>
              <button onClick={generateSampleCSV} className="w-full px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
                <svg className="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Template
              </button>
            </div>
          </div>

          {/* Database */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Database</h3>
                <p className="text-sm text-gray-600">Sync stored data</p>
              </div>
            </div>
            <div className="space-y-3">
              <button 
                onClick={applySalesFromDB} 
                className="w-full flex items-center justify-center px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Load Sales
              </button>
              <button 
                onClick={applyStocksFromDB} 
                className="w-full flex items-center justify-center px-4 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                </svg>
                Load Stock
              </button>
            </div>
          </div>
        </div>

        {/* Wildberries Integration */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center mb-6">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Wildberries Integration</h2>
              <p className="text-gray-600">API connection and file imports</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* API Section */}
            <div className="space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h3 className="text-md font-semibold text-purple-900 mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  API Configuration
                </h3>
                <WbKeyManager />
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Live Import
                </h3>
                <WildberriesImporter onUpdateProducts={setProducts} />
              </div>
            </div>

            {/* File Import Section */}
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Local JSON Files
                </h3>
                <div className="space-y-2">
                  <div>
                    <input type="file" accept=".json" onChange={importWBSalesJSON} className="hidden" id="wb-sales-json" />
                    <label htmlFor="wb-sales-json" className="w-full flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer transition-colors">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      Sales Data JSON
                    </label>
                  </div>
                  <div>
                    <input type="file" accept=".json" onChange={importWBPurchasesJSON} className="hidden" id="wb-purchases-json" />
                    <label htmlFor="wb-purchases-json" className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                      </svg>
                      Purchases JSON
                    </label>
                  </div>
                  <div>
                    <input type="file" accept=".json" onChange={importWBStocksJSON} className="hidden" id="wb-stocks-json" />
                    <label htmlFor="wb-stocks-json" className="w-full flex items-center justify-center px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 cursor-pointer transition-colors">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                      Stock Data JSON
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Important Notes */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0 mr-4">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5C3.312 17.333 4.273 19 5.814 19z" />
                </svg>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-amber-900 mb-3">Important Guidelines</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-amber-800">
                <div>
                  <h4 className="font-medium mb-1">Data Replacement</h4>
                  <p className="text-sm">Product imports replace current data completely</p>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Sales Processing</h4>
                  <p className="text-sm">Sales data recalculates demand parameters automatically</p>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Backup First</h4>
                  <p className="text-sm">Always create backups before large imports</p>
                </div>
                <div>
                  <h4 className="font-medium mb-1">File Format</h4>
                  <p className="text-sm">CSV files must include proper headers</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportImportTab; 