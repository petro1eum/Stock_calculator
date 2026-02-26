import React from 'react';

const WbKeyManager: React.FC = () => {
  const [masked, setMasked] = React.useState<string | null>(null);
  const [value, setValue] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<any>(null);

  // Отображаем не всю длину ключа, а фиксированную маску + хвост
  const maskKey = (key?: string | null) => {
    if (!key) return null;
    const tail = key.slice(-4);
    return `••••••••••••${tail}`; // 12 точек + последние 4 символа
  };

  const fetchMasked = React.useCallback(async () => {
    setError(null);
    try {
      const key = localStorage.getItem('wb_api_key');
      setMasked(maskKey(key));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  React.useEffect(() => { fetchMasked(); }, [fetchMasked]);

  const save = async () => {
    setLoading(true);
    setError(null);
    try {
      localStorage.setItem('wb_api_key', value);
      setValue('');
      await fetchMasked();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const testApiKey = async () => {
    setLoading(true);
    setError(null);
    setTestResult(null);
    try {
      const key = localStorage.getItem('wb_api_key');
      if (!key) throw new Error('Ключ не найден');

      const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const resp = await fetch(`https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${dateFrom}`, {
        headers: { Authorization: key, Accept: 'application/json' }
      });
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
      setTestResult({ success: true, salesCount: json?.length || 0, dateFrom, message: `Найдено ${json?.length || 0} продаж` });
    } catch (e: any) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {masked ? (
        <div className="text-sm text-gray-700">
          Текущий ключ:
          <div className="mt-1 font-mono text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {masked}
          </div>
        </div>
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
        {masked && (
          <button onClick={testApiKey} disabled={loading} className="px-3 py-2 bg-green-600 text-white rounded disabled:opacity-50">
            {loading ? 'Тестируем…' : 'Тест API'}
          </button>
        )}
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {testResult && (
        <div className={`text-xs p-2 rounded ${testResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {testResult.message}
        </div>
      )}
      <p className="text-xs text-gray-500">Ключ безопасно хранится в памяти вашего браузера (localStorage).</p>
    </div>
  );
};

export default WbKeyManager;


