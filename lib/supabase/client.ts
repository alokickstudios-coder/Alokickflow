import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Only create client if env vars are available (prevents build-time errors)
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : createBrowserClient('https://placeholder.supabase.co', 'placeholder-key');

