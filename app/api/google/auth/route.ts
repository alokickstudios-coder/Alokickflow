import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Uses cookies and external network calls and must run dynamically.
export const dynamic = "force-dynamic";

import { getAppBaseUrl } from "@/lib/config/platform";

const APP_URL = getAppBaseUrl();
const REDIRECT_URI = `${APP_URL}/api/google/callback`;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createAdminClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

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
    } catch (adminError: any) {
      console.debug("[GoogleAuth] Admin client config lookup failed, trying server client:", adminError.message);
    }
  }

  // 2) Fallback: use authenticated server-side client with RLS (admins only)
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
  } catch (serverError: any) {
    console.debug("[GoogleAuth] Server client config lookup failed, using env vars:", serverError.message);
  }

  // 3) Final fallback: environment variables
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  };
}

export async function GET(request: NextRequest) {
  const { clientId } = await getGoogleConfig();

  if (!clientId) {
    return NextResponse.json(
      { 
        error: "Google Drive not configured",
        help: "Set Google OAuth credentials in Settings → Google Drive"
      },
      { status: 500 }
    );
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  console.log("Google Auth URL:", authUrl.toString());
  console.log("Redirect URI:", REDIRECT_URI);

  return NextResponse.redirect(authUrl.toString());
}
