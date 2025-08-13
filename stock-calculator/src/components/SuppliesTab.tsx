import React from 'react';
import { supabase } from '../utils/supabaseClient';
import { toast } from 'react-hot-toast';
import { PurchaseOrder, PurchaseOrderItem, LogisticsEvent } from '../types';
import PurchaseOrderForm from './PurchaseOrderForm';

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
  const [mode, setMode] = React.useState<'calendar' | 'orders' | 'risks'>('calendar');
  const [purchaseOrders, setPurchaseOrders] = React.useState<PurchaseOrder[]>([]);
  const [logisticsEvents, setLogisticsEvents] = React.useState<LogisticsEvent[]>([]);
  const [showOrderForm, setShowOrderForm] = React.useState(false);
  const [editingOrder, setEditingOrder] = React.useState<PurchaseOrder | null>(null);

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
  }, [load, loadPurchaseOrders, loadLogisticsEvents]);

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
    if (!confirm('Удалить заказ?')) return;
    
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Календарь рисков */}
      {mode === 'risks' && (
        <div className="space-y-4">
          <div className="flex justify-between">
            <h3 className="text-lg font-semibold">Календарь логистических рисков</h3>
            <button className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
              Добавить событие
            </button>
          </div>

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
                    <button className="text-sm px-2 py-1 border rounded hover:bg-gray-50">Изменить</button>
                    <button className="text-sm px-2 py-1 border rounded text-red-600 hover:bg-red-50">Удалить</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
    </div>
  );
};

export default SuppliesTab;


