import React from 'react';
import { Product } from '../types';
import { fetchCbrRateToRub } from '../utils/fx';
import { getWbStocksUrl, getWbSalesUrl } from '../constants/api';

interface ProductDetailsModalProps {
  product: Product | null;
  onClose: () => void;
}

type StockApiRecord = {
  date: string;
  nmId: number | string;
  warehouse: string;
  quantity: number;
  inWayToClient: number;
  inWayFromClient: number;
  price?: number;
  discount?: number;
  techSize?: string;
  barcode?: string;
};

type SalesApiRecord = {
  date: string;
  nmId: number | string;
  quantity: number;
  totalPrice?: number;
  warehouseName?: string;
};

const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({ product, onClose }) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [stocks, setStocks] = React.useState<StockApiRecord[]>([]);
  const [sales30d, setSales30d] = React.useState<SalesApiRecord[]>([]);
  const [priceCards, setPriceCards] = React.useState<any[]>([]);
  const [wbCard, setWbCard] = React.useState<{ vendorCode?: string; objectName?: string; stocksWb?: number } | null>(null);
  const [lifetime, setLifetime] = React.useState<{ units: number; revenue: number }>({ units: 0, revenue: 0 });
  const [warehousesDict, setWarehousesDict] = React.useState<Record<string, string>>({});
  const [costForm, setCostForm] = React.useState<{ purchase_amount?: number | null; purchase_currency?: string; logistics_amount?: number | null; logistics_currency?: string; fx_rate?: number | null }>({ purchase_amount: null, purchase_currency: 'CNY', logistics_amount: null, logistics_currency: 'USD', fx_rate: null });
  const [costStatus, setCostStatus] = React.useState<string | null>(null);

  const skuStr = product ? String(product.sku) : '';

  // Helpers
  const pad = (n: number) => String(n).padStart(2, '0');
  const isoDateParam = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00`;
  const toIsoDateOrNull = (value: unknown): string | null => {
    try {
      if (typeof value === 'string') {
        const only = value.split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(only)) return `${only}T00:00:00Z`;
        const d = new Date(value);
        if (!isNaN(d.getTime())) return `${d.toISOString().split('T')[0]}T00:00:00Z`;
      } else if (value instanceof Date && !isNaN(value.getTime())) {
        return `${value.toISOString().split('T')[0]}T00:00:00Z`;
      }
    } catch { }
    return null;
  };

  // Читаем WB ключ пользователя из localStorage
  const getWbKey = async (): Promise<string | null> => {
    return localStorage.getItem('wb_api_key');
  };

  const refreshFromWB = async () => {
    if (!product) return;
    try {
      setLoading(true);
      setError(null);

      // Прямой WB запрос с ключом
      const key = await getWbKey();
      if (!key) throw new Error('Нет WB API ключа. Сохраните его в настройках.');

      const stocksDateFrom = `2019-01-01T00:00:00`;
      const directUrlStocks = getWbStocksUrl(stocksDateFrom);
      const wbStocksResp = await fetch(directUrlStocks, { headers: { Authorization: key, Accept: 'application/json' } });
      if (!wbStocksResp.ok) throw new Error(`WB stocks error: ${wbStocksResp.statusText}`);
      const wbStocksJson: any = await wbStocksResp.json();
      const stocksList: any[] = Array.isArray(wbStocksJson) ? wbStocksJson : (wbStocksJson?.stocks || []);
      const skuStocks = (stocksList || []).filter((r: any) => String(r.nmId ?? r.nmid) === skuStr);

      const salesDateFrom = `2019-01-01T00:00:00`;
      const directUrlSales = getWbSalesUrl(salesDateFrom);
      const wbSalesResp = await fetch(directUrlSales, { headers: { Authorization: key, Accept: 'application/json' } });
      let skuSales: any[] = [];
      if (wbSalesResp.ok) {
        const wbSalesJson: any = await wbSalesResp.json();
        const salesList: any[] = Array.isArray(wbSalesJson) ? wbSalesJson : (wbSalesJson?.sales || []);
        skuSales = (salesList || []).filter((r: any) => String(r.nmId ?? r.nmid) === skuStr);
      }

      const directUrlPrices = `https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter?limit=1000`;
      let skuPrices: any[] = [];
      try {
        const wbPricesResp = await fetch(directUrlPrices, { headers: { Authorization: key, Accept: 'application/json' } });
        if (wbPricesResp.ok) {
          const pricesJson = await wbPricesResp.json();
          const list = pricesJson?.data?.listGoods || pricesJson?.listGoods || [];
          const match = (list as any[]).find((g: any) => String(g.nmID ?? g.nmId ?? g.nmid) === skuStr);
          if (match) skuPrices = match.sizes || [];
        }
      } catch { }

      // Сохраняем свежие данные в localStorage, чтобы обновить общий кэш
      try {
        if (skuStocks.length > 0) {
          const str = localStorage.getItem('wb_stocks');
          let allStocks = str ? JSON.parse(str) : [];
          allStocks = allStocks.filter((r: any) => String(r.sku || r.nmId) !== skuStr);
          allStocks.push(...skuStocks.map((r: any) => ({ ...r, sku: skuStr, date: toIsoDateOrNull(r.lastChangeDate || r.date) || new Date().toISOString() })));
          localStorage.setItem('wb_stocks', JSON.stringify(allStocks));
        }
        if (skuSales.length > 0) {
          const str = localStorage.getItem('wb_sales');
          let allSales = str ? JSON.parse(str) : [];
          allSales = allSales.filter((r: any) => String(r.sku || r.nmId) !== skuStr);
          allSales.push(...skuSales.map((s: any) => ({ ...s, sku: skuStr, date: toIsoDateOrNull(s.date) || new Date().toISOString() })));
          localStorage.setItem('wb_sales', JSON.stringify(allSales));
        }
        if (skuPrices.length > 0) {
          const str = localStorage.getItem('wb_prices');
          let allPrices = str ? JSON.parse(str) : [];
          allPrices = allPrices.filter((r: any) => String(r.nm_id || r.nmId || r.nmID) !== skuStr);
          allPrices.push(...skuPrices.map((s: any) => ({ ...s, nm_id: skuStr })));
          localStorage.setItem('wb_prices', JSON.stringify(allPrices));
        }
      } catch { }

      setStocks(skuStocks.map((r: any) => ({
        date: (r.lastChangeDate || r.date || '').split('T')[0],
        nmId: skuStr,
        warehouse: r.warehouseName || r.warehouse || 'Склад WB',
        quantity: Number(r.quantity || 0),
        inWayToClient: Number(r.inWayToClient || 0),
        inWayFromClient: Number(r.inWayFromClient || 0),
        price: r.Price !== undefined ? Number(r.Price) : undefined,
        discount: r.Discount !== undefined ? Number(r.Discount) : undefined,
        techSize: r.techSize || undefined,
        barcode: r.barcode || undefined
      })));

      setSales30d(skuSales.map((r: any) => ({
        date: (r.date || '').split('T')[0],
        nmId: skuStr,
        quantity: Number(r.quantity || 0),
        totalPrice: r.totalPrice !== undefined ? Number(r.totalPrice) : undefined,
        warehouseName: r.warehouseName || undefined
      })));

      setPriceCards(skuPrices.map((r: any) => ({
        sizeID: r.sizeID || r.sizeId || r.id,
        price: r.price,
        discountedPrice: r.discountedPrice,
        discount: r.discount,
        techSizeName: r.techSizeName
      })));

    } catch (e: any) {
      setError(e.message || 'Ошибка обновления из WB');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (!product) return;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const since = new Date(); since.setDate(since.getDate() - 30);
        const dateFromMs = since.getTime();

        // 1. Stocks from localStorage
        const stStr = localStorage.getItem('wb_stocks');
        let dbStocks = stStr ? JSON.parse(stStr) : [];
        dbStocks = dbStocks.filter((r: any) => String(r.sku || r.nmId) === skuStr);
        if (dbStocks.length > 0) {
          setStocks(dbStocks.map((r: any) => ({
            date: (r.date || '').split('T')[0],
            nmId: skuStr,
            warehouse: r.warehouse || r.warehouseName || 'Склад WB',
            quantity: Number(r.quantity || 0),
            inWayToClient: Number(r.in_way_to_client || r.inWayToClient || 0),
            inWayFromClient: Number(r.in_way_from_client || r.inWayFromClient || 0),
            price: typeof r.price === 'number' ? r.price : (r.Price !== undefined ? Number(r.Price) : undefined),
            discount: typeof r.discount === 'number' ? r.discount : (r.Discount !== undefined ? Number(r.Discount) : undefined),
            techSize: r.tech_size || r.techSize || r.techSizeName || undefined,
            barcode: r.barcode || undefined
          })));
        }

        // 2. Sales 30d from localStorage
        const saStr = localStorage.getItem('wb_sales');
        let dbSales = saStr ? JSON.parse(saStr) : [];
        const saStrRecent = dbSales.filter((r: any) => String(r.sku || r.nmId) === skuStr && new Date(r.date).getTime() >= dateFromMs);
        if (saStrRecent.length > 0) {
          setSales30d(saStrRecent.map((r: any) => ({
            date: (r.date || '').split('T')[0],
            nmId: skuStr,
            quantity: Number(r.units || r.quantity || 0),
            totalPrice: typeof r.revenue === 'number' ? r.revenue : (r.totalPrice !== undefined ? Number(r.totalPrice) : undefined),
            warehouseName: r.warehouse || r.warehouseName || undefined
          })));
        }

        // Lifetime aggregation from localStorage
        if (dbSales.length > 0) {
          const allSales = dbSales.filter((r: any) => String(r.sku || r.nmId) === skuStr);
          const units = allSales.reduce((s: number, r: any) => s + Number(r.units || r.quantity || 0), 0);
          const revenue = allSales.reduce((s: number, r: any) => s + (typeof r.revenue === 'number' ? r.revenue : (typeof r.totalPrice === 'number' ? r.totalPrice : 0)), 0);
          setLifetime({ units, revenue });
        }

        // 3. Prices by sizes
        const prStr = localStorage.getItem('wb_prices');
        let dbPrices = prStr ? JSON.parse(prStr) : [];
        dbPrices = dbPrices.filter((r: any) => String(r.nm_id || r.nmId || r.nmID) === skuStr);
        if (dbPrices.length > 0) {
          setPriceCards(dbPrices.map((r: any) => ({
            sizeID: r.size_id || r.sizeID || r.sizeId || r.id,
            price: r.price,
            discountedPrice: r.discounted_price || r.discountedPrice,
            discount: r.discount,
            techSizeName: r.raw?.size?.techSizeName || r.techSizeName || r.sizeName
          })));
        }

        // 4. Analytics card
        const anStr = localStorage.getItem('wb_analytics');
        let dbAn = anStr ? JSON.parse(anStr) : [];
        dbAn = dbAn.filter((r: any) => String(r.nm_id || r.nmId || r.nmID) === skuStr);
        if (dbAn.length > 0) {
          const row: any = dbAn[0];
          setWbCard({
            vendorCode: row.raw?.vendorCode || row.vendorCode,
            objectName: row.raw?.object?.name || row.objectName,
            stocksWb: typeof row.stocks_wb === 'number' ? row.stocks_wb : undefined
          });
        }

        // 5. Load latest cost settings for this SKU
        const costStr = localStorage.getItem('wb_costs');
        let dbCosts = costStr ? JSON.parse(costStr) : [];
        dbCosts = dbCosts.filter((r: any) => String(r.sku) === skuStr).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        if (dbCosts.length > 0) {
          const costRow = dbCosts[0];
          setCostForm({
            purchase_amount: typeof costRow.purchase_amount === 'number' ? costRow.purchase_amount : null,
            purchase_currency: costRow.purchase_currency || 'CNY',
            logistics_amount: typeof costRow.logistics_amount === 'number' ? costRow.logistics_amount : null,
            logistics_currency: costRow.logistics_currency || 'USD',
            fx_rate: typeof costRow.fx_rate === 'number' ? costRow.fx_rate : null
          });
        }
      } catch (e: any) {
        setError(e.message || 'Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, [product, skuStr]);

  if (!product) return null;

  // Группировка остатков по складам: берём по каждому штрихкоду (barcode) последний снапшот, затем суммируем по складу
  // Показываем ТОЛЬКО склады с положительным остатком
  const warehouses: Array<{ warehouse: string; qty: number; inWayToClient: number; inWayFromClient: number }> = (() => {
    const normalize = (w?: string | null) => {
      let s = (w && String(w).trim()) ? String(w).trim() : 'UNKNOWN';
      const l = s.toLowerCase();
      // Канонизация часто встречающихся вариантов названий WB складов
      if (l.includes('коледин')) return 'Коледино';
      if (l.includes('новосемейкин') || l.includes('новосемейкино')) return 'Самара (Новосемейкино)';
      if (l.includes('санкт') && l.includes('уткина')) return 'Санкт-Петербург Уткина Заводь';
      if (l.includes('виртуальный') && l.includes('краснодар')) return 'Виртуальный Краснодар';
      if (l.includes('сц ') && l.includes('ереван')) return 'СЦ Ереван';
      if (l.includes('рязан') && l.includes('тюшев')) return 'Рязань (Тюшевское)';
      if (l.includes('екатеринбург') && l.includes('испыт')) return 'Екатеринбург - Испытателей 14г';
      if (l.includes('екатеринбург') && l.includes('перспектив')) return 'Екатеринбург - Перспективный 12';
      if (l.includes('чашников')) return 'Чашниково';
      if (l.includes('обухов')) return 'Обухово';
      if (l.includes('котовск')) return 'Котовск';
      if (l.includes('волгоград')) return 'Волгоград';
      if (l.includes('череповец')) return 'Череповец';
      if (l.includes('раду')) return 'Радумля 1';
      if (l.includes('тула')) return 'Тула';
      if (l.includes('иванов')) return 'Иваново';
      if (l.includes('краснодар')) return 'Краснодар';
      if (l.includes('казан')) return 'Казань';
      if (l.includes('электрост')) return 'Электросталь';
      if (l.includes('невинномыс')) return 'Невинномысск';
      if (l.includes('новосибир')) return 'Новосибирск';
      return s;
    };
    type Snap = { ts: number; qty: number; iwc: number; iwf: number };
    const latestByWhBarcode = new Map<string, Map<string, Snap>>();
    (stocks || []).forEach(s => {
      const wh = normalize(s.warehouse);
      const bc = (s.barcode && String(s.barcode).trim()) ? String(s.barcode).trim() : 'NO_BARCODE';
      const ts = new Date(s.date).getTime() || 0;
      if (!latestByWhBarcode.has(wh)) latestByWhBarcode.set(wh, new Map());
      const map = latestByWhBarcode.get(wh)!;
      const cur = map.get(bc);
      if (!cur || ts >= cur.ts) {
        map.set(bc, { ts, qty: s.quantity || 0, iwc: s.inWayToClient || 0, iwf: s.inWayFromClient || 0 });
      }
    });
    const totals = new Map<string, { qty: number; iwc: number; iwf: number }>();
    latestByWhBarcode.forEach((byBc, wh) => {
      let qty = 0, iwc = 0, iwf = 0;
      byBc.forEach(s => { qty += s.qty; iwc += s.iwc; iwf += s.iwf; });
      totals.set(wh, { qty, iwc, iwf });
    });
    // Возвращаем только склады с положительным остатком
    return Array.from(totals.entries())
      .map(([warehouse, v]) => ({ warehouse, qty: v.qty, inWayToClient: v.iwc, inWayFromClient: v.iwf }))
      .filter(row => (row.qty || 0) > 0)
      .sort((a, b) => (b.qty - a.qty));
  })();

  const totalQty = warehouses.reduce((s, w) => s + (w.qty || 0), 0);
  const latestPriceInfo: { ts: number; price?: number; discount?: number } | null = (() => {
    let latest: { ts: number; price?: number; discount?: number } | null = null;
    (stocks || []).forEach((s: any) => {
      const ts = new Date(s.date).getTime() || 0;
      const price = typeof s.price === 'number' ? s.price : undefined;
      const discount = typeof s.discount === 'number' ? s.discount : undefined;
      if (!latest || ts >= latest.ts) latest = { ts, price, discount };
    });
    return latest;
  })();
  const lpi: any = latestPriceInfo as any;
  const latestPrice = typeof lpi?.price === 'number' ? lpi.price : undefined;
  const latestDiscount = typeof lpi?.discount === 'number' ? lpi.discount : undefined;

  const salesAgg = sales30d.reduce((acc, r) => {
    acc.units += r.quantity || 0;
    acc.revenue += typeof r.totalPrice === 'number' ? r.totalPrice : 0;
    return acc;
  }, { units: 0, revenue: 0 });

  const fmtRub = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Карточка товара • {product.name} ({product.sku})</h3>
          <div className="flex items-center gap-2">
            <button data-testid="btn-refresh-wb" onClick={refreshFromWB} disabled={loading} className="px-3 py-1 text-sm bg-blue-600 text-white rounded disabled:opacity-50">Обновить из WB</button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
        </div>

        {loading && (
          <div className="text-gray-600">Загрузка фактических данных из WB…</div>
        )}
        {error && (
          <div className="text-red-600 text-sm mb-3">{error}</div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-sm text-gray-500">Текущий общий остаток</div>
                  <div className="text-2xl font-bold">{totalQty}</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-sm text-gray-500">Продажи за 30 дней</div>
                  <div className="text-2xl font-bold">{salesAgg.units}</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-sm text-gray-500">Выручка за 30 дней</div>
                  <div className="text-2xl font-bold">₽{fmtRub(salesAgg.revenue)}</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-sm text-gray-500">Всего продаж (шт)</div>
                  <div className="text-2xl font-bold">{lifetime.units}</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-sm text-gray-500">Выручка за всё время</div>
                  <div className="text-2xl font-bold">₽{fmtRub(lifetime.revenue)}</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-sm text-gray-500">Актуальная цена</div>
                  <div className="text-2xl font-bold">
                    {typeof latestPrice === 'number' ? `₽${fmtRub(latestPrice)}` : '—'}
                    {typeof latestDiscount === 'number' && latestDiscount > 0 && (
                      <span className="text-sm text-gray-500 ml-2">(скидка {latestDiscount}%)</span>
                    )}
                  </div>
                </div>
              </div>

              {wbCard && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-sm text-gray-500">VendorCode</div>
                    <div className="text-lg font-semibold">{wbCard.vendorCode || '—'}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-sm text-gray-500">Объект</div>
                    <div className="text-lg font-semibold">{wbCard.objectName || '—'}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-sm text-gray-500">Stocks WB (analytics)</div>
                    <div className="text-lg font-semibold">{typeof wbCard.stocksWb === 'number' ? wbCard.stocksWb : '—'}</div>
                  </div>
                </div>
              )}

              {priceCards && priceCards.length > 0 && (
                <div>
                  <h4 className="text-md font-semibold mb-2">Цены по размерам</h4>
                  <div className="border rounded overflow-hidden">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left">Размер</th>
                          <th className="px-3 py-2 text-right">Цена</th>
                          <th className="px-3 py-2 text-right">Цена со скидкой</th>
                          <th className="px-3 py-2 text-right">Скидка</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceCards.map((s: any, i: number) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2">{s.techSizeName || s.sizeID || s.sizeId || s.id || '-'}</td>
                            <td className="px-3 py-2 text-right">{typeof s.price === 'number' ? fmtRub(s.price) : '-'}</td>
                            <td className="px-3 py-2 text-right">{typeof s.discountedPrice === 'number' ? fmtRub(s.discountedPrice) : '-'}</td>
                            <td className="px-3 py-2 text-right">{typeof s.discount === 'number' ? `${s.discount}%` : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-md font-semibold mb-2">Последние продажи (30д)</h4>
                {sales30d.length === 0 ? (
                  <div className="text-sm text-gray-500">Нет продаж</div>
                ) : (
                  <div className="h-40 overflow-auto border rounded">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Дата</th>
                          <th className="px-3 py-2 text-right">Кол-во</th>
                          <th className="px-3 py-2 text-right">Выручка</th>
                          <th className="px-3 py-2 text-left">Склад</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales30d.slice(0, 100).map((s, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2">{s.date}</td>
                            <td className="px-3 py-2 text-right">{s.quantity}</td>
                            <td className="px-3 py-2 text-right">{typeof s.totalPrice === 'number' ? Math.round(s.totalPrice) : '-'}</td>
                            <td className="px-3 py-2">{s.warehouseName || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-md font-semibold">Остатки по складам</h4>
                <span className="text-xs text-gray-500">{warehouses.length} склад(а)</span>
              </div>
              {warehouses.length === 0 ? (
                <div className="text-sm text-gray-500">Нет положительных остатков</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {warehouses.map((w, i) => (
                    <div key={i} className="border rounded p-2">
                      <div className="text-sm font-medium truncate" title={w.warehouse}>{w.warehouse}</div>
                      <div className="text-xs text-gray-600">В наличии: <span className="font-semibold">{w.qty}</span></div>
                      <div className="text-[11px] text-gray-500">В пути: {w.inWayToClient} • Возвраты: {w.inWayFromClient}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 border-t pt-3">
                <h4 className="text-md font-semibold mb-2">Себестоимость (для расчетов)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div>
                    <label className="block text-xs text-gray-600">Закуп (число)</label>
                    <input type="number" step="0.01" value={costForm.purchase_amount ?? ''} onChange={(e) => setCostForm(f => ({ ...f, purchase_amount: e.target.value === '' ? null : Number(e.target.value) }))} className="w-full border rounded px-2 py-1" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Валюта закупа</label>
                    <select value={costForm.purchase_currency || 'CNY'} onChange={(e) => setCostForm(f => ({ ...f, purchase_currency: e.target.value }))} className="w-full border rounded px-2 py-1">
                      <option value="RUB">RUB</option>
                      <option value="CNY">CNY</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Логистика (число)</label>
                    <input type="number" step="0.01" value={costForm.logistics_amount ?? ''} onChange={(e) => setCostForm(f => ({ ...f, logistics_amount: e.target.value === '' ? null : Number(e.target.value) }))} className="w-full border rounded px-2 py-1" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Валюта логистики</label>
                    <select value={costForm.logistics_currency || 'USD'} onChange={(e) => setCostForm(f => ({ ...f, logistics_currency: e.target.value }))} className="w-full border rounded px-2 py-1">
                      <option value="RUB">RUB</option>
                      <option value="USD">USD</option>
                      <option value="CNY">CNY</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">FX к RUB (опц.)</label>
                    <input type="number" step="0.0001" value={costForm.fx_rate ?? ''} onChange={(e) => setCostForm(f => ({ ...f, fx_rate: e.target.value === '' ? null : Number(e.target.value) }))} className="w-full border rounded px-2 py-1" />
                  </div>
                  <div className="flex items-end">
                    <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={async () => {
                      try {
                        setCostStatus('Сохраняю...');
                        let fx = costForm.fx_rate ?? null;
                        if (!fx && costForm.purchase_currency && costForm.purchase_currency !== 'RUB') {
                          const rate = await fetchCbrRateToRub(costForm.purchase_currency, new Date().toISOString());
                          fx = rate ?? null;
                        }
                        const payload: any = {
                          date: `${new Date().toISOString().split('T')[0]}T00:00:00.000Z`,
                          sku: skuStr,
                          purchase_amount: costForm.purchase_amount ?? null,
                          purchase_currency: costForm.purchase_currency || null,
                          logistics_amount: costForm.logistics_amount ?? null,
                          logistics_currency: costForm.logistics_currency || null,
                          fx_rate: fx
                        };
                        const str = localStorage.getItem('wb_costs');
                        let costs = str ? JSON.parse(str) : [];
                        const idx = costs.findIndex((c: any) => c.date === payload.date && c.sku === payload.sku);
                        if (idx !== -1) costs[idx] = payload; else costs.push(payload);
                        localStorage.setItem('wb_costs', JSON.stringify(costs));

                        setCostStatus('Сохранено. Обновляю данные...');
                        setTimeout(() => { try { window.location.reload(); } catch { } }, 600);
                      } catch (e: any) {
                        setCostStatus(e.message || 'Ошибка сохранения');
                      }
                    }}>Сохранить локально</button>
                  </div>
                </div>
                {costStatus && <div className="text-xs text-gray-600 mt-1">{costStatus}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetailsModal;


