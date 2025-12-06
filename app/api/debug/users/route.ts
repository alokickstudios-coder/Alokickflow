import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: "Missing Supabase credentials" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // List existing users
  try {
    const { data: users, error } = await supabase.auth.admin.listUsers();
    results.existingUsers = error 
      ? { error: error.message }
      : { count: users?.users?.length || 0, users: users?.users?.map(u => ({ id: u.id, email: u.email })) };
  } catch (e: any) {
    results.existingUsers = { error: e.message };
  }

  // List existing organizations
  try {
    const { data: orgs, error } = await supabase.from("organizations").select("id, name");
    results.organizations = error ? { error: error.message } : orgs;
  } catch (e: any) {
    results.organizations = { error: e.message };
  }

  // List existing profiles
  try {
    const { data: profiles, error } = await supabase.from("profiles").select("id, full_name, role, organization_id");
    results.profiles = error ? { error: error.message } : profiles;
  } catch (e: any) {
    results.profiles = { error: e.message };
  }

  // Try to create a test user with a unique email to see the exact error
  const testEmail = `test-${Date.now()}@alokickflow.local`;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: "TestPassword123!",
      email_confirm: true,
    });
    
    if (error) {
      results.createUserTest = { 
        status: "failed", 
        error: error.message,
        code: (error as any).code,
        details: JSON.stringify(error)
      };
    } else {
      results.createUserTest = { 
        status: "success", 
        userId: data.user?.id 
      };
      // Clean up - delete the test user
      if (data.user?.id) {
        await supabase.auth.admin.deleteUser(data.user.id);
        results.createUserTest.cleanup = "deleted";
      }
    }
  } catch (e: any) {
    results.createUserTest = { 
      status: "exception", 
      error: e.message,
      stack: e.stack?.substring(0, 500)
    };
  }

  return NextResponse.json(results, { status: 200 });
}




