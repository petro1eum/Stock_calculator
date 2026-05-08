import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE as string;
const admin = createClient(SUPABASE_URL as string, SERVICE_ROLE, { auth: { persistSession: false } });

function toNextMondayISO(): string {
  const d = new Date();
  const next = new Date(d);
  next.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  next.setHours(0, 0, 0, 0);
  return next.toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const week = (req.query.week as string) || toNextMondayISO();
    // Resolve user_id
    let userId = (req.query.user_id as string) || '';
    if (!userId) {
      const { data: anyRow } = await admin.from('wb_stocks').select('user_id').limit(1).maybeSingle();
      userId = anyRow?.user_id || '';
    }
    if (!userId) return res.status(400).json({ error: 'No user_id' });

    const { data, error } = await admin
      .from('wb_demand_forecast')
      .select('sku, mu, sigma')
      .eq('user_id', userId)
      .eq('week_start', week)
      .limit(10000);
    if (error) return res.status(500).json({ error: error.message });

    const map: Record<string, { mu: number; sigma: number }> = {};
    for (const r of data || []) map[r.sku] = { mu: Number(r.mu), sigma: Number(r.sigma) };
    return res.status(200).json({ week, userId, forecasts: map });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}


