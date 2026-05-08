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
    const currency = String(req.query.currency || '').toUpperCase();
    const dateISO = String(req.query.dateISO || new Date().toISOString());
    if (!currency) return res.status(400).json({ error: 'currency required' });

    // try cache in fx_rates
    try {
      const dateOnly = dateISO.split('T')[0];
      const { data } = await admin
        .from('fx_rates')
        .select('rate')
        .eq('currency', currency)
        .eq('date', dateOnly)
        .maybeSingle();
      if (data?.rate) return res.status(200).json({ rate: data.rate, source: 'cache' });
    } catch {}

    // query CBR archive up to 7 days back
    for (let back = 0; back < 7; back++) {
      const d = new Date(dateISO);
      d.setDate(d.getDate() - back);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const url = `https://www.cbr-xml-daily.ru/archive/${y}/${m}/${day}/daily_json.js`;
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!r.ok) continue;
        const j = await r.json();
        const v = j?.Valute?.[currency];
        if (v && typeof v.Value === 'number' && typeof v.Nominal === 'number' && v.Nominal > 0) {
          const rate = v.Value / v.Nominal;
          try {
            const dateOnly = d.toISOString().split('T')[0];
            await admin.from('fx_rates').upsert({ date: dateOnly, currency, rate, source: 'CBR' }, { onConflict: 'date,currency' });
          } catch {}
          return res.status(200).json({ rate, source: 'CBR', date: `${y}-${m}-${day}` });
        }
      } catch {}
    }
    return res.status(404).json({ error: 'Rate not found' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}


