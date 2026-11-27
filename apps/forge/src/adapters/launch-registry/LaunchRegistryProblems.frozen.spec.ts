/** Every reason Talos's launch registry gives today, a line's included, is frozen: a row's stored text reads as its sentence. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import FROZEN_LAUNCH_REGISTRY_PROBLEMS                    from './FrozenLaunchRegistryProblems.json';
import { LaunchRegistryIngestion }                        from './LaunchRegistryIngestion.ts';

/** The rows whose `stored` is `null`, since no stored text builds them. */
const UNSTORABLE_CASE_BUILDERS: Readonly<Record<string, (filePath: string) => void>> = {
  'a directory stands at its path': (filePath) => mkdirSync(filePath),
  'its bytes are not UTF-8':        (filePath) => writeFileSync(filePath, Uint8Array.of(0xff)),
};

let scratchDirectory = '';

const filePath = (): string => join(scratchDirectory, 'launches-1.ndjson');

function systemErrorAt(storedFilePath: string): string {
  try {
    readFileSync(storedFilePath);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '';
  }
}

function reasonAt(): string | null {
  const reading = new LaunchRegistryIngestion(filePath()).read();
  if (reading.verdict === 'readable') return reading.unreadableLines[0]?.reason ?? null;
  return 'reason' in reading ? reading.reason : null;
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('frozen-launch-registry-problems');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test.each(FROZEN_LAUNCH_REGISTRY_PROBLEMS)('$case', (frozenProblem) => {
  const unstorableCaseBuilder = UNSTORABLE_CASE_BUILDERS[frozenProblem.case];
  if (frozenProblem.stored === null) unstorableCaseBuilder?.(filePath());
  else writeFileSync(filePath(), frozenProblem.stored);

  expect(frozenProblem.stored !== null || unstorableCaseBuilder !== undefined).toBe(true);
  expect(reasonAt()).toBe(frozenProblem.sentence.replace('{systemError}', systemErrorAt(filePath())));
});
