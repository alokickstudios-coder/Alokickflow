/**
 * Filename Parser Utility
 * Validates and parses media filenames according to project naming conventions
 */

// Default regex pattern for media files
// Pattern: PROJECT_CODE-EP###-LANGUAGE-DESCRIPTION
// Example: PROJ_CODE-EP001-ENG-Final_Cut.mp4
export const DEFAULT_FILENAME_REGEX =
  /^([A-Z0-9_]+)[-_]?EP[_-]?(\d{1,4})[_-]?([A-Za-z]+)[-_]?(.+)$/i;

export interface ParsedFilename {
  projectCode: string;
  episodeNumber: string;
  language: string;
  description: string;
  isValid: boolean;
  errors: string[];
}

export function parseFilename(
  filename: string,
  customRegex?: RegExp
): ParsedFilename {
  const regex = customRegex || DEFAULT_FILENAME_REGEX;
  const errors: string[] = [];

  // Remove file extension for parsing
  const nameWithoutExtension = filename.replace(/\.[^/.]+$/, "");
  const match = nameWithoutExtension.match(regex);

  if (!match) {
    return {
      projectCode: "",
      episodeNumber: "",
      language: "",
      description: "",
      isValid: false,
      errors: [
        `Filename does not match expected pattern. Expected format: PROJECT_CODE-EP###-LANGUAGE-DESCRIPTION`,
      ],
    };
  }

  const [, projectCode, episodeNumber, language, description] = match;

  // Validate project code
  if (projectCode.length < 2) {
    errors.push("Project code must be at least 2 characters");
  }

  // Validate episode number
  const epNum = parseInt(episodeNumber, 10);
  if (isNaN(epNum) || epNum < 1 || epNum > 9999) {
    errors.push("Episode number must be between 1 and 9999");
  }

  // Validate language code
  const validLanguages = ["ENG", "SPA", "FRA", "DEU", "ITA", "POR", "JPN", "KOR", "CHI", "HIN", "ARB"];
  if (language.length < 2 || language.length > 5) {
    errors.push("Language code should be 2-5 characters");
  }

  return {
    projectCode: projectCode.toUpperCase(),
    episodeNumber: episodeNumber.padStart(3, "0"),
    language: language.toUpperCase(),
    description,
    isValid: errors.length === 0,
    errors,
  };
}

export function validateFilename(
  filename: string,
  projectRegex?: string
): { isValid: boolean; errors: string[] } {
  try {
    const regex = projectRegex ? new RegExp(projectRegex, "i") : DEFAULT_FILENAME_REGEX;
    const parsed = parseFilename(filename, regex);
    return {
      isValid: parsed.isValid,
      errors: parsed.errors,
    };
  } catch (error) {
    return {
      isValid: false,
      errors: ["Invalid regex pattern"],
    };
  }
}

export function generateFilename(
  projectCode: string,
  episodeNumber: number,
  language: string,
  description: string,
  extension: string
): string {
  const ep = String(episodeNumber).padStart(3, "0");
  return `${projectCode.toUpperCase()}-EP${ep}-${language.toUpperCase()}-${description}.${extension}`;
}

// Validate file extension
export function isValidMediaExtension(filename: string): boolean {
  const validExtensions = [
    // Video
    ".mp4", ".mov", ".avi", ".mkv", ".mxf", ".prores", ".webm",
    // Audio
    ".wav", ".mp3", ".aac", ".flac", ".aiff",
    // Subtitles
    ".srt", ".vtt", ".ass", ".sub",
  ];
  
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  return validExtensions.includes(ext);
}

