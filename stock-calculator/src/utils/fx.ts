// Fetch FX rate to RUB from the Central Bank of Russia by date
// Returns RUB per 1 unit of currency (e.g., 1 USD -> X RUB)
export async function fetchCbrRateToRub(currency: string, dateISO: string): Promise<number | null> {
  const cur = currency?.toUpperCase();
  if (!cur || cur === 'RUB') return 1;

  // CBR archive path: https://www.cbr-xml-daily.ru/archive/YYYY/MM/DD/daily_json.js
  // Try up to 7 days back in case of weekends/holidays
  for (let back = 0; back < 7; back++) {
    const d = new Date(dateISO);
    d.setDate(d.getDate() - back);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const url = `https://www.cbr-xml-daily.ru/archive/${y}/${m}/${day}/daily_json.js`;
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) continue;
      const json = await res.json();
      const v = json?.Valute?.[cur];
      if (v && typeof v.Value === 'number' && typeof v.Nominal === 'number' && v.Nominal > 0) {
        // Value is for Nominal units; convert to per 1 unit
        const rate = v.Value / v.Nominal;
        // persist to Supabase fx_rates if available in runtime
        try {
          // @ts-ignore dynamic import to avoid circular deps
          const { supabase } = await import('../utils/supabaseClient');
          const dateOnly = d.toISOString().split('T')[0];
          await supabase
            .from('fx_rates')
            .upsert({ date: dateOnly, currency: cur, rate, source: 'CBR' }, { onConflict: 'date,currency' });
        } catch {}
        return rate;
      }
    } catch {
      // try previous day
    }
  }
  return null;
}


