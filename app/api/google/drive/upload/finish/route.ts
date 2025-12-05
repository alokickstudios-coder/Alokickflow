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

    const { fileId } = await request.json();

    if (!fileId) {
      return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
    }

    // Make file shareable (Reader permission to anyone)
    // In a real enterprise app, you might restrict this to specific domains or users
    const permResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
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

    if (!permResponse.ok) {
        // Log but don't fail completely, maybe the file is already uploaded
        console.warn("Failed to set permissions:", await permResponse.text());
    }

    // Get shareable link and details
    const fileResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,webViewLink,webContentLink`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!fileResponse.ok) {
        throw new Error("Failed to fetch file details");
    }

    const fileDetails = await fileResponse.json();

    return NextResponse.json({
      success: true,
      file: {
        id: fileDetails.id,
        name: fileDetails.name,
        webViewLink: fileDetails.webViewLink,
        webContentLink: fileDetails.webContentLink,
        shareableLink: `https://drive.google.com/file/d/${fileDetails.id}/view?usp=sharing`,
      },
    });
  } catch (error: any) {
    console.error("Drive upload finish error:", error);
    return NextResponse.json(
      { error: error.message || "Upload finalization failed" },
      { status: 500 }
    );
  }
}






