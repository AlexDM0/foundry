/**
 * The record command refuses a name that is no recorded boundary before it starts anything, and lists the names it knows. Its recording
 * path runs real programs, so it is exercised by `bun run record` itself, never in this suite.
 */
import { describe, expect, test } from 'bun:test';

import { recordBoundary } from './RecordBoundary.ts';

describe('bun run record', () => {
  test('refuses a name that is no recorded boundary and lists the recorded ones', async () => {
    let standardOutput = '';
    let standardError  = '';
    const exitCode = await recordBoundary('example-unknown-boundary', {
      writeStandardOutput: (text) => { standardOutput += text; },
      writeStandardError:  (text) => { standardError += text; },
    });
    expect(exitCode).toBe(1);
    expect(standardOutput).toBe('');
    expect(standardError).toBe('"example-unknown-boundary" is no recorded boundary. Name one of:\n  process-run\n');
  });
});
