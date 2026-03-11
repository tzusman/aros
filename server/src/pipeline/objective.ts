import type { ObjectiveCheck } from "@aros/types";

// ---- Public types ----

export interface ObjectiveCheckConfig {
  name: string;
  config: Record<string, unknown>;
  severity: "blocking" | "warning";
}

export interface FileInput {
  filename: string;
  content: string;
  contentType: string;
  sizeBytes: number;
}

// ---- Default profanity word list ----

const DEFAULT_PROFANITY_WORDS = [
  "damn",
  "hell",
  "ass",
  "crap",
  "bastard",
  "bitch",
  "shit",
  "fuck",
  "piss",
  "dick",
  "cock",
  "pussy",
  "whore",
  "slut",
  "cunt",
  "nigger",
  "faggot",
];

// ---- Check implementations ----

/**
 * file_size: Check that sizeBytes <= config.max_mb * 1024 * 1024 (default 10 MB)
 */
function runFileSizeCheck(
  file: FileInput,
  check: ObjectiveCheckConfig
): ObjectiveCheck {
  const maxMb = typeof check.config.max_mb === "number" ? check.config.max_mb : 10;
  const maxBytes = maxMb * 1024 * 1024;
  const passed = file.sizeBytes <= maxBytes;
  const details = passed
    ? `File size ${file.sizeBytes} bytes is within the ${maxMb} MB limit.`
    : `File size ${file.sizeBytes} bytes exceeds the ${maxMb} MB limit (${maxBytes} bytes).`;

  return {
    name: check.name,
    passed,
    severity: check.severity,
    details,
  };
}

/**
 * format_check: Check that contentType matches one of the allowed patterns.
 * Supports exact matches and wildcard prefix patterns like "image/*".
 */
function runFormatCheck(
  file: FileInput,
  check: ObjectiveCheckConfig
): ObjectiveCheck {
  const allowed = Array.isArray(check.config.allowed)
    ? (check.config.allowed as string[])
    : [];

  const passed = allowed.some((pattern) => {
    if (pattern.endsWith("/*")) {
      // Wildcard: "image/*" matches any "image/..." type
      const prefix = pattern.slice(0, -1); // "image/"
      return file.contentType.startsWith(prefix);
    }
    return file.contentType === pattern;
  });

  const details = passed
    ? `Content type "${file.contentType}" is allowed.`
    : `Content type "${file.contentType}" is not in the allowed list: ${allowed.join(", ")}.`;

  return {
    name: check.name,
    passed,
    severity: check.severity,
    details,
  };
}

/**
 * word_count: Check word count for text/* files.
 * Non-text files are skipped (passed=true, details indicate skip).
 */
function runWordCountCheck(
  file: FileInput,
  check: ObjectiveCheckConfig
): ObjectiveCheck {
  const isText = file.contentType.startsWith("text/");

  if (!isText) {
    return {
      name: check.name,
      passed: true,
      severity: check.severity,
      details: `Skipped — word_count only applies to text/* files, got "${file.contentType}".`,
    };
  }

  const words = file.content.trim() === "" ? [] : file.content.trim().split(/\s+/);
  const wordCount = words.length;

  const min = typeof check.config.min === "number" ? check.config.min : undefined;
  const max = typeof check.config.max === "number" ? check.config.max : undefined;

  let passed = true;
  const violations: string[] = [];

  if (min !== undefined && wordCount < min) {
    passed = false;
    violations.push(`word count ${wordCount} is below minimum ${min}`);
  }

  if (max !== undefined && wordCount > max) {
    passed = false;
    violations.push(`word count ${wordCount} exceeds maximum ${max}`);
  }

  const details = passed
    ? `Word count ${wordCount} is within bounds.`
    : `Word count check failed: ${violations.join("; ")}.`;

  return {
    name: check.name,
    passed,
    severity: check.severity,
    details,
  };
}

/**
 * image_dimensions: Parse SVG viewBox to check width/height constraints.
 * Skips non-SVG files and SVGs without a detectable viewBox (passed=true with skip note).
 */
