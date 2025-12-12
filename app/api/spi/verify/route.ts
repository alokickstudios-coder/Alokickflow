/**
 * POST /api/spi/verify
 * 
 * Verify an SPI Fingerprint for IP protection
 * Can verify by:
 * 1. Fingerprint ID (quick lookup)
 * 2. Content hash (content matching)
 * 3. Full fingerprint file (deep verification)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyFingerprint, SPIFingerprint } from "@/lib/services/spi/fingerprint";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/spi/verify
 * 
 * Body options:
 * - { fingerprintId: string } - Quick lookup by ID
 * - { contentHash: string } - Find by content hash
 * - { fingerprint: SPIFingerprint } - Deep verification
 * - { quickScanHash: string } - Fast scan lookup
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fingerprintId, contentHash, fingerprint, quickScanHash } = body;

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Method 1: Verify by Fingerprint ID (fastest)
    if (fingerprintId) {
      const { data: job, error } = await adminClient
        .from("qc_jobs")
        .select(`
          id,
          file_name,
          spi_fingerprint_id,
          spi_fingerprint_hash,
          spi_fingerprint_generated_at,
          spi_fingerprint_drive_link,
          organisation_id,
          organizations:organisations(name)
        `)
        .eq("spi_fingerprint_id", fingerprintId)
        .single();

      if (error || !job) {
        return NextResponse.json({
          verified: false,
          method: "fingerprint_id",
          message: "Fingerprint not found in database",
          fingerprintId,
        });
      }

      const org = Array.isArray(job.organizations) ? job.organizations[0] : job.organizations;

      return NextResponse.json({
        verified: true,
        method: "fingerprint_id",
        fingerprint: {
          id: job.spi_fingerprint_id,
          hash: job.spi_fingerprint_hash,
          generated_at: job.spi_fingerprint_generated_at,
          drive_link: job.spi_fingerprint_drive_link,
        },
        media: {
          file_name: job.file_name,
          job_id: job.id,
        },
        provenance: {
          organization: org?.name || "Unknown",
          organization_id: job.organisation_id,
        },
        certificate: {
          status: "VERIFIED",
          verified_at: new Date().toISOString(),
          verification_id: createHash("md5").update(`verify:${fingerprintId}:${Date.now()}`).digest("hex"),
        },
      });
    }

    // Method 2: Verify by Content Hash
    if (contentHash) {
      // Search by SHA-256 hash in stored fingerprints
      const { data: jobs, error } = await adminClient
        .from("qc_jobs")
        .select(`
          id,
          file_name,
          spi_fingerprint_id,
          spi_fingerprint_hash,
          spi_fingerprint_generated_at,
          result_json,
          organisation_id
        `)
        .not("spi_fingerprint_id", "is", null)
        .limit(100);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Note: In production, store content_hash in a separate indexed column
      // For now, this is a demonstration
      const match = jobs?.find(job => {
        const result = job.result_json as any;
        return result?.contentHash === contentHash;
      });

      if (!match) {
        return NextResponse.json({
          verified: false,
          method: "content_hash",
          message: "No matching content found in database",
          contentHash,
        });
      }

      return NextResponse.json({
        verified: true,
        method: "content_hash",
        fingerprint: {
          id: match.spi_fingerprint_id,
          hash: match.spi_fingerprint_hash,
          generated_at: match.spi_fingerprint_generated_at,
        },
        media: {
          file_name: match.file_name,
          job_id: match.id,
        },
        certificate: {
          status: "VERIFIED",
          verified_at: new Date().toISOString(),
        },
      });
    }

    // Method 3: Verify by Quick Scan Hash (16-char fast lookup)
    if (quickScanHash) {
      // Search in all fingerprints
      const { data: jobs, error } = await adminClient
        .from("qc_jobs")
        .select(`
          id,
          file_name,
          spi_fingerprint_id,
          spi_fingerprint_hash,
          organisation_id
        `)
        .not("spi_fingerprint_id", "is", null)
        .limit(500);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Match quick scan hash (first 16 chars of MD5)
      const match = jobs?.find(job => {
        const hash = job.spi_fingerprint_hash;
        return hash && createHash("md5").update(hash).digest("hex").substring(0, 16) === quickScanHash;
      });

      if (!match) {
        return NextResponse.json({
          verified: false,
          method: "quick_scan",
          message: "No matching fingerprint found",
          quickScanHash,
        });
      }

      return NextResponse.json({
        verified: true,
        method: "quick_scan",
        fingerprint: {
          id: match.spi_fingerprint_id,
          hash: match.spi_fingerprint_hash,
        },
        media: {
          file_name: match.file_name,
          job_id: match.id,
        },
        certificate: {
          status: "VERIFIED",
          verified_at: new Date().toISOString(),
        },
      });
    }

    // Method 4: Deep verification of full fingerprint
    if (fingerprint) {
      // Verify fingerprint structure
      const verification = verifyFingerprint(fingerprint as SPIFingerprint);
      
      if (!verification.valid) {
        return NextResponse.json({
          verified: false,
          method: "deep_verification",
          message: "Invalid fingerprint structure",
          errors: verification.errors,
        });
      }

      // Check if this fingerprint exists in database
      const { data: existingJob, error } = await adminClient
        .from("qc_jobs")
        .select("id, file_name, spi_fingerprint_hash")
        .eq("spi_fingerprint_id", (fingerprint as SPIFingerprint)._spi.fingerprint_id)
        .single();

      if (error || !existingJob) {
        return NextResponse.json({
          verified: false,
          method: "deep_verification",
          message: "Fingerprint not registered in database",
          fingerprint_id: (fingerprint as SPIFingerprint)._spi.fingerprint_id,
          integrity: {
            structure: "valid",
            registered: false,
          },
        });
      }

      // Verify hash matches
      const hashMatch = existingJob.spi_fingerprint_hash === (fingerprint as SPIFingerprint)._spi.fingerprint_hash;

      return NextResponse.json({
        verified: hashMatch,
        method: "deep_verification",
        fingerprint: {
          id: (fingerprint as SPIFingerprint)._spi.fingerprint_id,
          hash: (fingerprint as SPIFingerprint)._spi.fingerprint_hash,
          stored_hash: existingJob.spi_fingerprint_hash,
        },
        integrity: {
          structure: "valid",
          registered: true,
          hash_match: hashMatch,
        },
        media: {
          file_name: existingJob.file_name,
          job_id: existingJob.id,
        },
        certificate: {
          status: hashMatch ? "VERIFIED" : "HASH_MISMATCH",
          verified_at: new Date().toISOString(),
          warning: hashMatch ? undefined : "Fingerprint hash does not match stored record",
        },
      });
    }

    return NextResponse.json({
      error: "No verification method provided",
      methods: [
        { param: "fingerprintId", description: "Quick lookup by SPI fingerprint ID" },
        { param: "contentHash", description: "Find by content SHA-256 hash" },
        { param: "quickScanHash", description: "Fast 16-char lookup hash" },
        { param: "fingerprint", description: "Deep verification of full fingerprint JSON" },
      ],
    }, { status: 400 });

  } catch (error: any) {
    console.error("[SPI Verify] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/spi/verify?id=xxx
 * 
 * Quick verification by fingerprint ID
 */
export async function GET(request: NextRequest) {
  const fingerprintId = request.nextUrl.searchParams.get("id");
  
  if (!fingerprintId) {
    return NextResponse.json({
      service: "SPI Verification API",
      version: "1.0.0",
      methods: {
        GET: "Quick verify by fingerprint ID (?id=SPI-xxx)",
        POST: "Full verification with multiple methods",
      },
      documentation: "https://docs.alokickflow.com/spi/verification",
    });
  }

  // Redirect to POST handler
  const response = await POST(
    new NextRequest(request.url, {
      method: "POST",
      body: JSON.stringify({ fingerprintId }),
      headers: { "Content-Type": "application/json" },
    })
  );

  return response;
}
