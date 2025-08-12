import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE as string;

const admin = createClient(SUPABASE_URL as string, SERVICE_ROLE, { auth: { persistSession: false } });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) return res.status(401).json({ error: 'Invalid token' });
    const userId = userRes.user.id;

    const { table = 'wb_sales', limit = '1000' } = req.query;
    const valid = ['wb_sales', 'wb_purchases', 'wb_stocks', 'wb_orders'];
    if (!valid.includes(String(table))) {
      return res.status(400).json({ error: 'Invalid table' });
    }

    const { data, error } = await admin
      .from(String(table))
      .select('*')
      .eq('user_id', userId)
      .limit(parseInt(String(limit)));

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ rows: data || [] });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}


