/**
 * Dev-only QC Test Harness
 * 
 * Allows testing QC pipeline with a sample file.
 * Only available in development mode.
 */

import { NextRequest, NextResponse } from "next/server";
import { runQcForEpisode, getEnabledQCFeatures } from "@/lib/services/qc/engine";
import { getOrganisationSubscription } from "@/lib/services/subscriptionService";
import { join } from "path";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

// Only allow in development
const isDev = process.env.NODE_ENV === "development";

/**
 * POST /api/dev/runQcSample
 * 
 * Run QC on a sample file for testing
 */
export async function POST(request: NextRequest) {
  if (!isDev) {
    return NextResponse.json(
      { error: "This endpoint is only available in development mode" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const {
      filePath,
      organisationId = "00000000-0000-0000-0000-000000000001", // Default test org
      seriesId = "test-series-1",
      episodeId = `test-episode-${Date.now()}`,
    } = body;

    // Use provided file path or default test file
    let testFilePath = filePath;
    
    if (!testFilePath) {
      // Try to find a sample file in the repo
      const possiblePaths = [
        join(process.cwd(), "test-fixtures", "sample-video.mp4"),
        join(process.cwd(), "public", "sample-video.mp4"),
        join(process.cwd(), "tmp", "sample-video.mp4"),
      ];

      testFilePath = possiblePaths.find(p => existsSync(p));
      
      if (!testFilePath) {
        return NextResponse.json(
          {
            error: "No test file found",
            message: "Please provide a filePath or place a sample-video.mp4 in test-fixtures/",
            possiblePaths,
          },
          { status: 400 }
        );
      }
    }

    if (!existsSync(testFilePath)) {
      return NextResponse.json(
        { error: `File not found: ${testFilePath}` },
        { status: 404 }
      );
    }

    // Get enabled features (use test org defaults)
    const featuresEnabled = await getEnabledQCFeatures(organisationId);

    console.log(`[QCTest] Running QC on ${testFilePath}`);
    console.log(`[QCTest] Features enabled:`, featuresEnabled);

    // Run QC
    const qcResult = await runQcForEpisode({
      organisationId,
      seriesId,
      episodeId,
      fileInfo: {
        filePath: testFilePath,
        fileName: testFilePath.split("/").pop() || "test.mp4",
      },
      featuresEnabled,
    });

    return NextResponse.json({
      success: true,
      qcResult,
      filePath: testFilePath,
      featuresEnabled,
    });
  } catch (error: any) {
    console.error("[QCTest] Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to run QC test",
        stack: isDev ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dev/runQcSample
 * 
 * Get test file information
 */
export async function GET(request: NextRequest) {
  if (!isDev) {
    return NextResponse.json(
      { error: "This endpoint is only available in development mode" },
      { status: 403 }
    );
  }

  const possiblePaths = [
    join(process.cwd(), "test-fixtures", "sample-video.mp4"),
    join(process.cwd(), "public", "sample-video.mp4"),
    join(process.cwd(), "tmp", "sample-video.mp4"),
  ];

  const foundFiles = possiblePaths
    .filter(p => existsSync(p))
    .map(p => ({ path: p, exists: true }));

  return NextResponse.json({
    message: "QC Test Harness",
    instructions: "POST to this endpoint with { filePath, organisationId, seriesId, episodeId }",
    possibleTestFiles: possiblePaths.map(p => ({
      path: p,
      exists: existsSync(p),
    })),
    foundFiles,
  });
}



