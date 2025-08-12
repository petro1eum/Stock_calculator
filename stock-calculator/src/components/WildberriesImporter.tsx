import React from 'react';
import { Product, SalesRecord } from '../types';
import { supabase } from '../utils/supabaseClient';
import { updateProductsFromSales } from '../utils/inventoryCalculations';

interface WildberriesImporterProps {
  onUpdateProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
}

const WildberriesImporter: React.FC<WildberriesImporterProps> = ({ onUpdateProducts }) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<any>(null);
  const [dateFrom, setDateFrom] = React.useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // 30 дней назад
    return date.toISOString().split('T')[0];
  });

  const getWbKey = async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('user_secrets').select('wb_api_key').eq('user_id', user.id).maybeSingle();
    return (data?.wb_api_key as string) || null;
  };

  const safeSaveToDb = async (type: 'sales' | 'purchases' | 'stocks', records: any[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      let ok = false;
      if (token) {
        try {
          const resp = await fetch(`/api/db-save`, {
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
          await supabase.from('wb_sales').upsert(rows as any, { onConflict: 'user_id,sale_id' as any });
        }
        if (type === 'purchases') {
          const rows = records.map((r: any) => ({
            user_id: user.id,
            date: r.date,
            sku: String(r.nmId),
            quantity: Number(r.quantity || 0),
            total_price: r.totalPrice !== undefined ? Number(r.totalPrice) : null,
            income_id: r.incomeId ? String(r.incomeId) : null,
            warehouse: r.warehouse || r.warehouseName || null,
            raw: r
          }));
          await supabase.from('wb_purchases').upsert(rows as any, { onConflict: 'user_id,income_id' as any });
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
          await supabase.from('wb_stocks').upsert(rows as any, { onConflict: 'user_id,sku,barcode,date' as any });
        }
      }
    } catch {}
  };

  const importSales = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const key = await getWbKey();
      if (!key) throw new Error('Сначала сохраните ключ WB в настройках пользователя');
      const response = await fetch(`https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${dateFrom}`, {
        headers: { Authorization: key }
      });
      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`WB API: ${response.status} ${response.statusText} ${txt.slice(0, 200)}`);
      }
      const data = await response.json();
      const mapped = (data || []).map((sale: any) => ({
        date: sale.date?.split('T')[0] || sale.date,
        nmId: sale.nmId,
        subject: sale.subject,
        brand: sale.brand,
        quantity: sale.quantity || 1,
        totalPrice: sale.totalPrice || sale.finishedPrice,
        saleID: sale.saleID || sale.gNumber,
        warehouseName: sale.warehouseName
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
        onUpdateProducts(prev => updateProductsFromSales(prev, salesRecords, { weeksWindow: 26 }));
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
      const response = await fetch(`https://statistics-api.wildberries.ru/api/v1/supplier/incomes?dateFrom=${dateFrom}`, {
        headers: { Authorization: key }
      });
      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`WB API: ${response.status} ${response.statusText} ${txt.slice(0, 200)}`);
      }
      const data = await response.json();
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
      const response = await fetch(`https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${dateFrom}`, {
        headers: { Authorization: key }
      });
      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`WB API: ${response.status} ${response.statusText} ${txt.slice(0, 200)}`);
      }
      const data = await response.json();
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
      await safeSaveToDb('stocks', mapped || []);
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
        <label className="text-sm font-medium text-gray-700">Период с:</label>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border rounded px-3 py-1 text-sm" />
        <span className="text-xs text-gray-500">до сегодня</span>
      </div>

      {/* Кнопки импорта */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button onClick={importSales} disabled={loading} className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">📈 Продажи</button>
        <button onClick={importPurchases} disabled={loading} className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">📦 Поставки</button>
        <button onClick={importStocks} disabled={loading} className="px-3 py-2 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50">📊 Остатки</button>
        <button onClick={downloadData} disabled={!result?.data} className="px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50">💾 Скачать</button>
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
