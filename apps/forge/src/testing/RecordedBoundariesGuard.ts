/**
 * Preloaded by `bunfig.toml`: starts each case with only the spec's own process in the table of `src/testing/DefaultSpecPlatformPorts.ts`,
 * and fails the case on a call its recordings or the recorded git do not answer, or on a default spec starting a program of
 * `src/testing/RecordedBoundaryPrograms.ts`. Its statements are its own registration, the reason it may do work at load.
 */
import { afterAll, afterEach, beforeEach } from 'bun:test';

import { startCaseWithOnlyTheSpecsOwnProcess, takeUnansweredDefaultPortCalls } from './DefaultSpecPlatformPorts.ts';
import { recordedBoundaryProgramOf, specIsJudgedForRecordedBoundaryPrograms }  from './RecordedBoundaryPrograms.ts';
import { takeUnansweredRecordedGitCalls }                                      from './UnansweredRecordedGitCalls.ts';

/** The run's own leak check reads the repository's git state before the first spec and after the last; that git is the run's, not a spec's. */
const LEAK_CHECK_MODULE = '/src/testing/TestRunLeakCheck.ts';

const spawnBeforeTheGuard     = Bun.spawn;
const spawnSyncBeforeTheGuard = Bun.spawnSync;
const recordedBoundaryProgramStarts: string[] = [];

function startIsTheLeakChecks(): boolean {
  return new Error().stack?.includes(LEAK_CHECK_MODULE) ?? false;
}

function noteARecordedBoundaryProgramStart(spawnArguments: unknown[]): void {
  if (!specIsJudgedForRecordedBoundaryPrograms(Bun.main)) return;
  const started = recordedBoundaryProgramOf(spawnArguments, process.platform);
  if (started === null || startIsTheLeakChecks()) return;
  recordedBoundaryProgramStarts.push(`${Bun.main} started ${started.program}, which a default spec reaches only through ${started.recordedThrough}`);
}

Bun.spawn = ((...spawnArguments: unknown[]) => {
  noteARecordedBoundaryProgramStart(spawnArguments);
  return Reflect.apply(spawnBeforeTheGuard, Bun, spawnArguments) as unknown;
}) as typeof Bun.spawn;
Bun.spawnSync = ((...spawnArguments: unknown[]) => {
  noteARecordedBoundaryProgramStart(spawnArguments);
  return Reflect.apply(spawnSyncBeforeTheGuard, Bun, spawnArguments) as unknown;
}) as typeof Bun.spawnSync;

function failOnAReachOutsideTheRecordings(): void {
  const reaches = [...takeUnansweredDefaultPortCalls(), ...takeUnansweredRecordedGitCalls(), ...recordedBoundaryProgramStarts.splice(0)];
  if (reaches.length > 0) throw new Error(reaches.join('\n'));
}

beforeEach(startCaseWithOnlyTheSpecsOwnProcess);
afterEach(failOnAReachOutsideTheRecordings);
afterAll(failOnAReachOutsideTheRecordings);
