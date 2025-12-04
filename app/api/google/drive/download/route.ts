import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { extractDriveId } from "@/lib/google-drive";

// This route streams file content from Google Drive and reads auth cookies.
// It must always run dynamically on the server.
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
    const fileId = searchParams.get("fileId");
    const driveUrl = searchParams.get("url");

    let targetFileId = fileId;

    // Extract file ID from URL if provided
    if (driveUrl) {
      const extracted = extractDriveId(driveUrl);
      if (extracted) {
        targetFileId = extracted.id;
      }
    }

    if (!targetFileId) {
      return NextResponse.json({ error: "No file ID provided" }, { status: 400 });
    }

    // Get file metadata first
    const metaResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${targetFileId}?fields=name,mimeType,size`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!metaResponse.ok) {
      const error = await metaResponse.json();
      throw new Error(error.error?.message || "Failed to get file info");
    }

    const metadata = await metaResponse.json();

    // Download file content
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${targetFileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!downloadResponse.ok) {
      throw new Error("Failed to download file");
    }

    const fileBuffer = await downloadResponse.arrayBuffer();

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": metadata.mimeType,
        "Content-Disposition": `attachment; filename="${metadata.name}"`,
        "Content-Length": metadata.size,
      },
    });
  } catch (error: any) {
    console.error("Drive download error:", error);
    return NextResponse.json(
      { error: error.message || "Download failed" },
      { status: 500 }
    );
  }
}

