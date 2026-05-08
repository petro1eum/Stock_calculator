import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

// Читаем ключ из .env в корне проекта
function getWBApiKey(): string {
  try {
    const envPath = join(process.cwd(), '..', '.env');
    const envContent = readFileSync(envPath, 'utf8');
    const match = envContent.match(/wildberries_api=(.+)/);
    return match?.[1]?.trim() || '';
  } catch (error) {
    console.error('Failed to read .env file:', error);
    return '';
  }
}

// Получение текущих остатков по всем SKU
async function fetchWBStocks(apiKey: string, dateFrom: string) {
  console.log(`[WB Stocks API] Calling with dateFrom: ${dateFrom}`);
  
  // API остатков Wildberries (текущие остатки на складах)
  const response = await fetch(`https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${dateFrom}`, {
    headers: { 
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    }
  });
  
  console.log(`[WB Stocks API] Response status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[WB Stocks API] Error response: ${errorText}`);
    throw new Error(`WB API error: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log(`[WB Stocks API] Received ${data.length} stock records`);
  
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
