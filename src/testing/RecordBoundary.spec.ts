/**
 * The record command refuses a name that is no recorded boundary, and a boundary authored by hand, before it starts anything, and lists the
 * names it knows. Its recording path runs real programs, so it is exercised by `bun run record` itself, never in this suite.
 */
import { describe, expect, test } from 'bun:test';

import { RECORDED_BOUNDARIES } from './BoundaryRecordings.ts';
import { recordBoundary }      from './RecordBoundary.ts';

async function recordCommandOutputOf(recordingName: string) {
  let standardOutput = '';
  let standardError  = '';
  const exitCode = await recordBoundary(recordingName, {
    writeStandardOutput: (text) => { standardOutput += text; },
    writeStandardError:  (text) => { standardError += text; },
  });
  return { exitCode, standardOutput, standardError };
}

describe('bun run record', () => {
  test('refuses a name that is no recorded boundary and lists the recorded ones', async () => {
    const recordedNames = RECORDED_BOUNDARIES.map(({ recordingName }) => `  ${recordingName}\n`).join('');
    expect(await recordCommandOutputOf('example-unknown-boundary')).toEqual({
      exitCode:       1,
      standardOutput: '',
      standardError:  `"example-unknown-boundary" is no recorded boundary. Name one of:\n${recordedNames}`,
    });
    expect(recordedNames).toContain('  process-run\n');
  });

  test('refuses a boundary authored by hand, which has no recording spec to run', async () => {
    expect(await recordCommandOutputOf('forge-program-done')).toEqual({
      exitCode:       1,
      standardOutput: '',
      standardError:  'forge-program-done is authored by hand: its forge does not serve the contract yet, so it has no recording spec.\n',
    });
  });
});
