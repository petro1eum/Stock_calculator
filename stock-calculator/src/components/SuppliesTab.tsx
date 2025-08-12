import React from 'react';
import { supabase } from '../utils/supabaseClient';

interface SupplyRecord {
  date: string;
  sku: string;
  quantity: number;
  warehouse?: string | null;
  total_price?: number | null;
}

const SuppliesTab: React.FC = () => {
  const [suppliesByDay, setSuppliesByDay] = React.useState<Record<string, SupplyRecord[]>>({});
  const [year, setYear] = React.useState<number>(new Date().getFullYear());
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');
      const from = new Date(year, 0, 1).toISOString();
      const to = new Date(year + 1, 0, 1).toISOString();
      const { data, error } = await supabase
        .from('wb_purchases')
        .select('date, sku, quantity, warehouse, total_price, raw')
        .eq('user_id', user.id)
        .gte('date', from)
        .lt('date', to)
        .order('date', { ascending: true })
        .limit(100000);
      if (error) throw error;
      const map: Record<string, SupplyRecord[]> = {};
      (data || []).forEach((r: any) => {
        const day = (r.date || '').split('T')[0];
        if (!map[day]) map[day] = [];
        map[day].push({ date: day, sku: String(r.sku), quantity: Number(r.quantity || 0), warehouse: r.warehouse || r.raw?.warehouseName || null, total_price: r.total_price ?? null });
      });
      setSuppliesByDay(map);
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  }, [year]);

  React.useEffect(() => { void load(); }, [load]);

  // Календарь: 12 месяцев × дни недели
  const months = React.useMemo(() => {
    const arr: { name: string; days: string[] }[] = [];
    for (let m = 0; m < 12; m++) {
      const days: string[] = [];
      const last = new Date(year, m + 1, 0).getDate();
      for (let d = 1; d <= last; d++) {
        days.push(`${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
      arr.push({ name: new Date(year, m, 1).toLocaleString('ru-RU', { month: 'long' }), days });
    }
    return arr;
  }, [year]);

  const suppliesCountByDay = React.useMemo(() => {
    const res: Record<string, number> = {};
    Object.entries(suppliesByDay).forEach(([day, rows]) => { res[day] = rows.length; });
    return res;
  }, [suppliesByDay]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Поставки</h2>
        <select className="border rounded px-2 py-1" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
          {[0,1,2,3,4].map(i => {
            const y = new Date().getFullYear() - i; return <option key={y} value={y}>{y}</option>;
          })}
        </select>
        {loading && <span className="text-sm text-gray-500">Загрузка…</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {/* Годовой календарь */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {months.map((m, idx) => (
          <div key={idx} className="border rounded p-2 bg-white">
            <div className="text-sm font-semibold mb-2 capitalize">{m.name}</div>
            <div className="grid grid-cols-7 gap-1 text-xs">
              {m.days.map(day => {
                const has = suppliesCountByDay[day] > 0;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={`h-8 border rounded ${has ? 'bg-red-100 border-red-400' : 'bg-gray-50'}`}
                    title={has ? `${suppliesCountByDay[day]} поставок` : ''}
                  >
                    {parseInt(day.slice(-2))}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Панель деталей для выбранного дня */}
      {selectedDay && (
        <div className="bg-white border rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">{selectedDay}: поставки ({(suppliesByDay[selectedDay]||[]).length})</h3>
            <button className="text-sm text-gray-600" onClick={() => setSelectedDay(null)}>Закрыть</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Кол-во</th>
                  <th className="px-3 py-2 text-left">Склад</th>
                  <th className="px-3 py-2 text-left">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(suppliesByDay[selectedDay]||[]).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{r.sku}</td>
                    <td className="px-3 py-2">{r.quantity}</td>
                    <td className="px-3 py-2">{r.warehouse || '—'}</td>
                    <td className="px-3 py-2">{typeof r.total_price === 'number' ? `$${r.total_price}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuppliesTab;


