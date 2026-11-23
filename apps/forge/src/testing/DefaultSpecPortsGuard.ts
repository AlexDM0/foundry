/**
 * Preloaded by `bunfig.toml`: starts each case with only the spec's own process in the table of `src/testing/DefaultSpecPlatformPorts.ts`,
 * and fails the case on a call its recordings do not answer, or on a default spec starting a program of `src/testing/NativePortPrograms.ts`.
 * Its statements are its own registration, the reason it may do work at load.
 */
import { afterAll, afterEach, beforeEach } from 'bun:test';

import { startCaseWithOnlyTheSpecsOwnProcess, takeUnansweredDefaultPortCalls } from './DefaultSpecPlatformPorts.ts';
import { nativePortProgramOf, specIsJudgedForNativePortPrograms }              from './NativePortPrograms.ts';

const spawnBeforeTheGuard     = Bun.spawn;
const spawnSyncBeforeTheGuard = Bun.spawnSync;
const nativePortProgramStarts: string[] = [];

function noteANativePortProgramStart(spawnArguments: unknown[]): void {
  if (!specIsJudgedForNativePortPrograms(Bun.main)) return;
  const program = nativePortProgramOf(spawnArguments, process.platform);
  if (program === null) return;
  nativePortProgramStarts.push(`${Bun.main} started ${program}, which a default spec reaches only through src/testing/DefaultSpecPlatformPorts.ts`);
}

Bun.spawn = ((...spawnArguments: unknown[]) => {
  noteANativePortProgramStart(spawnArguments);
  return Reflect.apply(spawnBeforeTheGuard, Bun, spawnArguments) as unknown;
}) as typeof Bun.spawn;
Bun.spawnSync = ((...spawnArguments: unknown[]) => {
  noteANativePortProgramStart(spawnArguments);
  return Reflect.apply(spawnSyncBeforeTheGuard, Bun, spawnArguments) as unknown;
}) as typeof Bun.spawnSync;

function failOnAReachOutsideTheRecordings(): void {
  const reaches = [...takeUnansweredDefaultPortCalls(), ...nativePortProgramStarts.splice(0)];
  if (reaches.length > 0) throw new Error(reaches.join('\n'));
}

beforeEach(startCaseWithOnlyTheSpecsOwnProcess);
afterEach(failOnAReachOutsideTheRecordings);
afterAll(failOnAReachOutsideTheRecordings);
