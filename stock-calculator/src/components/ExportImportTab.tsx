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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div className="relative overflow-hidden bg-white/80 backdrop-blur-sm rounded-3xl border border-slate-200/60 p-8 shadow-xl shadow-slate-900/5">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5"></div>
          <div className="relative flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 bg-clip-text text-transparent">
                Data Management
              </h1>
              <p className="text-slate-600 mt-2 text-lg font-medium">Import, export & sync your portfolio data</p>
            </div>
            <div className="flex items-center space-x-6">
              <div className="flex items-center bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2 rounded-2xl border border-emerald-200/60">
                <div className="w-2 h-2 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full mr-3 animate-pulse"></div>
                <span className="text-emerald-700 font-medium">
                  {selectedWarehouse === 'wildberries' ? 'Wildberries Connected' : 'No Warehouse'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modern Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {[
            {
              value: products.length,
              label: 'Products',
              icon: '📦',
              gradient: 'from-blue-500 to-cyan-500',
              bg: 'from-blue-50 to-cyan-50'
            },
            {
              value: products.filter(p => p.seasonality?.enabled).length,
              label: 'Seasonal',
              icon: '🗓',
              gradient: 'from-purple-500 to-violet-500',
              bg: 'from-purple-50 to-violet-50'
            },
            {
              value: products.filter(p => p.currentStock && p.currentStock > 0).length,
              label: 'In Stock',
              icon: '✅',
              gradient: 'from-emerald-500 to-teal-500',
              bg: 'from-emerald-50 to-teal-50'
            },
            {
              value: products.filter(p => p.currency && p.currency !== 'RUB').length,
              label: 'Foreign',
              icon: '💱',
              gradient: 'from-amber-500 to-orange-500',
              bg: 'from-amber-50 to-orange-50'
            },
            {
              value: products.filter(p => p.volumeDiscounts && p.volumeDiscounts.length > 0).length,
              label: 'Discounted',
              icon: '🏷',
              gradient: 'from-rose-500 to-pink-500',
              bg: 'from-rose-50 to-pink-50'
            },
            {
              value: products.filter(p => p.supplier && p.supplier !== 'domestic').length,
              label: 'Imported',
              icon: '🌍',
              gradient: 'from-indigo-500 to-blue-500',
              bg: 'from-indigo-50 to-blue-50'
            }
          ].map((stat, index) => (
            <div key={index} className="group relative overflow-hidden bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-6 hover:shadow-xl hover:shadow-slate-900/10 transition-all duration-300 hover:-translate-y-1">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className={`text-2xl bg-gradient-to-r ${stat.gradient} w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg`}>
                    {stat.icon}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                    {stat.value.toLocaleString()}
                  </p>
                  <p className="text-slate-600 font-medium">{stat.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Export */}
          <div className="group relative overflow-hidden bg-white/80 backdrop-blur-sm rounded-3xl border border-slate-200/60 p-8 hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-green-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative">
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mr-4 shadow-xl">
                  <span className="text-2xl">⬆️</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Export</h2>
                  <p className="text-slate-600">Save your data</p>
                </div>
              </div>
              <div className="space-y-4">
                <button 
                  onClick={exportToCSV} 
                  disabled={products.length === 0}
                  className="w-full group/btn relative overflow-hidden bg-gradient-to-r from-emerald-600 to-teal-600 disabled:from-slate-400 disabled:to-slate-500 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/25 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:hover:transform-none"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-400 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative flex items-center justify-center">
                    <span className="mr-3 text-lg">📊</span>
                    CSV (Excel)
                  </span>
                </button>
                <button 
                  onClick={exportToJSON} 
                  disabled={products.length === 0}
                  className="w-full group/btn relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 disabled:from-slate-400 disabled:to-slate-500 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/25 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:hover:transform-none"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-400 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative flex items-center justify-center">
                    <span className="mr-3 text-lg">📄</span>
                    JSON (Full)
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Import */}
          <div className="group relative overflow-hidden bg-white/80 backdrop-blur-sm rounded-3xl border border-slate-200/60 p-8 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative">
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mr-4 shadow-xl">
                  <span className="text-2xl">⬇️</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Import</h2>
                  <p className="text-slate-600">Load from files</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <input type="file" accept=".csv" onChange={importFromCSV} className="hidden" id="csv-import" />
                  <label htmlFor="csv-import" className="w-full group/btn cursor-pointer relative overflow-hidden bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/25 hover:-translate-y-0.5 flex items-center justify-center">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-400 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
                    <span className="relative flex items-center">
                      <span className="mr-3 text-lg">📊</span>
                      CSV Products
                    </span>
                  </label>
                </div>
                <div>
                  <input type="file" accept=".json" onChange={importFromJSON} className="hidden" id="json-import" />
                  <label htmlFor="json-import" className="w-full group/btn cursor-pointer relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/25 hover:-translate-y-0.5 flex items-center justify-center">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-400 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
                    <span className="relative flex items-center">
                      <span className="mr-3 text-lg">📄</span>
                      JSON Full
                    </span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input type="file" accept=".csv" onChange={importSalesCSV} className="hidden" id="sales-import" />
                    <label htmlFor="sales-import" className="w-full group/btn cursor-pointer relative overflow-hidden bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-violet-500/25 hover:-translate-y-0.5 flex items-center justify-center text-sm">
                      <span className="relative flex items-center">
                        <span className="mr-2 text-base">📈</span>
                        Sales CSV
                      </span>
                    </label>
                  </div>
                  <div>
                    <input type="file" accept=".xlsx,.xls" onChange={importSalesXLSX} className="hidden" id="sales-import-xlsx" />
                    <label htmlFor="sales-import-xlsx" className="w-full group/btn cursor-pointer relative overflow-hidden bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/25 hover:-translate-y-0.5 flex items-center justify-center text-sm">
                      <span className="relative flex items-center">
                        <span className="mr-2 text-base">📊</span>
                        Excel
                      </span>
                    </label>
                  </div>
                </div>
                <button onClick={generateSampleCSV} className="w-full relative bg-gradient-to-r from-slate-600 to-slate-700 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-slate-500/25 hover:-translate-y-0.5">
                  <span className="flex items-center justify-center">
                    <span className="mr-3 text-lg">📝</span>
                    Download Template
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Database */}
          <div className="group relative overflow-hidden bg-white/80 backdrop-blur-sm rounded-3xl border border-slate-200/60 p-8 hover:shadow-2xl hover:shadow-purple-500/10 transition-all duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-violet-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative">
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 bg-gradient-to-r from-purple-500 to-violet-600 rounded-2xl flex items-center justify-center mr-4 shadow-xl">
                  <span className="text-2xl">🗄️</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Database</h2>
                  <p className="text-slate-600">Sync data</p>
                </div>
              </div>
              <div className="space-y-4">
                <button 
                  onClick={applySalesFromDB} 
                  className="w-full group/btn relative overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/25 hover:-translate-y-0.5"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-purple-400 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative flex items-center justify-center">
                    <span className="mr-3 text-lg">📈</span>
                    Load Sales
                  </span>
                </button>
                <button 
                  onClick={applyStocksFromDB} 
                  className="w-full group/btn relative overflow-hidden bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-300 hover:shadow-xl hover:shadow-amber-500/25 hover:-translate-y-0.5"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-400 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative flex items-center justify-center">
                    <span className="mr-3 text-lg">📦</span>
                    Load Stock
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Wildberries Integration */}
        <div className="relative overflow-hidden bg-white/80 backdrop-blur-sm rounded-3xl border border-slate-200/60 p-8 shadow-xl shadow-slate-900/5">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-indigo-500/5"></div>
          <div className="relative">
            <div className="flex items-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl flex items-center justify-center mr-6 shadow-xl">
                <span className="text-3xl">🛍️</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-700 to-pink-700 bg-clip-text text-transparent">
                  Wildberries Integration
                </h2>
                <p className="text-slate-600 text-lg">API connection & file imports</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* API Section */}
              <div className="space-y-6">
                <div className="group relative overflow-hidden bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200/60 rounded-2xl p-6 hover:shadow-lg transition-all duration-300">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative">
                    <h3 className="text-lg font-bold text-purple-900 mb-4 flex items-center">
                      <span className="mr-3 text-xl">🔑</span>
                      API Configuration
                    </h3>
                    <WbKeyManager />
                  </div>
                </div>
                <div className="group relative overflow-hidden bg-gradient-to-br from-slate-50 to-gray-50 border border-slate-200/60 rounded-2xl p-6 hover:shadow-lg transition-all duration-300">
                  <div className="relative">
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
                      <span className="mr-3 text-xl">🚀</span>
                      Live Import
                    </h3>
                    <WildberriesImporter onUpdateProducts={setProducts} />
                  </div>
                </div>
              </div>

              {/* File Import Section */}
              <div className="space-y-6">
                <div className="group relative overflow-hidden bg-gradient-to-br from-slate-50 to-gray-50 border border-slate-200/60 rounded-2xl p-6 hover:shadow-lg transition-all duration-300">
                  <div className="relative">
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
                      <span className="mr-3 text-xl">📁</span>
                      Local JSON Files
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <input type="file" accept=".json" onChange={importWBSalesJSON} className="hidden" id="wb-sales-json" />
                        <label htmlFor="wb-sales-json" className="w-full group/btn cursor-pointer relative overflow-hidden bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/25 hover:-translate-y-0.5 flex items-center justify-center">
                          <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-blue-400 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
                          <span className="relative flex items-center">
                            <span className="mr-3 text-lg">📈</span>
                            Sales Data JSON
                          </span>
                        </label>
                      </div>
                      <div>
                        <input type="file" accept=".json" onChange={importWBPurchasesJSON} className="hidden" id="wb-purchases-json" />
                        <label htmlFor="wb-purchases-json" className="w-full group/btn cursor-pointer relative overflow-hidden bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5 flex items-center justify-center">
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-400 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
                          <span className="relative flex items-center">
                            <span className="mr-3 text-lg">📦</span>
                            Purchases JSON
                          </span>
                        </label>
                      </div>
                      <div>
                        <input type="file" accept=".json" onChange={importWBStocksJSON} className="hidden" id="wb-stocks-json" />
                        <label htmlFor="wb-stocks-json" className="w-full group/btn cursor-pointer relative overflow-hidden bg-gradient-to-r from-amber-600 to-orange-600 text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/25 hover:-translate-y-0.5 flex items-center justify-center">
                          <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-400 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
                          <span className="relative flex items-center">
                            <span className="mr-3 text-lg">📊</span>
                            Stock Data JSON
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Important Notes */}
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-3xl p-8">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-orange-500/5"></div>
          <div className="relative flex items-start">
            <div className="flex-shrink-0 mr-6">
              <div className="w-12 h-12 bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-2xl">⚠️</span>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-amber-900 mb-4">Important Guidelines</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-amber-800">
                <div>
                  <h4 className="font-semibold mb-2 flex items-center">
                    <span className="mr-2">🔄</span>
                    Data Replacement
                  </h4>
                  <p className="text-sm">Product imports replace current data completely</p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2 flex items-center">
                    <span className="mr-2">📊</span>
                    Sales Processing
                  </h4>
                  <p className="text-sm">Sales data recalculates demand parameters automatically</p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2 flex items-center">
                    <span className="mr-2">💾</span>
                    Backup First
                  </h4>
                  <p className="text-sm">Always create backups before large imports</p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2 flex items-center">
                    <span className="mr-2">📋</span>
                    File Format
                  </h4>
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