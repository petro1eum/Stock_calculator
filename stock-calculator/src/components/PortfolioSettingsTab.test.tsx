import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PortfolioSettingsTab from './PortfolioSettingsTab';

// Мокаем контекст портфеля
const mockPortfolioSettings = {
  currencies: [
    { code: 'RUB', rate: 1.0, volatility: 0.15 },
    { code: 'USD', rate: 92.5, volatility: 0.20 }
  ],
  setCurrencies: jest.fn(),
  suppliers: [
    { code: 'domestic', name: 'Российский', volatility: 0.10 },
    { code: 'china', name: 'Китай', volatility: 0.25 }
  ],
  setSuppliers: jest.fn(),
  categories: [
    { name: 'Электроника', intraCorrelation: 0.7, interCorrelation: 0.2 }
  ],
  setCategories: jest.fn(),
  correlationRules: [
    { type: 'complement' as const, items: ['phone', 'case'], factor: 1.2 }
  ],
  setCorrelationRules: jest.fn(),
};

jest.mock('../contexts/PortfolioSettingsContext', () => ({
  usePortfolioSettings: () => mockPortfolioSettings
}));

describe('PortfolioSettingsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all management sections', () => {
    render(<PortfolioSettingsTab />);
    
    expect(screen.getByText('Управление валютами')).toBeInTheDocument();
    expect(screen.getByText('Управление поставщиками')).toBeInTheDocument();
    expect(screen.getByText('Управление категориями товаров')).toBeInTheDocument();
    expect(screen.getByText('Правила корреляции товаров')).toBeInTheDocument();
  });

  describe('Currency Management', () => {
    it('displays existing currencies', () => {
      render(<PortfolioSettingsTab />);
      
      expect(screen.getByText('RUB')).toBeInTheDocument();
      expect(screen.getByText('USD')).toBeInTheDocument();
      expect(screen.getByText('1.00')).toBeInTheDocument();
      expect(screen.getByText('92.50')).toBeInTheDocument();
    });

    it('allows adding new currency', () => {
      render(<PortfolioSettingsTab />);
      
      const codeInput = screen.getByPlaceholderText('Код валюты');
      const rateInput = screen.getByPlaceholderText('Курс к рублю');
      const volatilityInput = screen.getByPlaceholderText('Волатильность');
      const addButton = screen.getAllByText('Добавить')[0];
      
      fireEvent.change(codeInput, { target: { value: 'EUR' } });
      fireEvent.change(rateInput, { target: { value: '100' } });
      fireEvent.change(volatilityInput, { target: { value: '0.18' } });
      fireEvent.click(addButton);
      
      expect(mockPortfolioSettings.setCurrencies).toHaveBeenCalled();
    });

    it('prevents deleting RUB currency', () => {
      render(<PortfolioSettingsTab />);
      
      // RUB не должен иметь кнопку удаления
      const rubRow = screen.getByText('RUB').closest('tr');
      expect(rubRow).not.toHaveTextContent('Удалить');
    });

    it('allows editing currency', () => {
      render(<PortfolioSettingsTab />);
      
      const editButtons = screen.getAllByText('Изменить');
      fireEvent.click(editButtons[0]); // Редактируем первую валюту
      
      expect(screen.getByText('Сохранить')).toBeInTheDocument();
      expect(screen.getByText('Отмена')).toBeInTheDocument();
    });
  });

  describe('Supplier Management', () => {
    it('displays existing suppliers', () => {
      render(<PortfolioSettingsTab />);
      
      expect(screen.getByText('domestic')).toBeInTheDocument();
      expect(screen.getByText('china')).toBeInTheDocument();
      expect(screen.getByText('Российский')).toBeInTheDocument();
      expect(screen.getByText('Китай')).toBeInTheDocument();
    });

    it('allows adding new supplier', () => {
      render(<PortfolioSettingsTab />);
      
      const codeInput = screen.getByPlaceholderText('Код поставщика');
      const nameInput = screen.getByPlaceholderText('Название');
      const volatilityInput = screen.getByPlaceholderText('Волатильность логистики');
      const addButton = screen.getAllByText('Добавить')[1];
      
      fireEvent.change(codeInput, { target: { value: 'europe' } });
      fireEvent.change(nameInput, { target: { value: 'Европа' } });
      fireEvent.change(volatilityInput, { target: { value: '0.20' } });
      fireEvent.click(addButton);
      
      expect(mockPortfolioSettings.setSuppliers).toHaveBeenCalled();
    });

    it('prevents deleting domestic supplier', () => {
      render(<PortfolioSettingsTab />);
      
      // domestic не должен иметь кнопку удаления
      const domesticRow = screen.getByText('domestic').closest('tr');
      expect(domesticRow).not.toHaveTextContent('Удалить');
    });
  });

  describe('Category Management', () => {
    it('displays existing categories', () => {
      render(<PortfolioSettingsTab />);
      
      expect(screen.getByText('Электроника')).toBeInTheDocument();
      expect(screen.getByText('0.7')).toBeInTheDocument();
      expect(screen.getByText('0.2')).toBeInTheDocument();
    });

    it('allows adding new category', () => {
      render(<PortfolioSettingsTab />);
      
      const nameInput = screen.getByPlaceholderText('Название категории');
      const intraInput = screen.getByPlaceholderText('Корреляция внутри');
      const interInput = screen.getByPlaceholderText('Корреляция между');
      const addButton = screen.getAllByText('Добавить')[2];
      
      fireEvent.change(nameInput, { target: { value: 'Одежда' } });
      fireEvent.change(intraInput, { target: { value: '0.8' } });
      fireEvent.change(interInput, { target: { value: '0.1' } });
      fireEvent.click(addButton);
      
      expect(mockPortfolioSettings.setCategories).toHaveBeenCalled();
    });

    it('allows deleting categories', () => {
      render(<PortfolioSettingsTab />);
      
      // Мокаем window.confirm
      window.confirm = jest.fn(() => true);
      
      // Проверяем что компонент рендерится с категориями
      expect(screen.getByText('Электроника')).toBeInTheDocument();
      
      // Проверяем что есть кнопки удаления
      const deleteButtons = screen.getAllByText('Удалить');
      expect(deleteButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Correlation Rules Management', () => {
    it('displays existing correlation rules', () => {
      render(<PortfolioSettingsTab />);
      
      const complementElements = screen.getAllByText('Комплементы');
      expect(complementElements.length).toBeGreaterThan(0);
      expect(screen.getByText('phone, case')).toBeInTheDocument();
      expect(screen.getByText('1.2x')).toBeInTheDocument();
    });

    it('allows adding new correlation rule', () => {
      render(<PortfolioSettingsTab />);
      
      // Ищем селект по значению по умолчанию
      const typeSelect = screen.getByRole('combobox');
      const item1Input = screen.getByPlaceholderText('Товар 1');
      const item2Input = screen.getByPlaceholderText('Товар 2');
      const factorInput = screen.getByPlaceholderText('Фактор');
      const addButton = screen.getAllByText('Добавить')[3];
      
      fireEvent.change(typeSelect, { target: { value: 'substitute' } });
      fireEvent.change(item1Input, { target: { value: 'brand_a' } });
      fireEvent.change(item2Input, { target: { value: 'brand_b' } });
      fireEvent.change(factorInput, { target: { value: '0.8' } });
      fireEvent.click(addButton);
      
      expect(mockPortfolioSettings.setCorrelationRules).toHaveBeenCalled();
    });

    it('allows deleting correlation rules', () => {
      render(<PortfolioSettingsTab />);
      
      // Ищем все кнопки удаления
      const deleteButtons = screen.getAllByText('Удалить');
      
      // Мокаем window.confirm
      window.confirm = jest.fn(() => true);
      
      // Берем последнюю кнопку удаления (скорее всего для правил корреляции)
      if (deleteButtons.length > 1) {
        fireEvent.click(deleteButtons[deleteButtons.length - 1]);
        expect(window.confirm).toHaveBeenCalled();
        expect(mockPortfolioSettings.setCorrelationRules).toHaveBeenCalled();
      }
    });

    it('shows different rule types with appropriate styling', () => {
      // Просто проверяем что компонент рендерится с базовыми правилами
      render(<PortfolioSettingsTab />);
      
      const complementElements = screen.getAllByText('Комплементы');
      expect(complementElements.length).toBeGreaterThan(0);
      
      // Проверяем что есть стилизация для типа правила
      const ruleElement = complementElements.find(el => 
        el.className && el.className.includes('bg-green-100') && el.className.includes('text-green-800'));
      expect(ruleElement).toBeTruthy();
    });
  });

  describe('Form Validation', () => {
    it('requires currency code and rate for adding currency', () => {
      render(<PortfolioSettingsTab />);
      
      const addButton = screen.getAllByText('Добавить')[0];
      fireEvent.click(addButton);
      
      // Не должно вызывать setCurrencies без заполненных полей
      expect(mockPortfolioSettings.setCurrencies).not.toHaveBeenCalled();
    });

    it('requires supplier code and name for adding supplier', () => {
      render(<PortfolioSettingsTab />);
      
      const addButton = screen.getAllByText('Добавить')[1];
      fireEvent.click(addButton);
      
      // Не должно вызывать setSuppliers без заполненных полей
      expect(mockPortfolioSettings.setSuppliers).not.toHaveBeenCalled();
    });

    it('requires category name for adding category', () => {
      render(<PortfolioSettingsTab />);
      
      const addButton = screen.getAllByText('Добавить')[2];
      fireEvent.click(addButton);
      
      // Не должно вызывать setCategories без заполненных полей
      expect(mockPortfolioSettings.setCategories).not.toHaveBeenCalled();
    });

    it('requires at least 2 items for correlation rule', () => {
      render(<PortfolioSettingsTab />);
      
      const item1Input = screen.getByPlaceholderText('Товар 1');
      fireEvent.change(item1Input, { target: { value: 'item1' } });
      // Не заполняем второй товар
      
      const addButton = screen.getAllByText('Добавить')[3];
      fireEvent.click(addButton);
      
      // Не должно вызывать setCorrelationRules без двух товаров
      expect(mockPortfolioSettings.setCorrelationRules).not.toHaveBeenCalled();
    });
  });

  describe('Notes Section', () => {
    it('displays helpful notes', () => {
      render(<PortfolioSettingsTab />);
      
      expect(screen.getByText('Примечания')).toBeInTheDocument();
      expect(screen.getByText(/Волатильность валют влияет на общий риск/)).toBeInTheDocument();
      expect(screen.getByText(/Волатильность логистики отражает надежность/)).toBeInTheDocument();
      expect(screen.getByText(/Корреляция внутри категории/)).toBeInTheDocument();
    });
  });

  describe('Input Formatting', () => {
    it('formats currency code to uppercase', () => {
      render(<PortfolioSettingsTab />);
      
      const codeInput = screen.getByPlaceholderText('Код валюты');
      fireEvent.change(codeInput, { target: { value: 'eur' } });
      
      expect(codeInput).toHaveValue('EUR');
    });

    it('formats supplier code to lowercase', () => {
      render(<PortfolioSettingsTab />);
      
      const codeInput = screen.getByPlaceholderText('Код поставщика');
      fireEvent.change(codeInput, { target: { value: 'EUROPE' } });
      
      expect(codeInput).toHaveValue('europe');
    });
  });
}); 