function runImageDimensionsCheck(
  file: FileInput,
  check: ObjectiveCheckConfig
): ObjectiveCheck {
  const isSvg =
    file.contentType === "image/svg+xml" ||
    file.filename.toLowerCase().endsWith(".svg");

  if (!isSvg) {
    return {
      name: check.name,
      passed: true,
      severity: check.severity,
      details: `Skipped — image_dimensions only supports SVG viewBox parsing for non-raster files. Content type: "${file.contentType}".`,
    };
  }

  // Parse viewBox="0 0 W H"
  const viewBoxMatch = file.content.match(/viewBox=["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/);

  if (!viewBoxMatch) {
    return {
      name: check.name,
      passed: true,
      severity: check.severity,
      details: `Skipped — no detectable viewBox attribute found in SVG content.`,
    };
  }

  const width = parseFloat(viewBoxMatch[1]);
  const height = parseFloat(viewBoxMatch[2]);

  const minWidth =
    typeof check.config.min_width === "number" ? check.config.min_width : undefined;
  const maxWidth =
    typeof check.config.max_width === "number" ? check.config.max_width : undefined;
  const minHeight =
    typeof check.config.min_height === "number" ? check.config.min_height : undefined;
  const maxHeight =
    typeof check.config.max_height === "number" ? check.config.max_height : undefined;

  const violations: string[] = [];

  if (minWidth !== undefined && width < minWidth) {
    violations.push(`width ${width} is below minimum ${minWidth}`);
  }
  if (maxWidth !== undefined && width > maxWidth) {
    violations.push(`width ${width} exceeds maximum ${maxWidth}`);
  }
  if (minHeight !== undefined && height < minHeight) {
    violations.push(`height ${height} is below minimum ${minHeight}`);
  }
  if (maxHeight !== undefined && height > maxHeight) {
    violations.push(`height ${height} exceeds maximum ${maxHeight}`);
  }

  const passed = violations.length === 0;
  const details = passed
    ? `SVG dimensions ${width}x${height} are within bounds.`
    : `Image dimension check failed: ${violations.join("; ")}.`;

  return {
    name: check.name,
    passed,
    severity: check.severity,
    details,
  };
}

/**
 * profanity_check: Scan text/* file content for forbidden words.
 * Uses config.words list if provided, otherwise the default list.
 * Non-text files are skipped (passed=true, details indicate skip).
 */
function runProfanityCheck(
  file: FileInput,
  check: ObjectiveCheckConfig
): ObjectiveCheck {
  const isText = file.contentType.startsWith("text/");

  if (!isText) {
    return {
      name: check.name,
      passed: true,
      severity: check.severity,
      details: `Skipped — profanity_check only applies to text/* files, got "${file.contentType}".`,
    };
  }

  const wordList =
    Array.isArray(check.config.words) && check.config.words.length > 0
      ? (check.config.words as string[])
      : DEFAULT_PROFANITY_WORDS;

  const lowerContent = file.content.toLowerCase();
  const found: string[] = [];

  for (const word of wordList) {
    if (lowerContent.includes(word.toLowerCase())) {
      found.push(word);
    }
  }

  const passed = found.length === 0;
  const details = passed
    ? `No prohibited words detected.`
    : `Profanity check failed — found prohibited word(s): ${found.join(", ")}.`;

  return {
    name: check.name,
    passed,
    severity: check.severity,
    details,
  };
}

// ---- Check dispatch ----

function runSingleCheck(
  file: FileInput,
  check: ObjectiveCheckConfig
): ObjectiveCheck {
  switch (check.name) {
    case "file_size":
      return runFileSizeCheck(file, check);
    case "format_check":
      return runFormatCheck(file, check);
    case "word_count":
      return runWordCountCheck(file, check);
    case "image_dimensions":
      return runImageDimensionsCheck(file, check);
    case "profanity_check":
      return runProfanityCheck(file, check);
    default:
      return {
        name: check.name,
        passed: true,
        severity: check.severity,
        details: `Unknown check "${check.name}" — skipped.`,
      };
  }
}

// ---- Public API ----

/**
 * Run all objective checks against all files.
 * Returns one ObjectiveCheck result per (file, check) pair.
 * Results are ordered: all checks for file[0], then all checks for file[1], etc.
 */
export async function runObjectiveChecks(
  files: FileInput[],
  checks: ObjectiveCheckConfig[]
): Promise<ObjectiveCheck[]> {
  const results: ObjectiveCheck[] = [];

  for (const file of files) {
    for (const check of checks) {
      results.push(runSingleCheck(file, check));
    }
  }

  return results;
}
