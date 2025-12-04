import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { extractDriveId } from "@/lib/google-drive";

// This route needs access to cookies and external APIs, so force it to be dynamic.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("google_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not connected to Google Drive" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const folderId = searchParams.get("folderId");
    const driveUrl = searchParams.get("url");

    let targetFolderId = folderId;

    // Extract folder ID from URL if provided
    if (driveUrl) {
      const extracted = extractDriveId(driveUrl);
      if (extracted && extracted.type === "folder") {
        targetFolderId = extracted.id;
      }
    }

    // Build query
    let query = "trashed=false";
    if (targetFolderId) {
      query += ` and '${targetFolderId}' in parents`;
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,webViewLink,webContentLink,thumbnailLink,createdTime)&orderBy=name`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to list files");
    }

    const data = await response.json();

    return NextResponse.json({
      files: data.files || [],
      folderId: targetFolderId,
    });
  } catch (error: any) {
    console.error("Drive list error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list files" },
      { status: 500 }
    );
  }
}

