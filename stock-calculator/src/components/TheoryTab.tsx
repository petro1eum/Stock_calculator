import React from 'react';

const TheoryTab: React.FC = () => {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Теория: Black-Scholes для управления запасами</h3>
      
      <div className="space-y-4">
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
          <h4 className="font-semibold text-blue-800 mb-2">Ключевая идея</h4>
          <p className="text-sm text-blue-900">
            Решение о закупке запаса рассматривается как покупка колл-опциона на будущую выручку. 
            Мы имеем право (но не обязанность) продать товар и получить выручку, заплатив за это право 
            стоимость закупки и хранения.
          </p>
        </div>
        
        <div>
          <h4 className="font-semibold mb-2">Параметры модели Black-Scholes</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-3">
              <h5 className="font-medium text-blue-600">S (Spot Price)</h5>
              <p className="text-sm">Ожидаемая выручка от продажи товара:</p>
              <code className="text-xs bg-gray-100 p-1 rounded block mt-1">
                S = Обычные продажи × (Закуп + Маржа) + Rush-продажи × (Закуп + Маржа)
              </code>
            </div>
            <div className="border rounded-lg p-3">
              <h5 className="font-medium text-blue-600">K (Strike Price)</h5>
              <p className="text-sm">Полные затраты на закупку и хранение:</p>
              <code className="text-xs bg-gray-100 p-1 rounded block mt-1">
                K = q × Закуп × (1 + r × t) + q × Хранение × Недели
              </code>
            </div>
            <div className="border rounded-lg p-3">
              <h5 className="font-medium text-blue-600">σ (Volatility)</h5>
              <p className="text-sm">Волатильность выручки, зависит от:</p>
              <ul className="text-xs list-disc list-inside mt-1">
                <li>Вариабельности спроса (CV = σ/μ)</li>
                <li>Уровня сервиса (fill rate = q/спрос)</li>
              </ul>
            </div>
            <div className="border rounded-lg p-3">
              <h5 className="font-medium text-blue-600">T (Time)</h5>
              <p className="text-sm">Время до "исполнения опциона":</p>
              <code className="text-xs bg-gray-100 p-1 rounded block mt-1">
                T = Lead Time / 52 недель
              </code>
            </div>
          </div>
        </div>
        
        <div>
          <h4 className="font-semibold mb-2">Экономическая интерпретация</h4>
          <div className="space-y-2">
            <div className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <p className="text-sm"><strong>Если спрос &gt; q:</strong> Опцион полностью "в деньгах", продаем все единицы</p>
            </div>
            <div className="flex items-start">
              <span className="text-yellow-500 mr-2">⚠</span>
              <p className="text-sm"><strong>Если спрос &lt; q:</strong> Опцион частично "в деньгах", остаются непроданные единицы</p>
            </div>
            <div className="flex items-start">
              <span className="text-blue-500 mr-2">💡</span>
              <p className="text-sm"><strong>Rush-поставки:</strong> Дополнительная гибкость, увеличивающая ценность опциона</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-100 rounded-lg p-4">
          <h4 className="font-semibold mb-2">Формула Black-Scholes для колл-опциона</h4>
          <div className="font-mono text-sm">
            C = S × N(d₁) - K × e^(-r×T) × N(d₂)
          </div>
          <div className="mt-2 text-xs">
            где: d₁ = [ln(S/K) + (r + σ²/2)×T] / (σ×√T), d₂ = d₁ - σ×√T
          </div>
        </div>
      </div>
    </div>
  );
};

export default TheoryTab; 