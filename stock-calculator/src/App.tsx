import React from 'react';
import './App.css';
import InventoryOptionCalculator from './InventoryCalculator';
import { PortfolioSettingsProvider } from './contexts/PortfolioSettingsContext';
import { getWasmModule } from './utils/wasmBridge';

function App() {
  React.useEffect(() => {
    // Инициализируем Wasm модуль в фоне
    getWasmModule().catch(e => console.warn('Wasm initialization skipped:', e));
  }, []);

  return (
    <div className="App">
      <PortfolioSettingsProvider>
        <InventoryOptionCalculator />
      </PortfolioSettingsProvider>
    </div>
  );
}

export default App;
