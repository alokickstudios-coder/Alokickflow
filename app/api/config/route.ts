/**
 * Runtime Configuration API
 * 
 * This endpoint provides public configuration that the client needs at runtime.
 * This is essential for Docker deployments where NEXT_PUBLIC_* env vars
 * may not be available at build time.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Only expose PUBLIC configuration - never expose secrets
  return NextResponse.json({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "",
    // Add any other public config needed
  });
}
