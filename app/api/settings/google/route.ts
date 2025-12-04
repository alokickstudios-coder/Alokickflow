import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createAdminClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const GLOBAL_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

// GET - Fetch current Google OAuth settings (masked)
export async function GET(request: NextRequest) {
  try {
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const { data, error } = await admin
      .from("app_settings")
      .select("google_client_id, google_client_secret, updated_at")
      .eq("id", GLOBAL_SETTINGS_ID)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = row not found
      console.error("Error fetching Google settings:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const clientId = data?.google_client_id || process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = data?.google_client_secret || process.env.GOOGLE_CLIENT_SECRET || "";

    const mask = (value: string) =>
      !value ? "" : `${value.slice(0, 4)}...${value.slice(-4)}`;

    return NextResponse.json({
      googleClientIdMasked: clientId ? mask(clientId) : null,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      updatedAt: data?.updated_at || null,
      // Do not send raw secrets
    });
  } catch (error: any) {
    console.error("Google settings GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load settings" },
      { status: 500 }
    );
  }
}

// POST - Update Google OAuth settings (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = getAdminClient();
    if (!admin || !supabaseUrl) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Get current user via server-side Supabase client (anon key)
    const serverClient = await createServerClient();
    const {
      data: { user },
    } = await serverClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can update Google OAuth settings" },
        { status: 403 }
      );
    }

    const { clientId, clientSecret } = await request.json();

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "clientId and clientSecret are required" },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from("app_settings")
      .upsert(
        {
          id: GLOBAL_SETTINGS_ID,
          google_client_id: clientId.trim(),
          google_client_secret: clientSecret.trim(),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("google_client_id, updated_at")
      .single();

    if (error) {
      console.error("Error updating Google settings:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      googleClientIdMasked: `${data.google_client_id.slice(0, 4)}...${data.google_client_id.slice(
        -4
      )}`,
      updatedAt: data.updated_at,
    });
  } catch (error: any) {
    console.error("Google settings POST error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update settings" },
      { status: 500 }
    );
  }
}


