const fs = require('fs');
const path = require('path');

// Читаем API ключ
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const apiKey = envContent.match(/wildberries_api=(.+)/)[1].trim();

console.log('🔑 API Key:', apiKey.substring(0, 30) + '...');
console.log('🚀 Testing Wildberries API with real key...\n');

const endpoints = [
  {
    name: 'SALES',
    url: 'https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=2025-07-01T00:00:00',
    file: 'sales_real.json'
  },
  {
    name: 'STOCKS', 
    url: 'https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=2025-07-01T00:00:00',
    file: 'stocks_real.json'
  },
  {
    name: 'INCOMES',
    url: 'https://statistics-api.wildberries.ru/api/v1/supplier/incomes?dateFrom=2025-07-01T00:00:00',
    file: 'incomes_real.json'
  },
  {
    name: 'ORDERS',
    url: 'https://marketplace-api.wildberries.ru/api/v3/orders?limit=10&next=0',
    file: 'orders_real.json'
  }
];

async function testEndpoint(endpoint) {
  console.log(`📡 Testing ${endpoint.name}...`);
  
  try {
    const response = await fetch(endpoint.url, {
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    const text = await response.text();
    console.log(`   Response length: ${text.length} chars`);
    
    if (!response.ok) {
      console.log(`   ❌ Error: ${text}`);
      fs.writeFileSync(`api_responses/${endpoint.file}`, JSON.stringify({
        error: true,
        status: response.status,
        statusText: response.statusText,
        response: text
      }, null, 2));
      return;
    }
    
    // Пытаемся распарсить JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.log(`   ❌ Invalid JSON: ${e.message}`);
      fs.writeFileSync(`api_responses/${endpoint.file}`, JSON.stringify({
        error: true,
        message: 'Invalid JSON response',
        raw: text
      }, null, 2));
      return;
    }
    
    console.log(`   ✅ Success! Records: ${Array.isArray(data) ? data.length : typeof data}`);
    if (Array.isArray(data) && data.length > 0) {
      console.log(`   📋 First record keys: ${Object.keys(data[0]).join(', ')}`);
    }
    
    // Сохраняем в файл
    const outputData = {
      endpoint: endpoint.url,
      timestamp: new Date().toISOString(),
      count: Array.isArray(data) ? data.length : 1,
      data: data
    };
    
    fs.writeFileSync(`api_responses/${endpoint.file}`, JSON.stringify(outputData, null, 2));
    console.log(`   💾 Saved to api_responses/${endpoint.file}\n`);
    
  } catch (error) {
    console.log(`   ❌ Network error: ${error.message}`);
    fs.writeFileSync(`api_responses/${endpoint.file}`, JSON.stringify({
      error: true,
      message: error.message,
      endpoint: endpoint.url
    }, null, 2));
  }
}

async function runTests() {
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
    // Небольшая пауза между запросами
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('🎉 All tests completed! Check api_responses/ folder for results.');
}

runTests().catch(console.error);
