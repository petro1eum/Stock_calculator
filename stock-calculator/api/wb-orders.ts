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

// Получение заказов для управления поставками
async function fetchWBOrders(apiKey: string, limit: number = 100, next: number = 0) {
  console.log(`[WB Orders API] Calling with limit: ${limit}, next: ${next}`);
  
  // API заказов Wildberries (сборочные задания)
  const response = await fetch(`https://marketplace-api.wildberries.ru/api/v3/orders?limit=${limit}&next=${next}`, {
    headers: { 
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    }
  });
  
  console.log(`[WB Orders API] Response status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[WB Orders API] Error response: ${errorText}`);
    throw new Error(`WB API error: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log(`[WB Orders API] Received ${data.orders?.length || 0} orders`);
  
  // Преобразуем в наш формат
  return {
    orders: data.orders?.map((order: any) => ({
      id: order.id,
      createdAt: order.createdAt?.split('T')[0],
      address: order.address,
      deliveryType: order.deliveryType,
      nmId: order.nmId,
      article: order.article,
      colorCode: order.colorCode,
      rid: order.rid,
      skus: order.skus || [],
      status: order.status, // new, confirm, complete, cancel
      chrt_id: order.chrt_id,
      price: order.price,
      convertedPrice: order.convertedPrice,
      currencyCode: order.currencyCode
    })) || [],
    next: data.next || 0,
    total: data.total || 0
  };
}

// Обновление статуса заказа
async function updateOrderStatus(apiKey: string, orderId: number, status: string) {
  console.log(`[WB Orders API] Updating order ${orderId} to status: ${status}`);
  
  const response = await fetch(`https://marketplace-api.wildberries.ru/api/v3/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status })
  });
  
  console.log(`[WB Orders API] Update response status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[WB Orders API] Update error response: ${errorText}`);
    throw new Error(`WB API error: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  return { success: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = getWBApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: 'WB API key not configured in .env file' });
  }

  if (req.method === 'GET') {
    const { limit = '100', next = '0' } = req.query;
    
    try {
      const ordersData = await fetchWBOrders(apiKey, parseInt(limit as string), parseInt(next as string));
      return res.status(200).json(ordersData);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'PATCH') {
    const { orderId, status } = req.body;
    if (!orderId || !status) {
      return res.status(400).json({ error: 'orderId and status are required' });
    }

    try {
      const result = await updateOrderStatus(apiKey, orderId, status);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}
