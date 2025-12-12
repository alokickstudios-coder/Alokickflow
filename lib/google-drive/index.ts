/**
 * Google Drive Integration Service
 * 
 * Setup Required:
 * 1. Go to Google Cloud Console (https://console.cloud.google.com)
 * 2. Create a new project or select existing
 * 3. Enable Google Drive API
 * 4. Create OAuth 2.0 credentials (Web application)
 * 5. Add redirect URI: http://localhost:3000/api/google/callback
 * 6. Download credentials and add to .env.local
 */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  createdTime?: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  files: DriveFile[];
}

// Extract file/folder ID from Google Drive URL
export function extractDriveId(url: string): { id: string; type: 'file' | 'folder' } | null {
  try {
    const patterns = [
      // Folder patterns
      /drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/,
      /drive\.google\.com\/.*folders\/([a-zA-Z0-9_-]+)/,
      // File patterns
      /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
      /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
      /docs\.google\.com\/.*\/d\/([a-zA-Z0-9_-]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const isFolder = url.includes('folders');
        return { id: match[1], type: isFolder ? 'folder' : 'file' };
      }
    }

    return null;
  } catch (parseError: any) {
    console.debug("[GoogleDrive] URL parse failed:", parseError.message);
    return null;
  }
}

// Generate shareable link from file ID
export function generateShareableLink(fileId: string, type: 'view' | 'download' = 'view'): string {
  if (type === 'download') {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
}

// Generate folder link
export function generateFolderLink(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;
}

// Check if URL is a valid Google Drive URL
export function isValidDriveUrl(url: string): boolean {
  return extractDriveId(url) !== null;
}

