/**
 * POST /api/setup/create-bucket
 * 
 * API endpoint to create the deliveries storage bucket
 * This can be called once to set up the bucket
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/setup/create-bucket
 */
export async function POST(request: NextRequest) {
  try {
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server configuration error - missing Supabase credentials" },
        { status: 500 }
      );
    }

    // Check if bucket already exists
    const { data: existingBuckets, error: listError } = await adminClient.storage.listBuckets();
    
    if (listError) {
      console.error("[CreateBucket] Error listing buckets:", listError);
      return NextResponse.json(
        { error: `Failed to check existing buckets: ${listError.message}` },
        { status: 500 }
      );
    }

    const bucketExists = existingBuckets?.some(b => b.id === "deliveries");

    if (bucketExists) {
      return NextResponse.json({
        success: true,
        message: "Bucket 'deliveries' already exists",
        bucket: existingBuckets?.find(b => b.id === "deliveries"),
      });
    }

    // Create bucket via SQL (using admin client to execute SQL)
    // Note: Supabase JS client doesn't have a direct createBucket method
    // We need to use the REST API or SQL
    
    // Try using REST API
    const response = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        "apikey": supabaseServiceKey || "",
      },
      body: JSON.stringify({
        id: "deliveries",
        name: "deliveries",
        public: false,
        file_size_limit: 5368709120, // 5GB
        allowed_mime_types: [
          "video/*",
          "audio/*",
          "text/*",
          "application/x-subrip",
          "application/octet-stream",
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[CreateBucket] REST API error:", errorText);
      
      // If REST API fails, provide SQL instructions
      return NextResponse.json({
        success: false,
        error: "Failed to create bucket via API",
        message: "Please run the SQL script manually in Supabase Dashboard",
        sqlScript: "supabase/create-storage-bucket.sql",
        instructions: [
          "1. Go to Supabase Dashboard → SQL Editor",
          "2. Copy and paste the contents of supabase/create-storage-bucket.sql",
          "3. Run the SQL script",
          "4. Verify the bucket was created in Storage → Buckets",
        ],
      }, { status: 500 });
    }

    const bucketData = await response.json();

    return NextResponse.json({
      success: true,
      message: "Bucket 'deliveries' created successfully",
      bucket: bucketData,
    });
  } catch (error: any) {
    console.error("[CreateBucket] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create bucket",
        message: "Please run the SQL script manually in Supabase Dashboard",
        sqlScript: "supabase/create-storage-bucket.sql",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/setup/create-bucket
 * Check if bucket exists
 */
export async function GET(request: NextRequest) {
  try {
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const { data: buckets, error } = await adminClient.storage.listBuckets();
    
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const deliveriesBucket = buckets?.find(b => b.id === "deliveries");

    return NextResponse.json({
      exists: !!deliveriesBucket,
      bucket: deliveriesBucket || null,
      allBuckets: buckets?.map(b => ({ id: b.id, name: b.name })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

