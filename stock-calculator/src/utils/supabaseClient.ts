import { createClient } from '@supabase/supabase-js';

// Prefer env; fallback to provided public anon key and URL for convenience
const FALLBACK_URL = 'https://fijmafxinhnvpytngzsu.supabase.co';
const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpam1hZnhpbmhudnB5dG5nenN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3NjA4NjYsImV4cCI6MjA2NzMzNjg2Nn0.za6-3Y5R7bT_xEZ_xME4au6UOTY5K72U-G6uT12cX5M';

const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL as string) || FALLBACK_URL;
const supabaseAnonKey = (process.env.REACT_APP_SUPABASE_ANON_KEY as string) || FALLBACK_ANON;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


