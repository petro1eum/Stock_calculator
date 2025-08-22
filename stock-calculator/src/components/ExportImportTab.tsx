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
        warehouse: r.warehouse || r.warehouseName || null,
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
      const { error } = await supabase.from('wb_stocks').upsert(mapped as any, { onConflict: 'user_id,sku,barcode,warehouse,date' as any });
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

  // Импорт локальных Analytics JSON (seller-analytics-api)
  const importWBAnalyticsJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Не авторизован'); return; }
      const mapped = (data || []).map((row: any) => ({
        user_id: user.id,
        nm_id: String(row.nmID ?? row.nmId ?? row.nmid),
        period_begin: new Date(row.statistics?.selectedPeriod?.begin || Date.now()).toISOString(),
        period_end: new Date(row.statistics?.selectedPeriod?.end || Date.now()).toISOString(),
        metrics: row.statistics || null,
        stocks_wb: typeof row.stocks?.stocksWb === 'number' ? row.stocks.stocksWb : null,
        raw: row
      }));
      const { error } = await supabase
        .from('wb_analytics')
        .upsert(mapped as any, { onConflict: 'user_id,nm_id,period_begin,period_end' as any, ignoreDuplicates: true as any });
      if (error) throw error;
      // Обновим имена/категории по vendorCode/object.name, если есть уже созданные карточки
      setProducts(prev => prev.map(p => {
        const match = (data as any[]).find((r: any) => String(r.nmID ?? r.nmId) === p.sku);
        if (!match) return p;
        const name = typeof match.vendorCode === 'string' ? match.vendorCode : p.name;
        const category = typeof match.object?.name === 'string' ? match.object.name : p.category;
        return { ...p, name, category };
      }));
      toast.success(`Импортировано аналитики: ${mapped.length}`);
    } catch (err: any) {
      toast.error(`Ошибка импорта аналитики: ${err.message || err}`);
    }
  };

  // Импорт локальных Prices JSON (discounts-prices-api)
  const importWBPricesJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const list = json?.response?.data?.listGoods || json?.data?.listGoods || json?.listGoods || [];
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Не авторизован'); return; }
      const rows: any[] = [];
      (list as any[]).forEach((g: any) => {
        const nmId = String(g.nmID ?? g.nmId ?? g.nmid);
        const currency = g.currencyIsoCode4217 || null;
        const discount = typeof g.discount === 'number' ? g.discount : (typeof g.clubDiscount === 'number' ? g.clubDiscount : null);
        const vendorCode = g.vendorCode;
        (g.sizes || []).forEach((s: any) => {
          rows.push({
            user_id: user.id,
            nm_id: nmId,
            size_id: String(s.sizeID ?? s.sizeId ?? s.id),
            currency,
            price: typeof s.price === 'number' ? s.price : null,
            discounted_price: typeof s.discountedPrice === 'number' ? s.discountedPrice : null,
            discount,
            raw: { ...g, size: s }
          });
        });
        // моментально обновим имя по vendorCode, если карточка уже есть
        if (typeof vendorCode === 'string') {
          setProducts(prev => prev.map(p => p.sku === nmId ? { ...p, name: vendorCode } : p));
        }
      });
      if (rows.length > 0) {
        const { error } = await supabase
          .from('wb_prices')
          .upsert(rows as any, { onConflict: 'user_id,nm_id,size_id' as any, ignoreDuplicates: true as any });
        if (error) throw error;
      }
      toast.success(`Импортировано ценовых записей: ${rows.length}`);
    } catch (err: any) {
      toast.error(`Ошибка импорта цен: ${err.message || err}`);
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

  // ===== Экспорт данных из БД в JSON (форматы совместимы с импортом) =====
  const saveJson = (filename: string, obj: unknown) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const exportSalesJsonFromDb = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Не авторизован'); return; }
      const { data, error } = await supabase
        .from('wb_sales')
        .select('*')
        .eq('user_id', user.id)
        .limit(50000);
      if (error) throw error;
      const arr = (data || []).map((r: any) => ({
        date: (r.date || '').split('T')[0],
        nmId: Number(r.sku),
        subject: typeof r.raw?.subject === 'string' ? r.raw.subject : undefined,
        brand: typeof r.raw?.brand === 'string' ? r.raw.brand : undefined,
        quantity: Number(r.units || 0),
        totalPrice: typeof r.revenue === 'number' ? r.revenue : undefined,
        saleID: r.sale_id,
        warehouseName: r.warehouse || undefined
      }));
      saveJson(`wb-sales-${new Date().toISOString().split('T')[0]}.json`, arr);
      toast.success(`Скачано продаж: ${arr.length}`);
    } catch (e: any) { toast.error(e.message || 'Ошибка экспорта продаж'); }
  };

  const exportPurchasesJsonFromDb = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Не авторизован'); return; }
      const { data, error } = await supabase
        .from('wb_purchases')
        .select('*')
        .eq('user_id', user.id)
        .limit(50000);
      if (error) throw error;
      const arr = (data || []).map((r: any) => ({
        date: (r.date || '').split('T')[0],
        nmId: Number(r.sku),
        quantity: Number(r.quantity || 0),
        totalPrice: typeof r.total_price === 'number' ? r.total_price : 0,
        incomeId: r.income_id,
        warehouse: r.warehouse || undefined,
        status: typeof r.raw?.status === 'string' ? r.raw.status : undefined
      }));
      saveJson(`wb-purchases-${new Date().toISOString().split('T')[0]}.json`, arr);
      toast.success(`Скачано поставок: ${arr.length}`);
    } catch (e: any) { toast.error(e.message || 'Ошибка экспорта поставок'); }
  };

  const exportStocksJsonFromDb = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Не авторизован'); return; }
      const { data, error } = await supabase
        .from('wb_stocks')
        .select('*')
        .eq('user_id', user.id)
        .limit(50000);
      if (error) throw error;
      const arr = (data || []).map((r: any) => ({
        date: (r.date || '').split('T')[0],
        nmId: Number(r.sku),
        subject: typeof r.raw?.subject === 'string' ? r.raw.subject : undefined,
        brand: typeof r.raw?.brand === 'string' ? r.raw.brand : undefined,
        techSize: r.tech_size || undefined,
        barcode: r.barcode,
        quantity: Number(r.quantity || 0),
        inWayToClient: Number(r.in_way_to_client || 0),
        inWayFromClient: Number(r.in_way_from_client || 0),
        warehouse: r.warehouse || undefined,
        price: typeof r.price === 'number' ? r.price : undefined,
        discount: typeof r.discount === 'number' ? r.discount : undefined
      }));
      saveJson(`wb-stocks-${new Date().toISOString().split('T')[0]}.json`, arr);
      toast.success(`Скачано остатков: ${arr.length}`);
    } catch (e: any) { toast.error(e.message || 'Ошибка экспорта остатков'); }
  };

  const exportAnalyticsJsonFromDb = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Не авторизован'); return; }
      const { data, error } = await supabase
        .from('wb_analytics')
        .select('*')
        .eq('user_id', user.id)
        .limit(20000);
      if (error) throw error;
      const arr = (data || []).map((r: any) => ({
        nmID: Number(r.nm_id),
        vendorCode: r.raw?.vendorCode,
        brandName: r.raw?.brandName,
        object: r.raw?.object,
        statistics: r.metrics,
        stocks: { stocksMp: r.raw?.stocks?.stocksMp, stocksWb: r.stocks_wb ?? r.raw?.stocks?.stocksWb }
      }));
      saveJson(`wb-analytics-${new Date().toISOString().split('T')[0]}.json`, arr);
      toast.success(`Скачано аналитики: ${arr.length}`);
    } catch (e: any) { toast.error(e.message || 'Ошибка экспорта аналитики'); }
  };

  const exportPricesJsonFromDb = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Не авторизован'); return; }
      const { data, error } = await supabase
        .from('wb_prices')
        .select('*')
        .eq('user_id', user.id)
        .limit(50000);
      if (error) throw error;
      // Группируем по nm_id -> listGoods
      const map = new Map<string, any>();
      (data || []).forEach((r: any) => {
        const key = String(r.nm_id);
        if (!map.has(key)) {
          map.set(key, {
            nmID: Number(r.nm_id),
            vendorCode: r.raw?.vendorCode,
            sizes: [],
            currencyIsoCode4217: r.currency || undefined,
            discount: typeof r.discount === 'number' ? r.discount : undefined,
            clubDiscount: undefined,
            editableSizePrice: false
          });
        }
        const bucket = map.get(key);
        bucket.sizes.push({
          sizeID: Number(r.size_id),
          price: typeof r.price === 'number' ? r.price : undefined,
          discountedPrice: typeof r.discounted_price === 'number' ? r.discounted_price : undefined,
          clubDiscountedPrice: typeof r.discounted_price === 'number' ? r.discounted_price : undefined,
          techSizeName: r.raw?.size?.techSizeName || undefined
        });
      });
      const payload = { data: { listGoods: Array.from(map.values()) }, error: false, errorText: '' };
      saveJson(`wb-prices-${new Date().toISOString().split('T')[0]}.json`, payload);
      toast.success(`Скачано ценовых карточек: ${map.size}`);
    } catch (e: any) { toast.error(e.message || 'Ошибка экспорта цен'); }
  };

  return (
    <div className="p-6">
      
      <div className="mb-6 pb-3 border-b">
        <h1 className="text-xl font-medium text-black">Управление данными</h1>
        <div className="text-sm text-gray-600 mt-1">
          Товаров: {products.length}
          {selectedWarehouse === 'wildberries' && ' • Wildberries подключен'}
        </div>
      </div>

      <div className="space-y-8">
        
        {/* Экспорт */}
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-3">ЭКСПОРТ</h2>
          <div className="flex gap-4">
            <button 
              onClick={exportToCSV} 
              disabled={products.length === 0}
              className="px-4 py-2 bg-gray-800 text-white text-sm disabled:bg-gray-400"
            >
              Экспорт в CSV
            </button>
            <button 
              onClick={exportToJSON} 
              disabled={products.length === 0}
              className="px-4 py-2 bg-gray-800 text-white text-sm disabled:bg-gray-400"
            >
              Экспорт в JSON
            </button>
          </div>
        </div>

        {/* Импорт товаров */}
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-3">ИМПОРТ ТОВАРОВ</h2>
          <div className="flex gap-4">
            <div>
              <input type="file" accept=".csv" onChange={importFromCSV} className="hidden" id="csv-import" />
              <label htmlFor="csv-import" className="inline-block px-4 py-2 bg-gray-800 text-white text-sm cursor-pointer">
                Импорт CSV
              </label>
            </div>
            <div>
              <input type="file" accept=".json" onChange={importFromJSON} className="hidden" id="json-import" />
              <label htmlFor="json-import" className="inline-block px-4 py-2 bg-gray-800 text-white text-sm cursor-pointer">
                Импорт JSON
              </label>
            </div>
          </div>
        </div>

        {/* Продажи */}
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-3">ПРОДАЖИ</h2>
          <div className="flex gap-4">
            <div>
              <input type="file" accept=".csv" onChange={importSalesCSV} className="hidden" id="sales-import" />
              <label htmlFor="sales-import" className="inline-block px-4 py-2 bg-gray-800 text-white text-sm cursor-pointer">
                Импорт CSV
              </label>
            </div>
            <div>
              <input type="file" accept=".xlsx,.xls" onChange={importSalesXLSX} className="hidden" id="sales-import-xlsx" />
              <label htmlFor="sales-import-xlsx" className="inline-block px-4 py-2 bg-gray-800 text-white text-sm cursor-pointer">
                Импорт Excel
              </label>
            </div>
            <button 
              onClick={generateSampleCSV} 
              className="px-4 py-2 bg-gray-800 text-white text-sm"
            >
              Скачать шаблон
            </button>
          </div>
        </div>

        {/* База данных */}
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-3">БАЗА ДАННЫХ</h2>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={applySalesFromDB} 
              className="px-4 py-2 bg-gray-800 text-white text-sm"
            >
              Загрузить продажи
            </button>
            <button 
              onClick={applyStocksFromDB} 
              className="px-4 py-2 bg-gray-800 text-white text-sm"
            >
              Загрузить остатки
            </button>
            {/* Экспорт JSON для проверки совместимости форматов */}
            <button onClick={exportSalesJsonFromDb} className="px-4 py-2 bg-gray-700 text-white text-sm">Скачать продажи JSON</button>
            <button onClick={exportPurchasesJsonFromDb} className="px-4 py-2 bg-gray-700 text-white text-sm">Скачать поставки JSON</button>
            <button onClick={exportStocksJsonFromDb} className="px-4 py-2 bg-gray-700 text-white text-sm">Скачать остатки JSON</button>
            <button onClick={exportAnalyticsJsonFromDb} className="px-4 py-2 bg-gray-700 text-white text-sm">Скачать аналитику JSON</button>
            <button onClick={exportPricesJsonFromDb} className="px-4 py-2 bg-gray-700 text-white text-sm">Скачать цены JSON</button>
          </div>
        </div>

        {/* Wildberries JSON */}
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-3">WILDBERRIES JSON</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <input type="file" accept=".json" onChange={importWBSalesJSON} className="hidden" id="wb-sales-json" />
              <label htmlFor="wb-sales-json" className="inline-block px-4 py-2 bg-gray-800 text-white text-sm cursor-pointer">
                Продажи
              </label>
            </div>
            <div>
              <input type="file" accept=".json" onChange={importWBPurchasesJSON} className="hidden" id="wb-purchases-json" />
              <label htmlFor="wb-purchases-json" className="inline-block px-4 py-2 bg-gray-800 text-white text-sm cursor-pointer">
                Поставки
              </label>
            </div>
            <div>
              <input type="file" accept=".json" onChange={importWBStocksJSON} className="hidden" id="wb-stocks-json" />
              <label htmlFor="wb-stocks-json" className="inline-block px-4 py-2 bg-gray-800 text-white text-sm cursor-pointer">
                Остатки
              </label>
            </div>
            <div>
              <input type="file" accept=".json" onChange={importWBAnalyticsJSON} className="hidden" id="wb-analytics-json" />
              <label htmlFor="wb-analytics-json" className="inline-block px-4 py-2 bg-gray-800 text-white text-sm cursor-pointer">
                Аналитика
              </label>
            </div>
            <div>
              <input type="file" accept=".json" onChange={importWBPricesJSON} className="hidden" id="wb-prices-json" />
              <label htmlFor="wb-prices-json" className="inline-block px-4 py-2 bg-gray-800 text-white text-sm cursor-pointer">
                Цены
              </label>
            </div>
          </div>
        </div>

        {/* Wildberries API */}
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-3">WILDBERRIES API</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs text-gray-600 mb-2">Настройка API</h3>
              <div className="border p-3 bg-gray-50">
                <WbKeyManager />
              </div>
            </div>
            <div>
              <h3 className="text-xs text-gray-600 mb-2">Прямой импорт</h3>
              <div className="border p-3 bg-gray-50">
                <WildberriesImporter onUpdateProducts={setProducts} />
              </div>
            </div>
          </div>
        </div>

        {/* Примечания */}
        <div className="text-xs text-gray-500 pt-4 border-t">
          <p>• Импорт товаров заменяет текущие данные полностью</p>
          <p>• Данные по продажам пересчитывают параметры спроса автоматически</p>
          <p>• Создавайте резервные копии перед большими импортами</p>
        </div>

      </div>
    </div>
  );
};

export default ExportImportTab;