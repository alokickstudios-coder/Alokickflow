import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Uses cookies and external network calls and must run dynamically.
export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const REDIRECT_URI = `${APP_URL}/api/google/callback`;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createAdminClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getGoogleConfig() {
  // 1) Try app_settings via service-role admin client
  const admin = getAdminClient();
  if (admin) {
    try {
      const { data } = await admin
        .from("app_settings")
        .select("google_client_id, google_client_secret")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .single();

      if (data?.google_client_id && data?.google_client_secret) {
        return {
          clientId: data.google_client_id,
          clientSecret: data.google_client_secret,
        };
      }
    } catch {
      // fall through
    }
  }

  // 2) Fallback: use authenticated server-side client with RLS
  try {
    const serverClient = await createServerClient();
    const { data, error } = await serverClient
      .from("app_settings")
      .select("google_client_id, google_client_secret")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    if (!error && data?.google_client_id && data?.google_client_secret) {
      return {
        clientId: data.google_client_id,
        clientSecret: data.google_client_secret,
      };
    }
  } catch {
    // ignore and use env
  }

  // 3) Final fallback: environment variables
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  console.log("Google callback received:", { code: code?.substring(0, 20), error });

  if (error) {
    console.error("Google auth error:", error);
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?error=google_auth_failed&details=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?error=no_code`
    );
  }

  const { clientId, clientSecret } = await getGoogleConfig();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?error=google_not_configured`
    );
  }

  try {
    console.log("Exchanging code for tokens...");
    console.log("Using redirect URI:", REDIRECT_URI);
    
    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResponse.json();
    console.log("Token response status:", tokenResponse.status);

    if (tokens.error) {
      console.error("Token exchange error:", tokens);
      throw new Error(tokens.error_description || tokens.error);
    }

    console.log("Tokens received successfully");

    // Store tokens in cookies
    const cookieStore = await cookies();
    
    cookieStore.set("google_access_token", tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: tokens.expires_in || 3600,
      path: "/",
      sameSite: "lax",
    });

    if (tokens.refresh_token) {
      cookieStore.set("google_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: "/",
        sameSite: "lax",
      });
    }

    // Also store in database if available
    const supabase = getAdminClient();
    if (supabase) {
      // Get the authenticated user from cookies/session if possible
      // For now, store globally (in production, associate with user)
      try {
        await supabase.from("google_tokens").upsert({
          id: "default",
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
          created_at: new Date().toISOString(),
        });
      } catch (dbError) {
        console.log("Could not store tokens in database (table may not exist):", dbError);
      }
    }

    // Get user info for display
    let userEmail = "";
    try {
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = await userInfoResponse.json();
      userEmail = userInfo.email || "";
      console.log("Connected as:", userEmail);
    } catch (e) {
      console.log("Could not fetch user info");
    }

    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?google=connected&email=${encodeURIComponent(userEmail)}`
    );
  } catch (error: any) {
    console.error("Google auth error:", error);
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?error=${encodeURIComponent(error.message || "auth_failed")}`
    );
  }
}
