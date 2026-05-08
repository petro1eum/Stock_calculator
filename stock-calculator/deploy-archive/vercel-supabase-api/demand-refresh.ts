import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE as string;
const admin = createClient(SUPABASE_URL as string, SERVICE_ROLE, { auth: { persistSession: false } });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Resolve user_id
    const pUserId = (req.query.user_id as string) || '';
    let userId = pUserId;
    if (!userId) {
      const { data: anyRow } = await admin.from('wb_stocks').select('user_id').limit(1).maybeSingle();
      userId = anyRow?.user_id || '';
    }
    if (!userId) return res.status(400).json({ error: 'No user_id' });

    const horizon = Number((req.query.horizon_weeks as string) || 12);
    // Call RPC
    const { error } = await admin.rpc('refresh_wb_demand_forecast', { p_user_id: userId, p_horizon_weeks: horizon });
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, userId, horizonWeeks: horizon });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}


