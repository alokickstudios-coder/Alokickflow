import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    tests: {}
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: "Missing Supabase credentials" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const testEmail = `vendor-${Date.now()}@alokickflow.local`;

  // Test 1: Create user with email_confirm: false
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: "TestPassword123!",
      email_confirm: false, // Don't require email confirmation
    });
    
    results.tests.noEmailConfirm = error 
      ? { status: "failed", error: error.message }
      : { status: "success", userId: data.user?.id };

    // Cleanup
    if (data?.user?.id) {
      await supabase.auth.admin.deleteUser(data.user.id);
      results.tests.noEmailConfirm.cleanup = "deleted";
    }
  } catch (e: any) {
    results.tests.noEmailConfirm = { status: "exception", error: e.message };
  }

  // Test 2: Create user with different email domain
  const testEmail2 = `vendor-${Date.now()}@example.com`;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: testEmail2,
      password: "TestPassword123!",
      email_confirm: true,
    });
    
    results.tests.exampleDomain = error 
      ? { status: "failed", error: error.message }
      : { status: "success", userId: data.user?.id };

    if (data?.user?.id) {
      await supabase.auth.admin.deleteUser(data.user.id);
      results.tests.exampleDomain.cleanup = "deleted";
    }
  } catch (e: any) {
    results.tests.exampleDomain = { status: "exception", error: e.message };
  }

  // Test 3: Create user with user_metadata
  const testEmail3 = `vendor-${Date.now()}@test.local`;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: testEmail3,
      password: "TestPassword123!",
      email_confirm: false,
      user_metadata: {
        full_name: "Test Vendor",
      },
    });
    
    results.tests.withMetadata = error 
      ? { status: "failed", error: error.message }
      : { status: "success", userId: data.user?.id };

    if (data?.user?.id) {
      await supabase.auth.admin.deleteUser(data.user.id);
      results.tests.withMetadata.cleanup = "deleted";
    }
  } catch (e: any) {
    results.tests.withMetadata = { status: "exception", error: e.message };
  }

  // Test 4: Check auth.users table directly
  try {
    const { data, error } = await supabase.rpc('get_auth_users_count');
    results.tests.authUsersRpc = error 
      ? { status: "failed", error: error.message, note: "RPC function might not exist" }
      : { status: "success", data };
  } catch (e: any) {
    results.tests.authUsersRpc = { status: "exception", error: e.message };
  }

  // Check Supabase project settings
  results.projectUrl = supabaseUrl;
  results.recommendation = results.tests.noEmailConfirm?.status === "success" 
    ? "Try disabling email confirmation requirement"
    : "Check Supabase Dashboard → Authentication → Settings for any restrictions or required configurations";

  return NextResponse.json(results, { status: 200 });
}




