import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-drive/client";

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    configuration: {},
    tests: {},
  };

  // Check environment variables
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/google/callback";

  results.configuration = {
    GOOGLE_CLIENT_ID: clientId 
      ? `✅ Set (${clientId.substring(0, 20)}...)`
      : "❌ Missing",
    GOOGLE_CLIENT_SECRET: clientSecret 
      ? `✅ Set (${clientSecret.substring(0, 10)}...)`
      : "❌ Missing",
    GOOGLE_REDIRECT_URI: redirectUri,
  };

  // Test OAuth URL generation
  if (clientId && clientSecret) {
    try {
      const authUrl = getAuthUrl("test-state");
      results.tests.authUrlGeneration = {
        status: "✅ Working",
        authUrl: authUrl,
      };
    } catch (error: any) {
      results.tests.authUrlGeneration = {
        status: "❌ Failed",
        error: error.message,
      };
    }
  } else {
    results.tests.authUrlGeneration = {
      status: "❌ Cannot test - credentials missing",
    };
  }

  // Check if credentials format is valid
  if (clientId) {
    const isValidClientId = clientId.endsWith(".apps.googleusercontent.com");
    results.tests.clientIdFormat = isValidClientId 
      ? "✅ Valid format" 
      : "⚠️ Unusual format (should end with .apps.googleusercontent.com)";
  }

  if (clientSecret) {
    const isValidSecret = clientSecret.startsWith("GOCSPX-");
    results.tests.clientSecretFormat = isValidSecret 
      ? "✅ Valid format" 
      : "⚠️ Unusual format (should start with GOCSPX-)";
  }

  // Provide the connect URL for the user
  if (clientId && clientSecret) {
    results.connectUrl = `/api/google/auth`;
    results.instructions = "Visit the connectUrl to authorize Google Drive access";
  } else {
    results.instructions = "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env.local file";
  }

  const allConfigured = clientId && clientSecret;
  results.status = allConfigured ? "✅ Ready to connect" : "❌ Configuration needed";

  return NextResponse.json(results);
}




