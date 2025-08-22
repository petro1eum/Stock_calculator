import React, { useEffect, useState } from 'react';
import { LogisticsEvent } from '../types';

interface LogisticsEventFormProps {
  event?: LogisticsEvent | null;
  onSave: (data: Partial<LogisticsEvent>) => void;
  onCancel: () => void;
  loading?: boolean;
}

const LogisticsEventForm: React.FC<LogisticsEventFormProps> = ({ event, onSave, onCancel, loading = false }) => {
  const [form, setForm] = useState({
    country: 'China',
    region: '',
    kind: 'holiday',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    delay_days: 3,
    note: ''
  });

  useEffect(() => {
    if (event) {
      setForm({
        country: event.country || 'China',
        region: event.region || '',
        kind: event.kind || 'holiday',
        start_date: new Date(event.start_date).toISOString().split('T')[0],
        end_date: new Date(event.end_date).toISOString().split('T')[0],
        delay_days: event.delay_days ?? 3,
        note: event.note || ''
      });
    }
  }, [event]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      country: form.country,
      region: form.region || undefined,
      kind: form.kind,
      start_date: form.start_date + 'T00:00:00.000Z',
      end_date: form.end_date + 'T23:59:59.999Z',
      delay_days: Number(form.delay_days) || 0,
      note: form.note || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full">
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">{event ? 'Изменить событие' : 'Добавить событие'}</h3>
          <button className="text-gray-400 hover:text-gray-700" onClick={onCancel}>✕</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Страна</label>
              <select className="w-full border rounded px-3 py-2" value={form.country} onChange={e=>setForm({...form, country: e.target.value})}>
                <option value="China">Китай</option>
                <option value="Global">Глобально</option>
                <option value="Turkey">Турция</option>
                <option value="India">Индия</option>
                <option value="Vietnam">Вьетнам</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Регион</label>
              <input className="w-full border rounded px-3 py-2" value={form.region} onChange={e=>setForm({...form, region: e.target.value})} placeholder="напр. Guangdong" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Тип</label>
              <select className="w-full border rounded px-3 py-2" value={form.kind} onChange={e=>setForm({...form, kind: e.target.value})}>
                <option value="holiday">Праздники</option>
                <option value="weather">Погода</option>
                <option value="lockdown">Ограничения</option>
                <option value="other">Другое</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Задержка, дней</label>
              <input type="number" min={0} className="w-full border rounded px-3 py-2" value={form.delay_days} onChange={e=>setForm({...form, delay_days: Number(e.target.value)})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Начало</label>
              <input type="date" className="w-full border rounded px-3 py-2" value={form.start_date} onChange={e=>setForm({...form, start_date: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Окончание</label>
              <input type="date" className="w-full border rounded px-3 py-2" value={form.end_date} onChange={e=>setForm({...form, end_date: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Заметка</label>
            <textarea className="w-full border rounded px-3 py-2" rows={2} value={form.note} onChange={e=>setForm({...form, note: e.target.value})} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="px-4 py-2 border rounded hover:bg-gray-50" onClick={onCancel} disabled={loading}>Отмена</button>
            <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50" disabled={loading}>{loading ? 'Сохранение…' : 'Сохранить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LogisticsEventForm;
