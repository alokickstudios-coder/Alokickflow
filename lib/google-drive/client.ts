/**
 * Google Drive API Client
 * Handles OAuth2 and file operations
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/google/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
];

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type: string;
  scope: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
  thumbnailLink?: string;
}

export interface DriveFolder extends DriveFile {
  kind: "drive#file";
}

/**
 * Get OAuth2 authorization URL
 */
export function getAuthUrl(state?: string): string {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID not configured");
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    ...(state && { state }),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth credentials not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: GOOGLE_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  const tokens = await response.json();
  return {
    ...tokens,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth credentials not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const tokens = await response.json();
  return {
    ...tokens,
    refresh_token: refreshToken, // Preserve refresh token
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
}

/**
 * List files in a folder
 */
export async function listFiles(
  accessToken: string,
  options: {
    folderId?: string;
    query?: string;
    pageToken?: string;
    pageSize?: number;
    orderBy?: string;
  } = {}
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    fields: "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,parents,thumbnailLink)",
    pageSize: String(options.pageSize || 50),
    ...(options.orderBy && { orderBy: options.orderBy }),
    ...(options.pageToken && { pageToken: options.pageToken }),
  });

  // Build query
  let query = options.query || "";
  if (options.folderId) {
    query = query 
      ? `${query} and '${options.folderId}' in parents` 
      : `'${options.folderId}' in parents`;
  }
  if (!query.includes("trashed")) {
    query = query ? `${query} and trashed = false` : "trashed = false";
  }
  if (query) {
    params.append("q", query);
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list files: ${error}`);
  }

  return await response.json();
}

/**
 * Get file metadata
 */
export async function getFile(
  accessToken: string,
  fileId: string
): Promise<DriveFile> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,parents,thumbnailLink`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get file: ${error}`);
  }

  return await response.json();
}

/**
 * Download file content
 */
export async function downloadFile(
  accessToken: string,
  fileId: string
): Promise<ArrayBuffer> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to download file: ${error}`);
  }

  return await response.arrayBuffer();
}

/**
 * Upload file to Drive
 */
export async function uploadFile(
  accessToken: string,
  file: {
    name: string;
    mimeType: string;
    content: Buffer | ArrayBuffer | Uint8Array;
    parentId?: string;
  }
): Promise<DriveFile> {
  const metadata = {
    name: file.name,
    mimeType: file.mimeType,
    ...(file.parentId && { parents: [file.parentId] }),
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  
  // Convert to ArrayBuffer for Blob compatibility
  const arrayBuffer = file.content instanceof ArrayBuffer 
    ? file.content 
    : (file.content as Uint8Array).buffer.slice(
        (file.content as Uint8Array).byteOffset,
        (file.content as Uint8Array).byteOffset + (file.content as Uint8Array).byteLength
      );
  
  form.append("file", new Blob([arrayBuffer as ArrayBuffer], { type: file.mimeType }));

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload file: ${error}`);
  }

  return await response.json();
}

/**
 * Create a folder
 */
export async function createFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<DriveFile> {
  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    ...(parentId && { parents: [parentId] }),
  };

  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink",
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
    const error = await response.text();
    throw new Error(`Failed to create folder: ${error}`);
  }

  return await response.json();
}

/**
 * Delete a file
 */
export async function deleteFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 204) {
    const error = await response.text();
    throw new Error(`Failed to delete file: ${error}`);
  }
}

/**
 * Create shareable link
 */
export async function createShareableLink(
  accessToken: string,
  fileId: string,
  role: "reader" | "writer" = "reader"
): Promise<string> {
  // Create permission
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role,
        type: "anyone",
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create shareable link: ${error}`);
  }

  // Get the file's web view link
  const file = await getFile(accessToken, fileId);
  return file.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Extract file ID from Google Drive URL
 */
export function extractFileId(url: string): string | null {
  // Handle various Google Drive URL formats
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Check if URL is a Google Drive URL
 */
export function isGoogleDriveUrl(url: string): boolean {
  return url.includes("drive.google.com") || url.includes("docs.google.com");
}

