import React, { useState, useEffect } from 'react';
import { PurchaseOrder, PurchaseOrderItem } from '../types';

interface PurchaseOrderFormProps {
  order?: PurchaseOrder | null;
  onSave: (orderData: Partial<PurchaseOrder>, items: Partial<PurchaseOrderItem>[]) => void;
  onCancel: () => void;
  loading?: boolean;
}

const PurchaseOrderForm: React.FC<PurchaseOrderFormProps> = ({ 
  order, 
  onSave, 
  onCancel, 
  loading = false 
}) => {
  const [formData, setFormData] = useState({
    po_number: '',
    created_at: new Date().toISOString().split('T')[0],
    supplier: '',
    country: 'China',
    incoterms: 'EXW',
    currency: 'USD',
    total_cost: '',
    logistics_cost: '',
    comment: ''
  });

  const [items, setItems] = useState<Partial<PurchaseOrderItem>[]>([
    { sku: '', qty: 0, unit_cost: 0, warehouse_target: '' }
  ]);

  useEffect(() => {
    if (order) {
      setFormData({
        po_number: order.po_number || '',
        created_at: order.created_at.split('T')[0],
        supplier: order.supplier || '',
        country: order.country || 'China',
        incoterms: order.incoterms || 'EXW',
        currency: order.currency || 'USD',
        total_cost: order.total_cost?.toString() || '',
        logistics_cost: order.logistics_cost?.toString() || '',
        comment: order.comment || ''
      });
      
      if (order.items && order.items.length > 0) {
        setItems(order.items.map(item => ({
          sku: item.sku,
          qty: item.qty,
          unit_cost: item.unit_cost,
          warehouse_target: item.warehouse_target
        })));
      }
    }
  }, [order]);

  const addItem = () => {
    setItems([...items, { sku: '', qty: 0, unit_cost: 0, warehouse_target: '' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof PurchaseOrderItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const orderData: Partial<PurchaseOrder> = {
      ...formData,
      created_at: formData.created_at + 'T00:00:00.000Z',
      total_cost: formData.total_cost ? parseFloat(formData.total_cost) : undefined,
      logistics_cost: formData.logistics_cost ? parseFloat(formData.logistics_cost) : undefined
    };

    const validItems = items.filter(item => item.sku && item.qty);
    
    onSave(orderData, validItems);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {order ? 'Редактировать заказ' : 'Новый заказ'}
            </h3>
            <button 
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Основная информация */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Номер заказа</label>
                <input
                  type="text"
                  value={formData.po_number}
                  onChange={(e) => setFormData({...formData, po_number: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                  placeholder="PO-2025-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Дата заказа</label>
                <input
                  type="date"
                  value={formData.created_at}
                  onChange={(e) => setFormData({...formData, created_at: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Поставщик</label>
                <input
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Название поставщика"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Страна</label>
                <select
                  value={formData.country}
                  onChange={(e) => setFormData({...formData, country: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="China">Китай</option>
                  <option value="Turkey">Турция</option>
                  <option value="India">Индия</option>
                  <option value="Vietnam">Вьетнам</option>
                  <option value="Other">Другая</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Инкотермс</label>
                <select
                  value={formData.incoterms}
                  onChange={(e) => setFormData({...formData, incoterms: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="EXW">EXW</option>
                  <option value="FOB">FOB</option>
                  <option value="CIF">CIF</option>
                  <option value="DAP">DAP</option>
                  <option value="DDP">DDP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Валюта</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({...formData, currency: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                  <option value="EUR">EUR</option>
                  <option value="RUB">RUB</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Стоимость товара</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.total_cost}
                  onChange={(e) => setFormData({...formData, total_cost: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Стоимость логистики</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.logistics_cost}
                  onChange={(e) => setFormData({...formData, logistics_cost: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Комментарий</label>
              <textarea
                value={formData.comment}
                onChange={(e) => setFormData({...formData, comment: e.target.value})}
                className="w-full border rounded px-3 py-2"
                rows={2}
                placeholder="Дополнительная информация"
              />
            </div>

            {/* Позиции заказа */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium">Позиции заказа</h4>
                <button
                  type="button"
                  onClick={addItem}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Добавить позицию
                </button>
              </div>

              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="grid grid-cols-5 gap-2 items-center p-2 border rounded">
                    <input
                      type="text"
                      placeholder="SKU"
                      value={item.sku || ''}
                      onChange={(e) => updateItem(index, 'sku', e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Кол-во"
                      value={item.qty || ''}
                      onChange={(e) => updateItem(index, 'qty', parseInt(e.target.value) || 0)}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Цена за ед."
                      value={item.unit_cost || ''}
                      onChange={(e) => updateItem(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Склад назначения"
                      value={item.warehouse_target || ''}
                      onChange={(e) => updateItem(index, 'warehouse_target', e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                      disabled={items.length === 1}
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 border rounded hover:bg-gray-50"
                disabled={loading}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderForm;
