/**
 * The real run of a program planted in a scratch folder, recorded for the default specs: what matters is each way a chosen program can
 * answer, the version printed, a failing exit, a program that outlives the bound and is ended, a path with nothing there and a file that
 * is no program, since forge keeps a choice only on the first.
 */
import { chmodSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { recordAnswer }                                   from '../../testing/RecordedAnswers.ts';
import { PROGRAM_CHECK_RECORDING }                        from '../../testing/RecordedProgramChecks.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { runProgramCheck }                                from './ProgramCheck.ts';

const scratch = createScratchDirectory('program-check');

afterAll(() => removeScratchDirectory(scratch));

const EXECUTABLE_MODE = 0o755;
const PLAIN_FILE_MODE = 0o644;
const BOUND_MILLISECONDS = 500;

function plantedAt(name: string, script: string, mode: number): string {
  const path = join(scratch, name);
  writeFileSync(path, script);
  chmodSync(path, mode);
  return path;
}

const PLANTED_PROGRAMS = {
  [PROGRAM_CHECK_RECORDING.ANSWERS]:       () => plantedAt('answers', '#!/bin/sh\necho "1.2.3 (Example Agent)"\n', EXECUTABLE_MODE),
  [PROGRAM_CHECK_RECORDING.FAILS]:         () => plantedAt('fails', '#!/bin/sh\necho "unknown option" >&2\nexit 3\n', EXECUTABLE_MODE),
  [PROGRAM_CHECK_RECORDING.HANGS]:         () => plantedAt('hangs', '#!/bin/sh\nexec sleep 30\n', EXECUTABLE_MODE),
  [PROGRAM_CHECK_RECORDING.MISSING]:       () => join(scratch, 'missing'),
  [PROGRAM_CHECK_RECORDING.NOT_A_PROGRAM]: () => plantedAt('notes.txt', 'not a program\n', PLAIN_FILE_MODE),
} as const;

for (const [situation, plant] of Object.entries(PLANTED_PROGRAMS)) {
  test(`a program that ${situation} gets the answer recorded for it`, async () => {
    const answer = await runProgramCheck({
      programPath:         plant(),
      arguments:           ['--version'],
      environment:         { PATH: '/usr/bin:/bin' },
      timeoutMilliseconds: BOUND_MILLISECONDS,
    });
    recordAnswer(situation, answer);
    const expectedKind = PROGRAM_CHECK_RECORDING.EXPECTED_KIND_OF[situation as keyof typeof PROGRAM_CHECK_RECORDING.EXPECTED_KIND_OF];
    expect(answer.kind).toBe(expectedKind);
  });
}
