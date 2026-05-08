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

// Набор цен по размерам (discounts-prices-api)
async function fetchWBPrices(apiKey: string) {
  // Этот эндпоинт в WB приватном API; оставляем заглушку схемы ответа
  // Здесь можно подключить реальный эндпоинт при наличии доступа
  return { listGoods: [] };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const apiKey = getWBApiKey();
    if (!apiKey) return res.status(500).json({ error: 'WB API key not configured in .env file' });
    const data = await fetchWBPrices(apiKey);
    return res.status(200).json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}


