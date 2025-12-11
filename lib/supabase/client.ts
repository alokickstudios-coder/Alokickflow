import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase Browser Client
 * 
 * For Docker deployments where NEXT_PUBLIC_* env vars may not be available
 * at build time, this client will use placeholder values during build
 * and the real values will be provided by the server at runtime.
 * 
 * IMPORTANT: For critical operations, always use API routes that use
 * the server-side admin client instead of this browser client.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Check if we have valid config (not empty and not placeholder)
function checkValidConfig(): boolean {
  return Boolean(
    supabaseUrl && 
    supabaseAnonKey && 
    !supabaseUrl.includes('placeholder') &&
    supabaseUrl.startsWith('https://')
  );
}

const hasValidConfig = checkValidConfig();

// Create the client - use placeholder during build if needed
// The app should use API routes for all critical operations anyway
export const supabase = createBrowserClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);

/**
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured(): boolean {
  return hasValidConfig;
}

/**
 * Validate Supabase config - throws if not configured
 */
export function validateSupabaseConfig(): void {
  if (!hasValidConfig) {
    console.warn(
      'Supabase client may not be properly configured. ' +
      'Use API routes for critical operations.'
    );
  }
}
