import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName, organizationName } = await request.json();

    // Validate input
    if (!email || !password || !fullName || !organizationName) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getAdminClient();
    
    if (!supabaseAdmin) {
      return NextResponse.json(
        { 
          error: "Server configuration error",
          details: "SUPABASE_SERVICE_ROLE_KEY is not configured. Please contact the administrator."
        },
        { status: 500 }
      );
    }

    // Step 1: Try to create auth user using admin API
    let userId: string;
    
    try {
      // Try admin API first
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("No user returned");
      
      userId = authData.user.id;
    } catch (adminError: any) {
      console.log("Admin API error, trying signUp:", adminError.message);
      
      // Fallback to regular signUp
      const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (signUpError) {
        return NextResponse.json(
          { error: signUpError.message },
          { status: 400 }
        );
      }

      if (!signUpData.user) {
        return NextResponse.json(
          { error: "Failed to create user" },
          { status: 500 }
        );
      }

      userId = signUpData.user.id;
    }

    // Step 2: Create organization (service role bypasses RLS)
    const { data: orgData, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: organizationName,
        subscription_tier: "free",
      })
      .select()
      .single();

    if (orgError) {
      console.error("Org error:", orgError);
      // Try to clean up auth user
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (cleanupError: any) {
        console.warn("[Register] Failed to cleanup user after org creation error:", cleanupError.message);
      }
      return NextResponse.json(
        { error: "Failed to create organization: " + orgError.message },
        { status: 500 }
      );
    }

    // Step 3: Create profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        organization_id: orgData.id,
        role: "admin",
        full_name: fullName,
      });

    if (profileError) {
      console.error("Profile error:", profileError);
      // Try to clean up
      try {
        await supabaseAdmin.from("organizations").delete().eq("id", orgData.id);
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (cleanupError: any) {
        console.warn("[Register] Failed to cleanup after profile creation error:", cleanupError.message);
      }
      return NextResponse.json(
        { error: "Failed to create profile: " + profileError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: email,
      },
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: error.message || "Registration failed" },
      { status: 500 }
    );
  }
}
