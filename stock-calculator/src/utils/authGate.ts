import type { Session } from '@supabase/supabase-js';

const parseList = (s?: string | null): string[] =>
  (s || '')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);

export const isUserAllowed = (session: Session | null): boolean => {
  if (!session) return false;
  const email = (session.user?.email || '').toLowerCase();
  if (!email) return false;

  const allowedEmails = parseList(process.env.REACT_APP_ALLOWED_EMAILS);
  const allowedDomains = parseList(process.env.REACT_APP_ALLOWED_DOMAINS);

  // If allow-lists are empty, allow everyone authenticated
  if (allowedEmails.length === 0 && allowedDomains.length === 0) return true;

  if (allowedEmails.includes(email)) return true;
  const domain = email.split('@')[1] || '';
  if (allowedDomains.includes(domain)) return true;

  return false;
};


