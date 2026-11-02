/**
 * A `claude` that only records. `src/testing/ClaudeLaunchGuard.ts` puts its folders first on the test run's `PATH` and
 * `cli/testing/CliProcess.ts` on every spawned binary's, so any process under the run that executes `claude` reaches this stub, which notes
 * where it ran and exits non-zero, rather than starting a real agent session.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import { createCanonicalScratchDirectory, SHARED_SCRATCH_ROOT } from './ScratchWorkspace.ts';

const TRAPPED_EXIT_CODE   = 97;
const EXECUTABLE_FILE_MODE = 0o755;

const LASTING_TRAP_FOLDER = join(SHARED_SCRATCH_ROOT, 'claude-launch-trap', 'bin');

let trapFolder: string | null = null;
let lastingTrapIsWritten = false;

function attemptsFileOf(folder: string): string {
  return join(folder, 'attempts.log');
}

function stubSourceOf(attemptsFile: string | null): string {
  return [
    '#!/bin/sh',
    ...(attemptsFile === null ? [] : [`printf 'claude executed in %s\\n' "$PWD" >> '${attemptsFile}'`]),
    'echo "claude is trapped under the test run: no spec may start a real agent session (src/testing/ClaudeLaunchTrap.ts)" >&2',
    `exit ${TRAPPED_EXIT_CODE}`,
    '',
  ].join('\n');
}

/** Written beside and renamed into place, so a run starting meanwhile never executes a half-written stub. */
function writeStub(binaryFolder: string, attemptsFile: string | null, writerName: string): void {
  const stubPath        = join(binaryFolder, 'claude');
  const writtenStubPath = join(binaryFolder, `claude-${writerName}`);
  writeFileSync(writtenStubPath, stubSourceOf(attemptsFile));
  chmodSync(writtenStubPath, EXECUTABLE_FILE_MODE);
  renameSync(writtenStubPath, stubPath);
}

/** The recording stub's folder, made once per run in the run's scratch folder, which the end of the run removes. */
export function claudeLaunchTrapFolder(): string {
  if (trapFolder !== null) return trapFolder;
  const folder = createCanonicalScratchDirectory('claude-launch-trap');
  const binaryFolder = join(folder, 'bin');
  mkdirSync(binaryFolder);
  writeStub(binaryFolder, attemptsFileOf(folder), 'run');
  trapFolder = binaryFolder;
  return binaryFolder;
}

/**
 * The run's stub first, then one that records nothing and outlasts every run, so a process outliving the run still finds a stub
 * rather than the real `claude`.
 */
export function claudeLaunchTrapFolders(): readonly string[] {
  const runTrapFolder = claudeLaunchTrapFolder();
  if (!lastingTrapIsWritten) {
    mkdirSync(LASTING_TRAP_FOLDER, { recursive: true });
    writeStub(LASTING_TRAP_FOLDER, null, `${process.pid}`);
    lastingTrapIsWritten = true;
  }
  return [runTrapFolder, LASTING_TRAP_FOLDER];
}

/** Every attempt recorded since the last take, one line each, cleared as it is read. */
export function takeClaudeLaunchAttempts(): string[] {
  if (trapFolder === null) return [];
  const attemptsFile = attemptsFileOf(join(trapFolder, '..'));
  if (!existsSync(attemptsFile)) return [];
  const attempts = readFileSync(attemptsFile, 'utf8').split('\n').filter((line) => line !== '');
  rmSync(attemptsFile, { force: true });
  return attempts;
}
