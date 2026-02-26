import React, { useState } from 'react';
import { Currency, CorrelationRule } from '../types/portfolio';
import { usePortfolioSettings, SupplierSettings, CategorySettings } from '../contexts/PortfolioSettingsContext';

const PortfolioSettingsTab: React.FC = () => {
  const {
    currencies,
    setCurrencies,
    suppliers,
    setSuppliers,
    categories,
    setCategories,
    correlationRules,
    setCorrelationRules
  } = usePortfolioSettings();

  const [newCurrency, setNewCurrency] = useState<Currency>({ code: '', rate: 1, volatility: 0.15 });
  const [editingCurrency, setEditingCurrency] = useState<string | null>(null);

  // Поставщики  
  const [newSupplier, setNewSupplier] = useState<SupplierSettings>({ code: '', name: '', volatility: 0.15 });
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);

  // Категории
  const [newCategory, setNewCategory] = useState<CategorySettings>({ name: '', intraCorrelation: 0.7, interCorrelation: 0.2 });
  const [editingCategory, setEditingCategory] = useState<string | null>(null);

  // Правила корреляции
  const [newRule, setNewRule] = useState<CorrelationRule>({ type: 'complement', items: ['', ''], factor: 1.0 });

  // CRUD функции для валют
  const addCurrency = () => {
    if (newCurrency.code && newCurrency.rate > 0) {
      setCurrencies([...currencies, newCurrency]);
      setNewCurrency({ code: '', rate: 1, volatility: 0.15 });
    }
  };

  const updateCurrency = (code: string, updatedCurrency: Currency) => {
    setCurrencies(currencies.map(c => c.code === code ? updatedCurrency : c));
    setEditingCurrency(null);
  };

  const deleteCurrency = (code: string) => {
    if (code !== 'RUB' && window.confirm(`Удалить валюту ${code}?`)) {
      setCurrencies(currencies.filter(c => c.code !== code));
    }
  };

  // CRUD функции для поставщиков
  const addSupplier = () => {
    if (newSupplier.code && newSupplier.name) {
      setSuppliers([...suppliers, newSupplier]);
      setNewSupplier({ code: '', name: '', volatility: 0.15 });
    }
  };

  const updateSupplier = (code: string, updatedSupplier: SupplierSettings) => {
    setSuppliers(suppliers.map(s => s.code === code ? updatedSupplier : s));
    setEditingSupplier(null);
  };

  const deleteSupplier = (code: string) => {
    if (code !== 'domestic' && window.confirm(`Удалить поставщика ${code}?`)) {
      setSuppliers(suppliers.filter(s => s.code !== code));
    }
  };

  // CRUD функции для категорий
  const addCategory = () => {
    if (newCategory.name) {
      setCategories([...categories, newCategory]);
      setNewCategory({ name: '', intraCorrelation: 0.7, interCorrelation: 0.2 });
    }
  };

  const updateCategory = (name: string, updatedCategory: CategorySettings) => {
    setCategories(categories.map(c => c.name === name ? updatedCategory : c));
    setEditingCategory(null);
  };

  const deleteCategory = (name: string) => {
    if (window.confirm(`Удалить категорию ${name}?`)) {
      setCategories(categories.filter(c => c.name !== name));
    }
  };

  // CRUD функции для правил корреляции
  const addRule = () => {
    if (newRule.items.filter(item => item.trim()).length >= 2 && newRule.factor > 0) {
      setCorrelationRules([...correlationRules, newRule]);
      setNewRule({ type: 'complement', items: ['', ''], factor: 1.0 });
    }
  };



  const deleteRule = (index: number) => {
    if (window.confirm('Удалить правило?')) {
      setCorrelationRules(correlationRules.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="space-y-6">
      {/* Управление валютами */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Управление валютами</h3>

        {/* Форма добавления */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <input
            type="text"
            placeholder="Код валюты"
            value={newCurrency.code}
            onChange={(e) => setNewCurrency({ ...newCurrency, code: e.target.value.toUpperCase() })}
            className="p-2 border rounded"
          />
          <input
            type="number"
            placeholder="Курс к рублю"
            value={newCurrency.rate || ''}
            onChange={(e) => setNewCurrency({ ...newCurrency, rate: parseFloat(e.target.value) || 0 })}
            className="p-2 border rounded"
            step="0.01"
          />
          <input
            type="number"
            placeholder="Волатильность"
            value={newCurrency.volatility || ''}
            onChange={(e) => setNewCurrency({ ...newCurrency, volatility: parseFloat(e.target.value) || 0 })}
            className="p-2 border rounded"
            step="0.01"
            min="0"
            max="1"
          />
          <button
            onClick={addCurrency}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Добавить
          </button>
        </div>

        {/* Список валют */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Код</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Курс к рублю</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Волатильность</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currencies.map((currency) => (
                <tr key={currency.code}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {currency.code}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingCurrency === currency.code ? (
                      <input
                        type="number"
                        value={currency.rate}
                        onChange={(e) => updateCurrency(currency.code, { ...currency, rate: parseFloat(e.target.value) || 0 })}
                        className="p-1 border rounded w-24"
                        step="0.01"
                      />
                    ) : (
                      currency.rate.toFixed(2)
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingCurrency === currency.code ? (
                      <input
                        type="number"
                        value={currency.volatility}
                        onChange={(e) => updateCurrency(currency.code, { ...currency, volatility: parseFloat(e.target.value) || 0 })}
                        className="p-1 border rounded w-24"
                        step="0.01"
                        min="0"
                        max="1"
                      />
                    ) : (
                      (currency.volatility * 100).toFixed(0) + '%'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    {editingCurrency === currency.code ? (
                      <>
                        <button
                          onClick={() => setEditingCurrency(null)}
                          className="text-green-600 hover:text-green-900"
                        >
                          Сохранить
                        </button>
                        <button
                          onClick={() => setEditingCurrency(null)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Отмена
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingCurrency(currency.code)}
                          className="text-yellow-600 hover:text-yellow-900"
                        >
                          Изменить
                        </button>
                        {currency.code !== 'RUB' && (
                          <button
                            onClick={() => deleteCurrency(currency.code)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Удалить
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Управление поставщиками */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Управление поставщиками</h3>

        {/* Форма добавления */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <input
            type="text"
            placeholder="Код поставщика"
            value={newSupplier.code}
            onChange={(e) => setNewSupplier({ ...newSupplier, code: e.target.value.toLowerCase() })}
            className="p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Название"
            value={newSupplier.name}
            onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
            className="p-2 border rounded"
          />
          <input
            type="number"
            placeholder="Волатильность логистики"
            value={newSupplier.volatility || ''}
            onChange={(e) => setNewSupplier({ ...newSupplier, volatility: parseFloat(e.target.value) || 0 })}
            className="p-2 border rounded"
            step="0.01"
            min="0"
            max="1"
          />
          <button
            onClick={addSupplier}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Добавить
          </button>
        </div>

        {/* Список поставщиков */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Код</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Волатильность логистики</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {suppliers.map((supplier) => (
                <tr key={supplier.code}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {supplier.code}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingSupplier === supplier.code ? (
                      <input
                        type="text"
                        value={supplier.name}
                        onChange={(e) => updateSupplier(supplier.code, { ...supplier, name: e.target.value })}
                        className="p-1 border rounded"
                      />
                    ) : (
                      supplier.name
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingSupplier === supplier.code ? (
                      <input
                        type="number"
                        value={supplier.volatility}
                        onChange={(e) => updateSupplier(supplier.code, { ...supplier, volatility: parseFloat(e.target.value) || 0 })}
                        className="p-1 border rounded w-24"
                        step="0.01"
                        min="0"
                        max="1"
                      />
                    ) : (
                      (supplier.volatility * 100).toFixed(0) + '%'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    {editingSupplier === supplier.code ? (
                      <>
                        <button
                          onClick={() => setEditingSupplier(null)}
                          className="text-green-600 hover:text-green-900"
                        >
                          Сохранить
                        </button>
                        <button
                          onClick={() => setEditingSupplier(null)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Отмена
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingSupplier(supplier.code)}
                          className="text-yellow-600 hover:text-yellow-900"
                        >
                          Изменить
                        </button>
                        {supplier.code !== 'domestic' && (
                          <button
                            onClick={() => deleteSupplier(supplier.code)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Удалить
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Управление категориями */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Управление категориями товаров</h3>

        {/* Форма добавления */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <input
            type="text"
            placeholder="Название категории"
            value={newCategory.name}
            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
            className="p-2 border rounded"
          />
          <input
            type="number"
            placeholder="Корреляция внутри"
            value={newCategory.intraCorrelation || ''}
            onChange={(e) => setNewCategory({ ...newCategory, intraCorrelation: parseFloat(e.target.value) || 0 })}
            className="p-2 border rounded"
            step="0.1"
            min="0"
            max="1"
          />
          <input
            type="number"
            placeholder="Корреляция между"
            value={newCategory.interCorrelation || ''}
            onChange={(e) => setNewCategory({ ...newCategory, interCorrelation: parseFloat(e.target.value) || 0 })}
            className="p-2 border rounded"
            step="0.1"
            min="0"
            max="1"
          />
          <button
            onClick={addCategory}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Добавить
          </button>
        </div>

        {/* Список категорий */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Категория</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Корреляция внутри</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Корреляция между</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {categories.map((category) => (
                <tr key={category.name}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {category.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingCategory === category.name ? (
                      <input
                        type="number"
                        value={category.intraCorrelation}
                        onChange={(e) => updateCategory(category.name, { ...category, intraCorrelation: parseFloat(e.target.value) || 0 })}
                        className="p-1 border rounded w-24"
                        step="0.1"
                        min="0"
                        max="1"
                      />
                    ) : (
                      category.intraCorrelation.toFixed(1)
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingCategory === category.name ? (
                      <input
                        type="number"
                        value={category.interCorrelation}
                        onChange={(e) => updateCategory(category.name, { ...category, interCorrelation: parseFloat(e.target.value) || 0 })}
                        className="p-1 border rounded w-24"
                        step="0.1"
                        min="0"
                        max="1"
                      />
                    ) : (
                      category.interCorrelation.toFixed(1)
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    {editingCategory === category.name ? (
                      <>
                        <button
                          onClick={() => setEditingCategory(null)}
                          className="text-green-600 hover:text-green-900"
                        >
                          Сохранить
                        </button>
                        <button
                          onClick={() => setEditingCategory(null)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Отмена
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingCategory(category.name)}
                          className="text-yellow-600 hover:text-yellow-900"
                        >
                          Изменить
                        </button>
                        <button
                          onClick={() => deleteCategory(category.name)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Удалить
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Управление правилами корреляции */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Правила корреляции товаров</h3>

        {/* Форма добавления */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          <select
            value={newRule.type}
            onChange={(e) => setNewRule({ ...newRule, type: e.target.value as 'complement' | 'substitute' | 'seasonal' })}
            className="p-2 border rounded"
          >
            <option value="complement">Комплементы</option>
            <option value="substitute">Субституты</option>
            <option value="seasonal">Сезонные</option>
          </select>
          <input
            type="text"
            placeholder="Товар 1"
            value={newRule.items[0] || ''}
            onChange={(e) => setNewRule({ ...newRule, items: [e.target.value, newRule.items[1] || ''] })}
            className="p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Товар 2"
            value={newRule.items[1] || ''}
            onChange={(e) => setNewRule({ ...newRule, items: [newRule.items[0] || '', e.target.value] })}
            className="p-2 border rounded"
          />
          <input
            type="number"
            placeholder="Фактор"
            value={newRule.factor || ''}
            onChange={(e) => setNewRule({ ...newRule, factor: parseFloat(e.target.value) || 0 })}
            className="p-2 border rounded"
            step="0.1"
            min="0"
          />
          <button
            onClick={addRule}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Добавить
          </button>
        </div>

        {/* Список правил */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Тип</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Товары</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Фактор</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Условие</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {correlationRules.map((rule, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <span className={`px-2 py-1 text-xs rounded-full ${rule.type === 'complement' ? 'bg-green-100 text-green-800' :
                        rule.type === 'substitute' ? 'bg-red-100 text-red-800' :
                          'bg-blue-100 text-blue-800'
                      }`}>
                      {rule.type === 'complement' ? 'Комплементы' :
                        rule.type === 'substitute' ? 'Субституты' :
                          'Сезонные'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {rule.items.join(', ')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {rule.factor.toFixed(1)}x
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {rule.condition || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => deleteRule(index)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Примечания */}
      <div className="bg-blue-50 rounded-lg p-6">
        <h4 className="font-medium text-blue-900 mb-2">Примечания</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Волатильность валют влияет на общий риск товаров, закупаемых в этой валюте</li>
          <li>• Волатильность логистики отражает надежность и предсказуемость поставок</li>
          <li>• Корреляция внутри категории показывает, насколько схоже ведут себя товары одной категории</li>
          <li>• Корреляция между категориями обычно ниже, что способствует диверсификации</li>
          <li>• Правила корреляции позволяют учесть взаимосвязи между конкретными товарами</li>
        </ul>
      </div>
    </div>
  );
};

export default PortfolioSettingsTab; 