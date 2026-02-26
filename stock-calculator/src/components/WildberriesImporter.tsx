import React from 'react';
import { Product, SalesRecord } from '../types';
import { updateProductsFromSales } from '../utils/inventoryCalculations';

interface WildberriesImporterProps {
  onUpdateProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 минут

const WildberriesImporter: React.FC<WildberriesImporterProps> = ({ onUpdateProducts }) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<any>(null);
  const [dateFrom, setDateFrom] = React.useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // 30 дней назад
    return date.toISOString().split('T')[0];
  });
  const [rateInfo, setRateInfo] = React.useState<{ remaining?: number; limit?: number } | null>(null);

  const getWbKey = async (): Promise<string | null> => {
    return localStorage.getItem('wb_api_key');
  };

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
  const toIsoDateOrNull = (value: unknown): string | null => {
    if (!value) return null;
    try {
      if (typeof value === 'string') {
        // ожидаем либо YYYY-MM-DD, либо полноценный ISO
        const onlyDate = value.split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(onlyDate)) {
          return `${onlyDate}T00:00:00Z`;
        }
        const d = new Date(value);
        if (!isNaN(d.getTime())) return `${d.toISOString().split('T')[0]}T00:00:00Z`;
        return null;
      }
      if (value instanceof Date && !isNaN(value.getTime())) {
        return `${value.toISOString().split('T')[0]}T00:00:00Z`;
      }
      return null;
    } catch { return null; }
  };
  const toInt = (v: any, def = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : def;
  };
  const toNumOrNull = (v: any): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const makeCacheKey = (url: string) => `wb_cache:${url}`;
  const readCache = (url: string) => {
    try {
      const raw = localStorage.getItem(makeCacheKey(url));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (Date.now() - (parsed.ts || 0) > CACHE_TTL_MS) return null;
      return parsed.data;
    } catch { return null; }
  };
  const writeCache = (url: string, data: unknown) => {
    try { localStorage.setItem(makeCacheKey(url), JSON.stringify({ ts: Date.now(), data })); } catch { }
  };

  const fetchWithRetry = async (url: string, key: string, useCache = true, maxRetries = 6) => {
    if (useCache) {
      const cached = readCache(url);
      if (cached) return cached;
    }
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const resp = await fetch(url, { headers: { Authorization: key, Accept: 'application/json' } });
      const remainingHeader = resp.headers.get('x-ratelimit-remaining');
      const limitHeader = resp.headers.get('x-ratelimit-limit');
      const remaining = remainingHeader ? parseInt(remainingHeader, 10) : undefined;
      const limit = limitHeader ? parseInt(limitHeader, 10) : undefined;
      if (remaining !== undefined || limit !== undefined) setRateInfo({ remaining, limit });

      if (resp.status === 429) {
        if (attempt >= maxRetries) {
          const txt = await resp.text();
          throw new Error(`WB API 429 (лимит запросов). Попробуйте позже. Подробности: ${txt.slice(0, 200)}`);
        }
        const delay = Math.min(32000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 400);
        attempt += 1;
        await sleep(delay);
        continue;
      }
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`WB API: ${resp.status} ${resp.statusText} ${txt.slice(0, 200)}`);
      }
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const txt = await resp.text();
        throw new Error(`WB API вернул не-JSON ответ: ${txt.slice(0, 200)}`);
      }
      const json = await resp.json();
      writeCache(url, json);

      // Если почти на нуле — мягкая задержка, чтобы распределить нагрузку
      if (remaining !== undefined && remaining <= 1) {
        await sleep(1000 + Math.floor(Math.random() * 300));
      }
      return json;
    }
  };

  const postWithRetry = async (url: string, key: string, body: unknown, maxRetries = 6) => {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: key, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (resp.status === 429) {
        if (attempt >= maxRetries) {
          const txt = await resp.text();
          throw new Error(`WB API 429 (лимит запросов). Попробуйте позже. Подробности: ${txt.slice(0, 200)}`);
        }
        const delay = Math.min(32000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 400);
        attempt += 1;
        await sleep(delay);
        continue;
      }
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`WB API: ${resp.status} ${resp.statusText} ${txt.slice(0, 200)}`);
      }
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const txt = await resp.text();
        throw new Error(`WB API вернул не-JSON ответ: ${txt.slice(0, 200)}`);
      }
      return resp.json();
    }
  };

  const safeSaveToDb = async (type: 'sales' | 'purchases' | 'stocks' | 'prices' | 'analytics', records: any[]) => {
    // В автономном режиме мы больше не транслируем сырые данные в облако Supabase.
    // Все спарсенные данные отправляются наверх родительскому компоненту через onUpdateProducts 
    // и живут в React State, который можно сохранить через вкладку "Экспорт".
    return;
  };

  const importSales = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const key = await getWbKey();
      if (!key) throw new Error('Сначала сохраните ключ WB в настройках пользователя');
      const url = `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${dateFrom}`;
      const data = await fetchWithRetry(url, key, true);
      const mapped: Array<{ date: string; nmId: number; subject?: string; brand?: string; quantity: number; totalPrice?: number; saleID?: string; warehouseName?: string; supplierArticle?: string }> = (data || []).map((sale: any) => ({
        date: sale.date?.split('T')[0] || sale.date,
        nmId: sale.nmId,
        subject: sale.subject,
        brand: sale.brand,
        quantity: sale.quantity || 1,
        totalPrice: sale.totalPrice || sale.finishedPrice,
        saleID: sale.saleID || sale.gNumber,
        warehouseName: sale.warehouseName,
        supplierArticle: sale.supplierArticle
      }));
      const res = { type: 'sales', count: mapped.length, data: mapped };
      setResult(res);
      if (onUpdateProducts && mapped.length > 0) {
        const salesRecords: SalesRecord[] = mapped.map((s: any) => ({
          date: s.date,
          sku: String(s.nmId),
          units: Number(s.quantity || 1),
          revenue: Number(s.totalPrice || 0)
        }));
        onUpdateProducts(prev => {
          // автосоздание карточек для отсутствующих SKU
          const existing = new Set(prev.map(p => p.sku));
          const missing = Array.from(new Set(mapped.map((s: any) => String(s.nmId)))).filter(sku => !existing.has(sku));
          const baseSeasonality = { enabled: false, monthlyFactors: Array(12).fill(1), currentMonth: new Date().getMonth() } as any;
          const newItems = missing.map((sku, idx) => ({
            id: prev.length + idx + 1,
            name: (() => { const rec = mapped.find((m: any) => String(m.nmId) === sku); const n = rec?.supplierArticle; return typeof n === 'string' && n.trim() ? n : (typeof rec?.subject === 'string' ? rec!.subject : 'Товар WB'); })(),
            sku,
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
            category: (() => { const rec = mapped.find((m: any) => String(m.nmId) === sku); return typeof rec?.subject === 'string' ? rec!.subject : ''; })()
          }));
          const combined = [...prev, ...newItems];
          return updateProductsFromSales(combined, salesRecords, { weeksWindow: 26 });
        });
      }
      await safeSaveToDb('sales', mapped || []);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const importPurchases = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const key = await getWbKey();
      if (!key) throw new Error('Сначала сохраните ключ WB в настройках пользователя');
      const url = `https://statistics-api.wildberries.ru/api/v1/supplier/incomes?dateFrom=${dateFrom}`;
      const data = await fetchWithRetry(url, key, true);
      const mapped = (data || []).map((income: any) => ({
        date: income.date?.split('T')[0] || income.date,
        nmId: income.nmId,
        subject: income.subject,
        brand: income.brand,
        quantity: income.quantity || 1,
        totalPrice: income.totalPrice || 0,
        incomeId: income.incomeId,
        warehouse: income.warehouseName,
        status: income.status || 'accepted'
      }));
      const res = { type: 'purchases', count: mapped.length, data: mapped };
      setResult(res);
      await safeSaveToDb('purchases', mapped || []);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const importStocks = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const key = await getWbKey();
      if (!key) throw new Error('Сначала сохраните ключ WB в настройках пользователя');
      const url = `https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${dateFrom}`;
      const data = await fetchWithRetry(url, key, true);
      const mapped = (data || []).map((stock: any) => ({
        date: stock.lastChangeDate?.split('T')[0] || stock.date,
        nmId: stock.nmId,
        subject: stock.subject,
        brand: stock.brand,
        techSize: stock.techSize,
        barcode: stock.barcode,
        quantity: stock.quantity || 0,
        inWayToClient: stock.inWayToClient || 0,
        inWayFromClient: stock.inWayFromClient || 0,
        warehouse: stock.warehouseName,
        price: stock.Price || 0,
        discount: stock.Discount || 0
      }));
      const res = { type: 'stocks', count: mapped.length, data: mapped };
      setResult(res);
      // обновляем остатки и создаём карточки для новых SKU
      if (onUpdateProducts && mapped.length > 0) {
        onUpdateProducts(prev => {
          const existing = new Set(prev.map(p => p.sku));
          const totals = new Map<string, number>();
          mapped.forEach((m: any) => {
            const sku = String(m.nmId);
            totals.set(sku, (totals.get(sku) || 0) + (m.quantity || 0));
          });
          const missing = Array.from(totals.keys()).filter(sku => !existing.has(sku));
          const baseSeasonality = { enabled: false, monthlyFactors: Array(12).fill(1), currentMonth: new Date().getMonth() } as any;
          const newItems = missing.map((sku, idx) => ({
            id: prev.length + idx + 1,
            name: (() => { const subj = mapped.find((m: any) => String(m.nmId) === sku)?.subject; return typeof subj === 'string' ? subj : 'Товар WB'; })(),
            sku,
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
          const combined = [...prev, ...newItems].map(p => ({
            ...p,
            currentStock: totals.has(p.sku) ? (totals.get(p.sku) || 0) : p.currentStock
          }));
          return combined;
        });
      }
      await safeSaveToDb('stocks', mapped || []);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const pingLimits = async () => {
    setError(null);
    try {
      const key = await getWbKey();
      if (!key) throw new Error('Сначала сохраните ключ WB в настройках пользователя');
      const resp = await fetch('https://marketplace-api.wildberries.ru/ping', { headers: { Authorization: key } });
      const remainingHeader = resp.headers.get('x-ratelimit-remaining');
      const limitHeader = resp.headers.get('x-ratelimit-limit');
      const remaining = remainingHeader ? parseInt(remainingHeader, 10) : undefined;
      const limit = limitHeader ? parseInt(limitHeader, 10) : undefined;
      setRateInfo({ remaining, limit });
    } catch (e: any) {
      setError(e.message);
    }
  };

  const importPrices = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const key = await getWbKey();
      if (!key) throw new Error('Сначала сохраните ключ WB в настройках пользователя');
      const url = `https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter?limit=1000`;
      const data = await fetchWithRetry(url, key, true);
      const list = data?.data?.listGoods || data?.listGoods || [];
      await safeSaveToDb('prices', list);
      // обновим отображаемые имена (vendorCode -> supplierArticle). Не затираем, если имя уже есть и не равно SKU
      if (onUpdateProducts) {
        onUpdateProducts(prev => prev.map(p => {
          const g = (list as any[]).find((x: any) => String(x.nmID ?? x.nmId) === p.sku);
          if (p.name && p.name !== p.sku) return p;
          const name = g?.vendorCode || g?.supplierArticle || p.name;
          return name ? { ...p, name } : p;
        }));
      }
      setResult({ type: 'prices', count: list.length, data: list });
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const importAnalytics = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const key = await getWbKey();
      if (!key) throw new Error('Сначала сохраните ключ WB в настройках пользователя');
      // Соберем период (WB требует формат YYYY-MM-DD HH:mm:ss без таймзоны и ограничивает глубину периода)
      const pad = (n: number) => String(n).padStart(2, '0');
      const now = new Date();
      const maxDepthDays = 30; // безопасно: до 30 дней назад
      const minAllowed = new Date();
      minAllowed.setDate(minAllowed.getDate() - maxDepthDays);
      const beginDate = (() => {
        const d = new Date(`${dateFrom}T00:00:00`);
        if (isNaN(d.getTime())) return minAllowed;
        return d < minAllowed ? minAllowed : d;
      })();
      const begin = `${beginDate.getFullYear()}-${pad(beginDate.getMonth() + 1)}-${pad(beginDate.getDate())} 00:00:00`;
      const end = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const url = `https://seller-analytics-api.wildberries.ru/api/v2/nm-report/detail`;
      const body = { period: { begin, end }, page: 1 };
      const data = await postWithRetry(url, key, body);
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      await safeSaveToDb('analytics', list);
      // обновим имя/категорию (vendorCode/supplierArticle, object.name). Не затираем существующее осмысленное имя
      if (onUpdateProducts) {
        onUpdateProducts(prev => prev.map(p => {
          const g = list.find((x: any) => String(x.nmID ?? x.nmId) === p.sku);
          const name = (p.name && p.name !== p.sku) ? p.name : (g?.vendorCode || g?.supplierArticle || p.name);
          const category = g?.object?.name || p.category;
          return { ...p, name, category };
        }));
      }
      setResult({ type: 'analytics', count: list.length, data: list });
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const downloadData = () => {
    if (!result?.data) return;
    const filename = `wb-${result.type}-${dateFrom}.json`;
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Дата начала периода */}
      <div className="flex items-center space-x-4">
        <label className="text-sm font-medium text-gray-700">Период с:</label>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border rounded px-3 py-1 text-sm" />
        <span className="text-xs text-gray-500">до сегодня</span>
        <button onClick={pingLimits} className="ml-auto px-2 py-1 text-xs bg-gray-100 rounded border">/ping</button>
        {rateInfo && (
          <span className="text-xs text-gray-600">Rate: {rateInfo.remaining ?? '—'}/{rateInfo.limit ?? '—'}</span>
        )}
      </div>

      {/* Кнопки импорта */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <button onClick={importSales} disabled={loading} className="px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Продажи</button>
        <button onClick={importPurchases} disabled={loading} className="px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Поставки</button>
        <button onClick={importStocks} disabled={loading} className="px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Остатки</button>
        <button onClick={importPrices} disabled={loading} className="px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Цены</button>
        <button onClick={importAnalytics} disabled={loading} className="px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Аналитика</button>
        <div className="flex gap-2">
          <button onClick={downloadData} disabled={!result?.data} className="px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Скачать JSON</button>
          <button onClick={() => setResult(null)} className="px-3 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-50">Очистить</button>
        </div>
      </div>

      {loading && <div className="text-sm text-blue-600">Загружаем данные из Wildberries API...</div>}
      {error && <div className="text-sm text-red-600 p-2 bg-red-50 rounded">❌ {error}</div>}
      {result && (
        <div className="text-sm p-3 bg-green-50 border border-green-200 rounded">
          ✅ <strong>{result.type === 'sales' ? 'Продажи' : result.type === 'purchases' ? 'Поставки' : 'Остатки'}</strong>: найдено {result.count} записей
          {result.data && result.data.length > 0 && (
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
              <strong>Превью:</strong> {JSON.stringify(result.data[0], null, 2).slice(0, 200)}...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WildberriesImporter;
