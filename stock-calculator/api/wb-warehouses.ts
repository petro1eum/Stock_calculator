import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

function getWBApiKey(): string {
  try {
    const envPath = join(process.cwd(), '..', '.env');
    const envContent = readFileSync(envPath, 'utf8');
    const match = envContent.match(/wildberries_api=(.+)/);
    return match?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const apiKey = getWBApiKey();
    if (!apiKey) return res.status(500).json({ error: 'WB API key not configured' });
    // Справочник складов WB (публичный marketplace API)
    const url = 'https://marketplace-api.wildberries.ru/api/v3/warehouses';
    const resp = await fetch(url, { headers: { Authorization: apiKey, Accept: 'application/json' } });
    const text = await resp.text();
    if (!resp.ok) return res.status(resp.status).send(text);
    let json: any;
    try { json = JSON.parse(text); } catch { return res.status(502).json({ error: 'Invalid JSON from WB', raw: text.slice(0,200) }); }
    const list = Array.isArray(json) ? json : (json?.warehouses || []);
    return res.status(200).json({ warehouses: list });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'WB warehouses fetch failed' });
  }
}


