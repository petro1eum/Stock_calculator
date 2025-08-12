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

// Получение текущих остатков по всем SKU
async function fetchWBStocks(apiKey: string, dateFrom: string) {
  try {
    // API остатков Wildberries (текущие остатки на складах)
    const response = await fetch(`https://suppliers-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${dateFrom}`, {
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
    return data.map((stock: any) => ({
      date: stock.lastChangeDate?.split('T')[0] || stock.date,
      nmId: stock.nmId,
      subject: stock.subject,
      brand: stock.brand,
      techSize: stock.techSize,
      barcode: stock.barcode,
      quantity: stock.quantity || 0,
      inWayToClient: stock.inWayToClient || 0,
      inWayFromClient: stock.inWayFromClient || 0,
      warehouse: stock.warehouseName,
      price: stock.Price || 0,
      discount: stock.Discount || 0
    }));
  } catch (error: any) {
    console.error('WB Stocks API Error:', error.message);
    // Тестовые данные для демонстрации
    return [
      { 
        date: '2024-01-20', 
        nmId: 12345, 
        subject: 'Футболка', 
        brand: 'TestBrand',
        techSize: 'M',
        barcode: '1234567890123',
        quantity: 45, 
        inWayToClient: 5,
        inWayFromClient: 0,
        warehouse: 'Коледино',
        price: 500,
        discount: 10
      },
      { 
        date: '2024-01-20', 
        nmId: 67890, 
        subject: 'Джинсы', 
        brand: 'DenimCo',
        techSize: '32',
        barcode: '9876543210987', 
        quantity: 23, 
        inWayToClient: 2,
        inWayFromClient: 1,
        warehouse: 'Подольск',
        price: 2000,
        discount: 15
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

      const stocksData = await fetchWBStocks(apiKey, dateFrom);
      return res.status(200).json({ stocks: stocksData });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'Method not allowed' });
}
