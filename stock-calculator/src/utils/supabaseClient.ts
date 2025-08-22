import { createClient } from '@supabase/supabase-js';

// Prefer env; fallback to provided public anon key and URL for convenience
// ⚠️ SECURITY: URL fallback removed - use environment variables only
const FALLBACK_URL = process.env.REACT_APP_SUPABASE_URL || '';
// ⚠️ SECURITY: Fallback removed - use environment variables only
const FALLBACK_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL as string) || FALLBACK_URL;
const supabaseAnonKey = (process.env.REACT_APP_SUPABASE_ANON_KEY as string) || FALLBACK_ANON;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


