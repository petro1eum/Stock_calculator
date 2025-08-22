import React, { useState } from 'react';
import { Product, ProductForm } from '../types';
import ProductDetailsModal from './ProductDetailsModal';

interface AssortmentTabProps {
  products: Product[];
  showProductForm: boolean;
  setShowProductForm: (show: boolean) => void;
  productForm: ProductForm;
  setProductForm: React.Dispatch<React.SetStateAction<ProductForm>>;
  editingProductId: number | null;
  loadDemoData: () => void;
  clearAllProducts: () => void;
  addProduct: () => void;
  editProduct: (product: Product) => void;
  deleteProduct: (id: number) => void;
  selectProductForAnalysis: (product: Product) => void;
}

const AssortmentTab: React.FC<AssortmentTabProps> = ({
  products,
  showProductForm,
  setShowProductForm,
  productForm,
  setProductForm,
  editingProductId,
  loadDemoData,
  clearAllProducts,
  addProduct,
  editProduct,
  deleteProduct,
  selectProductForAnalysis
}) => {
  const [newDiscount, setNewDiscount] = useState({ qty: 0, discount: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null);

  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = products.slice(start, end);

  const addVolumeDiscount = () => {
    if (newDiscount.qty > 0 && newDiscount.discount > 0) {
      setProductForm(prev => ({
        ...prev,
        volumeDiscounts: [...prev.volumeDiscounts, newDiscount].sort((a, b) => a.qty - b.qty)
      }));
      setNewDiscount({ qty: 0, discount: 0 });
    }
  };

  const removeVolumeDiscount = (index: number) => {
    setProductForm(prev => ({
      ...prev,
      volumeDiscounts: prev.volumeDiscounts.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="space-y-4">
      {/* Форма добавления/редактирования товара */}
      {showProductForm && (
        <div className="bg-white rounded-lg shadow-md p-4 mb-4">
          <h3 className="text-lg font-semibold mb-4">
            {editingProductId ? 'Редактирование товара' : 'Добавление нового товара'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="product-name" className="block text-sm font-medium text-gray-700 mb-1">
                Название товара
              </label>
              <input
                id="product-name"
                type="text"
                value={productForm.name}
                onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full p-2 border border-gray-300 rounded"
                placeholder="Например: Товар А"
              />
            </div>
            <div>
              <label htmlFor="product-sku" className="block text-sm font-medium text-gray-700 mb-1">
                SKU (артикул)
              </label>
              <input
                id="product-sku"
                type="text"
                value={productForm.sku}
                onChange={(e) => setProductForm(prev => ({ ...prev, sku: e.target.value }))}
                className="w-full p-2 border border-gray-300 rounded"
                placeholder="SKU001"
              />
            </div>
            <div>
              <label htmlFor="product-purchase" className="block text-sm font-medium text-gray-700 mb-1">
                Закупочная цена, $
              </label>
              <input
                id="product-purchase"
                type="number"
                step="0.01"
                value={productForm.purchase}
                onChange={(e) => setProductForm(prev => ({ ...prev, purchase: parseFloat(e.target.value) || 0 }))}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="product-margin" className="block text-sm font-medium text-gray-700 mb-1">
                Маржа (прибыль с единицы), $
              </label>
              <input
                id="product-margin"
                type="number"
                step="0.01"
                value={productForm.margin}
                onChange={(e) => setProductForm(prev => ({ ...prev, margin: parseFloat(e.target.value) || 0 }))}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="product-demand" className="block text-sm font-medium text-gray-700 mb-1">
                Средний спрос, шт/нед
              </label>
              <input
                id="product-demand"
                type="number"
                step="0.1"
                value={productForm.muWeek}
                onChange={(e) => setProductForm(prev => ({ ...prev, muWeek: parseFloat(e.target.value) || 0 }))}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="product-deviation" className="block text-sm font-medium text-gray-700 mb-1">
                Стандартное отклонение спроса, шт/нед
              </label>
              <input
                id="product-deviation"
                type="number"
                step="0.1"
                value={productForm.sigmaWeek}
                onChange={(e) => setProductForm(prev => ({ ...prev, sigmaWeek: parseFloat(e.target.value) || 0 }))}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="product-stock" className="block text-sm font-medium text-gray-700 mb-1">
                Текущий запас на складе, шт
                <span className="text-xs text-gray-500 ml-1">(необязательно)</span>
              </label>
              <input
                id="product-stock"
                type="number"
                value={productForm.currentStock}
                onChange={(e) => setProductForm(prev => ({ ...prev, currentStock: parseInt(e.target.value) || 0 }))}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>
          </div>
          
          {/* Расширенные настройки */}
          <div className="mt-4 space-y-4">
            <h4 className="font-medium text-gray-700">Дополнительные ограничения (необязательно)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="product-shelf-life" className="block text-sm font-medium text-gray-700 mb-1">
                  Срок годности, недель
                </label>
                <input
                  id="product-shelf-life"
                  type="number"
                  value={productForm.shelfLife}
                  onChange={(e) => setProductForm(prev => ({ ...prev, shelfLife: parseInt(e.target.value) || 0 }))}
                  className="w-full p-2 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label htmlFor="product-min-order" className="block text-sm font-medium text-gray-700 mb-1">
                  Минимальный заказ, шт
                </label>
                <input
                  id="product-min-order"
                  type="number"
                  value={productForm.minOrderQty}
                  onChange={(e) => setProductForm(prev => ({ ...prev, minOrderQty: parseInt(e.target.value) || 0 }))}
                  className="w-full p-2 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label htmlFor="product-max-storage" className="block text-sm font-medium text-gray-700 mb-1">
                  Максимум на складе, шт
                </label>
                <input
                  id="product-max-storage"
                  type="number"
                  value={productForm.maxStorageQty}
                  onChange={(e) => setProductForm(prev => ({ ...prev, maxStorageQty: parseInt(e.target.value) || 0 }))}
                  className="w-full p-2 border border-gray-300 rounded"
                />
              </div>
            </div>
            
            {/* Новые поля для портфельной оптимизации */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label htmlFor="product-currency" className="block text-sm font-medium text-gray-700 mb-1">
                  Валюта закупки
                </label>
                <select
                  id="product-currency"
                  value={productForm.currency || 'RUB'}
                  onChange={(e) => setProductForm(prev => ({ ...prev, currency: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  <option value="RUB">RUB (₽)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="CNY">CNY (¥)</option>
                </select>
              </div>
              <div>
                <label htmlFor="product-supplier" className="block text-sm font-medium text-gray-700 mb-1">
                  Поставщик
                </label>
                <select
                  id="product-supplier"
                  value={productForm.supplier || 'domestic'}
                  onChange={(e) => setProductForm(prev => ({ ...prev, supplier: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  <option value="domestic">Российский</option>
                  <option value="china">Китай</option>
                  <option value="europe">Европа</option>
                  <option value="usa">США</option>
                </select>
              </div>
              <div>
                <label htmlFor="product-category" className="block text-sm font-medium text-gray-700 mb-1">
                  Категория товара
                </label>
                <input
                  id="product-category"
                  type="text"
                  value={productForm.category || ''}
                  onChange={(e) => setProductForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded"
                  placeholder="Например: Электроника"
                />
              </div>
              <div>
                <label htmlFor="product-volume" className="block text-sm font-medium text-gray-700 mb-1">
                  Объем единицы (м³)
                </label>
                <input
                  id="product-volume"
                  type="number"
                  step="0.001"
                  value={productForm.volume || ''}
                  onChange={(e) => setProductForm(prev => ({ ...prev, volume: parseFloat(e.target.value) || undefined }))}
                  className="w-full p-2 border border-gray-300 rounded"
                  placeholder="0.01"
                />
              </div>
            </div>
            
            {/* Скидки за объем */}
            <div>
              <h5 className="font-medium text-gray-700 mb-2">Скидки за объем</h5>
              <div className="flex gap-2 mb-2">
                <input
                  type="number"
                  placeholder="Количество"
                  value={newDiscount.qty}
                  onChange={(e) => setNewDiscount(prev => ({ ...prev, qty: parseInt(e.target.value) || 0 }))}
                  className="flex-1 p-2 border border-gray-300 rounded"
                />
                <input
                  type="number"
                  placeholder="Скидка %"
                  value={newDiscount.discount}
                  onChange={(e) => setNewDiscount(prev => ({ ...prev, discount: parseFloat(e.target.value) || 0 }))}
                  className="flex-1 p-2 border border-gray-300 rounded"
                />
                <button
                  onClick={addVolumeDiscount}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Добавить
                </button>
              </div>
              {productForm.volumeDiscounts.length > 0 && (
                <div className="space-y-1">
                  {productForm.volumeDiscounts.map((discount, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-100 p-2 rounded">
                      <span>От {discount.qty} шт: -{discount.discount}%</span>
                      <button
                        onClick={() => removeVolumeDiscount(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Сезонность */}
            <div>
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id="seasonality-enabled"
                  checked={productForm.seasonality.enabled}
                  onChange={(e) => setProductForm(prev => ({
                    ...prev,
                    seasonality: { ...prev.seasonality, enabled: e.target.checked }
                  }))}
                  className="mr-2"
                />
                <label htmlFor="seasonality-enabled" className="text-sm font-medium text-gray-700">
                  Учитывать сезонность спроса
                </label>
              </div>
              
              {productForm.seasonality.enabled && (
                <div>
                  <div className="mb-2">
                    <label htmlFor="current-month" className="block text-sm font-medium text-gray-700 mb-1">
                      Текущий месяц
                    </label>
                    <select
                      id="current-month"
                      value={productForm.seasonality.currentMonth}
                      onChange={(e) => setProductForm(prev => ({
                        ...prev,
                        seasonality: { ...prev.seasonality, currentMonth: parseInt(e.target.value) }
                      }))}
                      className="w-full p-2 border border-gray-300 rounded"
                    >
                      {['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'].map((month, index) => (
                        <option key={index} value={index}>{month}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 
                      'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'].map((month, index) => (
                      <div key={index}>
                        <label htmlFor={`month-${index}`} className="block text-xs text-gray-600">{month}</label>
                        <input
                          id={`month-${index}`}
                          type="number"
                          step="0.1"
                          min="0"
                          value={productForm.seasonality.monthlyFactors[index]}
                          onChange={(e) => {
                            const newFactors = [...productForm.seasonality.monthlyFactors];
                            newFactors[index] = parseFloat(e.target.value) || 1;
                            setProductForm(prev => ({
                              ...prev,
                              seasonality: { ...prev.seasonality, monthlyFactors: newFactors }
                            }));
                          }}
                          className="w-full p-1 text-sm border border-gray-300 rounded"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Коэффициенты спроса: 1.0 = обычный спрос, 2.0 = двойной спрос, 0.5 = половина спроса
                  </p>
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-4 flex justify-end space-x-2">
            <button
              onClick={() => {
                setProductForm({
                  name: "",
                  sku: "",
                  purchase: 0,
                  margin: 0,
                  muWeek: 0,
                  sigmaWeek: 0,
                  shelfLife: 0,
                  minOrderQty: 0,
                  maxStorageQty: 0,
                  volumeDiscounts: [],
                  currentStock: 0,
                  seasonality: {
                    enabled: false,
                    monthlyFactors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                    currentMonth: new Date().getMonth()
                  },
                  currency: 'RUB',
                  supplier: 'domestic',
                  category: '',
                  volume: undefined
                });
                setShowProductForm(false);
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Отмена
            </button>
            <button
              onClick={addProduct}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              {editingProductId ? 'Сохранить изменения' : 'Добавить товар'}
            </button>
          </div>
        </div>
      )}
      
      {/* Кнопки управления */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowProductForm(true)}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Добавить новый товар
        </button>
        <button
          onClick={loadDemoData}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Загрузить демо-данные
        </button>
        {products.length > 0 && (
          <button
            onClick={clearAllProducts}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Очистить все
          </button>
        )}
      </div>
      
      {/* Таблица товаров */}
      {products.length > 0 ? (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Категория</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Закуп, ₽</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Маржа, ₽</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Спрос нед.</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Текущий запас</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Оптим. q*</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Safety</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ценность</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pageItems.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetailsProduct(product)}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{product.sku}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.category || ''}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₽{new Intl.NumberFormat('ru-RU').format(Math.round(product.purchase || 0))}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₽{new Intl.NumberFormat('ru-RU').format(Math.round(product.margin || 0))}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.muWeek.toFixed(0)} ± {product.sigmaWeek.toFixed(0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.currentStock || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        product.optQ < product.safety ? 'bg-yellow-100 text-yellow-800' : 
                        product.optValue > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {product.optQ}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.safety}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={product.optValue > 0 ? 'text-green-600' : 'text-red-600'}>
                        ₽{new Intl.NumberFormat('ru-RU').format(Math.round(product.optValue || 0))}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => selectProductForAnalysis(product)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        Анализ
                      </button>
                      <button
                        onClick={() => editProduct(product)}
                        className="text-yellow-600 hover:text-yellow-900"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => deleteProduct(product.id)}
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
          {/* Пагинация */}
          <div className="flex items-center justify-between p-3 border-t bg-gray-50">
            <div className="text-sm text-gray-600">
              Показано {start + 1}-{Math.min(end, products.length)} из {products.length}
            </div>
            <div className="flex items-center gap-2">
              <select
                className="border rounded px-2 py-1 text-sm"
                value={pageSize}
                onChange={(e) => { setPageSize(parseInt(e.target.value) || 50); setPage(1); }}
              >
                {[25, 50, 100, 200].map(s => (
                  <option key={s} value={s}>{s} / стр</option>
                ))}
              </select>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                Назад
              </button>
              <span className="text-sm text-gray-700">{page}/{totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                Вперед
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-100 rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-4">Нет товаров в ассортименте</p>
          <p className="text-sm text-gray-400">
            Добавьте товары вручную или загрузите демо-данные для начала работы
          </p>
        </div>
      )}

      {detailsProduct && (
        <ProductDetailsModal product={detailsProduct} onClose={() => setDetailsProduct(null)} />
      )}
    </div>
  );
};

export default AssortmentTab; 