/** Every reason the heartbeat gives today is frozen: a row's stored text reads as its sentence, whatever moves the wording. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import FROZEN_HEARTBEAT_PROBLEMS                          from './FrozenHeartbeatProblems.json';
import { HeartbeatIngestion }                             from './HeartbeatIngestion.ts';
import { HeartbeatProblemWording }                        from './HeartbeatProblemWording.ts';

/** The rows whose `stored` is `null`, since no stored text builds them. */
const UNSTORABLE_CASE_BUILDERS: Readonly<Record<string, (filePath: string) => void>> = {
  'a directory stands at its path': (filePath) => mkdirSync(filePath),
  'its bytes are not UTF-8':        (filePath) => writeFileSync(filePath, Uint8Array.of(0xff)),
};

let scratchDirectory = '';

const filePath = (): string => join(scratchDirectory, 'heartbeat.json');

function systemErrorAt(storedFilePath: string): string {
  try {
    readFileSync(storedFilePath);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '';
  }
}

function sentenceAt(): string | null {
  const reading = new HeartbeatIngestion(filePath()).read();
  return 'problem' in reading ? HeartbeatProblemWording.sentenceOf(reading.problem) : null;
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('frozen-heartbeat-problems');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test.each(FROZEN_HEARTBEAT_PROBLEMS)('$case', (frozenProblem) => {
  const unstorableCaseBuilder = UNSTORABLE_CASE_BUILDERS[frozenProblem.case];
  if (frozenProblem.stored === null) unstorableCaseBuilder?.(filePath());
  else writeFileSync(filePath(), frozenProblem.stored);

  expect(frozenProblem.stored !== null || unstorableCaseBuilder !== undefined).toBe(true);
  expect(sentenceAt()).toBe(frozenProblem.sentence.replace('{systemError}', systemErrorAt(filePath())));
});
