/*
  Directly fills wb_costs in Supabase via service role key, no frontend.
  Env required:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE
  Optional overrides (numbers):
    BAG_CNY_PER_UNIT (default 21)
    HEADPHONES_CNY_PER_UNIT (default 26)
    KEYCHAIN_CNY_PER_UNIT (default 25)
    BATCH_UNITS_BAGS (default 1171)
    BATCH_WEIGHT_BAGS_KG (default 382)
    USD_PER_KG (default 3)
    USER_ID (if omitted, will auto-detect first user from wb_stocks)
*/

/* eslint-disable no-console */
const { createClient } = require('@supabase/supabase-js');

async function fetchCbrRateToRub(cur) {
  try {
    const res = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
    if (!res.ok) return null;
    const j = await res.json();
    const v = j && j.Valute && j.Valute[cur];
    if (v && typeof v.Value === 'number' && typeof v.Nominal === 'number' && v.Nominal > 0) {
      return v.Value / v.Nominal;
    }
  } catch (e) {
    console.error('FX fetch error:', e.message);
  }
  return null;
}

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in env');
    process.exit(1);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const defaults = {
    bagCnyPerUnit: Number(process.env.BAG_CNY_PER_UNIT || 21),
    headphonesCnyPerUnit: Number(process.env.HEADPHONES_CNY_PER_UNIT || 26),
    keychainCnyPerUnit: Number(process.env.KEYCHAIN_CNY_PER_UNIT || 25),
    batchUnitsBags: Number(process.env.BATCH_UNITS_BAGS || 1171),
    batchWeightBagsKg: Number(process.env.BATCH_WEIGHT_BAGS_KG || 382),
    usdPerKg: Number(process.env.USD_PER_KG || 3),
  };

  let userId = process.env.USER_ID || null;
  if (!userId) {
    const { data: anyStock, error: e1 } = await admin
      .from('wb_stocks')
      .select('user_id')
      .limit(1)
      .maybeSingle();
    if (e1) {
      console.error('Error reading wb_stocks:', e1.message);
      process.exit(1);
    }
    userId = anyStock && anyStock.user_id ? anyStock.user_id : null;
  }
  if (!userId) {
    console.error('No USER_ID and cannot auto-detect from wb_stocks');
    process.exit(1);
  }

  const [cnyRub, usdRub] = await Promise.all([
    fetchCbrRateToRub('CNY'),
    fetchCbrRateToRub('USD')
  ]);

  const skus = new Set();
  const subjBySku = new Map();
  const nameBySku = new Map();
  const add = (row) => { const s = String(row.sku || row.nm_id || row.nmId || row.nmid || ''); if (s) skus.add(s); };

  const { data: stocks, error: eStocks } = await admin
    .from('wb_stocks')
    .select('sku, raw')
    .eq('user_id', userId)
    .limit(50000);
  if (eStocks) {
    console.error('Stocks read error:', eStocks.message);
    process.exit(1);
  }
  (stocks || []).forEach(r => {
    add(r);
    const sku = String(r.sku || '');
    const subj = r.raw && r.raw.subject; if (subj && !subjBySku.has(sku)) subjBySku.set(sku, String(subj));
    const vendor = (r.raw && (r.raw.vendorCode || r.raw.supplierArticle || r.raw.name)); if (vendor && !nameBySku.has(sku)) nameBySku.set(sku, String(vendor));
  });

  const { data: an, error: eAn } = await admin
    .from('wb_analytics')
    .select('nm_id, raw')
    .eq('user_id', userId)
    .limit(50000);
  if (eAn) {
    console.error('Analytics read error:', eAn.message);
    process.exit(1);
  }
  (an || []).forEach(r => {
    const sku = String(r.nm_id || ''); add({ sku });
    const subj = r.raw && r.raw.object && r.raw.object.name; if (subj && !subjBySku.has(sku)) subjBySku.set(sku, String(subj));
    const vendor = r.raw && (r.raw.vendorCode || r.raw.supplierArticle || r.raw.name); if (vendor && !nameBySku.has(sku)) nameBySku.set(sku, String(vendor));
  });

  const { data: sales, error: eSales } = await admin
    .from('wb_sales')
    .select('sku, raw')
    .eq('user_id', userId)
    .limit(50000);
  if (eSales) {
    console.error('Sales read error:', eSales.message);
    process.exit(1);
  }
  (sales || []).forEach(r => {
    add(r);
    const sku = String(r.sku || '');
    const subj = r.raw && r.raw.subject; if (subj && !subjBySku.has(sku)) subjBySku.set(sku, String(subj));
    const vendor = r.raw && (r.raw.supplierArticle || r.raw.vendorCode || r.raw.name); if (vendor && !nameBySku.has(sku)) nameBySku.set(sku, String(vendor));
  });

  const logisticsPerUnitUsdBags = defaults.usdPerKg * (defaults.batchWeightBagsKg / Math.max(1, defaults.batchUnitsBags));
  const today = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';
  const rows = [];

  skus.forEach((sku) => {
    const subj = (subjBySku.get(sku) || '').toLowerCase();
    const name = (nameBySku.get(sku) || '').toLowerCase();
    const text = `${subj} ${name}`;
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

  if (rows.length === 0) {
    console.log(JSON.stringify({ ok: true, inserted: 0 }));
    return;
  }

  const { error: upErr } = await admin.from('wb_costs').upsert(rows, { onConflict: 'user_id,date,sku' });
  if (upErr) {
    console.error('Upsert error:', upErr.message);
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, inserted: rows.length, fx: { CNY: cnyRub, USD: usdRub } }));
}

main().catch((e) => { console.error(e); process.exit(1); });


