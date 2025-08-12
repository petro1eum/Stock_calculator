import React from 'react';

interface WildberriesImporterProps {
  onUpdateProducts?: (products: any[]) => void;
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

  const importSales = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch(`/api/wb-sales?dateFrom=${dateFrom}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка получения данных');
      }
      
      setResult({
        type: 'sales',
        count: data.sales?.length || 0,
        data: data.sales
      });
      
      // Здесь можно обновить продукты на основе продаж
      // if (onUpdateProducts && data.sales) {
      //   // Логика преобразования продаж в продукты...
      // }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const importPurchases = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch(`/api/wb-purchases?dateFrom=${dateFrom}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка получения данных');
      }
      
      setResult({
        type: 'purchases',
        count: data.purchases?.length || 0,
        data: data.purchases
      });
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const importStocks = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch(`/api/wb-stocks?dateFrom=${dateFrom}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка получения данных');
      }
      
      setResult({
        type: 'stocks',
        count: data.stocks?.length || 0,
        data: data.stocks
      });
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const importOrders = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch('/api/wb-orders?limit=100&next=0');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка получения данных');
      }
      
      setResult({
        type: 'orders',
        count: data.orders?.length || 0,
        total: data.total || 0,
        data: data.orders
      });
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
