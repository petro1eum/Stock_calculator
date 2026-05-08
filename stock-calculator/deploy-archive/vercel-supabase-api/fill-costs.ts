import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE as string;
const admin = createClient(SUPABASE_URL as string, SERVICE_ROLE, { auth: { persistSession: false } });

async function fetchCbrRateToRub(cur: 'USD'|'CNY'|'EUR'): Promise<number|null> {
  try {
    const res = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
    if (!res.ok) return null;
    const j = await res.json();
    const v = j?.Valute?.[cur];
    if (v && typeof v.Value === 'number' && typeof v.Nominal === 'number' && v.Nominal > 0) return v.Value / v.Nominal;
  } catch {}
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    let userId: string | null = null;
    if (token) {
      const { data: userRes } = await admin.auth.getUser(token);
      userId = userRes?.user?.id || null;
    }
    // Fallback: если нет токена — берем первого пользователя из wb_stocks
    if (!userId) {
      const { data: anyStock } = await admin
        .from('wb_stocks')
        .select('user_id')
        .limit(1)
        .maybeSingle();
      userId = anyStock?.user_id || null;
    }
    if (!userId) return res.status(401).json({ error: 'No user context' });

    // Defaults and optional overrides
    const params = req.method === 'POST' ? (req.body || {}) as any : (req.query || {}) as any;
    const defaults = {
      bagCnyPerUnit: typeof params.bagCnyPerUnit === 'number' ? params.bagCnyPerUnit : 21,
      headphonesCnyPerUnit: typeof params.headphonesCnyPerUnit === 'number' ? params.headphonesCnyPerUnit : 26,
      keychainCnyPerUnit: typeof params.keychainCnyPerUnit === 'number' ? params.keychainCnyPerUnit : 25,
      batchUnitsBags: typeof params.batchUnitsBags === 'number' ? params.batchUnitsBags : 1171,
      batchWeightBagsKg: typeof params.batchWeightBagsKg === 'number' ? params.batchWeightBagsKg : 382,
      usdPerKg: typeof params.usdPerKg === 'number' ? params.usdPerKg : 3,
    };

    // FX
    const [cnyRub, usdRub] = await Promise.all([
      fetchCbrRateToRub('CNY'),
      fetchCbrRateToRub('USD')
    ]);

    // Get SKUs and subjects
    const skus = new Set<string>();
    const subjBySku = new Map<string, string>();
    const nameBySku = new Map<string, string>();
    const add = (row: any) => { const s = String(row.sku || row.nm_id || row.nmId || row.nmid); if (s) skus.add(s); };

    const { data: stocks } = await admin.from('wb_stocks').select('sku, raw').eq('user_id', userId).limit(50000);
    (stocks || []).forEach(r => { 
      add(r); 
      const sku = String(r.sku);
      const subj = r.raw?.subject; if (subj && !subjBySku.has(sku)) subjBySku.set(sku, String(subj));
      const vendor = r.raw?.vendorCode || r.raw?.supplierArticle || r.raw?.name; if (vendor && !nameBySku.has(sku)) nameBySku.set(sku, String(vendor));
    });
    const { data: an } = await admin.from('wb_analytics').select('nm_id, raw').eq('user_id', userId).limit(50000);
    (an || []).forEach(r => { 
      const sku = String(r.nm_id); 
      add({ sku }); 
      const subj = r.raw?.object?.name; if (subj && !subjBySku.has(sku)) subjBySku.set(sku, String(subj)); 
      const vendor = r.raw?.vendorCode || r.raw?.supplierArticle || r.raw?.name; if (vendor && !nameBySku.has(sku)) nameBySku.set(sku, String(vendor));
    });
    const { data: sales } = await admin.from('wb_sales').select('sku, raw').eq('user_id', userId).limit(50000);
    (sales || []).forEach(r => { 
      add(r); 
      const sku = String(r.sku);
      const subj = r.raw?.subject; if (subj && !subjBySku.has(sku)) subjBySku.set(sku, String(subj)); 
      const vendor = r.raw?.supplierArticle || r.raw?.vendorCode || r.raw?.name; if (vendor && !nameBySku.has(sku)) nameBySku.set(sku, String(vendor));
    });

    // Compute logistics per unit for bags
    const logisticsPerUnitUsdBags = defaults.usdPerKg * (defaults.batchWeightBagsKg / Math.max(1, defaults.batchUnitsBags));

    const today = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';
    const rows: any[] = [];
    skus.forEach((sku) => {
      const subj = (subjBySku.get(sku) || '').toLowerCase();
      const name = (nameBySku.get(sku) || '').toLowerCase();
      const text = `${subj} ${name}`;
      // bags
      if (text.includes('сумк') || text.includes('кроссбоди') || text.includes('bag')) {
        rows.push({
          user_id: userId,
          date: today,
          sku,
          purchase_amount: defaults.bagCnyPerUnit,
          purchase_currency: 'CNY',
          logistics_amount: logisticsPerUnitUsdBags,
          logistics_currency: 'USD',
          fx_rate: cnyRub || null
        });
        return;
      }
      // headphones
      if (text.includes('наушник') || text.includes('headphone')) {
        rows.push({
          user_id: userId,
          date: today,
          sku,
          purchase_amount: defaults.headphonesCnyPerUnit,
          purchase_currency: 'CNY',
          logistics_amount: null,
          logistics_currency: null,
          fx_rate: cnyRub || null
        });
        return;
      }
      // keychains / брелоки / обвес
      if (text.includes('брелок') || text.includes('брелоки') || text.includes('keychain') || text.includes('обвес')) {
        rows.push({
          user_id: userId,
          date: today,
          sku,
          purchase_amount: defaults.keychainCnyPerUnit,
          purchase_currency: 'CNY',
          logistics_amount: null,
          logistics_currency: null,
          fx_rate: cnyRub || null
        });
        return;
      }
    });

    if (rows.length === 0) return res.status(200).json({ ok: true, inserted: 0 });

    const { error } = await admin.from('wb_costs').upsert(rows, { onConflict: 'user_id,date,sku' as any });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, inserted: rows.length, fx: { CNY: cnyRub, USD: usdRub } });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}


