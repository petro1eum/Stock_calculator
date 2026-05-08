/**
 * Единая точка для URL локального/удалённого API.
 * В dev с proxy CRA достаточно относительных путей (/api/...).
 * Для статической сборки без proxy: REACT_APP_API_BASE=http://127.0.0.1:3001
 */
export function getApiBaseUrl(): string {
  const raw = process.env.REACT_APP_API_BASE;
  return typeof raw === 'string' ? raw.replace(/\/$/, '') : '';
}

export function apiUrl(path: string): string {
  let p = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${p}` : p;
}
