import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    checks: {}
  };

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  results.checks.env = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? `✓ Set (${supabaseUrl.substring(0, 40)}...)` : "✗ Missing",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey ? `✓ Set (${supabaseAnonKey.substring(0, 20)}...)` : "✗ Missing",
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey ? `✓ Set (${supabaseServiceKey.substring(0, 20)}...)` : "✗ Missing",
  };

  // Check if keys look valid (Supabase keys are JWTs starting with 'eyJ')
  results.checks.keyFormat = {
    anonKeyFormat: supabaseAnonKey?.startsWith('eyJ') ? "✓ Valid JWT format" : "⚠ Not a standard JWT (should start with 'eyJ')",
    serviceKeyFormat: supabaseServiceKey?.startsWith('eyJ') ? "✓ Valid JWT format" : "⚠ Not a standard JWT (should start with 'eyJ')",
  };

  // Test database connection with anon key
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const anonClient = createClient(supabaseUrl, supabaseAnonKey);
      const { error } = await anonClient.from("profiles").select("count").limit(1);
      results.checks.anonConnection = error ? `✗ Failed: ${error.message}` : "✓ Connected";
    } catch (e: any) {
      results.checks.anonConnection = `✗ Error: ${e.message}`;
    }
  } else {
    results.checks.anonConnection = "✗ Cannot test - missing URL or anon key";
  }

  // Test database connection with service role key
  if (supabaseUrl && supabaseServiceKey) {
    try {
      const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      const { error } = await adminClient.from("profiles").select("count").limit(1);
      results.checks.serviceConnection = error ? `✗ Failed: ${error.message}` : "✓ Connected";

      // Test admin API access
      try {
        const { data, error: adminError } = await adminClient.auth.admin.listUsers({ perPage: 1 });
        results.checks.adminApiAccess = adminError 
          ? `✗ Failed: ${adminError.message}` 
          : `✓ Working (found ${data?.users?.length || 0} users)`;
      } catch (adminEx: any) {
        results.checks.adminApiAccess = `✗ Error: ${adminEx.message}`;
      }
    } catch (e: any) {
      results.checks.serviceConnection = `✗ Error: ${e.message}`;
      results.checks.adminApiAccess = "✗ Cannot test - service connection failed";
    }
  } else {
    results.checks.serviceConnection = "✗ Cannot test - missing URL or service key";
    results.checks.adminApiAccess = "✗ Cannot test - missing service key";
  }

  // Overall status
  const allPassed = Object.values(results.checks).every(
    (check) => typeof check === 'string' ? check.startsWith('✓') : Object.values(check as Record<string, string>).every(v => v.startsWith('✓'))
  );
  
  results.status = allPassed ? "All checks passed" : "Some checks failed - see details above";
  
  results.help = {
    message: "To fix issues, ensure your .env.local has these variables:",
    example: `
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    `.trim(),
    whereToFind: "Supabase Dashboard → Settings → API → Project API keys"
  };

  return NextResponse.json(results, { status: 200 });
}


