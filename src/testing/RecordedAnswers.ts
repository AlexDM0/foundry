/**
 * What a real-system spec calls to record the real answer to one call shape. It writes only while `bun run record <boundary>` runs,
 * which creates the file it appends to; in any other run it does nothing.
 */
import { appendFileSync, existsSync } from 'node:fs';
import { join }                       from 'node:path';

import { answersInProgressPathOf } from './BoundaryRecordings.ts';

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');

export function recordAnswer(callShape: string, answer: unknown): void {
  const answersPath = answersInProgressPathOf(REPOSITORY_ROOT);
  if (!existsSync(answersPath)) return;
  appendFileSync(answersPath, `${JSON.stringify({ callShape, answer })}\n`);
}
