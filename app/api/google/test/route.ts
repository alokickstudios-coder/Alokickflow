import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listFiles, createFolder, uploadFile } from "@/lib/google-drive/client";

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
  };

  // Get access token from cookies
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("google_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({
      status: "not_connected",
      message: "Google Drive not connected. Visit /api/google/auth to connect.",
      connectUrl: "/api/google/auth",
    });
  }

  results.tokenExists = true;

  // Test 1: List files
  try {
    const { files } = await listFiles(accessToken, { pageSize: 5 });
    results.listFiles = {
      status: "✅ Working",
      fileCount: files.length,
      sampleFiles: files.slice(0, 3).map(f => ({ name: f.name, type: f.mimeType })),
    };
  } catch (error: any) {
    results.listFiles = {
      status: "❌ Failed",
      error: error.message,
    };
  }

  // Test 2: Create a test folder
  try {
    const folder = await createFolder(accessToken, `AlokickFlow_Test_${Date.now()}`);
    results.createFolder = {
      status: "✅ Working",
      folderId: folder.id,
      folderName: folder.name,
      webLink: folder.webViewLink,
    };
    
    // Clean up - we could delete it, but let's leave it for verification
  } catch (error: any) {
    results.createFolder = {
      status: "❌ Failed",
      error: error.message,
    };
  }

  // Overall status
  const allPassed = results.listFiles?.status?.includes("✅") && 
                    results.createFolder?.status?.includes("✅");
  
  results.overallStatus = allPassed 
    ? "✅ Google Drive fully working!"
    : "⚠️ Some tests failed - check details above";

  return NextResponse.json(results);
}

// POST - Upload a test file
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("google_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({
      error: "Not connected to Google Drive",
      connectUrl: "/api/google/auth",
    }, { status: 401 });
  }

  try {
    // Create a simple test file
    const testContent = `AlokickFlow Test File
Created: ${new Date().toISOString()}
This file was created to test Google Drive integration.
`;

    const file = await uploadFile(accessToken, {
      name: `alokickflow_test_${Date.now()}.txt`,
      mimeType: "text/plain",
      content: Buffer.from(testContent),
    });

    return NextResponse.json({
      status: "✅ Upload successful!",
      file: {
        id: file.id,
        name: file.name,
        webLink: file.webViewLink,
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      status: "❌ Upload failed",
      error: error.message,
    }, { status: 500 });
  }
}

