import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE as string;
const admin = createClient(SUPABASE_URL as string, SERVICE_ROLE, { auth: { persistSession: false } });

function toWeekStart(d: Date): number {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = (day + 6) % 7; // Monday start
  dt.setDate(dt.getDate() - diff);
  dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sku = String(req.query.sku || '').trim();
    const horizon = Number(req.query.weeks || 26);
    if (!sku) return res.status(400).json({ error: 'sku is required' });

    // Resolve user
    let userId = String(req.query.user_id || '');
    if (!userId) {
      const { data: anyRow } = await admin.from('wb_stocks').select('user_id').limit(1).maybeSingle();
      userId = anyRow?.user_id || '';
    }
    if (!userId) return res.status(400).json({ error: 'No user_id' });

    const now = new Date();
    const weeks: number[] = [];
    for (let w = horizon - 1; w >= 0; w--) {
      weeks.push(toWeekStart(new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000)));
    }

    // Load sales
    const { data: salesRows, error: sErr } = await admin
      .from('wb_sales')
      .select('raw')
      .eq('user_id', userId)
      .eq('sku', sku)
      .limit(500000);
    if (sErr) return res.status(500).json({ error: sErr.message });

    const salesBuckets = Array(horizon).fill(0);
    for (const r of salesRows || []) {
      const raw: any = r.raw || {};
      const ds = raw.date || raw.acceptanceDate || raw.saleDt || raw.lastChangeDate;
      if (!ds) continue;
      const t = new Date(ds).getTime();
      if (!isFinite(t)) continue;
      const ws = toWeekStart(new Date(t));
      const idx = weeks.indexOf(ws);
      if (idx < 0) continue;
      let units = Number(raw.quantity || 0);
      if (!units) {
        const revenue = Number(raw.totalPrice || raw.forPay || 0) || 0;
        const price = Number(raw.retailPrice || raw.priceWithDisc || 0) || 0;
        if (revenue > 0 && price > 0) units = revenue / price;
      }
      salesBuckets[idx] += Math.max(0, units);
    }

    // Load stocks (availability)
    const { data: stockRows, error: kErr } = await admin
      .from('wb_stocks')
      .select('date, quantity')
      .eq('user_id', userId)
      .eq('sku', sku)
      .limit(500000);
    if (kErr) return res.status(500).json({ error: kErr.message });

    const availDays = Array(horizon).fill(0);
    const daysCount = Array(horizon).fill(0);
    for (const r of stockRows || []) {
      const t = new Date(r.date).getTime();
      if (!isFinite(t)) continue;
      const ws = toWeekStart(new Date(t));
      const idx = weeks.indexOf(ws);
      if (idx < 0) continue;
      availDays[idx] += (Number(r.quantity || 0) > 0) ? 1 : 0;
      daysCount[idx] += 1;
    }

    // Compute stats
    const availability = availDays.map((n, i) => {
      const d = daysCount[i] || 0;
      return d > 0 ? Math.min(1, Math.max(0, n / d)) : 1;
    });
    const adjusted = salesBuckets.map((s, i) => {
      if ((daysCount[i] || 0) === 0) return s; // no info, leave as-is
      const a = Math.max(0.05, availability[i]);
      return s / a;
    });

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    const mu = mean(adjusted);
    const muRaw = mean(salesBuckets);
    const variance = adjusted.length > 1 ? adjusted.reduce((acc, x) => acc + (x - mu) ** 2, 0) / (adjusted.length - 1) : 0;
    const sigma = Math.sqrt(Math.max(0, variance));
    const varRaw = salesBuckets.length > 1 ? salesBuckets.reduce((acc, x) => acc + (x - muRaw) ** 2, 0) / (salesBuckets.length - 1) : 0;
    const sigmaRaw = Math.sqrt(Math.max(0, varRaw));

    return res.status(200).json({
      sku,
      weeksISO: weeks.map(ws => new Date(ws).toISOString().slice(0, 10)),
      units: salesBuckets,
      availability,
      adjustedUnits: adjusted,
      muWeek: mu,
      sigmaWeek: sigma,
      muWeekRaw: muRaw,
      sigmaWeekRaw: sigmaRaw
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}


