/**
 * Mock QC Processor for UI Testing
 * Simulates the AI Quality Control process before real Gemini API integration
 */

export interface MockQCResult {
  status: "passed" | "failed";
  confidence: number;
  summary: string;
  errors: MockQCError[];
  warnings: MockQCWarning[];
  metadata: {
    analyzedAt: string;
    processingTime: number;
    modelVersion: string;
  };
}

export interface MockQCError {
  type: string;
  severity: "critical" | "major" | "minor";
  description: string;
  timestamp?: string;
  timecode?: string;
  expectedValue?: string;
  actualValue?: string;
}

export interface MockQCWarning {
  type: string;
  description: string;
  timestamp?: string;
}

// Possible error types for mock generation
const possibleErrors: MockQCError[] = [
  {
    type: "Loudness",
    severity: "critical",
    description: "Audio loudness exceeds broadcast standards",
    expectedValue: "-23 LUFS",
    actualValue: "-14 LUFS",
  },
  {
    type: "Silence Detection",
    severity: "major",
    description: "Extended silence detected in audio track",
    timecode: "00:04:12",
  },
  {
    type: "Audio Sync",
    severity: "critical",
    description: "Audio-video sync offset detected",
    actualValue: "180ms delay",
    expectedValue: "<40ms",
  },
  {
    type: "Missing Audio",
    severity: "critical",
    description: "No audio track detected in file",
  },
  {
    type: "Video Glitch",
    severity: "major",
    description: "Frame drop detected",
    timecode: "00:12:34",
  },
  {
    type: "Resolution Mismatch",
    severity: "major",
    description: "Video resolution does not match expected specs",
    expectedValue: "1920x1080",
    actualValue: "1280x720",
  },
  {
    type: "Subtitle Timing",
    severity: "minor",
    description: "Subtitle displayed for less than minimum duration",
    timecode: "00:08:45",
    actualValue: "0.3s",
    expectedValue: ">1s",
  },
  {
    type: "Subtitle Length",
    severity: "minor",
    description: "Subtitle text exceeds recommended character limit",
    timecode: "00:15:22",
    actualValue: "56 chars",
    expectedValue: "<42 chars",
  },
  {
    type: "Missing BGM",
    severity: "major",
    description: "Background music appears to be missing in sections",
    timecode: "00:02:00 - 00:05:30",
  },
  {
    type: "Color Levels",
    severity: "minor",
    description: "Video levels exceed broadcast safe range",
    actualValue: "RGB 0-255",
    expectedValue: "RGB 16-235",
  },
];

const possibleWarnings: MockQCWarning[] = [
  {
    type: "Frame Rate",
    description: "Frame rate is 29.97fps, consider 25fps for PAL delivery",
  },
  {
    type: "Bitrate",
    description: "Video bitrate is lower than recommended for this resolution",
  },
  {
    type: "Audio Channels",
    description: "Mono audio detected, stereo recommended",
  },
  {
    type: "Container Format",
    description: "Consider using ProRes for better editing compatibility",
  },
];

/**
 * Generates a random timecode string
 */
function randomTimecode(): string {
  const hours = Math.floor(Math.random() * 2).toString().padStart(2, "0");
  const minutes = Math.floor(Math.random() * 60).toString().padStart(2, "0");
  const seconds = Math.floor(Math.random() * 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Picks random items from an array
 */
function pickRandom<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/**
 * Run Mock QC Analysis
 * 
 * Simulates QC processing with:
 * - 3 second delay
 * - 70% pass rate
 * - Random errors on failure
 * 
 * @param fileName - The name of the file being analyzed
 * @returns Promise<MockQCResult> - The simulated QC result
 */
export async function runMockQC(fileName: string): Promise<MockQCResult> {
  const startTime = Date.now();

  // Simulate processing delay (3 seconds)
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 70% pass rate
  const isPassed = Math.random() < 0.7;

  const processingTime = Date.now() - startTime;

  if (isPassed) {
    return {
      status: "passed",
      confidence: 85 + Math.floor(Math.random() * 15), // 85-100%
      summary: `QC passed for ${fileName}. All quality checks within acceptable parameters.`,
      errors: [],
      warnings: Math.random() < 0.3 ? pickRandom(possibleWarnings, 1) : [],
      metadata: {
        analyzedAt: new Date().toISOString(),
        processingTime,
        modelVersion: "mock-v1.0",
      },
    };
  }

  // Generate 1-3 random errors for failed QC
  const errorCount = 1 + Math.floor(Math.random() * 3);
  const selectedErrors = pickRandom(possibleErrors, errorCount).map((error) => ({
    ...error,
    timecode: error.timecode || (Math.random() < 0.5 ? randomTimecode() : undefined),
  }));

  // Maybe add some warnings too
  const warningCount = Math.random() < 0.5 ? Math.floor(Math.random() * 2) : 0;
  const selectedWarnings = pickRandom(possibleWarnings, warningCount);

  return {
    status: "failed",
    confidence: 75 + Math.floor(Math.random() * 20), // 75-95%
    summary: `QC failed for ${fileName}. Found ${selectedErrors.length} issue(s) requiring attention.`,
    errors: selectedErrors,
    warnings: selectedWarnings,
    metadata: {
      analyzedAt: new Date().toISOString(),
      processingTime,
      modelVersion: "mock-v1.0",
    },
  };
}

/**
 * Run Mock QC on multiple files
 * 
 * @param fileNames - Array of file names to analyze
 * @param onProgress - Callback for progress updates
 * @returns Promise with results for all files
 */
export async function runMockQCBatch(
  fileNames: string[],
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<Map<string, MockQCResult>> {
  const results = new Map<string, MockQCResult>();

  for (let i = 0; i < fileNames.length; i++) {
    const fileName = fileNames[i];
    onProgress?.(i + 1, fileNames.length, fileName);
    
    const result = await runMockQC(fileName);
    results.set(fileName, result);
  }

  return results;
}

/**
 * Format QC errors for display
 */
export function formatQCErrors(errors: MockQCError[]): string[] {
  return errors.map((error) => {
    let message = `${error.type}: ${error.description}`;
    if (error.timecode) {
      message += ` at ${error.timecode}`;
    }
    if (error.expectedValue && error.actualValue) {
      message += ` (Expected: ${error.expectedValue}, Got: ${error.actualValue})`;
    }
    return message;
  });
}

/**
 * Get severity color for UI
 */
export function getSeverityColor(severity: MockQCError["severity"]): string {
  switch (severity) {
    case "critical":
      return "text-red-500";
    case "major":
      return "text-orange-500";
    case "minor":
      return "text-yellow-500";
    default:
      return "text-zinc-400";
  }
}

/**
 * Get severity badge style for UI
 */
export function getSeverityBadgeClass(severity: MockQCError["severity"]): string {
  switch (severity) {
    case "critical":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "major":
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "minor":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    default:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  }
}

