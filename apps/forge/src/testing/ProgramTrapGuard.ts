/**
 * Preloaded by `bunfig.toml`: puts the program traps (`src/testing/ProgramTraps.ts`) first on this run's `PATH`, and fails the test
 * during which any process under the run executed a trapped program, or the run itself for an attempt landing after the last test. Its
 * statements are its own registration, the reason it may do work at load.
 */
import { delimiter } from 'node:path';

import { afterAll, afterEach } from 'bun:test';

import { environmentCopy, executableSearchPath, prependToExecutableSearchPath } from '../shared/Environment.ts';
import {
  failOnAnyTrappedProgramAttempt,
  programTrapFolders,
  withTheEnvironment,
  withTheSearchPath
} from './ProgramTraps.ts';

for (const trapFolder of [...programTrapFolders()].reverse()) prependToExecutableSearchPath(trapFolder);

const spawnAsBunStarted     = Bun.spawn;
const spawnSyncAsBunStarted = Bun.spawnSync;
const whichAsBunStarted     = Bun.which;

function inTheCurrentEnvironment(spawnArguments: unknown[]): unknown[] {
  return withTheEnvironment(spawnArguments, environmentCopy());
}

function onTheCurrentSearchPath(whichArguments: unknown[]): unknown[] {
  return withTheSearchPath(whichArguments, executableSearchPath().join(delimiter));
}

Bun.spawn     = ((...spawnArguments: unknown[]) => Reflect.apply(spawnAsBunStarted, Bun, inTheCurrentEnvironment(spawnArguments)) as unknown) as typeof Bun.spawn;
Bun.spawnSync = ((...spawnArguments: unknown[]) => Reflect.apply(spawnSyncAsBunStarted, Bun, inTheCurrentEnvironment(spawnArguments)) as unknown) as typeof Bun.spawnSync;
Bun.which     = ((...whichArguments: unknown[]) => Reflect.apply(whichAsBunStarted, Bun, onTheCurrentSearchPath(whichArguments)) as unknown) as typeof Bun.which;

afterEach(failOnAnyTrappedProgramAttempt);
afterAll(failOnAnyTrappedProgramAttempt);
