import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HomeIcon,
  CubeIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ArrowTrendingUpIcon,
  ArrowDownTrayIcon,
  AcademicCapIcon,
  Bars3Icon,
  XMarkIcon,
  SunIcon,
  MoonIcon
} from '@heroicons/react/24/outline';
import { Toaster } from 'react-hot-toast';


interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  productsCount: number;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  onTabChange,
  productsCount,
  darkMode,
  onToggleDarkMode
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { id: 'dashboard', name: 'Дашборд', icon: HomeIcon, badge: null },
    { id: 'assortment', name: 'Товары', icon: CubeIcon, badge: productsCount || null },
    { id: 'settings', name: 'Настройки', icon: Cog6ToothIcon, badge: null },
    { id: 'productAnalysis', name: 'Анализ', icon: ChartBarIcon, badge: null, disabled: productsCount === 0 },
    { id: 'abc', name: 'ABC-анализ', icon: DocumentTextIcon, badge: null, disabled: productsCount === 0 },
    { id: 'scenarios', name: 'Сценарии', icon: ArrowTrendingUpIcon, badge: null, disabled: productsCount === 0 },
    { id: 'dataIO', name: 'Данные', icon: ArrowDownTrayIcon, badge: null },
    { id: 'theory', name: 'Теория', icon: AcademicCapIcon, badge: null },
  ];

  const sidebarVariants = {
    open: { x: 0 },
    closed: { x: '-100%' }
  };

  const overlayVariants = {
    open: { opacity: 1, display: 'block' },
    closed: { opacity: 0, transitionEnd: { display: 'none' } }
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <Toaster
        position="top-right"
        toastOptions={{
          className: darkMode ? 'dark' : '',
          style: {
            background: darkMode ? '#1f2937' : 'white',
            color: darkMode ? 'white' : 'black',
          }
        }}
      />

      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={overlayVariants}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-gray-900/80 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div
        initial={false}
        animate={sidebarOpen ? 'open' : 'closed'}
        variants={sidebarVariants}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={`fixed inset-y-0 left-0 z-50 w-72 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          } border-r transform lg:translate-x-0 lg:static lg:inset-0`}
      >
        <div className="flex h-full flex-col">
          {/* Logo area */}
          <div className={`flex h-16 items-center justify-between px-6 ${darkMode ? 'border-gray-700' : 'border-gray-200'
            } border-b`}>
            <div className="flex items-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                <ChartBarIcon className="h-6 w-6 text-white" />
              </div>
              <h1 className={`ml-3 text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'
                }`}>StockOptim</h1>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className={`lg:hidden ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navigation.map((item) => {
              const isActive = activeTab === item.id;
              const isDisabled = item.disabled;

              return (
                <motion.button
                  key={item.id}
                  whileHover={!isDisabled ? { scale: 1.02 } : {}}
                  whileTap={!isDisabled ? { scale: 0.98 } : {}}
                  onClick={() => !isDisabled && onTabChange(item.id)}
                  disabled={isDisabled}
                  data-testid={`nav-${item.id}`}
                  className={`
                    w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors
                    ${isActive
                      ? darkMode
                        ? 'bg-gray-700 text-white'
                        : 'bg-blue-50 text-blue-700'
                      : isDisabled
                        ? darkMode
                          ? 'text-gray-600 cursor-not-allowed'
                          : 'text-gray-400 cursor-not-allowed'
                        : darkMode
                          ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }
                  `}
                >
                  <div className="flex items-center">
                    <item.icon className={`h-5 w-5 mr-3 ${isActive ? '' : isDisabled ? 'opacity-50' : ''
                      }`} />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className={`
                      ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                      ${darkMode
                        ? 'bg-gray-700 text-gray-300'
                        : 'bg-gray-200 text-gray-700'
                      }
                    `}>
                      {item.badge}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </nav>

          {/* Theme toggle */}
          <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <button
              onClick={onToggleDarkMode}
              className={`
                w-full flex items-center justify-center px-4 py-3 rounded-lg text-sm font-medium transition-colors
                ${darkMode
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              {darkMode ? (
                <>
                  <SunIcon className="h-5 w-5 mr-2" />
                  Светлая тема
                </>
              ) : (
                <>
                  <MoonIcon className="h-5 w-5 mr-2" />
                  Темная тема
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Top bar */}
        <div className={`sticky top-0 z-40 flex h-16 items-center gap-x-4 px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          } border-b`}>
          <button
            onClick={() => setSidebarOpen(true)}
            className={`-m-2.5 p-2.5 lg:hidden ${darkMode ? 'text-gray-400' : 'text-gray-700'}`}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>

          {/* Breadcrumb */}
          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6 items-center">
            <div className="flex items-center gap-x-2">
              <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {activeTab === 'dashboard' ? 'Главная' : 'Главная /'}
              </span>
              {activeTab !== 'dashboard' && (
                <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {navigation.find(item => item.id === activeTab)?.name}
                </span>
              )}
            </div>

          </div>
        </div>

        {/* Page content */}
        <main className="py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout; 