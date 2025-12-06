import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  // During build, we allow missing env vars to prevent build failures
  // At runtime, this will be caught and handled by error boundaries
  if (typeof window === 'undefined') {
    // Server-side: create a client that will fail gracefully
    // This allows the build to complete
    console.warn('Supabase environment variables are missing. The app will not function correctly at runtime.');
  }
}

// Create client with actual values or placeholders for build
// Runtime validation will happen when the client is actually used
export const supabase = createBrowserClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// Runtime validation helper
export function validateSupabaseConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase configuration is missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
    );
  }
}

