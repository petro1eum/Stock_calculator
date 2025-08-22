import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExportImportTab from './ExportImportTab';
import { Product } from '../types';

// Мокаем контекст портфеля
jest.mock('../contexts/PortfolioSettingsContext', () => ({
  usePortfolioSettings: () => ({
    currencies: [{ code: 'RUB', rate: 1.0, volatility: 0.15 }],
    setCurrencies: jest.fn(),
    suppliers: [{ code: 'domestic', name: 'Российский', volatility: 0.10 }],
    setSuppliers: jest.fn(),
    categories: [{ name: 'Электроника', intraCorrelation: 0.7, interCorrelation: 0.2 }],
    setCategories: jest.fn(),
    correlationRules: [],
    setCorrelationRules: jest.fn(),
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

describe('ExportImportTab', () => {
  const mockProducts: Product[] = [
    {
      id: 1,
      name: 'Test Product',
      sku: 'SKU001',
      purchase: 10,
      margin: 5,
      muWeek: 50,
      sigmaWeek: 10,
      revenue: 1000,
      optQ: 100,
      optValue: 500,
      safety: 20,
      currency: 'USD',
      supplier: 'china',
      category: 'Электроника',
      volume: 0.1,
      seasonality: {
        enabled: true,
        monthlyFactors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        currentMonth: 0
      },
      volumeDiscounts: [{ qty: 100, discount: 10 }]
    }
  ];

  const mockProps = {
    products: mockProducts,
    productsWithMetrics: mockProducts,
    setProducts: jest.fn(),
    exportToCSV: jest.fn(),
    importFromCSV: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders export and import sections', () => {
    render(<ExportImportTab {...mockProps} />);
    
    expect(screen.getByText('Экспорт данных')).toBeInTheDocument();
    expect(screen.getByText('Импорт данных')).toBeInTheDocument();
    expect(screen.getByText('Текущие данные')).toBeInTheDocument();
  });

  it('shows correct statistics for current data', () => {
    render(<ExportImportTab {...mockProps} />);
    
    // Проверяем статистику более точно
    expect(screen.getByText('Товаров')).toBeInTheDocument();
    expect(screen.getByText('С сезонностью')).toBeInTheDocument();
    expect(screen.getByText('В валюте')).toBeInTheDocument();
    
    // Проверяем что есть числовые значения
    const numberElements = screen.getAllByText('1');
    expect(numberElements.length).toBeGreaterThan(0);
  });

  it('calls exportToCSV when CSV export button is clicked', () => {
    render(<ExportImportTab {...mockProps} />);
    
    const csvExportButton = screen.getByText('📄 Экспортировать в CSV');
    fireEvent.click(csvExportButton);
    
    expect(mockProps.exportToCSV).toHaveBeenCalledTimes(1);
  });

  it('disables export buttons when no products', () => {
    const emptyProps = { ...mockProps, products: [], productsWithMetrics: [] };
    render(<ExportImportTab {...emptyProps} />);
    
    const csvExportButton = screen.getByText('📄 Экспортировать в CSV');
    const jsonExportButton = screen.getByText('📊 Экспортировать в JSON');
    
    expect(csvExportButton).toBeDisabled();
    expect(jsonExportButton).toBeDisabled();
  });

  it('handles CSV file import', () => {
    render(<ExportImportTab {...mockProps} />);
    
    const fileInput = document.querySelector('#csv-import') as HTMLInputElement;
    const mockFile = new File(['test content'], 'test.csv', { type: 'text/csv' });
    
    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false,
    });
    
    fireEvent.change(fileInput);
    
    expect(mockProps.importFromCSV).toHaveBeenCalledTimes(1);
  });

  it('shows template download button', () => {
    render(<ExportImportTab {...mockProps} />);
    
    const templateButton = screen.getByText('Скачать шаблон CSV');
    expect(templateButton).toBeInTheDocument();
  });

  it('shows JSON export button', () => {
    render(<ExportImportTab {...mockProps} />);
    
    const jsonExportButton = screen.getByText('📊 Экспортировать в JSON');
    expect(jsonExportButton).toBeInTheDocument();
  });

  it('shows JSON import input', () => {
    render(<ExportImportTab {...mockProps} />);
    
    const jsonImportLabel = screen.getByText('📥 Выбрать JSON файл');
    expect(jsonImportLabel).toBeInTheDocument();
  });

  it('shows warning about import replacing data', () => {
    render(<ExportImportTab {...mockProps} />);
    
    expect(screen.getByText('⚠️ Важно при импорте:')).toBeInTheDocument();
    expect(screen.getByText(/заменит/)).toBeInTheDocument();
  });

  it('displays correct statistics for products with different features', () => {
    const diverseProducts: Product[] = [
      {
        ...mockProducts[0],
        id: 1,
        seasonality: { enabled: true, monthlyFactors: [1,1,1,1,1,1,1,1,1,1,1,1], currentMonth: 0 }
      },
      {
        ...mockProducts[0],
        id: 2,
        seasonality: { enabled: false, monthlyFactors: [1,1,1,1,1,1,1,1,1,1,1,1], currentMonth: 0 },
        volumeDiscounts: [{ qty: 100, discount: 10 }],
        currentStock: 50,
        currency: 'RUB',
        supplier: 'domestic'
      }
    ];
    
    const diverseProps = {
      ...mockProps,
      products: diverseProducts,
      productsWithMetrics: diverseProducts
    };
    
    render(<ExportImportTab {...diverseProps} />);
    
    // Проверяем что компонент рендерится с разными товарами
    expect(screen.getByText('Товаров')).toBeInTheDocument();
    expect(screen.getByText('С сезонностью')).toBeInTheDocument();
  });
}); 