/**
 * Creative QC (SPI) Status API
 * 
 * GET - Check Creative QC provider configuration status
 * 
 * Returns status of:
 * - Groq Whisper (transcription)
 * - DeepSeek (SPI analysis)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCreativeQCProviderStatus } from "@/lib/services/spi/engine";
import { isProviderConfigured } from "@/lib/services/spi/providers";

/**
 * GET /api/qc/creative/status
 * 
 * Returns provider configuration status for diagnostics
 */
export async function GET(request: NextRequest) {
  try {
    const supabase: SupabaseClient = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get provider status
    const providerStatus = getCreativeQCProviderStatus();
    const configCheck = isProviderConfigured();

    // Get environment variable status (without revealing values)
    const envStatus = {
      GROQ_API_KEY: !!process.env.GROQ_API_KEY,
      GROQ_API_BASE: process.env.GROQ_API_BASE || "(default: https://api.groq.com/openai/v1)",
      GROQ_WHISPER_MODEL: process.env.GROQ_WHISPER_MODEL || "(default: whisper-large-v3-turbo)",
      DEEPSEEK_API_KEY: !!process.env.DEEPSEEK_API_KEY,
      DEEPSEEK_API_BASE: process.env.DEEPSEEK_API_BASE || "(default: https://api.deepseek.com/v1)",
      DEEPSEEK_MODEL_NAME: process.env.DEEPSEEK_MODEL_NAME || "(default: deepseek-chat)",
    };

    return NextResponse.json({
      configured: configCheck.configured,
      missingProviders: configCheck.missing,
      providers: {
        transcription: {
          name: providerStatus.transcription.name,
          configured: providerStatus.transcription.configured,
          description: "Groq Whisper for audio/video transcription",
        },
        spi: {
          name: providerStatus.spi.name,
          configured: providerStatus.spi.configured,
          description: "DeepSeek for creative/emotional analysis",
        },
      },
      environment: envStatus,
      note: "This endpoint shows configuration status. Set missing environment variables to enable Creative QC.",
    });
  } catch (error: any) {
    console.error("[Creative QC Status API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get status" },
      { status: 500 }
    );
  }
}

