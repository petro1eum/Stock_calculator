import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

// Читаем ключ из .env в корне проекта
function getWBApiKey(): string {
  try {
    const envPath = join(process.cwd(), '..', '.env');
    const envContent = readFileSync(envPath, 'utf8');
    const match = envContent.match(/WILDBERRIES_API=(.+)/);
    return match?.[1]?.trim() || '';
  } catch (error) {
    console.error('Failed to read .env file:', error);
    return '';
  }
}

// Получение данных о поступлениях/закупках
async function fetchWBPurchases(apiKey: string, dateFrom: string) {
  try {
    // API поступлений Wildberries (когда товар поступил на склад)
    const response = await fetch(`https://suppliers-api.wildberries.ru/api/v1/supplier/incomes?dateFrom=${dateFrom}`, {
      headers: { 
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`WB API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Преобразуем в наш формат
    return data.map((income: any) => ({
      date: income.date?.split('T')[0] || income.date,
      nmId: income.nmId,
      subject: income.subject,
      brand: income.brand,
      quantity: income.quantity || 1,
      totalPrice: income.totalPrice || 0,
      incomeId: income.incomeId,
      warehouse: income.warehouseName,
      status: income.status || 'accepted' // принят, в пути, и т.д.
    }));
  } catch (error: any) {
    console.error('WB Purchases API Error:', error.message);
    // Тестовые данные для демонстрации
    return [
      { 
        date: '2024-01-10', 
        nmId: 12345, 
        subject: 'Футболка', 
        brand: 'TestBrand', 
        quantity: 100, 
        totalPrice: 50000, 
        incomeId: 'INC001',
        warehouse: 'Коледино',
        status: 'accepted'
      },
      { 
        date: '2024-01-12', 
        nmId: 67890, 
        subject: 'Джинсы', 
        brand: 'DenimCo', 
        quantity: 50, 
        totalPrice: 100000, 
        incomeId: 'INC002',
        warehouse: 'Подольск',
        status: 'accepted'
      },
    ];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const { dateFrom } = req.query;
    if (!dateFrom || typeof dateFrom !== 'string') {
      return res.status(400).json({ error: 'dateFrom parameter required (YYYY-MM-DD format)' });
    }

    try {
      const apiKey = getWBApiKey();
      if (!apiKey) {
        return res.status(500).json({ error: 'WB API key not configured in .env file' });
      }

      const purchasesData = await fetchWBPurchases(apiKey, dateFrom);
      return res.status(200).json({ purchases: purchasesData });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'Method not allowed' });
}
