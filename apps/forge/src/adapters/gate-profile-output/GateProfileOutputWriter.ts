import { appendFileSync } from 'node:fs';

import { GATE_PROFILE_OUTPUT_FORMAT_VERSION } from './GateProfileOutputIngestion.ts';

/** Appended in place as the output arrives, not atomically: a reader waits for a line's line feed, so a torn last line is never read. */
export function createGateProfileOutputWriter(outputFilePath: string): {
  append(text: string): void;
} {
  return { append: (text) => appendFileSync(outputFilePath, `${JSON.stringify({ version: GATE_PROFILE_OUTPUT_FORMAT_VERSION, text })}\n`), };
}
