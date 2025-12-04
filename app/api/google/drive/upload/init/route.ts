import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("google_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not connected to Google Drive. Please connect in Settings." },
        { status: 401 }
      );
    }

    const { fileName, fileType, folderId } = await request.json();

    if (!fileName || !fileType) {
      return NextResponse.json({ error: "Missing fileName or fileType" }, { status: 400 });
    }

    // Create file metadata
    const metadata: any = {
      name: fileName,
      mimeType: fileType,
    };

    if (folderId) {
      metadata.parents = [folderId];
    }

    // Initialize resumable upload
    // Note: We add X-Upload-Content-Type and X-Upload-Content-Length if possible, 
    // but for now just initializing the session is enough.
    const initResponse = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          // Important: X-Upload-Content-Type matches the file's type
          "X-Upload-Content-Type": fileType,
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initResponse.ok) {
      const error = await initResponse.json();
      console.error("Drive Init Error:", error);
      throw new Error(error.error?.message || "Failed to initialize upload");
    }

    const uploadUrl = initResponse.headers.get("Location");
    if (!uploadUrl) {
      throw new Error("No upload URL returned from Google Drive");
    }

    return NextResponse.json({ uploadUrl });
  } catch (error: any) {
    console.error("Drive upload init error:", error);
    return NextResponse.json(
      { error: error.message || "Upload initialization failed" },
      { status: 500 }
    );
  }
}


