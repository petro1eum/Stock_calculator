import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE as string;
const admin = createClient(SUPABASE_URL as string, SERVICE_ROLE, { auth: { persistSession: false } });

// Convert any timestamp to Europe/Moscow week start (Mon 00:00 MSK)
function toWeekStartMSK(d: Date): number {
  const mskOffsetMin = 3 * 60; // UTC+3
  const utcMs = d.getTime();
  const mskMs = utcMs + mskOffsetMin * 60 * 1000;
  const m = new Date(mskMs);
  const day = m.getUTCDay();
  const diff = (day + 6) % 7; // Monday start
  m.setUTCDate(m.getUTCDate() - diff);
  m.setUTCHours(0, 0, 0, 0);
  return m.getTime() - mskOffsetMin * 60 * 1000; // return UTC ms aligned to MSK week start
}

function parseDateToUTC(ds: any): Date | null {
  if (!ds || typeof ds !== 'string') return null;
  // normalize common WB formats
  try {
    // If has trailing Z or timezone, Date can parse directly
    const d = new Date(ds);
    if (!isNaN(d.getTime())) return d;
  } catch {}
  try {
    const s = ds.slice(0, 19).replace(' ', 'T');
    const d = new Date(s + 'Z');
    if (!isNaN(d.getTime())) return d;
  } catch {}
  return null;
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
      weeks.push(toWeekStartMSK(new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000)));
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
    const seen = new Set<string>();
    for (const r of salesRows || []) {
      const raw: any = r.raw || {};
      const ds = raw.date || raw.acceptanceDate || raw.saleDt || raw.lastChangeDate;
      const d = parseDateToUTC(ds);
      if (!d) continue;
      // Exclude returns/negative payouts
      const forPay = Number(raw.forPay || 0);
      if (forPay < 0) continue;
      const t = d.getTime();
      const ws = toWeekStartMSK(new Date(t));
      const idx = weeks.indexOf(ws);
      if (idx < 0) continue;
      // Dedup by WB sale id if present
      const key = String(raw.srid || raw.saleID || raw.orderId || '') + '|' + (raw.barcode || '') + '|' + (raw.forPay || raw.totalPrice || 0) + '|' + (raw.priceWithDisc || raw.retailPrice || 0) + '|' + (ds || '');
      if (key.trim() && seen.has(key)) continue;
      if (key.trim()) seen.add(key);
      // Units
      let units = Number(raw.quantity || raw.qty || 0);
      if (!units || !isFinite(units)) {
        const revenue = Number(raw.forPay || raw.totalPrice || 0) || 0;
        const price1 = Number(raw.priceWithDisc || 0);
        const price2 = Number(raw.retailPrice || 0);
        const denom = price1 > 0 ? price1 : (price2 > 0 ? price2 : 0);
        if (revenue > 0 && denom > 0) units = Math.round(revenue / denom);
      }
      if (!isFinite(units)) units = 0;
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
      const d = parseDateToUTC(r.date);
      if (!d) continue;
      const t = d.getTime();
      if (!isFinite(t)) continue;
      const ws = toWeekStartMSK(new Date(t));
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
      weeksISO: weeks.map(ws => new Date(ws + 3*60*60*1000).toISOString().slice(0, 10)),
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


