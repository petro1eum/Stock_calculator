import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE as string;
const admin = createClient(SUPABASE_URL as string, SERVICE_ROLE, { auth: { persistSession: false } });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const horizon = Number((req.query.weeks as string) || 26);
    // Список SKU пользователя
    const { data: skuRows, error: skuErr } = await admin
      .from('wb_sales')
      .select('sku, user_id')
      .limit(500000);
    if (skuErr) return res.status(500).json({ error: skuErr.message });
    const byUser = new Map<string, Set<string>>();
    for (const r of skuRows || []) {
      const u = String(r.user_id);
      const s = String(r.sku);
      if (!byUser.has(u)) byUser.set(u, new Set());
      byUser.get(u)!.add(s);
    }

    // Для каждого user_id и sku — дергаем локальный endpoint weekly-stats и апсертим в таблицу
    let inserted = 0;
    for (const [userId, skus] of byUser.entries()) {
      for (const sku of skus) {
        try {
          const resp = await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''}/api/weekly-stats?sku=${encodeURIComponent(sku)}&weeks=${horizon}&user_id=${userId}`);
          if (!resp.ok) continue;
          const j = await resp.json();
          await admin.from('wb_weekly_stats').upsert({
            user_id: userId,
            sku,
            horizon_weeks: horizon,
            mu_week: j.muWeek || 0,
            sigma_week: j.sigmaWeek || 0,
            mu_week_raw: j.muWeekRaw || 0,
            sigma_week_raw: j.sigmaWeekRaw || 0,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,sku,horizon_weeks' } as any);
          inserted++;
        } catch {}
      }
    }
    return res.status(200).json({ ok: true, horizonWeeks: horizon, updated: inserted });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}


