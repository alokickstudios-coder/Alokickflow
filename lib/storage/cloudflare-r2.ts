/**
 * Cloudflare R2 Storage Service
 * Cost-efficient S3-compatible storage for media files
 * 
 * Pricing: Free for 10GB/month storage, $0.015/GB after
 * No egress fees (unlike AWS S3)
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string;
}

// Initialize R2 client
function getR2Client(): S3Client | null {
  const config: R2Config = {
    accountId: process.env.R2_ACCOUNT_ID || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    bucketName: process.env.R2_BUCKET_NAME || "alokickflow-assets",
    publicUrl: process.env.R2_PUBLIC_URL,
  };

  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    console.warn("R2 credentials not configured - file storage features limited");
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "alokickflow-assets";

export interface UploadResult {
  success: boolean;
  path?: string;
  url?: string;
  error?: string;
}

export interface FileMetadata {
  key: string;
  size: number;
  lastModified: Date;
  contentType?: string;
}

/**
 * Upload a file to R2
 */
export async function uploadToR2(
  buffer: Buffer,
  fileName: string,
  options: {
    organizationId: string;
    projectId?: string;
    folder?: string;
    contentType?: string;
  }
): Promise<UploadResult> {
  const client = getR2Client();
  
  if (!client) {
    return { success: false, error: "R2 storage not configured" };
  }

  try {
    // Generate storage path
    const folder = options.folder || "uploads";
    const timestamp = Date.now();
    const key = options.projectId
      ? `${options.organizationId}/${options.projectId}/${folder}/${timestamp}-${fileName}`
      : `${options.organizationId}/${folder}/${timestamp}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: options.contentType || "application/octet-stream",
      Metadata: {
        organizationId: options.organizationId,
        projectId: options.projectId || "",
        originalFileName: fileName,
        uploadedAt: new Date().toISOString(),
      },
    });

    await client.send(command);

    // Generate public URL if configured
    const publicUrl = process.env.R2_PUBLIC_URL
      ? `${process.env.R2_PUBLIC_URL}/${key}`
      : undefined;

    return {
      success: true,
      path: key,
      url: publicUrl,
    };
  } catch (error: any) {
    console.error("R2 upload error:", error);
    return {
      success: false,
      error: error.message || "Failed to upload file",
    };
  }
}

/**
 * Get a signed URL for downloading a file
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const client = getR2Client();
  
  if (!client) {
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    return await getSignedUrl(client, command, { expiresIn });
  } catch (error: any) {
    console.error("R2 signed URL error:", error);
    return null;
  }
}

/**
 * Get a signed URL for uploading a file (presigned upload)
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const client = getR2Client();
  
  if (!client) {
    return null;
  }

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    return await getSignedUrl(client, command, { expiresIn });
  } catch (error: any) {
    console.error("R2 presigned upload URL error:", error);
    return null;
  }
}

/**
 * Download a file from R2
 */
export async function downloadFromR2(key: string): Promise<Buffer | null> {
  const client = getR2Client();
  
  if (!client) {
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await client.send(command);
    
    if (!response.Body) {
      return null;
    }

    const chunks: Uint8Array[] = [];
    const body = response.Body as any;
    
    for await (const chunk of body) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch (error: any) {
    console.error("R2 download error:", error);
    return null;
  }
}

/**
 * Delete a file from R2
 */
export async function deleteFromR2(key: string): Promise<boolean> {
  const client = getR2Client();
  
  if (!client) {
    return false;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await client.send(command);
    return true;
  } catch (error: any) {
    console.error("R2 delete error:", error);
    return false;
  }
}

/**
 * List files in a folder
 */
export async function listFiles(
  prefix: string,
  maxKeys: number = 100
): Promise<FileMetadata[]> {
  const client = getR2Client();
  
  if (!client) {
    return [];
  }

  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });

    const response = await client.send(command);
    
    return (response.Contents || []).map((item) => ({
      key: item.Key || "",
      size: item.Size || 0,
      lastModified: item.LastModified || new Date(),
    }));
  } catch (error: any) {
    console.error("R2 list error:", error);
    return [];
  }
}

/**
 * Copy file to Google Drive (via API)
 */
export async function copyToGoogleDrive(
  r2Key: string,
  googleAccessToken: string,
  options: {
    folderId?: string;
    fileName?: string;
  }
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    // Download from R2
    const fileBuffer = await downloadFromR2(r2Key);
    if (!fileBuffer) {
      return { success: false, error: "Failed to download file from storage" };
    }

    const fileName = options.fileName || r2Key.split("/").pop() || "file";

    // Upload to Google Drive
    const metadata = {
      name: fileName,
      ...(options.folderId && { parents: [options.folderId] }),
    };

    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    // Convert Buffer to ArrayBuffer for Blob compatibility
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    ) as ArrayBuffer;
    form.append("file", new Blob([arrayBuffer]));

    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
        },
        body: form,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const data = await response.json();
    return { success: true, fileId: data.id };
  } catch (error: any) {
    console.error("Copy to Google Drive error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Transfer file from Google Drive to R2
 */
export async function copyFromGoogleDrive(
  googleAccessToken: string,
  googleFileId: string,
  options: {
    organizationId: string;
    projectId?: string;
    folder?: string;
  }
): Promise<UploadResult> {
  try {
    // Get file metadata from Google Drive
    const metadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${googleFileId}?fields=name,mimeType,size`,
      {
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
        },
      }
    );

    if (!metadataResponse.ok) {
      return { success: false, error: "Failed to get file metadata from Google Drive" };
    }

    const metadata = await metadataResponse.json();

    // Download file from Google Drive
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${googleFileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
        },
      }
    );

    if (!downloadResponse.ok) {
      return { success: false, error: "Failed to download file from Google Drive" };
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to R2
    return await uploadToR2(buffer, metadata.name, {
      organizationId: options.organizationId,
      projectId: options.projectId,
      folder: options.folder || "drive-imports",
      contentType: metadata.mimeType,
    });
  } catch (error: any) {
    console.error("Copy from Google Drive error:", error);
    return { success: false, error: error.message };
  }
}

