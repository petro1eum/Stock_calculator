import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = getWBApiKey();
  
  if (!apiKey) {
    return res.status(500).json({ error: 'WB API key not found in .env' });
  }

  if (req.method === 'GET') {
    const { endpoint = 'stocks' } = req.query;
    let url = '';
    
    // Определяем URL и параметры для разных эндпоинтов
    switch (endpoint) {
      case 'stocks':
        url = 'https://suppliers-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=2025-08-01T00:00:00';
        break;
      case 'sales':
        url = 'https://suppliers-api.wildberries.ru/api/v1/supplier/sales?dateFrom=2025-08-01T00:00:00';
        break;
      case 'incomes':
        url = 'https://suppliers-api.wildberries.ru/api/v1/supplier/incomes?dateFrom=2025-08-01T00:00:00';
        break;
      case 'orders':
        url = 'https://suppliers-api.wildberries.ru/api/v1/supplier/orders?dateFrom=2025-08-01T00:00:00';
        break;
      case 'info':
        url = 'https://suppliers-api.wildberries.ru/public/api/v1/info?quantity=0';
        break;
      default:
        return res.status(400).json({ error: 'Invalid endpoint. Use: stocks, sales, incomes, orders, info' });
    }

    try {
      console.log(`[WB Test] Testing endpoint: ${endpoint}`);
      console.log(`[WB Test] URL: ${url}`);
      console.log(`[WB Test] API Key (first 30 chars): ${apiKey.substring(0, 30)}...`);

      // Тестируем оба варианта аутентификации
      const headers = {
        'Authorization': apiKey, // Без Bearer, как в PHP примерах
        'Content-Type': 'application/json'
      };

      const response = await fetch(url, { headers });
      
      console.log(`[WB Test] Response status: ${response.status} ${response.statusText}`);
      console.log(`[WB Test] Response headers:`, Object.fromEntries(response.headers.entries()));

      const text = await response.text();
      console.log(`[WB Test] Response body (first 500 chars):`, text.substring(0, 500));

      if (!response.ok) {
        return res.status(response.status).json({
          error: `WB API Error: ${response.status} ${response.statusText}`,
          details: text,
          endpoint,
          url
        });
      }

      // Пытаемся распарсить JSON
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return res.status(200).json({
          success: true,
          endpoint,
          raw_response: text,
          note: 'Response is not valid JSON'
        });
      }

      return res.status(200).json({
        success: true,
        endpoint,
        url,
        count: Array.isArray(data) ? data.length : 'Not an array',
        sample: Array.isArray(data) && data.length > 0 ? data[0] : data,
        data_structure: Array.isArray(data) && data.length > 0 ? Object.keys(data[0]) : typeof data
      });

    } catch (error: any) {
      console.error(`[WB Test] Network error:`, error.message);
      return res.status(500).json({
        error: 'Network error',
        details: error.message,
        endpoint,
        url
      });
    }
  }

  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'Method not allowed' });
}
