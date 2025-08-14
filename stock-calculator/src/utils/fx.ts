// Fetch FX rate to RUB from the Central Bank of Russia by date
// Returns RUB per 1 unit of currency (e.g., 1 USD -> X RUB)
export async function fetchCbrRateToRub(currency: string, dateISO: string): Promise<number | null> {
  const cur = currency?.toUpperCase();
  if (!cur || cur === 'RUB') return 1;
  try {
    const url = `/api/fx?currency=${encodeURIComponent(cur)}&dateISO=${encodeURIComponent(dateISO)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j?.rate === 'number' ? j.rate : null;
  } catch { return null; }
}


