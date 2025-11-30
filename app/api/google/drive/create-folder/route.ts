import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("google_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not connected to Google Drive" },
        { status: 401 }
      );
    }

    const { folderName, parentFolderId } = await request.json();

    if (!folderName) {
      return NextResponse.json({ error: "Folder name required" }, { status: 400 });
    }

    const metadata: any = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    };

    if (parentFolderId) {
      metadata.parents = [parentFolderId];
    }

    const response = await fetch(
      "https://www.googleapis.com/drive/v3/files",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to create folder");
    }

    const folder = await response.json();

    // Make folder shareable
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${folder.id}/permissions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
      }
    );

    return NextResponse.json({
      success: true,
      folder: {
        id: folder.id,
        name: folder.name,
        shareableLink: `https://drive.google.com/drive/folders/${folder.id}?usp=sharing`,
      },
    });
  } catch (error: any) {
    console.error("Create folder error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create folder" },
      { status: 500 }
    );
  }
}

