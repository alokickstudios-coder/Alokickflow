import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const diagnostics: Record<string, any> = {
    hasUrl: !!supabaseUrl,
    hasAnon: !!anonKey,
    hasService: !!serviceKey,
  };

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing Supabase URL or anon key",
        diagnostics,
      },
      { status: 500 }
    );
  }

  try {
    const client = createClient(supabaseUrl, serviceKey || anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Lightweight connectivity check
    const { error } = await client
      .from("organizations")
      .select("id")
      .limit(1);

    diagnostics.dbReachable = !error;
    diagnostics.dbError = error?.message || null;

    return NextResponse.json({
      ok: !error,
      diagnostics,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message, diagnostics },
      { status: 500 }
    );
  }
}



