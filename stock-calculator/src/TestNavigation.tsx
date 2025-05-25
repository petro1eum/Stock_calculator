import React, { useState } from 'react';

const TestNavigation = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const tabs = ['dashboard', 'assortment', 'settings', 'productAnalysis', 'abc', 'scenarios', 'dataIO', 'theory'];
  
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Тест навигации</h1>
      
      <div className="mb-4">
        <p>Текущая вкладка: <strong>{activeTab}</strong></p>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => {
              console.log(`Переключение на вкладку: ${tab}`);
              setActiveTab(tab);
            }}
            className={`px-4 py-2 rounded ${
              activeTab === tab 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      
      <div className="border-t pt-4">
        <h2 className="text-xl mb-2">Содержимое вкладки:</h2>
        <div className="p-4 bg-gray-100 rounded">
          {activeTab === 'dashboard' && <p>Dashboard content</p>}
          {activeTab === 'assortment' && <p>Assortment content</p>}
          {activeTab === 'settings' && <p>Settings content</p>}
          {activeTab === 'productAnalysis' && <p>Product Analysis content</p>}
          {activeTab === 'abc' && <p>ABC Analysis content</p>}
          {activeTab === 'scenarios' && <p>Scenarios content</p>}
          {activeTab === 'dataIO' && <p>Data I/O content</p>}
          {activeTab === 'theory' && <p>Theory content</p>}
        </div>
      </div>
    </div>
  );
};

export default TestNavigation; 