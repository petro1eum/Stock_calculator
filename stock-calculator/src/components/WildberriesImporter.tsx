import React from 'react';
import { Product, SalesRecord } from '../types';
import { supabase } from '../utils/supabaseClient';
import { updateProductsFromSales } from '../utils/inventoryCalculations';

interface WildberriesImporterProps {
  onUpdateProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
}

const API_BASE = (process.env.REACT_APP_API_BASE as string) || '';

const WildberriesImporter: React.FC<WildberriesImporterProps> = ({ onUpdateProducts }) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<any>(null);
  const [dateFrom, setDateFrom] = React.useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // 30 дней назад
    return date.toISOString().split('T')[0];
  });

  const parseJsonStrict = async (resp: Response) => {
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error('Ответ не JSON. Проверьте REACT_APP_API_BASE для dev.');
    }
    return resp.json();
  };

  const safeSaveToDb = async (type: 'sales' | 'purchases' | 'stocks', records: any[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      let ok = false;
      if (token) {
        try {
          const resp = await fetch(`${API_BASE}/api/db-save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ type, records })
          });
          if (resp.ok) {
            try {
              const ct = resp.headers.get('content-type') || '';
              if (ct.includes('application/json')) {
                const json = await resp.json();
                ok = Boolean(json && (json.ok === true || json.inserted >= 0));
              }
            } catch { ok = false; }
          }
        } catch {}
      }
      if (!ok) {
        // fallback: прямой upsert в supabase
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (type === 'sales') {
          const rows = records.map((r: any) => ({
            user_id: user.id,
            date: r.date,
            sku: String(r.nmId),
            units: Number(r.quantity || 0),
            revenue: r.totalPrice !== undefined ? Number(r.totalPrice) : null,
            sale_id: String(r.saleID || r.gNumber || r.srid || `${r.nmId || r.nmid}-${r.date}-${r.barcode || ''}`),
            warehouse: r.warehouseName || null,
            raw: r
          }));
          await supabase.from('wb_sales').upsert(rows, { onConflict: 'user_id,sale_id' as any });
        }
        if (type === 'purchases') {
          const rows = records.map((r: any) => ({
            user_id: user.id,
            date: r.date,
            sku: String(r.nmId),
            quantity: Number(r.quantity || 0),
            total_price: r.totalPrice !== undefined ? Number(r.totalPrice) : null,
            income_id: r.incomeId ? String(r.incomeId) : null,
            warehouse: r.warehouse || null,
            raw: r
          }));
          await supabase.from('wb_purchases').upsert(rows, { onConflict: 'user_id,income_id' as any });
        }
        if (type === 'stocks') {
          const rows = records.map((r: any) => ({
            user_id: user.id,
            date: r.date,
            sku: String(r.nmId),
            barcode: r.barcode || null,
            tech_size: r.techSize || null,
            quantity: Number(r.quantity || 0),
            in_way_to_client: Number(r.inWayToClient || 0),
            in_way_from_client: Number(r.inWayFromClient || 0),
            warehouse: r.warehouse || r.warehouseName || null,
            price: r.price !== undefined ? Number(r.price) : null,
            discount: r.discount !== undefined ? Number(r.discount) : null,
            raw: r
          }));
          await supabase.from('wb_stocks').upsert(rows, { onConflict: 'user_id,sku,barcode,date' as any });
        }
      }
    } catch {}
  };

  const importSales = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`${API_BASE}/api/wb-sales?dateFrom=${dateFrom}`);
      const data = await parseJsonStrict(response);
      if (!response.ok) throw new Error(data.error || 'Ошибка получения данных');
      const res = { type: 'sales', count: data.sales?.length || 0, data: data.sales };
      setResult(res);
      if (onUpdateProducts && res.data && res.data.length > 0) {
        const salesRecords: SalesRecord[] = res.data.map((s: any) => ({
          date: s.date,
          sku: String(s.nmId),
          units: Number(s.quantity || 1),
          revenue: Number(s.totalPrice || 0)
        }));
        onUpdateProducts(prev => updateProductsFromSales(prev, salesRecords, { weeksWindow: 26 }));
      }
      await safeSaveToDb('sales', res.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const importPurchases = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const response = await fetch(`${API_BASE}/api/wb-purchases?dateFrom=${dateFrom}`);
      const data = await parseJsonStrict(response);
      if (!response.ok) throw new Error(data.error || 'Ошибка получения данных');
      const res = { type: 'purchases', count: data.purchases?.length || 0, data: data.purchases };
      setResult(res);
      await safeSaveToDb('purchases', res.data || []);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const importStocks = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const response = await fetch(`${API_BASE}/api/wb-stocks?dateFrom=${dateFrom}`);
      const data = await parseJsonStrict(response);
      if (!response.ok) throw new Error(data.error || 'Ошибка получения данных');
      const res = { type: 'stocks', count: data.stocks?.length || 0, data: data.stocks };
      setResult(res);
      await safeSaveToDb('stocks', res.data || []);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const importOrders = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const response = await fetch(`${API_BASE}/api/wb-orders?limit=100&next=0`);
      const data = await parseJsonStrict(response);
      if (!response.ok) throw new Error(data.error || 'Ошибка получения данных');
      setResult({ type: 'orders', count: data.orders?.length || 0, total: data.total || 0, data: data.orders });
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
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
        <label className="text-sm font-medium text-gray-700">
          Период с:
        </label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border rounded px-3 py-1 text-sm"
        />
        <span className="text-xs text-gray-500">до сегодня</span>
      </div>

      {/* Кнопки импорта */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button
          onClick={importSales}
          disabled={loading}
          className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          📈 Продажи
        </button>
        <button
          onClick={importPurchases}
          disabled={loading}
          className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          📦 Поставки
        </button>
        <button
          onClick={importStocks}
          disabled={loading}
          className="px-3 py-2 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
        >
          📊 Остатки
        </button>
        <button
          onClick={importOrders}
          disabled={loading}
          className="px-3 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          🛒 Заказы
        </button>
      </div>

      {/* Статус загрузки */}
      {loading && (
        <div className="text-sm text-blue-600">
          Загружаем данные из Wildberries API...
        </div>
      )}

      {/* Ошибки */}
      {error && (
        <div className="text-sm text-red-600 p-2 bg-red-50 rounded">
          ❌ {error}
        </div>
      )}

      {/* Результат */}
      {result && (
        <div className="text-sm p-3 bg-green-50 border border-green-200 rounded">
          <div className="flex justify-between items-center">
            <div>
              ✅ <strong>{getResultTitle(result.type)}</strong>: найдено {result.count} записей
              {result.total && result.total > result.count && ` из ${result.total} всего`}
            </div>
            <button
              onClick={downloadData}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              💾 Скачать
            </button>
          </div>
          {result.type === 'sales' && (
            <div className="mt-2 text-xs text-gray-600">
              История продаж автоматически применена к товарам (SKU = nmId). Если товары не обновились, убедитесь, что SKU совпадает с nmId.
            </div>
          )}
          
          {/* Превью данных */}
          {result.data && result.data.length > 0 && (
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
              <strong>Превью:</strong> {JSON.stringify(result.data[0], null, 2).slice(0, 200)}...
            </div>
          )}
        </div>
      )}

      {/* Справка */}
      <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
        <strong>Справка:</strong> Данные загружаются из API Wildberries с ключом из .env файла. 
        Продажи и поставки зависят от выбранного периода, остатки и заказы показывают текущее состояние. 
        Для пересчета параметров спроса SKU должен совпадать с nmId из Wildberries.
      </div>
    </div>
  );
};

function getResultTitle(type: string): string {
  switch (type) {
    case 'sales': return 'Продажи';
    case 'purchases': return 'Поставки';
    case 'stocks': return 'Остатки';
    case 'orders': return 'Заказы';
    default: return 'Данные';
  }
}

export default WildberriesImporter;
