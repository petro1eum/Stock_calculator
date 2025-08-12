import React from 'react';
import { supabase } from '../utils/supabaseClient';

const WbKeyManager: React.FC = () => {
  const [masked, setMasked] = React.useState<string | null>(null);
  const [value, setValue] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchMasked = React.useCallback(async () => {
    setError(null);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/wb-key', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка');
      setMasked(json.wbApiKeyMasked || null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  React.useEffect(() => { fetchMasked(); }, [fetchMasked]);

  const save = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) throw new Error('Не авторизован');
      const res = await fetch('/api/wb-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wbApiKey: value })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка сохранения');
      setValue('');
      await fetchMasked();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {masked ? (
        <div className="text-sm text-gray-700">Текущий ключ: <span className="font-mono">{masked}</span></div>
      ) : (
        <div className="text-sm text-gray-500">Ключ ещё не сохранён</div>
      )}
      <div className="flex space-x-2">
        <input
          type="password"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Введите ключ Wildberries API"
          className="flex-1 border rounded px-3 py-2"
        />
        <button onClick={save} disabled={loading || !value} className="px-3 py-2 bg-purple-600 text-white rounded disabled:opacity-50">
          {loading ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <p className="text-xs text-gray-500">Ключ хранится на сервере в зашифрованном виде (в Supabase). В интерфейсе показывается только маска.</p>
    </div>
  );
};

export default WbKeyManager;


