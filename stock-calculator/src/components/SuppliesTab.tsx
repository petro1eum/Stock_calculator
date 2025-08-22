import React from 'react';
import { supabase } from '../utils/supabaseClient';
import { toast } from 'react-hot-toast';
import { PurchaseOrder, PurchaseOrderItem, LogisticsEvent } from '../types';
import PurchaseOrderForm from './PurchaseOrderForm';
import LogisticsEventForm from './LogisticsEventForm';
import { fetchCbrRateToRub } from '../utils/fx';

interface SupplyRecord {
  date: string;
  sku: string;
  name?: string | null;
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
  const [receiptsView, setReceiptsView] = React.useState<'calendar' | 'list'>('calendar');
  const [mode, setMode] = React.useState<'calendar' | 'orders' | 'risks'>('calendar');
  const [purchaseOrders, setPurchaseOrders] = React.useState<PurchaseOrder[]>([]);
  const [logisticsEvents, setLogisticsEvents] = React.useState<LogisticsEvent[]>([]);
  const [showOrderForm, setShowOrderForm] = React.useState(false);
  const [editingOrder, setEditingOrder] = React.useState<PurchaseOrder | null>(null);
  const [showRiskForm, setShowRiskForm] = React.useState(false);
  const [editingRisk, setEditingRisk] = React.useState<LogisticsEvent | null>(null);
  const [purchasesBySku, setPurchasesBySku] = React.useState<Map<string, { date: string; quantity: number; warehouse?: string | null }[]>>(new Map());
  const [nameBySku, setNameBySku] = React.useState<Map<string, string>>(new Map());
  const [costsByKey, setCostsByKey] = React.useState<Map<string, { purchase_amount?: number|null; purchase_currency?: string|null; logistics_amount?: number|null; logistics_currency?: string|null; fx_rate?: number|null }>>(new Map());
  const [riskView, setRiskView] = React.useState<'calendar' | 'list'>('calendar');
  const [selectedRiskDay, setSelectedRiskDay] = React.useState<string | null>(null);

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
        const sku = String(r.sku);
        const raw = r.raw || {};
        const name = nameBySku.get(sku) || raw.vendorCode || raw.supplierArticle || raw.name || null;
        let total = r.total_price;
        if (total == null) {
          if (typeof raw.totalPrice === 'number') total = raw.totalPrice;
          else if (typeof raw.forPay === 'number') total = raw.forPay;
          else if (typeof raw.price === 'number') total = Number(raw.price) * Number(r.quantity || 0);
        }
        map[day].push({ date: day, sku, name, quantity: Number(r.quantity || 0), warehouse: r.warehouse || raw.warehouseName || null, total_price: typeof total === 'number' ? total : null });
      });
      setSuppliesByDay(map);
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  }, [year]);

  const loadPurchaseOrders = React.useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');
      
      const { data: orders, error: ordersError } = await supabase
        .from('wb_purchase_orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (ordersError) throw ordersError;

      const { data: items, error: itemsError } = await supabase
        .from('wb_purchase_order_items')
        .select('*')
        .eq('user_id', user.id);
      
      if (itemsError) throw itemsError;

      const ordersWithItems = (orders || []).map(order => ({
        ...order,
        items: (items || []).filter(item => item.po_id === order.id)
      }));

      setPurchaseOrders(ordersWithItems);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const loadLogisticsEvents = React.useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');
      
      const { data, error } = await supabase
        .from('logistics_calendar')
        .select('*')
        .eq('user_id', user.id)
        .order('start_date', { ascending: false });
      
      if (error) throw error;
      setLogisticsEvents(data || []);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  React.useEffect(() => { 
    void load(); 
    void loadPurchaseOrders();
    void loadLogisticsEvents();
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const from = new Date(year, 0, 1).toISOString();
        const to = new Date(year + 1, 0, 1).toISOString();
        const { data } = await supabase
          .from('wb_costs')
          .select('date, sku, purchase_amount, purchase_currency, logistics_amount, logistics_currency, fx_rate')
          .eq('user_id', user.id)
          .gte('date', from)
          .lt('date', to);
        const map = new Map<string, any>();
        (data || []).forEach((r: any) => {
          const key = `${(r.date||'').split('T')[0]}|${String(r.sku)}`;
          map.set(key, { purchase_amount: r.purchase_amount, purchase_currency: r.purchase_currency, logistics_amount: r.logistics_amount, logistics_currency: r.logistics_currency, fx_rate: r.fx_rate });
        });
        setCostsByKey(map);
      } catch {}
    })();
  }, [load, loadPurchaseOrders, loadLogisticsEvents]);

  // Загружаем имена по SKU
  React.useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const map = new Map<string, string>();
        const { data: prices } = await supabase
          .from('wb_prices')
          .select('nm_id, raw')
          .eq('user_id', user.id)
          .limit(50000);
        (prices || []).forEach((p: any) => {
          const sku = String(p.nm_id);
          const nm = p.raw?.vendorCode || p.raw?.supplierArticle || p.raw?.name;
          if (nm && !map.has(sku)) map.set(sku, String(nm));
        });
        const { data: an } = await supabase
          .from('wb_analytics')
          .select('nm_id, raw')
          .eq('user_id', user.id)
          .limit(50000);
        (an || []).forEach((a: any) => {
          const sku = String(a.nm_id);
          const nm = a.raw?.vendorCode || a.raw?.supplierArticle || a.raw?.name;
          if (nm && !map.has(sku)) map.set(sku, String(nm));
        });
        const { data: sales } = await supabase
          .from('wb_sales')
          .select('sku, raw')
          .eq('user_id', user.id)
          .limit(50000);
        (sales || []).forEach((s: any) => {
          const sku = String(s.sku);
          const nm = s.raw?.supplierArticle || s.raw?.vendorCode || s.raw?.name;
          if (nm && !map.has(sku)) map.set(sku, String(nm));
        });
        setNameBySku(map);
      } catch {}
    })();
  }, []);

  // Загружаем приемки WB за последние 24 месяца для сопоставления с заказами
  React.useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const since = new Date();
        since.setMonth(since.getMonth() - 24);
        const { data, error } = await supabase
          .from('wb_purchases')
          .select('sku, date, quantity, warehouse, raw')
          .eq('user_id', user.id)
          .gte('date', since.toISOString())
          .order('date', { ascending: true })
          .limit(200000);
        if (error) throw error;
        const map = new Map<string, { date: string; quantity: number; warehouse?: string | null }[]>();
        (data || []).forEach((r: any) => {
          const sku = String(r.sku);
          const arr = map.get(sku) || [];
          arr.push({ date: r.date, quantity: Number(r.quantity || 0), warehouse: r.warehouse || r.raw?.warehouseName || null });
          map.set(sku, arr);
        });
        setPurchasesBySku(map);
      } catch {}
    })();
  }, []);

  // Сопоставление позиций заказа с первой приемкой после даты заказа
  const matchOrderItems = React.useCallback((order: PurchaseOrder) => {
    const orderDate = new Date(order.created_at);
    const rows = (order.items || []).map((it) => {
      const list = purchasesBySku.get(String(it.sku)) || [];
      const arrival = list.find(p => new Date(p.date) > orderDate);
      if (!arrival) return { sku: it.sku, qty: it.qty, arrivalDate: null as string | null, leadDays: null as number | null, leadWeeks: null as number | null, warehouse: null as string | null };
      const arrivalDate = new Date(arrival.date);
      const leadMs = arrivalDate.getTime() - orderDate.getTime();
      const leadDays = Math.ceil(leadMs / (1000 * 60 * 60 * 24));
      const leadWeeks = +(leadDays / 7).toFixed(1);
      return { sku: it.sku, qty: it.qty, arrivalDate: arrival.date, leadDays, leadWeeks, warehouse: arrival.warehouse || null };
    });
    const valid = rows.filter(r => r.leadDays && r.leadDays > 0) as Array<{ leadDays: number }>;
    const avgLeadDays = valid.length ? Math.round(valid.reduce((s, r) => s + (r.leadDays || 0), 0) / valid.length) : null;
    return { rows, avgLeadDays };
  }, [purchasesBySku]);

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

  // Индексация событий рисков по дням для календаря
  const risksByDay = React.useMemo(() => {
    const map: Record<string, LogisticsEvent[]> = {};
    (logisticsEvents || []).forEach(ev => {
      const start = new Date(ev.start_date);
      const end = new Date(ev.end_date);
      // ограничим в пределах выбранного года
      const from = new Date(year, 0, 1);
      const to = new Date(year + 1, 0, 1);
      let cur = new Date(Math.max(start.getTime(), from.getTime()));
      const last = new Date(Math.min(end.getTime(), to.getTime() - 24*3600*1000));
      while (cur <= last) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
        if (!map[key]) map[key] = [];
        map[key].push(ev);
        cur.setDate(cur.getDate()+1);
      }
    });
    return map;
  }, [logisticsEvents, year]);

  const savePurchaseOrder = async (orderData: Partial<PurchaseOrder>, items: Partial<PurchaseOrderItem>[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');

      setLoading(true);
      
      let orderId: string;
      
      if (editingOrder) {
        // Update existing order
        const { error: orderError } = await supabase
          .from('wb_purchase_orders')
          .update({
            po_number: orderData.po_number,
            supplier: orderData.supplier,
            country: orderData.country,
            incoterms: orderData.incoterms,
            currency: orderData.currency,
            total_cost: orderData.total_cost,
            logistics_cost: orderData.logistics_cost,
            comment: orderData.comment
          })
          .eq('id', editingOrder.id)
          .eq('user_id', user.id);
        
        if (orderError) throw orderError;
        orderId = editingOrder.id;

        // Delete existing items
        await supabase
          .from('wb_purchase_order_items')
          .delete()
          .eq('po_id', orderId)
          .eq('user_id', user.id);
      } else {
        // Create new order
        const { data: newOrder, error: orderError } = await supabase
          .from('wb_purchase_orders')
          .insert({
            user_id: user.id,
            po_number: orderData.po_number,
            created_at: orderData.created_at || new Date().toISOString(),
            supplier: orderData.supplier,
            country: orderData.country,
            incoterms: orderData.incoterms,
            currency: orderData.currency,
            total_cost: orderData.total_cost,
            logistics_cost: orderData.logistics_cost,
            comment: orderData.comment
          })
          .select()
          .single();
        
        if (orderError || !newOrder) throw orderError || new Error('Не удалось создать заказ');
        orderId = newOrder.id;
      }

      // Insert items
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('wb_purchase_order_items')
          .insert(
            items.map(item => ({
              user_id: user.id,
              po_id: orderId,
              sku: item.sku!,
              qty: item.qty!,
              unit_cost: item.unit_cost,
              warehouse_target: item.warehouse_target
            }))
          );
        
        if (itemsError) throw itemsError;
      }

      toast.success(editingOrder ? 'Заказ обновлен' : 'Заказ создан');
      setShowOrderForm(false);
      setEditingOrder(null);
      await loadPurchaseOrders();
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const deletePurchaseOrder = async (orderId: string) => {
    if (!window.confirm('Удалить заказ?')) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');

      setLoading(true);
      
      const { error } = await supabase
        .from('wb_purchase_orders')
        .delete()
        .eq('id', orderId)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      toast.success('Заказ удален');
      await loadPurchaseOrders();
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Поставки</h2>
          {loading && <span className="text-sm text-gray-500">Загрузка…</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
            {[0,1,2,3,4].map(i => {
              const y = new Date().getFullYear() - i; return <option key={y} value={y}>{y}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Табы */}
      <div className="border-b">
        <div className="flex gap-4">
          <button
            onClick={() => setMode('calendar')}
            className={`px-3 py-2 border-b-2 ${mode === 'calendar' ? 'border-blue-500 text-blue-600' : 'border-transparent'}`}
          >
            Календарь приемок
          </button>
          <button
            onClick={() => setMode('orders')}
            className={`px-3 py-2 border-b-2 ${mode === 'orders' ? 'border-blue-500 text-blue-600' : 'border-transparent'}`}
          >
            Заказы (Китай)
          </button>
          <button
            onClick={() => setMode('risks')}
            className={`px-3 py-2 border-b-2 ${mode === 'risks' ? 'border-blue-500 text-blue-600' : 'border-transparent'}`}
          >
            Календарь рисков
          </button>
        </div>
      </div>

      {/* Календарь приемок */}
      {mode === 'calendar' && (
        <>
        <div className="flex items-center gap-3">
          <div className="text-sm">Вид:</div>
          <div className="flex border rounded overflow-hidden text-sm">
            <button className={`px-3 py-1 ${receiptsView==='calendar'?'bg-gray-200':''}`} onClick={()=>setReceiptsView('calendar')}>Календарь</button>
            <button className={`px-3 py-1 ${receiptsView==='list'?'bg-gray-200':''}`} onClick={()=>setReceiptsView('list')}>Список</button>
          </div>
        </div>
        {receiptsView==='calendar' ? (
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
        ) : (
          <div className="bg-white border rounded p-3">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left">Дата</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Наименование</th>
                    <th className="px-3 py-2 text-left">Кол-во</th>
                    <th className="px-3 py-2 text-left">Склад</th>
                    <th className="px-3 py-2 text-left">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.entries(suppliesByDay).flatMap(([day, rows]) => rows.map((r,i)=>(
                    <tr key={`${day}-${i}`}>
                      <td className="px-3 py-2">{day}</td>
                      <td className="px-3 py-2">{r.sku}</td>
                      <td className="px-3 py-2">{r.name || '—'}</td>
                      <td className="px-3 py-2">{r.quantity}</td>
                      <td className="px-3 py-2">{r.warehouse || '—'}</td>
                      <td className="px-3 py-2">{typeof r.total_price === 'number' ? `$${r.total_price}` : '—'}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
      )}

      {/* Панель деталей для выбранного дня (только в режиме календаря) */}
      {mode === 'calendar' && selectedDay && (
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
                  <th className="px-3 py-2 text-left">Наименование</th>
                  <th className="px-3 py-2 text-left">Кол-во</th>
                  <th className="px-3 py-2 text-left">Склад</th>
                  <th className="px-3 py-2 text-left">Сумма (WB)</th>
                  <th className="px-3 py-2 text-left">Закуп</th>
                  <th className="px-3 py-2 text-left">Логистика</th>
                  <th className="px-3 py-2 text-left">FX</th>
                  <th className="px-3 py-2 text-left">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(suppliesByDay[selectedDay]||[]).map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{r.sku}</td>
                    <td className="px-3 py-2">{r.name || '—'}</td>
                    <td className="px-3 py-2">{r.quantity}</td>
                    <td className="px-3 py-2">{r.warehouse || '—'}</td>
                    <td className="px-3 py-2">{typeof r.total_price === 'number' ? `$${r.total_price}` : '—'}</td>
                    {(() => {
                      const key = `${selectedDay}|${r.sku}`;
                      const c = costsByKey.get(key) || {};
                      const fmt = (val?: number|null, cur?: string|null) => (typeof val === 'number' ? `${val} ${cur || ''}`.trim() : '—');
                      return (
                        <>
                          <td className="px-3 py-2">{fmt(c.purchase_amount, c.purchase_currency)}</td>
                          <td className="px-3 py-2">{fmt(c.logistics_amount, c.logistics_currency)}</td>
                          <td className="px-3 py-2">{typeof c.fx_rate === 'number' ? c.fx_rate : '—'}</td>
                        </>
                      );
                    })()}
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={async () => {
                          try {
                            const { data: { user } } = await supabase.auth.getUser();
                            if (!user) { toast.error('Не авторизован'); return; }
                            const key = `${selectedDay}|${r.sku}`;
                            const existing = costsByKey.get(key);
                            const purchase_amount = prompt('Закуп (число, напр. 12.5)', existing?.purchase_amount != null ? String(existing.purchase_amount) : '');
                            const purchase_currency = prompt('Валюта закупа (CNY/USD/RUB)', existing?.purchase_currency || 'CNY');
                            const logistics_amount = prompt('Логистика (число)', existing?.logistics_amount != null ? String(existing.logistics_amount) : '');
                            const logistics_currency = prompt('Валюта логистики (CNY/USD/RUB)', existing?.logistics_currency || 'USD');
                            let fx_rate = prompt('FX к RUB на дату (опционально)', existing?.fx_rate != null ? String(existing.fx_rate) : '');
                            if (!fx_rate && purchase_currency && purchase_currency.toUpperCase() !== 'RUB') {
                              const autoFx = await fetchCbrRateToRub(purchase_currency, `${selectedDay}T00:00:00.000Z`);
                              if (autoFx) {
                                fx_rate = String(Number(autoFx.toFixed(4)));
                                toast.success(`Курс ЦБ РФ ${purchase_currency}->RUB на дату: ${fx_rate}`);
                              }
                            }
                            const payload: any = {
                              user_id: user.id,
                              date: `${selectedDay}T00:00:00.000Z`,
                              sku: r.sku,
                              purchase_amount: purchase_amount ? Number(purchase_amount) : null,
                              purchase_currency: purchase_currency || null,
                              logistics_amount: logistics_amount ? Number(logistics_amount) : null,
                              logistics_currency: logistics_currency || null,
                              fx_rate: fx_rate ? Number(fx_rate) : null
                            };
                            const { error } = await supabase.from('wb_costs').upsert(payload, { onConflict: 'user_id,date,sku' }).select();
                            if (error) throw error;
                            const c = { purchase_amount: payload.purchase_amount, purchase_currency: payload.purchase_currency, logistics_amount: payload.logistics_amount, logistics_currency: payload.logistics_currency, fx_rate: payload.fx_rate };
                            const newMap = new Map(costsByKey);
                            newMap.set(key, c);
                            setCostsByKey(newMap);
                            toast.success('Сохранено');
                          } catch (e: any) { toast.error(e.message || 'Ошибка'); }
                        }}>Изменить</button>
                        <button className="text-xs px-2 py-1 border rounded text-red-600 hover:bg-red-50" onClick={async () => {
                          try {
                            if (!window.confirm('Удалить затраты?')) return;
                            const { data: { user } } = await supabase.auth.getUser();
                            if (!user) { toast.error('Не авторизован'); return; }
                            const { error } = await supabase.from('wb_costs')
                              .delete()
                              .eq('user_id', user.id)
                              .eq('date', `${selectedDay}T00:00:00.000Z`)
                              .eq('sku', r.sku);
                            if (error) throw error;
                            const key = `${selectedDay}|${r.sku}`;
                            const newMap = new Map(costsByKey);
                            newMap.delete(key);
                            setCostsByKey(newMap);
                            toast.success('Удалено');
                          } catch (e: any) { toast.error(e.message || 'Ошибка'); }
                        }}>Удалить</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-gray-600 mt-2">Клик по строке — редактировать затраты</div>
        </div>
      )}

      {/* Заказы (Китай) */}
      {mode === 'orders' && (
        <div className="space-y-4">
          <div className="flex justify-between">
            <h3 className="text-lg font-semibold">Заказы из Китая</h3>
            <button
              onClick={() => { setEditingOrder(null); setShowOrderForm(true); }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Новый заказ
            </button>
          </div>

          <div className="grid gap-4">
            {purchaseOrders.map(order => (
              <div key={order.id} className="border rounded p-4 bg-white">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-semibold">
                      {order.po_number || `Заказ ${order.id.slice(0, 8)}`}
                    </h4>
                    <p className="text-sm text-gray-600">
                      {new Date(order.created_at).toLocaleDateString('ru-RU')} • {order.supplier || 'Поставщик не указан'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingOrder(order); setShowOrderForm(true); }}
                      className="text-sm px-2 py-1 border rounded hover:bg-gray-50"
                    >
                      Изменить
                    </button>
                    <button
                      onClick={() => deletePurchaseOrder(order.id)}
                      className="text-sm px-2 py-1 border rounded text-red-600 hover:bg-red-50"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                  <div>Страна: {order.country || '—'}</div>
                  <div>Инкотермс: {order.incoterms || '—'}</div>
                  <div>Валюта: {order.currency || '—'}</div>
                  <div>Стоимость: {order.total_cost ? `${order.total_cost}` : '—'}</div>
                </div>

                {order.items && order.items.length > 0 && (
                  <div>
                    <h5 className="font-medium mb-2">Позиции ({order.items.length}):</h5>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-2 py-1 text-left">SKU</th>
                            <th className="px-2 py-1 text-left">Кол-во</th>
                            <th className="px-2 py-1 text-left">Цена</th>
                            <th className="px-2 py-1 text-left">Склад</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.items.map(item => (
                            <tr key={item.id}>
                              <td className="px-2 py-1">{item.sku}</td>
                              <td className="px-2 py-1">{item.qty}</td>
                              <td className="px-2 py-1">{item.unit_cost || '—'}</td>
                              <td className="px-2 py-1">{item.warehouse_target || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Сопоставление с приемками WB */}
                <div className="mt-4">
                  <h5 className="font-medium mb-2">Сопоставление с приемками WB:</h5>
                  {(() => {
                    const m = matchOrderItems(order);
                    return (
                      <>
                        <div className="text-xs text-gray-600 mb-2">
                          Средний lead time: {m.avgLeadDays ? `${m.avgLeadDays} дн (~${(m.avgLeadDays/7).toFixed(1)} нед)` : '—'}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="px-2 py-1 text-left">SKU</th>
                                <th className="px-2 py-1 text-left">Первая приемка</th>
                                <th className="px-2 py-1 text-left">Lead time</th>
                                <th className="px-2 py-1 text-left">Склад</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.rows.map((r, i) => (
                                <tr key={i}>
                                  <td className="px-2 py-1">{r.sku}</td>
                                  <td className="px-2 py-1">{r.arrivalDate ? new Date(r.arrivalDate).toLocaleDateString('ru-RU') : '—'}</td>
                                  <td className="px-2 py-1">{r.leadDays ? `${r.leadDays} дн (~${r.leadWeeks} нед)` : '—'}</td>
                                  <td className="px-2 py-1">{r.warehouse || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Календарь рисков */}
      {mode === 'risks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold">Календарь логистических рисков</h3>
              <div className="text-sm">Вид:</div>
              <div className="flex border rounded overflow-hidden text-sm">
                <button className={`px-3 py-1 ${riskView==='calendar'?'bg-gray-200':''}`} onClick={()=>setRiskView('calendar')}>Календарь</button>
                <button className={`px-3 py-1 ${riskView==='list'?'bg-gray-200':''}`} onClick={()=>setRiskView('list')}>Список</button>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700" onClick={() => { setEditingRisk(null); setShowRiskForm(true); }}>
                Добавить событие
              </button>
              <button
                className="px-4 py-2 border rounded hover:bg-gray-50"
                onClick={async () => {
                  try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) { toast.error('Не авторизован'); return; }
                    if (!window.confirm(`Добавить стандартные риски на ${year} год?`)) return;

                    // Шаблоны рисков (приближенные даты)
                    const y = year;
                    const mk = (country: string, kind: string, start: string, end: string, delay: number, note?: string, region?: string) => ({
                      user_id: user.id,
                      country, region: region || null,
                      kind,
                      start_date: `${start}T00:00:00.000Z`,
                      end_date: `${end}T23:59:59.999Z`,
                      delay_days: delay,
                      note: note || null
                    });

                    const templates = [
                      // China — праздники
                      mk('China','holiday',`${y}-02-01`,`${y}-02-10`,4,'Chinese New Year (approx)'),
                      mk('China','holiday',`${y}-05-01`,`${y}-05-05`,2,'Labor Day'),
                      mk('China','holiday',`${y}-10-01`,`${y}-10-07`,3,'Golden Week'),
                      mk('China','weather',`${y}-05-15`,`${y}-06-30`,5,'Monsoon/rainy season (bags dry slow)'),
                      // Kazakhstan — праздники
                      mk('Kazakhstan','holiday',`${y}-01-01`,`${y}-01-02`,1,'New Year'),
                      mk('Kazakhstan','holiday',`${y}-03-21`,`${y}-03-23`,1,'Nauryz'),
                      mk('Kazakhstan','holiday',`${y}-05-01`,`${y}-05-01`,1,'Labor Day'),
                      mk('Kazakhstan','holiday',`${y}-05-07`,`${y}-05-07`,1,'Defender of the Fatherland Day'),
                      mk('Kazakhstan','holiday',`${y}-05-09`,`${y}-05-09`,1,'Victory Day'),
                      mk('Kazakhstan','holiday',`${y}-08-30`,`${y}-08-30`,1,'Constitution Day'),
                      mk('Kazakhstan','holiday',`${y}-12-16`,`${y}-12-16`,1,'Independence Day'),
                      // Russia — праздники
                      mk('Russia','holiday',`${y}-01-01`,`${y}-01-08`,2,'New Year holidays'),
                      mk('Russia','holiday',`${y}-02-23`,`${y}-02-23`,1,'Defender Day'),
                      mk('Russia','holiday',`${y}-03-08`,`${y}-03-08`,1,'Women’s Day'),
                      mk('Russia','holiday',`${y}-05-01`,`${y}-05-01`,1,'Spring and Labor Day'),
                      mk('Russia','holiday',`${y}-05-09`,`${y}-05-09`,1,'Victory Day'),
                      mk('Russia','holiday',`${y}-06-12`,`${y}-06-12`,1,'Russia Day'),
                      mk('Russia','holiday',`${y}-11-04`,`${y}-11-04`,1,'Unity Day')
                    ];

                    // Отфильтруем дубликаты по совпадению country/kind/start/end
                    const existsKey = new Set((logisticsEvents || []).map(e => `${(e.start_date||'').slice(0,10)}|${(e.end_date||'').slice(0,10)}|${e.country}|${e.kind}`));
                    const toInsert = templates.filter(t => !existsKey.has(`${t.start_date.slice(0,10)}|${t.end_date.slice(0,10)}|${t.country}|${t.kind}`));
                    if (toInsert.length === 0) { toast.success('Все стандартные события уже добавлены'); return; }

                    const { error } = await supabase.from('logistics_calendar').insert(toInsert);
                    if (error) throw error;
                    toast.success(`Добавлено событий: ${toInsert.length}`);
                    await loadLogisticsEvents();
                  } catch (e: any) {
                    toast.error(e.message || 'Ошибка добавления рисков');
                  }
                }}
              >
                Добавить типовые риски
              </button>
            </div>
          </div>

          {riskView === 'calendar' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {months.map((m, idx) => (
                  <div key={idx} className="border rounded p-2 bg-white">
                    <div className="text-sm font-semibold mb-2 capitalize">{m.name}</div>
                    <div className="grid grid-cols-7 gap-1 text-xs">
                      {m.days.map(day => {
                        const has = (risksByDay[day] || []).length > 0;
                        return (
                          <button
                            key={day}
                            onClick={() => setSelectedRiskDay(day)}
                            className={`h-8 border rounded relative overflow-hidden ${has ? 'border-yellow-400' : 'bg-gray-50'}`}
                            title={has ? `${(risksByDay[day]||[]).length} рисков` : ''}
                          >
                            {has && (
                              <span
                                className="absolute inset-0 opacity-25"
                                style={{
                                  backgroundImage: (() => {
                                    const ev = (risksByDay[day]||[])[0];
                                    const country = (ev?.country||'').toLowerCase();
                                    // Простейшие флаги: Russia (white/blue/red), China (red/yellow), Kazakhstan (cyan/gold)
                                    if (country.includes('russia')) return 'linear-gradient(180deg, #ffffff 0%, #ffffff 33%, #0039a6 33%, #0039a6 66%, #d52b1e 66%, #d52b1e 100%)';
                                    if (country.includes('kazakhstan')) return 'linear-gradient(180deg, #00afca 0%, #00afca 70%, #ffd700 70%, #ffd700 100%)';
                                    // default China
                                    return 'linear-gradient(180deg, #de2910 0%, #de2910 100%)';
                                  })()
                                }}
                              />
                            )}
                            {parseInt(day.slice(-2))}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {selectedRiskDay && (
                <div className="bg-white border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{selectedRiskDay}: риски ({(risksByDay[selectedRiskDay]||[]).length})</h3>
                    <button className="text-sm text-gray-600" onClick={() => setSelectedRiskDay(null)}>Закрыть</button>
                  </div>
                  <div className="space-y-2">
                    {(risksByDay[selectedRiskDay]||[]).map((event, i) => (
                      <div key={i} className="flex items-center justify-between border rounded p-2">
                        <div className="text-sm">
                          <div className="font-medium capitalize">{event.kind}</div>
                          <div className="text-gray-600">{event.country}{event.region?` (${event.region})`:''}</div>
                          <div className="text-gray-600">Задержка: {event.delay_days} д</div>
                        </div>
                        <div className="flex gap-2">
                          <button className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={() => { setEditingRisk(event); setShowRiskForm(true); }}>Изменить</button>
                          <button className="text-xs px-2 py-1 border rounded text-red-600 hover:bg-red-50" onClick={async () => {
                            if (!window.confirm('Удалить событие?')) return;
                            const { data: { user } } = await supabase.auth.getUser();
                            if (!user) { toast.error('Не авторизован'); return; }
                            const { error } = await supabase.from('logistics_calendar').delete().eq('id', event.id).eq('user_id', user.id);
                            if (error) { toast.error(error.message); return; }
                            toast.success('Событие удалено');
                            await loadLogisticsEvents();
                          }}>Удалить</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-4">
              {logisticsEvents.map(event => (
                <div key={event.id} className="border rounded p-4 bg-white">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold">{event.kind}</h4>
                      <p className="text-sm text-gray-600">
                        {event.country && `${event.country}${event.region ? ` (${event.region})` : ''}`}
                      </p>
                      <p className="text-sm">
                        {new Date(event.start_date).toLocaleDateString('ru-RU')} - {new Date(event.end_date).toLocaleDateString('ru-RU')}
                      </p>
                      <p className="text-sm text-orange-600">Задержка: {event.delay_days} дней</p>
                      {event.note && <p className="text-sm text-gray-700 mt-1">{event.note}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button className="text-sm px-2 py-1 border rounded hover:bg-gray-50" onClick={() => { setEditingRisk(event); setShowRiskForm(true); }}>Изменить</button>
                      <button className="text-sm px-2 py-1 border rounded text-red-600 hover:bg-red-50" onClick={async () => {
                        if (!window.confirm('Удалить событие?')) return;
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) { toast.error('Не авторизован'); return; }
                        const { error } = await supabase.from('logistics_calendar').delete().eq('id', event.id).eq('user_id', user.id);
                        if (error) { toast.error(error.message); return; }
                        toast.success('Событие удалено');
                        await loadLogisticsEvents();
                      }}>Удалить</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Форма создания/редактирования заказа */}
      {showOrderForm && (
        <PurchaseOrderForm
          order={editingOrder}
          onSave={savePurchaseOrder}
          onCancel={() => {
            setShowOrderForm(false);
            setEditingOrder(null);
          }}
          loading={loading}
        />
      )}

      {/* Форма добавления/редактирования события рисков */}
      {showRiskForm && (
        <LogisticsEventForm
          event={editingRisk}
          onSave={async (payload) => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) throw new Error('Не авторизован');
              if (editingRisk) {
                const { error } = await supabase.from('logistics_calendar').update(payload).eq('id', editingRisk.id).eq('user_id', user.id);
                if (error) throw error;
                toast.success('Событие обновлено');
              } else {
                const { error } = await supabase.from('logistics_calendar').insert({ ...payload, user_id: user.id });
                if (error) throw error;
                toast.success('Событие добавлено');
              }
              setShowRiskForm(false);
              setEditingRisk(null);
              await loadLogisticsEvents();
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
          onCancel={() => { setShowRiskForm(false); setEditingRisk(null); }}
          loading={loading}
        />
      )}
    </div>
  );
};

export default SuppliesTab;


