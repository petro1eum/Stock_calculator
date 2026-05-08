/* Refresh correlation matrix from wb_sales and upsert into portfolio_cov */
/* eslint-disable no-console */
const { createClient } = require('@supabase/supabase-js');

function toWeekStart(ts) {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = (day + 6) % 7; // Mon start
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function corr(a, b) {
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

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || 'YOUR_SUPABASE_URL_HERE';
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  if (!SERVICE_ROLE) {
    console.error('Missing SUPABASE_SERVICE_ROLE');
    process.exit(1);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const horizonWeeks = Number(process.env.HORIZON_WEEKS || 26);

  // Resolve user
  let userId = process.env.USER_ID || '';
  if (!userId) {
    const { data: anyRow, error } = await admin.from('wb_stocks').select('user_id').limit(1).maybeSingle();
    if (error) throw error;
    userId = anyRow?.user_id || '';
  }
  if (!userId) throw new Error('No user_id');

  const { data: salesRows, error: salesErr } = await admin
    .from('wb_sales')
    .select('sku, raw')
    .eq('user_id', userId)
    .limit(500000);
  if (salesErr) throw salesErr;

  const now = new Date();
  const startTs = now.getTime() - horizonWeeks * 7 * 24 * 60 * 60 * 1000;
  const weekStarts = [];
  for (let w = horizonWeeks - 1; w >= 0; w--) weekStarts.push(toWeekStart(now.getTime() - w * 7 * 24 * 60 * 60 * 1000));

  const skuSet = new Set();
  const perSkuSeries = new Map();

  for (const row of salesRows || []) {
    const sku = String(row.sku || '');
    if (!sku) continue;
    const raw = row.raw || {};
    const dateStr = raw.date || raw.acceptanceDate || raw.saleDt || raw.lastChangeDate;
    const t = dateStr ? new Date(dateStr).getTime() : NaN;
    if (!isFinite(t) || t < startTs) continue;
    const ws = toWeekStart(t);
    const idx = weekStarts.indexOf(ws);
    if (idx < 0) continue;
    const revenue = Number(raw.totalPrice ?? raw.forPay ?? 0) || 0;
    if (!perSkuSeries.has(sku)) perSkuSeries.set(sku, Array(horizonWeeks).fill(0));
    perSkuSeries.get(sku)[idx] += revenue;
    skuSet.add(sku);
  }

  const skus = Array.from(skuSet).sort();
  if (skus.length === 0) {
    console.log('No SKUs with sales in horizon');
    process.exit(0);
  }
  const series = skus.map(s => perSkuSeries.get(s) || Array(horizonWeeks).fill(0));
  const matrix = skus.map(() => Array(skus.length).fill(0));
  for (let i = 0; i < skus.length; i++) {
    for (let j = 0; j < skus.length; j++) matrix[i][j] = i === j ? 1 : corr(series[i], series[j]);
  }

  const { error: upErr } = await admin.from('portfolio_cov').upsert({
    user_id: userId,
    horizon_weeks: horizonWeeks,
    cov_type: 'correlation',
    skus,
    matrix,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,horizon_weeks,cov_type' });
  if (upErr) throw upErr;
  console.log(JSON.stringify({ ok: true, userId, horizonWeeks, skusCount: skus.length }));
}

main().catch((e) => { console.error(e); process.exit(1); });


