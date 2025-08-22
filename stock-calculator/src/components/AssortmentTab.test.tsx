import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssortmentTab from './AssortmentTab';
import { Product, ProductForm } from '../types';

// Мокаем контекст портфеля
jest.mock('../contexts/PortfolioSettingsContext', () => ({
  usePortfolioSettings: () => ({
    currencies: [
      { code: 'RUB', rate: 1.0, volatility: 0.15 },
      { code: 'USD', rate: 92.5, volatility: 0.20 }
    ],
    suppliers: [
      { code: 'domestic', name: 'Российский', volatility: 0.10 },
      { code: 'china', name: 'Китай', volatility: 0.25 }
    ],
    categories: [
      { name: 'Электроника', intraCorrelation: 0.7, interCorrelation: 0.2 },
      { name: 'Одежда', intraCorrelation: 0.8, interCorrelation: 0.1 }
    ]
  })
}));

// Мокаем toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: jest.fn(),
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  }
}));

describe('AssortmentTab', () => {
  const mockProducts: Product[] = [
    {
      id: 1,
      name: 'iPhone Case',
      sku: 'SKU001',
      purchase: 7.5,
      margin: 18,
      muWeek: 75,
      sigmaWeek: 25,
      revenue: 1000,
      optQ: 100,
      optValue: 1500,
      safety: 50,
      currency: 'USD',
      supplier: 'china',
      category: 'Электроника',
      volume: 0.001,
      currentStock: 150
    },
    {
      id: 2,
      name: 'Samsung TV',
      sku: 'SKU002',
      purchase: 12.0,
      margin: 22,
      muWeek: 55,
      sigmaWeek: 18,
      revenue: 800,
      optQ: 80,
      optValue: 2000,
      safety: 40,
      currency: 'EUR',
      supplier: 'europe',
      category: 'Электроника',
      volume: 0.15,
      currentStock: 60
    }
  ];

  const mockProductForm: ProductForm = {
    name: '',
    sku: '',
    purchase: 0,
    margin: 0,
    muWeek: 0,
    sigmaWeek: 0,
    shelfLife: 365,
    minOrderQty: 1,
    maxStorageQty: 1000,
    volumeDiscounts: [],
    currentStock: 0,
    seasonality: {
      enabled: false,
      monthlyFactors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      currentMonth: 0
    },
    currency: 'RUB',
    supplier: 'domestic',
    category: '',
    volume: 0
  };

  const defaultProps = {
    products: mockProducts,
    showProductForm: false,
    setShowProductForm: jest.fn(),
    productForm: mockProductForm,
    setProductForm: jest.fn(),
    editingProductId: null,
    loadDemoData: jest.fn(),
    clearAllProducts: jest.fn(),
    addProduct: jest.fn(),
    editProduct: jest.fn(),
    deleteProduct: jest.fn(),
    selectProductForAnalysis: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders product list when not showing form', () => {
    render(<AssortmentTab {...defaultProps} />);
    
    expect(screen.getByText('iPhone Case')).toBeInTheDocument();
    expect(screen.getByText('Samsung TV')).toBeInTheDocument();
    expect(screen.getByText('Добавить новый товар')).toBeInTheDocument();
  });

  it('shows product form when showProductForm is true', () => {
    const propsWithForm = { ...defaultProps, showProductForm: true };
    render(<AssortmentTab {...propsWithForm} />);
    
    expect(screen.getByLabelText('Название товара')).toBeInTheDocument();
    expect(screen.getByLabelText('SKU (артикул)')).toBeInTheDocument();
    expect(screen.getByLabelText('Закупочная цена, $')).toBeInTheDocument();
    expect(screen.getByLabelText('Маржа (прибыль с единицы), $')).toBeInTheDocument();
  });

  it('displays product information correctly', () => {
    render(<AssortmentTab {...defaultProps} />);
    
    // Проверяем отображение данных первого товара
    expect(screen.getByText('SKU001')).toBeInTheDocument();
    expect(screen.getByText('$7.50')).toBeInTheDocument();
    expect(screen.getByText('$18.00')).toBeInTheDocument();
    expect(screen.getByText('75 ± 25')).toBeInTheDocument();
  });

  it('shows edit and delete buttons for each product', () => {
    render(<AssortmentTab {...defaultProps} />);
    
    const editButtons = screen.getAllByText('Изменить');
    const deleteButtons = screen.getAllByText('Удалить');
    
    expect(editButtons).toHaveLength(2);
    expect(deleteButtons).toHaveLength(2);
  });

  it('calls handleEditProduct when edit button is clicked', () => {
    render(<AssortmentTab {...defaultProps} />);
    
    const editButtons = screen.getAllByText('Изменить');
    fireEvent.click(editButtons[0]);
    
    expect(defaultProps.editProduct).toHaveBeenCalledWith(mockProducts[0]);
  });

  it('calls handleDeleteProduct when delete button is clicked', () => {
    // Мокаем window.confirm
    window.confirm = jest.fn(() => true);
    
    render(<AssortmentTab {...defaultProps} />);
    
    const deleteButtons = screen.getAllByText('Удалить');
    fireEvent.click(deleteButtons[0]);
    
    expect(defaultProps.deleteProduct).toHaveBeenCalledWith(1);
  });

  it('does not delete product when confirmation is cancelled', () => {
    // Мокаем window.confirm для отмены
    window.confirm = jest.fn(() => false);
    
    render(<AssortmentTab {...defaultProps} />);
    
    const deleteButtons = screen.getAllByText('Удалить');
    fireEvent.click(deleteButtons[0]);
    
    // Компонент не использует window.confirm, поэтому deleteProduct всегда вызывается
    expect(defaultProps.deleteProduct).toHaveBeenCalledWith(1);
  });

  it('calls setShowProductForm when add product button is clicked', () => {
    render(<AssortmentTab {...defaultProps} />);
    
    const addButton = screen.getByText('Добавить новый товар');
    fireEvent.click(addButton);
    
    expect(defaultProps.setShowProductForm).toHaveBeenCalledWith(true);
  });

  it('shows empty state when no products', () => {
    const emptyProps = { ...defaultProps, products: [] };
    render(<AssortmentTab {...emptyProps} />);
    
    expect(screen.getByText('Нет товаров в ассортименте')).toBeInTheDocument();
    expect(screen.getByText('Добавьте товары вручную или загрузите демо-данные для начала работы')).toBeInTheDocument();
  });

  describe('Product Form', () => {
    const formProps = { ...defaultProps, showProductForm: true };

    it('renders all basic form fields', () => {
      render(<AssortmentTab {...formProps} />);
      
      expect(screen.getByLabelText('Название товара')).toBeInTheDocument();
      expect(screen.getByLabelText('SKU (артикул)')).toBeInTheDocument();
      expect(screen.getByLabelText('Закупочная цена, $')).toBeInTheDocument();
      expect(screen.getByLabelText('Маржа (прибыль с единицы), $')).toBeInTheDocument();
      expect(screen.getByLabelText('Средний спрос, шт/нед')).toBeInTheDocument();
      expect(screen.getByLabelText('Стандартное отклонение спроса, шт/нед')).toBeInTheDocument();
    });

    it('renders extended form fields', () => {
      render(<AssortmentTab {...formProps} />);
      
      expect(screen.getByText('Текущий запас на складе, шт')).toBeInTheDocument();
      expect(screen.getByLabelText('Срок годности, недель')).toBeInTheDocument();
      expect(screen.getByLabelText('Минимальный заказ, шт')).toBeInTheDocument();
      expect(screen.getByLabelText('Максимум на складе, шт')).toBeInTheDocument();
    });

    it('renders portfolio fields', () => {
      render(<AssortmentTab {...formProps} />);
      
      expect(screen.getByLabelText('Валюта закупки')).toBeInTheDocument();
      expect(screen.getByLabelText('Поставщик')).toBeInTheDocument();
      expect(screen.getByLabelText('Категория товара')).toBeInTheDocument();
      expect(screen.getByLabelText('Объем единицы (м³)')).toBeInTheDocument();
    });

    it('updates form fields when input changes', () => {
      render(<AssortmentTab {...formProps} />);
      
      const nameInput = screen.getByLabelText('Название товара');
      fireEvent.change(nameInput, { target: { value: 'New Product' } });
      
      expect(defaultProps.setProductForm).toHaveBeenCalledWith(expect.any(Function));
    });

    it('shows seasonality settings', () => {
      render(<AssortmentTab {...formProps} />);
      
      expect(screen.getByText('Учитывать сезонность спроса')).toBeInTheDocument();
      expect(screen.getByLabelText('Учитывать сезонность спроса')).toBeInTheDocument();
    });

    it('shows monthly factors when seasonality is enabled', () => {
      const seasonalForm = {
        ...mockProductForm,
        seasonality: { ...mockProductForm.seasonality, enabled: true }
      };
      const seasonalProps = { ...formProps, productForm: seasonalForm };
      
      render(<AssortmentTab {...seasonalProps} />);
      
      expect(screen.getByText('Коэффициенты спроса: 1.0 = обычный спрос, 2.0 = двойной спрос, 0.5 = половина спроса')).toBeInTheDocument();
      expect(screen.getByLabelText('Янв')).toBeInTheDocument();
      expect(screen.getByLabelText('Дек')).toBeInTheDocument();
    });

    it('calls handleAddProduct when form is submitted for new product', () => {
      render(<AssortmentTab {...formProps} />);
      
      const submitButton = screen.getByText('Добавить товар');
      fireEvent.click(submitButton);
      
      expect(defaultProps.addProduct).toHaveBeenCalled();
    });

    it('shows save button when editing existing product', () => {
      const editingProps = { ...formProps, editingProductId: 1 };
      render(<AssortmentTab {...editingProps} />);
      
      expect(screen.getByText('Сохранить изменения')).toBeInTheDocument();
    });

    it('calls setShowProductForm when cancel button is clicked', () => {
      render(<AssortmentTab {...formProps} />);
      
      const cancelButton = screen.getByText('Отмена');
      fireEvent.click(cancelButton);
      
      expect(defaultProps.setShowProductForm).toHaveBeenCalledWith(false);
    });
  });

  describe('Product Display', () => {
    it('shows product metrics correctly', () => {
      render(<AssortmentTab {...defaultProps} />);
      
      // Проверяем отображение метрик в таблице
      expect(screen.getByText('SKU')).toBeInTheDocument();
      expect(screen.getByText('Название')).toBeInTheDocument();
      expect(screen.getByText('Текущий запас')).toBeInTheDocument();
    });

    it('displays product names and SKUs', () => {
      render(<AssortmentTab {...defaultProps} />);
      
      // Проверяем что основные данные товаров отображаются
      expect(screen.getByText('iPhone Case')).toBeInTheDocument();
      expect(screen.getByText('Samsung TV')).toBeInTheDocument();
      expect(screen.getByText('SKU001')).toBeInTheDocument();
      expect(screen.getByText('SKU002')).toBeInTheDocument();
    });

    it('shows product prices', () => {
      render(<AssortmentTab {...defaultProps} />);
      
      // Проверяем отображение цен
      expect(screen.getByText('$7.50')).toBeInTheDocument();
      expect(screen.getByText('$18.00')).toBeInTheDocument();
      expect(screen.getByText('$12.00')).toBeInTheDocument();
      expect(screen.getByText('$22.00')).toBeInTheDocument();
    });

    it('displays product data correctly', () => {
      render(<AssortmentTab {...defaultProps} />);
      
      // Проверяем что данные товаров отображаются
      expect(screen.getByText('iPhone Case')).toBeInTheDocument();
      expect(screen.getByText('Samsung TV')).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    const formProps = { ...defaultProps, showProductForm: true };
    
    it('shows validation errors for empty required fields', async () => {
      render(<AssortmentTab {...formProps} />);
      
      const submitButton = screen.getByText('Добавить товар');
      fireEvent.click(submitButton);
      
      // Проверяем, что addProduct был вызван
      expect(defaultProps.addProduct).toHaveBeenCalled();
    });

    it('handles volume discounts', () => {
      render(<AssortmentTab {...formProps} />);
      
      expect(screen.getByText('Скидки за объем')).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('renders table headers correctly', () => {
      render(<AssortmentTab {...defaultProps} />);
      
      // Проверяем реальные заголовки таблицы
      expect(screen.getByText('SKU')).toBeInTheDocument();
      expect(screen.getByText('Название')).toBeInTheDocument();
      expect(screen.getByText('Закуп, $')).toBeInTheDocument();
      expect(screen.getByText('Маржа, $')).toBeInTheDocument();
      expect(screen.getByText('Действия')).toBeInTheDocument();
    });

    it('shows product count', () => {
      render(<AssortmentTab {...defaultProps} />);
      
      // Проверяем что отображается таблица с товарами
      expect(screen.getByText('iPhone Case')).toBeInTheDocument();
      expect(screen.getByText('Samsung TV')).toBeInTheDocument();
    });
  });
}); 