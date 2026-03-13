/**
 * Custom AROS Check Template
 *
 * Save this file as `check.ts` in a new directory under:
 *   .aros/modules/checks/<your-check-name>/
 *
 * You also need a `manifest.json` in the same directory:
 *
 * {
 *   "name": "your-check-name",
 *   "type": "check",
 *   "version": "1.0.0",
 *   "description": "What this check validates",
 *   "supportedTypes": ["*/*"],
 *   "configSchema": {
 *     "your_option": { "type": "number", "default": 10 }
 *   },
 *   "dependencies": { "binaries": [], "env": [], "npm": [] },
 *   "entrypoint": "check.ts"
 * }
 */

interface CheckInput {
  /** The file content as a Buffer */
  content: Buffer;
  /** The filename */
  filename: string;
  /** The MIME content type */
  contentType: string;
  /** Configuration values from the policy */
  config: Record<string, unknown>;
}

interface CheckResult {
  /** Whether the check passed */
  passed: boolean;
  /** Human-readable explanation of the result */
  details: string;
}

export default async function check(input: CheckInput): Promise<CheckResult> {
  // Example: check file size
  const maxMb = (input.config.max_mb as number) ?? 10;
  const sizeMb = input.content.length / (1024 * 1024);

  if (sizeMb > maxMb) {
    return {
      passed: false,
      details: `File is ${sizeMb.toFixed(2)} MB, exceeds ${maxMb} MB limit`,
    };
  }

  return {
    passed: true,
    details: `File size ${sizeMb.toFixed(2)} MB is within ${maxMb} MB limit`,
  };
}
