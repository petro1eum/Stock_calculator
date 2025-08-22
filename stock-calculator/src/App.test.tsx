import React from 'react';
import { render } from '@testing-library/react';

// Мокаем контекст портфеля
jest.mock('./contexts/PortfolioSettingsContext', () => ({
  PortfolioSettingsProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

// Мокаем авторизацию, чтобы не рендерить Login
jest.mock('./utils/authGate', () => ({
  authGate: async () => ({ user: { id: 'test-user' } })
}));
jest.mock('./Login', () => () => null);

// Мокаем toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: jest.fn(),
  Toaster: () => null,
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  }
}));

// Мокаем recharts
jest.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Scatter: () => <div data-testid="scatter" />,
  ScatterChart: ({ children }: any) => <div data-testid="scatter-chart">{children}</div>,
}));

// ВАЖНО: импортируем App после моков
import App from './App';

test('App renders without crashing', () => {
  const { container } = render(<App />);
  expect(container).toBeTruthy();
});
