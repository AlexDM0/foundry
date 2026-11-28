/** Every reason an agent slot gives today is frozen: a row's stored text reads as its sentence, whatever moves the wording. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { AgentSlotIngestion }                             from './AgentSlotIngestion.ts';
import { AgentSlotProblemWording }                        from './AgentSlotProblemWording.ts';
import FROZEN_AGENT_SLOT_PROBLEMS                         from './FrozenAgentSlotProblems.json';

/** The rows whose `stored` is `null`, since no stored text builds them. */
const UNSTORABLE_CASE_BUILDERS: Readonly<Record<string, (filePath: string) => void>> = {
  'a directory stands at its path': (filePath) => mkdirSync(filePath),
  'its bytes are not UTF-8':        (filePath) => writeFileSync(filePath, Uint8Array.of(0xff)),
};

let scratchDirectory = '';

const filePath = (): string => join(scratchDirectory, 'slot-1');

function systemErrorAt(storedFilePath: string): string {
  try {
    readFileSync(storedFilePath);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : '';
  }
}

function sentenceAt(): string | null {
  const reading = new AgentSlotIngestion(filePath()).read();
  return 'problem' in reading ? AgentSlotProblemWording.sentenceOf(reading.problem) : null;
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('frozen-agent-slot-problems');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test.each(FROZEN_AGENT_SLOT_PROBLEMS)('$case', (frozenProblem) => {
  const unstorableCaseBuilder = UNSTORABLE_CASE_BUILDERS[frozenProblem.case];
  if (frozenProblem.stored === null) unstorableCaseBuilder?.(filePath());
  else writeFileSync(filePath(), frozenProblem.stored);

  expect(frozenProblem.stored !== null || unstorableCaseBuilder !== undefined).toBe(true);
  expect(sentenceAt()).toBe(frozenProblem.sentence.replace('{systemError}', systemErrorAt(filePath())));
});
