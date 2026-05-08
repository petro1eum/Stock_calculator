import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE as string;
const admin = createClient(SUPABASE_URL as string, SERVICE_ROLE, { auth: { persistSession: false } });

function toWeekStart(d: Date): number {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = (day + 6) % 7; // Monday week start (optional)
  dt.setDate(dt.getDate() - diff);
  dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

function corr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n <= 1) return 0;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const horizonWeeks = Number((req.query.horizonWeeks as string) || 26);

    // Resolve user id
    const pUserId = (req.query.user_id as string) || '';
    let userId = pUserId;
    if (!userId) {
      const { data: anyRow } = await admin.from('wb_stocks').select('user_id').limit(1).maybeSingle();
      userId = anyRow?.user_id || '';
    }
    if (!userId) return res.status(400).json({ error: 'No user_id' });

    // Load sales raw
    const { data: salesRows, error: salesErr } = await admin
      .from('wb_sales')
      .select('sku, raw')
      .eq('user_id', userId)
      .limit(500000);
    if (salesErr) return res.status(500).json({ error: salesErr.message });

    const now = new Date();
    const startTs = now.getTime() - horizonWeeks * 7 * 24 * 60 * 60 * 1000;
    const weekStarts: number[] = [];
    for (let w = horizonWeeks - 1; w >= 0; w--) {
      const t = toWeekStart(new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000));
      weekStarts.push(t);
    }

    const skuSet = new Set<string>();
    const perSkuSeries = new Map<string, number[]>();
    for (const ws of weekStarts) perSkuSeries.set('__template__', Array(horizonWeeks).fill(0));

    // Aggregate revenue per week per SKU
    for (const row of salesRows || []) {
      const sku = String(row.sku || '');
      if (!sku) continue;
      const raw = row.raw || {};
      const dateStr = raw.date || raw.acceptanceDate || raw.saleDt || raw.lastChangeDate;
      const t = dateStr ? new Date(dateStr).getTime() : NaN;
      if (!isFinite(t) || t < startTs) continue;
      const weekStart = toWeekStart(new Date(t));
      const idx = weekStarts.indexOf(weekStart);
      if (idx < 0) continue;
      const revenue = Number(raw.totalPrice ?? raw.forPay ?? 0) || 0;
      if (!perSkuSeries.has(sku)) perSkuSeries.set(sku, Array(horizonWeeks).fill(0));
      perSkuSeries.get(sku)![idx] += revenue;
      skuSet.add(sku);
    }

    const skus = Array.from(skuSet).sort();
    const series = skus.map(s => perSkuSeries.get(s) || Array(horizonWeeks).fill(0));
    // Build correlation matrix
    const matrix: number[][] = skus.map(() => Array(skus.length).fill(0));
    for (let i = 0; i < skus.length; i++) {
      for (let j = 0; j < skus.length; j++) {
        matrix[i][j] = i === j ? 1 : corr(series[i], series[j]);
      }
    }

    // Try to upsert into portfolio_cov (if table exists)
    try {
      await admin.from('portfolio_cov').upsert({
        user_id: userId,
        horizon_weeks: horizonWeeks,
        cov_type: 'correlation',
        skus,
        matrix,
        updated_at: new Date().toISOString()
      } as any, { onConflict: 'user_id,horizon_weeks,cov_type' } as any);
    } catch {}

    return res.status(200).json({ userId, horizonWeeks, skus, matrix });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}


