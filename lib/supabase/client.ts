import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Runtime config cache
let runtimeConfig: { supabaseUrl: string; supabaseAnonKey: string } | null = null;
let supabaseInstance: SupabaseClient | null = null;
let configPromise: Promise<{ supabaseUrl: string; supabaseAnonKey: string }> | null = null;

/**
 * Fetch runtime configuration from the server
 * This is needed for Docker deployments where env vars aren't available at build time
 */
async function fetchRuntimeConfig(): Promise<{ supabaseUrl: string; supabaseAnonKey: string }> {
  if (runtimeConfig) {
    return runtimeConfig;
  }

  // First try build-time env vars
  const buildTimeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const buildTimeKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (buildTimeUrl && buildTimeKey && !buildTimeUrl.includes('placeholder')) {
    runtimeConfig = { supabaseUrl: buildTimeUrl, supabaseAnonKey: buildTimeKey };
    return runtimeConfig;
  }

  // Fetch from runtime config API
  if (typeof window !== 'undefined') {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const config = await response.json();
        if (config.supabaseUrl && config.supabaseAnonKey) {
          runtimeConfig = {
            supabaseUrl: config.supabaseUrl,
            supabaseAnonKey: config.supabaseAnonKey,
          };
          return runtimeConfig;
        }
      }
    } catch (error) {
      console.error('Failed to fetch runtime config:', error);
    }
  }

  // Fallback to build-time values (may be placeholders)
  runtimeConfig = {
    supabaseUrl: buildTimeUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey: buildTimeKey || 'placeholder-key',
  };
  return runtimeConfig;
}

/**
 * Get or create the Supabase client
 * Uses singleton pattern to avoid creating multiple instances
 */
export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const config = await fetchRuntimeConfig();
  supabaseInstance = createBrowserClient(config.supabaseUrl, config.supabaseAnonKey);
  return supabaseInstance;
}

/**
 * Get config - ensures we only fetch once
 */
export function getRuntimeConfig(): Promise<{ supabaseUrl: string; supabaseAnonKey: string }> {
  if (!configPromise) {
    configPromise = fetchRuntimeConfig();
  }
  return configPromise;
}

/**
 * Synchronous Supabase client for backward compatibility
 * Uses build-time env vars or fetches config on first use
 * 
 * WARNING: This may use placeholder values if runtime config hasn't loaded yet.
 * For critical operations, use getSupabaseClient() instead.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Create a proxy that lazily initializes the real client
let _lazyClient: SupabaseClient | null = null;

function getLazyClient(): SupabaseClient {
  if (_lazyClient) return _lazyClient;
  
  // Use build-time values if available and valid
  if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder')) {
    _lazyClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
    return _lazyClient;
  }
  
  // Use cached runtime config if available
  if (runtimeConfig) {
    _lazyClient = createBrowserClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey);
    return _lazyClient;
  }
  
  // Create with placeholders (will be replaced when config loads)
  _lazyClient = createBrowserClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key'
  );
  
  // Trigger async config fetch to update for future calls
  if (typeof window !== 'undefined') {
    getRuntimeConfig().then(() => {
      if (runtimeConfig && runtimeConfig.supabaseUrl !== 'https://placeholder.supabase.co') {
        _lazyClient = createBrowserClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey);
        supabaseInstance = _lazyClient;
      }
    });
  }
  
  return _lazyClient;
}

// Export a getter that returns the lazy client
export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    const client = getLazyClient();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});

// Runtime validation helper
export function validateSupabaseConfig() {
  const url = runtimeConfig?.supabaseUrl || supabaseUrl;
  const key = runtimeConfig?.supabaseAnonKey || supabaseAnonKey;
  
  if (!url || !key || url.includes('placeholder')) {
    throw new Error(
      'Supabase configuration is missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
    );
  }
}

/**
 * Initialize Supabase client with runtime config
 * Call this early in your app (e.g., in a provider or layout)
 */
export async function initializeSupabase(): Promise<SupabaseClient> {
  await getRuntimeConfig();
  return getSupabaseClient();
}
