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

// Реальный вызов WB API с ключом пользователя
async function fetchWBSales(apiKey: string, dateFrom: string) {
  console.log(`[WB Sales API] Calling with dateFrom: ${dateFrom}`);
  console.log(`[WB Sales API] Using API key: ${apiKey.substring(0, 20)}...`);
  
  // API продаж Wildberries
  const response = await fetch(`https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${dateFrom}`, {
    headers: { 
      'Authorization': apiKey, // Без Bearer префикса, как в официальной документации
      'Content-Type': 'application/json'
    }
  });
  
  console.log(`[WB Sales API] Response status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[WB Sales API] Error response: ${errorText}`);
    throw new Error(`WB API error: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log(`[WB Sales API] Received ${data.length} sales records`);
  
  // Преобразуем в наш формат
  return data.map((sale: any) => ({
    date: sale.date?.split('T')[0] || sale.date,
    nmId: sale.nmId,
    subject: sale.subject,
    brand: sale.brand,
    quantity: sale.quantity || 1,
    totalPrice: sale.totalPrice || sale.finishedPrice,
    saleID: sale.saleID || sale.gNumber,
    warehouseName: sale.warehouseName,
    countryName: sale.countryName,
    oblastOkrugName: sale.oblastOkrugName,
    regionName: sale.regionName
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

      const salesData = await fetchWBSales(apiKey, dateFrom);
      return res.status(200).json({ sales: salesData });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'Method not allowed' });
}
