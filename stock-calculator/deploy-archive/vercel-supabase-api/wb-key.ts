import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client (service role)
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE as string;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.warn('[wb-key] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
}

const admin = createClient(SUPABASE_URL as string, SERVICE_ROLE, { auth: { persistSession: false } });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Require auth token from client
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Resolve user from token
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes?.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const userId = userRes.user.id;

  if (req.method === 'POST') {
    const { wbApiKey } = req.body || {};
    if (!wbApiKey || typeof wbApiKey !== 'string') {
      return res.status(400).json({ error: 'wbApiKey is required' });
    }

    // Ensure table exists (best to manage via migration; no-op if already created)
    // Upsert secret
    const { error } = await admin
      .from('user_secrets')
      .upsert({ user_id: userId, wb_api_key: wbApiKey, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('user_secrets')
      .select('wb_api_key, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    const masked = data?.wb_api_key ? data.wb_api_key.replace(/.(?=.{4})/g, '*') : null;
    return res.status(200).json({ wbApiKeyMasked: masked, updated_at: data?.updated_at || null });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}


