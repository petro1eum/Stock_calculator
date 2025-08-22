import React from 'react';
import UserMenu from './UserMenu';

interface SimpleLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  productsCount: number;
}

const SimpleLayout: React.FC<SimpleLayoutProps> = ({ 
  children, 
  activeTab, 
  onTabChange, 
  productsCount 
}) => {
  const navigation = [
    { id: 'dashboard', name: 'Дашборд' },
    { id: 'assortment', name: 'Товары' },
    { id: 'supplies', name: 'Поставки' },
    { id: 'settings', name: 'Настройки' },
    { id: 'productAnalysis', name: 'Анализ', disabled: productsCount === 0 },
    { id: 'abc', name: 'ABC-анализ', disabled: productsCount === 0 },
    { id: 'scenarios', name: 'Сценарии', disabled: productsCount === 0 },
    { id: 'portfolioSettings', name: 'Портфель' },
    { id: 'export', name: 'Данные' },
    { id: 'theory', name: 'Теория' },
  ];

  // Logout перенесён в UserMenu

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Простая навигация сверху */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-bold">StockOptim</h1>
            <nav className="flex items-center space-x-4">
              {navigation.map((item) => (
                <button
                  key={item.id}
                  onClick={() => !item.disabled && onTabChange(item.id)}
                  disabled={item.disabled}
                  className={`
                    px-3 py-2 rounded-md text-sm font-medium
                    ${activeTab === item.id 
                      ? 'bg-blue-500 text-white' 
                      : item.disabled
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                >
                  {item.name}
                  {item.id === 'assortment' && productsCount > 0 && (
                    <span className="ml-1 text-xs">({productsCount})</span>
                  )}
                </button>
              ))}
              <UserMenu />
            </nav>
          </div>
        </div>
      </div>

      {/* Контент */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
};

export default SimpleLayout; 