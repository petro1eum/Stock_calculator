import React from 'react';
import './App.css';
import InventoryOptionCalculator from './InventoryCalculator';
import { PortfolioSettingsProvider } from './contexts/PortfolioSettingsContext';

function App() {
  return (
    <div className="App">
      <PortfolioSettingsProvider>
        <InventoryOptionCalculator />
      </PortfolioSettingsProvider>
    </div>
  );
}

export default App;
