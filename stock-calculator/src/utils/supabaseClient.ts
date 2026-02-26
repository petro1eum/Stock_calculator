import { createClient } from '@supabase/supabase-js';

// Prevent crash if env vars are missing (e.g. public deployment without database)
const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL as string) || 'https://dummy.supabase.co';
const supabaseAnonKey = (process.env.REACT_APP_SUPABASE_ANON_KEY as string) || 'dummy_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
