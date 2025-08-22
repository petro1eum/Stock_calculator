import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Currency, CorrelationRule } from '../types/portfolio';

interface SupplierSettings {
  code: string;
  name: string;
  volatility: number;
}

interface CategorySettings {
  name: string;
  intraCorrelation: number;
  interCorrelation: number;
}

interface PortfolioSettingsContextType {
  currencies: Currency[];
  setCurrencies: (currencies: Currency[]) => void;
  suppliers: SupplierSettings[];
  setSuppliers: (suppliers: SupplierSettings[]) => void;
  categories: CategorySettings[];
  setCategories: (categories: CategorySettings[]) => void;
  correlationRules: CorrelationRule[];
  setCorrelationRules: (rules: CorrelationRule[]) => void;
}

const PortfolioSettingsContext = createContext<PortfolioSettingsContextType | undefined>(undefined);

export const usePortfolioSettings = () => {
  const context = useContext(PortfolioSettingsContext);
  if (!context) {
    throw new Error('usePortfolioSettings must be used within PortfolioSettingsProvider');
  }
  return context;
};

interface PortfolioSettingsProviderProps {
  children: ReactNode;
}

export const PortfolioSettingsProvider: React.FC<PortfolioSettingsProviderProps> = ({ children }) => {
  const [currencies, setCurrencies] = useState<Currency[]>([
    { code: 'RUB', rate: 1.0, volatility: 0.15 },
    { code: 'USD', rate: 92.5, volatility: 0.20 },
    { code: 'EUR', rate: 100.2, volatility: 0.18 },
    { code: 'CNY', rate: 12.8, volatility: 0.12 },
  ]);

  const [suppliers, setSuppliers] = useState<SupplierSettings[]>([
    { code: 'domestic', name: 'Российский', volatility: 0.10 },
    { code: 'china', name: 'Китай', volatility: 0.25 },
    { code: 'europe', name: 'Европа', volatility: 0.20 },
    { code: 'usa', name: 'США', volatility: 0.22 },
  ]);

  const [categories, setCategories] = useState<CategorySettings[]>([
    { name: 'Электроника', intraCorrelation: 0.7, interCorrelation: 0.2 },
    { name: 'Одежда', intraCorrelation: 0.8, interCorrelation: 0.1 },
    { name: 'Бытовая техника', intraCorrelation: 0.6, interCorrelation: 0.15 },
  ]);

  const [correlationRules, setCorrelationRules] = useState<CorrelationRule[]>([
    { type: 'complement', items: ['phone', 'case'], factor: 1.2 },
    { type: 'complement', items: ['printer', 'ink'], factor: 1.3 },
    { type: 'substitute', items: ['brand_a', 'brand_b'], factor: 0.8 },
    { type: 'seasonal', items: ['summer'], factor: 2.0, condition: 'summer' },
    { type: 'seasonal', items: ['winter'], factor: 2.0, condition: 'winter' },
  ]);

  return (
    <PortfolioSettingsContext.Provider
      value={{
        currencies,
        setCurrencies,
        suppliers,
        setSuppliers,
        categories,
        setCategories,
        correlationRules,
        setCorrelationRules,
      }}
    >
      {children}
    </PortfolioSettingsContext.Provider>
  );
};

export type { SupplierSettings, CategorySettings }; 