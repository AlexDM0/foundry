/**
 * The real `<program> version --json` that the Overseer runs at each sweep, recorded for `src/services/overseer/InstallChangeWatch.spec.ts`.
 * What matters: the on-disk program answers both versions as JSON that `versionsFromTheBinary` reads, and a missing program fails to start
 * with `ENOENT`, which the read turns into `null`.
 */
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { versionsFromTheBinary }                                   from '../services/overseer/InstallChangeWatch.ts';
import { VERSION_CHECK_RECORDING }                                 from './RecordedBoundaryCommands.ts';
import { realCommandAnswerOf, recordCommandAnswer }                from './RecordedCommand.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';

const CHECKOUT_ROOT = join(import.meta.dir, '..', '..');
const VERSION_ARGUMENTS = ['version', '--json'];

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createCanonicalScratchDirectory('version-check');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('the on-disk program answers both versions, and a missing program fails to start with ENOENT', () => {
  const placeholders = { [VERSION_CHECK_RECORDING.BUN_PLACEHOLDER]: process.execPath, [VERSION_CHECK_RECORDING.CHECKOUT_PLACEHOLDER]: CHECKOUT_ROOT };
  const programCommand = [process.execPath, join(CHECKOUT_ROOT, 'agent-progress.ts')];
  const answer = realCommandAnswerOf([...programCommand, ...VERSION_ARGUMENTS], { cwd: scratchDirectory });
  expect(answer.kind === 'finished' ? answer.exitCode : answer.code).toBe(0);
  expect(versionsFromTheBinary(programCommand, scratchDirectory)).toEqual(answer.kind === 'finished' ? JSON.parse(answer.stdout) : null);
  recordCommandAnswer({ argv: [...programCommand, ...VERSION_ARGUMENTS] }, placeholders, answer);

  const missingProgram = [join(CHECKOUT_ROOT, 'missing-program')];
  const missingAnswer = realCommandAnswerOf([...missingProgram, ...VERSION_ARGUMENTS], { cwd: scratchDirectory });
  expect(missingAnswer).toEqual({ kind: 'spawn-failed', code: 'ENOENT' });
  expect(versionsFromTheBinary(missingProgram, scratchDirectory)).toBeNull();
  recordCommandAnswer({ argv: [...missingProgram, ...VERSION_ARGUMENTS], situation: VERSION_CHECK_RECORDING.MISSING_SITUATION }, placeholders, missingAnswer);
});
