import React from 'react';
import SliderWithValue from './SliderWithValue';
import WbKeyManager from './WbKeyManager';
import { MonteCarloParams } from '../types';

interface SettingsTabProps {
  maxUnits: number;
  setMaxUnits: (value: number) => void;
  weeks: number;
  setWeeks: (value: number) => void;
  r: number;
  setR: (value: number) => void;
  hold: number;
  setHold: (value: number) => void;
  rushProb: number;
  setRushProb: (value: number) => void;
  rushSave: number;
  setRushSave: (value: number) => void;
  csl: number;
  setCsl: (value: number) => void;
  selectedWarehouse?: 'wildberries';
  setSelectedWarehouse?: (w: 'wildberries') => void;
  monteCarloParams?: MonteCarloParams;
  setMonteCarloParams?: React.Dispatch<React.SetStateAction<MonteCarloParams>>;
}

const SettingsTab: React.FC<SettingsTabProps> = ({
  maxUnits, setMaxUnits,
  weeks, setWeeks,
  r, setR,
  hold, setHold,
  rushProb, setRushProb,
  rushSave, setRushSave,
  csl, setCsl,
  selectedWarehouse,
  setSelectedWarehouse,
  monteCarloParams,
  setMonteCarloParams
}) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-semibold mb-4">Глобальные параметры модели</h3>
      <p className="text-gray-600 mb-6">
        Эти параметры являются общими для всего ассортимента и влияют на расчеты всех товаров.
        Индивидуальные параметры товаров (цена, маржа, спрос, срок годности, мин/макс заказ, скидки) 
        настраиваются отдельно для каждого SKU в разделе "Товары".
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Селектор склада (пока только Wildberries) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Склад (источник данных)</label>
          <select
            value={selectedWarehouse || 'wildberries'}
            onChange={() => setSelectedWarehouse && setSelectedWarehouse('wildberries')}
            className="w-full p-2 border border-gray-300 rounded"
          >
            <option value="wildberries">Wildberries</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">На текущем этапе доступен только склад Wildberries.</p>
        </div>
        <SliderWithValue 
          label="Максимум для графиков (технический параметр)" 
          value={maxUnits} 
          onChange={setMaxUnits} 
          min={500} 
          max={5000} 
          step={100} 
          unit="штук"
          tooltip="ТЕХНИЧЕСКИЙ ПАРАМЕТР: До скольки штук строить график при анализе товара. НЕ ВЛИЯЕТ на расчеты! Только на масштаб графика. КОГДА МЕНЯТЬ: Если оптимальный заказ получается близко к правому краю графика - увеличьте это значение."
        />
        
        <SliderWithValue 
          label="Период поставки" 
          value={weeks} 
          onChange={setWeeks} 
          min={1} 
          max={26} 
          step={1}
          unit="нед"
          tooltip="Сколько недель проходит от размещения заказа до получения товара. Пример: 2-4 недели для России, 8-12 для Китая, 1 неделя для местных поставщиков."
        />
        
        <SliderWithValue 
          label="Альтернативная доходность ваших денег" 
          value={r * 100} 
          onChange={(v: number) => setR(v / 100)} 
          min={1} 
          max={30} 
          step={0.5} 
          unit="%/год"
          tooltip="ВОПРОС: Если бы вы НЕ вложили деньги в товар, а вложили их куда-то еще (банковский депозит, другой бизнес, акции), сколько бы заработали за год? ЗАЧЕМ: Деньги в товаре 'замораживаются' и не приносят доход. Это скрытые потери. ПРИМЕР: Депозит 15% годовых = ваша альтернативная доходность 15%."
        />
        
        <SliderWithValue 
          label="Затраты на хранение 1 штуки товара" 
          value={hold} 
          onChange={setHold} 
          min={0.01} 
          max={5} 
          step={0.01} 
          unit="$ за штуку в неделю"
          tooltip="ВОПРОС: Сколько денег вы тратите, чтобы хранить 1 единицу товара на складе 1 неделю? КАК СЧИТАТЬ: 1) Возьмите все затраты на склад за месяц (аренда + зарплаты + охрана + свет), 2) Поделите на количество товаров на складе, 3) Поделите на 4 недели. ПРИМЕР: Затраты $4000/мес, товаров 2000 шт = $2/шт/мес = $0.50/шт/нед."
        />
        
        <SliderWithValue 
          label="Экстренные закупки у поставщика" 
          value={rushProb * 100} 
          onChange={(v: number) => setRushProb(v / 100)} 
          min={0} 
          max={100} 
          step={1}
          unit="% случаев"
          tooltip="СИТУАЦИЯ: У вас кончился товар, а покупатель хочет купить. ВОПРОС: Сможете ли вы БЫСТРО купить у своего поставщика и продать клиенту? ОТВЕТ: 0% = никогда (товар из Китая, долго везти), 50% = в половине случаев, 100% = всегда (поставщик рядом, привезет за час)"
        />
        
        <SliderWithValue 
          label="Ваши потери при экстренной закупке" 
          value={rushSave} 
          onChange={setRushSave} 
          min={0} 
          max={10} 
          step={0.1} 
          unit="$/шт"
          tooltip="СИТУАЦИЯ: Товар кончился, вы звоните поставщику: 'Привези СРОЧНО!'. Он говорит: 'Могу, но дороже'. ВОПРОС: На сколько меньше вы заработаете с каждой штуки? ПРИМЕР: Обычно покупаете за $10, продаете за $20 (заработок $10). При срочной закупке покупаете за $13, продаете за $20 (заработок $7). Потеря = $3."
        />
        
        <SliderWithValue 
          label="Сколько клиентов НЕ должны уйти без товара" 
          value={csl * 100} 
          onChange={(v: number) => setCsl(v / 100)} 
          min={50} 
          max={99} 
          step={1}
          unit="% из 100"
          tooltip="СИТУАЦИЯ: К вам приходят 100 покупателей. У некоторых товар есть, у некоторых - кончился. ВОПРОС: Скольким из 100 вы хотите продать? КОМПРОМИСС: 99% = почти всем продадите (но нужен БОЛЬШОЙ запас), 90% = 10 из 100 уйдут без покупки (но запас МЕНЬШЕ). РЕКОМЕНДАЦИЯ: 95% - золотая середина."
        />
      </div>
      
      <div className="mt-6 space-y-4">
        {/* Wildberries API key management */}
        <div className="p-4 bg-white border rounded">
          <h4 className="font-semibold mb-2">Интеграция с Wildberries</h4>
          <WbKeyManager />
        </div>
        {monteCarloParams && setMonteCarloParams && (
          <div className="p-4 bg-indigo-50 border-l-4 border-indigo-500 rounded">
            <h4 className="font-semibold text-indigo-800 mb-2">Метод расчета ожидаемых величин</h4>
            <div className="flex items-center space-x-4 text-sm text-indigo-900">
              <label className="inline-flex items-center space-x-2">
                <input
                  type="radio"
                  name="calcMethod"
                  checked={(monteCarloParams.method ?? 'closed') === 'closed'}
                  onChange={() => setMonteCarloParams(prev => ({ ...prev, method: 'closed' }))}
                />
                <span>Закрытая формула (быстро, точно при нормальном спросе)</span>
              </label>
              <label className="inline-flex items-center space-x-2">
                <input
                  type="radio"
                  name="calcMethod"
                  checked={monteCarloParams.method === 'mc'}
                  onChange={() => setMonteCarloParams(prev => ({ ...prev, method: 'mc' }))}
                />
                <span>Monte Carlo (универсально, дольше)</span>
              </label>
              <label className="inline-flex items-center space-x-2">
                <input
                  type="radio"
                  name="calcMethod"
                  checked={monteCarloParams.method === 'auto'}
                  onChange={() => setMonteCarloParams(prev => ({ ...prev, method: 'auto' }))}
                />
                <span>Авто (по CV и сезонности)</span>
              </label>
            </div>
            <div className="mt-2 text-xs text-indigo-700">
              <p className="mb-1"><strong>Рекомендации:</strong></p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Выбирайте <strong>Закрытую формулу</strong> при нормальном распределении спроса — быстро и стабильно.</li>
                <li><strong>Monte Carlo</strong> используйте при высокой волатильности, сложной сезонности или нетипичном распределении.</li>
                <li>Порог для авто-режима: <strong>CV &gt; 100%</strong> — модель переключается на Monte Carlo.</li>
                <li>Число симуляций влияет на точность и скорость. 1,000 — сбалансированный вариант.</li>
              </ul>
            </div>
          </div>
        )}
        <div className="p-4 bg-blue-50 border-l-4 border-blue-500">
          <h4 className="font-semibold text-blue-800 mb-2">Разделение параметров</h4>
          <div className="text-sm text-blue-900 space-y-2">
            <p><strong>Глобальные параметры (здесь):</strong></p>
            <ul className="list-disc list-inside ml-2">
              <li>Период поставки и логистика</li>
              <li>Стоимость капитала и хранения</li>
              <li>Rush-поставки и целевой уровень сервиса</li>
            </ul>
            <p className="mt-2"><strong>Индивидуальные параметры (в разделе "Товары"):</strong></p>
            <ul className="list-disc list-inside ml-2">
              <li>Закупочная цена и маржа</li>
              <li>Спрос и его волатильность</li>
              <li>Срок годности, мин/макс заказ</li>
              <li>Скидки за объем</li>
            </ul>
          </div>
        </div>
        
        <div className="p-4 bg-green-50 border-l-4 border-green-500">
          <h4 className="font-semibold text-green-800 mb-2">Шпаргалка: типичные значения</h4>
          <div className="text-sm text-green-900 space-y-1">
            <p>• <strong>Период поставки:</strong> 1 неделя (сосед-поставщик), 2-4 недели (из другого города), 8-12 недель (из Китая)</p>
            <p>• <strong>Альтернативная доходность:</strong> 10-15% (у вас есть деньги), 20-30% (деньги в кредит)</p>
            <p>• <strong>Хранение:</strong> $0.1-0.5 (мелкие товары), $1-3 (обычные), $5+ (холодильники, мебель)</p>
            <p>• <strong>Экстренные закупки:</strong> 0-30% (импорт), 50-80% (город рядом), 90%+ (свое производство)</p>
            <p>• <strong>Потери при срочности:</strong> $1-2 (мелкая маржа), $5-10 (обычно), $20+ (дорогие товары)</p>
            <p>• <strong>Обслужить клиентов:</strong> 90% (дешевые товары), 95% (обычные), 99% (дорогие/важные)</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab; 